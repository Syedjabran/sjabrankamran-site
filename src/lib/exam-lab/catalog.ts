// src/lib/exam-lab/catalog.ts
//
// SERVER-ONLY. What the Exam Lab hub renders from, built from the banks on
// the server and handed to the (client) hub as props: per course, the paper
// list and the drill pool counts. No question, answer or image path is in it,
// so the hub no longer ships the whole bank to every student's browser.
import "server-only";
import { IMAGE_BANK, IMAGE_PAPERS } from "./image-bank";
import { OLEVEL_IMAGE_BANK, OLEVEL_IMAGE_PAPERS } from "./image-bank-olevel";
import { poolCounts, type ExamLabCatalog } from "./paper-meta";

let built: ExamLabCatalog | null = null;

export function examLabCatalog(): ExamLabCatalog {
  if (!built) {
    built = {
      "9702": { papers: IMAGE_PAPERS, pool: poolCounts(IMAGE_BANK), questions: IMAGE_BANK.length },
      "5054": { papers: OLEVEL_IMAGE_PAPERS, pool: poolCounts(OLEVEL_IMAGE_BANK), questions: OLEVEL_IMAGE_BANK.length },
    };
  }
  return built;
}
