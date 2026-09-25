/**
 * Portal email module. SERVER-ONLY.
 *
 * Outbound email (to students/parents) uses either the existing Google Apps
 * Script relay or the connected Gmail API account. Gmail uses the same
 * protected GOOGLE_* / portal-data/secrets/google.json connection as Drive;
 * no credentials are copied into mail records or client responses.
 * If the webhook is not configured (or fails), the message is QUEUED (logged
 * with status "queued") so nothing is ever lost — a later run can resend.
 *
 * All mail + templates live in the private `portal-mail` bucket (Storage-as-DB):
 *   log.json            — compact index (newest last, capped)
 *   msg/<id>.json       — full record incl. body (for resend/audit)
 *   templates.json      — reusable templates
 *   flush.lock          — { token, expiresAt } while a flushQueued run is active
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/google/auth";
import { readStorageJson, writeStorageJson } from "@/lib/portal/resources";

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

const LOG = "log.json";
const FLUSH_LOCK = "flush.lock";
const FLUSH_LOCK_TTL_MS = 5 * 60_000;
/** Stop starting new relays before the flush route's 300 s limit. */
const FLUSH_BUDGET_MS = 4 * 60_000;

function admin() {
  return createAdminClient();
}
/** Cache-busted read; only a missing object yields `fallback`, other failures throw. */
function readJson<T>(path: string, fallback: T): Promise<T> {
  return readStorageJson<T>(MAIL_BUCKET, path, fallback);
}
function writeJson(path: string, obj: unknown): Promise<boolean> {
  return writeStorageJson(MAIL_BUCKET, path, obj);
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mailConfigured(): boolean {
  return !!(
    (process.env.EDU_MAIL_WEBHOOK_URL && process.env.EDU_MAIL_WEBHOOK_SECRET) ||
    (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
  );
}

function cleanHeader(value: string) { return value.replace(/[\r\n]+/g, " ").trim(); }
function base64url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Direct Gmail REST transport using the already-protected Google OAuth token. */
async function gmailRelay(rec: MailRecord): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getAccessToken();
    const boundary = `sjak_${rec.id}`;
    const text = rec.text || (rec.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const html = rec.html || `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
    const headers = [
      `From: ${cleanHeader(MAIL_FROM_NAME)} <${MAIL_FROM}>`,
      `To: ${rec.to.map(cleanHeader).join(", ")}`,
      ...(rec.cc?.length ? [`Cc: ${rec.cc.map(cleanHeader).join(", ")}`] : []),
      `Subject: ${cleanHeader(rec.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      `--${boundary}--`,
    ].join("\r\n");
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: base64url(headers) }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string; status?: string } };
    if (!r.ok || !j.id) return { ok: false, error: `gmail_${r.status}:${j.error?.status || j.error?.message || "send_failed"}`.slice(0, 160) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `gmail_exception:${(e as Error).message}`.slice(0, 160) };
  }
}

/** Low-level transport: Apps Script when configured, otherwise Gmail REST. */
async function relay(rec: MailRecord): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.EDU_MAIL_WEBHOOK_URL;
  const secret = process.env.EDU_MAIL_WEBHOOK_SECRET;
  if (!url || !secret) return gmailRelay(rec);
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

// log.json is read-modify-written; chain this instance's updates so parallel
// sends (sendMailBatched) cannot drop each other's entries. Each update
// re-reads the log, so entries written by other runs are kept too.
let indexChain: Promise<unknown> = Promise.resolve();
function updateIndex(mutate: (idx: MailIndexEntry[]) => void): Promise<void> {
  const run = indexChain.then(async () => {
    const idx = await readJson<MailIndexEntry[]>(LOG, []);
    mutate(idx);
    if (!(await writeJson(LOG, idx.slice(-1000)))) throw new Error("mail log write failed");
  });
  indexChain = run.catch(() => {});
  return run;
}

export type SendMailInput = {
  to: string[]; cc?: string[]; subject: string; html?: string; text?: string;
  by: string; byName?: string; kind?: MailRecord["kind"]; meta?: Record<string, unknown>;
};
export type SendMailResult = { id: string; status: MailStatus; error?: string };

/** Send (or queue) a message and log it. */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
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
    rec.status = "queued"; rec.error = "mail_transport_not_configured";
  }
  await writeJson(`msg/${rec.id}.json`, rec);
  const { html: _h, text: _t, ...idx } = rec;
  void _h; void _t;
  // The message already went out (or is persisted as queued), so a log
  // failure must not surface as a send failure that invites a re-send.
  const append = () => updateIndex((log) => { log.push(idx); });
  try {
    await append().catch(append); // one retry for a transient storage error
  } catch (e) {
    console.error("[mail] could not log", rec.id, (e as Error).message);
  }
  // In-portal "You've got mail" for recipients who are portal users (best-effort;
  // dynamic import keeps this module free of a static notifications dependency).
  if (rec.status !== "failed") {
    try {
      const { notifyMailReceived } = await import("@/lib/portal/notifications");
      await notifyMailReceived(to, rec.subject);
    } catch { /* best effort */ }
  }
  return { id: rec.id, status: rec.status, error: rec.error };
}

/**
 * Send several messages, at most `concurrency` in flight at once (results
 * keep input order). `afterBatch` runs after each batch — e.g. to checkpoint
 * progress so a retried request can skip what already went out.
 */
export async function sendMailBatched(
  inputs: SendMailInput[],
  concurrency = 5,
  afterBatch?: (results: SendMailResult[], start: number) => Promise<void>,
): Promise<SendMailResult[]> {
  const out: SendMailResult[] = [];
  for (let i = 0; i < inputs.length; i += concurrency) {
    const results = await Promise.all(inputs.slice(i, i + concurrency).map((m) => sendMail(m)));
    out.push(...results);
    if (afterBatch) await afterBatch(results, i);
  }
  return out;
}

export async function listMail(limit = 200): Promise<MailIndexEntry[]> {
  const idx = await readJson<MailIndexEntry[]>(LOG, []);
  return idx.slice(-limit).reverse();
}

type FlushLock = { token: string; expiresAt: number };

/**
 * Take the flush lock, or null when another flush holds it. Creation uses
 * upsert:false, so it is an atomic create-if-absent; a lock is only taken
 * over once it has expired (its run crashed or timed out).
 */
async function acquireFlushLock(): Promise<string | null> {
  const token = newId();
  const create = async () => {
    const lock: FlushLock = { token, expiresAt: Date.now() + FLUSH_LOCK_TTL_MS };
    const body = new Blob([JSON.stringify(lock)], { type: "application/json" });
    const { error } = await admin().storage.from(MAIL_BUCKET).upload(FLUSH_LOCK, body, { upsert: false, contentType: "application/json", cacheControl: "0" });
    return !error;
  };
  if (await create()) return token;
  let held: FlushLock | null;
  try { held = await readJson<FlushLock | null>(FLUSH_LOCK, null); } catch { return null; }
  if (held && held.expiresAt > Date.now()) return null;
  await admin().storage.from(MAIL_BUCKET).remove([FLUSH_LOCK]);
  return (await create()) ? token : null;
}

async function releaseFlushLock(token: string) {
  try {
    const held = await readJson<FlushLock | null>(FLUSH_LOCK, null);
    if (held?.token === token) await admin().storage.from(MAIL_BUCKET).remove([FLUSH_LOCK]);
  } catch { /* it expires on its own */ }
}

/** Re-attempt every queued message (e.g. after the Gmail relay is connected). */
export async function flushQueued(max = 200): Promise<{ attempted: number; sent: number; stillQueued: number; busy?: boolean }> {
  if (!mailConfigured()) return { attempted: 0, sent: 0, stillQueued: 0 };
  const token = await acquireFlushLock();
  if (!token) return { attempted: 0, sent: 0, stillQueued: 0, busy: true };
  try {
    const idx = await readJson<MailIndexEntry[]>(LOG, []);
    const queuedIds = idx.filter((e) => e.status === "queued").slice(-max).map((e) => e.id);
    const updates = new Map<string, Pick<MailRecord, "status" | "error">>();
    const deadline = Date.now() + FLUSH_BUDGET_MS;
    let attempted = 0, sent = 0, stillQueued = 0;
    for (const id of queuedIds) {
      if (Date.now() > deadline) { stillQueued++; continue; }
      // The message file, not the index, is the source of truth: a send, an
      // earlier flush or one that timed out may already have relayed it.
      let rec: MailRecord | null;
      try { rec = await readJson<MailRecord | null>(`msg/${id}.json`, null); } catch { stillQueued++; continue; }
      if (!rec) continue;
      if (rec.status !== "queued") { updates.set(id, { status: rec.status, error: rec.error }); continue; }
      attempted++;
      const r = await relay(rec);
      if (r.ok) { rec.status = "sent"; delete rec.error; sent++; }
      else { rec.error = r.error; stillQueued++; }
      // Persist per message, immediately, so nothing can relay it twice.
      await writeJson(`msg/${id}.json`, rec);
      updates.set(id, { status: rec.status, error: rec.error });
    }
    // Merge by id into a FRESH log, keeping entries appended during the flush.
    // If this fails the next flush reconciles it from the message files.
    if (updates.size) {
      await updateIndex((log) => {
        for (const e of log) {
          const u = updates.get(e.id);
          if (!u) continue;
          e.status = u.status;
          if (u.error) e.error = u.error; else delete e.error;
        }
      }).catch((e) => console.error("[mail] flush could not update the log:", (e as Error).message));
    }
    return { attempted, sent, stillQueued };
  } finally {
    await releaseFlushLock(token);
  }
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
