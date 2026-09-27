// Tests for the pure "Coach says" insights builders
// (src/lib/sat/coach/insights-core.ts): prompt shape/sanitisation, JSON
// parsing/validation, the deterministic rules fallback and the inputs
// fingerprint.
import assert from "node:assert/strict";
import {
  MAX_FIRST_NAME_CHARS, fallbackInsights, insightsCacheable, insightsFingerprint, insightsKnownNumbers, insightsPrompt, insightsRequest, onlyKnownNumbers, parseInsights,
  sanitiseFirstName,
} from "../src/lib/sat/coach/insights-core.ts";

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
  const parsed = parseInsights(validInsights(), baseInput());
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
  assert.equal(parseInsights(bad, baseInput()), null, "more than 3 tips is rejected");
}

// --- 3: parseInsights rejects a 400-char tip body
{
  const bad = validInsights();
  bad.tips = [{ title: "Too long", body: "x".repeat(400) }];
  assert.equal(parseInsights(bad, baseInput()), null, "a tip body over 280 chars is rejected");
}

// --- 4: parseInsights rejects a missing summary
{
  const bad = validInsights();
  delete bad.summary;
  assert.equal(parseInsights(bad, baseInput()), null, "a missing summary is rejected");
}

// --- 4b: parseInsights rejects non-object / garbage input, never throws
{
  assert.equal(parseInsights(null, baseInput()), null);
  assert.equal(parseInsights("not json", baseInput()), null);
  assert.equal(parseInsights({ headline: "x".repeat(200), summary: "s", tips: [] }, baseInput()), null, "a headline over 90 chars is rejected");
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

// --- 9a (final review 162a): the first name is capped at 30 characters --
// a 100-character single token (students edit their own name) is cut
// between characters, and an "@" anywhere still means no name at all
{
  const long = "A".repeat(100);
  assert.equal(sanitiseFirstName(long), "A".repeat(30));
  assert.equal(MAX_FIRST_NAME_CHARS, 30);
  assert.equal(sanitiseFirstName(`${long} Khan`), "A".repeat(30));
  assert.equal(sanitiseFirstName("Muhammad-Abdullah-Rahman-Siddiqui"), "Muhammad-Abdullah-Rahman-Siddi");
  assert.equal(sanitiseFirstName("Aisha"), "Aisha", "a normal name is untouched");
  assert.equal(sanitiseFirstName("😀".repeat(40)), "😀".repeat(30), "never cut inside a character");
  assert.equal(sanitiseFirstName(`${long}@example.com`), "there");
  const { user } = insightsPrompt(baseInput({ firstName: long }));
  assert.ok(user.includes(`"name":"${"A".repeat(30)}"`) && !user.includes("A".repeat(31)), "the prompt carries the capped name");
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

// --- 10 (final review M3): the AI text goes through the parent summary's
// unknown-number guard -- a score-sized number or a "points" figure the
// prompt didn't carry rejects the reply, and the caller shows the rules view
{
  const input = baseInput(); // target 1400, latest official 1180–1210
  const withTip = (body) => ({ ...validInsights(), tips: [{ title: "Next step", body }] });
  assert.equal(parseInsights(withTip("You're on track for 1350 by October."), input), null, "an invented score is rejected");
  assert.equal(parseInsights(withTip("That could add 45 points to your score."), input), null, "an invented gain is rejected");
  assert.equal(parseInsights(withTip("Aim for a 150-point jump."), input), null, "a hyphenated points figure too");
  assert.equal(parseInsights(withTip("You could reach 1,450 soon."), input), null, "a comma-grouped score too");
  assert.equal(parseInsights({ ...validInsights(), headline: "Push for 1500" }, input), null, "in the headline too");
  assert.equal(parseInsights({ ...validInsights(), summary: "Math is at 60% while your target is 1500." }, input), null, "in the summary too");

  const ok = parseInsights(withTip("Your latest official range is 1180–1210 and your target is 1,400: keep going."), input);
  assert.ok(ok, "the target and the latest range's bounds are known");
  assert.equal(ok.source, "ai");
  assert.ok(parseInsights(withTip("Algebra is at 35% mastery with 30 days to go; you missed 2 of 5 sessions."), input), "small numbers and prompt numbers pass");
  assert.ok(parseInsights(withTip("Your Algebra answers take 130s on average."), input), "pacing seconds from the prompt pass");
  const slow = baseInput({ pacingFlags: [{ label: "Algebra", medianSec: 215.4, accuracy: 0.4 }] });
  assert.ok(parseInsights(withTip("You average 215 seconds on Algebra."), slow), "a rounded pacing figure the prompt carried passes");
  assert.equal(parseInsights(withTip("You average 250 seconds on Algebra."), slow), null);

  // The prompt asks for no points figures at all (a live Gemini reply wrote
  // "a 200-point gap", which the guard refused); insightsRequest is the call.
  assert.match(insightsPrompt(input).system, /Never state a points gap, a score gain or a predicted score/);
  const req = insightsRequest(input);
  assert.deepEqual(req.messages, [{ role: "user", content: insightsPrompt(input).user }]);
  assert.equal(req.json, true);
  assert.equal(req.maxTokens, 700);
  assert.equal(parseInsights({ ...validInsights(), headline: "Aisha, let's close the 200-point gap in 37 days." }, input), null, "the live reply the guard caught");

  // Known numbers = the prompt's numbers + its fractions as whole percentages.
  const known = insightsKnownNumbers(input);
  for (const n of [1400, 1180, 1210, 30, 72, 60, 35, 42, 85, 130, 40]) assert.ok(known.has(n), `${n} is known`);
  assert.ok(!known.has(1350));
  const noScore = insightsKnownNumbers(baseInput({ latestScore: null }));
  assert.ok(!noScore.has(1180) && noScore.has(1400), "no latest score, no range bounds");

  // The shared guard itself (the parent email's summary uses it too).
  assert.equal(onlyKnownNumbers("Scored 1300.", new Set([1300])), true);
  assert.equal(onlyKnownNumbers("Scored 1300.", new Set()), false);
  assert.equal(onlyKnownNumbers("Up 7 percentage points.", new Set()), false, "a points figure of any size must be known");
  assert.equal(onlyKnownNumbers("Up 7 percentage points.", new Set([7])), true);
  assert.equal(onlyKnownNumbers("Answered 84 questions in 190 minutes.", new Set()), true, "numbers under 200 that aren't points pass");
}

// --- 11 (final review M2): a fallback from a passing provider failure isn't
// cached for the day (the next visit retries); budget / no-provider /
// unusable-reply fallbacks and AI views are
{
  assert.equal(insightsCacheable({ ok: false, reason: "timeout" }), false);
  assert.equal(insightsCacheable({ ok: false, reason: "http", status: 500 }), false);
  assert.equal(insightsCacheable({ ok: false, reason: "http" }), false, "a network failure (no status)");
  assert.equal(insightsCacheable({ ok: false, reason: "budget", scope: "student" }), true);
  assert.equal(insightsCacheable({ ok: false, reason: "budget", scope: "global" }), true);
  assert.equal(insightsCacheable({ ok: false, reason: "budget", scope: "unavailable" }), false, "an unreadable budget counter is passing too (M4)");
  assert.equal(insightsCacheable({ ok: false, reason: "no-provider" }), true);
  assert.equal(insightsCacheable({ ok: false, reason: "parse" }), true);
  assert.equal(insightsCacheable({ ok: false, reason: "empty" }), true);
  assert.equal(insightsCacheable({ ok: true, text: "{}", json: {}, provider: "gemini", model: "m", usage: { input: 1, output: 1 } }), true);
}

// --- 12 (final review M15): the rules copy uses "—", and after a miss says
// something true about the streak (a miss has already broken it)
{
  const views = [
    fallbackInsights(baseInput()),
    fallbackInsights(baseInput({ weakSkills: [], pacingFlags: [], week: { scheduled: 0, done: 0, late: 0, missed: 0 }, daysToExam: null })),
    fallbackInsights(baseInput({ daysToExam: 1 })),
  ];
  for (const view of views) {
    const text = [view.headline, view.summary, ...view.tips.flatMap((t) => [t.title, t.body])].join(" | ");
    assert.ok(!text.includes("--"), `no " -- " in the rules copy: ${text}`);
  }
  const missed = fallbackInsights(baseInput({ weakSkills: [], pacingFlags: [], daysToExam: 30 }));
  const catchUp = missed.tips.find((t) => t.title === "Catch up this week");
  assert.equal(catchUp.body, "You missed 2 sessions this week — your next session done on its day starts a new streak.");
  assert.ok(!/keeps your streak alive/.test(JSON.stringify(missed)));
  assert.match(missed.summary, /You missed 2 of 5 sessions this week — let's get back on track\./);
}

console.log("sat-coach-insights tests passed");
