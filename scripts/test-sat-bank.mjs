import assert from "node:assert/strict";
import { filterQuestions, byDomain, domainProportions } from "../src/lib/sat/bank.ts";

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

console.log("sat-bank tests passed");
