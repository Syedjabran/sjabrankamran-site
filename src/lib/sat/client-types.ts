// src/lib/sat/client-types.ts
//
// The JSON the SAT API returns, plus plain answer-free constants and pure
// copy helpers shared by client and server. Client components import from
// here and never from serve.ts / bank.ts, which carry the answer key
// (scripts/check-sat-client-imports.mjs enforces that). Nothing here may
// import a runtime value from another src/lib/sat module.
import type { SATDifficulty, SATScore, SATSection } from "./types.ts";
// Type-only: analytics.ts imports SATAnalytics/MasteryRow from here in turn.
// Both sides are `import type`, so this is erased at compile time and forms
// no runtime cycle (verified by tsc and by the two modules loading in Node).
import type { SittingScore } from "./analytics.ts";
// Type-only too (goals.ts imports this module's types and one pure helper).
import type { WeeklyGoal } from "./coach/goals.ts";

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

/** What a drill is for: a practice drill, the starting-point diagnostic, or
 *  a scheduled daily challenge (SAT Coach). */
export type DrillPurpose = "drill" | "diagnostic" | "challenge";

export type SessionSummary = {
  id: string;
  kind: "adaptive" | "practice" | "drill";
  /** Drills only, and only when the drill carries one (absent = "drill"). */
  purpose?: DrillPurpose;
  title: string;
  createdAt: number;
  finishedAt: number | null;
  score: SATScore | null;
  correct: number;
  total: number;
  /** Drills only: how many questions have been checked so far, finished or
   *  not (progress, not a result -- see summaryOf). Absent on sittings and on
   *  index entries written before SAT Coach analytics. */
  checkedCount?: number;
  assignmentId: string | null;
  /** A module of this finished sitting was submitted after its time limit
   *  (always false for drills and unfinished sittings). Index entries
   *  written before this field existed read as false (store.ts). */
  overtime: boolean;
  /** The study-plan item the doc was started from (SAT Coach), when any.
   *  Absent on index entries written before the study plan existed. */
  planItemId?: string;
  /** Official practice sittings: the test's number. Absent on index entries
   *  written before it was recorded (plan-logic.ts reads their title). */
  testNo?: number;
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

// The digital SAT blueprint the adaptive mock is assembled to (spec 7):
// plain numbers, so the hub's description of the mock is built from the
// same values forms.ts assembles with.
export const BLUEPRINT = {
  rw: { perModule: 27, minutes: 32 },
  math: { perModule: 22, minutes: 35 },
  breakMinutes: 10,
} as const;

/** Spec 10.6: shown verbatim wherever Module 2 routing is surfaced -- the
 *  hub and every adaptive report (sent by the API) and the public /sat
 *  pages. adaptive.ts re-exports it next to the threshold it describes. */
export const ROUTING_DISCLOSURE =
  "College Board does not publish the routing rule or cut score the real " +
  "digital SAT uses. This practice form routes on the number of Module 1 " +
  "questions answered correctly, against a threshold this site chose as an " +
  "approximation. It is not the official algorithm.";

/** Shown where the Math section begins (the break screen and Math modules):
 *  the SAT Lab has no Desmos calculator or reference sheet yet. */
export const MATH_TOOLS_NOTE =
  "The real digital SAT has a built-in Desmos graphing calculator and a reference sheet. " +
  "This practice module doesn't include them yet — use your own approved calculator and reference sheet.";

/** One name for an official practice test, for sittings and assignments alike. */
export function practiceTestTitle(testNo: number): string {
  return `Official Practice Test ${testNo}`;
}

export const SECTION_LABEL: Record<SATSection, string> = { rw: "Reading and Writing", math: "Math" };

// The College Board domains, spelled once: id, section and label. The
// SATDomain type (types.ts), the drill-filter schema (filter-schema.ts), the
// dropdowns and the score report's "By domain" rows all derive from this.
const DOMAINS = {
  "information-ideas": { section: "rw", label: "Information and Ideas" },
  "craft-structure": { section: "rw", label: "Craft and Structure" },
  "expression-ideas": { section: "rw", label: "Expression of Ideas" },
  "standard-english": { section: "rw", label: "Standard English Conventions" },
  algebra: { section: "math", label: "Algebra" },
  "advanced-math": { section: "math", label: "Advanced Math" },
  psda: { section: "math", label: "Problem-Solving and Data Analysis" },
  "geometry-trig": { section: "math", label: "Geometry and Trigonometry" },
} as const satisfies Record<string, { section: SATSection; label: string }>;

export type SATDomainId = keyof typeof DOMAINS;

/** Every domain id, in the order above (R&W first, then Math). */
export const SAT_DOMAIN_IDS = Object.keys(DOMAINS) as SATDomainId[];

export const DOMAIN_LABEL: Record<string, string> = Object.fromEntries(SAT_DOMAIN_IDS.map((id) => [id, DOMAINS[id].label]));

// Which section each domain belongs to -- needed to grey out the wrong half
// of the domain dropdown once a section filter is chosen.
export const DOMAIN_SECTIONS: { value: SATDomainId; section: SATSection }[] = SAT_DOMAIN_IDS.map((id) => ({ value: id, section: DOMAINS[id].section }));

// The drill question-count bound, enforced by the server (the sessions and
// assignments routes' schemas, and startDrill's clamp) and offered by the
// hub's drill form and the staff assign panel (both via DrillFields).
export const DRILL_COUNT_MIN = 5;
export const DRILL_COUNT_MAX = 30;
export const DRILL_COUNT_DEFAULT = 10;

// Per-question timing (spec 7.1): a drill has no module clock the way a
// sitting's stage does (session.ts), so its own cap is a flat 30 minutes per
// question -- enforced server-side (mergeTime, drills.ts) and applied
// client-side too (sat-drill.tsx clamps before sending).
export const DRILL_TIME_CAP_MS = 30 * 60_000;

export const DIFFICULTY_LABEL: Record<SATDifficulty, string> = { E: "Easy", M: "Medium", H: "Hard" };

/** A drill's title ("Math · Algebra · Hard drill"): stored on the drill and
 *  its assignment, and previewed by the staff assign panel. An empty string
 *  counts as "not chosen", the way the client's filter fields hold it. */
export function drillTitle(f: { section?: SATSection | ""; domain?: string; skill?: string; difficulty?: SATDifficulty | "" }): string {
  const parts = [
    f.section ? SECTION_LABEL[f.section] : "Mixed",
    f.skill ?? (f.domain ? DOMAIN_LABEL[f.domain] ?? f.domain : null),
    f.difficulty ? DIFFICULTY_LABEL[f.difficulty] : null,
  ].filter(Boolean);
  return `${parts.join(" · ")} drill`;
}

// --- Analytics (src/lib/sat/analytics.ts) -----------------------------------
//
// Client-safe shapes only: recency-weighted mastery numbers and counts, never
// answer data. A mastery percentage, never a scaled score (spec 10.5 / the
// "no invented scores" rule) -- score ranges live only in `scores` below,
// sourced from real SATScore values.

/** One mastery row, for either a domain or a skill. `domain` is the owning
 *  domain id, set on skill rows and omitted on domain rows (whose own `key`
 *  already is the domain id). */
export type MasteryRow = {
  key: string;
  label: string;
  section: SATSection;
  domain?: string;
  attempts: number;
  correct: number;
  mastery: number;       // 0..1, Beta(2,2)-prior recency-weighted accuracy
  confidence: number;    // effective sample size (sum of recency weights)
  trend: number;         // mastery delta: last 14 days vs the 14 before
  lastAt: number | null;
};

export type SATAnalytics = {
  generatedAt: number;
  // `attempted`: every finished question, blanks included -- the accuracy
  // base (a blank counts as wrong); `answered`: those actually answered
  // (not left blank) -- what "questions answered" shows.
  totals: {
    answered: number;
    attempted: number;
    correct: number;
    last7: { answered: number; attempted: number; correct: number };
    last30: { answered: number; attempted: number; correct: number };
  };
  sections: Record<SATSection, { answered: number; correct: number; accuracy: number | null }>;
  domains: MasteryRow[];
  skills: MasteryRow[];
  difficulty: Record<SATSection, Record<SATDifficulty, { answered: number; correct: number }>>;
  pacing: Record<SATSection, { medianSec: number | null; targetSec: number; samples: number }>;
  pacingFlags: { skill: string; label: string; medianSec: number; accuracy: number }[];
  weakSkills: { key: string; label: string; domain: string; section: SATSection; mastery: number; priority: number }[];
  notEnoughData: { key: string; label: string; attempts: number }[];
  scores: { latestOfficial: SittingScore | null; latestEstimate: SittingScore | null; history: SittingScore[] };
};

// --- Study plan (src/lib/sat/coach/planner.ts) -------------------------------
//
// Plan dates are PKT calendar days "YYYY-MM-DD" (spec 6.1). Shown dates go
// through formatPk (src/lib/portal/pk-time.ts).

export type PlanItem = {
  id: string;                  // stable across regenerations
  date: string;                // "YYYY-MM-DD" PKT
  kind: "diagnostic" | "challenge" | "mock" | "review" | "exam";
  status: "scheduled" | "done" | "late" | "missed";
  mock?: { kind: "adaptive" } | { kind: "practice"; testNo: number };
  size?: number;               // questions, for challenge/review/diagnostic
  sessionId?: string;          // the drill/sitting that fulfils it
  moves?: { from: string; to: string; at: string }[];   // mocks only, at most MAX_MOCK_MOVES
  completedAt?: string;
  replacementFor?: string;     // mocks only: the id of the missed full exam this one re-places
};

/** What a plan item is called wherever it's shown: the card rows, the
 *  reminder, the coach's "next full exam". */
export function planItemTitle(item: Pick<PlanItem, "kind" | "mock">): string {
  if (item.kind === "mock") return item.mock?.kind === "practice" ? practiceTestTitle(item.mock.testNo) : "Adaptive mock exam";
  return { diagnostic: "Diagnostic", challenge: "Daily challenge", review: "Review", exam: "Your SAT" }[item.kind];
}

/** The plan part of GET /api/sat/coach: today's items, the next 14 days,
 *  the countdown, the streak and this week's tallies. */
export type SATPlanView = {
  today: PlanItem[];           // today's items, then up to 3 recent ones still worth a tap (missed, or done late today)
  upcoming: PlanItem[];        // the next 14 days after today
  fullExams: PlanItem[];       // every full exam from today on -- what the move rules check against
  examDate: string | null;     // the booked SAT date (null while "not booked yet")
  horizonEnd: string | null;   // where the plan ends: the SAT date, or the target month's first day
  daysToExam: number | null;   // to horizonEnd
  streak: number;              // plan sessions done on their day, in a row
  week: { scheduled: number; done: number; late: number; missed: number };
};

/** GET /api/sat/coach: everything the SAT Lab home shows but "Coach says"
 *  (CoachInsightsPayload, fetched afterwards so the plan never waits on
 *  the AI), in one call. */
export type CoachPayload = {
  today: string;               // PKT "YYYY-MM-DD" the view was built for
  profile: { examDate: string | null; targetMonth: string | null; targetScore: number };
  plan: SATPlanView | null;    // null when the plan couldn't be loaded (planError says so)
  planError: string | null;
  horizonPassed: boolean;      // the SAT date (or target month) has gone by
  analyticsSummary: {
    sections: SATAnalytics["sections"];
    weakSkills: SATAnalytics["weakSkills"];   // top 3
    latestScore: SittingScore | null;
  } | null;
  goals: WeeklyGoal[];
};

/** GET /api/sat/coach/insights: "Coach says" for the home. */
export type CoachInsightsPayload = { insights: InsightsView };

// --- Coach says (src/lib/sat/coach/insights.ts) ------------------------------
//
// Client-safe: no analytics internals, no student PII beyond what the coach
// itself already renders. `source` tells the UI whether the AI wrote this or
// the deterministic rules fallback did (spec 8.2).

export type InsightsView = {
  headline: string;
  summary: string;
  tips: { title: string; body: string; skill?: string }[];
  source: "ai" | "rules";
  generatedAt: string;
};

// --- Digital SAT Tutor (src/lib/sat/coach/tutor.ts) --------------------------
//
// Client-safe: what the tutor chat shows and sends. Actions are proposals the
// server validated; each runs only when the student taps it
// (POST /api/sat/tutor/action). No answer data -- an explanation's question
// facts stay on the server.

/** The longest message a student can send the tutor (the box, the route and
 *  the prompt all use this one number). */
export const TUTOR_MAX_MESSAGE_CHARS = 1000;
/** What an "Explain" tap says on the student's behalf. */
export const TUTOR_EXPLAIN_MESSAGE = "Explain my mistake on this question.";
/** The tutor's answer while a timed module is running or on its break. */
export const TUTOR_PAUSED_MESSAGE = "I'm paused while your exam is running — submit the module first, then come back.";
/** When today's message count couldn't be read (a passing storage failure):
 *  never "none left" or "back tomorrow". */
export const TUTOR_COUNT_UNAVAILABLE = "Couldn't check your messages — try again in a moment.";

export type TutorDrillFilter ={ section?: SATSection; domain?: SATDomainId; skill?: string; difficulty?: SATDifficulty };

export type TutorAction =
  | { id: string; type: "create_drill"; label: string; filter: TutorDrillFilter; count: number }
  | { id: string; type: "move_mock"; label: string; itemId: string; date: string }
  | { id: string; type: "open"; label: string; href: string };

export type TutorMessageView = { role: "user" | "assistant"; text: string; at: number; actions?: TutorAction[] };

/** GET /api/sat/tutor. `pending`: the ids of the latest reply's actions
 *  that can still be tapped. `lastWrongId`: the newest finished question
 *  the student got wrong, for "Explain my last wrong answer". */
export type TutorPayload = {
  messages: TutorMessageView[];
  pending: string[];
  remaining: number | null;   // null: the count couldn't be read right now (TUTOR_COUNT_UNAVAILABLE)
  limit: number;
  paused: boolean;
  lastWrongId: string | null;
};

/** POST /api/sat/tutor. */
export type TutorTurnResult = { reply: string; actions: TutorAction[]; remaining: number };

/** A recently missed finished question, for the Progress page's "Explain". */
export type TutorMistake = { id: string; label: string; at: number };
