/**
 * Per-question timing — CAIE 9702-aligned. Pure, no side effects.
 *
 * Time is derived from three signals:
 *   • paper   — P1 (MCQ, ~1.5 min/Q), P2 (75 min/60 mk), P4 (120 min/100 mk),
 *               P3/P5 practical & planning (slower per mark).
 *   • marks   — the tariff of the question.
 *   • difficulty (LOT/MOT/HOT) — a multiplier: harder = more thinking time.
 *
 * Used by the Exam Lab runner (per-question guidance) and the admin test
 * author (auto-suggested timer + total test duration).
 */
export type Paper = "P1" | "P2" | "P3" | "P4" | "P5" | "other";
export type Difficulty = "LOT" | "MOT" | "HOT";

// Seconds of exam time per mark, by paper (from official durations ÷ total marks).
const PER_MARK_SECONDS: Record<string, number> = {
  P1: 90, // 40 one-mark MCQs in 60 min ≈ 90 s each
  P2: 75, // 60 marks / 75 min
  P3: 120, // practical
  P4: 72, // 100 marks / 120 min
  P5: 150, // planning & analysis
  other: 75,
};

// Difficulty weighting — HOT questions deserve more thinking time.
const DIFF_MULT: Record<string, number> = { LOT: 0.85, MOT: 1.0, HOT: 1.25 };

export function normalisePaper(p?: string | null): Paper {
  const s = (p || "").toUpperCase();
  if (s === "P1" || s === "P2" || s === "P3" || s === "P4" || s === "P5") return s as Paper;
  return "other";
}
export function normaliseDifficulty(d?: string | null): Difficulty {
  const s = (d || "").toUpperCase();
  if (s === "LOT" || s === "HOT" || s === "MOT") return s as Difficulty;
  return "MOT";
}

/** Recommended seconds for a single question. Always ≥ 30 s, rounded to 5 s. */
export function questionSeconds(opts: {
  paper?: string | null;
  difficulty?: string | null;
  marks?: number | null;
  kind?: string | null;
}): number {
  const paper = normalisePaper(opts.paper);
  const diff = normaliseDifficulty(opts.difficulty);
  const marks = Math.max(Number(opts.marks) || 1, 1);
  const perMark = PER_MARK_SECONDS[paper] ?? PER_MARK_SECONDS.other;
  const raw = perMark * marks * (DIFF_MULT[diff] ?? 1);
  return Math.max(30, Math.round(raw / 5) * 5);
}

export function totalSeconds(
  items: { paper?: string | null; difficulty?: string | null; marks?: number | null; kind?: string | null }[]
): number {
  return items.reduce((s, q) => s + questionSeconds(q), 0);
}

/** "1m 30s" / "45s" / "2m" */
export function formatDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m && r) return `${m}m ${r}s`;
  if (m) return `${m}m`;
  return `${r}s`;
}

/** Whole-minutes rounding for a test duration field (min 1). */
export function minutesFromSeconds(secs: number): number {
  return Math.max(1, Math.round(secs / 60));
}
