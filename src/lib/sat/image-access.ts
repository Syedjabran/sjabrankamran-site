// src/lib/sat/image-access.ts
//
// SERVER-ONLY. Which official practice-test images (sat/tests/...) a student
// may have signed: exactly those their own sittings already show -- the
// running module's questions, and a finished sitting's review
// (image-urls.ts imagePathsOf over serve.ts sessionState). A practice test's
// image paths are predictable (sat/tests/<n>/<section>-m<k>-q<i>.jpg), so
// without this any module -- both Module 2 variants included -- could be
// previewed before it is sat. Bank question images and the unguessable
// rationale paths keep the signing route's course check only.
import "server-only";
import { imagePathsOf } from "./image-urls.ts";
import { sessionState } from "./serve.ts";
import { listSummaries, loadDocs } from "./store.ts";

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
