// AUTO-GENERATED wrapper for the REAL Cambridge O Level 5054 past-paper bank.
// Question images live in the private 'exam-assets' Supabase bucket under the
// o-level/ prefix (never overlapping the 9702 assets). Regenerate via
// tmp/exam-lab/ingest/ingest_5054.py. PORTAL-ONLY (same access model as 9702).
//
// Mirrors image-bank.ts exactly (same ImgQuestion shape + *_PAPERS grouping) so
// the Exam Lab paper-browser and topic-drill UI render O Level identically to
// A Level, just fed from this bank when the course toggle is "5054".
import rawData from "./image-bank-olevel.json";
import type { ImgQuestion } from "./image-bank";

// Cambridge O Level 5054 paper facts (2023-2025 syllabus).
const CANON_OL: Record<string, { marks: number; duration: number; name: string }> = {
  P1: { marks: 40, duration: 60, name: "Paper 1 · Multiple Choice" },
  P2: { marks: 75, duration: 75, name: "Paper 2 · Theory" },
  P4: { marks: 40, duration: 60, name: "Paper 4 · Alternative to Practical" },
};

export const OLEVEL_IMAGE_BANK = rawData as ImgQuestion[];

// 5054 syllabus topics (2023-2025) — used for topic-drill chips and tagging.
export const OLEVEL_TOPICS = [
  "General physics",
  "Kinematics",
  "Forces & motion",
  "Mass, weight & density",
  "Turning effect & pressure",
  "Energy, work & power",
  "Thermal physics",
  "Waves, light & sound",
  "Electricity & magnetism",
  "Atomic & nuclear physics",
];

export const OLEVEL_PAPER_NAME: Record<string, string> = {
  P1: CANON_OL.P1.name,
  P2: CANON_OL.P2.name,
  P4: CANON_OL.P4.name,
};

const SESSORD: Record<string, number> = { m: 0, s: 1, w: 2 };
function chronoOl(code: string): number {
  // Specimen (sp) sorts before real sessions of the same year.
  const sp = code.match(/5054_sp(\d\d)_/);
  if (sp) return parseInt(sp[1]) * 1000 - 1;
  const m = code.match(/5054_([smw])(\d\d)_/);
  if (!m) return 9e9;
  return parseInt(m[2]) * 1000 + (SESSORD[m[1]] ?? 9) * 100;
}

export const OLEVEL_IMAGE_PAPERS = Array.from(new Set(OLEVEL_IMAGE_BANK.map((q) => q.code)))
  .map((code) => {
    const qs = OLEVEL_IMAGE_BANK.filter((q) => q.code === code);
    const pt = qs[0].paperType;
    return {
      code,
      paperType: pt,
      count: qs.length,
      marks: CANON_OL[pt].marks,
      duration: CANON_OL[pt].duration,
      ref: qs[0].ref.replace(/ Q.*$/, ""),
      chrono: chronoOl(code),
    };
  })
  .sort((a, b) => a.chrono - b.chrono);

export const OLEVEL_PAPER_NAMES = CANON_OL;
