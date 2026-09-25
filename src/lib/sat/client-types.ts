// src/lib/sat/client-types.ts
//
// The JSON the SAT API returns. TYPES ONLY: client components import from here
// and never from serve.ts / bank.ts, which carry the answer key.
import type { SATDifficulty, SATScore, SATSection } from "./types.ts";

export type PublicQuestion = {
  id: string;
  n: number;                    // 1-based position within its module or drill
  img: string;                  // bucket path, sign via /api/exam-lab/asset
  kind: "mcq" | "spr";
  section: SATSection;
  domain: string | null;        // null for practice-test items (College Board does not label them)
  skill: string | null;
  difficulty: SATDifficulty | null;
};

export type ReviewItem = PublicQuestion & {
  response: string | null;
  correct: boolean;
  answer: string;               // "C", or "3/2 or 1.5"
  rationale: string | null;
  rationaleImg: string | null;
};

export type SATReport = {
  kind: "adaptive" | "practice";
  title: string;
  score: SATScore | null;
  scoreNote: string | null;
  sections: Record<SATSection, { correct: number; total: number }>;
  routed: Partial<Record<SATSection, "lower" | "upper">>;
  routingDisclosure: string | null;
  overtime: boolean;
  domains: { domain: string; correct: number; total: number }[];
  review: ReviewItem[];
};

export type SessionState = {
  id: string;
  kind: "adaptive" | "practice";
  title: string;
  serverNow: number;
  status: "running" | "break" | "finished";
  stage: {
    key: "rw.m1" | "rw.m2" | "math.m1" | "math.m2";
    label: string;              // "Reading and Writing · Module 1"
    index: number;              // 0..3
    minutes: number;
    deadline: number;           // ms epoch (server clock)
    questions: PublicQuestion[];
  } | null;
  breakUntil: number | null;
  answers: Record<string, string>;
  flagged: string[];
  report: SATReport | null;
};

export type DrillState = {
  id: string;
  kind: "drill";
  title: string;
  serverNow: number;
  questions: PublicQuestion[];
  checked: Record<string, ReviewItem>;   // only questions already answered
  finished: boolean;
};

export type SessionSummary = {
  id: string;
  kind: "adaptive" | "practice" | "drill";
  title: string;
  createdAt: number;
  finishedAt: number | null;
  score: SATScore | null;
  correct: number;
  total: number;
  assignmentId: string | null;
};

export type AssignmentView = {
  id: string;
  kind: "adaptive" | "practice" | "drill";
  title: string;
  testNo: number | null;
  dueAt: string | null;
  status: "assigned" | "in_progress" | "done";
  sessionId: string | null;
  assignedByName: string;
};

// practiceTestList()'s per-test summary, as GET /api/sat/sessions returns it.
export type PracticeTestInfo = {
  testNo: number;
  questions: number;
  timed: boolean;
  minutes: { rw: [number, number]; math: [number, number] } | null;
};

// Domain ids are plain labels, not answer data, so a runtime const is safe
// in this types-only module. Shared by the drill filter (sat-hub.tsx) and
// the score report's "By domain" breakdown (score-report.tsx) so the copy
// can never drift between the two.
export const DOMAIN_LABEL: Record<string, string> = {
  "information-ideas": "Information and Ideas",
  "craft-structure": "Craft and Structure",
  "expression-ideas": "Expression of Ideas",
  "standard-english": "Standard English Conventions",
  algebra: "Algebra",
  "advanced-math": "Advanced Math",
  psda: "Problem-Solving and Data Analysis",
  "geometry-trig": "Geometry and Trigonometry",
};

// Which section each domain belongs to -- needed to grey out the wrong half
// of the domain dropdown once a section filter is chosen. Shared by the
// drill filter (sat-hub.tsx) and the staff assign panel (sat-assign.tsx) so
// the two drill-filter UIs can never drift apart.
export const DOMAIN_SECTIONS: { value: string; section: "rw" | "math" }[] = [
  { value: "information-ideas", section: "rw" },
  { value: "craft-structure", section: "rw" },
  { value: "expression-ideas", section: "rw" },
  { value: "standard-english", section: "rw" },
  { value: "algebra", section: "math" },
  { value: "advanced-math", section: "math" },
  { value: "psda", section: "math" },
  { value: "geometry-trig", section: "math" },
];

// Server enforces the same 5–30 bound (drills.ts DRILL_MIN/DRILL_MAX); kept
// as plain numbers here rather than imported, since drills.ts pulls in
// bank.ts (the answer key) and must never reach a client bundle. Shared by
// the hub's own drill form and the staff assign panel (both via
// DrillFields) so the bound and the default can't drift between them.
export const DRILL_COUNT_MIN = 5;
export const DRILL_COUNT_MAX = 30;
export const DRILL_COUNT_DEFAULT = 10;

// Same convention as DOMAIN_LABEL above -- plain UI copy, shared by the
// drill filter (DrillFields) and the assign panel's title preview.
export const DIFFICULTY_LABEL: Record<"E" | "M" | "H", string> = { E: "Easy", M: "Medium", H: "Hard" };
