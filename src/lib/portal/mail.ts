/**
 * Portal email module. SERVER-ONLY.
 *
 * Outbound email (to students/parents) is sent through a Google Apps Script
 * web-app webhook that relays as physics@sjabrankamran.com (JB deploys it — see
 * the setup guide). Transport is configured by env:
 *   EDU_MAIL_WEBHOOK_URL, EDU_MAIL_WEBHOOK_SECRET
 * If the webhook is not configured (or fails), the message is QUEUED (logged
 * with status "queued") so nothing is ever lost — a later run can resend.
 *
 * All mail + templates live in the private `portal-mail` bucket (Storage-as-DB):
 *   log.json            — compact index (newest last, capped)
 *   msg/<id>.json       — full record incl. body (for resend/audit)
 *   templates.json      — reusable templates
 */
import { createAdminClient } from "@/lib/supabase/admin";

export const MAIL_BUCKET = "portal-mail";
export const MAIL_FROM_NAME = "Syed Jabran Ali Kamran — Physics";
export const MAIL_FROM = "physics@sjabrankamran.com";

export type MailStatus = "sent" | "queued" | "failed";
export type MailRecord = {
  id: string;
  ts: number;
  to: string[];
  cc?: string[];
  subject: string;
  html?: string;
  text?: string;
  status: MailStatus;
  by: string; // uid or "system"
  byName?: string;
  kind: "manual" | "progress" | "announcement";
  error?: string;
  meta?: Record<string, unknown>;
};
export type MailIndexEntry = Omit<MailRecord, "html" | "text">;
export type Template = { id: string; name: string; subject: string; body: string };

function admin() {
  return createAdminClient();
}
async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const { data } = await admin().storage.from(MAIL_BUCKET).download(path);
    if (data) return JSON.parse(await data.text()) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}
async function writeJson(path: string, obj: unknown): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify(obj)], { type: "application/json" });
    const { error } = await admin().storage.from(MAIL_BUCKET).upload(path, body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch {
    return false;
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mailConfigured(): boolean {
  return !!(process.env.EDU_MAIL_WEBHOOK_URL && process.env.EDU_MAIL_WEBHOOK_SECRET);
}

/** Low-level transport: POST to the Apps Script relay. Returns true on 2xx. */
async function relay(rec: MailRecord): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.EDU_MAIL_WEBHOOK_URL;
  const secret = process.env.EDU_MAIL_WEBHOOK_SECRET;
  if (!url || !secret) return { ok: false, error: "webhook_not_configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret, from_name: MAIL_FROM_NAME, to: rec.to, cc: rec.cc || [],
        subject: rec.subject, html: rec.html || "", text: rec.text || "",
      }),
      signal: ctrl.signal,
    });
    const t = await r.text().catch(() => "");
    if (!r.ok) return { ok: false, error: `http_${r.status}:${t.slice(0, 120)}` };
    // Apps Script returns {ok:true} on success.
    try {
      const j = JSON.parse(t);
      if (j && j.ok === false) return { ok: false, error: String(j.error || "relay_error").slice(0, 120) };
    } catch {
      /* non-JSON 200 = accept */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `exception:${(e as Error).message}`.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function appendIndex(entry: MailIndexEntry) {
  const idx = await readJson<MailIndexEntry[]>("log.json", []);
  idx.push(entry);
  await writeJson("log.json", idx.slice(-1000));
}

/** Send (or queue) a message and log it. */
export async function sendMail(input: {
  to: string[]; cc?: string[]; subject: string; html?: string; text?: string;
  by: string; byName?: string; kind?: MailRecord["kind"]; meta?: Record<string, unknown>;
}): Promise<{ id: string; status: MailStatus; error?: string }> {
  const to = Array.from(new Set((input.to || []).map((e) => e.trim()).filter(Boolean)));
  const rec: MailRecord = {
    id: newId(), ts: Date.now(), to, cc: input.cc, subject: input.subject.slice(0, 300),
    html: input.html, text: input.text, status: "queued", by: input.by, byName: input.byName,
    kind: input.kind || "manual", meta: input.meta,
  };
  if (to.length === 0) {
    rec.status = "failed"; rec.error = "no_recipients";
  } else if (mailConfigured()) {
    const r = await relay(rec);
    rec.status = r.ok ? "sent" : "queued";
    if (!r.ok) rec.error = r.error;
  } else {
    rec.status = "queued"; rec.error = "webhook_not_configured";
  }
  await writeJson(`msg/${rec.id}.json`, rec);
  const { html: _h, text: _t, ...idx } = rec;
  void _h; void _t;
  await appendIndex(idx);
  return { id: rec.id, status: rec.status, error: rec.error };
}

export async function listMail(limit = 200): Promise<MailIndexEntry[]> {
  const idx = await readJson<MailIndexEntry[]>("log.json", []);
  return idx.slice(-limit).reverse();
}

/** Re-attempt every queued message (e.g. after the Gmail relay is connected). */
export async function flushQueued(max = 200): Promise<{ attempted: number; sent: number; stillQueued: number }> {
  if (!mailConfigured()) return { attempted: 0, sent: 0, stillQueued: 0 };
  const idx = await readJson<MailIndexEntry[]>("log.json", []);
  const queuedIds = idx.filter((e) => e.status === "queued").slice(-max).map((e) => e.id);
  let sent = 0, stillQueued = 0;
  const byId = new Map(idx.map((e) => [e.id, e]));
  for (const id of queuedIds) {
    const rec = await readJson<MailRecord | null>(`msg/${id}.json`, null);
    if (!rec) continue;
    const r = await relay(rec);
    const entry = byId.get(id);
    if (r.ok) {
      rec.status = "sent"; delete rec.error; sent++;
      if (entry) { entry.status = "sent"; delete entry.error; }
    } else {
      rec.error = r.error; stillQueued++;
      if (entry) entry.error = r.error;
    }
    await writeJson(`msg/${id}.json`, rec);
  }
  if (sent > 0) await writeJson("log.json", idx);
  return { attempted: queuedIds.length, sent, stillQueued };
}

export async function getTemplates(): Promise<Template[]> {
  return readJson<Template[]>("templates.json", DEFAULT_TEMPLATES);
}
export async function saveTemplates(t: Template[]): Promise<boolean> {
  return writeJson("templates.json", t.slice(0, 100));
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "welcome", name: "Welcome / login",
    subject: "Your Physics portal login",
    body: "Dear {{name}},\n\nWelcome to the Physics learning portal. You can now sit real CAIE past papers, drill topics and track your progress.\n\nPortal: https://sjabrankamran.com/portal/login\n\nPlease complete your profile (including a parent email) at first login.\n\nWarm regards,\nSyed Jabran Ali Kamran",
  },
  {
    id: "reminder", name: "Class reminder",
    subject: "Reminder: your Physics class",
    body: "Dear {{name}},\n\nThis is a reminder of your upcoming Physics class. Please be on time and bring your materials.\n\nRegards,\nSyed Jabran Ali Kamran",
  },
];
