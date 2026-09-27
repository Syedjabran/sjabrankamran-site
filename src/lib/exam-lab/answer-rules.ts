// src/lib/exam-lab/answer-rules.ts
//
// Pure rules that decide when an Exam Lab answer, mark scheme or question may
// reach a student (Node-testable: no bank data, no storage, no framework).
// The routes under /api/exam-lab apply them; scripts/test-exam-lab-security.mjs
// pins them down.
//
// The model is SAT's: the browser never holds an answer key. Grading runs on
// the server; a student is shown an answer or a mark scheme only when the
// server can see they may have it now -- a help-allowed item they asked for,
// or their own finished sitting -- and never for a question that is also in
// one of their open tests or no-help assignments ("in play").
import { sha256Hex } from "./seal.ts";

export type AllocModeLike = "assignment_help" | "assignment_nohelp" | "test";

export type AllocContentLike =
  | { type: "paper"; code: string }
  | { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number }
  | { type: "daily" }
  | { type: "custom"; ids: string[] }
  | { type: "drillref"; drillId: string; ref: string; ids: string[]; spec: unknown };

export type AllocLike = {
  id: string;
  mode: AllocModeLike;
  status: string;
  startsAt: string | null;
  dueAt: string | null;
  content: AllocContentLike;
  /** Legacy randomised specs (drill/daily): the ids frozen when the student first opened it. */
  frozenIds?: string[] | null;
  startedAt?: number | null;
  durationMin?: number | null;
  integrity?: "off" | "standard" | "strict";
  /** When it was assigned (a hold never starts before it existed). */
  createdAt?: number;
};

/** Allocation statuses a student may open (the hub's Start / Resume / Re-sit). */
export const LAUNCHABLE_STATUSES: readonly string[] = ["assigned", "in_progress", "unlocked", "cancelled"];

/** An allocation with a start time is closed to students until then. */
export function hasStarted(a: { startsAt: string | null }, now: number): boolean {
  if (!a.startsAt) return true;
  const at = Date.parse(a.startsAt);
  return !Number.isFinite(at) || at <= now;
}

/** The exact question ids an allocation sits, in order: a paper's questions,
 *  a frozen drill's or hand-picked list, or -- for the legacy randomised
 *  specs -- the set frozen at the student's first open (null until then). */
export function allocationQuestionIds(
  a: Pick<AllocLike, "content" | "frozenIds">,
  idsOfPaper: (code: string) => string[],
): string[] | null {
  const c = a.content;
  if (c.type === "paper") return idsOfPaper(c.code);
  if (c.type === "drillref" || c.type === "custom") return [...c.ids];
  return a.frozenIds && a.frozenIds.length ? [...a.frozenIds] : null;
}

/** How long after its due time an unsubmitted test or no-help assignment
 *  still holds its questions back. Past that, a stale study-plan challenge
 *  no longer narrows the student's practice for ever. */
export const IN_PLAY_GRACE_MS = 7 * 24 * 60 * 60_000;

/** How far ahead of its start a scheduled test or no-help assignment counts
 *  as "upcoming". Before that its questions are not held yet -- nothing about
 *  a test weeks away changes what the student sees, so nothing can point at
 *  it -- and practice papers of its type are not paused for weeks on end. */
export const UPCOMING_WINDOW_MS = 14 * 24 * 60 * 60_000;

/** A test or no-help assignment that is open, or starts within 14 days: its
 *  questions stay out of the student's drills and generated sets, and their
 *  answers and mark schemes are never revealed to the student elsewhere
 *  (whole practice papers of a type are paused only for a teacher-set
 *  whole-paper test -- pausedPaperTypes). `now` may be a past moment (a
 *  review judges holds as of its sitting's opening): an allocation assigned
 *  after that moment held nothing then. */
export function isInPlay(a: Pick<AllocLike, "mode" | "status" | "dueAt"> & { startsAt?: string | null; createdAt?: number }, now: number): boolean {
  if (a.mode === "assignment_help" || a.status === "submitted") return false;
  if (typeof a.createdAt === "number" && a.createdAt > now) return false;
  if (a.dueAt) {
    const due = Date.parse(a.dueAt);
    if (Number.isFinite(due) && due + IN_PLAY_GRACE_MS < now) return false;
  }
  if (a.startsAt) {
    const start = Date.parse(a.startsAt);
    if (Number.isFinite(start) && start - now > UPCOMING_WINDOW_MS) return false;
  }
  return true;
}

/** Every question id held by the student's in-play allocations (optionally
 *  leaving one allocation out: a finished sitting's own questions). */
export function inPlayIds(
  allocs: AllocLike[], now: number, idsOfPaper: (code: string) => string[], exceptAllocationId: string | null = null,
): Set<string> {
  const out = new Set<string>();
  for (const a of allocs) {
    if (a.id === exceptAllocationId || !isInPlay(a, now)) continue;
    for (const id of allocationQuestionIds(a, idsOfPaper) ?? []) out.add(id);
  }
  return out;
}

/** A test or no-help assignment a TEACHER set (not an automated study-plan
 *  spec) whose questions cover a whole PAST paper (`meta` answers only for
 *  past-paper questions -- never the staff-written secure bank, which is in
 *  no practice paper): while it is in play, every
 *  whole practice paper of that course + paper type is paused, so the one
 *  refusal a paused paper gets can't point at the test's own paper. Returns
 *  "<course>|<paperType>" keys. Automated items and drill-style work pause
 *  nothing: their questions are only held (left out of drills, answers
 *  withheld). */
export function pausedPaperTypes(
  allocs: AllocLike[], now: number, idsOfPaper: (code: string) => string[],
  meta: (id: string) => { code: string; paperType: string } | undefined, exceptAllocationId: string | null = null,
): Set<string> {
  const out = new Set<string>();
  for (const a of allocs) {
    if (a.id === exceptAllocationId || !isInPlay(a, now)) continue;
    if (a.content.type === "drill" || a.content.type === "daily") continue; // automated study-plan specs
    const ids = new Set(allocationQuestionIds(a, idsOfPaper) ?? []);
    const codes = new Set([...ids].map((id) => meta(id)?.code).filter((c): c is string => !!c));
    for (const code of codes) {
      const paper = idsOfPaper(code);
      if (!paper.length || !paper.every((id) => ids.has(id))) continue;
      const type = meta(paper[0])?.paperType;
      if (type) out.add(`${code.startsWith("5054_") ? "5054" : "9702"}|${type}`);
    }
  }
  return out;
}

/** An allocation as the student's list shows it: no paper code, no question
 *  ids (they reach the browser only when the sitting opens, after its start),
 *  just what kind of work it is and a drill's human reference. */
export function publicAllocation<T extends AllocLike>(a: T): Omit<T, "content" | "frozenIds"> & { content: { type: AllocContentLike["type"]; ref?: string } } {
  const { content, frozenIds: _frozen, ...rest } = a;
  void _frozen;
  const summary: { type: AllocContentLike["type"]; ref?: string } = { type: content.type };
  if (content.type === "drillref" && content.ref) summary.ref = content.ref;
  return { ...rest, content: summary };
}

/** What an exam-assets / SAT image path is, for the signing route. */
export type AssetClass = "mark-scheme" | "secure" | "sat-test" | "sat" | "question";

export function classifyAssetPath(path: string): AssetClass {
  if (/_ms\.[a-z0-9]+$/i.test(path)) return "mark-scheme";
  if (path.startsWith("custom/")) return "secure";
  if (path.startsWith("sat/tests/")) return "sat-test";
  if (path.startsWith("sat/")) return "sat";
  return "question";
}

/** `<code>#<qnum>`: the one key an image-bank question and the text bank's
 *  copy of the same past-paper question share. */
export function questionKey(code: string, qnum: number): string {
  return `${code}#${qnum}`;
}

/** The image-bank key of a text past-paper item (`pp-m19-12-q11`,
 *  `pp-w24-23-3a`), or null for anything else (seed / AI / el_questions). */
export function pastPaperKey(id: string): string | null {
  const m = id.match(/^pp-([msw])(\d\d)-(\d\d)-q?(\d+)/);
  return m ? questionKey(`9702_${m[1]}${m[2]}_${m[3]}`, Number(m[4])) : null;
}

// --- sitting tokens ---------------------------------------------------------

/** Issued when a sitting opens (exam-lab/sittings.ts); every later call of
 *  that sitting carries it. Signed, readable: the browser may know which
 *  questions it sits and whether help is on, but cannot change either. */
export type SittingToken = {
  v: 1;
  sid: string;
  uid: string;
  ids: string[];
  /** The allocation sat, or null for self-serve practice. */
  alloc: string | null;
  /** Mark schemes / Maxwell allowed while sitting. */
  help: boolean;
  /** Proctored: nothing but the score is ever shown. */
  strict: boolean;
  iat: number;
};

export const SITTING_MAX_AGE_MS = 24 * 60 * 60_000;
/** An attempt is still accepted with its sitting's token this long after the
 *  sitting opened: a paper left open overnight, or a retried save, must
 *  never lose its answers. Everything else (images, reveals, Maxwell) keeps
 *  the one-day limit. */
export const SUBMIT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/** The token belongs to `uid`, has the right shape and is younger than
 *  `maxAgeMs` (a day by default). */
export function sittingTokenOk(t: unknown, uid: string, now: number, maxAgeMs: number = SITTING_MAX_AGE_MS): t is SittingToken {
  if (!t || typeof t !== "object") return false;
  const s = t as Partial<SittingToken>;
  return s.v === 1 && s.uid === uid && typeof s.sid === "string" && !!s.sid &&
    Array.isArray(s.ids) && s.ids.length > 0 && s.ids.every((x) => typeof x === "string") &&
    (s.alloc === null || typeof s.alloc === "string") && typeof s.help === "boolean" && typeof s.strict === "boolean" &&
    typeof s.iat === "number" && s.iat <= now + 60_000 && now - s.iat <= maxAgeMs;
}

/** Same questions, any order, no extras and none missing. */
export function sameIdSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((id) => sb.has(id));
}

export type StoredAttemptLike = { ts: number; context?: { allocationId?: string | null; cancelled?: boolean; sittingId?: string } };

/** How many attempts are stored for one allocation -- every one, whatever
 *  its browser reported (a sitting the browser called cancelled is still a
 *  graded submission). */
export function allocationSubmissions(existing: StoredAttemptLike[], allocationId: string): number {
  return existing.filter((a) => a.context?.allocationId === allocationId).length;
}

/**
 * Whether a new attempt must be refused, decided by the server alone: one
 * attempt per opened sitting; an allocation that is marked submitted takes
 * no more; and an allocation takes ONE graded submission, plus one more for
 * each staff unlock the server recorded (`unlocks`, proctor.ts unlockCount).
 * Nothing the browser reports about its sitting (cancelled, integrity,
 * proctored, flags) is consulted: those are stored for staff only, so a
 * sitting reported cancelled can't be used to be graded again and again.
 */
export function sittingAlreadySubmitted(
  existing: StoredAttemptLike[],
  s: { sittingId: string | null; allocationId: string | null; allocSubmitted: boolean; unlocks: number },
): boolean {
  if (s.sittingId && existing.some((a) => a.context?.sittingId === s.sittingId)) return true;
  if (!s.allocationId) return false;
  if (s.allocSubmitted) return true;
  return allocationSubmissions(existing, s.allocationId) >= 1 + Math.max(0, s.unlocks);
}

/** Help (a mark scheme, Maxwell) for one question of a sitting: only in a
 *  help-allowed, unproctored sitting -- practice, or an allocation that is
 *  (still) a help-allowed assignment. `allocLive` is the allocation as stored
 *  now, so a teacher's change of mode wins over what the token says. */
export function helpAllowed(t: Pick<SittingToken, "help" | "strict" | "alloc">, allocLive: { mode: AllocModeLike; status: string } | null): boolean {
  if (!t.help || t.strict) return false;
  if (!t.alloc) return true;
  return !!allocLive && allocLive.mode === "assignment_help";
}

/** After submission: answers and mark schemes for everything but a proctored
 *  sitting (a test shows its score only -- the product's rule). */
export function revealAfterSubmit(strict: boolean, allocMode: AllocModeLike | null): boolean {
  return !strict && allocMode !== "test";
}

// --- Maxwell receipts -------------------------------------------------------

/** What Maxwell awarded for one exact answer in one sitting. Only a valid
 *  receipt makes a structured mark count; the browser's own figure never does. */
export type MarkReceipt = { v: 1; uid: string; sid: string; qid: string; h: string; awarded: number; outOf: number; iat: number };

export function answerHash(answer: string): string {
  return sha256Hex(answer.trim());
}

// --- the answer freeze after a reveal (server-side) ----------------------------

/** A question whose mark scheme was shown in a sitting, and the answer the
 *  student had at that moment (exam-lab/reveals.ts keeps these on the server). */
export type RevealRecord = { text: string; at: number };

/** Where a sitting's reveals are kept: an allocation's under the allocation
 *  (so a reopened assignment, or an attempt saved without its token, still
 *  finds them), a practice sitting's under its own id. */
export function revealScope(t: { sid: string; alloc: string | null }): string {
  return t.alloc ? `a-${t.alloc}` : t.sid;
}

/** The answer that counts for a question: once its scheme was revealed, the
 *  answer as it was then, whatever the browser sends later. */
export function frozenResponse(response: string | null, reveal: RevealRecord | undefined): string | null {
  if (!reveal) return response;
  return reveal.text.trim() ? reveal.text : null;
}

/** Maxwell may mark a revealed question only for the answer frozen at the
 *  reveal (marking an edited answer would score a copy of the scheme). */
export function markAllowedAfterReveal(answer: string, reveal: RevealRecord | undefined): boolean {
  return !reveal || answerHash(answer) === answerHash(reveal.text);
}

export function receiptMatches(r: unknown, want: { uid: string; sid: string; qid: string; response: string | null }): r is MarkReceipt {
  if (!r || typeof r !== "object" || !want.response) return false;
  const m = r as Partial<MarkReceipt>;
  return m.v === 1 && m.uid === want.uid && m.sid === want.sid && m.qid === want.qid &&
    typeof m.h === "string" && m.h === answerHash(want.response) &&
    typeof m.awarded === "number" && Number.isFinite(m.awarded) && typeof m.outOf === "number";
}

// --- the AI helper during a sitting ---------------------------------------------

/** Grace after a sitting's own duration during which an in-progress test or
 *  no-help assignment still counts as running (a resumed, late sitting). */
export const SITTING_RUNNING_GRACE_MS = 30 * 60_000;
const DEFAULT_SITTING_MIN = 180;

/** A test or no-help assignment the student began recently enough to still
 *  be sitting it: the site-wide helper stays off meanwhile. */
export function examLabSittingRunning(allocs: Pick<AllocLike, "mode" | "status" | "startedAt" | "durationMin">[], now: number): boolean {
  return allocs.some((a) => {
    if (a.mode === "assignment_help" || a.status !== "in_progress" || !a.startedAt) return false;
    const minutes = a.durationMin && a.durationMin > 0 ? a.durationMin : DEFAULT_SITTING_MIN;
    return now >= a.startedAt && now - a.startedAt <= minutes * 60_000 + SITTING_RUNNING_GRACE_MS;
  });
}

// --- rate limit ---------------------------------------------------------------

/** Sliding-window counter (per warm instance): records this hit and says
 *  whether it is within `max` per `windowMs`. */
export function takeHit(hits: Map<string, number[]>, key: string, now: number, windowMs: number, max: number): boolean {
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return recent.length <= max;
}
