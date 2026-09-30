// The SAT tutor's browser-side requests, shared by the full chat
// (tutor-chat.tsx) and the in-page "Explain my mistake" overlay
// (../explain-button.tsx): one turn (POST /api/sat/tutor), one tapped
// action (POST /api/sat/tutor/action), and what each action tells the
// student about where it goes. Type-only imports, so the Node tests can
// load it (scripts/test-sat-tutor.mjs).
import type { TutorAction, TutorTurnResult } from "@/lib/sat/client-types";

// The server answers a turn within ~45 s (its route runs for at most 60).
export const TURN_TIMEOUT_MS = 58_000;
export const ACTION_TIMEOUT_MS = 30_000;
export const TURN_TIMED_OUT = "The tutor took too long to answer — please try again.";
export const ACTION_TIMED_OUT = "That took too long — please try again.";
const TURN_FAILED = "The tutor couldn't answer. Please try again.";
const ACTION_FAILED = "That couldn't be done. Please try again.";

/** A failed request: the HTTP status (null: no response -- network or
 *  timeout) and the sentence to show. */
export type RequestFailure = { ok: false; status: number | null; error: string };
export type TurnOutcome = { ok: true; turn: TutorTurnResult } | RequestFailure;
export type ActionOutcome = { ok: true; href: string; note: string | null } | RequestFailure;

export type TurnBody = { message: string; explainQuestionId?: string; explainFrom?: string };

/** The POST /api/sat/tutor body: a typed message, or "explain" for one
 *  finished question -- `from` (the drill or sitting it was answered in)
 *  rides only with an explain request. */
export function turnBody(message: string, explainQuestionId?: string, from?: string): TurnBody {
  if (!explainQuestionId) return { message };
  return { message, explainQuestionId, ...(from ? { explainFrom: from } : {}) };
}

export const isTimeout = (e: unknown) => e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
const errorText = (data: Record<string, unknown>, fallback: string) => (typeof data.error === "string" && data.error ? data.error : fallback);

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/** One tutor turn. Never throws: a refusal (423 paused, 429 out of
 *  messages...), a network failure or a timeout comes back as a failure
 *  with the sentence to show. */
export async function requestTurn(body: TurnBody): Promise<TurnOutcome> {
  try {
    const { ok, status, data } = await postJson("/api/sat/tutor", body, TURN_TIMEOUT_MS);
    if (!ok) return { ok: false, status, error: errorText(data, TURN_FAILED) };
    if (typeof data.reply !== "string" || !Array.isArray(data.actions)) return { ok: false, status, error: TURN_FAILED };
    return { ok: true, turn: data as unknown as TutorTurnResult };
  } catch (e) {
    return { ok: false, status: null, error: isTimeout(e) ? TURN_TIMED_OUT : (e as Error).message || TURN_FAILED };
  }
}

/** Runs one action the tutor proposed (the student tapped it). Never throws. */
export async function requestAction(id: string): Promise<ActionOutcome> {
  try {
    const { ok, status, data } = await postJson("/api/sat/tutor/action", { id }, ACTION_TIMEOUT_MS);
    if (!ok) return { ok: false, status, error: errorText(data, ACTION_FAILED) };
    const note = typeof data.note === "string" ? data.note : null;
    if (note === null && typeof data.href !== "string") return { ok: false, status, error: ACTION_FAILED };
    return { ok: true, href: String(data.href), note };
  } catch (e) {
    return { ok: false, status: null, error: isTimeout(e) ? ACTION_TIMED_OUT : (e as Error).message || ACTION_FAILED };
  }
}

const SAT_LAB = "/portal/sat-lab";
const PAGE_NAMES: Record<string, string> = {
  "": "the SAT Lab home",
  progress: "your Progress page",
  settings: "your SAT settings",
  setup: "SAT setup",
  tutor: "the full tutor",
  results: "SAT results",
};

/** Where a SAT Lab href leads, in words ("your Progress page"). */
export function satLabPageName(href: string): string {
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "");
  if (path === SAT_LAB) return PAGE_NAMES[""];
  const first = path.startsWith(`${SAT_LAB}/`) ? path.slice(SAT_LAB.length + 1).split("/")[0] : "";
  return PAGE_NAMES[first] ?? "a SAT Lab page";
}

/** What tapping an action does, said before the tap (the in-page overlay
 *  shows it under each button): whether it leaves the page, and for where. */
export function actionDestination(action: TutorAction): string {
  if (action.type === "create_drill") return `Starts a new ${action.count}-question drill on its own page.`;
  if (action.type === "move_mock") return "Moves this full exam in your plan — you stay on this page.";
  return `Opens ${satLabPageName(action.href)}.`;
}
