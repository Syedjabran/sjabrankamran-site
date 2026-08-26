// AUTO-GENERATED wrapper. Data lives in image-bank.json (exact CAIE past-paper
// images in the private 'exam-assets' Supabase bucket). PORTAL-ONLY.
// Regenerate via tmp/exam-lab/ingest/extract_all.py + build_image_bank.py.
import rawData from "./image-bank.json";

export type ImgQuestion = {
  id: string; paperType: "P1" | "P2" | "P4"; code: string; qnum: number;
  topic: string | null; level: "LOT" | "HOT"; marks: number | null;
  answer: string | null; img: string; ms_img: string | null; ref: string; duration: number;
};

// 2102 questions across 108 papers.
export const IMAGE_BANK = rawData as ImgQuestion[];

export const IMAGE_PAPERS = Array.from(new Set(IMAGE_BANK.map((q) => q.code)))
  .map((code) => {
    const qs = IMAGE_BANK.filter((q) => q.code === code);
    return { code, paperType: qs[0].paperType, count: qs.length,
      marks: qs.reduce((s, q) => s + (q.marks || 0), 0), duration: qs[0].duration, ref: qs[0].ref.replace(/ Q\d+$/, "") };
  });
