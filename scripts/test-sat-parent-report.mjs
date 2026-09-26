// Tests for the SAT section of the Saturday parent email (SAT Coach Task 12,
// spec 9): the warning rule, the week's tallies from the plan, the week's
// activity from finished items, the deterministic summary and the AI
// summary's validation, the HTML/text rendering and how the SAT section
// joins the unchanged Physics email (src/lib/sat/coach/parent-report-core.ts).
// Dates are PKT calendar days; 2026-09-26 is a Saturday, so "this week" is
// Mon 2026-09-21 .. Sun 2026-09-27.
import assert from "node:assert/strict";
import {
  activityIn, composeParentEmail, fallbackSummary, parentFirstName, parseSummary, renderSatSectionHtml, renderSatSectionText,
  reportWeek, satWeekFrom, sessionTally, summaryPrompt, textBlockHtml, warningLevel, warningText, weekFullExam, COLORS,
} from "../src/lib/sat/coach/parent-report-core.ts";
import { formatPk, formatPkDay } from "../src/lib/portal/pk-time.ts";

const RUN = "2026-09-26";
const WEEK = reportWeek(RUN);

function week(overrides = {}) {
  return {
    firstName: "Ali",
    weekLabel: "Mon 21 Sept – Sun 27 Sept",
    asOf: "Sat 26 Sept",
    scheduled: 5, done: 3, late: 1, missed: 1, upcoming: 1,
    answered: 84, accuracy: 72, accuracyPrev: 65, minutes: 130,
    fullExam: { title: "Official Practice Test 5", score: "1180–1240 (official range)", status: "done" },
    streak: 2,
    daysToExam: 42,
    examWhen: "7 November 2026",
    targetScore: 1400,
    scores: [
      { label: "Official Practice Test 5", range: "1180–1240", lower: 1180, upper: 1240, date: "26 Sept", official: true },
      { label: "Adaptive mock", range: "1100–1200", lower: 1100, upper: 1200, date: "12 Sept", official: false },
    ],
    estimateBasis: "Estimated from the average of 8 R&W and 8 Math official conversion tables.",
    sections: { rw: 74, math: 61 },
    strongest: "Words in Context",
    weakest: "Linear functions",
    summary: "Ali practised on most planned days. Linear functions is the next focus.",
    summarySource: "rules",
    ...overrides,
  };
}

const item = (id, date, kind, status, extra = {}) => ({ id, date, kind, status, ...extra });

// --- 1: reportWeek -- the Monday-to-Sunday ISO week holding the run date
{
  assert.deepEqual(reportWeek("2026-09-26"), { start: "2026-09-21", end: "2026-09-27", runDate: "2026-09-26", prevStart: "2026-09-14", prevEnd: "2026-09-20" });
  assert.equal(reportWeek("2026-09-27").start, "2026-09-21", "a Sunday run is the same week");
  assert.equal(reportWeek("2026-09-21").end, "2026-09-27", "a Monday run is the same week");
}

// --- 2: warningLevel, exactly the brief's cases
{
  assert.equal(warningLevel(week({ scheduled: 0, done: 0, late: 0, missed: 0 })), "none", "0 scheduled -> none");
  assert.equal(warningLevel(week({ scheduled: 5, done: 0, late: 0, missed: 5 })), "missed-week", "5 scheduled, 0 done -> missed-week");
  assert.equal(warningLevel(week({ scheduled: 5, done: 4, late: 0, missed: 1 })), "partial", "4 done, 1 missed -> partial");
  assert.equal(warningLevel(week({ scheduled: 5, done: 3, late: 2, missed: 0 })), "partial", "3 done, 2 late -> partial");
  assert.equal(warningLevel(week({ scheduled: 5, done: 5, late: 0, missed: 0 })), "none", "5 done -> none");
  assert.equal(warningLevel(week({ scheduled: 5, done: 0, late: 5, missed: 0 })), "missed-week", "late counts as missed");
  assert.equal(warningLevel(week({ scheduled: 0, done: 0, late: 0, missed: 0, upcoming: 3 })), "none", "sessions still to come are never missed");
}

// --- 3: warningText, the brief's exact strings
{
  assert.equal(warningText(week({ scheduled: 5, done: 0, late: 0, missed: 5 })), "⚠ Ali missed all 5 SAT practice sessions this week.");
  assert.equal(warningText(week({ scheduled: 5, done: 4, late: 0, missed: 1 })), "Ali missed 1 of 5 SAT sessions this week.");
  assert.equal(warningText(week({ scheduled: 5, done: 3, late: 2, missed: 0 })), "Ali missed 2 of 5 SAT sessions this week.");
  assert.equal(warningText(week({ scheduled: 5, done: 5, late: 0, missed: 0 })), null);
  assert.equal(warningText(week({ scheduled: 1, done: 0, late: 0, missed: 1 })), "⚠ Ali missed the one SAT practice session this week.", "singular reads as English");
}

// --- 4: sessionTally -- challenges and review days of this week, as of the run date
{
  const items = [
    item("c0", "2026-09-20", "challenge", "done"),                  // last week
    item("c1", "2026-09-21", "challenge", "done"),
    item("d1", "2026-09-21", "diagnostic", "missed"),               // not a daily session
    item("c2", "2026-09-22", "challenge", "late"),
    item("c3", "2026-09-23", "challenge", "missed"),
    item("c4", "2026-09-24", "challenge", "scheduled"),             // day over, maintenance not run yet
    item("c5", "2026-09-25", "challenge", "missed"),                // finished late, not recorded yet
    item("c6", "2026-09-26", "challenge", "scheduled"),             // today, still open
    item("r1", "2026-09-26", "review", "done"),                     // today, done
    item("m1", "2026-09-26", "mock", "scheduled", { mock: { kind: "adaptive" } }),
    item("c7", "2026-09-27", "challenge", "scheduled"),             // later this week
    item("c8", "2026-09-22", "challenge", "scheduled"),             // finished on its day, not recorded yet
  ];
  const done = { c5: { finishedDate: "2026-09-26", sessionId: "s5" }, c8: { finishedDate: "2026-09-22", sessionId: "s8" } };
  assert.deepEqual(sessionTally(items, WEEK, done), { scheduled: 7, done: 3, late: 2, missed: 2, upcoming: 2 });
  assert.deepEqual(sessionTally([], WEEK, {}), { scheduled: 0, done: 0, late: 0, missed: 0, upcoming: 0 });
}

// --- 5: weekFullExam -- this week's full exam, its score only when one exists
{
  const official = { authority: "official", lower: 1180, upper: 1240, testNo: 5 };
  const estimated = { authority: "estimated", lower: 1100, upper: 1200, basis: "b" };
  const practice = { mock: { kind: "practice", testNo: 5 } };
  const scores = { s1: official, s2: estimated };
  const scoreOf = (id) => scores[id] ?? null;

  assert.deepEqual(weekFullExam([item("m1", "2026-09-23", "mock", "done", { ...practice, sessionId: "s1" })], WEEK, {}, scoreOf),
    { title: "Official Practice Test 5", score: "1180–1240 (official range)", status: "done" });
  assert.deepEqual(weekFullExam([item("m1", "2026-09-23", "mock", "late", { mock: { kind: "adaptive" }, sessionId: "s2" })], WEEK, {}, scoreOf),
    { title: "Adaptive mock exam", score: "1100–1200 (estimated)", status: "done" });
  assert.deepEqual(weekFullExam([item("m1", "2026-09-23", "mock", "missed", practice)], WEEK, { m1: { finishedDate: "2026-09-23", sessionId: "s9" } }, scoreOf),
    { title: "Official Practice Test 5", score: null, status: "done" }, "a finish the plan hasn't recorded counts; no score -> null");
  assert.deepEqual(weekFullExam([item("m1", "2026-09-27", "mock", "scheduled", { mock: { kind: "adaptive" } })], WEEK, {}, scoreOf),
    { title: `Adaptive mock exam · ${formatPkDay("2026-09-27")}`, score: null, status: "scheduled" });
  assert.deepEqual(weekFullExam([
    item("m1", "2026-09-22", "mock", "missed", practice),
    item("m2", "2026-09-29", "mock", "scheduled", { ...practice, replacementFor: "m1" }),
  ], WEEK, {}, scoreOf), { title: `Official Practice Test 5 — moved to ${formatPkDay("2026-09-29")}`, score: null, status: "missed" });
  assert.deepEqual(weekFullExam([
    item("m1", "2026-09-22", "mock", "missed", practice),
    item("m2", "2026-09-26", "mock", "done", { ...practice, replacementFor: "m1", sessionId: "s1" }),
  ], WEEK, {}, scoreOf), { title: "Official Practice Test 5", score: "1180–1240 (official range)", status: "done" }, "a replacement sat this week wins");
  assert.deepEqual(weekFullExam([item("m0", "2026-09-19", "mock", "done", practice)], WEEK, {}, scoreOf), { title: "", score: null, status: "none" });
}

// --- 6: activityIn -- finished items by their PKT day
{
  const items = [
    { at: Date.parse("2026-09-20T18:59:00Z"), correct: true, timeMs: 60_000 },   // Sun 20 23:59 PKT: last week
    { at: Date.parse("2026-09-20T19:30:00Z"), correct: true, timeMs: 90_000 },   // Mon 21 00:30 PKT: this week
    { at: Date.parse("2026-09-24T08:00:00Z"), correct: false, timeMs: 30_000 },
    { at: Date.parse("2026-09-24T08:05:00Z"), correct: true },                    // no timing data
    { at: Date.parse("2026-09-15T08:00:00Z"), correct: false, timeMs: 45_000 },
  ];
  assert.deepEqual(activityIn(items, WEEK.start, WEEK.runDate), { answered: 3, correct: 2, ms: 120_000 });
  assert.deepEqual(activityIn(items, WEEK.prevStart, WEEK.prevEnd), { answered: 2, correct: 1, ms: 105_000 });
}

// --- 7: parentFirstName
{
  assert.equal(parentFirstName("Ali Khan"), "Ali");
  assert.equal(parentFirstName("  "), "Your child");
  assert.equal(parentFirstName(""), "Your child");
  assert.equal(parentFirstName("@example.com"), "Your child");
  assert.equal(parentFirstName("ali@example.com"), "ali", "never an email address");
}

// --- 8: fallbackSummary -- the brief's sentence, and the edges
{
  assert.equal(fallbackSummary(week()),
    "Ali practised on 3 of 5 planned days and answered 84 questions at 72% accuracy. Strongest: Words in Context; next focus: Linear functions.");
  assert.equal(fallbackSummary(week({ strongest: null, weakest: null })), "Ali practised on 3 of 5 planned days and answered 84 questions at 72% accuracy.");
  assert.equal(fallbackSummary(week({ strongest: null })), "Ali practised on 3 of 5 planned days and answered 84 questions at 72% accuracy. Next focus: Linear functions.");
  assert.equal(fallbackSummary(week({ scheduled: 0, done: 0, answered: 0, accuracy: null, strongest: null, weakest: null })),
    "Ali had no SAT sessions planned this week and answered no questions.");
  assert.equal(fallbackSummary(week({ scheduled: 5, done: 0, answered: 1, accuracy: 100, strongest: null, weakest: null })),
    "Ali practised on 0 of 5 planned days and answered 1 question at 100% accuracy.");
}

// --- 9: summaryPrompt -- first name and the week's numbers only
{
  const { system, user } = summaryPrompt(week());
  const data = JSON.parse(user);
  assert.equal(data.name, "Ali");
  assert.deepEqual(Object.keys(data).sort(), ["daysToSat", "name", "strongestSkill", "thisWeek", "weakestSkill"]);
  assert.ok(!user.includes("1180") && !user.includes("1100") && !user.includes("1400"), "no score or target reaches the prompt");
  assert.equal(data.thisWeek.sessionsPlanned, 5);
  assert.equal(data.thisWeek.questionsAnswered, 84);
  assert.ok(/never/i.test(system) && /score/i.test(system), "the system prompt forbids scores");
  assert.ok(/JSON/.test(system));
}

// --- 10: parseSummary -- at most 2 sentences / 280 chars, no invented scores
{
  const w = week({ answered: 250 });
  assert.equal(parseSummary({ summary: "Ali practised on 3 of 5 days this week. Linear functions needs the most work." }, w),
    "Ali practised on 3 of 5 days this week. Linear functions needs the most work.");
  assert.equal(parseSummary({ summary: "  Ali answered 250 questions\nthis week.  " }, w), "Ali answered 250 questions this week.", "a known number is fine; whitespace collapses");
  assert.equal(parseSummary({ summary: "One. Two. Three." }, w), null, "three sentences");
  assert.equal(parseSummary({ summary: `Ali ${"practised well ".repeat(20)}.` }, w), null, "over 280 characters");
  assert.equal(parseSummary({ summary: "Ali is on track for about 1350 on the SAT." }, w), null, "an invented score");
  assert.equal(parseSummary({ summary: "Ali could reach 1,450 soon." }, w), null, "an invented score with a comma");
  assert.equal(parseSummary({ summary: "" }, w), null);
  assert.equal(parseSummary({ text: "Ali did well." }, w), null);
  assert.equal(parseSummary("Ali did well.", w), null);
  assert.equal(parseSummary(null, w), null);
}

// --- 11: HTML -- escaped, warning first, tiles, bars
{
  const html = renderSatSectionHtml(week({ firstName: "<script>alert(1)</script>", scheduled: 5, done: 0, late: 0, missed: 5 }));
  assert.ok(!html.includes("<script>"), "no raw script tag");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "the name is escaped");

  const missed = renderSatSectionHtml(week({ scheduled: 5, done: 0, late: 0, missed: 5 }));
  const warnAt = missed.indexOf("⚠ Ali missed all 5 SAT practice sessions this week.");
  assert.ok(warnAt >= 0, "the warning is in the HTML");
  assert.ok(warnAt < missed.indexOf("Practice sessions"), "the warning precedes the metric tiles");
  assert.ok(warnAt < missed.indexOf("Digital SAT"), "the warning is the first thing in the section");
  assert.ok(missed.includes(COLORS.red), "missed-week is red");

  const partial = renderSatSectionHtml(week());
  assert.ok(partial.includes("Ali missed 2 of 5 SAT sessions this week."));
  assert.ok(partial.includes(COLORS.amber) && !partial.includes(COLORS.red), "partial is amber");
  assert.ok(partial.indexOf("Ali missed 2 of 5") < partial.indexOf("Practice sessions"));

  const good = renderSatSectionHtml(week({ done: 5, late: 0, missed: 0, upcoming: 0 }));
  assert.ok(!good.includes(COLORS.red) && !good.includes(COLORS.amber), "no warning block on a good week");
  assert.ok(!good.includes("SAT sessions this week"));

  for (const label of ["Practice sessions", "Questions answered", "Accuracy", "Time practised", "Full exam", "Streak", "In two lines", "Progress so far"]) {
    assert.ok(good.includes(label), `the HTML shows ${label}`);
  }
  assert.ok(!/<(style|script|link)\b/i.test(good), "inline styles only");
  assert.ok(good.includes("max-width:600px"));
  assert.ok(good.includes("width=\"74%\""), "the R&W accuracy bar");
  assert.ok(good.includes("1180–1240") && good.includes("1400"), "latest score and target");

  const noScores = renderSatSectionHtml(week({ scores: [], estimateBasis: null, sections: { rw: null, math: null }, strongest: null, weakest: null, accuracy: null, accuracyPrev: null }));
  assert.ok(noScores.includes("No full-exam score yet"), "an empty score history says so, never a number");

  const quotes = renderSatSectionHtml(week({ strongest: `"Quotes" & 'apostrophes'` }));
  assert.ok(quotes.includes("&quot;Quotes&quot; &amp; &#39;apostrophes&#39;"));
}

// --- 12: text -- every metric, warning first
{
  const w = week();
  const text = renderSatSectionText(w);
  const needles = [
    "Ali missed 2 of 5 SAT sessions this week.",
    "Mon 21 Sept – Sun 27 Sept", "Sat 26 Sept",
    "Practice sessions: 3 of 5 done", "1 late", "1 missed", "1 still to come",
    "Questions answered: 84", "Accuracy: 72%", "65%", "Time practised: 2 h 10 min",
    "Full exam: Official Practice Test 5", "1180–1240 (official range)", "Streak: 2",
    "7 November 2026", "42 days", "Target score: 1400",
    "26 Sept", "1100–1200", "estimated", "Estimated from the average",
    "Reading and Writing 74%", "Math 61%", "Words in Context", "Linear functions",
    w.summary,
  ];
  for (const n of needles) assert.ok(text.includes(n), `the text has "${n}"`);
  assert.ok(text.indexOf("Ali missed 2 of 5") < text.indexOf("Practice sessions"), "the warning leads");
  assert.ok(!text.includes("<"), "plain text");

  const none = renderSatSectionText(week({ fullExam: { title: "", score: null, status: "none" }, accuracy: null, accuracyPrev: null, answered: 0, scores: [], sections: { rw: null, math: null } }));
  assert.ok(none.includes("Full exam: none this week"));
  assert.ok(none.includes("Accuracy: —"));
  assert.ok(none.includes("No full-exam score yet"));
  const missedExam = renderSatSectionText(week({ fullExam: { title: "Adaptive mock exam", score: null, status: "missed" } }));
  assert.ok(missedExam.includes("Full exam: missed — Adaptive mock exam"));
}

// --- 13: satWeekFrom -- the whole week from raw inputs
{
  const items = [
    item("c1", "2026-09-21", "challenge", "done"),
    item("c2", "2026-09-23", "challenge", "done"),
    item("c3", "2026-09-24", "challenge", "missed"),
    item("m1", "2026-09-25", "mock", "done", { mock: { kind: "practice", testNo: 5 }, sessionId: "p5" }),
    item("c4", "2026-09-27", "challenge", "scheduled"),
    item("x1", "2026-11-07", "exam", "scheduled"),
  ];
  const official = { authority: "official", lower: 1180, upper: 1240, testNo: 5 };
  const estimated = { authority: "estimated", lower: 1100, upper: 1200, basis: "Estimated from the average of official tables." };
  const analytics = {
    sections: { rw: { answered: 100, correct: 74, accuracy: 0.74 }, math: { answered: 50, correct: 30, accuracy: 0.6049 } },
    skills: [
      { key: "words in context", label: "Words in Context", section: "rw", attempts: 12, correct: 10, mastery: 0.8, confidence: 6, trend: 0, lastAt: 1 },
      { key: "boundaries", label: "Boundaries", section: "rw", attempts: 2, correct: 2, mastery: 0.9, confidence: 1.5, trend: 0, lastAt: 1 },
      { key: "linear functions", label: "Linear functions", section: "math", attempts: 9, correct: 3, mastery: 0.35, confidence: 5, trend: 0, lastAt: 1 },
    ],
    weakSkills: [{ key: "linear functions", label: "Linear functions", domain: "algebra", section: "math", mastery: 0.35, priority: 0.2 }],
    scores: {
      latestOfficial: { id: "p5", kind: "practice", title: "Official Practice Test 5", finishedAt: Date.parse("2026-09-25T10:00:00Z"), score: official },
      latestEstimate: { id: "a1", kind: "adaptive", title: "Adaptive Mock", finishedAt: Date.parse("2026-09-12T10:00:00Z"), score: estimated },
      history: [
        { id: "a1", kind: "adaptive", title: "Adaptive Mock", finishedAt: Date.parse("2026-09-12T10:00:00Z"), score: estimated },
        { id: "p5", kind: "practice", title: "Official Practice Test 5", finishedAt: Date.parse("2026-09-25T10:00:00Z"), score: official },
      ],
    },
  };
  const activity = [
    { at: Date.parse("2026-09-21T10:00:00Z"), correct: true, timeMs: 600_000 },
    { at: Date.parse("2026-09-21T10:05:00Z"), correct: false, timeMs: 300_000 },
    { at: Date.parse("2026-09-23T10:00:00Z"), correct: true, timeMs: 1_500_000 },
    { at: Date.parse("2026-09-23T10:02:00Z"), correct: true },
    { at: Date.parse("2026-09-16T10:00:00Z"), correct: true, timeMs: 60_000 },
    { at: Date.parse("2026-09-16T10:00:00Z"), correct: false, timeMs: 60_000 },
  ];
  const w = satWeekFrom({
    fullName: "Ali Khan",
    runDate: RUN,
    profile: { examDate: "2026-11-07", targetMonth: null, targetScore: 1400 },
    planItems: items,
    done: {},
    analytics,
    summaries: [{ id: "p5", score: official }],
    items: activity,
  });
  assert.equal(w.firstName, "Ali");
  assert.equal(w.weekLabel, `${formatPkDay("2026-09-21")} – ${formatPkDay("2026-09-27")}`);
  assert.equal(w.asOf, formatPkDay(RUN));
  assert.deepEqual([w.scheduled, w.done, w.late, w.missed, w.upcoming], [3, 2, 0, 1, 1]);
  assert.deepEqual([w.answered, w.accuracy, w.accuracyPrev, w.minutes], [4, 75, 50, 40]);
  assert.deepEqual(w.fullExam, { title: "Official Practice Test 5", score: "1180–1240 (official range)", status: "done" });
  assert.equal(w.streak, 1, "Friday's exam on its day, after Thursday's miss (coach-view planStreak)");
  assert.equal(w.daysToExam, 42);
  assert.equal(w.examWhen, formatPkDay("2026-11-07", { day: "numeric", month: "long", year: "numeric" }));
  assert.equal(w.targetScore, 1400);
  assert.deepEqual(w.scores.map((s) => [s.label, s.range, s.official]), [["Official Practice Test 5", "1180–1240", true], ["Adaptive Mock", "1100–1200", false]]);
  assert.equal(w.scores[0].date, formatPk(Date.parse("2026-09-25T10:00:00Z"), { day: "numeric", month: "short" }));
  assert.equal(w.estimateBasis, estimated.basis);
  assert.deepEqual(w.sections, { rw: 74, math: 60 });
  assert.equal(w.strongest, "Words in Context", "Boundaries has too little evidence");
  assert.equal(w.weakest, "Linear functions");
  assert.equal(w.summary, fallbackSummary(w));
  assert.equal(w.summarySource, "rules");

  const bare = satWeekFrom({
    fullName: "", runDate: RUN, profile: { examDate: null, targetMonth: "2026-12", targetScore: 1300 },
    planItems: [], done: {}, analytics: null, summaries: [], items: [],
  });
  assert.equal(bare.firstName, "Your child");
  assert.deepEqual([bare.scheduled, bare.answered, bare.accuracy, bare.accuracyPrev, bare.minutes, bare.streak], [0, 0, null, null, 0, 0]);
  assert.equal(bare.daysToExam, 66, "to the target month's first day");
  assert.ok(bare.examWhen && bare.examWhen.includes("not booked yet"));
  assert.deepEqual(bare.scores, []);
  assert.equal(bare.estimateBasis, null);
  assert.deepEqual(bare.sections, { rw: null, math: null });
  assert.equal(bare.fullExam.status, "none");
  assert.equal(warningLevel(bare), "none");

  const passed = satWeekFrom({
    fullName: "Ali", runDate: RUN, profile: { examDate: "2026-09-05", targetMonth: null, targetScore: 1300 },
    planItems: [], done: {}, analytics: null, summaries: [], items: [],
  });
  assert.equal(passed.daysToExam, null, "a passed SAT has no countdown");
}

// --- 14: composeParentEmail -- Physics unchanged, SAT joined, SAT-only wrapped
{
  // The Physics block exactly as weekly-reports.ts built it before SAT.
  const OLD = (text) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;
  const physics = { subject: "Physics progress update — Ali Khan", body: "Dear Mrs Khan,\n\n• Accuracy: 70% & <rising>.\n\nWarm regards,\nSyed Jabran Ali Kamran" };
  assert.equal(textBlockHtml(physics.body), OLD(physics.body));

  const only = composeParentEmail({ studentName: "Ali Khan", guardianName: "Mrs Khan", physics, sat: null });
  assert.deepEqual(only, { subject: physics.subject, text: physics.body, html: OLD(physics.body) }, "physics-only is byte-for-byte unchanged");

  const w = week();
  const satOnly = composeParentEmail({ studentName: "Ali Khan", guardianName: "Mrs <Khan>", physics: null, sat: w });
  assert.equal(satOnly.subject, "Digital SAT weekly update — Ali Khan");
  assert.ok(satOnly.text.startsWith("Dear Mrs <Khan>,"));
  assert.ok(satOnly.text.includes(renderSatSectionText(w)));
  assert.ok(satOnly.text.includes("Warm regards,"));
  assert.ok(satOnly.html.includes("Dear Mrs &lt;Khan&gt;,"), "the guardian name is escaped");
  assert.ok(satOnly.html.includes(renderSatSectionHtml(w)));

  const both = composeParentEmail({ studentName: "Ali Khan", guardianName: "Mrs Khan", physics, sat: w });
  assert.equal(both.subject, "Weekly progress update — Ali Khan (Physics and Digital SAT)");
  assert.ok(both.text.startsWith(physics.body), "the Physics text comes first, unchanged");
  assert.ok(both.text.includes(renderSatSectionText(w)));
  assert.ok(both.html.startsWith(OLD(physics.body)), "the Physics HTML block comes first, unchanged");
  assert.ok(both.html.includes(renderSatSectionHtml(w)));

  const unavailable = composeParentEmail({ studentName: "Ali Khan", guardianName: "Mrs Khan", physics, sat: "unavailable" });
  assert.ok(unavailable.text.startsWith(physics.body));
  assert.ok(unavailable.text.includes("couldn't be prepared") && unavailable.html.includes("couldn&#39;t be prepared"));
  assert.ok(unavailable.html.startsWith(OLD(physics.body)));
  assert.equal(composeParentEmail({ studentName: "Ali Khan", guardianName: "Mrs Khan", physics: null, sat: "unavailable" }), null);
  assert.equal(composeParentEmail({ studentName: "Ali Khan", guardianName: "Mrs Khan", physics: null, sat: null }), null);
}

console.log("sat-parent-report tests passed");
