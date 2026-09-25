// src/lib/sat/client-types.ts
//
// The JSON the SAT API returns, plus plain answer-free constants and pure
// copy helpers shared by client and server. Client components import from
// here and never from serve.ts / bank.ts, which carry the answer key
// (scripts/check-sat-client-imports.mjs enforces that). Nothing here may
// import a runtime value from another src/lib/sat module.
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
  /** A module of this finished sitting was submitted after its time limit
   *  (always false for drills and unfinished sittings). Index entries
   *  written before this field existed read as false (store.ts). */
  overtime: boolean;
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
