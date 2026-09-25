// src/lib/sat/types.ts
//
// The SAT data model. A parallel module to src/lib/exam-lab/, not an
// extension of it: ELQuestion is physics-shaped (paper P1/P2/P4, LOT/HOT,
// Cambridge command words, marks, a marking scheme) and bending it to also
// mean "section/module/domain/skill/E-M-H/SPR" would make every SAT field
// optional noise in a working, revenue-carrying code path (spec 5.1).

export type SATSection = "rw" | "math";
export type SATDifficulty = "E" | "M" | "H";

export type SATDomain =
  | "information-ideas" | "craft-structure"
  | "expression-ideas"  | "standard-english"
  | "algebra" | "advanced-math" | "psda" | "geometry-trig";

/** How an answer was established. Kept on the shipped data so "how many
 *  answers rest on rationale prose alone" stays a one-line query. */
export type SATAnswerSource =
  | "answer-line" | "rationale" | "entry-note" | "rationale-stated" | "best-answer"
  | "rationale-either";

export type SATAnswer =
  | { kind: "mcq"; correct: 0 | 1 | 2 | 3; source?: SATAnswerSource }
  | { kind: "spr"; accepted: string[]; source?: SATAnswerSource };

/** A question-bank item: the pool adaptive mocks and drills are drawn from. */
export type SATQuestion = {
  id: string;            // College Board Question ID — the dedupe key
  section: SATSection;
  domain: SATDomain;
  skill: string;
  difficulty: SATDifficulty;
  answer: SATAnswer;
  rationale: string;
  img: string;           // bucket path, sat/ prefix
  ref: string;
  source: "question-bank";
};

/** A practice-test item. It has no College Board Question ID, so its
 *  identity is its position in the published form. It also carries no
 *  domain/skill/difficulty: College Board does not label the papers, and
 *  inventing labels would breach integrity rule 2. */
export type SATTestQuestion = {
  testNo: number;
  section: SATSection;
  module: 1 | 2;
  qnum: number;
  answer: SATAnswer;
  img: string;
  ref: string;
  source: "practice-test";
};

/** raw section score -> [lower, upper] scaled bound, from an ingested
 *  official conversion table. The only thing that makes a score official. */
export type SATConversionTable = Record<number, [number, number]>;

export type SATPracticeTest = {
  testNo: number;
  questions: SATTestQuestion[];
  conversion: Record<SATSection, SATConversionTable>;
};

/** The six question sets of an adaptive form (spec 7). */
export type SATFormKey =
  | "rw.m1" | "rw.m2.lower" | "rw.m2.upper"
  | "math.m1" | "math.m2.lower" | "math.m2.upper";

export type SATForm = {
  id: string;
  kind: "adaptive";
  sets: Record<SATFormKey, SATQuestion[]>;
};

/** A score, and how much authority it carries. Nothing in the UI may show a
 *  number without also showing which of these it is (spec 10.5). */
export type SATScore =
  | { authority: "official"; lower: number; upper: number; testNo: number }
  | { authority: "estimated"; lower: number; upper: number; basis: string };
