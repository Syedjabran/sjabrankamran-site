// src/lib/sat/coach/knowledge.ts
//
// The Digital SAT Tutor's knowledge pack (SAT Coach spec 8.4): the test's
// format, timing, adaptive modules, scoring, the 8 College Board domains
// and their skills (spelled as the question bank spells them) with one line
// each, question types and the grid-in rules, strategies per domain,
// pacing, the tools on the real test and test-day logistics. PURE text --
// no answer data, no server-only imports -- kept compact because every
// tutor call carries it inside the Groq free tier's ~3,000-token budget.
import { DOMAIN_LABEL, type SATDomainId } from "../client-types.ts";
import type { SATSection } from "../types.ts";

/** Each domain's skills, in the bank's spelling, with what they test.
 *  scripts/test-sat-tutor.mjs checks every bank skill is described here. */
export const KNOWLEDGE_SKILLS: Record<SATDomainId, { skill: string; what: string }[]> = {
  "craft-structure": [
    { skill: "Words in Context", what: "the most precise word for the blank" },
    { skill: "Text Structure and Purpose", what: "a text's purpose or a sentence's role" },
    { skill: "Cross-Text Connections", what: "how one author would answer the other" },
  ],
  "information-ideas": [
    { skill: "Central Ideas and Details", what: "main idea or a stated detail" },
    { skill: "Command of Evidence", what: "the quote or table/graph data that supports a claim" },
    { skill: "Inferences", what: "the logical completion of the text" },
  ],
  "standard-english": [
    { skill: "Boundaries", what: "punctuation between clauses and phrases, run-ons, fragments" },
    { skill: "Form, Structure, and Sense", what: "agreement, verb tense/form, modifiers, possessives" },
  ],
  "expression-ideas": [
    { skill: "Rhetorical Synthesis", what: "use notes to meet a stated goal" },
    { skill: "Transitions", what: "the connector that fits the logic" },
  ],
  algebra: [
    { skill: "Linear equations in one variable", what: "solve; count solutions" },
    { skill: "Linear equations in two variables", what: "model ax + by = c" },
    { skill: "Linear functions", what: "slope, intercepts, tables, graphs" },
    { skill: "Systems of two linear equations in two variables", what: "solve; none/one/infinite" },
    { skill: "Linear inequalities in one or two variables", what: "constraints, test points" },
  ],
  "advanced-math": [
    { skill: "Equivalent expressions", what: "factor, expand, exponent rules" },
    { skill: "Nonlinear equations in one variable and systems of equations in two variables", what: "quadratics, radicals, rationals" },
    { skill: "Nonlinear functions", what: "quadratic/exponential models, vertex, roots, transformations" },
  ],
  psda: [
    { skill: "Ratios, rates, proportional relationships, and units", what: "proportions, unit conversion" },
    { skill: "Percentages", what: "percent of, percent change" },
    { skill: "One-variable data: Distributions and measures of center and spread", what: "mean, median, SD, outliers" },
    { skill: "Two-variable data: Models and scatterplots", what: "best-fit line, predictions" },
    { skill: "Probability and conditional probability", what: "two-way tables, 'given that'" },
    { skill: "Inference from sample statistics and margin of error", what: "what a random sample supports" },
    { skill: "Evaluating statistical claims: Observational studies and experiments", what: "random assignment vs sampling, causation" },
  ],
  "geometry-trig": [
    { skill: "Area and volume", what: "formulas, scaling" },
    { skill: "Lines, angles, and triangles", what: "parallel lines, angle sums, similar triangles" },
    { skill: "Right triangles and trigonometry", what: "Pythagoras, special triangles, SOH-CAH-TOA, radians" },
    { skill: "Circles", what: "arcs, sectors, (x - h)^2 + (y - k)^2 = r^2" },
  ],
};

const SECTION_DOMAINS: Record<SATSection, { id: SATDomainId; share: string }[]> = {
  rw: [
    { id: "craft-structure", share: "~28%" },
    { id: "information-ideas", share: "~26%" },
    { id: "standard-english", share: "~26%" },
    { id: "expression-ideas", share: "~20%" },
  ],
  math: [
    { id: "algebra", share: "~35%" },
    { id: "advanced-math", share: "~35%" },
    { id: "psda", share: "~15%" },
    { id: "geometry-trig", share: "~15%" },
  ],
};

const FORMAT = [
  "FORMAT: taken in the Bluebook app. Reading and Writing (R&W), then Math; 2 modules each. R&W: 27 questions in 32 minutes per module. Math: 22 questions in 35 minutes per module. 10-minute break between sections. Each module has its own clock; you can go back only within a module.",
  "Adaptive: Module 1 mixes difficulties; doing well sends you to a harder Module 2, the only route to top scores. A few unscored trial questions can't be spotted, so treat all as real.",
  "Scoring: 200-800 per section, 400-1600 total. No penalty for wrong answers, so never leave a blank. Here, official practice tests give official ranges and the adaptive mock a labelled estimate; skill mastery is a percentage, never a score.",
].join("\n");

const QUESTION_TYPES: Record<SATSection, string> = {
  rw: "R&W: all 4-option multiple choice, one short passage (or a pair) per question.",
  math: "Math: ~75% multiple choice, ~25% grid-in: at most 5 characters (6 with a minus sign), fraction or decimal, never a mixed number (write 7/2 or 3.5), no % $ or commas, fill the box with a long decimal (2/3 -> .6667 or .6666), one answer if several work. Built-in Desmos calculator and a reference sheet of formulas throughout Math.",
};

const STRATEGIES: Record<SATSection, string> = {
  rw: "R&W tips: read the question first; predict before the options; the answer must be supported by the text alone; cut options too broad, too extreme or half-supported. Test each word in the blank. Check data claims against every number. Semicolon = two independent clauses; colon after a complete clause; non-essential phrases take two commas or two dashes. Name the transition's logic first. Rhetorical Synthesis: meet the stated goal exactly.",
  math: "Math tips: turn words into equations; re-read what is asked (x or 2x, units); use Desmos to graph, intersect, check equivalence and fit data; plug in choices or pick numbers. None/infinite solutions: compare slopes and intercepts. Percent change: new = old x (1 +/- p/100). Know vertex form, the discriminant, a*b^x growth/decay, similar triangles.",
};

const PACING_AND_STUDY = "PACING: ~71 s per R&W and ~95 s per Math question; never get stuck: guess, flag, return. STUDY: weakest high-weight skills first; review every mistake (why the key is right and yours wrong); timed sets; official practice tests; spaced review.";

const TEST_DAY = "TEST DAY: install Bluebook and finish the exam setup; get the admission ticket a few days before. Bring the charged device and charger, the admission ticket, acceptable photo ID, pencils (scratch paper is given), an optional approved calculator, a snack and water. Arrive early (time on the ticket); phone off and away; sleep well.";

function domainBlock(section: SATSection): string {
  const heading = section === "rw" ? "R&W DOMAINS (share): skills" : "MATH DOMAINS (share): skills";
  const lines = SECTION_DOMAINS[section].map(({ id, share }) => {
    const skills = KNOWLEDGE_SKILLS[id].map((s) => `${s.skill} (${s.what})`).join("; ");
    return `- ${DOMAIN_LABEL[id]} [${id}] ${share}: ${skills}.`;
  });
  return [heading, ...lines].join("\n");
}

/** The pack sent in every tutor prompt. `focus` (an explanation of one
 *  question, whose images already cost most of the token budget) keeps
 *  only that section's domains, question types and strategies. */
export function knowledgePack(focus?: SATSection): string {
  if (focus) return [domainBlock(focus), QUESTION_TYPES[focus], STRATEGIES[focus]].join("\n");
  return [
    FORMAT,
    ...(["rw", "math"] as const).map((s) => [domainBlock(s), QUESTION_TYPES[s], STRATEGIES[s]].join("\n")),
    PACING_AND_STUDY,
    TEST_DAY,
  ].join("\n\n");
}
