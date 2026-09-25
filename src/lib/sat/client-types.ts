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
