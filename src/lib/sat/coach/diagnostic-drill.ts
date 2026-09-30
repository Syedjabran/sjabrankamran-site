// src/lib/sat/coach/diagnostic-drill.ts
//
// SERVER-ONLY. Starts (or resumes) a student's diagnostic drill -- shared by
// the profile save (first time the student picks "Take a short diagnostic")
// and POST /api/sat/sessions `{ kind: "diagnostic" }`, so both build it the
// same way: questions from pickDiagnostic, never those of the student's
// running sittings, and never a second one while one is still unfinished.
import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { loadQuestionBank } from "../bank.ts";
import { startDiagnostic, type SATDrill } from "../drills.ts";
import { inPlayQuestionIds, listSummaries, saveDoc } from "../store.ts";

const newId = () => randomBytes(12).toString("base64url");
// crypto-backed Rng: which questions a diagnostic holds must not be predictable.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export type DiagnosticStart = { ok: true; id: string } | { ok: false; status: 409 | 503; error: string };

const historyUnavailable: DiagnosticStart = { ok: false, status: 503, error: "Your SAT history couldn't be checked. Please try again." };

/** The id of the student's unfinished diagnostic, or of a new one (tagged
 *  with `planItemId` when the study plan starts it). Reads fail closed: a
 *  failed history read never starts an unfiltered drill. */
export async function ensureDiagnostic(uid: string, now: number, planItemId?: string): Promise<DiagnosticStart> {
  const summaries = await listSummaries(uid);
  if (summaries === null) return historyUnavailable;
  const open = summaries.find((s) => s.kind === "drill" && s.purpose === "diagnostic" && s.finishedAt === null);
  if (open) return { ok: true, id: open.id };
  const exclude = await inPlayQuestionIds(uid, now, summaries);
  if (exclude === null) return historyUnavailable;
  let doc: SATDrill;
  try {
    doc = startDiagnostic(loadQuestionBank(), rng, { id: newId(), uid, now, planItemId }, exclude);
  } catch (e) {
    return { ok: false, status: 409, error: (e as Error).message };
  }
  if (!(await saveDoc(doc))) return { ok: false, status: 503, error: "Your diagnostic couldn't be prepared. Please try again." };
  return { ok: true, id: doc.id };
}
