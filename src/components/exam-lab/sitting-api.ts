// src/components/exam-lab/sitting-api.ts
//
// The browser's side of an Exam Lab sitting (client-safe: no answers). The
// hub asks the server to open a sitting and gets its questions, their signed
// images and the signed sitting token; the runner uses the token for the
// sitting's images, mark schemes, Maxwell, the attempt and the review.
import type { SafeQuestion } from "@/lib/exam-lab/paper-meta";

type DrillSpecView = { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number } | { type: "daily" };
/** What an allocation assigned, returned once its sitting has opened. */
export type AllocContentView =
  | { type: "paper"; code: string }
  | DrillSpecView
  | { type: "custom"; ids: string[] }
  | { type: "drillref"; drillId: string; ref: string; ids: string[]; spec: unknown };

/** `reveals`: a reopened help-allowed assignment's answers frozen by earlier
 *  mark-scheme reveals (qid -> answer), shown locked again. */
export type Sitting = { token: string; questions: SafeQuestion[]; images: Record<string, string>; content?: AllocContentView; reveals?: Record<string, string> };

export type PracticeRequest =
  | { type: "paper"; code: string }
  | { type: "drill"; paperType: "P1" | "P2" | "P4"; topics: string[]; levels: ("LOT" | "HOT")[]; count: number }
  | { type: "daily" }
  | { type: "focus"; topics: string[] };

export type SittingRequest =
  | { allocationId: string }
  | { practice: PracticeRequest; course: "9702" | "5054"; mode: "practice" | "exam" | "test" };

const OPEN_FAILED = "Couldn't open this paper. Check your connection and try again.";

function errorOf(j: unknown, fallback: string): string {
  const e = (j as { error?: unknown } | null)?.error;
  return typeof e === "string" && e ? e : fallback;
}

export async function openSitting(body: SittingRequest): Promise<{ ok: true; sitting: Sitting } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/exam-lab/sitting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const j: unknown = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: errorOf(j, OPEN_FAILED) };
    const s = j as Partial<Sitting> | null;
    if (!s || typeof s.token !== "string" || !Array.isArray(s.questions) || !s.questions.length) return { ok: false, error: OPEN_FAILED };
    const reveals = s.reveals && typeof s.reveals === "object" ? s.reveals : undefined;
    return { ok: true, sitting: { token: s.token, questions: s.questions, images: s.images && typeof s.images === "object" ? s.images : {}, content: s.content, reveals } };
  } catch {
    return { ok: false, error: OPEN_FAILED };
  }
}

/** Signed URLs for the sitting's own question images; `fresh` re-signs (the
 *  one retry of an image that failed to load). null when signing failed. */
export async function signSittingImages(token: string, paths: string[], fresh = false): Promise<Record<string, string> | null> {
  const out: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 80) {
    try {
      const r = await fetch("/api/exam-lab/images", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, paths: paths.slice(i, i + 80), ...(fresh ? { fresh } : {}) }),
        signal: AbortSignal.timeout(20_000),
      });
      const j = (await r.json().catch(() => null)) as { urls?: Record<string, string> } | null;
      if (!r.ok || !j?.urls) return null;
      Object.assign(out, j.urls);
    } catch {
      return null;
    }
  }
  return out;
}

export type ReviewItem = { answer?: string; correct?: boolean | null; ms?: string; held?: true };
/** `pending`: an allocation's questions whose result is withheld while
 *  another of the student's tests or no-help assignments holds them. */
export type Review = { mcq: { got: number; total: number }; items?: Record<string, ReviewItem>; pending?: number };

/** A submitted sitting's results (answers and mark schemes where allowed).
 *  `fresh`: questions whose mark-scheme image failed -- signed again. */
export async function fetchReview(token: string, fresh?: string[]): Promise<{ ok: true; review: Review } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/exam-lab/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fresh?.length ? { token, fresh } : { token }), cache: "no-store" });
    const j: unknown = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: errorOf(j, "Couldn't load your results.") };
    const v = j as Partial<Review> | null;
    if (!v?.mcq) return { ok: false, error: "Couldn't load your results." };
    return { ok: true, review: { mcq: v.mcq, items: v.items, ...(typeof v.pending === "number" && v.pending > 0 ? { pending: v.pending } : {}) } };
  } catch {
    return { ok: false, error: "Couldn't load your results. Check your connection." };
  }
}

/** One question's mark scheme while sitting (help-allowed sittings only).
 *  `answer`: the student's answer now -- the server records it and it is
 *  final from then on (the reply's `answer` is the one on record). `fresh`:
 *  sign again (the retry of an image that failed to load). */
export async function revealMarkScheme(token: string, id: string, answer: string, fresh = false): Promise<{ ok: true; url: string; answer: string } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/exam-lab/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, id, answer, ...(fresh ? { fresh } : {}) }), cache: "no-store" });
    const j: unknown = await r.json().catch(() => null);
    const url = (j as { url?: unknown } | null)?.url;
    const kept = (j as { answer?: unknown } | null)?.answer;
    if (!r.ok || typeof url !== "string") return { ok: false, error: errorOf(j, "Couldn't load the mark scheme.") };
    return { ok: true, url, answer: typeof kept === "string" ? kept : answer };
  } catch {
    return { ok: false, error: "Couldn't load the mark scheme. Check your connection." };
  }
}
