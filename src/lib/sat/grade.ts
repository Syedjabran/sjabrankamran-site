// src/lib/sat/grade.ts
//
// Correctness for both answer kinds. Pure, and the only place a response is
// judged: the server calls this when a module or drill question is submitted,
// never the browser.
import type { SATAnswer } from "./types.ts";

export const SPR_MAX_POSITIVE = 5;
export const SPR_MAX_NEGATIVE = 6;

const SPR_SHAPE = /^-?(?:\d+\/\d+|\d+(?:\.\d*)?|\.\d+)$/;
const LETTERS = ["A", "B", "C", "D"] as const;
const EPS = 1e-9;

export type SPRCheck = { ok: true; value: string } | { ok: false; reason: string };

/** Validate a grid-in entry the way the digital SAT's answer box does. */
export function validateSPR(raw: string): SPRCheck {
  const value = raw.trim().replace(/^\+/, "");
  if (!value) return { ok: false, reason: "Enter an answer." };
  if (!SPR_SHAPE.test(value)) {
    return { ok: false, reason: "Use digits with one decimal point or one fraction bar, and an optional leading minus sign." };
  }
  const negative = value.startsWith("-");
  const max = negative ? SPR_MAX_NEGATIVE : SPR_MAX_POSITIVE;
  if (value.length > max) {
    return { ok: false, reason: `Answers can be at most ${max} characters${negative ? ", including the minus sign" : ""}.` };
  }
  if (/\/0+$/.test(value)) return { ok: false, reason: "A fraction cannot have a denominator of zero." };
  return { ok: true, value };
}

/** Numeric value of a validated entry or an accepted answer; null if it is not a number. */
export function sprNumber(value: string): number | null {
  const v = value.trim();
  if (v.includes("/")) {
    const negative = v.startsWith("-");
    const [n, d] = v.replace(/^-/, "").split("/").map(Number);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return (negative ? -1 : 1) * (n / d);
  }
  if (!/\d/.test(v)) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * College Board: a decimal that cannot fit may be rounded or truncated, but it
 * must fill the whole answer box — so 0.667 is correct for 2/3 and 0.67 is not.
 */
function fillsBoxApproximation(entry: string, exact: number): boolean {
  if (!entry.includes(".")) return false;
  const max = entry.startsWith("-") ? SPR_MAX_NEGATIVE : SPR_MAX_POSITIVE;
  if (entry.length !== max) return false;
  const places = entry.length - entry.indexOf(".") - 1;
  if (places < 1) return false;
  const f = 10 ** places;
  const value = Number(entry);
  return [Math.trunc(exact * f) / f, Math.round(exact * f) / f].some((c) => Math.abs(c - value) < EPS);
}

export function isCorrectSPR(entry: string, accepted: string[]): boolean {
  const check = validateSPR(entry);
  if (!check.ok) return false;
  const e = check.value;
  const en = sprNumber(e);
  for (const a of accepted) {
    const target = a.trim();
    if (target === e) return true;
    const an = sprNumber(target);
    if (an === null || en === null) continue;
    if (Math.abs(an - en) < EPS) return true;
    if (fillsBoxApproximation(e, an)) return true;
  }
  return false;
}

export function isCorrect(answer: SATAnswer, response: string | null | undefined): boolean {
  if (!response || !response.trim()) return false;
  if (answer.kind === "mcq") return response.trim().toUpperCase() === LETTERS[answer.correct];
  return isCorrectSPR(response, answer.accepted);
}

/** How the correct answer is shown after submission. */
export function answerText(answer: SATAnswer): string {
  return answer.kind === "mcq" ? LETTERS[answer.correct] : answer.accepted.join(" or ");
}
