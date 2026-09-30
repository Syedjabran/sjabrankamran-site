import assert from "node:assert/strict";
import { validateSPR, isCorrectSPR, isCorrect, answerText, sprNumber } from "../src/lib/sat/grade.ts";

// --- entry validation (the answer box) ---
assert.equal(validateSPR("3/2").ok, true);
assert.equal(validateSPR("1.5").ok, true);
assert.equal(validateSPR("12345").ok, true);
assert.equal(validateSPR("123456").ok, false, "6 characters only for negatives");
assert.equal(validateSPR("-12345").ok, true, "the minus sign gets the sixth character");
assert.equal(validateSPR("-123456").ok, false);
assert.equal(validateSPR("1 1/2").ok, false, "mixed numbers are not allowed");
assert.equal(validateSPR("50%").ok, false);
assert.equal(validateSPR("1,000").ok, false);
assert.equal(validateSPR("3/0").ok, false);
assert.equal(validateSPR("").ok, false);
assert.equal(validateSPR(".").ok, false);
const plus = validateSPR(" +4 ");
assert.ok(plus.ok && plus.value === "4", "a leading plus and whitespace are dropped");

assert.equal(sprNumber("-3/4"), -0.75);
assert.equal(sprNumber(".5"), 0.5);

// --- correctness ---
assert.equal(isCorrectSPR("1.5", ["3/2"]), true, "decimal for an accepted fraction");
assert.equal(isCorrectSPR("3/2", ["1.5"]), true, "fraction for an accepted decimal");
assert.equal(isCorrectSPR("6/4", ["3/2"]), true, "fractions need not be reduced");
assert.equal(isCorrectSPR("1.50", ["1.5"]), true);
assert.equal(isCorrectSPR(".6666", ["2/3"]), true, "truncated, fills the box");
assert.equal(isCorrectSPR(".6667", ["2/3"]), true, "rounded, fills the box");
assert.equal(isCorrectSPR("0.666", ["2/3"]), true);
assert.equal(isCorrectSPR("0.667", ["2/3"]), true);
assert.equal(isCorrectSPR("0.66", ["2/3"]), false, "does not fill the box");
assert.equal(isCorrectSPR(".67", ["2/3"]), false);
assert.equal(isCorrectSPR("-.6666", ["-2/3"]), true, "negative answers get six characters");
assert.equal(isCorrectSPR("-.666", ["-2/3"]), false);
assert.equal(isCorrectSPR("403", ["403"]), true);
assert.equal(isCorrectSPR("404", ["403"]), false);
assert.equal(isCorrectSPR("8", ["8", "9"]), true, "any of several accepted roots");
assert.equal(isCorrectSPR("1 1/2", ["3/2"]), false, "an invalid entry is never correct");

assert.equal(isCorrect({ kind: "mcq", correct: 2 }, "C"), true);
assert.equal(isCorrect({ kind: "mcq", correct: 2 }, "c"), true);
assert.equal(isCorrect({ kind: "mcq", correct: 2 }, "B"), false);
assert.equal(isCorrect({ kind: "mcq", correct: 0 }, null), false, "blank is wrong, not an error");
assert.equal(isCorrect({ kind: "spr", accepted: ["3/2"] }, "1.5"), true);

assert.equal(answerText({ kind: "mcq", correct: 3 }), "D");
assert.equal(answerText({ kind: "spr", accepted: ["3/2", "1.5"] }), "3/2 or 1.5");

console.log("sat-grade tests passed");
