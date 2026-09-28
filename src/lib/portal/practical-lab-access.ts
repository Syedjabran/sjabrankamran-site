/**
 * Practical Lab access rules. Pure and edge-safe (no server imports, no `@/`
 * alias): shared by the middleware's /lab gate, the server-side check behind
 * the portal page and nav (practical-lab.ts), and plain Node tests.
 *
 * The rule: signed in AND (lab staff OR Practical Lab switched on for them).
 * Anything that can't be decided -- a failed roles or grants read -- is
 * "unknown", which every caller treats as no access (fail closed).
 */
import { directGrantsIn, type SubjectId } from "./subjects.ts";
import { isStorageNotFound } from "../exam-lab/storage-not-found.ts";
import { EXAM_LAB_STAFF_ROLES } from "../edu/roles.ts";

export const PRACTICAL_LAB: SubjectId = "practical-lab";
/** The portal page that shows the lab inside the portal chrome. */
export const PRACTICAL_LAB_PAGE = "/portal/practical-lab";
/** The lab's own entry page: public/lab/index.html. */
export const PRACTICAL_LAB_ENTRY = "/lab/index.html";

/** Staff who always have the lab: teacher, coordinator, facilitator, admin
 *  and super admin -- the Exam Lab staff (EXAM_LAB_STAFF_ROLES, from the pure
 *  edu/roles.ts, which the middleware can import). */
export const LAB_STAFF_ROLES: readonly string[] = EXAM_LAB_STAFF_ROLES;

export function isLabStaff(roles: readonly string[]): boolean {
  return roles.some((r) => LAB_STAFF_ROLES.includes(r));
}

/** A student's direct grants as read, or a failed read. */
export type GrantsRead = { ok: true; grants: Partial<Record<SubjectId, unknown>> } | { ok: false };

export type LabDecision = "allow" | "deny" | "unknown";

/** `roles` null = the roles couldn't be read. Staff never need the grants
 *  read; everyone else needs it to have succeeded. */
export function labAccess(roles: readonly string[] | null, grants: GrantsRead): LabDecision {
  if (!roles) return "unknown";
  if (isLabStaff(roles)) return "allow";
  if (!grants.ok) return "unknown";
  return grants.grants[PRACTICAL_LAB] ? "allow" : "deny";
}

/** The middleware's raw Storage read of portal-data/subjects/<uid>.json
 *  (status + body), judged exactly as subject-grants.ts judges its fresh read:
 *  a missing doc (or a `null` one) is no grants; a failed read, a body that
 *  isn't JSON or a doc that isn't an object is unreadable. */
export function grantsReadFrom(status: number, body: string): GrantsRead {
  if (isStorageNotFound(status, body)) return { ok: true, grants: {} };
  if (status < 200 || status > 299) return { ok: false };
  let doc: unknown;
  try {
    doc = JSON.parse(body);
  } catch {
    return { ok: false };
  }
  if (doc == null) return { ok: true, grants: {} };
  if (typeof doc !== "object" || Array.isArray(doc)) return { ok: false };
  return { ok: true, grants: directGrantsIn((doc as Record<string, unknown>).grants) };
}

/** What the lab says to an account with the legacy "archived" status, which
 *  the portal layout blocks as "Access suspended". */
export const LAB_ARCHIVED_MESSAGE = "Your portal access has been paused. Please contact your teacher if you believe this is a mistake.";

/** Whether the middleware's raw read of the caller's edu_profiles row
 *  (`?select=status`) says the account is archived. No row is not archived
 *  (getPortalUser reads a missing status as "active"); a failed read or a body
 *  that isn't a JSON array is null (unknown -- the lab refuses). */
export function archivedFrom(status: number, body: string): boolean | null {
  if (status < 200 || status > 299) return null;
  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  const row: unknown = rows[0];
  return !!row && typeof row === "object" && (row as { status?: unknown }).status === "archived";
}

/** A request under /lab: a page (the full check) or a sub-asset (sign-in
 *  only). `opens` is the file a directory-style page request opens -- "/lab"
 *  and "/lab/lab-room/" open their index.html, because Next serves public/
 *  files only at their exact path -- and null for a request naming its file. */
export type LabRequest = { kind: "page"; opens: string | null } | { kind: "asset" };

// Case-insensitive: a case-insensitive file system (Windows, macOS) serves
// public/lab/index.html for "/Lab/index.html" too. The middleware matcher
// covers every case of "/lab" for the same reason.
const underLab = (path: string) => /^\/lab(?:\/|$)/i.test(path);

/** The sub-asset types the lab's pages load: scripts, styles, the room
 *  settings and student guides (JSON), the question paper (PDF), and images or
 *  fonts should any be added. Nothing teacher-only is served from public/lab
 *  (the teacher guide lives in src/content/lab; test:practical-lab checks). */
const LAB_ASSET = /\.(?:mjs|js|css|json|pdf|png|jpe?g|svg|webp|woff2?)$/i;

/**
 * How the middleware treats a path, or null outside /lab. Only a name ending
 * in a sub-asset type (the lab's .mjs/.css/.json/.pdf files) is a sub-asset;
 * directory-style paths (no extension) are pages that open their index.html,
 * and every other name -- the HTML files, and anything odd such as
 * "index.html." or "index.html;x" that a lenient file system might still serve
 * as HTML -- is a page (the stricter check). The path is percent-decoded
 * first, so an encoded ".html" is judged as ".html"; a path that won't decode
 * is a page too.
 */
export function labRequest(pathname: string): LabRequest | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return underLab(pathname) ? { kind: "page", opens: null } : null;
  }
  if (!underLab(path)) return null;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (!name) return { kind: "page", opens: `${path}index.html` };
  if (!name.includes(".")) return { kind: "page", opens: `${path}/index.html` };
  return LAB_ASSET.test(name) ? { kind: "asset" } : { kind: "page", opens: null };
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

/** The small page /lab answers with when it refuses a page request (shown in
 *  the portal's iframe or on its own). A raw response can't use the portal's
 *  Tailwind tokens, so their values are written out: abyss, space, ice, fog
 *  and cyan (tailwind.config.ts). The message is escaped: an access-lock
 *  message is admin-written text. */
export function labRefusalPage(message: string): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    + "<title>Practical Lab</title><style>"
    + "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;"
    + "background:#0A1024;color:#EEF2FF;font:15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}"
    + "main{max-width:28rem;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(7,11,24,.6);padding:24px;text-align:center}"
    + "h1{margin:0 0 8px;font-size:18px}p{margin:0 0 16px;color:#AEB8D8}a{color:#3DE1F0}"
    + `</style></head><body><main><h1>Practical Lab</h1><p>${escapeHtml(message)}</p>`
    + '<a href="/portal" target="_top">Back to the portal</a></main></body></html>';
}
