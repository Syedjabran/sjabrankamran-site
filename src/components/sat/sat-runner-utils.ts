// src/components/sat/sat-runner-utils.ts
//
// Pure helpers for sat-runner.tsx (request bodies, merges, retry back-off),
// spr-pad.tsx (grid-in warnings and preview) and use-signed-images.ts (what a
// signing response gave) -- no React import, and nothing but the pure
// grade.ts, so these can be unit-tested directly with Node (see
// scripts/test-sat-runner-utils.mjs).
import { SPR_MAX_NEGATIVE, SPR_MAX_POSITIVE, sprNumber, validateSPR } from "../../lib/sat/grade.ts";

/** Restrict an answers map to one module's question ids -- a save/submit
 *  body must carry only the module on screen, never the whole sitting's map. */
export function pickAnswers(answers: Record<string, string>, ids: string[]): Record<string, string> {
  const allowed = new Set(ids);
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(answers)) if (allowed.has(id)) out[id] = v;
  return out;
}

/** Restrict a flagged list to one module's question ids. */
export function pickFlagged(flagged: string[], ids: string[]): string[] {
  const allowed = new Set(ids);
  return flagged.filter((id) => allowed.has(id));
}

/** The subset of a module's ids the local student has actually edited
 *  (answered or flagged) since the last adopted server snapshot -- as
 *  opposed to every id local merely *inherited* by copying the server's own
 *  map during an earlier load/apply. Only THESE ids may have local win a
 *  merge; a module the student has never looked at has touched none of its
 *  ids at all, so the server's own copy for it always survives untouched. */
function winningIds(ids: string[], touched: Iterable<string>): Set<string> {
  const touchedSet = new Set(touched);
  return new Set(ids.filter((id) => touchedSet.has(id)));
}

/** Seed a module's answers from the server's copy, but let any local answer
 *  the student actually TOUCHED for that module's ids win -- never resurrect
 *  a server value the student has since cleared, and never drop a value the
 *  student typed before the switch. An id the student never touched (even
 *  if local happens to carry a value for it, inherited from an earlier
 *  snapshot) always keeps the server's copy. Every id outside `ids` -- i.e.
 *  every other module -- passes through from the server untouched. */
export function mergeAnswers(
  serverAnswers: Record<string, string>, localAnswers: Record<string, string>, ids: string[], touched: Iterable<string>,
): Record<string, string> {
  const winIds = winningIds(ids, touched);
  const out: Record<string, string> = { ...serverAnswers };
  for (const [id, v] of Object.entries(localAnswers)) {
    if (!winIds.has(id)) continue;
    if (v) out[id] = v;
    else delete out[id];
  }
  return out;
}

/** Same merge rule for the flagged set: for the target module's TOUCHED
 *  ids, the local flag state wins outright (the server's flag on those same
 *  ids is dropped); every untouched id in the module -- and every id
 *  outside it -- passes through from the server unchanged. */
export function mergeFlagged(serverFlagged: string[], localFlagged: string[], ids: string[], touched: Iterable<string>): string[] {
  const winIds = winningIds(ids, touched);
  const keepServer = serverFlagged.filter((id) => !winIds.has(id));
  const localForIds = localFlagged.filter((id) => winIds.has(id));
  return [...new Set([...keepServer, ...localForIds])];
}

/** Whether a merged answers map actually differs from the server's own copy
 *  over a module's ids -- used to decide whether a stage-switch merge needs
 *  to be resaved, rather than always assuming it does. */
export function answersChangedFor(serverAnswers: Record<string, string>, merged: Record<string, string>, ids: string[]): boolean {
  return ids.some((id) => (serverAnswers[id] ?? "") !== (merged[id] ?? ""));
}

/** Same comparison for the flagged set. */
export function flaggedChangedFor(serverFlagged: string[], merged: string[], ids: string[]): boolean {
  const allowed = new Set(ids);
  const a = new Set(serverFlagged.filter((id) => allowed.has(id)));
  const b = new Set(merged.filter((id) => allowed.has(id)));
  if (a.size !== b.size) return true;
  for (const id of a) if (!b.has(id)) return true;
  return false;
}

/** Whether a caught fetch error is an `AbortSignal.timeout`/manual-abort --
 *  as opposed to a genuine network failure -- so callers can show a message
 *  the student can act on instead of the raw DOMException text. Checked
 *  structurally on `.name` rather than via `instanceof Error`: a browser's
 *  `DOMException` (what `AbortSignal.timeout()` actually rejects with) is
 *  not an `Error` instance there, even though it has the same `.name`. */
export function isTimeoutError(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

// --- Failed requests: back-off and when to stop ---

/** The autosave debounce after an edit, and the base of the retry back-off. */
export const SAVE_DEBOUNCE_MS = 1500;
/** The longest the back-off ever waits between automatic retries. */
export const RETRY_CAP_MS = 30_000;

/** How long to wait before the next automatic retry after `failures`
 *  consecutive failed requests: min(1.5 s · 2ⁿ, 30 s). n = 0 (nothing has
 *  failed) is the ordinary 1.5 s debounce; the first failure waits 3 s, then
 *  6 s, 12 s, 24 s, and 30 s from the fifth on. */
export function retryDelayMs(failures: number): number {
  const n = Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0;
  return Math.min(SAVE_DEBOUNCE_MS * 2 ** n, RETRY_CAP_MS);
}

/** What a failed request's HTTP status means for retrying it. `null` is a
 *  request that never got a usable answer (network down, timeout, a body
 *  that isn't a session state). "auth" (401) and "gone" (403/404) won't
 *  change by asking again, so nothing retries them automatically; everything
 *  else (5xx, 429, a malformed 409, ...) is retried with back-off. */
export type RequestFailure = "retryable" | "auth" | "gone";
export function classifyFailure(status: number | null): RequestFailure {
  if (status === 401) return "auth";
  if (status === 403 || status === 404) return "gone";
  return "retryable";
}

/** The message shown when a failure stops automatic retries; null when the
 *  failure is retryable. */
export function stopMessage(status: number | null): string | null {
  const kind = classifyFailure(status);
  if (kind === "auth") return "You've been signed out — sign in again in another tab; your answers on this screen are kept.";
  if (kind === "gone") return status === 403 ? "Your access to the SAT Lab has changed." : "This sitting isn't available to you any more.";
  return null;
}

// --- Signed images (use-signed-images.ts) ---

/** Splits a signing response for `requested` into the URLs it gave and the
 *  requested paths it gave none for (the endpoint leaves out a path whose
 *  signedUrl came back null). A body with no `urls` map at all isn't an
 *  answer about any path: null, so the caller treats the request as failed. */
export function splitSignedUrls(requested: string[], body: unknown): { urls: Record<string, string>; missing: string[] } | null {
  const given = body && typeof body === "object" ? (body as { urls?: unknown }).urls : undefined;
  if (!given || typeof given !== "object" || Array.isArray(given)) return null;
  const map = given as Record<string, unknown>;
  const urls: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of requested) {
    const url = Object.prototype.hasOwnProperty.call(map, path) ? map[path] : undefined;
    if (typeof url === "string" && url) urls[path] = url;
    else missing.push(path);
  }
  return { urls, missing };
}

/** A light shape check on a parsed 2xx response body before it's trusted as
 *  a usable session state. A body that parsed as JSON but isn't actually
 *  shaped like one (an empty object from a `.catch(() => ({}))` fallback, a
 *  proxy error page, ...) must be treated as a failed load/save, not
 *  applied -- otherwise `serverNow`/`stage` end up `undefined`, producing a
 *  NaN clock or a render crash on `q.n`. Deliberately NOT a `v is
 *  SessionState` type predicate: this file stays free of any import from
 *  client-types.ts so it keeps running as plain Node-stripped TypeScript. */
export function looksLikeSessionState(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (typeof s.serverNow !== "number" || !Number.isFinite(s.serverNow)) return false;
  if (s.status !== "running" && s.status !== "break" && s.status !== "finished") return false;
  if (typeof s.answers !== "object" || s.answers === null || Array.isArray(s.answers)) return false;
  if (!Array.isArray(s.flagged)) return false;
  if (s.stage !== null) {
    if (!s.stage || typeof s.stage !== "object") return false;
    const stage = s.stage as Record<string, unknown>;
    if (typeof stage.key !== "string" || typeof stage.deadline !== "number" || !Array.isArray(stage.questions)) return false;
  }
  return true;
}

// --- Grid-in box (spr-pad.tsx) ---

const isKept = (c: string) => /[0-9./-]/.test(c);

/** What the grid-in box keeps of an entry: digits, ".", "/" and "-". Everything
 *  else -- whitespace included -- is dropped, as Bluebook's own box does, so a
 *  typed "1 1/2" is graded as 11/2. */
export function stripSPR(raw: string): string {
  return raw.replace(/[^0-9./-]/g, "");
}

/** The box shows only what will be graded, so a space the student types
 *  vanishes from it at once and the NEXT keystroke's raw value never contains
 *  it. This carries what the student actually typed -- whitespace included --
 *  across one edit of the box, so a "1 1/2" typed key by key is still seen.
 *  `typed` is the text before the edit (stripSPR(typed) is what the box
 *  showed), `raw` the box's value after it, `caret` its caret after it (which
 *  places an insertion among repeated digits). An insertion lands after any
 *  whitespace already typed at that spot; a deletion also removes the
 *  invisible whitespace on either side of what it deleted. */
export function nextTypedSPR(typed: string, raw: string, caret: number | null): string {
  const before = stripSPR(typed);
  const kept: number[] = [];
  for (let i = 0; i < typed.length; i++) if (isKept(typed[i])) kept.push(i);
  // The unchanged tail is whatever follows the caret -- when that really is
  // the end of the old box's text; otherwise the longest common suffix.
  let tail = caret === null ? -1 : raw.length - caret;
  if (tail < 0 || tail > before.length || !before.endsWith(raw.slice(raw.length - tail))) {
    tail = 0;
    while (tail < before.length && tail < raw.length && before[before.length - 1 - tail] === raw[raw.length - 1 - tail]) tail += 1;
  }
  let head = 0;
  const headMax = Math.min(before.length, raw.length) - tail;
  while (head < headMax && before[head] === raw[head]) head += 1;
  const inserted = raw.slice(head, raw.length - tail).replace(/[^0-9./\-\s]/g, "");
  const end = before.length - tail; // index (in the box) of the first kept char after the edit
  const gapEnd = end < kept.length ? kept[end] : typed.length;
  if (head === end) return typed.slice(0, gapEnd) + inserted + typed.slice(gapEnd);
  const gapStart = head === 0 ? 0 : kept[head - 1] + 1;
  return typed.slice(0, gapStart) + inserted + typed.slice(gapEnd);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** A decimal the answer box accepts for `x`: exact when it fits, otherwise
 *  truncated to fill every space (the SAT accepts 1.333 for 4/3). */
function boxDecimal(x: number): string | null {
  const exact = String(x);
  if (validateSPR(exact).ok) return exact;
  const max = x < 0 ? SPR_MAX_NEGATIVE : SPR_MAX_POSITIVE;
  const places = max - String(Math.trunc(Math.abs(x))).length - 1 - (x < 0 ? 1 : 0);
  if (places < 1) return null;
  const filled = (Math.trunc(x * 10 ** places) / 10 ** places).toFixed(places);
  return validateSPR(filled).ok ? filled : null;
}

/** Entries the box accepts for the mixed number `w n/d` (negated when
 *  `negative`): the improper fraction in lowest terms, then a decimal. */
function mixedNumberEntries(negative: boolean, w: number, n: number, d: number): string[] {
  if (d === 0) return [];
  const num = w * d + n;
  const g = gcd(num, d) || 1;
  const sign = negative && num > 0 ? "-" : "";
  const fraction = sign + (d / g === 1 ? `${num / g}` : `${num / g}/${d / g}`);
  const out = validateSPR(fraction).ok ? [fraction] : [];
  const decimal = boxDecimal((negative ? -1 : 1) * (w + n / d));
  if (decimal && !out.includes(decimal)) out.push(decimal);
  return out;
}

/** "… is read as <value>." -- the value ends the sentence, so a value that
 *  already ends in "." (the box keeps "11." as typed, graded as 11) takes no
 *  second full stop. */
const readAs = (value: string) => `is read as ${value}${value.endsWith(".") ? "" : "."}`;

/** The warning for typed text with whitespace between two digits -- the box
 *  silently joins them ("1 1/2" becomes 11/2) -- quoting the student's own
 *  digits; null when there is no such sequence. */
export function mixedNumberWarning(typed: string): string | null {
  const text = typed.trim().replace(/\s+/g, " ");
  if (!/\d \d/.test(text)) return null;
  const read = stripSPR(text);
  const mixed = /^(-?)(\d+) (\d+)\/(\d+)$/.exec(text);
  if (!mixed) return `Spaces aren't allowed — “${text}” ${readAs(read)}`;
  const entries = mixedNumberEntries(mixed[1] === "-", Number(mixed[2]), Number(mixed[3]), Number(mixed[4]));
  return `Mixed numbers aren't allowed — “${text}” ${readAs(read)}` + (entries.length ? ` Enter ${entries.join(" or ")}.` : "");
}

/** The entry exactly as it will be graded: a fraction as "n/d" with its
 *  decimal ("11/2 (= 5.5)", "2/3 (≈ 0.6667)"), a decimal as typed; null when
 *  the entry is empty or not a valid answer. */
export function sprAnswerPreview(value: string): string | null {
  if (!value) return null;
  const check = validateSPR(value);
  if (!check.ok) return null;
  if (!check.value.includes("/")) return check.value;
  const n = sprNumber(check.value);
  if (n === null) return check.value;
  const shown = Number(n.toFixed(4));
  return `${check.value} (${Math.abs(shown - n) < 1e-9 ? "=" : "≈"} ${shown})`;
}
