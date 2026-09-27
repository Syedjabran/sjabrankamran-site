// src/lib/sat/image-access.ts
//
// SERVER-ONLY. Which SAT images (sat/...) a student may have signed by
// /api/exam-lab/asset -- only images their SAT work actually references:
//  - an official practice-test image (sat/tests/...) only when their own
//    practice sitting shows it: the running module, or a finished review
//    (image-urls.ts imagePathsOf over serve.ts sessionState). Those paths are
//    predictable, so without this any module -- both Module 2 variants
//    included -- could be previewed before it is sat;
//  - a question-bank question image: any (a student may drill any bank
//    question -- drill-start.ts builds a drill from any filter);
//  - a worked-answer (rationale) image only for a question they have
//    finished -- a checked drill question or a finished sitting's review
//    (analytics-data.ts history, the SAT tutor's "explain" rule);
//  - nothing else under sat/.
import "server-only";
import { studentAnalytics } from "./analytics-data.ts";
import { loadQuestionBank } from "./bank.ts";
import { imagePathsOf } from "./image-urls.ts";
import { sessionState } from "./serve.ts";
import { listSummaries, loadDocs } from "./store.ts";

type BankPath = { kind: "question" | "rationale"; qid: string };
let BANK_PATHS: Map<string, BankPath> | null = null;

function bankPaths(): Map<string, BankPath> {
  if (BANK_PATHS) return BANK_PATHS;
  const m = new Map<string, BankPath>();
  for (const q of loadQuestionBank()) {
    if (q.img) m.set(q.img, { kind: "question", qid: q.id });
    if (q.rationaleImg) m.set(q.rationaleImg, { kind: "rationale", qid: q.id });
  }
  BANK_PATHS = m;
  return m;
}

/** The practice-test image paths `uid` may load now, or null when their
 *  sittings could not be read (the caller refuses rather than guess). */
export async function allowedPracticeTestImages(uid: string, now: number): Promise<Set<string> | null> {
  const summaries = await listSummaries(uid);
  if (summaries === null) return null;
  const ids = summaries.filter((s) => s.kind === "practice").map((s) => s.id);
  const out = new Set<string>();
  if (!ids.length) return out;
  const docs = await loadDocs(uid, ids);
  if (docs === null) return null;
  for (const doc of docs) {
    if (doc.kind === "drill") continue;
    for (const path of imagePathsOf(sessionState(doc, now))) if (path.startsWith("sat/tests/")) out.add(path);
  }
  return out;
}

export type SatImageVerdict = { ok: true } | { ok: false; status: 403 | 503; error: string };

const UNREAD = { ok: false as const, status: 503 as const, error: "Your SAT history couldn't be checked. Please try again." };

/** Whether `uid` may have every one of `paths` (all under sat/) signed. */
export async function satImagesAllowed(uid: string, paths: string[], now: number): Promise<SatImageVerdict> {
  const tests = paths.filter((p) => p.startsWith("sat/tests/"));
  const known = paths.filter((p) => !p.startsWith("sat/tests/")).map((p) => bankPaths().get(p));
  if (known.some((k) => !k)) return { ok: false, status: 403, error: "That image isn't available." };
  const rationales = known.flatMap((k) => (k && k.kind === "rationale" ? [k.qid] : []));
  if (rationales.length) {
    const stats = await studentAnalytics(uid, now).catch(() => null);
    if (!stats) return UNREAD;
    if (rationales.some((qid) => !stats.history.has(qid))) return { ok: false, status: 403, error: "A worked answer opens once you've finished that question." };
  }
  if (tests.length) {
    const allowed = await allowedPracticeTestImages(uid, now).catch(() => null);
    if (allowed === null) return UNREAD;
    if (tests.some((p) => !allowed.has(p))) return { ok: false, status: 403, error: "A practice test's questions open when you reach that module." };
  }
  return { ok: true };
}
