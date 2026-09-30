import assert from "node:assert/strict";
import { validateProfileInput, horizonEnd, daysBetween, applyProfileChange } from "../src/lib/sat/coach/profile.ts";
import { pickDiagnostic } from "../src/lib/sat/coach/diagnostic.ts";
import { questionsPerSession, previewLine, targetFromScore, addMonths, addDays, targetMonthOptions, DAY_PRESETS, presetOf, profileSchemaFor, targetMonthChoices } from "../src/lib/sat/coach/profile.ts";
import { DIAGNOSTIC_TITLE } from "../src/lib/sat/coach/diagnostic.ts";
import { mockDates } from "../src/lib/sat/coach/planner.ts";
import { startDiagnostic } from "../src/lib/sat/drills.ts";
import { summaryOf } from "../src/lib/sat/serve.ts";
import { loadQuestionBank } from "../src/lib/sat/bank.ts";
const today = "2026-10-01";
const ok = validateProfileInput({ examDate: "2026-12-05", targetMonth: null, targetScore: 1350, start: { kind: "skip" }, days: [1, 3, 5], minutes: 30 }, today);
assert.equal(ok.ok, true);
const bad = (x) => validateProfileInput({ examDate: "2026-12-05", targetMonth: null, targetScore: 1350, start: { kind: "skip" }, days: [1], minutes: 30, ...x }, today);
assert.equal(bad({ examDate: "2026-09-30" }).ok, false);          // past
assert.equal(bad({ examDate: "2028-06-01" }).ok, false);          // > 18 months
assert.equal(bad({ targetScore: 1355 }).ok, false);               // not a multiple of 10
assert.equal(bad({ targetScore: 1610 }).ok, false);
assert.equal(bad({ days: [] }).ok, false);
assert.equal(bad({ days: [7] }).ok, false);
assert.equal(bad({ minutes: 20 }).ok, false);
assert.equal(bad({ examDate: null, targetMonth: null }).ok, false); // one of them required
assert.equal(bad({ examDate: null, targetMonth: "2027-03" }).ok, true);
assert.equal(bad({ start: { kind: "score", total: 1100, source: "PSAT" } }).ok, true);
assert.equal(bad({ start: { kind: "score", total: 1700, source: "SAT" } }).ok, false);
assert.equal(horizonEnd({ examDate: null, targetMonth: "2027-03" }), "2027-03-01");
assert.equal(horizonEnd({ examDate: "2026-12-05", targetMonth: null }), "2026-12-05");
assert.equal(daysBetween("2026-10-01", "2026-12-05"), 65);
const p1 = applyProfileChange(null, ok.value, "2026-10-01T00:00:00Z");
assert.equal(p1.changes.length, 0);
const p2 = applyProfileChange(p1, { ...ok.value, targetScore: 1400 }, "2026-10-02T00:00:00Z");
assert.deepEqual(p2.changes.map((c) => [c.field, c.from, c.to]), [["targetScore", 1350, 1400]]);
// diagnostic: 24 = 3 per domain, E/M/H once each, no duplicates, deterministic for a seeded rng
const DOM = ["information-ideas", "craft-structure", "expression-ideas", "standard-english", "algebra", "advanced-math", "psda", "geometry-trig"];
const bank = DOM.flatMap((d) => ["E", "M", "H"].flatMap((df) => [0, 1, 2].map((i) => ({ id: `${d}-${df}-${i}`, domain: d, difficulty: df }))));
let s = 1; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
const ids = pickDiagnostic(bank, rng);
assert.equal(ids.length, 24); assert.equal(new Set(ids).size, 24);
for (const d of DOM) { const mine = ids.filter((x) => x.startsWith(d + "-")); assert.equal(mine.length, 3); assert.deepEqual(mine.map((x) => x.split("-").at(-2)).sort(), ["E", "H", "M"]); }
console.log("sat-coach profile tests passed");

// --- beyond the brief --------------------------------------------------------

// Validation: every refusal is a plain sentence naming the block it belongs
// to, never zod's own wording.
const refusal = (x) => { const r = bad(x); assert.equal(r.ok, false); return r; };
assert.deepEqual(refusal({ examDate: "2026-09-30" }), { ok: false, error: "Your SAT date must be after today.", field: "examDate" });
assert.equal(refusal({ examDate: today }).error, "Your SAT date must be after today.", "today itself is not in the future");
assert.equal(refusal({ examDate: "2028-06-01" }).error, "Your SAT date must be within the next 18 months.");
assert.equal(bad({ examDate: "2028-04-01" }).ok, true, "exactly 18 months ahead is allowed");
assert.equal(refusal({ examDate: "2028-04-02" }).field, "examDate");
assert.equal(refusal({ examDate: "2026-02-30" }).error, "Choose a valid SAT date.");
assert.equal(refusal({ examDate: null, targetMonth: null }).error, "Choose your SAT date, or pick “Not booked yet” and a month.");
assert.equal(refusal({ examDate: null, targetMonth: "2026-10" }).error, "Your target month must be after this month.");
assert.equal(refusal({ examDate: null, targetMonth: "2028-05" }).error, "Your target month must be within the next 18 months.");
assert.equal(bad({ examDate: null, targetMonth: "2028-04" }).ok, true);
assert.equal(refusal({ examDate: null, targetMonth: "2027-13" }).error, "Choose a valid target month.");
assert.equal(refusal({ targetScore: 1355 }).error, "Choose a target score between 400 and 1600, in steps of 10.");
assert.equal(refusal({ targetScore: 390 }).field, "targetScore");
assert.equal(refusal({ days: [] }).error, "Choose at least one practice day.");
assert.equal(refusal({ days: [1, 2.5] }).field, "days");
assert.equal(refusal({ minutes: 20 }).error, "Choose 15, 30, 45 or 60 minutes per session.");
assert.equal(refusal({ start: { kind: "score", total: 1700, source: "SAT" } }).error, "An SAT total score runs from 400 to 1600, in steps of 10.");
assert.equal(refusal({ start: { kind: "score", total: 1530, source: "PSAT" } }).error, "A PSAT total score runs from 240 to 1520, in steps of 10.");
assert.equal(refusal({ start: { kind: "score", total: 1200, rw: 610, math: 600, source: "SAT" } }).error, "Your section scores must add up to your total.");
assert.equal(bad({ start: { kind: "score", total: 1210, rw: 610, math: 600, source: "SAT" } }).ok, true);
assert.equal(refusal({ start: { kind: "score", total: 1200, rw: 850, source: "SAT" } }).error, "An SAT section score runs from 200 to 800, in steps of 10.");
assert.equal(refusal({ start: { kind: "score", total: 1200, source: "SAT", date: "2026-10-02" } }).error, "The date you took that test can’t be in the future.");
assert.equal(bad({ start: { kind: "score", total: 1200, source: "SAT", date: "2026-06-06" } }).ok, true);
assert.equal(refusal({ start: { kind: "nope" } }).error, "Invalid request.", "a malformed body is a generic refusal");
assert.equal(validateProfileInput(null, today).ok, false);

// Normalisation: days sorted and de-duplicated; a booked date drops any month.
const norm = bad({ days: [5, 1, 5, 0], targetMonth: "2027-03" });
assert.equal(norm.ok, true);
assert.deepEqual(norm.value.days, [0, 1, 5]);
assert.equal(norm.value.targetMonth, null, "a booked date wins over a target month");
assert.equal(bad({ examDate: null, targetMonth: "2027-03" }).value.examDate, null);
// Unknown keys never reach the stored profile.
assert.equal("createdAt" in bad({ createdAt: "x" }).value, false);

// Dates: month arithmetic clamps to the month's last day.
assert.equal(addMonths("2026-08-31", 18), "2028-02-29");
assert.equal(addMonths("2026-10-01", 18), "2028-04-01");
assert.equal(daysBetween("2026-12-05", "2026-10-01"), -65);
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
// The "Not booked yet" month list matches what validation accepts.
const months = targetMonthOptions(today);
assert.equal(months.length, 18);
assert.equal(months[0], "2026-11");
assert.equal(months.at(-1), "2028-04");
for (const m of [months[0], months.at(-1)]) assert.equal(bad({ examDate: null, targetMonth: m }).ok, true, m);
assert.equal(targetMonthOptions("2026-10-31").at(-1), "2028-04");
assert.equal(horizonEnd({ examDate: null, targetMonth: null }), null);

// Change log: one entry per changed field, deep comparison, capped at 50.
const p3 = applyProfileChange(p2, { ...p2, days: [1, 3, 5], start: { kind: "skip" } }, "2026-10-03T00:00:00Z");
assert.equal(p3.changes.length, 1, "equal arrays and objects are not changes");
assert.equal(p3.createdAt, "2026-10-01T00:00:00Z");
assert.equal(p3.updatedAt, "2026-10-03T00:00:00Z");
assert.equal("changes" in p1 && p1.createdAt === p1.updatedAt, true);
let p = p1;
for (let i = 0; i < 60; i++) p = applyProfileChange(p, { ...p, targetScore: 1000 + (i % 2) * 10, minutes: i % 2 ? 15 : 45 }, `2026-10-04T00:00:${String(i).padStart(2, "0")}Z`);
assert.equal(p.changes.length, 50, "the change log keeps the newest 50");
assert.equal(p.changes.at(-1).at, "2026-10-04T00:00:59Z");
const p4 = applyProfileChange(p1, { ...ok.value, examDate: null, targetMonth: "2027-05" }, "2026-10-05T00:00:00Z");
assert.deepEqual(p4.changes.map((c) => c.field), ["examDate", "targetMonth"]);

// Setup defaults and the preview line.
assert.equal(targetFromScore(null), 1200);
assert.equal(targetFromScore(1055), 1210, "past score + 150, rounded to 10");
assert.equal(targetFromScore(1500), 1600, "capped at 1600");
assert.deepEqual([15, 30, 45, 60].map(questionsPerSession), [8, 15, 22, 30]);
// The full-exam count (final review M9, spec 5) is the planner's own mockDates.
assert.equal(previewLine({ examDate: "2026-11-13", targetMonth: null, days: [0, 1, 2, 3, 4], minutes: 15 }, today), "43 days to go · 6 full practice exams · 5 sessions a week of ~8 questions");
assert.equal(mockDates(today, "2026-11-13", [0, 1, 2, 3, 4]).length, 6);
assert.equal(previewLine({ examDate: null, targetMonth: "2027-03", days: [6], minutes: 60 }, today), `151 days to go · ${mockDates(today, "2027-03-01", [6]).length} full practice exams · 1 session a week of ~30 questions`);
assert.equal(previewLine({ examDate: "2026-10-05", targetMonth: null, days: [0, 1, 2, 3, 4, 5, 6], minutes: 30 }, today), "4 days to go · 1 full practice exam · 7 sessions a week of ~15 questions", "one exam, singular");
assert.equal(previewLine({ examDate: "2026-10-03", targetMonth: null, days: [1, 2, 3], minutes: 30 }, today), "2 days to go · 3 sessions a week of ~15 questions", "no full exam in the last 2 days: no count");
assert.equal(previewLine({ examDate: "2026-09-20", targetMonth: null, days: [1, 2, 3], minutes: 30 }, today), "3 sessions a week of ~15 questions", "a passed date: no countdown, no count");
assert.equal(previewLine({ examDate: null, targetMonth: null, days: [1, 2], minutes: 30 }, today), "2 sessions a week of ~15 questions");
assert.deepEqual(DAY_PRESETS.every, [0, 1, 2, 3, 4, 5, 6]);
assert.equal(presetOf([1, 2, 3, 4, 5]), "weekdays");
assert.equal(presetOf([0, 6]), "weekends");
assert.equal(presetOf([3]), "once");
assert.equal(presetOf([0, 1, 2, 3, 4, 5, 6]), "every");
assert.equal(presetOf([1, 3]), "custom");

// pickDiagnostic: deterministic, honours `exclude`, R&W domains first.
s = 1; const again = pickDiagnostic(bank, rng);
s = 1; const once = pickDiagnostic(bank, rng);
assert.deepEqual(again, once, "a seeded rng gives the same diagnostic");
assert.deepEqual(ids.slice(0, 12).map((x) => DOM.slice(0, 4).some((d) => x.startsWith(d + "-"))), Array(12).fill(true), "Reading and Writing first");
const excl = new Set(bank.filter((q) => q.domain === "algebra" && q.difficulty === "E" && q.id !== "algebra-E-2").map((q) => q.id));
s = 7; const withExcl = pickDiagnostic(bank, rng, excl);
assert.equal(withExcl.length, 24);
assert.ok(withExcl.includes("algebra-E-2"), "the one allowed easy algebra question is used");
assert.ok(!withExcl.some((x) => excl.has(x)), "excluded ids are never drawn");
// A difficulty with nothing left falls back to another question of the same domain.
const noHard = new Set(bank.filter((q) => q.domain === "psda" && q.difficulty === "H").map((q) => q.id));
s = 3; const fallback = pickDiagnostic(bank, rng, noHard);
assert.equal(fallback.filter((x) => x.startsWith("psda-")).length, 3);
assert.equal(new Set(fallback).size, 24);
// A domain with nothing left at all cannot make a diagnostic.
assert.throws(() => pickDiagnostic(bank.filter((q) => q.domain !== "geometry-trig"), rng), /diagnostic/i);

// startDiagnostic: a drill tagged "diagnostic", built from pickDiagnostic.
const realBank = loadQuestionBank();
s = 11; const diag = startDiagnostic(realBank, rng, { id: "diag-1", uid: "user-1", now: 1000 });
assert.equal(diag.kind, "drill");
assert.equal(diag.purpose, "diagnostic");
assert.equal(diag.planItemId, null);
assert.equal(diag.title, DIAGNOSTIC_TITLE);
assert.equal(DIAGNOSTIC_TITLE, "Diagnostic — 24 questions");
assert.equal(diag.questionIds.length, 24);
assert.equal(diag.assignmentId, null);
assert.equal(diag.finishedAt, null);
const byId = new Map(realBank.map((q) => [q.id, q]));
for (const d of DOM) {
  const mine = diag.questionIds.map((x) => byId.get(x)).filter((q) => q.domain === d);
  assert.equal(mine.length, 3, `3 ${d} questions`);
  assert.deepEqual(mine.map((q) => q.difficulty).sort(), ["E", "H", "M"]);
}
const blocked = new Set(diag.questionIds);
s = 11; const diag2 = startDiagnostic(realBank, rng, { id: "diag-2", uid: "user-1", now: 1000 }, blocked);
assert.ok(!diag2.questionIds.some((x) => blocked.has(x)), "running-sitting questions are excluded");
assert.equal(summaryOf(diag).purpose, "diagnostic", "the summary carries the purpose");
assert.equal(summaryOf(diag).title, DIAGNOSTIC_TITLE);

console.log("sat-coach profile extra tests passed");

// --- final review I1: the date window judges only a date that changed -------
//
// After the SAT date passes the home asks for the score; every save used to
// re-check the STORED date against today and fail. Now a date field sent
// back unchanged skips the window (on the server, fed the stored profile,
// and in the form alike); a new date is still checked.
{
  const passed = { examDate: "2026-09-20", targetMonth: null, targetScore: 1350, start: { kind: "skip" }, days: [1, 3, 5], minutes: 30 };
  const stored = applyProfileChange(null, passed, "2026-08-01T00:00:00Z"); // saved while the date was ahead
  const save = (x) => validateProfileInput({ ...passed, ...x }, today, stored);

  // A stored passed examDate plus a changed start (the score) and target saves.
  const scored = save({ start: { kind: "score", total: 1210, rw: 610, math: 600, source: "SAT", date: "2026-09-20" }, targetScore: 1400 });
  assert.equal(scored.ok, true, "the score can be added after the SAT date");
  assert.equal(scored.value.examDate, "2026-09-20");
  assert.equal(save({ days: [0, 6], minutes: 45 }).ok, true, "days and minutes save too");
  // What the server runs (PUT /api/sat/profile: profileSchemaFor(pkToday(), prev)).
  assert.equal(profileSchemaFor(today, stored).safeParse({ ...passed, targetScore: 1400 }).success, true);
  assert.equal(profileSchemaFor(today).safeParse({ ...passed, targetScore: 1400 }).success, false, "without the stored profile the old rule applies");
  assert.equal(validateProfileInput({ ...passed, targetScore: 1400 }, today, null).ok, false, "a first save has nothing stored");

  // Changing the date still has to land in the window.
  assert.deepEqual(save({ examDate: "2026-09-27" }), { ok: false, error: "Your SAT date must be after today.", field: "examDate" }, "a different past date fails");
  assert.equal(save({ examDate: today }).error, "Your SAT date must be after today.", "today fails");
  assert.equal(save({ examDate: "2028-06-01" }).error, "Your SAT date must be within the next 18 months.");
  assert.equal(save({ examDate: "2026-12-05" }).ok, true, "a next SAT date saves");
  // Switching to "Not booked yet" checks the new month.
  assert.equal(save({ examDate: null, targetMonth: "2026-10" }).error, "Your target month must be after this month.");
  assert.equal(save({ examDate: null, targetMonth: "2026-11" }).ok, true);
  // A kept value is still a date, and the rest of the rules still apply.
  assert.equal(validateProfileInput({ ...passed, examDate: "2026-02-30" }, today, { examDate: "2026-02-30", targetMonth: null }).error, "Choose a valid SAT date.");
  assert.equal(save({ targetScore: 1355 }).field, "targetScore");
}

// Exam day itself: the stored date is today -- other fields save.
{
  const examDay = { examDate: today, targetMonth: null, targetScore: 1300, start: { kind: "skip" }, days: [1, 3, 5], minutes: 30 };
  assert.equal(validateProfileInput({ ...examDay, minutes: 15 }, today).ok, false, "before the fix: exam day blocked every save");
  assert.equal(validateProfileInput({ ...examDay, minutes: 15 }, today, { examDate: today, targetMonth: null }).ok, true);
  assert.equal(validateProfileInput({ ...examDay, targetScore: 1400 }, today, { examDate: "2026-10-03", targetMonth: null }).ok, false, "moving the date to today fails");
}

// Not booked, in (or past) the target month: other fields save; the stored
// month stays a choice in the picker so it never shows blank.
{
  const inMonth = { examDate: null, targetMonth: "2026-10", targetScore: 1300, start: { kind: "skip" }, days: [2, 4], minutes: 30 };
  const midMonth = "2026-10-15";
  const stored = { examDate: null, targetMonth: "2026-10" };
  assert.equal(validateProfileInput({ ...inMonth, days: [2, 4, 6] }, midMonth).ok, false, "before the fix: the started month blocked the save");
  assert.equal(validateProfileInput({ ...inMonth, days: [2, 4, 6] }, midMonth, stored).ok, true);
  assert.equal(validateProfileInput({ ...inMonth, targetMonth: "2026-09" }, midMonth, stored).error, "Your target month must be after this month.", "a new past month fails");
  assert.equal(validateProfileInput({ ...inMonth, targetMonth: "2026-10" }, midMonth, { examDate: null, targetMonth: "2026-12" }).error, "Your target month must be after this month.", "picking this month anew fails");
  assert.equal(validateProfileInput({ ...inMonth, targetMonth: "2026-12" }, midMonth, stored).ok, true, "a new later month saves");

  const choices = targetMonthChoices(midMonth, "2026-10");
  assert.equal(choices[0], "2026-10", "the started month is offered first");
  assert.deepEqual(choices.slice(1), targetMonthOptions(midMonth));
  assert.deepEqual(targetMonthChoices(midMonth, "2026-12"), targetMonthOptions(midMonth), "a month already offered isn't repeated");
  assert.deepEqual(targetMonthChoices(midMonth, null), targetMonthOptions(midMonth));
  assert.deepEqual(targetMonthChoices(midMonth, "junk"), targetMonthOptions(midMonth));
}

console.log("sat-coach profile I1 tests passed");
