/* Exam Lab answer security, route level (Task 2b-A fix round 1): the real
 * /api/exam-lab/attempt, /reveal and /mark handlers, the real allocations,
 * attempts and reveals stores and the real rules, over in-memory storage.
 * Mocked: the session, the question bank, image signing and Maxwell (NO AI
 * call is ever made -- markWithMaxwell is a stub).
 *
 * Covers: the server-side answer freeze after a reveal (m1), legitimate
 * allocation submissions that used to be refused -- an older sitting token,
 * an unusable token, a legacy spec drawn by a tab from before the deploy (m3)
 * -- that the refusals which must stay still do, and what a student may have
 * signed by path (/api/exam-lab/asset + sat/image-access.ts, m2).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const files = new Map(); // "<bucket>/<path>" -> JSON text
let user = { id: "u1", roles: ["student"], fullName: "Student One", email: "s1@example.test" };
const aiCalls = [];

// ---- a tiny bank: two MCQs and two structured questions -----------------------
const bankQs = [
  { id: "m1", paperType: "P1", code: "9702_s18_11", qnum: 1, topic: "Waves", level: "LOT", marks: 1, answer: "B", img: "p1/9702_s18_11/q1.jpg", ms_img: null, ref: "r", duration: 75 },
  { id: "m2", paperType: "P1", code: "9702_s18_11", qnum: 2, topic: "Waves", level: "HOT", marks: 1, answer: "C", img: "p1/9702_s18_11/q2.jpg", ms_img: null, ref: "r", duration: 75 },
  { id: "m3", paperType: "P1", code: "9702_s18_11", qnum: 3, topic: "Kinematics", level: "LOT", marks: 1, answer: "A", img: "p1/9702_s18_11/q3.jpg", ms_img: null, ref: "r", duration: 75 },
  { id: "s1", paperType: "P2", code: "9702_s18_21", qnum: 1, topic: "Waves", level: "LOT", marks: 4, answer: null, img: "p2/9702_s18_21/q1.jpg", ms_img: "p2/9702_s18_21/q1_ms.jpg", ref: "r", duration: 75 },
  { id: "s2", paperType: "P2", code: "9702_s18_21", qnum: 2, topic: "Waves", level: "HOT", marks: 3, answer: null, img: "p2/9702_s18_21/q2.jpg", ms_img: "p2/9702_s18_21/q2_ms.jpg", ref: "r", duration: 75 },
];
const byId = new Map(bankQs.map((q) => [q.id, q]));

// ---- module loader (TypeScript -> CommonJS in this context) -------------------
const cache = new Map();
const mocks = {
  "server-only": {},
  "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  "@/lib/edu/auth": {
    getPortalUser: async () => user,
    isExamLabStaff: (roles) => roles.some((r) => ["super_admin", "admin", "teacher", "coordinator", "facilitator"].includes(r)),
    canConductDrills: (roles) => roles.some((r) => ["super_admin", "admin", "teacher", "coordinator", "facilitator", "teaching_assistant"].includes(r)),
    canAccessGlobalStaffData: (roles) => roles.some((r) => ["super_admin", "admin", "teacher"].includes(r)),
  },
  "@/lib/portal/course-access": { resolveCourseAccess: async () => ({ allowed: ["9702", "SAT"], primary: "9702", locked: false, isStaff: false }) },
  // SAT: the question bank, finished work and sittings, for sat/image-access.ts.
  "./bank.ts": { loadQuestionBank: () => [
    { id: "satq1", img: "sat/math/q1.png", rationaleImg: "sat/math/r/aaaaaaaaaaaaaaaaaaaa.png" },
    { id: "satq2", img: "sat/math/q2.png", rationaleImg: "sat/math/r/bbbbbbbbbbbbbbbbbbbb.png" },
  ] },
  "./analytics-data.ts": { studentAnalytics: async () => ({ history: new Map([["satq1", {}]]) }) },
  "./store.ts": { listSummaries: async () => [{ id: "pt1", kind: "practice" }], loadDocs: async () => [{ id: "pt1", kind: "practice" }] },
  "./serve.ts": { sessionState: () => ({ running: "module 1" }) },
  "./image-urls.ts": { imagePathsOf: () => ["sat/tests/4/math-m1-q1.jpg"] },
  "@/lib/exam-lab/bank-all": {
    questionById: (id) => byId.get(id),
    idsOfPaper: (code) => bankQs.filter((q) => q.code === code).sort((a, b) => a.qnum - b.qnum).map((q) => q.id),
    practiceBank: () => bankQs,
  },
  "./storage-fresh": {
    readFreshJson: async (bucket, p) => ({ ok: true, data: files.has(`${bucket}/${p}`) ? JSON.parse(files.get(`${bucket}/${p}`)) : null }),
    writeFreshJson: async (bucket, p, v) => { files.set(`${bucket}/${p}`, JSON.stringify(v)); return true; },
  },
  "./proctor": { getSession: async () => null },
  "@/lib/supabase/admin": {
    createAdminClient: () => ({
      storage: {
        from: (bucket) => ({
          upload: async (p, blob, opts) => {
            const key = `${bucket}/${p}`;
            if (opts && opts.upsert === false && files.has(key)) return { error: { message: "The resource already exists", statusCode: "409" } };
            files.set(key, await blob.text());
            return { error: null };
          },
          download: async () => ({ data: new Blob(["img"]), error: null }),
        }),
      },
    }),
  },
  "@/lib/sat/signed-images": { imageUrls: async (paths, o) => ({ ok: true, urls: Object.fromEntries(paths.map((p) => [p, `https://signed.test/${p}?fresh=${!!(o && o.fresh)}`])) }) },
  "@/lib/ai/maxwell": {
    markWithMaxwell: async (input) => { aiCalls.push(input.answer); return { ok: true, awarded: 3, outOf: input.outOf, feedback: "stub", points: [] }; },
  },
};

function resolveFile(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  throw new Error(`cannot resolve ${spec} from ${from}`);
}

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const req = (spec) => {
    if (Object.hasOwn(mocks, spec)) return mocks[spec];
    const target = resolveFile(spec, file);
    if (target) return load(target);
    return require(spec);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(req, module, module.exports);
  return module.exports;
}
const src = (p) => path.join(root, "src", p);

const seal = load(src("lib/exam-lab/seal.ts"));
const rules = load(src("lib/exam-lab/answer-rules.ts"));
const KEYS = { sitting: seal.deriveKey("a-long-enough-test-secret", "exam-lab:sitting:v1"), receipt: seal.deriveKey("a-long-enough-test-secret", "exam-lab:receipt:v1") };
mocks["@/lib/exam-lab/keys"] = { examLabKey: (purpose) => KEYS[purpose] ?? null };
const allocations = load(src("lib/exam-lab/allocations.ts"));
mocks["@/lib/exam-lab/sittings"] = {
  readSitting: (token, uid, now = Date.now(), maxAge = rules.SITTING_MAX_AGE_MS) => {
    const t = seal.verifyToken(token, KEYS.sitting);
    return rules.sittingTokenOk(t, uid, now, maxAge) ? t : null;
  },
  heldIds: async (uid, now, except = null) => rules.inPlayIds(await allocations.listAllocations(uid), now, mocks["@/lib/exam-lab/bank-all"].idsOfPaper, except),
};
const attemptRoute = load(src("app/api/exam-lab/attempt/route.ts"));
const revealRoute = load(src("app/api/exam-lab/reveal/route.ts"));
const markRoute = load(src("app/api/exam-lab/mark/route.ts"));
const attempts = load(src("lib/exam-lab/attempts.ts"));
mocks["@/lib/sat/image-access"] = load(src("lib/sat/image-access.ts"));
const assetRoute = load(src("app/api/exam-lab/asset/route.ts"));

// ---- helpers --------------------------------------------------------------------
const req = (body) => ({ json: async () => structuredClone(body), headers: { get: () => null } });
const sitting = (over) => seal.signToken({ v: 1, sid: seal.newSealId(), uid: "u1", alloc: null, help: true, strict: false, iat: Date.now(), ids: ["m1", "s1"], ...over }, KEYS.sitting);
const receipt = (sid, qid, answer, awarded = 4) => seal.signToken({ v: 1, uid: "u1", sid, qid, h: rules.answerHash(answer), awarded, outOf: 4, iat: Date.now() }, KEYS.receipt);
const sidOf = (token) => seal.verifyToken(token, KEYS.sitting).sid;
let nonce = 0;
const attempt = (token, qs, context = {}) => attemptRoute.POST(req({
  mode: "drill", paperType: "mixed",
  questions: qs.map((q) => ({ id: q.id, earned: null, response: q.response ?? null, receipt: q.receipt ?? null, feedback: q.feedback ?? null })),
  context: { integrity: "off", kind: "practice", help: true, revealsUsed: 0, proctored: false, cancelled: false, flags: 0, submissionId: `n${++nonce}`, ...(token ? { sitting: token } : {}), ...context },
}));
const lastAttempt = async () => (await attempts.getAttemptsStrict("u1")).at(-1);
async function allocate(id, over) {
  await allocations.allocateToStudents(["u1"], {
    id, mode: "assignment_help", content: { type: "custom", ids: ["m1", "s1"] }, title: id, instructions: null, durationMin: 30,
    dueAt: null, startsAt: null, classId: null, className: null, createdBy: "t1", createdByName: "Teacher", ...over,
  });
}

(async () => {
  // ===== m1: the answer freeze after a reveal is enforced on the server =====
  const practice = sitting({});
  const sid = sidOf(practice);
  // Maxwell marks an early answer (help is allowed): a receipt for "early".
  let r = await markRoute.POST(req({ token: practice, id: "s1", answer: "early answer" }));
  assert.equal(r.status, 200, "Maxwell before any reveal");
  const earlyReceipt = r.body.receipt;
  // The student then edits and reveals the scheme: the answer is frozen as sent.
  r = await revealRoute.POST(req({ token: practice, id: "s1", answer: "my real answer" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.answer, "my real answer");
  assert.match(r.body.url, /q1_ms\.jpg/);
  // Revealing again (another tab, or the retry of the image) never moves the freeze.
  r = await revealRoute.POST(req({ token: practice, id: "s1", answer: "a copy of the scheme", fresh: true }));
  assert.equal(r.status, 200);
  assert.equal(r.body.answer, "my real answer", "the first reveal's answer stands");
  assert.match(r.body.url, /fresh=true/, "the retry is a fresh signature");
  // Maxwell refuses an edited answer, marks the frozen one.
  r = await markRoute.POST(req({ token: practice, id: "s1", answer: "a copy of the scheme" }));
  assert.equal(r.status, 409, "no Maxwell mark for an answer edited after the reveal");
  r = await markRoute.POST(req({ token: practice, id: "s1", answer: "my real answer" }));
  assert.equal(r.status, 200);
  const frozenReceipt = r.body.receipt;
  // The attempt stores the frozen answer, whatever the browser sends...
  r = await attempt(practice, [{ id: "m1", response: "B" }, { id: "s1", response: "a copy of the scheme", receipt: earlyReceipt }]);
  assert.equal(r.status, 200);
  let saved = await lastAttempt();
  assert.equal(saved.questions.find((q) => q.id === "s1").response, "my real answer", "the answer at the reveal is what is recorded");
  assert.equal(saved.questions.find((q) => q.id === "s1").earned, null, "a receipt for another answer does not count");
  assert.equal(saved.questions.find((q) => q.id === "m1").correct, true);
  // ...and a receipt for the frozen answer does count (a fresh sitting of the same paper).
  const practice2 = sitting({});
  const sid2 = sidOf(practice2);
  await revealRoute.POST(req({ token: practice2, id: "s1", answer: "second go" }));
  r = await attempt(practice2, [{ id: "m1", response: "A" }, { id: "s1", response: "edited later", receipt: receipt(sid2, "s1", "second go") }]);
  assert.equal(r.status, 200);
  saved = await lastAttempt();
  assert.equal(saved.questions.find((q) => q.id === "s1").response, "second go");
  assert.equal(saved.questions.find((q) => q.id === "s1").earned, 4, "Maxwell's mark for the frozen answer counts");
  assert.equal(sid !== sid2, true);
  void frozenReceipt;

  // Reveals stay closed in a no-help assignment; the freeze needs a help-allowed sitting.
  await allocate("nohelp", { mode: "assignment_nohelp", content: { type: "custom", ids: ["m3", "s2"] } });
  const noHelp = sitting({ alloc: "nohelp", help: false, ids: ["m3", "s2"] });
  r = await revealRoute.POST(req({ token: noHelp, id: "s2", answer: "x" }));
  assert.equal(r.status, 403, "no mark scheme during a no-help assignment");
  r = await markRoute.POST(req({ token: noHelp, id: "s2", answer: "some answer" }));
  assert.equal(r.status, 403, "no Maxwell during a no-help assignment");
  // ...and its questions are held back everywhere else meanwhile.
  r = await revealRoute.POST(req({ token: sitting({ ids: ["s2"] }), id: "s2", answer: "x" }));
  assert.equal(r.status, 403, "a question of an open no-help assignment gets no scheme in practice");

  // ===== m3: legitimate allocation submissions =====
  // (a) a sitting token more than a day old (a paper left open overnight) still submits.
  await allocate("overnight", {});
  const old = sitting({ alloc: "overnight", iat: Date.now() - 2 * 24 * 60 * 60_000 });
  r = await attempt(old, [{ id: "m1", response: "B" }, { id: "s1", response: "answer", receipt: receipt(sidOf(old), "s1", "answer") }]);
  assert.equal(r.status, 200, "a two-day-old allocation sitting is saved");
  saved = await lastAttempt();
  assert.equal(saved.context.allocationId, "overnight");
  assert.equal(saved.questions.find((q) => q.id === "s1").earned, 4, "its Maxwell receipt still counts");
  r = await revealRoute.POST(req({ token: old, id: "s1", answer: "x" }));
  assert.equal(r.status, 403, "but the old token opens no more mark schemes");

  // (b) an unusable token (a key change) falls back to the allocation itself,
  // keeping its reveals' freeze: MCQs marked, no Maxwell marks.
  await allocate("rotated", {});
  const live = sitting({ alloc: "rotated" });
  r = await revealRoute.POST(req({ token: live, id: "s1", answer: "frozen in the assignment" }));
  assert.equal(r.status, 200, "a help-allowed assignment may reveal");
  const unusable = seal.signToken(seal.verifyToken(live, KEYS.sitting), seal.deriveKey("another-long-enough-secret", "exam-lab:sitting:v1"));
  r = await attempt(unusable, [{ id: "m1", response: "C" }, { id: "s1", response: "edited", receipt: receipt(sidOf(live), "s1", "edited") }], { allocationId: "rotated" });
  assert.equal(r.status, 200, "saved through the allocation");
  saved = await lastAttempt();
  assert.equal(saved.context.allocationId, "rotated");
  assert.equal(saved.questions.find((q) => q.id === "m1").correct, false, "the MCQ is marked on the server");
  assert.equal(saved.questions.find((q) => q.id === "s1").response, "frozen in the assignment", "the freeze is found by the allocation");
  assert.equal(saved.questions.find((q) => q.id === "s1").earned, null, "no Maxwell mark without a usable token");

  // (c) a legacy randomised spec drawn by a tab from before the deploy (never frozen).
  const spec = { type: "drill", paperType: "P1", topics: ["Waves"], levels: ["LOT", "HOT"], count: 2 };
  await allocate("legacy", { mode: "assignment_nohelp", content: spec });
  r = await attempt(null, [{ id: "m2", response: "C" }, { id: "m1", response: "A" }], { allocationId: "legacy", kind: "assignment", help: false });
  assert.equal(r.status, 200, "the old tab's own draw is saved");
  saved = await lastAttempt();
  assert.equal(saved.context.browserChosenPaper, true, "flagged for staff");
  assert.equal(saved.score, 1);
  assert.deepEqual((await allocations.getAllocation("u1", "legacy")).frozenIds, ["m2", "m1"], "and frozen");
  r = await attempt(null, [{ id: "m1", response: "B" }, { id: "m2", response: "C" }], { allocationId: "legacy", kind: "assignment", help: false });
  assert.equal(r.status, 409, "the allocation's recorded answers can't be replaced");
  await allocate("legacy2", { mode: "assignment_nohelp", content: spec });
  r = await attempt(null, [{ id: "m1", response: "B" }, { id: "m3", response: "A" }], { allocationId: "legacy2", kind: "assignment", help: false });
  assert.equal(r.status, 409, "a question the spec could not have drawn is refused");
  assert.equal((await allocations.getAllocation("u1", "legacy2")).frozenIds, undefined, "and nothing is frozen");

  // Refusals that must stay.
  r = await attempt(seal.signToken({ garbage: true }, KEYS.sitting), [{ id: "m1", response: "B" }]);
  assert.equal(r.status, 403, "practice with an unusable token is refused");
  r = await attempt(null, [{ id: "m1", response: "B" }]);
  assert.equal(r.status, 400, "practice without a sitting is refused");
  await allocate("exact", {});
  r = await attempt(sitting({ alloc: "exact", ids: ["m1", "m2"] }), [{ id: "m1", response: "B" }, { id: "m2", response: "C" }]);
  assert.equal(r.status, 400, "an allocation attempt must be its exact paper");
  await allocate("later", { startsAt: new Date(Date.now() + 60 * 60_000).toISOString() });
  r = await attempt(null, [{ id: "m1", response: "B" }, { id: "s1", response: "x" }], { allocationId: "later", kind: "assignment" });
  assert.equal(r.status, 403, "never before it opens");

  // ===== m2: a student signs by path only what their own work references =====
  const sign = async (paths) => (await assetRoute.POST(req({ paths }))).status;
  assert.equal(await sign(["p1/9702_s18_11/q1.jpg"]), 403, "an Exam Lab question image: only through its sitting");
  assert.equal(await sign(["p2/9702_s18_21/q1_ms.jpg"]), 403, "a mark scheme: never by path");
  assert.equal(await sign(["custom/9702_ct1_pqu/q01.png"]), 403, "a secure class-test image: never by path");
  assert.equal(await sign(["p2/9702_s18_21/full_ms_21.pdf"]), 403, "nor any other stray object in the bucket");
  assert.equal(await sign(["sat/math/q1.png", "sat/math/q2.png"]), 200, "SAT bank questions (any may be drilled)");
  assert.equal(await sign(["sat/math/r/aaaaaaaaaaaaaaaaaaaa.png"]), 200, "a worked answer of a finished question");
  assert.equal(await sign(["sat/math/r/bbbbbbbbbbbbbbbbbbbb.png"]), 403, "not of an unfinished one");
  assert.equal(await sign(["sat/other/answer-key.png"]), 403, "an SAT path that is no bank image");
  assert.equal(await sign(["sat/tests/4/math-m1-q1.jpg"]), 200, "the practice-test module on screen");
  assert.equal(await sign(["sat/tests/4/math-m2-q1.jpg"]), 403, "not the next module");
  user = { ...user, roles: ["teaching_assistant"] };
  assert.equal(await sign(["p1/9702_s18_11/q1.jpg", "p2/9702_s18_21/q1_ms.jpg", "custom/9702_ct1_pqu/q01.png"]), 200, "staff views of stored papers sign any exam image");
  user = { ...user, roles: ["student"] };

  assert.deepEqual(aiCalls, ["early answer", "my real answer"], "Maxwell (a stub) ran only for the allowed answers");
  console.log("exam-lab route tests passed");
})().catch((e) => { console.error(e); process.exitCode = 1; });
