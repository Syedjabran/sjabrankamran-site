// src/lib/exam-lab/practice-set.ts
//
// Pure rules for the generated practice sets (/api/exam-lab/generate and
// /submit; Node-testable). A generated set's questions go to the browser
// WITHOUT their answers or mark schemes; those travel sealed (seal.ts
// sealJson, unreadable in the browser) and come back only when the set is
// submitted -- so /submit marks only a set the server issued, whole, for
// the same student, and cannot be used to test one guessed answer at a time.
import { pastPaperKey } from "./answer-rules.ts";

type Keyed = { id: string; type: "mcq" | "structured"; ans?: number; scheme: string[] };

export type SetItem = { id: string; type: "mcq" | "structured"; ans?: number; scheme: string[] };

export type PracticeSetPayload = {
  v: 1;
  mode: "public" | "portal";
  /** The portal student it was issued to; null for the public site. */
  uid: string | null;
  iat: number;
  items: SetItem[];
};

/** How long a generated set can be submitted after it was issued. */
export const PRACTICE_SET_MAX_AGE_MS = 12 * 60 * 60_000;

export function sealableSet(mode: "public" | "portal", uid: string | null, questions: Keyed[], now: number): PracticeSetPayload {
  return {
    v: 1, mode, uid, iat: now,
    items: questions.map((q) => ({ id: q.id, type: q.type, ...(typeof q.ans === "number" ? { ans: q.ans } : {}), scheme: q.scheme ?? [] })),
  };
}

/** A question as the browser receives it: everything but the answer and the scheme. */
export function withoutKeys<T extends { ans?: number; scheme?: string[] }>(q: T): Omit<T, "ans" | "scheme"> {
  const { ans: _a, scheme: _s, ...rest } = q;
  void _a; void _s;
  return rest;
}

/** The set was sealed by us for this mode (and this portal student), recently. */
export function practiceSetOk(p: unknown, want: { mode: "public" | "portal"; uid: string | null; now: number }): p is PracticeSetPayload {
  if (!p || typeof p !== "object") return false;
  const s = p as Partial<PracticeSetPayload>;
  return s.v === 1 && s.mode === want.mode && (s.uid ?? null) === want.uid && Array.isArray(s.items) && s.items.length > 0 &&
    typeof s.iat === "number" && s.iat <= want.now + 60_000 && want.now - s.iat <= PRACTICE_SET_MAX_AGE_MS;
}

/** Marks a whole submitted set (1 mark per MCQ) and returns its answers and schemes. */
export function markSet(p: PracticeSetPayload, answers: Record<string, number>): {
  mcqScore: number; mcqTotal: number; items: Record<string, { ans?: number; scheme: string[] }>;
} {
  let mcqScore = 0;
  let mcqTotal = 0;
  const items: Record<string, { ans?: number; scheme: string[] }> = {};
  for (const it of p.items) {
    if (it.type === "mcq" && typeof it.ans === "number") {
      mcqTotal += 1;
      if (answers[it.id] === it.ans) mcqScore += 1;
    }
    items[it.id] = { ...(typeof it.ans === "number" ? { ans: it.ans } : {}), scheme: it.scheme };
  }
  return { mcqScore, mcqTotal, items };
}

/** Text past-paper items whose image-bank twin is held back for the student
 *  (answer-rules.ts inPlayIds) are left out of a portal set. */
export function withoutHeld<T extends { id: string }>(qs: T[], heldKeys: ReadonlySet<string>): T[] {
  if (!heldKeys.size) return qs;
  return qs.filter((q) => {
    const k = pastPaperKey(q.id);
    return !k || !heldKeys.has(k);
  });
}
