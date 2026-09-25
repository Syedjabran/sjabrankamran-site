# SAT Lab Surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students and staff the SAT product the spec describes — an SAT Lab in the portal (adaptive mock exams, official practice tests, drills, score reports, teacher assignments and results) and a public `/sat` vertical — on top of the core module plan 2 built.

**Architecture:** Every decision that affects a score is made on the server. The browser receives question *images* and the question's answer *type* (MCQ or grid-in), never the answer key or rationale, until the question or module has been submitted. A sitting is a JSON document per attempt in the private `portal-data` bucket (Storage-as-DB, the same mechanism Exam Lab attempts use); pure state-transition functions in `src/lib/sat/session.ts` and `drills.ts` decide routing, timing and correctness and are unit-tested under Node; two route handlers load a document, apply one transition with the server clock, and save it.

**Tech Stack:** Next.js 16 App Router (Turbopack), React 19, TypeScript 5.7, Tailwind 3.4, Zod 3.24, lucide-react, Supabase Storage (service role, server-only), Node 22 `--experimental-strip-types` for tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-sat-module-design.md` (§4 products, §7 adaptive engine, §8 scoring, §9 access, §10 integrity rules, §11 phases 5–7).

**Predecessor:** `docs/superpowers/plans/2026-09-23-sat-practice-tests-and-core.md` (plan 2). This plan consumes its interfaces exactly:
`src/lib/sat/types.ts` (`SATSection`, `SATDifficulty`, `SATDomain`, `SATAnswer`, `SATQuestion`, `SATTestQuestion`, `SATPracticeTest`, `SATForm`, `SATScore`), `bank.ts` (`loadQuestionBank`, `loadPracticeTests`, `practiceTest`, `filterQuestions`, `SATFilter`), `forms.ts` (`BLUEPRINT`, `assembleForm`, `Rng`), `adaptive.ts` (`routeModule2`, `ROUTING`, `ROUTING_DISCLOSURE`), `scoring.ts` (`scoreOfficial`, `scoreEstimated`), `course-access.ts` (`Course` includes `"SAT"`, `resolveCourseAccess`), and `practice-tests.json` whose tests carry `minutes: {"rw": [m1, m2], "math": [m1, m2]}` (plan 2 ledger ruling, measured 39/39/43/43 on all 8 papers).

## Global Constraints

- **The answer key never reaches the browser before submission.** `question-bank.json` (5.2 MB, every answer and rationale) is imported only by server modules (`src/lib/sat/serve.ts` and route handlers). No file under `src/components/` or any `"use client"` module may import `src/lib/sat/bank.ts`, `serve.ts`, `session.ts` or the JSON. Client code imports types only, from `src/lib/sat/client-types.ts`.
- **Spec 10.5 — a scaled score is called official only when it came from an ingested conversion table.** Every score shown carries its authority ("Official score range" / "Estimated score") and, for estimates, the `basis` text from `scoreEstimated`. When no conversion table has been ingested, no number is shown: the report says scores appear once the official tables are loaded.
- **Spec 10.6 — the routing threshold is an approximation everywhere it is surfaced.** Any screen that mentions Module 2 routing or the route taken shows `ROUTING_DISCLOSURE` verbatim.
- **Spec 8 / 3.2 — scores are ranges**, 400–1600 total, never a point score.
- **Spec 9 — portal-only, auth-gated.** Real items are served as short-lived signed URLs from the private `exam-assets` bucket via `/api/exam-lab/asset`, gated to the `SAT` course. The local-crop image route exists only when `NODE_ENV === "development"` **and** `SAT_LOCAL_CROPS === "1"`, and 404s otherwise.
- **Timing is the server's.** Module deadlines are `stageStartedAt + minutes`. The client displays the server deadline corrected for clock skew. A sitting that is found already past its deadline when it is (re)opened is **never auto-submitted**: the student sees "Time is up for this module" and submits explicitly (the answers they autosaved are kept). This is the lesson of a regression fixed on 2026-09-25 in Exam Lab, where resuming an expired sitting auto-submitted a blank attempt.
- **Storage reads fail closed.** Use `readFreshJson` / `writeFreshJson` from `src/lib/exam-lab/storage-fresh.ts`; a failed read is never treated as "no document" and never followed by a write.
- **Pakistan time.** Dates shown to users go through `formatPk` from `src/lib/portal/pk-time.ts`; zone-less `datetime-local` input goes through `pkDateTimeToIso`.
- **Module resolution (plan 2 ruling).** Inside `src/lib/sat/`, sibling imports carry the `.ts` extension and JSON imports carry `with { type: "json" }`; pure modules that tests import under Node must not use the `@/` alias.
- **UI.** Match the portal's current tokens and idioms (`text-ice`, `text-fog`, `text-dust`, `text-cyan`, `bg-space/60`, `border-white/10`, `rounded-2xl`, `btn-primary`, `btn-ghost`, `font-display`, lucide icons). Keep pages sparse. No horizontal overflow at 360 px: grid children get `min-w-0`. Never use `window.confirm` / `alert` — confirmations are inline.
- **Trademark.** Every public `/sat` page carries: "SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this website."
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. `git add` by explicit path only.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/sat/grade.ts` | MCQ and grid-in (SPR) correctness, SPR entry validation — pure |
| `src/lib/sat/session.ts` | adaptive / practice sitting as pure state transitions (start, save, submit, break, finish) — pure |
| `src/lib/sat/drills.ts` | drill sittings: build from a filter, check one answer — pure |
| `src/lib/sat/client-types.ts` | the JSON the API returns (types only) — safe for client imports |
| `src/lib/sat/serve.ts` | server-only: id → question lookup across both banks, public views, review items, client state, report |
| `src/lib/sat/store.ts` | server-only: session documents + per-user index in `portal-data` |
| `src/lib/sat/access.ts` | server-only: who may use the SAT Lab, who may view whose sessions |
| `src/lib/sat/assignments.ts` | server-only: teacher-assigned SAT work per student |
| `src/app/api/sat/sessions/route.ts` | GET my sessions + assignments; POST start adaptive / practice / drill |
| `src/app/api/sat/sessions/[id]/route.ts` | GET state; POST `save` / `submit` / `begin` / `check` |
| `src/app/api/sat/local-image/route.ts` | dev-only image server for local crops |
| `src/app/api/sat/results/route.ts` | staff: SAT students in scope and their session summaries |
| `src/app/api/sat/assignments/route.ts` | staff: assign SAT work to classes or students |
| `src/components/sat/use-signed-images.ts` | batch image signing hook |
| `src/components/sat/spr-pad.tsx` | grid-in entry with live validation |
| `src/components/sat/score-report.tsx` | score range + authority, sections, route + disclosure, domains, review |
| `src/components/sat/sat-runner.tsx` | module-by-module sitting UI (timer, navigator, break, submit) |
| `src/components/sat/sat-drill.tsx` | one-question-at-a-time drill with immediate rationale |
| `src/components/sat/sat-hub.tsx` | SAT Lab home: start mock / practice test / drill, assigned work, history |
| `src/components/sat/sat-assign.tsx` | staff: assign form |
| `src/app/portal/(app)/sat-lab/page.tsx` | gate + hub |
| `src/app/portal/(app)/sat-lab/[sessionId]/page.tsx` | sitting page |
| `src/app/portal/(app)/sat-lab/results/page.tsx` | staff results |
| `src/app/sat/programs.ts`, `src/app/sat/page.tsx`, `src/app/sat/[slug]/page.tsx` | public vertical |
| `scripts/test-sat-grade.mjs`, `scripts/test-sat-session.mjs` | Node tests |
| `scripts/exam-lab/ingest-sat/crop_rationale.py` (+ test) | rationale-region crops (Math rationale text is unusable) |
| `docs/SAT-TESTING.md` | how the owner tests the SAT Lab locally and on a preview |

---

### Task 1: Grading rules

**Files:**
- Create: `src/lib/sat/grade.ts`
- Create: `scripts/test-sat-grade.mjs`
- Modify: `package.json` (append `test-sat-grade.mjs` to `test:sat`)

**Interfaces:**
- Consumes: `SATAnswer` from `./types.ts`.
- Produces: `validateSPR(raw: string): SPRCheck`; `sprNumber(value: string): number | null`; `isCorrectSPR(entry: string, accepted: string[]): boolean`; `isCorrect(answer: SATAnswer, response: string | null | undefined): boolean`; `answerText(answer: SATAnswer): string`; `mcqLetter(i: number): string`; constants `SPR_MAX_POSITIVE = 5`, `SPR_MAX_NEGATIVE = 6`.

College Board's published grid-in rules, which this encodes: up to 5 characters for a positive answer and 6 for a negative one (the minus sign counts); a fraction or a decimal, not a mixed number; no symbols; fractions need not be reduced; a decimal too long to fit may be rounded or truncated **but must fill the entire answer box** (for 2/3: `.6666`, `.6667`, `0.666`, `0.667` are correct; `0.66`, `.67` are not).

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-sat-grade.mjs
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --no-warnings --experimental-strip-types scripts/test-sat-grade.mjs`
Expected: FAIL — cannot find module `../src/lib/sat/grade.ts`.

- [ ] **Step 3: Write `grade.ts`**

```ts
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

export function mcqLetter(i: number): string {
  return LETTERS[i] ?? "?";
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
```

- [ ] **Step 4: Run it and watch it pass; wire the script**

Append `&& node --no-warnings --experimental-strip-types scripts/test-sat-grade.mjs` to the `test:sat` script (or a `test:sat-grade` entry chained from it, matching how plan 2 wired its scripts — read `package.json` first and follow that shape).

Run: `node --no-warnings --experimental-strip-types scripts/test-sat-grade.mjs` → `sat-grade tests passed`; `npm run typecheck` → clean.

- [ ] **Step 5: Prove it against every grid-in answer in the real bank**

Every accepted answer the pipeline shipped must grade itself as correct, or a student typing the official answer would be marked wrong.

```bash
node --no-warnings --experimental-strip-types -e "
import('./src/lib/sat/bank.ts').then(async (b) => {
  const { isCorrectSPR, validateSPR } = await import('./src/lib/sat/grade.ts');
  const spr = b.loadQuestionBank().filter((q) => q.answer.kind === 'spr');
  const bad = [];
  for (const q of spr) for (const a of q.answer.accepted) {
    if (!validateSPR(a).ok || !isCorrectSPR(a, q.answer.accepted)) bad.push(q.id + ' ' + a);
  }
  console.log('spr items', spr.length, 'self-grading failures', bad.length, bad.slice(0, 10));
});"
```

Expected: `spr items 463 self-grading failures 0`. If any accepted answer is not a valid box entry (e.g. longer than 5 characters), list them in the report: do not loosen `validateSPR` to pass them, and do not edit the bank. Grading must still accept an exact match of such an answer (the `target === e` branch does, once the entry itself validates) — report the items so the owner can decide.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sat/grade.ts scripts/test-sat-grade.mjs package.json
git commit -m "feat(sat): grid-in and multiple-choice grading to College Board's entry rules"
```

---

### Task 2: The sitting as pure state transitions

**Files:**
- Create: `src/lib/sat/session.ts`
- Create: `src/lib/sat/drills.ts`
- Create: `scripts/test-sat-session.mjs`
- Modify: `package.json` (append to `test:sat`)

**Interfaces:**
- Consumes: `BLUEPRINT` (`./forms.ts`), `routeModule2` (`./adaptive.ts`), `isCorrect` (`./grade.ts`), `filterQuestions`, `SATFilter` (`./bank.ts`), types from `./types.ts`.
- Produces (session.ts): `SATStageKey`, `STAGES`, `GRACE_MS = 90_000`, `StageResult`, `SATSession`, `sectionOf(k)`, `practiceQuestionId(testNo, section, module, qnum)`, `startAdaptive(form, ids)`, `startPractice(test, ids)`, `currentStage(s)`, `stageDeadline(s)`, `isOnBreak(s)`, `settleBreak(s, now)`, `saveAnswers(s, answers, flagged)`, `submitStage(s, answers, flagged, now, answerOf)`, `beginStage(s, now)`, `rawBySection(s)`, `DomainRow`, `domainBreakdown(items)`.
- Produces (drills.ts): `SATDrill`, `DRILL_MIN = 5`, `DRILL_MAX = 30`, `drillTitle(filter)`, `startDrill(bank, filter, count, rng, ids)`, `checkDrillAnswer(d, questionId, response, answerOf, now)`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/test-sat-session.mjs
import assert from "node:assert/strict";
import {
  STAGES, GRACE_MS, startAdaptive, startPractice, currentStage, stageDeadline, isOnBreak,
  settleBreak, saveAnswers, submitStage, beginStage, rawBySection, practiceQuestionId, domainBreakdown,
} from "../src/lib/sat/session.ts";
import { startDrill, checkDrillAnswer, DRILL_MAX } from "../src/lib/sat/drills.ts";
import { ROUTING } from "../src/lib/sat/adaptive.ts";

const T0 = Date.parse("2026-10-01T09:00:00.000Z");
const q = (id, section, domain = "algebra", difficulty = "M") => ({
  id, section, domain, difficulty, skill: "s", answer: { kind: "mcq", correct: 0 },
  rationale: "r", img: `sat/${section}/${id}.jpg`, ref: id, source: "question-bank",
});
const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const set = (p, n, section) => ids(p, n).map((id) => q(id, section));
const form = { id: "f", kind: "adaptive", sets: {
  "rw.m1": set("r1-", 27, "rw"), "rw.m2.lower": set("rl-", 27, "rw"), "rw.m2.upper": set("ru-", 27, "rw"),
  "math.m1": set("m1-", 22, "math"), "math.m2.lower": set("ml-", 22, "math"), "math.m2.upper": set("mu-", 22, "math"),
} };
// Every question in this fixture is answered correctly with "A".
const answerOf = (id) => ({ kind: "mcq", correct: 0 });
const allA = (list) => Object.fromEntries(list.map((id) => [id, "A"]));

// --- start ---
let s = startAdaptive(form, { id: "s1", uid: "u1", now: T0 });
assert.equal(currentStage(s), "rw.m1");
assert.equal(stageDeadline(s), T0 + 32 * 60_000, "R&W module 1 is 32 minutes");
assert.equal(s.plan["rw.m2"], undefined, "Module 2 is not chosen until Module 1 is scored");

// --- answers are scoped to the module being sat ---
s = saveAnswers(s, { "r1-0": "A", "m1-0": "A", "not-a-question": "B" }, ["r1-1", "m1-3"]);
assert.deepEqual(Object.keys(s.answers), ["r1-0"], "answers for other modules are dropped");
assert.deepEqual(s.flagged, ["r1-1"]);
s = saveAnswers(s, { "r1-0": "" }, []);
assert.equal(s.answers["r1-0"], undefined, "clearing an answer removes it");

// --- routing: a strong Module 1 routes upper, a weak one lower ---
const strong = submitStage(s, allA(form.sets["rw.m1"].map((x) => x.id)), [], T0 + 10 * 60_000, answerOf);
assert.equal(strong.results["rw.m1"].correct, 27);
assert.equal(strong.routed.rw, "upper");
assert.deepEqual(strong.plan["rw.m2"], form.sets["rw.m2.upper"].map((x) => x.id));
assert.equal(currentStage(strong), "rw.m2");
assert.equal(strong.stageStartedAt, T0 + 10 * 60_000, "Module 2's clock starts at submission");

const weakAnswers = allA(form.sets["rw.m1"].slice(0, ROUTING.rw.threshold - 1).map((x) => x.id));
const weak = submitStage(s, weakAnswers, [], T0 + 5 * 60_000, answerOf);
assert.equal(weak.routed.rw, "lower");
assert.deepEqual(weak.plan["rw.m2"], form.sets["rw.m2.lower"].map((x) => x.id));

// --- overtime is recorded, never rejected ---
const late = submitStage(s, {}, [], T0 + 32 * 60_000 + GRACE_MS + 1, answerOf);
assert.equal(late.results["rw.m1"].overtime, true);
assert.equal(late.results["rw.m1"].answered, 0);
const onTime = submitStage(s, {}, [], T0 + 32 * 60_000 + GRACE_MS, answerOf);
assert.equal(onTime.results["rw.m1"].overtime, false, "the grace window is inclusive");

// --- the break between sections ---
let b = submitStage(strong, allA(strong.plan["rw.m2"]), [], T0 + 40 * 60_000, answerOf);
assert.equal(currentStage(b), "math.m1");
assert.equal(isOnBreak(b), true);
assert.equal(b.breakUntil, T0 + 50 * 60_000, "a 10-minute break");
assert.equal(stageDeadline(b), null, "no module clock runs during the break");
assert.equal(submitStage(b, {}, [], T0 + 41 * 60_000, answerOf), b, "nothing can be submitted on a break");
const early = beginStage(b, T0 + 43 * 60_000);
assert.equal(early.stageStartedAt, T0 + 43 * 60_000, "a student may end the break early");
assert.equal(settleBreak(b, T0 + 45 * 60_000), b, "a break still running is left alone");
const settled = settleBreak(b, T0 + 70 * 60_000);
assert.equal(settled.stageStartedAt, T0 + 50 * 60_000, "an expired break starts Math when the break ended, not when the student returned");

// --- finishing ---
let f = beginStage(b, T0 + 50 * 60_000);
f = submitStage(f, allA(f.plan["math.m1"]), [], T0 + 60 * 60_000, answerOf);
assert.equal(f.routed.math, "upper");
f = submitStage(f, allA(f.plan["math.m2"]), [], T0 + 80 * 60_000, answerOf);
assert.equal(currentStage(f), null);
assert.equal(f.finishedAt, T0 + 80 * 60_000);
assert.deepEqual(rawBySection(f), { rw: 54, math: 44 });
assert.equal(submitStage(f, {}, [], T0 + 90 * 60_000, answerOf), f, "a finished sitting is frozen");

// --- practice tests use their own printed timings and question ids ---
const test = {
  testNo: 4, conversion: { rw: {}, math: {} }, minutes: { rw: [39, 39], math: [43, 43] },
  questions: [
    ...[1, 2].map((n) => ({ testNo: 4, section: "rw", module: 1, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
    ...[1].map((n) => ({ testNo: 4, section: "rw", module: 2, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
    ...[2, 1].map((n) => ({ testNo: 4, section: "math", module: 1, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
    ...[1].map((n) => ({ testNo: 4, section: "math", module: 2, qnum: n, answer: { kind: "mcq", correct: 0 }, img: "x", ref: "x", source: "practice-test" })),
  ],
};
const p = startPractice(test, { id: "p1", uid: "u1", now: T0 });
assert.equal(p.kind, "practice");
assert.equal(stageDeadline(p), T0 + 39 * 60_000, "the paper's own 39 minutes, not the digital 32");
assert.deepEqual(p.plan["math.m1"], [practiceQuestionId(4, "math", 1, 1), practiceQuestionId(4, "math", 1, 2)], "questions in printed order");
const pm = submitStage(p, {}, [], T0 + 60_000, answerOf);
assert.equal(pm.routed.rw, undefined, "a linear paper has no routing");
assert.deepEqual(pm.plan["rw.m2"], [practiceQuestionId(4, "rw", 2, 1)]);
assert.equal(STAGES.length, 4);

// --- domain breakdown ---
assert.deepEqual(
  domainBreakdown([{ domain: "algebra", correct: true }, { domain: "algebra", correct: false }, { domain: "psda", correct: true }]),
  [{ domain: "algebra", correct: 1, total: 2 }, { domain: "psda", correct: 1, total: 1 }],
);

// --- drills ---
const seeded = (seed) => { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const pool = [...set("a", 20, "math"), ...set("b", 20, "rw")];
const d = startDrill(pool, { section: "math" }, 8, seeded(1), { id: "d1", uid: "u1", now: T0 });
assert.equal(d.questionIds.length, 8);
assert.ok(d.questionIds.every((id) => id.startsWith("a")), "the filter is honoured");
assert.equal(startDrill(pool, { section: "math" }, 999, seeded(1), { id: "d2", uid: "u1", now: T0 }).questionIds.length, Math.min(DRILL_MAX, 20));
assert.throws(() => startDrill(pool, { section: "math", domain: "psda" }, 5, seeded(1), { id: "d3", uid: "u1", now: T0 }), /No questions/);

const first = checkDrillAnswer(d, d.questionIds[0], "A", answerOf, T0 + 1000);
assert.equal(first.correct, true);
const again = checkDrillAnswer(first.drill, d.questionIds[0], "B", answerOf, T0 + 2000);
assert.equal(again.correct, true, "the first answer counts; re-answering cannot change it");
assert.equal(again.drill.answers[d.questionIds[0]], "A");
assert.throws(() => checkDrillAnswer(d, "not-in-drill", "A", answerOf, T0), /not part of this drill/);
let done = d;
for (const id of d.questionIds) done = checkDrillAnswer(done, id, "A", answerOf, T0 + 5000).drill;
assert.equal(done.finishedAt, T0 + 5000);

console.log("sat-session tests passed");
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --no-warnings --experimental-strip-types scripts/test-sat-session.mjs`
Expected: FAIL — cannot find module `../src/lib/sat/session.ts`.

- [ ] **Step 3: Write `session.ts`**

```ts
// src/lib/sat/session.ts
//
// A sitting — adaptive mock or official practice test — as pure state
// transitions. Route handlers load a session, apply ONE transition with the
// server's clock, and save it. The browser never decides routing, timing or
// correctness: it only proposes answers.
import { BLUEPRINT } from "./forms.ts";
import { routeModule2 } from "./adaptive.ts";
import { isCorrect } from "./grade.ts";
import type { SATAnswer, SATForm, SATFormKey, SATPracticeTest, SATScore, SATSection } from "./types.ts";

export type SATStageKey = "rw.m1" | "rw.m2" | "math.m1" | "math.m2";
export const STAGES: SATStageKey[] = ["rw.m1", "rw.m2", "math.m1", "math.m2"];

/** Submissions up to this long after a module's deadline (a slow network, a
 *  suspended tab) are accepted normally; later ones are accepted and marked
 *  overtime. Nothing is ever rejected: the student's work is kept. */
export const GRACE_MS = 90_000;

export type StageResult = { correct: number; total: number; answered: number; overtime: boolean; submittedAt: number };

export type SATSession = {
  version: 1;
  id: string;
  uid: string;
  kind: "adaptive" | "practice";
  title: string;
  testNo: number | null;
  createdAt: number;
  /** Question ids per stage. An adaptive Module 2 is filled in at routing time. */
  plan: Partial<Record<SATStageKey, string[]>>;
  /** Adaptive only: both Module 2 variants, fixed when the form was assembled. */
  variants: Partial<Record<SATSection, { lower: string[]; upper: string[] }>>;
  routed: Partial<Record<SATSection, "lower" | "upper">>;
  minutes: Record<SATStageKey, number>;
  /** Index into STAGES; STAGES.length once finished. */
  current: number;
  /** When the current module's clock started; null during the break and once finished. */
  stageStartedAt: number | null;
  breakUntil: number | null;
  answers: Record<string, string>;
  flagged: string[];
  results: Partial<Record<SATStageKey, StageResult>>;
  score: SATScore | null;
  /** Why no score is shown, when score is null after finishing. */
  scoreNote: string | null;
  finishedAt: number | null;
  assignmentId: string | null;
};

type Ids = { id: string; uid: string; now: number; assignmentId?: string | null };

export const sectionOf = (k: SATStageKey): SATSection => (k.startsWith("rw") ? "rw" : "math");

/** Practice-test items have no College Board Question ID; their identity is their place in the paper. */
export function practiceQuestionId(testNo: number, section: SATSection, module: 1 | 2, qnum: number): string {
  return `pt${testNo}-${section}-m${module}-q${qnum}`;
}

function base(ids: Ids, kind: SATSession["kind"], title: string, testNo: number | null,
  plan: SATSession["plan"], variants: SATSession["variants"], minutes: SATSession["minutes"]): SATSession {
  return {
    version: 1, id: ids.id, uid: ids.uid, kind, title, testNo, createdAt: ids.now,
    plan, variants, routed: {}, minutes, current: 0, stageStartedAt: ids.now, breakUntil: null,
    answers: {}, flagged: [], results: {}, score: null, scoreNote: null, finishedAt: null,
    assignmentId: ids.assignmentId ?? null,
  };
}

export function startAdaptive(form: SATForm, ids: Ids): SATSession {
  const pick = (k: SATFormKey) => form.sets[k].map((q) => q.id);
  return base(ids, "adaptive", "Adaptive mock exam", null,
    { "rw.m1": pick("rw.m1"), "math.m1": pick("math.m1") },
    {
      rw: { lower: pick("rw.m2.lower"), upper: pick("rw.m2.upper") },
      math: { lower: pick("math.m2.lower"), upper: pick("math.m2.upper") },
    },
    { "rw.m1": BLUEPRINT.rw.minutes, "rw.m2": BLUEPRINT.rw.minutes, "math.m1": BLUEPRINT.math.minutes, "math.m2": BLUEPRINT.math.minutes });
}

export type TimedPracticeTest = SATPracticeTest & { minutes: Record<SATSection, [number, number]> };

export function startPractice(test: TimedPracticeTest, ids: Ids): SATSession {
  const plan: SATSession["plan"] = {};
  for (const k of STAGES) {
    const section = sectionOf(k);
    const module: 1 | 2 = k.endsWith("m1") ? 1 : 2;
    plan[k] = test.questions
      .filter((q) => q.section === section && q.module === module)
      .sort((a, b) => a.qnum - b.qnum)
      .map((q) => practiceQuestionId(test.testNo, section, module, q.qnum));
  }
  return base(ids, "practice", `Official Practice Test ${test.testNo}`, test.testNo, plan, {}, {
    "rw.m1": test.minutes.rw[0], "rw.m2": test.minutes.rw[1],
    "math.m1": test.minutes.math[0], "math.m2": test.minutes.math[1],
  });
}

export function currentStage(s: SATSession): SATStageKey | null {
  return STAGES[s.current] ?? null;
}

export function stageDeadline(s: SATSession): number | null {
  const k = currentStage(s);
  return k && s.stageStartedAt !== null ? s.stageStartedAt + s.minutes[k] * 60_000 : null;
}

export function isOnBreak(s: SATSession): boolean {
  return currentStage(s) !== null && s.stageStartedAt === null;
}

/** Leave the break early and start the next module's clock now. */
export function beginStage(s: SATSession, now: number): SATSession {
  if (!isOnBreak(s)) return s;
  return { ...s, stageStartedAt: now, breakUntil: null };
}

/** A break that has run out started the next module when it ended — not when the student came back. */
export function settleBreak(s: SATSession, now: number): SATSession {
  if (!isOnBreak(s) || s.breakUntil === null || now < s.breakUntil) return s;
  return beginStage(s, s.breakUntil);
}

/** Keep only answers to the module being sat; a client cannot write into another module. */
export function saveAnswers(s: SATSession, answers: Record<string, string>, flagged: string[]): SATSession {
  const k = currentStage(s);
  if (!k || s.stageStartedAt === null) return s;
  const allowed = new Set(s.plan[k] ?? []);
  const next = { ...s.answers };
  for (const [id, v] of Object.entries(answers)) {
    if (!allowed.has(id)) continue;
    if (typeof v === "string" && v.trim()) next[id] = v.trim().slice(0, 12);
    else delete next[id];
  }
  return {
    ...s,
    answers: next,
    flagged: [...s.flagged.filter((id) => !allowed.has(id)), ...flagged.filter((id) => allowed.has(id))],
  };
}

export function submitStage(
  s: SATSession, answers: Record<string, string>, flagged: string[], now: number,
  answerOf: (id: string) => SATAnswer | null,
): SATSession {
  const k = currentStage(s);
  if (!k || s.stageStartedAt === null) return s; // finished, or on the break: nothing to submit
  const saved = saveAnswers(s, answers, flagged);
  const ids = saved.plan[k] ?? [];
  let correct = 0;
  let answered = 0;
  for (const id of ids) {
    const response = saved.answers[id];
    if (response) answered++;
    const key = answerOf(id);
    if (key && isCorrect(key, response)) correct++;
  }
  const deadline = saved.stageStartedAt! + saved.minutes[k] * 60_000;
  const out: SATSession = {
    ...saved,
    plan: { ...saved.plan },
    routed: { ...saved.routed },
    results: { ...saved.results, [k]: { correct, total: ids.length, answered, overtime: now > deadline + GRACE_MS, submittedAt: now } },
    current: s.current + 1,
  };
  const section = sectionOf(k);
  if (s.kind === "adaptive" && k.endsWith("m1")) {
    const route = routeModule2(section, correct);
    out.routed[section] = route;
    out.plan[section === "rw" ? "rw.m2" : "math.m2"] = saved.variants[section]?.[route] ?? [];
  }
  if (!STAGES[out.current]) {
    out.stageStartedAt = null;
    out.finishedAt = now;
  } else if (k === "rw.m2") {
    out.stageStartedAt = null;
    out.breakUntil = now + BLUEPRINT.breakMinutes * 60_000;
  } else {
    out.stageStartedAt = now;
  }
  return out;
}

export function rawBySection(s: SATSession): Record<SATSection, number> {
  const c = (k: SATStageKey) => s.results[k]?.correct ?? 0;
  return { rw: c("rw.m1") + c("rw.m2"), math: c("math.m1") + c("math.m2") };
}

export type DomainRow = { domain: string; correct: number; total: number };

/** Accuracy per College Board domain, in first-seen order. */
export function domainBreakdown(items: { domain: string; correct: boolean }[]): DomainRow[] {
  const rows = new Map<string, DomainRow>();
  for (const it of items) {
    const row = rows.get(it.domain) ?? { domain: it.domain, correct: 0, total: 0 };
    row.total++;
    if (it.correct) row.correct++;
    rows.set(it.domain, row);
  }
  return [...rows.values()];
}
```

- [ ] **Step 4: Write `drills.ts`**

```ts
// src/lib/sat/drills.ts
//
// Drills (spec 4.3): a practice set drawn from the question bank by section,
// domain, skill and difficulty, answered one question at a time with the
// official rationale shown straight after. The FIRST answer to a question is
// the one recorded — re-answering after seeing the rationale changes nothing.
import { filterQuestions, type SATFilter } from "./bank.ts";
import { isCorrect } from "./grade.ts";
import type { Rng } from "./forms.ts";
import type { SATAnswer, SATQuestion } from "./types.ts";

export const DRILL_MIN = 5;
export const DRILL_MAX = 30;

export type SATDrill = {
  version: 1;
  id: string;
  uid: string;
  kind: "drill";
  title: string;
  createdAt: number;
  filter: SATFilter;
  questionIds: string[];
  answers: Record<string, string>;
  checked: Record<string, boolean>;
  finishedAt: number | null;
  assignmentId: string | null;
};

const SECTION_LABEL = { rw: "Reading and Writing", math: "Math" } as const;
const DIFFICULTY_LABEL = { E: "Easy", M: "Medium", H: "Hard" } as const;

export function drillTitle(f: SATFilter): string {
  const parts = [
    f.section ? SECTION_LABEL[f.section] : "Mixed",
    f.skill ?? f.domain,
    f.difficulty ? DIFFICULTY_LABEL[f.difficulty] : null,
  ].filter(Boolean);
  return `${parts.join(" · ")} drill`;
}

export function startDrill(
  bank: SATQuestion[], filter: SATFilter, count: number, rng: Rng,
  ids: { id: string; uid: string; now: number; assignmentId?: string | null },
): SATDrill {
  const pool = filterQuestions(bank, filter);
  if (!pool.length) throw new Error("No questions match that drill.");
  const n = Math.min(Math.max(Math.round(count) || DRILL_MIN, DRILL_MIN), DRILL_MAX, pool.length);
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    version: 1, id: ids.id, uid: ids.uid, kind: "drill", title: drillTitle(filter), createdAt: ids.now,
    filter, questionIds: order.slice(0, n).map((q) => q.id), answers: {}, checked: {}, finishedAt: null,
    assignmentId: ids.assignmentId ?? null,
  };
}

export function checkDrillAnswer(
  d: SATDrill, questionId: string, response: string,
  answerOf: (id: string) => SATAnswer | null, now: number,
): { drill: SATDrill; correct: boolean } {
  if (!d.questionIds.includes(questionId)) throw new Error("That question is not part of this drill.");
  if (questionId in d.checked) return { drill: d, correct: d.checked[questionId] };
  const key = answerOf(questionId);
  const correct = !!key && isCorrect(key, response);
  const drill: SATDrill = {
    ...d,
    answers: { ...d.answers, [questionId]: response.trim().slice(0, 12) },
    checked: { ...d.checked, [questionId]: correct },
  };
  if (drill.questionIds.every((id) => id in drill.checked)) drill.finishedAt = now;
  return { drill, correct };
}
```

- [ ] **Step 5: Run the tests, typecheck, wire the script**

Run: `node --no-warnings --experimental-strip-types scripts/test-sat-session.mjs` → `sat-session tests passed`. Append the script to `test:sat`. `npm run typecheck` → clean. `npm run test:sat` → every SAT script passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sat/session.ts src/lib/sat/drills.ts scripts/test-sat-session.mjs package.json
git commit -m "feat(sat): server-authoritative sitting and drill state transitions"
```

---

### Task 3: Server views, storage and access

**Files:**
- Create: `src/lib/sat/client-types.ts`, `src/lib/sat/serve.ts`, `src/lib/sat/store.ts`, `src/lib/sat/access.ts`

**Interfaces:**
- Consumes: Task 1–2 modules; `loadQuestionBank`, `loadPracticeTests`, `practiceTest` (`./bank.ts`); `scoreOfficial`, `scoreEstimated` (`./scoring.ts`); `ROUTING_DISCLOSURE` (`./adaptive.ts`); `readFreshJson`, `writeFreshJson` (`@/lib/exam-lab/storage-fresh`); `resolveCourseAccess` (`@/lib/portal/course-access`); `isAdmin`, `isStaff`, `PortalUser` (`@/lib/edu/auth`); `visibleClassIdsForUid` (`@/lib/portal/timetable`); `createAdminClient` (`@/lib/supabase/admin`).
- Produces (client-types.ts): `PublicQuestion`, `ReviewItem`, `SATReport`, `SessionState`, `DrillState`, `SessionSummary`, `AssignmentView`.
- Produces (serve.ts): `answerOf(id)`, `publicQuestion(id, n)`, `reviewItem(id, response)`, `sessionState(s, now)`, `drillState(d, now)`, `finishSession(s)`, `summaryOf(doc)`, `practiceTestList()`, `hasConversionTables()`.
- Produces (store.ts): `loadDoc(uid, id)`, `saveDoc(doc)`, `listSummaries(uid)`; `SATDoc = SATSession | SATDrill`.
- Produces (access.ts): `satAccess(user)`, `canViewStudent(user, studentUid)`.

- [ ] **Step 1: Write `client-types.ts`** (types only — the browser's view of the API)

```ts
// src/lib/sat/client-types.ts
//
// The JSON the SAT API returns. TYPES ONLY: client components import from here
// and never from serve.ts / bank.ts, which carry the answer key.
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
```

- [ ] **Step 2: Write `serve.ts`**

```ts
// src/lib/sat/serve.ts
//
// SERVER-ONLY. Owns the answer key: resolves any question id (bank or
// practice test) and turns sessions into what the browser may see. Nothing
// here is imported by client code — see client-types.ts.
import { loadQuestionBank, loadPracticeTests, practiceTest } from "./bank.ts";
import { ROUTING_DISCLOSURE } from "./adaptive.ts";
import { answerText, isCorrect } from "./grade.ts";
import { scoreEstimated, scoreOfficial } from "./scoring.ts";
import {
  STAGES, currentStage, domainBreakdown, isOnBreak, practiceQuestionId, rawBySection, sectionOf, stageDeadline,
  type SATSession, type SATStageKey,
} from "./session.ts";
import type { SATDrill } from "./drills.ts";
import type { PublicQuestion, ReviewItem, SATReport, SessionState, DrillState, SessionSummary } from "./client-types.ts";
import type { SATAnswer, SATDifficulty, SATSection } from "./types.ts";

type Entry = {
  id: string; img: string; answer: SATAnswer; section: SATSection;
  domain: string | null; skill: string | null; difficulty: SATDifficulty | null;
  rationale: string | null; rationaleImg: string | null;
};

let INDEX: Map<string, Entry> | null = null;

function index(): Map<string, Entry> {
  if (INDEX) return INDEX;
  const m = new Map<string, Entry>();
  for (const q of loadQuestionBank()) {
    const rq = q as typeof q & { rationaleImg?: string };
    m.set(q.id, {
      id: q.id, img: q.img, answer: q.answer, section: q.section, domain: q.domain, skill: q.skill,
      difficulty: q.difficulty, rationale: q.rationale || null, rationaleImg: rq.rationaleImg ?? null,
    });
  }
  for (const t of loadPracticeTests()) {
    for (const q of t.questions) {
      const id = practiceQuestionId(t.testNo, q.section, q.module, q.qnum);
      m.set(id, { id, img: q.img, answer: q.answer, section: q.section, domain: null, skill: null, difficulty: null, rationale: null, rationaleImg: null });
    }
  }
  INDEX = m;
  return m;
}

export function answerOf(id: string): SATAnswer | null {
  return index().get(id)?.answer ?? null;
}

export function publicQuestion(id: string, n: number): PublicQuestion | null {
  const e = index().get(id);
  if (!e) return null;
  return { id, n, img: e.img, kind: e.answer.kind, section: e.section, domain: e.domain, skill: e.skill, difficulty: e.difficulty };
}

export function reviewItem(id: string, n: number, response: string | null): ReviewItem | null {
  const e = index().get(id);
  const pub = publicQuestion(id, n);
  if (!e || !pub) return null;
  return { ...pub, response, correct: isCorrect(e.answer, response), answer: answerText(e.answer), rationale: e.rationale, rationaleImg: e.rationaleImg };
}

/** True once at least one official conversion table has been ingested. */
export function hasConversionTables(): boolean {
  return loadPracticeTests().some((t) => Object.keys(t.conversion?.rw ?? {}).length && Object.keys(t.conversion?.math ?? {}).length);
}

export function practiceTestList(): { testNo: number; questions: number; timed: boolean }[] {
  return loadPracticeTests().map((t) => ({
    testNo: t.testNo,
    questions: t.questions.length,
    timed: !!(t as typeof t & { minutes?: unknown }).minutes,
  }));
}

const STAGE_LABEL: Record<SATStageKey, string> = {
  "rw.m1": "Reading and Writing · Module 1", "rw.m2": "Reading and Writing · Module 2",
  "math.m1": "Math · Module 1", "math.m2": "Math · Module 2",
};

/** Score a finished sitting. Official only from that test's own table (spec 10.5). */
export function finishSession(s: SATSession): SATSession {
  if (s.finishedAt === null || s.score) return s;
  const raw = rawBySection(s);
  if (s.kind === "practice" && s.testNo !== null) {
    const official = scoreOfficial(s.testNo, raw);
    return official
      ? { ...s, score: official, scoreNote: null }
      : { ...s, score: null, scoreNote: "This test's official conversion table is not loaded, so no score can be given." };
  }
  if (!hasConversionTables()) {
    return { ...s, score: null, scoreNote: "Estimated scores appear once the official conversion tables are loaded." };
  }
  return { ...s, score: scoreEstimated(raw), scoreNote: null };
}

function report(s: SATSession): SATReport {
  const review: ReviewItem[] = [];
  for (const k of STAGES) {
    (s.plan[k] ?? []).forEach((id, i) => {
      const item = reviewItem(id, i + 1, s.answers[id] ?? null);
      if (item) review.push(item);
    });
  }
  const sections: SATReport["sections"] = { rw: { correct: 0, total: 0 }, math: { correct: 0, total: 0 } };
  for (const k of STAGES) {
    const r = s.results[k];
    if (!r) continue;
    sections[sectionOf(k)].correct += r.correct;
    sections[sectionOf(k)].total += r.total;
  }
  return {
    kind: s.kind, title: s.title, score: s.score, scoreNote: s.scoreNote, sections, routed: s.routed,
    routingDisclosure: s.kind === "adaptive" ? ROUTING_DISCLOSURE : null,
    overtime: STAGES.some((k) => s.results[k]?.overtime),
    domains: domainBreakdown(review.filter((r) => r.domain).map((r) => ({ domain: r.domain!, correct: r.correct }))),
    review,
  };
}

export function sessionState(s: SATSession, now: number): SessionState {
  const k = currentStage(s);
  const base = { id: s.id, kind: s.kind, title: s.title, serverNow: now, answers: s.answers, flagged: s.flagged };
  if (!k) return { ...base, status: "finished", stage: null, breakUntil: null, report: report(s) };
  if (isOnBreak(s)) return { ...base, status: "break", stage: null, breakUntil: s.breakUntil, report: null };
  const ids = s.plan[k] ?? [];
  return {
    ...base, status: "running", breakUntil: null, report: null,
    stage: {
      key: k, label: STAGE_LABEL[k], index: s.current, minutes: s.minutes[k], deadline: stageDeadline(s)!,
      questions: ids.map((id, i) => publicQuestion(id, i + 1)).filter((q): q is PublicQuestion => !!q),
    },
  };
}

export function drillState(d: SATDrill, now: number): DrillState {
  const checked: DrillState["checked"] = {};
  d.questionIds.forEach((id, i) => {
    if (!(id in d.checked)) return;
    const item = reviewItem(id, i + 1, d.answers[id] ?? null);
    if (item) checked[id] = item;
  });
  return {
    id: d.id, kind: "drill", title: d.title, serverNow: now,
    questions: d.questionIds.map((id, i) => publicQuestion(id, i + 1)).filter((q): q is PublicQuestion => !!q),
    checked, finished: d.finishedAt !== null,
  };
}

export function summaryOf(doc: SATSession | SATDrill): SessionSummary {
  if (doc.kind === "drill") {
    const values = Object.values(doc.checked);
    return { id: doc.id, kind: "drill", title: doc.title, createdAt: doc.createdAt, finishedAt: doc.finishedAt, score: null,
      correct: values.filter(Boolean).length, total: doc.questionIds.length, assignmentId: doc.assignmentId };
  }
  const results = STAGES.map((k) => doc.results[k]).filter(Boolean);
  return { id: doc.id, kind: doc.kind, title: doc.title, createdAt: doc.createdAt, finishedAt: doc.finishedAt, score: doc.score,
    correct: results.reduce((n, r) => n + r!.correct, 0), total: results.reduce((n, r) => n + r!.total, 0), assignmentId: doc.assignmentId };
}

export { practiceTest };
```

- [ ] **Step 3: Write `store.ts`**

```ts
// src/lib/sat/store.ts
//
// SERVER-ONLY. One JSON document per sitting in the private portal-data
// bucket, plus a small per-student index of summaries. Each sitting has its
// own file, so a student's concurrent tabs never read-modify-write the same
// document as another sitting. Reads fail closed (storage-fresh.ts).
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import type { SATSession } from "./session.ts";
import type { SATDrill } from "./drills.ts";
import type { SessionSummary } from "./client-types.ts";
import { summaryOf } from "./serve.ts";

export type SATDoc = SATSession | SATDrill;

const BUCKET = "portal-data";
const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const docPath = (uid: string, id: string) => `sat/sessions/${uid}/${id}.json`;
const indexPath = (uid: string) => `sat/sessions/${uid}/index.json`;

export type LoadResult = { ok: true; doc: SATDoc | null } | { ok: false };

export async function loadDoc(uid: string, id: string): Promise<LoadResult> {
  if (!SAFE_ID.test(uid) || !SAFE_ID.test(id)) return { ok: true, doc: null };
  const r = await readFreshJson<SATDoc>(BUCKET, docPath(uid, id));
  if (!r.ok) return { ok: false };
  return { ok: true, doc: r.data && r.data.uid === uid ? r.data : null };
}

export async function listSummaries(uid: string): Promise<SessionSummary[] | null> {
  if (!SAFE_ID.test(uid)) return [];
  const r = await readFreshJson<{ items: SessionSummary[] }>(BUCKET, indexPath(uid));
  if (!r.ok) return null;
  return r.data?.items ?? [];
}

/** Save the document, then its summary. A failed index write leaves the
 *  sitting intact (it is the source of truth) and is retried on the next save. */
export async function saveDoc(doc: SATDoc): Promise<boolean> {
  if (!(await writeFreshJson(BUCKET, docPath(doc.uid, doc.id), doc))) return false;
  const current = await readFreshJson<{ items: SessionSummary[] }>(BUCKET, indexPath(doc.uid));
  if (!current.ok) return true;
  const items = (current.data?.items ?? []).filter((x) => x.id !== doc.id);
  items.unshift(summaryOf(doc));
  await writeFreshJson(BUCKET, indexPath(doc.uid), { items: items.slice(0, 300) });
  return true;
}
```

- [ ] **Step 4: Write `access.ts`**

```ts
// src/lib/sat/access.ts
//
// SERVER-ONLY. The SAT Lab is gated exactly like the physics tracks (spec 9):
// enrolment in a class whose year label names SAT grants it; staff always have it.
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isStaff, type PortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { visibleClassIdsForUid } from "@/lib/portal/timetable";

export async function satAccess(user: PortalUser): Promise<{ ok: boolean; isStaff: boolean }> {
  const access = await resolveCourseAccess(user);
  return { ok: access.isStaff || access.allowed.includes("SAT"), isStaff: access.isStaff };
}

/** Staff may open a student's sittings only for students in a class they can see. */
export async function canViewStudent(user: PortalUser, studentUid: string): Promise<boolean> {
  if (user.id === studentUid) return true;
  if (!isStaff(user.roles)) return false;
  if (isAdmin(user.roles)) return true;
  const classIds = new Set(await visibleClassIdsForUid(user.id, user.roles));
  if (!classIds.size) return false;
  const db = createAdminClient();
  const { data: student } = await db.from("edu_students").select("id").eq("profile_id", studentUid).maybeSingle();
  if (!student?.id) return false;
  const { data } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
  return (data ?? []).some((r) => classIds.has(r.class_id as string));
}
```

- [ ] **Step 5: Typecheck and prove the lookups against the real bank**

Run: `npm run typecheck` → clean.

`serve.ts` imports `@/` modules indirectly? It does not — it imports only `./*.ts` siblings, so it runs under Node:

```bash
node --no-warnings --experimental-strip-types -e "
import('./src/lib/sat/serve.ts').then((s) => {
  const any = 'ac472881';
  console.log(JSON.stringify(s.publicQuestion(any, 1)));
  console.log('answer hidden from public view:', !('answer' in s.publicQuestion(any, 1)));
  console.log('review:', JSON.stringify(s.reviewItem(any, 1, '403')).slice(0, 160));
  console.log('conversion tables loaded:', s.hasConversionTables());
});"
```

Expected: a public view with no `answer`/`rationale` keys; a review item with `correct: true`; `conversion tables loaded: false` until plan 2's Task 6 lands (then `true`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/sat/client-types.ts src/lib/sat/serve.ts src/lib/sat/store.ts src/lib/sat/access.ts
git commit -m "feat(sat): server views that hide the key, per-sitting storage, SAT access"
```

---

### Task 4: The SAT API

**Files:**
- Create: `src/app/api/sat/sessions/route.ts`
- Create: `src/app/api/sat/sessions/[id]/route.ts`

**Interfaces:**
- Consumes: Task 2–3; `assembleForm` (`@/lib/sat/forms`); `loadQuestionBank`; `getPortalUser`; Task 9's `markAssignment` / `listAssignments` are added later — this task leaves a single clearly marked integration point (see Step 1) that Task 9 fills.
- Produces:
  - `GET /api/sat/sessions` → `{ sessions: SessionSummary[], practiceTests: {testNo, questions, timed}[], conversionTables: boolean }`
  - `POST /api/sat/sessions` body `{ kind: "adaptive" } | { kind: "practice", testNo: number } | { kind: "drill", section?, domain?, skill?, difficulty?, count: number }` (+ optional `assignmentId`) → `{ id, kind }`
  - `GET /api/sat/sessions/[id]` (`?uid=` for staff viewing a student) → `SessionState | DrillState`
  - `POST /api/sat/sessions/[id]` body `{ action: "save", stage, answers, flagged } | { action: "submit", stage, answers, flagged } | { action: "begin" } | { action: "check", questionId, response }` (a `stage` that is no longer current → 409 `{ stale: true, state }`) → `SessionState | DrillState` (for `check`: `{ state: DrillState, item: ReviewItem }`)

- [ ] **Step 1: Write the collection route**

```ts
// src/app/api/sat/sessions/route.ts
import { NextResponse } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { assembleForm } from "@/lib/sat/forms";
import { loadQuestionBank } from "@/lib/sat/bank";
import { startAdaptive, startPractice, type TimedPracticeTest } from "@/lib/sat/session";
import { startDrill, DRILL_MAX, DRILL_MIN } from "@/lib/sat/drills";
import { hasConversionTables, practiceTest, practiceTestList } from "@/lib/sat/serve";
import { listSummaries, saveDoc } from "@/lib/sat/store";

export const runtime = "nodejs";

const newId = () => randomBytes(12).toString("base64url");
// crypto-backed Rng: forms and drills must not be predictable from the client.
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adaptive"), assignmentId: z.string().max(64).optional() }),
  z.object({ kind: z.literal("practice"), testNo: z.number().int().min(1).max(99), assignmentId: z.string().max(64).optional() }),
  z.object({
    kind: z.literal("drill"),
    section: z.enum(["rw", "math"]).optional(),
    domain: z.string().max(40).optional(),
    skill: z.string().max(120).optional(),
    difficulty: z.enum(["E", "M", "H"]).optional(),
    count: z.number().int().min(DRILL_MIN).max(DRILL_MAX),
    assignmentId: z.string().max(64).optional(),
  }),
]);

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const access = await satAccess(user);
  if (!access.ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const sessions = await listSummaries(user.id);
  if (sessions === null) return NextResponse.json({ error: "Your SAT history couldn't be loaded. Please try again." }, { status: 503 });
  return NextResponse.json({ sessions, practiceTests: practiceTestList(), conversionTables: hasConversionTables() });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const access = await satAccess(user);
  if (!access.ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data;
  const ids = { id: newId(), uid: user.id, now: Date.now(), assignmentId: b.assignmentId ?? null };

  let doc;
  if (b.kind === "adaptive") {
    doc = startAdaptive(assembleForm(loadQuestionBank(), rng), ids);
  } else if (b.kind === "practice") {
    const test = practiceTest(b.testNo) as TimedPracticeTest | null;
    if (!test) return NextResponse.json({ error: "That practice test is not available." }, { status: 404 });
    if (!test.minutes) return NextResponse.json({ error: "That practice test's timings are not loaded." }, { status: 409 });
    doc = startPractice(test, ids);
  } else {
    try {
      doc = startDrill(loadQuestionBank(), { section: b.section, domain: b.domain as never, skill: b.skill, difficulty: b.difficulty }, b.count, rng, ids);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  if (!(await saveDoc(doc))) return NextResponse.json({ error: "Couldn't start the sitting. Please try again." }, { status: 503 });
  // ASSIGNMENT HOOK (Task 9): mark ids.assignmentId in_progress with sessionId doc.id.
  return NextResponse.json({ id: doc.id, kind: doc.kind });
}
```

- [ ] **Step 2: Write the item route**

```ts
// src/app/api/sat/sessions/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { canViewStudent, satAccess } from "@/lib/sat/access";
import { beginStage, isStaleStage, saveAnswers, settleBreak, submitStage, type SATSession } from "@/lib/sat/session";
import { checkDrillAnswer, type SATDrill } from "@/lib/sat/drills";
import { answerOf, drillState, finishSession, reviewItem, sessionState } from "@/lib/sat/serve";
import { loadDoc, saveDoc } from "@/lib/sat/store";

export const runtime = "nodejs";

const answersSchema = z.record(z.string().max(80), z.string().max(12)).refine((a) => Object.keys(a).length <= 60);
const flaggedSchema = z.array(z.string().max(80)).max(60);
const stageSchema = z.enum(["rw.m1", "rw.m2", "math.m1", "math.m2"]);
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), stage: stageSchema, answers: answersSchema, flagged: flaggedSchema }),
  z.object({ action: z.literal("submit"), stage: stageSchema, answers: answersSchema, flagged: flaggedSchema }),
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("check"), questionId: z.string().max(80), response: z.string().min(1).max(12) }),
]);

const unavailable = () => NextResponse.json({ error: "Your sitting couldn't be loaded. Nothing has been lost — please try again." }, { status: 503 });

function stateOf(doc: SATSession | SATDrill, now: number) {
  return doc.kind === "drill" ? drillState(doc, now) : sessionState(doc, now);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  const ownerUid = new URL(req.url).searchParams.get("uid") || user.id;
  if (ownerUid === user.id) {
    if (!(await satAccess(user)).ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  } else if (!(await canViewStudent(user, ownerUid))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const loaded = await loadDoc(ownerUid, id);
  if (!loaded.ok) return unavailable();
  if (!loaded.doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const now = Date.now();
  let doc = loaded.doc;
  if (doc.kind !== "drill" && ownerUid === user.id) {
    const settled = settleBreak(doc, now);
    if (settled !== doc && (await saveDoc(settled))) doc = settled;
  }
  // Staff viewing an unfinished sitting see only the finished-report shape when it exists.
  return NextResponse.json(stateOf(doc, now));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!(await satAccess(user)).ok) return NextResponse.json({ error: "The SAT Lab is not part of your courses." }, { status: 403 });
  const { id } = await params;
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const loaded = await loadDoc(user.id, id);
  if (!loaded.ok) return unavailable();
  if (!loaded.doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const now = Date.now();
  const a = parsed.data;
  const doc = loaded.doc;

  if (doc.kind === "drill") {
    if (a.action !== "check") return NextResponse.json({ error: "Drills are answered one question at a time." }, { status: 400 });
    let result;
    try {
      result = checkDrillAnswer(doc, a.questionId, a.response, answerOf, now);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    if (!(await saveDoc(result.drill))) return unavailable();
    // ASSIGNMENT HOOK (Task 9): when result.drill.finishedAt, mark its assignment done.
    const n = result.drill.questionIds.indexOf(a.questionId) + 1;
    return NextResponse.json({ state: drillState(result.drill, now), item: reviewItem(a.questionId, n, result.drill.answers[a.questionId] ?? null) });
  }

  let next: SATSession = settleBreak(doc, now);
  // A stale tab, a double click or a retried request names a module that has
  // already ended: never apply it to the module the student is now in.
  if ((a.action === "save" || a.action === "submit") && isStaleStage(next, a.stage)) {
    if (next !== doc) await saveDoc(next);
    return NextResponse.json({ stale: true, state: sessionState(next, now) }, { status: 409 });
  }
  if (a.action === "save") next = saveAnswers(next, a.stage, a.answers, a.flagged);
  else if (a.action === "submit") next = finishSession(submitStage(next, a.stage, a.answers, a.flagged, now, answerOf));
  else if (a.action === "begin") next = beginStage(next, now);
  else return NextResponse.json({ error: "Only drills are checked question by question." }, { status: 400 });

  if (next !== doc && !(await saveDoc(next))) return unavailable();
  // ASSIGNMENT HOOK (Task 9): when next.finishedAt, mark its assignment done.
  return NextResponse.json(sessionState(next, now));
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck` → clean; `npm run build` → passes (a dev server may be running on port 3005 in the same folder; the build writes separately).

- [ ] **Step 4: Prove the key never leaves the server**

The client bundle must not contain the bank. After `npm run build`:

```bash
grep -rl "ac472881" .next/static || echo "bank id not in any client chunk"
grep -rl "Linear equations in one variable" .next/static || echo "bank text not in any client chunk"
```

Expected: both `... not in any client chunk`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sat/sessions/route.ts "src/app/api/sat/sessions/[id]/route.ts"
git commit -m "feat(sat): session API — server clock, server routing, server grading"
```

---

### Task 5: Images — the `sat/` prefix and local development crops

**Files:**
- Modify: `src/app/api/exam-lab/asset/route.ts`
- Create: `src/app/api/sat/local-image/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: plan 2 Task 13's `courseOf` (`sat/` → `"SAT"`).
- Produces: in development with `SAT_LOCAL_CROPS=1`, `/api/exam-lab/asset` returns `/api/sat/local-image?path=<path>` for `sat/` paths instead of signing them; `/api/sat/local-image` serves `scripts/exam-lab/ingest-sat/out/crops/<path without "sat/">` as `image/jpeg`.

Why: the live upload has not run (it needs the owner's credentials and authorisation), so the bucket holds no `sat/` objects. Developers and the owner can still test every screen against the real crops on disk. In production the flag is ignored and the route 404s.

- [ ] **Step 1: Short-circuit `sat/` paths in development**

In `src/app/api/exam-lab/asset/route.ts`, after the course check and before `createSignedUrls`:

```ts
  // Local development only: the SAT crops exist on disk but have not been
  // uploaded yet (the live upload needs the owner's credentials). Point sat/
  // paths at the dev-only local image route instead of signing them.
  const localSat = process.env.NODE_ENV === "development" && process.env.SAT_LOCAL_CROPS === "1";
  const toSign = localSat ? parsed.data.paths.filter((p) => !p.startsWith("sat/")) : parsed.data.paths;
  const urls: Record<string, string> = {};
  if (localSat) {
    for (const p of parsed.data.paths) if (p.startsWith("sat/")) urls[p] = `/api/sat/local-image?path=${encodeURIComponent(p)}`;
  }
  if (!toSign.length) return NextResponse.json({ urls }, { status: 200 });
```

and sign `toSign` instead of `parsed.data.paths`, merging into the same `urls` object (remove the later `const urls` declaration).

- [ ] **Step 2: Write the local image route**

```ts
// src/app/api/sat/local-image/route.ts
//
// DEVELOPMENT ONLY. Serves SAT crops from the local pipeline output so the SAT
// Lab can be exercised before the live upload. 404s unless NODE_ENV is
// development AND SAT_LOCAL_CROPS=1, and still requires a signed-in user.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";

export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "scripts", "exam-lab", "ingest-sat", "out", "crops");
const SAFE = /^sat\/(?:rw|math|tests\/\d{1,2})\/[A-Za-z0-9_-]{1,64}\.jpg$/;

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.SAT_LOCAL_CROPS !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!(await getPortalUser())) return new NextResponse("Sign in", { status: 401 });
  const p = new URL(req.url).searchParams.get("path") || "";
  if (!SAFE.test(p)) return new NextResponse("Not found", { status: 404 });
  const file = path.join(ROOT, ...p.slice("sat/".length).split("/"));
  if (!file.startsWith(ROOT + path.sep)) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await readFile(file);
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
```

Practice-test crops must be written by plan 2's Task 5 under `out/crops/tests/<testNo>/…` mirroring their `sat/tests/<testNo>/…` bucket paths so this one rule serves both (plan 2 ledger ruling).

- [ ] **Step 3: Document the flag**

Append to `.env.example`:

```
# Local development only: serve SAT question images from the local crop folder
# (scripts/exam-lab/ingest-sat/out/crops) instead of the storage bucket, before
# the live SAT upload has run. Ignored in production.
SAT_LOCAL_CROPS=
```

- [ ] **Step 4: Verify**

With the dev server running and `SAT_LOCAL_CROPS=1` in `.env.local`, signed in: `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3005/api/sat/local-image?path=sat/math/ac472881.jpg" -b <session cookie>` → `200`; `path=sat/../../.env.local` → `404`; without the flag → `404`. `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/exam-lab/asset/route.ts src/app/api/sat/local-image/route.ts .env.example
git commit -m "feat(sat): gate sat/ images to the SAT course; dev-only local crop serving"
```

---

### Task 6: Sitting UI — runner, grid-in pad, score report

**Files:**
- Create: `src/components/sat/use-signed-images.ts`, `src/components/sat/spr-pad.tsx`, `src/components/sat/score-report.tsx`, `src/components/sat/sat-runner.tsx`

**Interfaces:**
- Consumes: `SessionState`, `PublicQuestion`, `ReviewItem`, `SATReport` from `@/lib/sat/client-types` (types only); `validateSPR`, `SPR_MAX_NEGATIVE` from `@/lib/sat/grade` (pure, no answer data — safe in the client); `formatPk` from `@/lib/portal/pk-time`; the Task 4 API.
- Produces: `useSignedImages(paths: string[]): { urls: Record<string,string>; error: string | null }`; `<SprPad value onChange disabled />`; `<ScoreReport report={SATReport} />`; `<SatRunner sessionId={string} />`.

Behaviour the runner must have (each is an acceptance check in Step 6):
1. Loads `GET /api/sat/sessions/[id]`; computes `skew = serverNow - Date.now()`; remaining = `deadline - (Date.now() + skew)`.
2. **Expired on load → no auto-submit.** If remaining ≤ 0 on the first computation after a load, show a banner "Time is up for this module. Your saved answers are kept — submit the module to continue." with a Submit button. Only a clock that crosses zero *while the module is on screen* auto-submits (with the answers in state).
3. Autosaves: 1.5 s after the last change, and every 30 s, `POST {action:"save", answers, flagged}`; shows "Saved" / "Saving…" / "Not saved — retrying"; a failed save never discards local answers.
4. Navigator: one numbered cell per question, marked answered / flagged / current; "Mark for review" toggle.
5. MCQ: four buttons A–D (the choices are printed in the image). Grid-in: `SprPad`.
6. Submit: inline confirmation when any question is unanswered ("3 questions are unanswered. Submit Module 1 anyway?"); never `window.confirm`.
7. Break screen: countdown to `breakUntil`, "Start Math now" → `POST {action:"begin"}`; at zero, reload state (the server settles the break).
8. Finished → `<ScoreReport>`.
9. The timer turns amber at 5 minutes remaining, never red from the start.

- [ ] **Step 1: `use-signed-images.ts`**

```ts
"use client";
import { useEffect, useState } from "react";

/** Signs private SAT image paths in batches of 80 via /api/exam-lab/asset. */
export function useSignedImages(paths: string[]): { urls: Record<string, string>; error: string | null } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    const todo = Array.from(new Set(paths.filter(Boolean)));
    if (!todo.length) return;
    (async () => {
      try {
        const out: Record<string, string> = {};
        for (let i = 0; i < todo.length; i += 80) {
          const res = await fetch("/api/exam-lab/asset", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: todo.slice(i, i + 80) }),
          });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || "Images couldn't be loaded.");
          Object.assign(out, j.urls || {});
        }
        if (alive) { setUrls(out); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { urls, error };
}
```

- [ ] **Step 2: `spr-pad.tsx`**

```tsx
"use client";
import { validateSPR, SPR_MAX_NEGATIVE } from "@/lib/sat/grade";

/** Grid-in answer box with the digital SAT's entry rules and a live preview. */
export function SprPad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const check = value ? validateSPR(value) : null;
  return (
    <div className="max-w-xs">
      <label className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-fog" htmlFor="spr">Your answer</label>
      <input
        id="spr" inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled}
        value={value} maxLength={SPR_MAX_NEGATIVE}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9./-]/g, ""))}
        className="w-full rounded-xl border border-white/15 bg-void px-4 py-3 font-mono text-lg text-ice focus:border-cyan focus:outline-none disabled:opacity-60"
      />
      <p className={"mt-1.5 text-xs " + (check && !check.ok ? "text-amber-200" : "text-dust")}>
        {check && !check.ok ? check.reason : "Up to 5 characters (6 if negative). Fractions like 3/2 or decimals like 1.5; no mixed numbers."}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: `score-report.tsx`**

```tsx
"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import type { SATReport } from "@/lib/sat/client-types";
import { useSignedImages } from "./use-signed-images";

const SECTION = { rw: "Reading and Writing", math: "Math" } as const;
const DOMAIN_LABEL: Record<string, string> = {
  "information-ideas": "Information and Ideas", "craft-structure": "Craft and Structure",
  "expression-ideas": "Expression of Ideas", "standard-english": "Standard English Conventions",
  algebra: "Algebra", "advanced-math": "Advanced Math", psda: "Problem-Solving and Data Analysis",
  "geometry-trig": "Geometry and Trigonometry",
};

export function ScoreReport({ report }: { report: SATReport }) {
  const [open, setOpen] = useState<string | null>(null);
  const { urls } = useSignedImages(report.review.flatMap((r) => [r.img, r.rationaleImg ?? ""]));
  const s = report.score;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-space/60 p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-fog">{report.title}</p>
        {s ? (
          <>
            <p className="mt-2 font-display text-4xl text-ice">{s.lower}–{s.upper}</p>
            <p className={"mt-1 text-sm " + (s.authority === "official" ? "text-emerald2" : "text-amber-200")}>
              {s.authority === "official" ? `Official score range · Practice Test ${s.testNo}` : "Estimated score range — not an official SAT score"}
            </p>
            {s.authority === "estimated" ? <p className="mt-2 max-w-2xl text-xs text-dust">{s.basis}</p> : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-fog">{report.scoreNote}</p>
        )}
        {report.overtime ? <p className="mt-3 text-xs text-amber-200">At least one module was submitted after its time limit.</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {(["rw", "math"] as const).map((k) => (
          <div key={k} className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-4">
            <p className="text-xs uppercase tracking-widest text-dust">{SECTION[k]}</p>
            <p className="mt-1 font-display text-2xl text-ice">{report.sections[k].correct}/{report.sections[k].total}</p>
            {report.routed[k] ? <p className="mt-1 text-xs text-fog">Module 2: {report.routed[k] === "upper" ? "harder" : "easier"} form</p> : null}
          </div>
        ))}
      </section>

      {report.routingDisclosure ? (
        <p className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-dust"><Info size={14} className="mt-0.5 shrink-0" />{report.routingDisclosure}</p>
      ) : null}

      {report.domains.length ? (
        <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
          <p className="mb-3 text-sm font-semibold text-ice">By domain</p>
          <ul className="space-y-2">
            {report.domains.map((d) => (
              <li key={d.domain} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-fog">{DOMAIN_LABEL[d.domain] ?? d.domain}</span>
                <span className="shrink-0 font-mono text-ice">{d.correct}/{d.total}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
        <p className="mb-3 text-sm font-semibold text-ice">Review every question</p>
        <ol className="space-y-2">
          {report.review.map((r) => (
            <li key={r.id} className="rounded-xl border border-white/10">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
                {r.correct ? <CheckCircle2 size={16} className="text-emerald2" /> : <XCircle size={16} className="text-signal" />}
                <span className="text-fog">{SECTION[r.section]} · Q{r.n}</span>
                <span className="ml-auto font-mono text-xs text-dust">You: {r.response ?? "—"} · Answer: {r.answer}</span>
              </button>
              {open === r.id ? (
                <div className="space-y-3 border-t border-white/10 p-3">
                  {urls[r.img] ? <img src={urls[r.img]} alt={`Question ${r.n}`} className="w-full rounded-lg bg-white" /> : null}
                  {r.rationaleImg && urls[r.rationaleImg] ? <img src={urls[r.rationaleImg]} alt="Official rationale" className="w-full rounded-lg bg-white" />
                    : r.rationale ? <p className="whitespace-pre-line text-sm text-fog">{r.rationale}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: `sat-runner.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Coffee, Flag, Loader2 } from "lucide-react";
import type { SessionState } from "@/lib/sat/client-types";
import { SprPad } from "./spr-pad";
import { ScoreReport } from "./score-report";
import { useSignedImages } from "./use-signed-images";

type SaveState = "idle" | "saving" | "saved" | "failed";
const fmt = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export function SatRunner({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [save, setSave] = useState<SaveState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const skew = useRef(0);
  const expiredOnLoad = useRef(false);
  const dirty = useRef(false);

  const apply = useCallback((s: SessionState) => {
    skew.current = s.serverNow - Date.now();
    setState(s);
    setAnswers(s.answers);
    setFlagged(s.flagged);
    setIdx(0);
    setConfirming(false);
    expiredOnLoad.current = !!s.stage && s.stage.deadline <= s.serverNow;
    dirty.current = false;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sat/sessions/${sessionId}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "This sitting couldn't be loaded.");
      apply(j as SessionState);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sessionId, apply]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const post = useCallback(async (body: object) => {
    const res = await fetch(`/api/sat/sessions/${sessionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    // The module already ended (another tab, a double click): adopt the server's state.
    if (res.status === 409 && j.state) return j.state as SessionState;
    if (!res.ok) throw new Error(j.error || "Please try again.");
    return j as SessionState;
  }, [sessionId]);

  const doSave = useCallback(async () => {
    if (!state?.stage || !dirty.current) return;
    setSave("saving");
    try {
      const s = await post({ action: "save", stage: state.stage.key, answers, flagged });
      if (s.stage?.key !== state.stage.key) apply(s); // the module moved on elsewhere
      dirty.current = false; setSave("saved");
    }
    catch { setSave("failed"); }
  }, [state, answers, flagged, post]);

  // Autosave: shortly after a change, and every 30 s as a backstop.
  useEffect(() => { if (!dirty.current) return; const t = setTimeout(() => void doSave(), 1500); return () => clearTimeout(t); }, [answers, flagged, doSave]);
  useEffect(() => { const t = setInterval(() => void doSave(), 30_000); return () => clearInterval(t); }, [doSave]);

  const submit = useCallback(async () => {
    setBusy(true);
    try { apply(await post({ action: "submit", stage: state?.stage?.key, answers, flagged })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [answers, flagged, post, apply, state]);

  const remaining = state?.stage ? state.stage.deadline - (now + skew.current) : 0;
  const expired = !!state?.stage && remaining <= 0;

  // Auto-submit only when the clock runs out WHILE the module is on screen.
  useEffect(() => {
    if (state?.status === "running" && expired && !expiredOnLoad.current && !busy) void submit();
  }, [expired, state, busy, submit]);

  // Break: reload when it ends (the server starts Math at the break's end).
  useEffect(() => {
    if (state?.status === "break" && state.breakUntil && now + skew.current >= state.breakUntil) void load();
  }, [state, now, load]);

  const questions = useMemo(() => state?.stage?.questions ?? [], [state]);
  const { urls, error: imgError } = useSignedImages(questions.map((q) => q.img));

  if (error && !state) return <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">{error} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></p>;
  if (!state) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading your sitting…</p>;
  if (state.status === "finished" && state.report) return <ScoreReport report={state.report} />;

  if (state.status === "break") {
    const left = (state.breakUntil ?? 0) - (now + skew.current);
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
        <Coffee className="mx-auto text-cyan" />
        <p className="mt-3 font-display text-xl text-ice">Break · {fmt(left)}</p>
        <p className="mt-2 text-sm text-fog">Reading and Writing is done. Math begins when the break ends.</p>
        <button disabled={busy} onClick={async () => { setBusy(true); try { apply(await post({ action: "begin" })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }} className="btn-primary mt-5 !px-4 !py-2 text-sm">Start Math now</button>
      </div>
    );
  }

  const stage = state.stage!;
  const q = questions[idx];
  const unanswered = questions.filter((x) => !answers[x.id]).length;
  const setAnswer = (v: string) => { dirty.current = true; setAnswers((a) => ({ ...a, [q.id]: v })); };
  const toggleFlag = () => { dirty.current = true; setFlagged((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id])); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-ice">{stage.label}</p><p className="text-xs text-dust">{state.title}</p></div>
        <span className={"ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm " + (remaining <= 5 * 60_000 ? "border-amber-300/40 text-amber-200" : "border-white/15 text-ice")}><Clock size={14} /> {fmt(remaining)}</span>
        <span className="text-xs text-dust">{save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "failed" ? "Not saved — retrying" : ""}</span>
      </div>

      {expired ? <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.05] p-3 text-sm text-amber-100">Time is up for this module. Your saved answers are kept — submit the module to continue.</p> : null}
      {imgError ? <p className="text-sm text-signal">{imgError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
          <div className="flex items-center gap-2 text-sm text-fog">
            <span className="font-display text-ice">Question {q.n} of {questions.length}</span>
            <button type="button" onClick={toggleFlag} className={"ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs " + (flagged.includes(q.id) ? "border-amber-300/50 text-amber-200" : "border-white/15 text-dust")}><Flag size={12} /> {flagged.includes(q.id) ? "Marked for review" : "Mark for review"}</button>
          </div>
          {urls[q.img] ? <img src={urls[q.img]} alt={`Question ${q.n}`} className="w-full rounded-lg bg-white" /> : <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />}
          {q.kind === "mcq" ? (
            <div className="grid grid-cols-4 gap-2">
              {["A", "B", "C", "D"].map((l) => (
                <button key={l} type="button" onClick={() => setAnswer(answers[q.id] === l ? "" : l)} className={"rounded-xl border py-3 font-display text-lg " + (answers[q.id] === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog hover:border-white/30")}>{l}</button>
              ))}
            </div>
          ) : (
            <SprPad value={answers[q.id] ?? ""} onChange={setAnswer} />
          )}
          <div className="flex justify-between">
            <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="btn-ghost !px-3 !py-1.5 text-sm disabled:opacity-40"><ChevronLeft size={14} /> Back</button>
            <button type="button" disabled={idx === questions.length - 1} onClick={() => setIdx(idx + 1)} className="btn-ghost !px-3 !py-1.5 text-sm disabled:opacity-40">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        <aside className="min-w-0 space-y-3 rounded-2xl border border-white/10 bg-space/60 p-4">
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {questions.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setIdx(i)} aria-label={`Question ${x.n}`}
                className={"relative rounded-md border py-1 text-xs " + (i === idx ? "border-cyan text-ice" : answers[x.id] ? "border-white/25 bg-white/[0.08] text-ice" : "border-white/10 text-dust")}>
                {x.n}{flagged.includes(x.id) ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300" /> : null}
              </button>
            ))}
          </div>
          {confirming ? (
            <div className="space-y-2 rounded-xl border border-amber-300/30 p-3 text-xs text-amber-100">
              <p>{unanswered} question{unanswered === 1 ? " is" : "s are"} unanswered. Submit this module anyway?</p>
              <div className="flex gap-2"><button disabled={busy} onClick={() => void submit()} className="btn-primary !px-3 !py-1.5 text-xs">Submit</button><button onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">Keep working</button></div>
            </div>
          ) : (
            <button disabled={busy} onClick={() => (unanswered ? setConfirming(true) : void submit())} className="btn-primary w-full !py-2 text-sm">{busy ? "Submitting…" : `Submit ${stage.label.split(" · ")[1]}`}</button>
          )}
          {error ? <p className="text-xs text-signal">{error}</p> : null}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` → clean. Confirm with `grep -n "sat/bank\|sat/serve\|sat/session\|question-bank" src/components/sat/*` → no matches (client code imports only types, `grade.ts` and `pk-time`).

- [ ] **Step 6: Commit** (behaviour is verified in the browser in Task 7, once a page mounts these)

```bash
git add src/components/sat/use-signed-images.ts src/components/sat/spr-pad.tsx src/components/sat/score-report.tsx src/components/sat/sat-runner.tsx
git commit -m "feat(sat): module runner, grid-in pad and score report"
```

---

### Task 7: SAT Lab pages, drill UI, hub and navigation

**Files:**
- Create: `src/components/sat/sat-drill.tsx`, `src/components/sat/sat-hub.tsx`
- Create: `src/app/portal/(app)/sat-lab/page.tsx`, `src/app/portal/(app)/sat-lab/[sessionId]/page.tsx`
- Modify: `src/app/portal/(app)/layout.tsx` (nav)

**Interfaces:**
- Consumes: Task 4 API; Task 6 components; `DrillState`, `ReviewItem`, `SessionSummary`, `AssignmentView` types; `satAccess` (server pages).
- Produces: `/portal/sat-lab` (hub), `/portal/sat-lab/<id>` (runner or drill, chosen by the state's `kind`); nav entry "SAT Lab" for students with SAT access and for staff.

- [ ] **Step 1: `sat-drill.tsx`** — one question at a time; answer; "Check"; the server's `ReviewItem` shows correct/incorrect, the official answer and the rationale (image first, text fallback); "Next question"; progress `k / n`; when `finished`, a summary `correct / total` with a link back to the hub. It POSTs `{action:"check", questionId, response}` and replaces its state with the returned `state`. Use `SprPad` for grid-in and A–D buttons for MCQ, as the runner does. Already-checked questions render their stored `ReviewItem` read-only (re-answering is impossible — the server keeps the first answer).

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { DrillState, ReviewItem } from "@/lib/sat/client-types";
import { SprPad } from "./spr-pad";
import { useSignedImages } from "./use-signed-images";

export function SatDrill({ initial }: { initial: DrillState }) {
  const [state, setState] = useState(initial);
  const firstOpen = initial.questions.findIndex((q) => !initial.checked[q.id]);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = state.questions[idx];
  const done: ReviewItem | undefined = state.checked[q.id];
  const { urls } = useSignedImages(state.questions.flatMap((x) => [x.img, state.checked[x.id]?.rationaleImg ?? ""]));
  useEffect(() => setResponse(""), [idx]);

  async function check() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/sat/sessions/${state.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", questionId: q.id, response }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Please try again.");
      setState(j.state as DrillState);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const correct = Object.values(state.checked).filter((r) => r.correct).length;
  if (state.finished && idx === state.questions.length) {
    return <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-center"><p className="font-display text-2xl text-ice">{correct}/{state.questions.length}</p><p className="mt-1 text-sm text-fog">{state.title} complete</p><Link href="/portal/sat-lab" className="btn-primary mt-4 inline-flex !px-4 !py-2 text-sm">Back to SAT Lab</Link></div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-space/60 px-4 py-3 text-sm">
        <span className="font-semibold text-ice">{state.title}</span>
        <span className="ml-auto font-mono text-dust">{Object.keys(state.checked).length}/{state.questions.length} · {correct} correct</span>
      </div>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4">
        <p className="font-display text-ice">Question {q.n} of {state.questions.length}</p>
        {urls[q.img] ? <img src={urls[q.img]} alt={`Question ${q.n}`} className="w-full rounded-lg bg-white" /> : <div className="h-64 animate-pulse rounded-lg bg-white/[0.06]" />}
        {done ? (
          <div className={"space-y-3 rounded-xl border p-3 " + (done.correct ? "border-emerald2/30" : "border-signal/30")}>
            <p className="flex items-center gap-2 text-sm">{done.correct ? <CheckCircle2 size={16} className="text-emerald2" /> : <XCircle size={16} className="text-signal" />}<span className="text-ice">You answered {done.response}. The answer is {done.answer}.</span></p>
            {done.rationaleImg && urls[done.rationaleImg] ? <img src={urls[done.rationaleImg]} alt="Official rationale" className="w-full rounded-lg bg-white" /> : done.rationale ? <p className="whitespace-pre-line text-sm text-fog">{done.rationale}</p> : null}
          </div>
        ) : q.kind === "mcq" ? (
          <div className="grid grid-cols-4 gap-2">{["A", "B", "C", "D"].map((l) => <button key={l} type="button" onClick={() => setResponse(l)} className={"rounded-xl border py-3 font-display text-lg " + (response === l ? "border-cyan bg-cyan/15 text-ice" : "border-white/15 text-fog")}>{l}</button>)}</div>
        ) : (
          <SprPad value={response} onChange={setResponse} />
        )}
        {error ? <p className="text-xs text-signal">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {done ? <button onClick={() => setIdx(idx + 1 < state.questions.length ? idx + 1 : state.finished ? state.questions.length : idx)} className="btn-primary !px-4 !py-2 text-sm">{idx + 1 < state.questions.length ? "Next question" : "Finish"}</button>
            : <button disabled={!response || busy} onClick={() => void check()} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : "Check"}</button>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `sat-hub.tsx`** — client component, props `{ isStaff: boolean }`. Loads `GET /api/sat/sessions` (sessions, practice tests, conversionTables) and `GET /api/sat/assignments?mine=1` (Task 9 adds it; until then treat a 404 as "no assignments"). Four sections, in this order, sparse:
  1. **Assigned to you** (only if any): title, due date via `formatPk`, status, Start / Resume.
  2. **Adaptive mock exam**: one paragraph — 98 questions in four modules, R&W 27 × 32 min, Math 22 × 35 min, 10-minute break, Module 2 adapts to Module 1 — plus `ROUTING_DISCLOSURE`, which the hub fetches as part of the GET response? No: import the constant from `@/lib/sat/adaptive`, which has no answer data (it imports only `./forms.ts` → `./bank.ts` → the JSON). **Do not import it**: `adaptive.ts` transitively imports the bank. Instead add `routingDisclosure: ROUTING_DISCLOSURE` to the `GET /api/sat/sessions` response in Task 4's route (edit it in this task) and render it from there. When `conversionTables` is false, say "Scores for mock exams appear once the official conversion tables are loaded."
  3. **Official practice tests**: one card per `practiceTests` entry, "Practice Test N · 120 questions · R&W 39+39 min, Math 43+43 min", Start. If the list is empty: "Official practice tests are being prepared."
  4. **Drill**: selects for section, domain (filtered by section; the eight domains with their College Board names), difficulty (Any/Easy/Medium/Hard), count (5–30, default 10) → Start.
  5. **History**: `sessions` newest first — title, date, `correct/total`, score range with authority badge, "Resume" for unfinished, "Report" for finished.
  Starting anything POSTs `/api/sat/sessions` and navigates with `router.push(\`/portal/sat-lab/${id}\`)`. Errors show inline.

- [ ] **Step 3: Pages**

```tsx
// src/app/portal/(app)/sat-lab/page.tsx
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { SatHub } from "@/components/sat/sat-hub";

export const metadata = { title: "SAT Lab", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatLabPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab");
  const access = await satAccess(user);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><GraduationCap size={18} /></span>
        <div><h1 className="font-display text-2xl text-ice">SAT Lab</h1><p className="text-sm text-dust">Official College Board questions · digital SAT format</p></div>
      </div>
      {access.ok ? <SatHub isStaff={access.isStaff} /> : (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="font-display text-lg text-ice">SAT isn&rsquo;t part of your courses yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fog">Your teacher enrols you into an SAT class to open the SAT Lab.</p>
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/app/portal/(app)/sat-lab/[sessionId]/page.tsx
import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/edu/auth";
import { satAccess } from "@/lib/sat/access";
import { loadDoc } from "@/lib/sat/store";
import { drillState } from "@/lib/sat/serve";
import { SatRunner } from "@/components/sat/sat-runner";
import { SatDrill } from "@/components/sat/sat-drill";

export const metadata = { title: "SAT Lab", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SatSittingPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login?next=%2Fportal%2Fsat-lab");
  if (!(await satAccess(user)).ok) redirect("/portal/sat-lab");
  const { sessionId } = await params;
  const loaded = await loadDoc(user.id, sessionId);
  if (!loaded.ok) return <p className="text-sm text-fog">This sitting couldn&rsquo;t be loaded just now. Nothing has been lost — please refresh.</p>;
  if (!loaded.doc) redirect("/portal/sat-lab");
  return loaded.doc.kind === "drill" ? <SatDrill initial={drillState(loaded.doc, Date.now())} /> : <SatRunner sessionId={sessionId} />;
}
```

- [ ] **Step 4: Navigation**

In `src/app/portal/(app)/layout.tsx`, `navFor(roles)` is synchronous and role-based. Add a parameter `satEnabled: boolean`, computed once in `PortalLayout` for students only (`isStudentUser ? (await satAccess(user).catch(() => ({ ok: false }))).ok : false`, run in the existing `Promise.all` next to the restriction and onboarding checks so it adds no sequential latency). Students with `satEnabled` get `{ href: "/portal/sat-lab", label: "SAT Lab" }` after "Exam Lab". Staff (`isExamLabStaff(roles)`) get "SAT Lab" and "SAT results" (`/portal/sat-lab/results`) in the Administration section, after "Exam Lab".

- [ ] **Step 5: Verify in the browser** (dev server with `SAT_LOCAL_CROPS=1`, signed in as staff — staff always have SAT access)

Check each Task 6 behaviour, and record what you saw in the report:
1. Hub renders all sections; the routing disclosure text is present.
2. Start a drill (Math · Algebra · 5): images load from `/api/sat/local-image`; answer, Check, rationale appears; the first answer sticks after a reload.
3. Start an adaptive mock: R&W Module 1 shows 27 questions, a 32:00 clock; answer a few; reload the page → answers are restored and the clock kept counting (did not reset).
4. Grid-in: in the Math module, type `1 1/2` → the pad explains mixed numbers are not allowed.
5. Submit with blanks → inline confirmation (no browser dialog).
6. In DevTools, confirm no API response before submission contains `"answer"` or `"rationale"` for an unsubmitted question.
7. Phone width (390 px): no horizontal scroll on hub, runner and report.

- [ ] **Step 6: Typecheck, build, commit**

```bash
npm run typecheck && npm run build
git add src/components/sat/sat-drill.tsx src/components/sat/sat-hub.tsx "src/app/portal/(app)/sat-lab/page.tsx" "src/app/portal/(app)/sat-lab/[sessionId]/page.tsx" "src/app/portal/(app)/layout.tsx" src/app/api/sat/sessions/route.ts
git commit -m "feat(sat): SAT Lab hub, sittings and drills in the portal"
```

---

### Task 8: Staff results

**Files:**
- Create: `src/app/api/sat/results/route.ts`, `src/app/portal/(app)/sat-lab/results/page.tsx`

**Interfaces:**
- Consumes: `listSummaries`, `canViewStudent`; `getRegistry` (`@/lib/portal/institutions`), `courseFromYear` (`@/lib/portal/course-access`), `visibleClassIdsForUid`, `createAdminClient`.
- Produces: `GET /api/sat/results` → `{ students: { uid, name, className, sessions: SessionSummary[] }[] }` for SAT-class students the caller can see; the page lists them (latest score with authority badge, number of sittings, last activity via `formatPk`) and links each finished sitting to `/portal/sat-lab/results/<uid>/<id>`, which renders `ScoreReport` from `GET /api/sat/sessions/<id>?uid=<uid>`.

- [ ] **Step 1: Route.** Staff only (`isStaff`), else 403. Classes in scope = `visibleClassIdsForUid(user.id, user.roles)` ∩ registry classes whose `courseFromYear(year) === "SAT"`. Students = active enrolments in those classes (`edu_enrolments` → `edu_students.profile_id` → `edu_profiles.full_name`), excluding staff accounts via `staffRoleMap`. Read each student's `listSummaries` with bounded concurrency (8); a student whose index is unreadable is returned with `sessions: null` and shown as "couldn't load", never as "no sittings".
- [ ] **Step 2: Page + read-only report page** `src/app/portal/(app)/sat-lab/results/[uid]/[id]/page.tsx` (add to Files) — server page that checks `canViewStudent`, then renders a small client wrapper fetching `GET /api/sat/sessions/<id>?uid=<uid>` and showing `<ScoreReport>` when the state is finished, or "This sitting is still in progress" otherwise.
- [ ] **Step 3: Verify** as staff: the page renders (empty list is fine before any SAT class exists), 403 for a student account. Typecheck, build.
- [ ] **Step 4: Commit** — `feat(sat): staff SAT results scoped to their classes`.

---

### Task 9: Teacher-assigned SAT work

**Files:**
- Create: `src/lib/sat/assignments.ts`, `src/app/api/sat/assignments/route.ts`, `src/components/sat/sat-assign.tsx`
- Modify: `src/app/api/sat/sessions/route.ts`, `src/app/api/sat/sessions/[id]/route.ts` (the three `ASSIGNMENT HOOK` points), `src/components/sat/sat-hub.tsx` (Assigned section + staff "Assign" panel)

**Interfaces:**
- Produces: `SATAssignment = { id, kind: "adaptive" | "practice" | "drill", title, testNo: number | null, filter: SATFilter | null, count: number | null, dueAt: string | null, assignedBy: string, assignedByName: string, assignedAt: string, status: "assigned" | "in_progress" | "done", sessionId: string | null }`; `listAssignments(uid): Promise<SATAssignment[] | null>`; `addAssignments(uids, a): Promise<{ added: number; failed: number }>` (bounded concurrency 8, per-student doc `portal-data/sat/assigned/<uid>.json`, fresh read → merge → write, idempotent on `a.id`); `markAssignment(uid, id, patch)`.
- `GET /api/sat/assignments?mine=1` → `{ items: AssignmentView[] }` for the caller. `POST /api/sat/assignments` (staff; `isExamLabStaff`) body `{ classIds?: string[], studentUids?: string[], kind, testNo?, filter?, count?, dueAt?: string (datetime-local, PKT), idempotencyKey: string }` → resolves recipients (active SAT-class students in the caller's visible classes; staff filtered out), `addAssignments`, then `notify({ uids }, { type: "assignment", title: "New SAT work: <title>", body: due ? "Due <formatPk(due)>" : null, href: "/portal/sat-lab" })` → `{ added, failed }`.

- [ ] **Step 1:** Write `assignments.ts` with the fail-closed pattern (no write after a failed read).
- [ ] **Step 2:** Route + zod schema; `dueAt` through `pkDateTimeToIso`; `idempotencyKey` becomes the assignment id, so a retried POST adds nothing twice.
- [ ] **Step 3:** Hooks: starting a session with an `assignmentId` that the caller owns → `markAssignment(uid, id, { status: "in_progress", sessionId })`; a finished sitting or drill → `{ status: "done" }`. A student may only start an assignment that is in their own list (reject otherwise with 404).
- [ ] **Step 4:** `sat-assign.tsx` — staff panel in the hub: choose kind (mock / practice test N / drill with filter), class (from `GET /api/portal/admin/classes` — read that route for its response shape — filtered to SAT classes) or students, optional due date (`datetime-local`), Assign → shows `added` / `failed`; a fresh `crypto.randomUUID()` idempotency key per assignment, reused on retry.
- [ ] **Step 5: Verify:** typecheck, build; as staff, assign a drill to an SAT class (if one exists) — else verify the 400 "no students in scope" message.
- [ ] **Step 6: Commit** — `feat(sat): teachers assign mocks, practice tests and drills`.

---

### Task 10: Public `/sat` vertical

**Files:**
- Create: `src/app/sat/programs.ts`, `src/app/sat/page.tsx`, `src/app/sat/[slug]/page.tsx`
- Modify: `src/app/sitemap.ts`, `src/components/site-header.tsx` (add `{ href: "/sat", label: "SAT" }` after "Courses")

**Interfaces:**
- Produces: `SAT_PROGRAMMES: { slug: string; name: string; summary: string; points: string[] }[]` with slugs `digital-sat`, `reading-and-writing`, `math`; `/sat` hub; `/sat/[slug]` with `generateStaticParams`, per-page `metadata` (`alternates.canonical`), and JSON-LD `Course` escaped with the same `toJsonLd` helper pattern the physics pages use (copy it — `<` `>` `&` → `<` `>` `&`).

Content rules: state only what the site provides and public format facts — the digital SAT has two sections (Reading and Writing: 54 questions, 64 minutes; Math: 44 questions, 70 minutes), each in two modules where Module 2 adapts to Module 1, scored 400–1600; the SAT Lab offers adaptive mock exams (labelled as estimated scores), the 8 official College Board paper practice tests (tests 4–11, their own timing and official score ranges), and drills from 3,700+ official question-bank questions with College Board's own domain, skill and difficulty labels. No outcome, score-improvement or affiliation claims. The trademark line (Global Constraints) on every page. A primary CTA to `/portal/sat-lab` and a secondary to `/contact`.

- [ ] **Step 1:** Write `programs.ts`, the hub and the slug page following `src/app/physics/page.tsx` and `src/app/physics/[slug]/page.tsx` (read both first; match their section structure and components).
- [ ] **Step 2:** Sitemap entries for `/sat` and the three slugs; header link. Verify desktop header does not wrap at 1280 px and the mobile menu still shows every link (it scrolls since 2026-09-25).
- [ ] **Step 3: Verify:** `curl` each page → 200, canonical correct, JSON-LD contains no raw `<`; typecheck; build.
- [ ] **Step 4: Commit** — `feat(sat): public /sat vertical`.

---

### Task 11: Rationale crops (Python track)

**Why:** Spec §4.3 promises drills "each with its official rationale", and plan 1's handoff records that Math rationales are unusable as text ("in this equation yields , or to both sides" — the text layer drops every symbol). The rationale must be served as an image, exactly as the question is.

**Files:**
- Create: `scripts/exam-lab/ingest-sat/crop_rationale.py`, `scripts/exam-lab/ingest-sat/tests/test_crop_rationale.py`
- Modify: `scripts/exam-lab/ingest-sat/extract_sat.py` (render + record `rationale_img`), `scripts/exam-lab/ingest-sat/build_sat_bank.py` (emit `rationaleImg`), `src/lib/sat/types.ts` (`SATQuestion.rationaleImg?: string`), `src/lib/sat/serve.ts` (drop the local cast)

**Interfaces:**
- Consumes: `crop_qbank.anchors(xml_text)` — its `rationales` and `questions` keys give the `Rationale` label's position and the next record's header; `bbox.words_by_page`; the atomic-render pattern of `crop_qbank.render_span`; the cross-page stitching prior art in `scripts/exam-lab/ingest-5054/crop5054.py` (`crop_question`).
- Produces: `crop_rationale.rationale_span(anchors, i) -> list[dict]` (one or more page regions from just below the `Rationale` label to just above the next record's header, spanning page breaks); rows gain `rationale_img = "sat/<section>/<id>-r.jpg"`; local file `out/crops/<section>/<id>-r.jpg`; bucket path under the `sat/` prefix via `upload.guard_prefix`.

- [ ] **Step 1: Measure first.** Over both exports, count rationales that end on the same page as their label vs cross one or more page breaks, and the longest span. Record the numbers in the report — they decide how much stitching matters.
- [ ] **Step 2: Failing tests** for `rationale_span`: same-page rationale (one region ending above the next header), a rationale crossing a page break (two regions, the second starting below the running header), and the last record of an export (ends at the page's content bottom).
- [ ] **Step 3: Implement** `crop_rationale.py` and wire it into `extract_sat.py` behind the existing resumable/atomic rules; `--dry-run` renders locally without uploading.
- [ ] **Step 4: Verify by looking, not by the text layer** (plan 1's lesson): render 12 samples spanning both sections, all three difficulties, SPR and MCQ, and at least 3 cross-page rationales; confirm each shows the whole rationale and nothing of the next question (its header table, Question ID, difficulty glyph). Then scan all rationale crops automatically for the next record's `Question ID` token (text layer inside each region must not contain one).
- [ ] **Step 5:** `python -m pytest scripts/exam-lab/ingest-sat/tests -q` → all pass; rebuild the dev bank (`build_sat_bank.py out/rows.json --allow-dry-run`) so `rationaleImg` appears; `npm run test:sat` and `npm run typecheck` clean; the drill UI shows the rationale image.
- [ ] **Step 6: Commit** — `feat(sat-ingest): official rationales cropped as images`.

---

### Task 12: How to test it — the owner's guide

**Files:**
- Create: `docs/SAT-TESTING.md`
- Modify: `docs/superpowers/SAT-HANDOFF.md` (status: plans 2 and 3 executed; the live-upload blocker unchanged)

Write for the site owner, not a developer. Sections:
1. **What exists** — SAT Lab (adaptive mocks, official practice tests, drills, reports, assignments, staff results) and the public `/sat` pages; what "estimated" and "official" mean.
2. **Run it locally** — `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for the site's project, plus `SAT_LOCAL_CROPS=1`; `npm install`; `npm run dev -- -p 3005`; open http://localhost:3005/portal/sat-lab.
3. **Give a student access** — Admin → Academics: create a class whose Year is `SAT` (e.g. "SAT 2026"); Admin → Users: enrol the student; they see "SAT Lab" in the menu.
4. **A 10-minute test script** — drill (answer, check rationale, reload keeps the first answer); mock (answer a few, reload — answers and clock survive; submit with blanks → confirmation; routing disclosure on the report); grid-in rules (`1 1/2` is refused, `.6667` is accepted for 2/3); a practice test's 39-minute clock; phone width.
5. **Run the automated checks** — `npm run test:sat`, `npm run test:portal`, `npm run test:access`, `python -m pytest scripts/exam-lab/ingest-sat/tests -q`, `npm run build`.
6. **Before this goes live** — the owner signs off the sample crops (`scripts/exam-lab/ingest-sat/out/samples/`); the live upload (question bank, practice tests, rationales) runs with the owner's credentials; the bank is rebuilt without `--allow-dry-run`; then merge.

- [ ] **Step 1:** Write the guide; every command in it must have been run once by you and produce what the guide says.
- [ ] **Step 2: Commit** — `docs(sat): owner's testing guide and updated handoff`.

---

## Deferred, with reasons (spec phase 7)

- **Study-plan integration.** The study plan is gated on Cambridge syllabus coverage (topics a teacher marks as taught); SAT has no coverage model, so automatic SAT tasks would be invented pacing. Teachers assign SAT work directly (Task 9) instead.
- **`sat_` tables.** sat-001 is written (plan 2 Task 12) but unapplied; sittings live in `portal-data` until the owner authorises the migration, then `store.ts` is the single file to switch.
- **Desmos calculator and reference sheet** — out of scope in spec §12; flagged on the Math module intro as a follow-up.
