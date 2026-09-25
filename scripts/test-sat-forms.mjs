import assert from "node:assert/strict";
import { BLUEPRINT, allocateByDomain, assembleForm } from "../src/lib/sat/forms.ts";

// Deterministic RNG so a form is reproducible and a failure is debuggable.
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const q = (id, section, domain, difficulty) => ({
  id, section, domain, difficulty, skill: "s",
  answer: { kind: "mcq", correct: 0 }, rationale: "r",
  img: `sat/${section}/${id}.jpg`, ref: id, source: "question-bank",
});

// A pool deep enough that assembly is never forced.
const bank = [];
for (const [section, domains] of [
  ["rw", ["information-ideas", "craft-structure", "expression-ideas", "standard-english"]],
  ["math", ["algebra", "advanced-math", "psda", "geometry-trig"]],
]) {
  for (const d of domains) {
    for (const diff of ["E", "M", "H"]) {
      for (let i = 0; i < 40; i++) bank.push(q(`${section}-${d}-${diff}-${i}`, section, d, diff));
    }
  }
}

assert.equal(BLUEPRINT.rw.perModule, 27);
assert.equal(BLUEPRINT.math.perModule, 22);
assert.equal(BLUEPRINT.rw.minutes, 32);
assert.equal(BLUEPRINT.math.minutes, 35);
assert.equal(BLUEPRINT.breakMinutes, 10);

// Largest-remainder allocation must total exactly, never 26 or 28.
const alloc = allocateByDomain(27, { a: 0.3, b: 0.3, c: 0.2, d: 0.2 });
assert.equal(Object.values(alloc).reduce((x, y) => x + y, 0), 27);

const form = assembleForm(bank, seeded(7));
for (const key of ["rw.m1", "rw.m2.lower", "rw.m2.upper"]) {
  assert.equal(form.sets[key].length, 27, `${key} must hold 27 questions`);
}
for (const key of ["math.m1", "math.m2.lower", "math.m2.upper"]) {
  assert.equal(form.sets[key].length, 22, `${key} must hold 22 questions`);
}

// A student must never meet the same question twice in one sitting: the two
// Module 2 variants are alternatives, but Module 1 is always sat.
const m1 = new Set(form.sets["rw.m1"].map((x) => x.id));
for (const key of ["rw.m2.lower", "rw.m2.upper"]) {
  for (const item of form.sets[key]) {
    assert.ok(!m1.has(item.id), `${item.id} appears in both rw.m1 and ${key}`);
  }
}

// Module 2 lower leans easy, upper leans hard. Compared against each other,
// not against an absolute threshold, which is what the weighting claims.
const hard = (key) => form.sets[key].filter((x) => x.difficulty === "H").length;
assert.ok(hard("rw.m2.upper") > hard("rw.m2.lower"), "upper module must be harder");
assert.ok(hard("math.m2.upper") > hard("math.m2.lower"), "upper module must be harder");

// Reproducible: the same seed yields the same form.
assert.deepEqual(
  assembleForm(bank, seeded(7)).sets["rw.m1"].map((x) => x.id),
  form.sets["rw.m1"].map((x) => x.id),
);

console.log("sat-forms tests passed");
