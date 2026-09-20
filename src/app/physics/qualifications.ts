/**
 * Qualification hub content — single source for /physics and /physics/[slug].
 * Facts here restate what the site already publishes (teaching experience,
 * qualifications taught) plus public awarding-body syllabus structure.
 * No outcome, ranking or affiliation claims. Cambridge and IB names are
 * used to identify the qualifications taught; this site is independent of
 * and not endorsed by Cambridge International Education or the IB.
 */

export type Qualification = {
  slug: string;
  code: string | null;
  name: string;
  shortName: string;
  summary: string;
  audience: string;
  papers: { name: string; focus: string }[];
  topics: string[];
  provision: string[];
};

export const QUALIFICATIONS: Qualification[] = [
  {
    slug: "cambridge-a-level-9702",
    code: "9702",
    name: "Cambridge International AS & A Level Physics (9702)",
    shortName: "A Level Physics 9702",
    summary:
      "A two-year Cambridge International qualification building rigorous problem-solving across mechanics, fields, electricity, waves and modern physics — assessed through structured theory papers, multiple choice and practical skills.",
    audience:
      "Students in Year 12–13 (AS in year one, full A Level over two years) preparing for Cambridge International examinations.",
    papers: [
      { name: "Paper 1 · Multiple Choice", focus: "AS content; speed and precision across the full AS syllabus." },
      { name: "Paper 2 · AS Structured", focus: "Structured theory questions on AS topics." },
      { name: "Paper 3 · Advanced Practical Skills", focus: "Hands-on experiment, measurement and uncertainty." },
      { name: "Paper 4 · A Level Structured", focus: "Structured theory on the full A Level syllabus." },
      { name: "Paper 5 · Planning, Analysis & Evaluation", focus: "Design of experiments and data analysis." },
    ],
    topics: [
      "Physical quantities & units", "Kinematics", "Dynamics", "Forces, density & pressure",
      "Work, energy & power", "Deformation of solids", "Waves & superposition", "Electricity & D.C. circuits",
      "Particle physics", "Circular motion", "Gravitational fields", "Thermal physics & ideal gases",
      "Oscillations", "Electric fields & capacitance", "Magnetic fields & electromagnetic induction",
      "Alternating currents", "Quantum physics", "Nuclear physics", "Astronomy & cosmology",
    ],
    provision: [
      "Structured teaching aligned to the current 9702 syllabus",
      "Topical past-paper practice and full papers in the Exam Lab",
      "Practical-skills preparation for Papers 3 and 5",
      "Personalised study plans, progress tracking and drills in the student portal",
    ],
  },
  {
    slug: "o-level-5054",
    code: "5054",
    name: "Cambridge O Level Physics (5054)",
    shortName: "O Level Physics 5054",
    summary:
      "The Cambridge O Level qualification developing core physics understanding — motion, energy, thermal physics, waves, electricity and atomic physics — with theory and practical assessment.",
    audience: "O Level students building the foundation for A Level or equivalent further study.",
    papers: [
      { name: "Paper 1 · Multiple Choice", focus: "Breadth across the full syllabus." },
      { name: "Paper 2 · Theory", focus: "Structured questions testing understanding and application." },
      { name: "Practical assessment", focus: "Experimental skills and data handling." },
    ],
    topics: [
      "Measurement & units", "Kinematics & dynamics", "Mass, weight & density", "Work, energy & power",
      "Thermal physics", "Waves, light & sound", "Electricity & magnetism", "Electromagnetic effects", "Atomic physics",
    ],
    provision: [
      "Concept-first teaching with exam technique built in",
      "Topical questions and structured revision",
      "Practice papers with feedback",
    ],
  },
  {
    slug: "ib",
    code: null,
    name: "IB Diploma Programme Physics",
    shortName: "IBDP Physics",
    summary:
      "IB Diploma Programme Physics (SL and HL) — mechanics, fields, waves, electricity, thermal and modern physics taught with the IB's inquiry-led approach, including internal assessment support.",
    audience: "IB Diploma candidates taking Physics at Standard or Higher Level.",
    papers: [
      { name: "Paper 1 · Multiple Choice", focus: "Syllabus breadth (SL/HL)." },
      { name: "Paper 2 · Structured", focus: "Short and extended response questions." },
      { name: "Internal Assessment", focus: "Independent investigation with analysis and evaluation." },
    ],
    topics: [
      "Space, time & motion", "Particulate nature of matter", "Wave behaviour",
      "Fields", "Nuclear & quantum physics", "Energy transfers",
    ],
    provision: [
      "SL and HL teaching mapped to the current IB Physics guide",
      "Internal Assessment mentoring — design, data and evaluation",
      "Exam-style practice and mark-scheme-aware feedback",
    ],
  },
];

export function getQualification(slug: string): Qualification | undefined {
  return QUALIFICATIONS.find((q) => q.slug === slug);
}
