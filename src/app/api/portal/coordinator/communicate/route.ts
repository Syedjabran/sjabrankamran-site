import { NextResponse } from "next/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffScope } from "@/lib/portal/staff-school";
import { getRegistry } from "@/lib/portal/institutions";
import { resolveAudience, notify } from "@/lib/portal/notifications";
import { guardianEmails } from "@/lib/portal/onboarding";
import { sendMailBatched } from "@/lib/portal/mail";
import { audit } from "@/lib/portal/admin";
import { readStorageJson, writeStorageJson } from "@/lib/portal/resources";

export const runtime = "nodejs";
export const maxDuration = 60;

const DATA = "portal-data";
const EMAIL_CONCURRENCY = 5;

/**
 * Idempotency record for one client `requestId`
 * (portal-data/coordinator-requests/<uid>/<requestId>.json). It records what
 * already went out, so a retry after a timeout resumes instead of repeating.
 */
type RequestMarker = {
  status: "processing" | "done";
  startedAt: number;
  notified: boolean;
  emailed: string[]; // student uids whose family message was sent or queued
  emails: number;
  queued: number;
  recipients: number;
};

/** Atomic create-if-absent (upsert:false), so two identical submits can't both proceed. */
async function createMarker(path: string, marker: RequestMarker): Promise<boolean> {
  const body = new Blob([JSON.stringify(marker)], { type: "application/json" });
  const { error } = await createAdminClient().storage.from(DATA).upload(path, body, { upsert: false, contentType: "application/json", cacheControl: "0" });
  return !error;
}

/** Coordinator-only school-scoped messages, announcements and show-cause notices. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  const communicator = !!user && (user.roles.includes("coordinator") || user.roles.includes("facilitator"));
  if (!user || (!communicator && !isAdmin(user.roles))) return NextResponse.json({ error: "Class coordinators/facilitators only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { classId?: string; studentUid?: string; title?: string; message?: string; sendEmail?: boolean; notice?: boolean; requestId?: string } | null;
  const title = (b?.title || "").trim().slice(0, 200);
  const message = (b?.message || "").trim().slice(0, 4000);
  if (!title || !message) return NextResponse.json({ error: "A title and message are required." }, { status: 400 });
  const admin = isAdmin(user.roles);
  const scope = admin ? null : await getStaffScope(user.id);
  if (!admin && !scope) return NextResponse.json({ error: "Your account requires both a school and class assignment." }, { status: 403 });
  const registry = await getRegistry();
  const cls = b?.classId ? registry.classes.find((c) => c.id === b.classId) : null;
  if (!b?.classId && !admin) return NextResponse.json({ error: "Choose one of your assigned classes." }, { status: 400 });
  if (b?.classId && (!cls || (!!scope && (cls.school !== scope.school || !scope.classIds.includes(cls.id))))) {
    return NextResponse.json({ error: "That class is outside your assigned scope." }, { status: 403 });
  }
  let uids: string[] = [];
  if (b?.studentUid) {
    const permitted = cls
      ? await resolveAudience({ audience: "class", classId: cls.id })
      : await resolveAudience({ audience: "students" });
    if (!permitted.includes(b.studentUid)) return NextResponse.json({ error: "That student is outside the selected class." }, { status: 403 });
    uids = [b.studentUid];
  } else if (cls) uids = await resolveAudience({ audience: "class", classId: cls.id });
  else return NextResponse.json({ error: "Choose a class or student." }, { status: 400 });
  if (!uids.length) return NextResponse.json({ error: "No active students matched." }, { status: 404 });

  // Optional client idempotency key: a retried request never re-notifies or
  // re-emails anyone the first attempt already reached.
  const requestId = typeof b?.requestId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(b.requestId) ? b.requestId : null;
  const markerPath = requestId ? `coordinator-requests/${user.id}/${requestId}.json` : null;
  let marker: RequestMarker | null = null;
  if (markerPath) {
    let prev: RequestMarker | null;
    try { prev = await readStorageJson<RequestMarker | null>(DATA, markerPath, null); }
    catch { return NextResponse.json({ error: "Could not check whether this message was already sent — try again." }, { status: 503 }); }
    if (prev?.status === "done") return NextResponse.json({ ok: true, duplicate: true, recipients: prev.recipients, emails: prev.emails, queued: prev.queued }, { status: 200 });
    // Still inside the first attempt's lifetime → it may be running right now.
    if (prev && Date.now() - prev.startedAt < maxDuration * 1000) return NextResponse.json({ error: "This message is still being sent." }, { status: 409 });
    marker = { status: "processing", startedAt: Date.now(), notified: prev?.notified ?? false, emailed: prev?.emailed ?? [], emails: prev?.emails ?? 0, queued: prev?.queued ?? 0, recipients: uids.length };
    if (prev) await writeStorageJson(DATA, markerPath, marker);
    else if (!(await createMarker(markerPath, marker))) return NextResponse.json({ error: "This message is already being sent." }, { status: 409 });
  }
  const saveMarker = async () => { if (marker && markerPath) await writeStorageJson(DATA, markerPath, marker); };

  const notice = !!b?.notice;
  const heading = notice ? `Show-cause notice: ${title}` : title;
  if (!marker?.notified) {
    await notify({ uids }, { type: "announcement", title: heading, body: message, href: "/portal/notifications" });
    if (marker) { marker.notified = true; await saveMarker(); }
  }
  // Count only messages the relay accepted; queued ones are reported separately.
  let emails = marker?.emails ?? 0;
  let queued = marker?.queued ?? 0;
  if (b?.sendEmail) {
    const done = new Set(marker?.emailed ?? []);
    const pending = uids.filter((u) => !done.has(u));
    const { data: profiles } = pending.length
      ? await createAdminClient().from("edu_profiles").select("id,email").in("id", pending)
      : { data: [] as { id: string; email: string | null }[] };
    const jobs = (await Promise.all((profiles || []).map(async (p) => ({
      uid: p.id as string,
      to: [p.email, ...(await guardianEmails(p.id as string))].filter((e): e is string => !!e),
    })))).filter((j) => j.to.length);
    const html = `<p>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`;
    const meta = { coordinator: true, notice, school: scope?.school || cls?.school || null, classId: cls?.id || null };
    await sendMailBatched(
      jobs.map((j) => ({ to: j.to, subject: heading, text: message, html, by: user.id, byName: user.fullName || user.email, kind: "announcement" as const, meta })),
      EMAIL_CONCURRENCY,
      async (results, start) => {
        results.forEach((r, k) => {
          const job = jobs[start + k];
          if (r.status === "sent") emails += job.to.length;
          else if (r.status === "queued") queued += job.to.length;
          // Sent or queued, the message now exists — a retry must not repeat it.
          if (r.status !== "failed" && marker) marker.emailed.push(job.uid);
        });
        if (marker) { marker.emails = emails; marker.queued = queued; await saveMarker(); }
      },
    );
  }
  if (marker) { marker.status = "done"; await saveMarker(); }
  await audit(user.id, notice ? "coordinator.show_cause" : "coordinator.communicate", "edu_notifications", null, { school: scope?.school || cls?.school || null, classId: cls?.id || null, studentUid: b?.studentUid || null, recipients: uids.length, emails, queued, requestId });
  return NextResponse.json({ ok: true, recipients: uids.length, emails, queued }, { status: 200 });
}
