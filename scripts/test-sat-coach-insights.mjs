// Tests for the pure "Coach says" insights builders
// (src/lib/sat/coach/insights-core.ts): prompt shape/sanitisation, JSON
// parsing/validation, the deterministic rules fallback and the inputs
// fingerprint.
import assert from "node:assert/strict";
import { fallbackInsights, insightsFingerprint, insightsPrompt, parseInsights, sanitiseFirstName } from "../src/lib/sat/coach/insights-core.ts";

function baseInput(overrides = {}) {
  return {
    firstName: "Aisha",
    daysToExam: 30,
    targetScore: 1400,
    latestScore: { authority: "official", lower: 1180, upper: 1210, testNo: 4 },
    sections: { rw: { accuracy: 0.72 }, math: { accuracy: 0.6 } },
    weakSkills: [
      { label: "Algebra", mastery: 0.35 },
      { label: "Craft and Structure", mastery: 0.42 },
    ],
    strongSkills: [{ label: "Geometry and Trigonometry", mastery: 0.85 }],
    pacingFlags: [{ label: "Algebra", medianSec: 130, accuracy: 0.4 }],
    week: { scheduled: 5, done: 3, late: 0, missed: 2 },
    nextMock: { date: "2026-10-10", title: "Official Practice Test 5" },
    ...overrides,
  };
}

function validInsights() {
  return {
    headline: "Push Algebra this week",
    summary: "Your accuracy is climbing in Reading and Writing. Algebra is still your weakest spot.",
    tips: [
      { title: "Drill Algebra", body: "Spend today's session on Algebra questions -- it's your lowest mastery skill.", skill: "Algebra" },
      { title: "Watch the clock", body: "You're averaging 130s per Algebra question -- practice timed sets." },
    ],
  };
}

// --- 1: parseInsights accepts a valid object, filling source/generatedAt
{
  const parsed = parseInsights(validInsights());
  assert.ok(parsed, "a valid object parses");
  assert.equal(parsed.headline, "Push Algebra this week");
  assert.equal(parsed.tips.length, 2);
  assert.equal(parsed.tips[0].skill, "Algebra");
  assert.equal(parsed.source, "ai");
  assert.equal(typeof parsed.generatedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(parsed.generatedAt)));
}

// --- 2: parseInsights rejects 4 tips
{
  const bad = validInsights();
  bad.tips = [
    { title: "a", body: "a" }, { title: "b", body: "b" },
    { title: "c", body: "c" }, { title: "d", body: "d" },
  ];
  assert.equal(parseInsights(bad), null, "more than 3 tips is rejected");
}

// --- 3: parseInsights rejects a 400-char tip body
{
  const bad = validInsights();
  bad.tips = [{ title: "Too long", body: "x".repeat(400) }];
  assert.equal(parseInsights(bad), null, "a tip body over 280 chars is rejected");
}

// --- 4: parseInsights rejects a missing summary
{
  const bad = validInsights();
  delete bad.summary;
  assert.equal(parseInsights(bad), null, "a missing summary is rejected");
}

// --- 4b: parseInsights rejects non-object / garbage input, never throws
{
  assert.equal(parseInsights(null), null);
  assert.equal(parseInsights("not json"), null);
  assert.equal(parseInsights({ headline: "x".repeat(200), summary: "s", tips: [] }), null, "a headline over 90 chars is rejected");
}

// --- 5: fallbackInsights mentions the weakest skill's label
{
  const view = fallbackInsights(baseInput());
  const text = `${view.headline} ${view.summary} ${view.tips.map((t) => `${t.title} ${t.body}`).join(" ")}`;
  assert.ok(text.includes("Algebra"), "mentions the weakest skill's label somewhere in the view");
  assert.equal(view.source, "rules");
}

// --- 6: fallbackInsights mentions "missed" when week.missed > 0, not when it's 0
{
  const missed = fallbackInsights(baseInput({ week: { scheduled: 5, done: 3, late: 0, missed: 2 } }));
  const missedText = `${missed.summary} ${missed.tips.map((t) => t.body).join(" ")}`;
  assert.ok(/missed/i.test(missedText), "mentions 'missed' when the week has missed sessions");

  const clean = fallbackInsights(baseInput({ week: { scheduled: 5, done: 5, late: 0, missed: 0 } }));
  const cleanText = `${clean.summary} ${clean.tips.map((t) => t.body).join(" ")}`;
  assert.ok(!/missed/i.test(cleanText), "no 'missed' wording when nothing was missed");
}

// --- 6b: fallbackInsights includes a test-day tip when daysToExam <= 2
{
  const soon = fallbackInsights(baseInput({ daysToExam: 1 }));
  assert.ok(soon.tips.length > 0 && soon.tips.length <= 3);
  const far = fallbackInsights(baseInput({ daysToExam: 30 }));
  assert.ok(far.tips.length <= 3);
}

// --- 7: fingerprint changes when week.done changes
{
  const today = "2026-10-01";
  const fp1 = insightsFingerprint(baseInput(), today);
  const fp2 = insightsFingerprint(baseInput({ week: { scheduled: 5, done: 4, late: 0, missed: 2 } }), today);
  assert.notEqual(fp1, fp2, "changing week.done changes the fingerprint");
  const fp3 = insightsFingerprint(baseInput(), today);
  assert.equal(fp1, fp3, "the same input on the same day is stable");
}

// --- 8: fingerprint changes when the date changes
{
  const fp1 = insightsFingerprint(baseInput(), "2026-10-01");
  const fp2 = insightsFingerprint(baseInput(), "2026-10-02");
  assert.notEqual(fp1, fp2, "a different 'today' changes the fingerprint");
}

// --- 9: a firstName with an "@" anywhere is never used -- not even an
// email's local part -- so the prompt says "there" instead
{
  const { system, user } = insightsPrompt(baseInput({ firstName: "aisha.k@example.com" }));
  assert.ok(!system.includes("@") && !user.includes("@"), "no '@' anywhere in the prompt");
  assert.ok(!user.includes("aisha.k"), "an email's local part never reaches the prompt");
  assert.ok(user.includes('"name":"there"'), "the neutral fallback name is used");
  for (const raw of ["Aisha aisha@x.com", "a@b", "@", "Aisha Khan (aisha@example.com)"]) {
    assert.equal(sanitiseFirstName(raw), "there", `"${raw}" contains "@", so no name is used`);
  }
  assert.equal(sanitiseFirstName("Aisha Khan"), "Aisha");
  assert.equal(sanitiseFirstName("   "), "there");
}

// --- 9b: prompt sanitises "first word" too (a name with a space, no '@')
{
  const { user } = insightsPrompt(baseInput({ firstName: "Aisha Khan" }));
  assert.ok(user.includes("Aisha"), "the first word of the name is present");
  assert.ok(!user.includes("Aisha Khan"), "only the first word is used, not the full name");
}

// --- 9c: the prompt asks for test-day tips when daysToExam <= 2
{
  const soon = insightsPrompt(baseInput({ daysToExam: 2 }));
  assert.ok(/test.?day/i.test(soon.system), "system prompt mentions test-day guidance when the exam is imminent");
  const far = insightsPrompt(baseInput({ daysToExam: 30 }));
  assert.ok(!/test.?day/i.test(far.system), "no test-day instruction when the exam isn't imminent");
}

console.log("sat-coach-insights tests passed");
