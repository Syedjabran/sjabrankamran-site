// Tests for the pure Digital SAT Tutor core (src/lib/sat/coach/tutor-core.ts)
// and its knowledge pack (knowledge.ts): action validation (open paths,
// drill filters and counts, full-exam moves through checkMove), the pause
// rule, history compaction, the system prompt's contents and size, the
// explain mode, and the reply contract.
import assert from "node:assert/strict";
import {
  applySummary, budgetRefusal, compactHistory, isPaused, isSatLabHref, markSummarised, parseSummary, parseTutorReply, pauseCandidateIds,
  recentMistakes, summaryRequest, trimMemory, tutorRequest, tutorSystemPrompt, MAX_STORED_MESSAGES,
} from "../src/lib/sat/coach/tutor-core.ts";
import { TUTOR_COUNT_UNAVAILABLE, TUTOR_EXPLAIN_MESSAGE, TUTOR_MAX_MESSAGE_CHARS, TUTOR_PAUSED_MESSAGE } from "../src/lib/sat/client-types.ts";
import { KNOWLEDGE_SKILLS, knowledgePack } from "../src/lib/sat/coach/knowledge.ts";
import { modelAcceptsImages } from "../src/lib/ai/llm-core.ts";
import { loadQuestionBank } from "../src/lib/sat/bank.ts";

const TODAY = "2026-09-26";
const NOW = Date.parse("2026-09-26T10:00:00+05:00");
const MIN = 60_000;

function bankSkills() {
  const seen = new Map();
  for (const q of loadQuestionBank()) {
    const key = q.skill.toLowerCase();
    if (!seen.has(key)) seen.set(key, { skill: q.skill, domain: q.domain, section: q.section });
  }
  return [...seen.values()];
}

function planItems() {
  return [
    { id: "c1", date: "2026-09-27", kind: "challenge", status: "scheduled", size: 15 },
    { id: "m1", date: "2026-10-10", kind: "mock", status: "scheduled", mock: { kind: "practice", testNo: 5 } },
    { id: "m2", date: "2026-10-24", kind: "mock", status: "scheduled", mock: { kind: "adaptive" } },
    { id: "done1", date: "2026-09-20", kind: "mock", status: "done", mock: { kind: "practice", testNo: 4 }, sessionId: "s1" },
    { id: "exam", date: "2026-11-08", kind: "exam", status: "scheduled" },
  ];
}

function ctx(overrides = {}) {
  return {
    firstName: "Aisha Khan",
    today: TODAY,
    profile: {
      examDate: "2026-11-08", targetMonth: null, targetScore: 1400,
      start: { kind: "score", total: 1150, source: "PSAT" }, days: [1, 3, 5, 6], minutes: 30,
    },
    plan: { items: planItems() },
    analytics: {
      totals: { answered: 320, correct: 210, last7: { answered: 40, correct: 28 }, last30: { answered: 200, correct: 130 } },
      sections: { rw: { answered: 180, correct: 130, accuracy: 0.72 }, math: { answered: 140, correct: 80, accuracy: 0.57 } },
      skills: [
        { key: "words in context", label: "Words in Context", section: "rw", domain: "craft-structure", mastery: 0.83, confidence: 12, attempts: 14, trend: 0.05 },
        { key: "linear functions", label: "Linear functions", section: "math", domain: "algebra", mastery: 0.41, confidence: 9, attempts: 10, trend: -0.02 },
      ],
      weakSkills: [
        { key: "linear functions", label: "Linear functions", domain: "algebra", section: "math", mastery: 0.41, priority: 0.2 },
        { key: "boundaries", label: "Boundaries", domain: "standard-english", section: "rw", mastery: 0.48, priority: 0.13 },
      ],
      notEnoughData: [{ key: "circles", label: "Circles", attempts: 1 }],
      pacing: { rw: { medianSec: 80, targetSec: 71, samples: 120 }, math: { medianSec: null, targetSec: 95, samples: 0 } },
      pacingFlags: [{ skill: "linear functions", label: "Linear functions", medianSec: 140, accuracy: 0.4 }],
      scores: {
        latestOfficial: { id: "s1", kind: "practice", title: "Official Practice Test 4", finishedAt: NOW - 6 * 86_400_000, score: { authority: "official", lower: 1180, upper: 1210, testNo: 4 } },
        latestEstimate: null,
        history: [{ id: "s1", kind: "practice", title: "Official Practice Test 4", finishedAt: NOW - 6 * 86_400_000, score: { authority: "official", lower: 1180, upper: 1210, testNo: 4 } }],
      },
    },
    insights: { headline: "Push Linear functions this week", summary: "Math is your gap.", tips: [{ title: "Drill Linear functions", body: "..." }] },
    mistakes: [{ id: "abc123", label: "Linear functions · Hard · Math", at: NOW - 86_400_000 }],
    bankSkills: bankSkills(),
    turnId: "t1",
    ...overrides,
  };
}

const reply = (actions) => ({ reply: "Here's the plan.", actions });

// --- 1: open actions only to /portal/sat-lab paths
{
  const out = parseTutorReply(reply([
    { type: "open", label: "Admin", href: "/portal/admin" },
    { type: "open", label: "Progress", href: "/portal/sat-lab/progress" },
    { type: "open", label: "Lookalike", href: "/portal/sat-lab-evil" },
    { type: "open", label: "Escape", href: "/portal/sat-lab/../admin" },
    { type: "open", label: "External", href: "https://example.com/portal/sat-lab" },
    { type: "open", label: "Protocol-relative", href: "//example.com/portal/sat-lab" },
  ]), ctx());
  assert.ok(out, "a valid reply parses");
  assert.deepEqual(out.actions.map((a) => a.href), ["/portal/sat-lab/progress"], "only the SAT Lab path survives");
  assert.equal(out.actions[0].type, "open");
  assert.equal(typeof out.actions[0].id, "string");
  for (const ok of ["/portal/sat-lab", "/portal/sat-lab/progress", "/portal/sat-lab/tutor?explain=abc&from=s1", "/portal/sat-lab/settings#sat-start"]) assert.equal(isSatLabHref(ok), true, ok);
  for (const bad of ["/portal/admin", "/portal/sat-lab-evil", "/portal/sat-lab/../admin", "//x.com/portal/sat-lab", "https://x.com/portal/sat-lab", "/portal/sat-lab/a b", 42, null]) assert.equal(isSatLabHref(bad), false, String(bad));
}

// --- 2: create_drill: count 5–30, filter valid for the bank's domains/skills
{
  const out = parseTutorReply(reply([
    { type: "create_drill", label: "Big", filter: { skill: "Linear functions" }, count: 50 },
    { type: "create_drill", label: "Tiny", filter: { skill: "Linear functions" }, count: 3 },
    { type: "create_drill", label: "Bad domain", filter: { domain: "calculus" }, count: 10 },
    { type: "create_drill", label: "Wrong section", filter: { section: "rw", domain: "algebra" }, count: 10 },
    { type: "create_drill", label: "Unknown skill", filter: { skill: "Astrology" }, count: 10 },
    { type: "create_drill", label: "Skill in another domain", filter: { domain: "algebra", skill: "Boundaries" }, count: 10 },
  ]), ctx());
  assert.equal(out.actions.length, 0, "every invalid drill is dropped");

  const ok = parseTutorReply(reply([
    { type: "create_drill", label: "x", filter: { skill: "linear FUNCTIONS", difficulty: "H" }, count: 10 },
    { type: "create_drill", label: "y", filter: { section: "rw", domain: "standard-english" }, count: 30 },
  ]), ctx());
  assert.equal(ok.actions.length, 2);
  assert.deepEqual(ok.actions[0].filter, { section: "math", domain: "algebra", skill: "Linear functions", difficulty: "H" }, "skill takes the bank's spelling and its domain/section");
  assert.equal(ok.actions[0].count, 10);
  assert.match(ok.actions[0].label, /10/, "the button says how many questions");
  assert.deepEqual(ok.actions[1].filter, { section: "rw", domain: "standard-english" });
  assert.notEqual(ok.actions[0].id, ok.actions[1].id, "action ids are unique within a reply");
}

// --- 3: move_mock only when checkMove allows it
{
  const out = parseTutorReply(reply([
    { type: "move_mock", label: "a", itemId: "m1", date: "2026-10-24" },   // day already has a full exam
    { type: "move_mock", label: "b", itemId: "m1", date: "2026-09-20" },   // before today
    { type: "move_mock", label: "c", itemId: "m1", date: "2026-11-07" },   // < 2 days before the SAT
    { type: "move_mock", label: "d", itemId: "c1", date: "2026-10-12" },   // a daily challenge
    { type: "move_mock", label: "e", itemId: "done1", date: "2026-10-12" }, // already done
    { type: "move_mock", label: "f", itemId: "nope", date: "2026-10-12" },  // unknown
    { type: "move_mock", label: "g", itemId: "m1", date: "12/10/2026" },    // not a calendar day
  ]), ctx());
  assert.equal(out.actions.length, 0, "every move checkMove refuses is dropped");

  const ok = parseTutorReply(reply([{ type: "move_mock", label: "Move it", itemId: "m1", date: "2026-10-12" }]), ctx());
  assert.equal(ok.actions.length, 1);
  assert.equal(ok.actions[0].itemId, "m1");
  assert.equal(ok.actions[0].date, "2026-10-12");
  assert.match(ok.actions[0].label, /Official Practice Test 5/, "the label names the exam being moved");

  const twice = planItems().map((i) => (i.id === "m1" ? { ...i, moves: [{ from: "a", to: "b", at: "x" }, { from: "b", to: "c", at: "y" }] } : i));
  assert.equal(parseTutorReply(reply([{ type: "move_mock", label: "x", itemId: "m1", date: "2026-10-12" }]), ctx({ plan: { items: twice } })).actions.length, 0, "a third move is dropped");
  assert.equal(parseTutorReply(reply([{ type: "move_mock", label: "x", itemId: "m1", date: "2026-10-12" }]), ctx({ plan: null })).actions.length, 0, "no plan, no move");
}

// --- 4: the reply contract
{
  assert.equal(parseTutorReply(null, ctx()), null);
  assert.equal(parseTutorReply({ actions: [] }, ctx()), null, "a reply without text is not a reply");
  assert.equal(parseTutorReply({ reply: "   ", actions: [] }, ctx()), null);
  const noActions = parseTutorReply({ reply: "Hi" }, ctx());
  assert.deepEqual(noActions, { reply: "Hi", actions: [] }, "missing actions = none");
  const junk = parseTutorReply({ reply: "Hi", actions: [{ type: "delete_account" }, "x", 3, null] }, ctx());
  assert.deepEqual(junk.actions, [], "unknown action types are dropped, the reply is kept");
  const hrefs = ["/portal/sat-lab/progress", "/portal/sat-lab/settings", "/portal/sat-lab", "/portal/sat-lab/tutor", "/portal/sat-lab/settings#sat-start", "/portal/sat-lab/tutor?explain=abc123"];
  const many = parseTutorReply(reply(hrefs.map((href) => ({ type: "open", label: "p", href }))), ctx());
  assert.equal(many.actions.length, 3, "at most 3 actions");
  const dupes = parseTutorReply(reply([{ type: "open", label: "a", href: "/portal/sat-lab" }, { type: "open", label: "b", href: "/portal/sat-lab" }]), ctx());
  assert.equal(dupes.actions.length, 1, "duplicate actions collapse");
  const money = parseTutorReply({ reply: "It costs $5 and then $10 more.", actions: [] }, ctx());
  assert.equal(money.reply, "It costs $5 and then $10 more.", "money keeps its dollar signs");
  const latex = parseTutorReply({ reply: "So $x^2 = \\frac{9}{4}$ gives x.", actions: [] }, ctx());
  assert.ok(!latex.reply.includes("\\frac") && !latex.reply.includes("$"), "LaTeX becomes plain text");
  const long = parseTutorReply({ reply: "a".repeat(9000), actions: [] }, ctx());
  assert.ok(long.reply.length <= 4000, "an overlong reply is clipped");
}

// --- 5: isPaused
{
  const practice = (o) => ({ kind: "practice", finishedAt: null, stageStartedAt: NOW - 10 * MIN, breakUntil: null, minutesOfCurrent: 39, ...o });
  assert.equal(isPaused([practice({})], NOW), true, "a module started 10 min ago with 39 min on the clock is running");
  assert.equal(isPaused([practice({ stageStartedAt: null, breakUntil: NOW + 5 * MIN })], NOW), true, "on the break");
  assert.equal(isPaused([practice({ finishedAt: NOW - MIN, stageStartedAt: null })], NOW), false, "finished");
  assert.equal(isPaused([practice({ stageStartedAt: NOW - 45 * MIN })], NOW), false, "module expired more than the grace ago");
  assert.equal(isPaused([practice({ stageStartedAt: NOW - 40 * MIN })], NOW), true, "still inside the grace period");
  assert.equal(isPaused([practice({ stageStartedAt: null, breakUntil: NOW - 5 * MIN })], NOW), true, "a break that ran out started the next module");
  assert.equal(isPaused([practice({ stageStartedAt: null, breakUntil: NOW - 60 * MIN })], NOW), false, "…which has itself run out");
  assert.equal(isPaused([{ kind: "drill", finishedAt: null, stageStartedAt: NOW, breakUntil: null, minutesOfCurrent: 30 }], NOW), false, "drills never pause the tutor");
  assert.equal(isPaused([], NOW), false);
  assert.equal(isPaused([{ kind: "adaptive", finishedAt: null, stageStartedAt: NOW - MIN, breakUntil: null, minutesOfCurrent: null }], NOW), true, "unknown module length fails closed");
}

// --- 6: compactHistory
{
  const msgs = (n, summarised = 0) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}`, at: i, ...(i < summarised ? { summarised: true } : {}) }));
  const a = compactHistory(msgs(20), "");
  assert.equal(a.send.length, 8, "the last 8 turns are sent");
  assert.deepEqual(a.send.map((m) => m.text), ["m12", "m13", "m14", "m15", "m16", "m17", "m18", "m19"]);
  assert.equal(a.needsSummary, false, "20 turns fit");
  assert.equal(compactHistory(msgs(21), "").needsSummary, true, "21 turns need a summary");
  assert.equal(compactHistory(msgs(30, 12), "older stuff").needsSummary, false, "18 unsummarised turns beyond the summary fit");
  assert.equal(compactHistory(msgs(34, 12), "older stuff").needsSummary, true, "22 beyond the summary don't");
  assert.equal(compactHistory(msgs(30, 12), "").needsSummary, true, "no summary text: every stored turn counts");
  assert.equal(compactHistory(msgs(3), "").send.length, 3);

  const marked = markSummarised(msgs(21));
  assert.equal(marked.filter((m) => m.summarised).length, 13, "all but the last 8 are folded");
  assert.ok(marked.slice(-8).every((m) => !m.summarised));
  assert.equal(compactHistory(marked, "a summary").needsSummary, false);

  const trimmed = trimMemory({ summary: "s", messages: msgs(50), pendingActions: [] });
  assert.equal(trimmed.messages.length, MAX_STORED_MESSAGES);
  assert.equal(trimmed.messages[0].text, "m10", "the oldest messages are dropped");
}

// --- 7: the system prompt
{
  const prompt = tutorSystemPrompt(ctx());
  assert.ok(prompt.includes("Aisha"), "carries the first name");
  const emailish = tutorSystemPrompt(ctx({ firstName: "aisha.k@example.com Khan" }));
  assert.ok(!emailish.includes("@") && !emailish.includes("aisha.k") && emailish.includes("coaching there"), "a name with an @ is never used, not even its local part");
  assert.ok(!prompt.includes("Khan"), "only the first name");
  assert.ok(!/@/.test(prompt), "no email-like string");
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(prompt));
  assert.match(prompt, /43 days/, "carries the exam countdown");
  assert.ok(prompt.includes("2026-11-08"), "and the date");
  assert.ok(prompt.includes("1400"), "target score");
  assert.ok(prompt.includes("Linear functions"), "weak skills");
  assert.match(prompt, /Strongest: Words in Context 83%\./, "a weak skill is never listed as a strength");
  assert.ok(prompt.includes("m1") && prompt.includes("2026-10-10"), "full exams with their ids and days for move_mock");
  assert.ok(prompt.includes("1180") && /official/i.test(prompt), "the real score, labelled");
  assert.ok(prompt.includes("Push Linear functions this week"), "latest coach insights");
  assert.match(prompt, /JSON/);
  assert.match(prompt, /"reply"/);
  assert.match(prompt, /running exam|running module|exam that is running/i, "never answers a running exam's questions");
  assert.match(prompt, /hint/i, "hint first");
  assert.ok(prompt.length < 11_000, `the system prompt stays compact (${prompt.length} chars)`);

  const booked = tutorSystemPrompt(ctx({ profile: { ...ctx().profile, examDate: null, targetMonth: "2026-12" } }));
  assert.match(booked, /not booked/i);
  assert.match(booked, /66 days/, "countdown to the target month's first day");

  // Final review M7: once the SAT date has passed the tutor asks how it
  // went; a not-booked student whose target month has started is asked to
  // book a date or pick a later month instead -- never "how did it go?".
  const passed = tutorSystemPrompt(ctx({ profile: { ...ctx().profile, examDate: "2026-09-20" } }));
  assert.match(passed, /the date Sun 2026-09-20 has passed\. Ask how it went/);
  const monthHere = tutorSystemPrompt(ctx({ profile: { ...ctx().profile, examDate: null, targetMonth: "2026-09" } }));
  assert.match(monthHere, /not booked yet, and the target month 2026-09 is here\. Suggest booking the SAT and setting its date, or picking a later month/);
  assert.ok(!/how it went|has passed/i.test(monthHere), "no 'how did it go' for an exam that was never booked");

  const blank = tutorSystemPrompt(ctx({ analytics: null, plan: null, insights: null, mistakes: [], firstName: "" }));
  assert.ok(blank.includes("there"), "a missing name still reads naturally");
  assert.match(blank, /No finished work yet/);
  const failed = tutorSystemPrompt(ctx({ analytics: null, recordUnavailable: true }));
  assert.match(failed, /record is unavailable right now/i, "a failed analytics read is not 'no work yet'");
  assert.ok(!/No finished work yet/.test(failed));
}

// --- 8: the request: summary + last turns + the new message, under ~3,000 tokens
{
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: "word ".repeat(300), at: i }));
  const req = tutorRequest(ctx(), { summary: "They struggle with slope.", history, message: "What should I work on this week?" });
  assert.equal(req.json, true);
  assert.equal(req.messages.at(-1).role, "user");
  assert.equal(req.messages.at(-1).content, "What should I work on this week?");
  assert.equal(req.messages.length, 9);
  assert.ok(!req.system.includes("They struggle with slope."), "the rolling summary is not in the system prompt");
  assert.equal(req.messages[0].role, "user");
  assert.ok(req.messages[0].content.includes("They struggle with slope."), "it rides as a user-role note");
  assert.match(req.messages[0].content, /not instructions/i, "labelled as untrusted notes");
  const alone = tutorRequest(ctx(), { summary: "Wants 1400.", history: [], message: "Hi" });
  assert.equal(alone.messages.length, 1, "notes and the new message share the one user turn");
  assert.ok(alone.messages[0].content.includes("Wants 1400.") && alone.messages[0].content.endsWith("Hi"));
  const none = tutorRequest(ctx(), { summary: "", history, message: "Hi" });
  assert.ok(!/not instructions/i.test(none.messages[0].content), "no summary, no note");
  const chars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
  assert.ok(chars / 4 < 3000, `prompt stays under ~3,000 tokens (${Math.round(chars / 4)})`);
}

// --- 9: explain mode
{
  const explain = {
    questionId: "abc123", section: "math", domain: "algebra", skill: "Linear functions", difficulty: "H", kind: "mcq",
    answer: "C", response: "B", correct: false, rationale: "Choice C is correct because the slope is 3.", withImages: true,
  };
  const c = ctx({ explain });
  const prompt = tutorSystemPrompt(c);
  assert.ok(prompt.includes("Linear functions") && prompt.includes('"C"') && prompt.includes('"B"'), "official answer and the student's answer");
  assert.ok(prompt.includes("slope is 3"), "the worked answer text");
  assert.ok(prompt.includes("43 days"), "still knows the countdown");
  assert.ok(!prompt.includes("Full exams") && !prompt.includes("Rhetorical Synthesis"), "no plan and no other section in an explanation");
  assert.ok(prompt.length < tutorSystemPrompt(ctx()).length * 0.75, "an explanation prompt is lean (its images are costly)");
  const out = parseTutorReply({ reply: "The idea is slope.", actions: [] }, c);
  assert.equal(out.actions.length, 1, "an explanation always offers a drill on that skill");
  assert.equal(out.actions[0].type, "create_drill");
  assert.equal(out.actions[0].filter.skill, "Linear functions");
  const withDrill = parseTutorReply({ reply: "x", actions: [{ type: "create_drill", label: "d", filter: { skill: "Linear functions" }, count: 12 }] }, c);
  assert.equal(withDrill.actions.length, 1, "no duplicate when the model already offered one");
  const practice = parseTutorReply({ reply: "x", actions: [] }, ctx({ explain: { ...explain, domain: null, skill: null, difficulty: null } }));
  assert.equal(practice.actions.length, 0, "a practice-test question has no skill to drill");
  const req = tutorRequest(c, { summary: "", history: [], message: "Explain", images: [{ mime: "image/jpeg", base64: "AAAA" }] });
  assert.equal(req.messages.at(-1).images.length, 1, "images ride on the new message");
  const long = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}`, at: i }));
  const lean = tutorRequest(c, { summary: "", history: long, message: "Explain" });
  assert.deepEqual(lean.messages.map((m) => m.content), ["m6", "m7", "Explain"], "an explanation sends at most 2 history messages");
  assert.equal(tutorRequest(ctx(), { summary: "", history: long, message: "x" }).messages.length, 9, "a normal turn sends 8");
}

// --- 10: summary request / parsing
{
  const req = summaryRequest("old", [{ role: "user", text: "hi", at: 1 }]);
  assert.equal(req.json, true);
  assert.ok(req.messages[0].content.includes("old"));
  assert.equal(parseSummary({ summary: "They want 1400." }), "They want 1400.");
  assert.equal(parseSummary({ summary: "" }), null);
  assert.equal(parseSummary("x"), null);
  assert.ok(parseSummary({ summary: "a".repeat(5000) }).length <= 800);
}

// --- 10b: a summary folded later marks exactly the turns it folded
{
  const msgs = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}`, at: 1000 + i }));
  const folded = msgs.slice(0, 16);
  const later = [...msgs, { role: "user", text: "new", at: 5000 }, { role: "assistant", text: "reply", at: 5001 }];
  const out = applySummary({ summary: "", messages: later, pendingActions: [{ id: "a", type: "open", label: "x", href: "/portal/sat-lab" }] }, folded, "They want 1400.");
  assert.equal(out.summary, "They want 1400.");
  assert.equal(out.messages.filter((m) => m.summarised).length, 16, "only the folded turns are marked");
  assert.ok(!out.messages.at(-1).summarised && !out.messages.at(-3).summarised, "turns that arrived meanwhile stay unsummarised");
  assert.equal(out.pendingActions.length, 1, "pending actions untouched");
}

// --- 10c: the pause check reads the newest 5 unfinished timed sittings, whatever their age
{
  const s = (id, kind, createdAt, finishedAt = null) => ({ id, kind, createdAt, finishedAt, title: id, score: null, correct: 0, total: 0, assignmentId: null, overtime: false });
  const DAY = 86_400_000;
  const summaries = [
    s("d1", "drill", NOW), s("f1", "adaptive", NOW - DAY, NOW), s("old", "practice", NOW - 30 * DAY),
    s("a1", "adaptive", NOW - 1), s("a2", "adaptive", NOW - 2), s("a3", "practice", NOW - 3), s("a4", "adaptive", NOW - 4), s("a5", "practice", NOW - 5), s("a6", "adaptive", NOW - 6),
  ];
  assert.deepEqual(pauseCandidateIds(summaries), ["a1", "a2", "a3", "a4", "a5"], "newest 5 unfinished adaptive/practice by createdAt; drills and finished ones never");
  assert.deepEqual(pauseCandidateIds([s("old", "practice", NOW - 30 * DAY)]), ["old"], "no age window");
}

// --- 10d: one definition of the chat's shared strings
{
  assert.equal(TUTOR_MAX_MESSAGE_CHARS, 1000);
  assert.equal(TUTOR_PAUSED_MESSAGE, "I'm paused while your exam is running — submit the module first, then come back.");
  assert.equal(typeof TUTOR_EXPLAIN_MESSAGE, "string");
}

// --- 11: recent mistakes from History (latest outcome wrong, newest first)
{
  const history = new Map([
    ["q1", { lastAt: 10, lastCorrect: false, times: 1 }],
    ["q2", { lastAt: 30, lastCorrect: true, times: 2 }],
    ["q3", { lastAt: 20, lastCorrect: false, times: 1 }],
    ["q4", { lastAt: 40, lastCorrect: false, times: 1 }],
  ]);
  assert.deepEqual(recentMistakes(history, 2), [{ qid: "q4", at: 40 }, { qid: "q3", at: 20 }]);
}

// --- 12: knowledge pack covers the bank's skills; images only to models that read them
{
  const covered = new Set(Object.values(KNOWLEDGE_SKILLS).flat().map((s) => s.skill.toLowerCase()));
  for (const s of bankSkills()) assert.ok(covered.has(s.skill.toLowerCase()), `knowledge pack describes "${s.skill}"`);
  const pack = knowledgePack();
  for (const fact of ["27", "32", "22", "35", "10-minute", "400", "1600", "Desmos", "Bluebook", "mixed number"]) {
    assert.ok(pack.includes(fact), `knowledge pack mentions ${fact}`);
  }
  assert.ok(knowledgePack("math").length < pack.length, "a focused pack is smaller");
  assert.ok(!knowledgePack("math").includes("Rhetorical Synthesis"), "the math pack leaves the R&W skills out");

  assert.equal(modelAcceptsImages({ provider: "gemini", apiKey: "k", model: "gemini-3.1-flash-lite", fallbackAcceptsImages: true }), true);
  assert.equal(modelAcceptsImages({ provider: "groq", apiKey: "k", model: "qwen/qwen3.8-27b", fallbackAcceptsImages: false }), true);
  assert.equal(modelAcceptsImages({ provider: "groq", apiKey: "k", model: "openai/gpt-oss-20b", fallbackAcceptsImages: false }), false);
}

// --- final review M4: a budget refusal says what really happened -- this
// student's 40 are used (429, back tomorrow), the global cap is reached
// (back tomorrow), or a counter couldn't be read: "try again in a moment",
// never "back tomorrow"
{
  assert.deepEqual(budgetRefusal("student"), { error: "You've used today's 40 tutor messages — they come back tomorrow (Pakistan time).", status: 429 });
  assert.deepEqual(budgetRefusal("global"), { error: "The tutor has reached today's limit — it'll be back tomorrow.", status: 503 });
  const unavailable = budgetRefusal("unavailable");
  assert.deepEqual(unavailable, { error: TUTOR_COUNT_UNAVAILABLE, status: 503 });
  assert.equal(TUTOR_COUNT_UNAVAILABLE, "Couldn't check your messages — try again in a moment.");
  assert.ok(!/tomorrow/i.test(unavailable.error) && /try again in a moment/.test(unavailable.error));
}

console.log("sat tutor tests passed");
