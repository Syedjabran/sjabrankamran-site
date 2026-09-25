import { NextResponse } from "next/server";
import { getPortalUser, canAccessGlobalStaffData } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, sendMailBatched, listMail, type MailStatus } from "@/lib/portal/mail";
import { guardianEmails, EMAIL_RE } from "@/lib/portal/onboarding";
import { readStorageJson, writeStorageJson } from "@/lib/portal/resources";

export const runtime = "nodejs";
// A class broadcast is one message per family, so allow for a few dozen sends.
export const maxDuration = 60;

const DATA = "portal-data";
const MAIL_CONCURRENCY = 5;

type Counts = Record<MailStatus, number>;
/**
 * Idempotency record for one client `requestId` of a class broadcast
 * (portal-data/mail-requests/<uid>/<requestId>.json), as the coordinator
 * route keeps. It records the addresses whose family message already went
 * out, so a retry after a timeout mails only the families still waiting.
 */
type RequestMarker = Counts & {
  status: "processing" | "done";
  startedAt: number;
  emailed: string[]; // lower-cased addresses whose family message was sent or queued
  recipients: number;
};

/** Atomic create-if-absent (upsert:false), so two identical submits can't both proceed. */
async function createMarker(path: string, marker: RequestMarker): Promise<boolean> {
  const body = new Blob([JSON.stringify(marker)], { type: "application/json" });
  const { error } = await createAdminClient().storage.from(DATA).upload(path, body, { upsert: false, contentType: "application/json", cacheControl: "0" });
  return !error;
}

function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${esc.replace(/\n/g, "<br>")}</div>`;
}

// Resolve a class broadcast into one address list PER FAMILY (the student
// and/or their guardians), so no family sees another family's addresses.
async function classFamilies(classId: string, audience: "students" | "parents" | "both"): Promise<string[][]> {
  const supabase = createAdminClient();
  const { data: enr } = await supabase
    .from("edu_enrolments")
    .select("edu_students(profile_id, edu_profiles!edu_students_profile_id_fkey(email))")
    .eq("class_id", classId)
    .eq("status", "active");
  type Row = { edu_students?: { profile_id: string; edu_profiles?: { email?: string } } };
  const rows = (enr || []) as unknown as Row[];
  const seen = new Set<string>();
  const families: string[][] = [];
  for (const r of rows) {
    const uid = r.edu_students?.profile_id;
    if (!uid) continue;
    const family = new Set<string>();
    if (audience === "students" || audience === "both") {
      const e = r.edu_students?.edu_profiles?.email;
      if (e && EMAIL_RE.test(e.trim())) family.add(e.trim());
    }
    if (audience === "parents" || audience === "both") {
      for (const g of await guardianEmails(uid)) family.add(g);
    }
    // An address shared by siblings' families is only mailed once.
    const fresh = [...family].filter((e) => !seen.has(e.toLowerCase()));
    fresh.forEach((e) => seen.add(e.toLowerCase()));
    if (fresh.length) families.push(fresh);
  }
  return families;
}

/** One status for a batch: "sent" only when every message went out. */
function overallStatus(c: Counts): MailStatus {
  if (!c.queued && !c.failed) return "sent";
  return c.queued ? "queued" : "failed";
}
const summary = (c: Counts) => ({ status: overallStatus(c), messages: c.sent + c.queued + c.failed, sent: c.sent, queued: c.queued, failed: c.failed });

export async function GET() {
  const user = await getPortalUser();
  if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Global mail access is not permitted for class-scoped staff." }, { status: 403 });
  return NextResponse.json({ items: await listMail(200) }, { status: 200 });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Global mail access is not permitted for class-scoped staff." }, { status: 403 });

  const b = (await req.json().catch(() => null)) as {
    mode?: "emails" | "class";
    to?: string[]; classId?: string; audience?: "students" | "parents" | "both";
    subject?: string; body?: string; requestId?: string;
  } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const subject = (b.subject || "").trim();
  const body = (b.body || "").trim();
  if (!subject || !body) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });

  const base = { subject, text: body, html: textToHtml(body), by: user.id, byName: user.fullName || user.email, kind: "manual" as const };

  if (b.mode === "class" && b.classId) {
    const families = await classFamilies(b.classId, b.audience || "both");
    if (families.length === 0) return NextResponse.json({ error: "No valid recipients." }, { status: 400 });
    const recipients = families.reduce((n, f) => n + f.length, 0);

    // Optional client idempotency key: a broadcast that timed out part-way is
    // retried with the same key and resumes, so no family is mailed twice.
    const requestId = typeof b.requestId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(b.requestId) ? b.requestId : null;
    const markerPath = requestId ? `mail-requests/${user.id}/${requestId}.json` : null;
    let marker: RequestMarker | null = null;
    if (markerPath) {
      let prev: RequestMarker | null;
      try { prev = await readStorageJson<RequestMarker | null>(DATA, markerPath, null); }
      catch { return NextResponse.json({ error: "Could not check whether this message was already sent — try again." }, { status: 503 }); }
      if (prev?.status === "done") return NextResponse.json({ ok: true, duplicate: true, recipients: prev.recipients, ...summary(prev) }, { status: 200 });
      // Still inside the first attempt's lifetime → it may be running right now.
      if (prev && Date.now() - prev.startedAt < maxDuration * 1000) return NextResponse.json({ error: "This message is still being sent." }, { status: 409 });
      marker = { status: "processing", startedAt: Date.now(), emailed: prev?.emailed ?? [], sent: prev?.sent ?? 0, queued: prev?.queued ?? 0, failed: prev?.failed ?? 0, recipients };
      if (prev) await writeStorageJson(DATA, markerPath, marker);
      else if (!(await createMarker(markerPath, marker))) return NextResponse.json({ error: "This message is already being sent." }, { status: 409 });
    }
    const saveMarker = async () => { if (marker && markerPath) await writeStorageJson(DATA, markerPath, marker); };

    // Addresses, not families, are what a retry skips: sibling de-duplication
    // may group them differently on the second run.
    const done = new Set(marker?.emailed ?? []);
    const pending = families.map((f) => f.filter((e) => !done.has(e.toLowerCase()))).filter((f) => f.length);
    const counts: Counts = { sent: marker?.sent ?? 0, queued: marker?.queued ?? 0, failed: marker?.failed ?? 0 };
    await sendMailBatched(
      pending.map((to) => ({ ...base, to, meta: { classId: b.classId, audience: b.audience } })),
      MAIL_CONCURRENCY,
      async (results, start) => {
        results.forEach((r, k) => {
          counts[r.status] += 1;
          // Sent or queued, the message now exists — a retry must not repeat it.
          if (r.status !== "failed" && marker) marker.emailed.push(...pending[start + k].map((e) => e.toLowerCase()));
        });
        if (marker) { Object.assign(marker, counts); await saveMarker(); }
      },
    );
    if (marker) { marker.status = "done"; await saveMarker(); }
    return NextResponse.json({ ok: true, recipients, ...summary(counts) }, { status: 200 });
  }

  const to = (b.to || []).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e));
  if (to.length === 0) return NextResponse.json({ error: "No valid recipients." }, { status: 400 });
  const res = await sendMail({ ...base, to });
  return NextResponse.json({ ok: true, ...res, recipients: to.length }, { status: 200 });
}
