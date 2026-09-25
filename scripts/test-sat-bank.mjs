import assert from "node:assert/strict";
import { filterQuestions, byDomain, domainProportions, loadQuestionBank } from "../src/lib/sat/bank.ts";
import { DOMAIN_LABEL, DOMAIN_SECTIONS, SAT_DOMAIN_IDS } from "../src/lib/sat/client-types.ts";

const q = (id, section, domain, difficulty) => ({
  id, section, domain, difficulty, skill: "s",
  answer: { kind: "mcq", correct: 0 }, rationale: "r",
  img: `sat/${section}/${id}.jpg`, ref: id, source: "question-bank",
});

const bank = [
  q("a", "math", "algebra", "E"), q("b", "math", "algebra", "H"),
  q("c", "math", "psda", "M"), q("d", "rw", "craft-structure", "E"),
];

assert.deepEqual(filterQuestions(bank, { section: "math" }).map((x) => x.id), ["a", "b", "c"]);
assert.deepEqual(filterQuestions(bank, { difficulty: "H" }).map((x) => x.id), ["b"]);
assert.deepEqual(filterQuestions(bank, { section: "math", domain: "psda" }).map((x) => x.id), ["c"]);
// An empty filter is not a filter -- it must not silently return nothing.
assert.equal(filterQuestions(bank, {}).length, 4);

assert.deepEqual(Object.keys(byDomain(bank, "math")).sort(), ["algebra", "psda"]);

const props = domainProportions(bank, "math");
assert.ok(Math.abs(props.algebra - 2 / 3) < 1e-9);
assert.ok(Math.abs(props.psda - 1 / 3) < 1e-9);
// Proportions over a section must sum to 1, or form assembly silently
// under-fills a module.
assert.ok(Math.abs(Object.values(props).reduce((a, b) => a + b, 0) - 1) < 1e-9);

// --- the domain list is spelled once (client-types.ts) ---
assert.deepEqual(SAT_DOMAIN_IDS, [
  "information-ideas", "craft-structure", "expression-ideas", "standard-english",
  "algebra", "advanced-math", "psda", "geometry-trig",
]);
assert.deepEqual(DOMAIN_SECTIONS.map((d) => d.value), SAT_DOMAIN_IDS);
assert.deepEqual(Object.keys(DOMAIN_LABEL), SAT_DOMAIN_IDS);
assert.equal(DOMAIN_LABEL.psda, "Problem-Solving and Data Analysis");
// Every shipped question's domain is one of them, in the section it names.
const sectionOf = new Map(DOMAIN_SECTIONS.map((d) => [d.value, d.section]));
for (const item of loadQuestionBank()) {
  assert.equal(sectionOf.get(item.domain), item.section, `${item.id}: domain ${item.domain} in ${item.section}`);
}

console.log("sat-bank tests passed");
