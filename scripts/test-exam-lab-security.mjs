// Exam Lab answer security (Task 2b-A): the pure rules behind sittings,
// reveals, grading and image signing. The routes under /api/exam-lab apply
// exactly these functions.
import assert from "node:assert/strict";
import { deriveKey, newSealId, openSealed, sealJson, sha256Hex, signToken, verifyToken } from "../src/lib/exam-lab/seal.ts";
import {
  IN_PLAY_GRACE_MS, LAUNCHABLE_STATUSES, SITTING_MAX_AGE_MS, SUBMIT_MAX_AGE_MS, UPCOMING_WINDOW_MS, allocationQuestionIds, allocationSubmissions, answerHash,
  classifyAssetPath, examLabSittingRunning, frozenResponse, hasStarted, helpAllowed, inPlayIds, isInPlay, markAllowedAfterReveal,
  pastPaperKey, pausedPaperTypes, publicAllocation, questionKey, receiptMatches, revealAfterSubmit, revealScope, sameIdSet, sittingAlreadySubmitted,
  sittingTokenOk, takeHit,
} from "../src/lib/exam-lab/answer-rules.ts";
import {
  DAILY_QUESTIONS, MAX_DRILL_QUESTIONS, PAPERS_PAUSED, legacyDrillPick, pickPractice, practiceRefusal,
} from "../src/lib/exam-lab/practice-pools.ts";
import { selectionSummary } from "../src/components/exam-lab/selection-summary.ts";
import { CANON_9702, buildPaperIndex, chrono9702, countPool, courseOfCode, poolCounts, poolTopics } from "../src/lib/exam-lab/paper-meta.ts";
import { PRACTICE_SET_MAX_AGE_MS, markSet, practiceSetOk, sealableSet, withoutHeld, withoutKeys } from "../src/lib/exam-lab/practice-set.ts";
import { helperPausedOnPath } from "../src/lib/ai/helper-pause-paths.ts";

const NOW = Date.parse("2026-09-28T09:00:00.000Z");
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// --- seal.ts: signed tokens ----------------------------------------------------
const key = deriveKey("a-long-enough-test-secret", "exam-lab:sitting:v1");
const other = deriveKey("a-long-enough-test-secret", "exam-lab:receipt:v1");
assert.equal(key.length, 32);
assert.notDeepEqual(key, other, "each purpose gets its own key");
const tok = signToken({ v: 1, uid: "u1", ids: ["a", "b"] }, key);
assert.deepEqual(verifyToken(tok, key), { v: 1, uid: "u1", ids: ["a", "b"] });
assert.equal(verifyToken(tok, other), null, "a token signed for one purpose is useless for another");
const [body, sig] = tok.split(".");
const forged = Buffer.from(JSON.stringify({ v: 1, uid: "u1", ids: ["a", "b", "c"] })).toString("base64url");
assert.equal(verifyToken(`${forged}.${sig}`, key), null, "a changed payload fails");
assert.equal(verifyToken(`${body}.${sig.slice(0, -2)}AA`, key), null, "a changed tag fails");
assert.equal(verifyToken(`${body}`, key), null);
assert.equal(verifyToken(`${body}.${sig}.x`, key), null);
assert.equal(verifyToken(null, key), null);
assert.equal(verifyToken(42, key), null);
assert.match(newSealId(), /^[A-Za-z0-9_-]{16}$/);
assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

// --- seal.ts: sealed (encrypted) payloads -------------------------------------
const setKey = deriveKey("a-long-enough-test-secret", "exam-lab:practice-set:v1");
const sealed = sealJson({ items: [{ id: "seed-001", ans: 2, scheme: ["Answer C"] }] }, setKey);
assert.ok(!sealed.includes("Answer") && !Buffer.from(sealed, "base64url").toString("utf8").includes("Answer C"), "the sealed set does not show its answers");
assert.deepEqual(openSealed(sealed, setKey), { items: [{ id: "seed-001", ans: 2, scheme: ["Answer C"] }] });
assert.equal(openSealed(sealed, key), null, "wrong key");
const flipped = Buffer.from(sealed, "base64url"); flipped[flipped.length - 1] ^= 1;
assert.equal(openSealed(flipped.toString("base64url"), setKey), null, "tampered ciphertext");
assert.notEqual(sealJson({ a: 1 }, setKey), sealJson({ a: 1 }, setKey), "random IV per seal");
assert.equal(openSealed("", setKey), null);
assert.equal(openSealed("not base64!", setKey), null);

// --- start times (H3) -----------------------------------------------------------
assert.equal(hasStarted({ startsAt: null }, NOW), true);
assert.equal(hasStarted({ startsAt: new Date(NOW + 60_000).toISOString() }, NOW), false, "a scheduled test is closed until it opens");
assert.equal(hasStarted({ startsAt: new Date(NOW).toISOString() }, NOW), true);
assert.deepEqual([...LAUNCHABLE_STATUSES].sort(), ["assigned", "cancelled", "in_progress", "unlocked"]);

// --- allocation ids (M4) ------------------------------------------------------
const paperIds = (code) => (code === "9702_s18_11" ? ["p-q1", "p-q2", "p-q3"] : []);
assert.deepEqual(allocationQuestionIds({ content: { type: "paper", code: "9702_s18_11" } }, paperIds), ["p-q1", "p-q2", "p-q3"]);
assert.deepEqual(allocationQuestionIds({ content: { type: "custom", ids: ["x", "y"] } }, paperIds), ["x", "y"]);
assert.deepEqual(allocationQuestionIds({ content: { type: "drillref", drillId: "d", ref: "DR-1", ids: ["z"], spec: null } }, paperIds), ["z"]);
const legacySpec = { type: "drill", paperType: "P1", topics: ["Waves"], levels: ["LOT"], count: 5 };
assert.equal(allocationQuestionIds({ content: legacySpec }, paperIds), null, "a legacy spec has no ids until it is frozen");
assert.equal(allocationQuestionIds({ content: { type: "daily" }, frozenIds: [] }, paperIds), null);
assert.deepEqual(allocationQuestionIds({ content: legacySpec, frozenIds: ["f1", "f2"] }, paperIds), ["f1", "f2"]);
assert.equal(sameIdSet(["a", "b"], ["b", "a"]), true);
assert.equal(sameIdSet(["a", "b"], ["a", "b", "c"]), false, "an extra id is refused");
assert.equal(sameIdSet(["a", "b"], ["a"]), false, "a missing id is refused");
assert.equal(sameIdSet(["a", "b"], ["a", "c"]), false, "any chosen id is refused");

// --- in play (H3) ----------------------------------------------------------------
const alloc = (over) => ({ id: "a1", mode: "test", status: "assigned", startsAt: null, dueAt: null, content: { type: "custom", ids: ["t1", "t2"] }, ...over });
assert.equal(isInPlay(alloc({}), NOW), true, "an assigned test is in play");
assert.equal(isInPlay(alloc({ startsAt: new Date(NOW + DAY).toISOString() }), NOW), true, "so is an upcoming one");
assert.equal(isInPlay(alloc({ status: "in_progress" }), NOW), true);
assert.equal(isInPlay(alloc({ status: "locked" }), NOW), true);
assert.equal(isInPlay(alloc({ status: "unlocked" }), NOW), true);
assert.equal(isInPlay(alloc({ status: "submitted" }), NOW), false, "a submitted sitting is over");
assert.equal(isInPlay(alloc({ mode: "assignment_nohelp" }), NOW), true, "no-help assignments hold their questions too");
assert.equal(isInPlay(alloc({ mode: "assignment_help" }), NOW), false, "help-allowed work does not");
assert.equal(isInPlay(alloc({ dueAt: new Date(NOW - IN_PLAY_GRACE_MS + HOUR).toISOString() }), NOW), true, "overdue but within the grace week");
assert.equal(isInPlay(alloc({ dueAt: new Date(NOW - IN_PLAY_GRACE_MS - HOUR).toISOString() }), NOW), false, "a long-stale challenge stops holding questions");
// "Upcoming" = starting within 14 days (fix round 1, I1): a test weeks away
// holds nothing yet, so nothing the student sees can point at it.
assert.equal(isInPlay(alloc({ startsAt: new Date(NOW + UPCOMING_WINDOW_MS - HOUR).toISOString() }), NOW), true, "13 days 23 h ahead: upcoming");
assert.equal(isInPlay(alloc({ startsAt: new Date(NOW + UPCOMING_WINDOW_MS + HOUR).toISOString() }), NOW), false, "just over 14 days ahead: not yet");
assert.equal(isInPlay(alloc({ startsAt: new Date(NOW - DAY).toISOString() }), NOW), true, "already open");
// A review judges holds as of its sitting's opening (fix round 2, N5): an
// allocation assigned after that moment held nothing then.
assert.equal(isInPlay(alloc({ createdAt: NOW + HOUR }), NOW), false, "not yet assigned at that moment");
assert.equal(isInPlay(alloc({ createdAt: NOW - HOUR }), NOW), true);
assert.equal(isInPlay(alloc({ startsAt: new Date(NOW + UPCOMING_WINDOW_MS + DAY).toISOString() }), NOW + 2 * DAY), true, "in the window later on...");
assert.equal(isInPlay(alloc({ startsAt: new Date(NOW + UPCOMING_WINDOW_MS + DAY).toISOString() }), NOW), false, "...but not as of an earlier opening");
const allocs = [
  alloc({ id: "t", content: { type: "paper", code: "9702_s18_11" } }),
  alloc({ id: "nh", mode: "assignment_nohelp", content: { type: "custom", ids: ["n1"] } }),
  alloc({ id: "help", mode: "assignment_help", content: { type: "custom", ids: ["h1"] } }),
  alloc({ id: "done", status: "submitted", content: { type: "custom", ids: ["d1"] } }),
  alloc({ id: "legacy", mode: "assignment_nohelp", content: legacySpec }),
  alloc({ id: "legacy-frozen", mode: "assignment_nohelp", content: legacySpec, frozenIds: ["lf1"] }),
];
assert.deepEqual([...inPlayIds(allocs, NOW, paperIds)].sort(), ["lf1", "n1", "p-q1", "p-q2", "p-q3"]);
assert.deepEqual([...inPlayIds(allocs, NOW, paperIds, "t")].sort(), ["lf1", "n1"], "a finished sitting's own questions are left out");

// --- the student's allocation list carries no content (H3) ------------------------
const pub = publicAllocation(alloc({ content: { type: "drillref", drillId: "drill-x", ref: "DR-2609-ABCD", ids: ["s1", "s2"], spec: { type: "paper", code: "9702_s18_11" } }, frozenIds: ["q"] }));
assert.deepEqual(pub.content, { type: "drillref", ref: "DR-2609-ABCD" });
assert.equal("frozenIds" in pub, false);
assert.ok(!JSON.stringify(pub).includes("s1") && !JSON.stringify(pub).includes("9702_s18_11"), "no ids, no paper code");
assert.deepEqual(publicAllocation(alloc({ content: { type: "paper", code: "9702_s18_11" } })).content, { type: "paper" });
assert.equal(publicAllocation(alloc({})).title, undefined);
assert.equal(publicAllocation({ ...alloc({}), title: "Class test" }).title, "Class test", "everything else is kept");

// --- image paths (H1, L3) -----------------------------------------------------------
assert.equal(classifyAssetPath("p2/9702_s18_21/q3_ms.jpg"), "mark-scheme");
assert.equal(classifyAssetPath("o-level/5054_s24_22/q1_ms.jpg"), "mark-scheme");
assert.equal(classifyAssetPath("custom/9702_ct1_pqu/q01.png"), "secure");
assert.equal(classifyAssetPath("sat/tests/4/math-m2-q1.jpg"), "sat-test");
assert.equal(classifyAssetPath("sat/math/abc.png"), "sat");
assert.equal(classifyAssetPath("sat/math/r/0123456789abcdef0123.png"), "sat");
assert.equal(classifyAssetPath("p2/9702_s18_21/q3.jpg"), "question");
assert.equal(classifyAssetPath("p1/9702_s18_11/q1.jpg"), "question");

// --- text-bank past papers map to image-bank questions (M1 + H3) ----------------------
assert.equal(pastPaperKey("pp-m19-12-q11"), questionKey("9702_m19_12", 11));
assert.equal(pastPaperKey("pp-w24-23-3a"), "9702_w24_23#3");
assert.equal(pastPaperKey("pp-m19-22-2aii"), "9702_m19_22#2");
assert.equal(pastPaperKey("seed-001"), null);
assert.equal(pastPaperKey("ai-xyz-1"), null);
assert.equal(pastPaperKey("pp-p1-9702_s18_11-q1"), null, "an image-bank id is not a text-bank id");

// --- sitting tokens -------------------------------------------------------------------
const sit = { v: 1, sid: "s1", uid: "u1", ids: ["a"], alloc: null, help: true, strict: false, iat: NOW };
assert.equal(sittingTokenOk(sit, "u1", NOW), true);
assert.equal(sittingTokenOk(sit, "u2", NOW), false, "another student's token is refused");
assert.equal(sittingTokenOk(sit, "u1", NOW + SITTING_MAX_AGE_MS + 1), false, "a day-old token has expired");
assert.equal(sittingTokenOk({ ...sit, ids: [] }, "u1", NOW), false);
assert.equal(sittingTokenOk({ ...sit, help: "yes" }, "u1", NOW), false);
assert.equal(sittingTokenOk({ ...sit, v: 2 }, "u1", NOW), false);
assert.equal(sittingTokenOk({ ...sit, iat: NOW + HOUR }, "u1", NOW), false, "issued in the future");
assert.equal(sittingTokenOk(null, "u1", NOW), false);
// The attempt route accepts a token for a week (a paper left open overnight
// must still save -- fix round 1, m3); everything else keeps the day.
assert.equal(sittingTokenOk(sit, "u1", NOW + 2 * DAY, SUBMIT_MAX_AGE_MS), true, "a two-day-old sitting still submits");
assert.equal(sittingTokenOk(sit, "u1", NOW + SUBMIT_MAX_AGE_MS + 1, SUBMIT_MAX_AGE_MS), false);
assert.equal(sittingTokenOk(sit, "u2", NOW + 2 * DAY, SUBMIT_MAX_AGE_MS), false, "never another student's");

// --- one submission per sitting (M4) -----------------------------------------------------
const stored = (over) => ({ ts: NOW, context: { allocationId: null, cancelled: false, ...over } });
const fresh = { sittingId: "s-new", allocationId: null, allocSubmitted: false, unlocks: 0 };
assert.equal(sittingAlreadySubmitted([], fresh), false);
assert.equal(sittingAlreadySubmitted([stored({ sittingId: "s-new" })], fresh), true, "a practice sitting is submitted once");
assert.equal(sittingAlreadySubmitted([stored({ sittingId: "s-old" })], fresh), false, "another sitting of the same paper is fine");
const allocSit = { ...fresh, allocationId: "A" };
assert.equal(sittingAlreadySubmitted([], allocSit), false, "an allocation's first submission is taken");
assert.equal(sittingAlreadySubmitted([], { ...allocSit, allocSubmitted: true }), true, "a submitted allocation takes no more attempts");
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "A", sittingId: "s-1" })], allocSit), true, "reopening cannot replace recorded answers");
// OS-A (fix round 4): what the browser said about the earlier sitting never
// buys another graded attempt -- only a staff unlock recorded on the server.
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "A", sittingId: "s-1", cancelled: true })], allocSit), true, "a sitting the browser called cancelled is still the submission");
assert.equal(sittingAlreadySubmitted([{ ts: NOW - 2 * HOUR, context: { allocationId: "A", sittingId: "s-1" } }], allocSit), true, "an earlier sitting counts however long ago");
assert.equal(allocationSubmissions([stored({ allocationId: "A", cancelled: true }), stored({ allocationId: "A" }), stored({ allocationId: "B" })], "A"), 2);
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "A", cancelled: true })], { ...allocSit, unlocks: 1 }), false, "a staff unlock allows one more");
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "A", cancelled: true }), stored({ allocationId: "A" })], { ...allocSit, unlocks: 1 }), true, "exactly one more");
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "A" }), stored({ allocationId: "A" })], { ...allocSit, unlocks: 2 }), false, "one more per unlock");
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "A" })], { ...allocSit, unlocks: -3 }), true, "a nonsense count grants nothing");
assert.equal(sittingAlreadySubmitted([stored({ allocationId: "B" })], allocSit), false, "another allocation's attempts don't count");

// --- help while sitting (H1, H2) -------------------------------------------------------
assert.equal(helpAllowed({ help: true, strict: false, alloc: null }, null), true, "practice with help");
assert.equal(helpAllowed({ help: false, strict: false, alloc: null }, null), false);
assert.equal(helpAllowed({ help: true, strict: true, alloc: null }, null), false, "a proctored preview never");
assert.equal(helpAllowed({ help: true, strict: false, alloc: "a" }, { mode: "assignment_help", status: "in_progress" }), true);
assert.equal(helpAllowed({ help: true, strict: false, alloc: "a" }, { mode: "assignment_nohelp", status: "in_progress" }), false, "the live allocation decides, not the token");
assert.equal(helpAllowed({ help: true, strict: false, alloc: "a" }, { mode: "test", status: "in_progress" }), false);
assert.equal(helpAllowed({ help: true, strict: false, alloc: "a" }, null), false, "a withdrawn allocation");
assert.equal(helpAllowed({ help: true, strict: false, alloc: "a" }, { mode: "assignment_help", status: "submitted" }), true, "Maxwell feedback after a help-allowed assignment is submitted");

// --- after submission ---------------------------------------------------------------------
assert.equal(revealAfterSubmit(false, null), true, "practice shows answers and mark schemes");
assert.equal(revealAfterSubmit(false, "assignment_help"), true);
assert.equal(revealAfterSubmit(false, "assignment_nohelp"), true);
assert.equal(revealAfterSubmit(false, "test"), false, "a test shows its score only");
assert.equal(revealAfterSubmit(true, null), false);

// --- Maxwell receipts (M4) ------------------------------------------------------------------
const receipt = { v: 1, uid: "u1", sid: "s1", qid: "q9", h: answerHash("  F = ma  "), awarded: 3, outOf: 4, iat: NOW };
assert.equal(receiptMatches(receipt, { uid: "u1", sid: "s1", qid: "q9", response: "F = ma" }), true, "the exact (trimmed) answer marked");
assert.equal(receiptMatches(receipt, { uid: "u1", sid: "s1", qid: "q9", response: "F = ma, a = F/m" }), false, "an edited answer loses the mark");
assert.equal(receiptMatches(receipt, { uid: "u2", sid: "s1", qid: "q9", response: "F = ma" }), false);
assert.equal(receiptMatches(receipt, { uid: "u1", sid: "s2", qid: "q9", response: "F = ma" }), false, "a mark from another sitting");
assert.equal(receiptMatches(receipt, { uid: "u1", sid: "s1", qid: "q8", response: "F = ma" }), false, "a mark for another question");
assert.equal(receiptMatches(receipt, { uid: "u1", sid: "s1", qid: "q9", response: null }), false);
assert.equal(receiptMatches(null, { uid: "u1", sid: "s1", qid: "q9", response: "F = ma" }), false);

// --- the answer freeze after a reveal, on the server (fix round 1, m1) ---------------------------
const revealed = { text: "  v = u + at  ", at: NOW };
assert.equal(frozenResponse("a copy of the mark scheme", revealed), "  v = u + at  ", "the answer at the reveal counts, whatever is sent later");
assert.equal(frozenResponse(null, revealed), "  v = u + at  ");
assert.equal(frozenResponse("anything", { text: "   ", at: NOW }), null, "revealed while blank: stays blank");
assert.equal(frozenResponse("my answer", undefined), "my answer", "not revealed: the answer as sent");
assert.equal(markAllowedAfterReveal("v = u + at", revealed), true, "Maxwell may mark the frozen answer");
assert.equal(markAllowedAfterReveal("v = u + at, s = ut + at^2/2", revealed), false, "but not an edited one");
assert.equal(markAllowedAfterReveal("anything", undefined), true, "not revealed: any answer");
assert.equal(revealScope({ sid: "s1", alloc: null }), "s1", "practice: per sitting");
assert.equal(revealScope({ sid: "s1", alloc: "A" }), "a-A", "an allocation: per allocation, found again without the token");
assert.equal(revealScope({ sid: "s2", alloc: "A" }), revealScope({ sid: "s1", alloc: "A" }), "a reopened assignment keeps its reveals");

// --- the AI helper during a sitting (M7) -------------------------------------------------------
const running = (over) => ({ mode: "test", status: "in_progress", startedAt: NOW - 10 * 60_000, durationMin: 60, ...over });
assert.equal(examLabSittingRunning([running({})], NOW), true);
assert.equal(examLabSittingRunning([running({ mode: "assignment_nohelp" })], NOW), true);
assert.equal(examLabSittingRunning([running({ mode: "assignment_help" })], NOW), false, "help-allowed work may use the helper");
assert.equal(examLabSittingRunning([running({ status: "submitted" })], NOW), false);
assert.equal(examLabSittingRunning([running({ startedAt: NOW - 60 * 60_000 - 31 * 60_000 })], NOW), false, "an abandoned sitting stops blocking");
assert.equal(examLabSittingRunning([running({ startedAt: null })], NOW), false);
assert.equal(examLabSittingRunning([running({ durationMin: null, startedAt: NOW - 3 * HOUR })], NOW), true, "no duration: three hours");
assert.equal(examLabSittingRunning([], NOW), false);

// The companion is not shown where tests and timed modules are sat.
assert.equal(helperPausedOnPath("/portal/exam-lab"), true);
assert.equal(helperPausedOnPath("/portal/exam-lab/review"), true);
assert.equal(helperPausedOnPath("/Portal/Exam-Lab"), true, "any letter case");
assert.equal(helperPausedOnPath("/portal/sat-lab/abc123"), true);
assert.equal(helperPausedOnPath("/portal/exam-labs"), false, "a prefix of a word is not the route");
assert.equal(helperPausedOnPath("/portal"), false);
assert.equal(helperPausedOnPath("/physics-studio"), false);
assert.equal(helperPausedOnPath(null), false);

// --- rate limit -------------------------------------------------------------------------------
const hits = new Map();
for (let i = 0; i < 3; i++) assert.equal(takeHit(hits, "k", NOW + i, 60_000, 3), true);
assert.equal(takeHit(hits, "k", NOW + 3, 60_000, 3), false, "the fourth hit in a minute is refused");
assert.equal(takeHit(hits, "k", NOW + 61_000, 60_000, 3), true, "the window slides");
assert.equal(takeHit(hits, "other", NOW, 60_000, 3), true, "keys are separate");

// --- practice pools (C1 + H3) -------------------------------------------------------------------
let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const q = (id, code, qnum, paperType, topic, level) => ({ id, code, qnum, paperType, topic, level });
const bank = [
  q("a1", "9702_s18_11", 2, "P1", "Waves", "LOT"), q("a2", "9702_s18_11", 1, "P1", "Kinematics", "HOT"),
  q("a3", "9702_s18_11", 3, "P1", "Waves", "HOT"), q("b1", "9702_s18_21", 1, "P2", "Waves", "LOT"),
  q("b2", "9702_s18_21", 2, "P2", null, "LOT"), q("c1", "9702_w19_12", 1, "P1", "Waves", "LOT"),
];
assert.deepEqual(pickPractice({ type: "paper", code: "9702_s18_11" }, bank, new Set(), rng), { ok: true, ids: ["a2", "a1", "a3"] }, "a paper in question order");
assert.deepEqual(pickPractice({ type: "paper", code: "nope" }, bank, new Set(), rng), { ok: false, reason: "empty" });
// I1 / N2 (fix rounds 1-2): while a TEACHER-SET whole-paper test of a paper
// type is in play (`paused`), EVERY whole practice paper of that type is
// refused with the same words -- not only the test's own paper, which would
// name it. Any other held question pauses nothing: its paper opens (answers
// withheld while held) and drills leave it out silently.
const heldP1 = new Set(["a3"]); // a3 sits in 9702_s18_11 (P1)
const pausedP1 = new Set(["P1"]);
const own = pickPractice({ type: "paper", code: "9702_s18_11" }, bank, heldP1, rng, pausedP1);
const otherPaper = pickPractice({ type: "paper", code: "9702_w19_12" }, bank, heldP1, rng, pausedP1);
assert.deepEqual(own, { ok: false, reason: "paused" }, "the test's own paper is paused");
assert.deepEqual(otherPaper, { ok: false, reason: "paused" }, "and so is a paper with no held question");
assert.equal(JSON.stringify(practiceRefusal(own.reason, "paper")), JSON.stringify(practiceRefusal(otherPaper.reason, "paper")), "byte-identical refusals");
assert.deepEqual(practiceRefusal("paused", "paper"), { status: 409, error: PAPERS_PAUSED });
assert.ok(!PAPERS_PAUSED.includes("9702") && !/P[124]/.test(PAPERS_PAUSED), "the refusal names no paper");
assert.ok(!/upcoming/i.test(PAPERS_PAUSED) && /in progress/.test(PAPERS_PAUSED), "neutral wording: a test in progress");
assert.deepEqual(pickPractice({ type: "paper", code: "9702_s18_21" }, bank, heldP1, rng, pausedP1), { ok: true, ids: ["b1", "b2"] }, "other paper types stay open");
assert.deepEqual(pickPractice({ type: "paper", code: "9702_s18_11" }, bank, heldP1, rng), { ok: true, ids: ["a2", "a1", "a3"] }, "a held question alone pauses nothing: its paper opens");
assert.deepEqual(pickPractice({ type: "paper", code: "nope" }, bank, heldP1, rng, pausedP1), { ok: false, reason: "empty" }, "an unknown code is refused the same way, paused or not");
const drillHeld = pickPractice({ type: "drill", paperType: "P1", topics: [], levels: ["LOT", "HOT"], count: 40 }, bank, heldP1, rng, pausedP1);
assert.equal(drillHeld.ok, true, "drills of a paused type stay open");
assert.ok(!drillHeld.ids.includes("a3"), "without the held question");

// Which allocations pause a type: teacher-set, in play, covering a whole paper.
const paperOf = (code) => bank.filter((q) => q.code === code).sort((x, y) => x.qnum - y.qnum).map((q) => q.id);
const meta = (id) => bank.find((q) => q.id === id);
const pauses = (a) => [...pausedPaperTypes([alloc({ id: "p", ...a })], NOW, paperOf, meta)];
assert.deepEqual(pauses({ content: { type: "paper", code: "9702_s18_11" } }), ["9702|P1"], "a whole-paper test (legacy shape)");
assert.deepEqual(pauses({ content: { type: "drillref", drillId: "d", ref: "DR", ids: ["a1", "a2", "a3"], spec: { type: "paper", code: "9702_s18_11" } } }), ["9702|P1"], "a frozen whole-paper class test");
assert.deepEqual(pauses({ mode: "assignment_nohelp", content: { type: "custom", ids: ["b2", "b1"] } }), ["9702|P2"], "hand-picked, but every question of one paper");
assert.deepEqual(pauses({ content: { type: "custom", ids: ["a1", "b1"] } }), [], "drill-style picks pause nothing");
assert.deepEqual(pauses({ mode: "assignment_nohelp", content: { type: "drill", paperType: "P2", topics: [], levels: ["LOT"], count: 2 }, frozenIds: ["b1", "b2"] }), [], "an automated study-plan item never pauses papers");
assert.deepEqual(pauses({ mode: "assignment_nohelp", content: { type: "daily" }, frozenIds: ["a1", "a2", "a3"] }), [], "nor does a daily challenge");
assert.deepEqual(pauses({ status: "submitted", content: { type: "paper", code: "9702_s18_11" } }), [], "a submitted test pauses nothing");
assert.deepEqual(pauses({ mode: "assignment_help", content: { type: "paper", code: "9702_s18_11" } }), [], "nor help-allowed work");
assert.deepEqual(pauses({ startsAt: new Date(NOW + UPCOMING_WINDOW_MS + HOUR).toISOString(), content: { type: "paper", code: "9702_s18_11" } }), [], "nor a test weeks away");
assert.deepEqual([...pausedPaperTypes([alloc({ id: "p", content: { type: "paper", code: "9702_s18_11" } })], NOW, paperOf, meta, "p")], [], "a sitting's own allocation can be left out");
// NB2 (fix round 3): `meta` answers only for PAST-paper questions, so a whole
// staff-written class test (the secure bank: in no practice paper) pauses nothing.
const pastOnly = (id) => (id === "a1" || id === "a2" || id === "a3" ? undefined : meta(id));
assert.deepEqual([...pausedPaperTypes([alloc({ id: "p", content: { type: "custom", ids: ["a1", "a2", "a3"] } })], NOW, paperOf, pastOnly)], [], "a whole non-past-paper code pauses no type");
const drill = pickPractice({ type: "drill", paperType: "P1", topics: ["Waves"], levels: ["LOT", "HOT"], count: 10 }, bank, new Set(["c1"]), rng);
assert.equal(drill.ok, true);
assert.deepEqual([...drill.ids].sort(), ["a1", "a3"], "a drill never draws an in-play question");
const lot = pickPractice({ type: "drill", paperType: "P1", topics: [], levels: ["LOT"], count: 1 }, bank, new Set(), rng);
assert.equal(lot.ids.length, 1);
assert.ok(["a1", "c1"].includes(lot.ids[0]));
assert.deepEqual(pickPractice({ type: "drill", paperType: "P4", topics: [], levels: ["LOT"], count: 3 }, bank, new Set(), rng), { ok: false, reason: "empty" });
const huge = pickPractice({ type: "drill", paperType: "P1", topics: [], levels: ["LOT", "HOT"], count: 999 }, bank, new Set(), rng);
assert.ok(huge.ids.length <= MAX_DRILL_QUESTIONS);
const daily = pickPractice({ type: "daily" }, bank, new Set(["a1"]), rng);
assert.ok(daily.ids.length <= DAILY_QUESTIONS && !daily.ids.includes("a1") && daily.ids.every((id) => ["a2", "a3", "c1"].includes(id)));
const focus = pickPractice({ type: "focus", topics: ["Waves"] }, bank, new Set(), rng);
assert.deepEqual([...focus.ids].sort(), ["a1", "a3", "b1", "c1"], "focus draws the topic across papers");
assert.deepEqual(pickPractice({ type: "focus", topics: ["Waves"] }, bank, new Set(["a1", "a3", "b1", "c1"]), rng), { ok: false, reason: "empty" });
// Legacy specs keep the hub's old fallbacks, now on the server.
assert.deepEqual([...legacyDrillPick({ type: "drill", paperType: "P1", topics: ["Waves"], levels: ["HOT"], count: 5 }, bank, rng)], ["a3"]);
assert.deepEqual([...legacyDrillPick({ type: "drill", paperType: "P1", topics: ["Retired topic"], levels: ["HOT"], count: 5 }, bank, rng)].sort(), ["a2", "a3"], "a retired topic falls back to paper + level");
assert.equal(legacyDrillPick({ type: "drill", paperType: "P2", topics: ["Gone"], levels: ["HOT"], count: 5 }, bank, rng).length, 2, "then to the whole paper type");
assert.ok(legacyDrillPick({ type: "daily" }, bank, rng).every((id) => ["a1", "a2", "a3", "c1"].includes(id)));

// --- paper index and pool counts (the hub renders from these, not the bank) -----------------------
const idx = buildPaperIndex([
  { code: "9702_w19_12", paperType: "P1", ref: "9702/12/O/N/19 Q1" },
  { code: "9702_s18_11", paperType: "P1", ref: "9702/11/M/J/18 Q1" },
  { code: "9702_s18_11", paperType: "P1", ref: "9702/11/M/J/18 Q2" },
], CANON_9702, chrono9702);
assert.deepEqual(idx.map((p) => [p.code, p.count, p.ref, p.marks, p.duration]), [
  ["9702_s18_11", 2, "9702/11/M/J/18", 40, 75], ["9702_w19_12", 1, "9702/12/O/N/19", 40, 75],
]);
const pool = poolCounts(bank);
assert.equal(countPool(pool, "P1", new Set(), new Set(["LOT", "HOT"])), 4);
assert.equal(countPool(pool, "P1", new Set(["Waves"]), new Set(["LOT"])), 2);
assert.equal(countPool(pool, "P2", new Set(["Waves"]), new Set(["LOT", "HOT"])), 1, "an untagged question only counts when no topic is chosen");
assert.deepEqual(poolTopics(pool, "P1"), ["Kinematics", "Waves"]);
assert.equal(courseOfCode("5054_s24_11"), "5054");
assert.equal(courseOfCode("9702_ct1_pqu"), "9702");

// --- generated practice sets (M1, M2) ---------------------------------------------------------
const gen = [
  { id: "pp-m19-12-q11", t: "Forces", lvl: "LOT", type: "mcq", paper: "P1", cmd: "Identify", marks: 1, stem: "S1", opts: ["a", "b", "c", "d"], ans: 2, scheme: ["correct answer: C"] },
  { id: "seed-004", t: "Waves", lvl: "HOT", type: "structured", paper: "P2", cmd: "Explain", marks: 3, stem: "S2", scheme: ["point 1", "point 2"] },
  { id: "ai-x-1", t: "Waves", lvl: "LOT", type: "mcq", paper: "P1", cmd: "State", marks: 1, stem: "S3", opts: ["a", "b", "c", "d"], ans: 0, scheme: ["because"] },
];
const shown = gen.map(withoutKeys);
assert.ok(shown.every((q) => !("ans" in q) && !("scheme" in q)), "the browser gets no answer and no scheme");
assert.equal(shown[0].stem, "S1");
assert.deepEqual(shown[0].opts, ["a", "b", "c", "d"], "options stay");
const portalSet = sealableSet("portal", "u1", gen, NOW);
assert.equal(practiceSetOk(portalSet, { mode: "portal", uid: "u1", now: NOW + HOUR }), true);
assert.equal(practiceSetOk(portalSet, { mode: "portal", uid: "u2", now: NOW }), false, "another student's set is refused");
assert.equal(practiceSetOk(portalSet, { mode: "public", uid: null, now: NOW }), false, "a portal set is not a public set");
assert.equal(practiceSetOk(sealableSet("public", null, gen, NOW), { mode: "portal", uid: "u1", now: NOW }), false, "nor the other way round");
assert.equal(practiceSetOk(sealableSet("public", null, gen, NOW), { mode: "portal", uid: null, now: NOW }), false, "the mode itself is checked, not only the student");
assert.equal(practiceSetOk(portalSet, { mode: "portal", uid: "u1", now: NOW + PRACTICE_SET_MAX_AGE_MS + 1 }), false, "an old set has expired");
assert.equal(practiceSetOk({ ...portalSet, items: [] }, { mode: "portal", uid: "u1", now: NOW }), false);
assert.equal(practiceSetOk(null, { mode: "public", uid: null, now: NOW }), false);
const marked = markSet(portalSet, { "pp-m19-12-q11": 2, "ai-x-1": 3 });
assert.deepEqual([marked.mcqScore, marked.mcqTotal], [1, 2], "the whole set is marked: one right, one wrong");
assert.deepEqual(marked.items["pp-m19-12-q11"], { ans: 2, scheme: ["correct answer: C"] });
assert.deepEqual(marked.items["seed-004"], { scheme: ["point 1", "point 2"] });
assert.deepEqual(markSet(portalSet, {}).mcqScore, 0, "a blank set scores 0");
const heldKey = new Set([questionKey("9702_m19_12", 11)]);
assert.deepEqual(withoutHeld(gen, heldKey).map((q) => q.id), ["seed-004", "ai-x-1"], "the text copy of a held-back past-paper question is left out");
assert.deepEqual(withoutHeld(gen, new Set()).length, 3);

// --- the assign panel's duration (fix round 1, m6) ----------------------------------------------------
const sq = (id, paperType, level, marks) => ({ id, course: "9702", paperType, code: "c", qnum: 1, topic: null, level, marks, img: id + ".jpg", ref: id, duration: 75, hasMs: false });
const onScreen = [sq("x1", "P1", "LOT", 1), sq("x2", "P2", "HOT", 6)];
const early = selectionSummary(["x1", "x2"], null, onScreen);
assert.equal(early.complete, true, "the paper on screen sums before the bank loads");
assert.ok(early.minutes > 1 && early.marks === 7 && early.mix === "P1 ×1 · P2 ×1");
const editedSel = selectionSummary(["x1", "x2", "y9"], null, onScreen);
assert.equal(editedSel.complete, false, "an added question the page doesn't know yet: still estimating");
const loadedSel = selectionSummary(["x1", "y9"], { byId: new Map([["y9", { q: sq("y9", "P4", "LOT", 4) }]]) }, onScreen);
assert.equal(loadedSel.complete, true);
assert.equal(loadedSel.marks, 5);
assert.equal(selectionSummary([], null).complete, true);

console.log("exam-lab security tests passed");
