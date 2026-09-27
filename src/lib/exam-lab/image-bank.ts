// AUTO-GENERATED wrapper. Data in image-bank.json (exact CAIE past-paper images
// in the private 'exam-assets' Supabase bucket). PORTAL-ONLY. Regenerate via
// tmp/exam-lab/ingest/extract_all.py + build_image_bank.py.
//
// SERVER-ONLY: every entry carries its MCQ answer and mark-scheme path, and
// the secure bank's are the staff-written class tests. A browser receives
// questions only through /api/exam-lab/sitting (SafeQuestion, paper-meta.ts);
// scripts/check-exam-lab-client-imports.mjs fails if any "use client" module
// can reach this file.
import "server-only";
import rawData from "./image-bank.json";
import { CANON_9702, buildPaperIndex, chrono9702 } from "./paper-meta";

export type ImgQuestion = {
  id: string; paperType: "P1" | "P2" | "P4"; code: string; qnum: number;
  topic: string | null; level: "LOT" | "HOT"; marks: number | null;
  answer: string | null; img: string; ms_img: string | null; ref: string; duration: number;
};

// 2529 questions across 130 papers.
export const IMAGE_BANK = rawData as ImgQuestion[];

// SECURE BANK: staff-authored test questions that must NEVER surface in public
// practice/drill pools. Resolvable only through an explicit allocation id.
import secureData from "./secure-bank.json";
export const SECURE_BANK = secureData as ImgQuestion[];
export const FULL_BANK: ImgQuestion[] = [...IMAGE_BANK, ...SECURE_BANK];

export const IMAGE_PAPERS = buildPaperIndex(IMAGE_BANK, CANON_9702, chrono9702);

export const PAPER_NAMES = CANON_9702;
