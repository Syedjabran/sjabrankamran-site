/**
 * SAT Lab programme content — single source for /sat and /sat/[slug].
 * Facts here are the digital SAT's public format (as College Board
 * publishes it) plus what the site's own SAT Lab provides in the student
 * portal. No outcome, score-improvement or affiliation claims.
 *
 * SAT® is a trademark registered by the College Board, which is not
 * affiliated with, and does not endorse, this website.
 */

export type SatFormatFact = { label: string; detail: string };

export type SatProgramme = {
  slug: string;
  name: string;
  shortName: string;
  summary: string;
  points: string[];
  format: SatFormatFact[];
  domains: string[];
  provision: string[];
  /** How the paper practice tests' own timing for this section compares to the digital SAT's. */
  paperTimingNote: string;
};

export const SAT_PROGRAMMES: SatProgramme[] = [
  {
    slug: "digital-sat",
    name: "The Digital SAT",
    shortName: "Digital SAT",
    summary:
      "How the digital SAT is structured, and how the SAT Lab in the student portal supports timed, section-by-section practice for it.",
    points: [
      "Two sections — Reading and Writing, and Math — each run in two timed modules, with a total score on the College Board's 400–1600 scale.",
      "Module 2 of each section adapts to how a student performs on Module 1 of that section.",
      "The SAT Lab in the student portal offers adaptive mock exams, the 8 official College Board paper practice tests, and topic drills — all built from the official question bank.",
    ],
    format: [
      { label: "Reading and Writing", detail: "54 questions in 64 minutes, split across two 27-question modules." },
      { label: "Math", detail: "44 questions in 70 minutes, split across two 22-question modules." },
      { label: "Scoring", detail: "A 200–800 score per section, combined into a 400–1600 total." },
    ],
    domains: [],
    provision: [
      "Adaptive mock exams that follow the digital SAT's module structure, with scores labelled as an estimate",
      "The 8 official College Board paper practice tests (Tests 4–11) — each kept to that paper's own timing and scored against its own official conversion table",
      "Topic drills drawn from 3,700+ official College Board question-bank questions, filterable by the College Board's own domain, skill and difficulty labels",
    ],
    paperTimingNote:
      "The 8 official College Board paper practice tests keep that paper's own timing — Reading and Writing: 39 + 39 minutes, Math: 43 + 43 minutes — longer than the digital SAT's timing above, and are scored against that paper's own official conversion table.",
  },
  {
    slug: "reading-and-writing",
    name: "Reading and Writing",
    shortName: "Reading and Writing",
    summary:
      "The digital SAT's Reading and Writing section: its module structure and the domains the College Board organises it around.",
    points: [
      "54 questions in 64 minutes, across two 27-question modules — Module 2 adapts to Module 1 performance.",
      "Short, single-question passages spanning four College Board domains: Information and Ideas, Craft and Structure, Expression of Ideas, and Standard English Conventions.",
      "The SAT Lab lets a student sit the full section inside an adaptive mock or an official practice test, or drill a single domain or skill on its own.",
    ],
    format: [
      { label: "Module 1", detail: "27 questions in 32 minutes, mixed difficulty." },
      { label: "Module 2", detail: "27 questions in 32 minutes; the harder or easier form, routed by Module 1 performance." },
    ],
    domains: ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"],
    provision: [
      "The Reading and Writing modules inside every adaptive mock exam and official practice test",
      "Drills filtered to Reading and Writing, down to a single domain, skill or difficulty band",
      "Every drill question carries the College Board's own domain, skill and difficulty labels",
    ],
    paperTimingNote:
      "The Reading and Writing modules on the 8 official College Board paper practice tests run 39 + 39 minutes — longer than the digital SAT's 32 + 32 minutes above — and are scored against that paper's own official conversion table.",
  },
  {
    slug: "math",
    name: "Math",
    shortName: "Math",
    summary:
      "The digital SAT's Math section: its module structure and the domains the College Board organises it around.",
    points: [
      "44 questions in 70 minutes, across two 22-question modules — Module 2 adapts to Module 1 performance.",
      "Multiple-choice and student-produced-response questions spanning four College Board domains: Algebra, Advanced Math, Problem-Solving and Data Analysis, and Geometry and Trigonometry.",
      "The SAT Lab lets a student sit the full section inside an adaptive mock or an official practice test, or drill a single domain or skill on its own.",
    ],
    format: [
      { label: "Module 1", detail: "22 questions in 35 minutes, mixed difficulty." },
      { label: "Module 2", detail: "22 questions in 35 minutes; the harder or easier form, routed by Module 1 performance." },
    ],
    domains: ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"],
    provision: [
      "The Math modules inside every adaptive mock exam and official practice test",
      "Drills filtered to Math, down to a single domain, skill or difficulty band",
      "Every drill question carries the College Board's own domain, skill and difficulty labels",
    ],
    paperTimingNote:
      "The Math modules on the 8 official College Board paper practice tests run 43 + 43 minutes — longer than the digital SAT's 35 + 35 minutes above — and are scored against that paper's own official conversion table.",
  },
];

export function getSatProgramme(slug: string): SatProgramme | undefined {
  return SAT_PROGRAMMES.find((p) => p.slug === slug);
}
