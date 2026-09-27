// AUTO-GENERATED wrapper. Data in image-bank-olevel.json (exact Cambridge
// O Level 5054 past-paper images in the private 'exam-assets' Supabase bucket,
// under the o-level/ prefix). PORTAL-ONLY. Regenerate via
// scripts/exam-lab/ingest-5054/extract5054.py + build_image_bank_olevel.py.
//
// SERVER-ONLY (answers and mark-scheme paths): see image-bank.ts.
import "server-only";
import rawData from "./image-bank-olevel.json";
import type { ImgQuestion } from "./image-bank";
import { CANON_5054, buildPaperIndex, chrono5054 } from "./paper-meta";

// 1464 questions across 83 papers.
export const OLEVEL_IMAGE_BANK = rawData as ImgQuestion[];

export const OLEVEL_IMAGE_PAPERS = buildPaperIndex(OLEVEL_IMAGE_BANK, CANON_5054, chrono5054);

export const OLEVEL_PAPER_NAMES = CANON_5054;

/** 5054 syllabus topics present in the bank, for the paper a drill targets. */
export function olevelTopics(paperType: "P1" | "P2" | "P4"): string[] {
  const set = new Set<string>();
  for (const q of OLEVEL_IMAGE_BANK) if (q.paperType === paperType && q.topic) set.add(q.topic);
  return Array.from(set).sort();
}
