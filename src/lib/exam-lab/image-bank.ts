// AUTO-GENERATED wrapper. Data in image-bank.json (exact CAIE past-paper images
// in the private 'exam-assets' Supabase bucket). PORTAL-ONLY. Regenerate via
// tmp/exam-lab/ingest/extract_all.py + build_image_bank.py.
import rawData from "./image-bank.json";

export type ImgQuestion = {
  id: string; paperType: "P1" | "P2" | "P4"; code: string; qnum: number;
  topic: string | null; level: "LOT" | "HOT"; marks: number | null;
  answer: string | null; img: string; ms_img: string | null; ref: string; duration: number;
};

// Canonical Cambridge 9702 paper facts.
const CANON: Record<string, { marks: number; duration: number; name: string }> = {
  P1: { marks: 40, duration: 75, name: "Paper 1 · Multiple Choice" },
  P2: { marks: 60, duration: 75, name: "Paper 2 · AS Structured" },
  P4: { marks: 100, duration: 120, name: "Paper 4 · A2 Structured" },
};

// 2296 questions across 118 papers.
export const IMAGE_BANK = rawData as ImgQuestion[];

const SESSORD: Record<string, number> = { m: 0, s: 1, w: 2 };
function chrono(code: string): number {
  const m = code.match(/9702_([smw])(\d\d)_(\d\d)/);
  if (!m) return 9e9;
  return parseInt(m[2]) * 1000 + (SESSORD[m[1]] ?? 9) * 100 + parseInt(m[3]);
}
export const IMAGE_PAPERS = Array.from(new Set(IMAGE_BANK.map((q) => q.code)))
  .map((code) => {
    const qs = IMAGE_BANK.filter((q) => q.code === code);
    const pt = qs[0].paperType;
    return { code, paperType: pt, count: qs.length, marks: CANON[pt].marks,
      duration: CANON[pt].duration, ref: qs[0].ref.replace(/ Q.*$/, ""), chrono: chrono(code) };
  })
  .sort((a, b) => a.chrono - b.chrono);

export const PAPER_NAMES = CANON;
