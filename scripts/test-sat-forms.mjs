import assert from "node:assert/strict";
import { BLUEPRINT, allocateByDomain, assembleForm } from "../src/lib/sat/forms.ts";
import { shuffle } from "../src/lib/sat/shuffle.ts";
import * as clientTypes from "../src/lib/sat/client-types.ts";

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
assert.equal(BLUEPRINT, clientTypes.BLUEPRINT, "forms.ts assembles from the same blueprint the hub describes");

// Largest-remainder allocation must total exactly, never 26 or 28.
const alloc = allocateByDomain(27, { a: 0.3, b: 0.3, c: 0.2, d: 0.2 });
assert.equal(Object.values(alloc).reduce((x, y) => x + y, 0), 27);

// Fix round 1, finding 1: an empty proportions map cannot allocate a
// positive total -- that is a data error (a section with zero questions),
// and must throw rather than crash on `order[i % 0]`.
assert.throws(() => allocateByDomain(27, {}), /allocateByDomain/);

// Weights need not already sum to 1: they are normalised by their own sum,
// so the result still totals exactly 27 even when the input sums to 2.
const overWeighted = allocateByDomain(27, { a: 0.6, b: 0.6, c: 0.4, d: 0.4 });
assert.equal(Object.values(overWeighted).reduce((x, y) => x + y, 0), 27);

// A domain with zero weight gets zero questions, not a share of the total.
const zeroWeighted = allocateByDomain(10, { a: 1, b: 0 });
assert.equal(zeroWeighted.b, 0);
assert.equal(zeroWeighted.a, 10);

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

// --- the shared shuffle is the Fisher-Yates both callers used to inline ---
// (so drills and forms drawn with the same seed are unchanged by the move).
function inlineFisherYates(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const letters = [..."abcdefghijklmnop"];
assert.deepEqual(shuffle(letters, seeded(5)), inlineFisherYates(letters, seeded(5)));
assert.deepEqual(letters, [..."abcdefghijklmnop"], "the input is never reordered");

// --- exclusion: a new mock skips the questions of a running sitting (F9) ---
const setIds = (f) => Object.values(f.sets).flat().map((x) => x.id);
const running = assembleForm(bank, seeded(21));
const inPlay = new Set(setIds(running));
const second = assembleForm(bank, seeded(22), inPlay);
for (const key of ["rw.m1", "rw.m2.lower", "rw.m2.upper"]) assert.equal(second.sets[key].length, 27, `${key} still full`);
for (const key of ["math.m1", "math.m2.lower", "math.m2.upper"]) assert.equal(second.sets[key].length, 22, `${key} still full`);
assert.ok(setIds(second).every((id) => !inPlay.has(id)), "no question of the running sitting reappears while the pool allows");
const secondM1 = new Set(second.sets["rw.m1"].map((x) => x.id));
assert.ok(second.sets["rw.m2.upper"].every((x) => !secondM1.has(x.id)), "Module 1 / Module 2 disjointness still holds");

// Exclude every algebra question: that domain alone falls back to the
// unrestricted pool (a short module is a broken form); the other domains
// still honour the exclusion.
const algebraAndMore = new Set([...bank.filter((x) => x.domain === "algebra").map((x) => x.id), ...inPlay]);
const fallback = assembleForm(bank, seeded(23), algebraAndMore);
for (const key of ["math.m1", "math.m2.lower", "math.m2.upper"]) assert.equal(fallback.sets[key].length, 22, `${key} full despite the exclusion`);
assert.ok(fallback.sets["math.m1"].some((x) => x.domain === "algebra"), "the unfillable domain falls back to its whole pool");
assert.ok(
  Object.values(fallback.sets).flat().filter((x) => x.domain !== "algebra").every((x) => !algebraAndMore.has(x.id)),
  "every fillable domain still honours the exclusion",
);
// No exclusion set behaves exactly as before.
assert.deepEqual(setIds(assembleForm(bank, seeded(7), new Set())), setIds(assembleForm(bank, seeded(7))));

console.log("sat-forms tests passed");

import { ROUTING, routeModule2, ROUTING_DISCLOSURE } from "../src/lib/sat/adaptive.ts";

assert.equal(routeModule2("rw", 27), "upper");
assert.equal(routeModule2("rw", 0), "lower");
assert.equal(routeModule2("rw", ROUTING.rw.threshold), "upper");
assert.equal(routeModule2("rw", ROUTING.rw.threshold - 1), "lower");
assert.equal(routeModule2("math", 22), "upper");
assert.equal(routeModule2("math", 0), "lower");

// Spec 10.6: the threshold is an approximation and must say so wherever it
// is surfaced. A blank disclosure would let the UI imply it is official.
assert.ok(ROUTING_DISCLOSURE.length > 40);
assert.ok(/approximation|not.*official|does not publish/i.test(ROUTING_DISCLOSURE));
assert.equal(ROUTING_DISCLOSURE, clientTypes.ROUTING_DISCLOSURE, "one definition, re-exported by adaptive.ts");

console.log("sat-adaptive tests passed");
