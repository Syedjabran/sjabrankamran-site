/* Exam Lab answer security, route level (Task 2b-A fix rounds 1-2): the real
 * /api/exam-lab/sitting, /attempt, /reveal, /mark, /review and /asset
 * handlers, the real sittings module, allocations, attempts and reveals
 * stores and the real rules, over in-memory storage.
 * Mocked: the session, the question bank, image signing and Maxwell (NO AI
 * call is ever made -- markWithMaxwell is a stub).
 *
 * Covers: the server-side answer freeze after a reveal (m1), legitimate
 * allocation submissions that used to be refused -- an older sitting token,
 * an unusable token, a legacy spec drawn by a tab from before the deploy (m3)
 * -- that the refusals which must stay still do, and what a student may have
 * signed by path (/api/exam-lab/asset + sat/image-access.ts, m2).
 * Round 2: a hand-built request can't pick an allocation's questions (N1);
 * only a teacher-set whole-paper test pauses whole practice papers, other
 * held questions are withheld instead (N2); /reveal needs the answer (N3); a
 * reopened assignment gets its frozen answers back (N4); a review judges
 * holds as of its sitting's opening (N5).
 * Round 3: a held MCQ in a practice paper is stored unscored -- right and
 * wrong answers give byte-identical results (NB1); a staff-written class
 * test pauses no practice paper (NB2); the first-open freeze is race-safe
 * and survives a stale write (NB3); reveals are listed once (NB4).
 * Round 4: holds follow the write-once frozen set after a stale write and
 * fail closed (NB5); inside an allocation, another allocation's held
 * questions are stored unscored (R1); an allocation takes one graded
 * submission whatever the browser says -- "cancelled" buys no re-sit, a
 * super-admin unlock buys exactly one (OS-A).
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
const reads = []; // storage paths read, to count reads
const unreadable = new Set(); // storage paths whose read fails (fail-closed checks)
let listFails = false; // storage listings fail

// ---- a tiny bank: two MCQs and two structured questions -----------------------
const bankQs = [
  { id: "m1", paperType: "P1", code: "9702_s18_11", qnum: 1, topic: "Waves", level: "LOT", marks: 1, answer: "B", img: "p1/9702_s18_11/q1.jpg", ms_img: null, ref: "r", duration: 75 },
  { id: "m2", paperType: "P1", code: "9702_s18_11", qnum: 2, topic: "Waves", level: "HOT", marks: 1, answer: "C", img: "p1/9702_s18_11/q2.jpg", ms_img: null, ref: "r", duration: 75 },
  { id: "m3", paperType: "P1", code: "9702_s18_11", qnum: 3, topic: "Kinematics", level: "LOT", marks: 1, answer: "A", img: "p1/9702_s18_11/q3.jpg", ms_img: null, ref: "r", duration: 75 },
  { id: "s1", paperType: "P2", code: "9702_s18_21", qnum: 1, topic: "Waves", level: "LOT", marks: 4, answer: null, img: "p2/9702_s18_21/q1.jpg", ms_img: "p2/9702_s18_21/q1_ms.jpg", ref: "r", duration: 75 },
  { id: "s2", paperType: "P2", code: "9702_s18_21", qnum: 2, topic: "Waves", level: "HOT", marks: 3, answer: null, img: "p2/9702_s18_21/q2.jpg", ms_img: "p2/9702_s18_21/q2_ms.jpg", ref: "r", duration: 75 },
  // The staff-written secure bank: a whole "paper" code, in no practice paper.
  { id: "k1", paperType: "P1", code: "9702_ct1_pqu", qnum: 1, topic: "Units", level: "LOT", marks: 1, answer: "D", img: "custom/9702_ct1_pqu/q01.png", ms_img: null, ref: "ct", duration: 30 },
  { id: "k2", paperType: "P1", code: "9702_ct1_pqu", qnum: 2, topic: "Units", level: "LOT", marks: 1, answer: "A", img: "custom/9702_ct1_pqu/q02.png", ms_img: null, ref: "ct", duration: 30 },
];
const SECURE = new Set(["k1", "k2"]);
const byId = new Map(bankQs.map((q) => [q.id, q]));
const idsOfPaper = (code) => bankQs.filter((q) => q.code === code).sort((a, b) => a.qnum - b.qnum).map((q) => q.id);
const bankAll = {
  questionById: (id) => byId.get(id),
  idsOfPaper,
  practiceBank: () => bankQs.filter((q) => !SECURE.has(q.id)),
  isSecureQuestion: (id) => SECURE.has(id),
  safeQuestion: (q) => ({ id: q.id, course: "9702", paperType: q.paperType, code: q.code, qnum: q.qnum, topic: q.topic, level: q.level, marks: q.marks, img: q.img, ref: q.ref, duration: q.duration, hasMs: !!q.ms_img }),
};

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
  "@/lib/exam-lab/bank-all": bankAll,
  "./bank-all": bankAll,
  "./image-bank": { IMAGE_BANK: bankQs },
  "./storage-fresh": {
    readFreshJson: async (bucket, p) => {
      reads.push(p);
      await Promise.resolve();
      if (unreadable.has(p)) return { ok: false };
      return { ok: true, data: files.has(`${bucket}/${p}`) ? JSON.parse(files.get(`${bucket}/${p}`)) : null };
    },
    writeFreshJson: async (bucket, p, v) => { await Promise.resolve(); files.set(`${bucket}/${p}`, JSON.stringify(v)); return true; },
    createFreshJson: async (bucket, p, v) => {
      await Promise.resolve();
      if (files.has(`${bucket}/${p}`)) return false;
      files.set(`${bucket}/${p}`, JSON.stringify(v));
      return true;
    },
  },
  "@/lib/portal/tasks": { completeTaskBySource: async () => {} },
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
          list: async (prefix) => (listFails ? { data: null, error: { message: "list failed" } } : {
            data: [...files.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}/`)).map((k) => ({ name: k.slice(bucket.length + prefix.length + 2) })).filter((f) => !f.name.includes("/")),
            error: null,
          }),
        }),
      },
    }),
  },
  "@/lib/sat/signed-images": {
    imageUrls: async (paths, o) => ({ ok: true, urls: Object.fromEntries(paths.map((p) => [p, `https://signed.test/${p}?fresh=${!!(o && o.fresh)}`])) }),
    imagesOf: async (paths) => Object.fromEntries(paths.map((p) => [p, `https://signed.test/${p}`])),
  },
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
mocks["./keys"] = mocks["@/lib/exam-lab/keys"];
const allocations = load(src("lib/exam-lab/allocations.ts"));
const proctor = load(src("lib/exam-lab/proctor.ts")); // the real proctor log (sessions, locks, unlocks)
const allocationsRoute = load(src("app/api/exam-lab/allocations/route.ts"));
const sittingRoute = load(src("app/api/exam-lab/sitting/route.ts"));
const reviewRoute = load(src("app/api/exam-lab/review/route.ts"));
const attemptRoute = load(src("app/api/exam-lab/attempt/route.ts"));
const revealRoute = load(src("app/api/exam-lab/reveal/route.ts"));
const markRoute = load(src("app/api/exam-lab/mark/route.ts"));
const attempts = load(src("lib/exam-lab/attempts.ts"));
mocks["@/lib/sat/image-access"] = load(src("lib/sat/image-access.ts"));
const assetRoute = load(src("app/api/exam-lab/asset/route.ts"));

// ---- helpers --------------------------------------------------------------------
const req = (body) => ({ json: async () => structuredClone(body), headers: { get: () => null } });
const sitting = (over) => seal.signToken({ v: 1, sid: seal.newSealId(), uid: "u1", alloc: null, help: true, strict: false, iat: Date.now(), ids: ["m1", "s1"], ...over }, KEYS.sitting);
const open = async (body) => sittingRoute.POST(req(body));
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

  // (c) N1: never a browser-chosen set. A hand-built request picking its own
  // questions for a never-opened drill / daily / weekly allocation is refused
  // (the student reloads); the server alone freezes an allocation's questions.
  const spec = { type: "drill", paperType: "P1", topics: ["Waves"], levels: ["LOT", "HOT"], count: 2 };
  await allocate("legacy", { mode: "assignment_nohelp", content: spec });
  r = await attempt(null, [{ id: "m2", response: "C" }, { id: "m1", response: "B" }], { allocationId: "legacy", kind: "assignment", help: false });
  assert.equal(r.status, 409, "a hand-built pick for a never-opened allocation is refused");
  assert.equal(r.body.error, "Please reload this page to start again.");
  assert.equal((await allocations.getAllocation("u1", "legacy")).frozenIds, undefined, "and nothing is frozen");
  // Opened through /sitting, the server freezes it; that exact set is then taken.
  r = await open({ allocationId: "legacy" });
  assert.equal(r.status, 200);
  const frozenSet = r.body.questions.map((q) => q.id);
  assert.deepEqual((await allocations.getAllocation("u1", "legacy")).frozenIds, frozenSet);
  r = await attempt(r.body.token, frozenSet.map((id) => ({ id, response: "B" })));
  assert.equal(r.status, 200, "the server's own set is saved");

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

  // ===== N2: only a teacher-set whole-paper test pauses whole practice papers =====
  // Held so far: the open no-help assignment "nohelp" (m3, s2 -- drill-style)
  // and the opened study-plan-style drill "legacy" (its frozen P1 pair).
  const practice9702 = (practice) => open({ practice, course: "9702", mode: "practice" });
  r = await practice9702({ type: "paper", code: "9702_s18_21" });
  assert.equal(r.status, 200, "a drill-style / automated hold pauses no paper");
  const heldPaper = r.body.token;
  r = await revealRoute.POST(req({ token: heldPaper, id: "s2", answer: "" }));
  assert.equal(r.status, 403, "the held question's mark scheme is withheld while it is held");
  r = await revealRoute.POST(req({ token: heldPaper, id: "s1", answer: "" }));
  assert.equal(r.status, 200, "the rest of the paper is normal");
  r = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(r.status, 200, "an opened automated drill pauses nothing either");
  await allocate("paper-test", { mode: "test", content: { type: "drillref", drillId: "d1", ref: "DR-1", ids: ["s1", "s2"], spec: { type: "paper", code: "9702_s18_21" } } });
  bankQs.push({ id: "s3", paperType: "P2", code: "9702_w19_22", qnum: 1, topic: "Waves", level: "LOT", marks: 2, answer: null, img: "p2/9702_w19_22/q1.jpg", ms_img: "p2/9702_w19_22/q1_ms.jpg", ref: "r", duration: 75 });
  byId.set("s3", bankQs.at(-1));
  const refusalA = await practice9702({ type: "paper", code: "9702_s18_21" });
  const refusalB = await practice9702({ type: "paper", code: "9702_w19_22" });
  assert.equal(refusalA.status, 409, "a teacher-set whole-paper test pauses its type");
  assert.match(refusalA.body.error, /paused while you have a test of this type in progress/);
  assert.equal(JSON.stringify(refusalB), JSON.stringify(refusalA), "every paper of the type gets the byte-identical refusal");
  r = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(r.status, 200, "other paper types stay open");
  r = await practice9702({ type: "drill", paperType: "P2", topics: [], levels: ["LOT", "HOT"], count: 5 });
  assert.equal(r.status, 200, "drills of the paused type stay open");
  assert.deepEqual(r.body.questions.map((q) => q.id), ["s3"], "without the test's questions");
  await allocations.markSubmitted("u1", "paper-test", {});

  // ===== N5: a review judges holds as of its sitting's opening =====
  // A paper blank-submitted before a new hold starts and reviewed after it:
  // the new test's question is not marked held (that would name it); a
  // question already held when the sitting opened still is.
  const early = await practice9702({ type: "paper", code: "9702_s18_21" });
  assert.equal(early.status, 200);
  r = await attempt(early.body.token, early.body.questions.map((q) => ({ id: q.id, response: null })));
  assert.equal(r.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await allocate("new-test", { mode: "test", content: { type: "custom", ids: ["s1"] } });
  r = await reviewRoute.POST(req({ token: early.body.token }));
  assert.equal(r.status, 200);
  assert.equal(r.body.items.s1.held, undefined, "held after the sitting opened: not marked");
  assert.equal(r.body.items.s2.held, true, "held when it opened: still withheld");
  const late = await practice9702({ type: "drill", paperType: "P2", topics: [], levels: ["LOT", "HOT"], count: 5 });
  assert.ok(!late.body.questions.some((q) => q.id === "s1"), "the new hold applies to new sittings");
  await allocations.markSubmitted("u1", "new-test", {});

  // ===== N3: /reveal needs the answer; N4: a reopened assignment gets its frozen answers =====
  await allocate("help-open", {});
  r = await open({ allocationId: "help-open" });
  assert.equal(r.status, 200);
  assert.equal(r.body.reveals, undefined, "nothing frozen yet");
  const helpToken = r.body.token;
  r = await revealRoute.POST(req({ token: helpToken, id: "s1" }));
  assert.equal(r.status, 400, "a page that sends no answer (from before this rule) must reload");
  assert.equal(r.body.error, "Please reload this page to start again.");
  r = await revealRoute.POST(req({ token: helpToken, id: "s1", answer: "what I wrote" }));
  assert.equal(r.status, 200);
  r = await open({ allocationId: "help-open" });
  assert.deepEqual(r.body.reveals, { s1: "what I wrote" }, "after a reload the frozen answer comes back, locked");

  // ===== NB1: a held MCQ in a practice paper is stored unscored =====
  // Held now: "nohelp" (m3, s2) and the frozen "legacy" pair. Paper 9702_s18_11
  // opens (nothing pauses P1). Answer the held m3 right in one sitting and
  // wrong in another: byte-identical responses, records and reviews for it.
  const sitA = await practice9702({ type: "paper", code: "9702_s18_11" });
  const sitB = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(sitA.status, 200);
  assert.equal(sitB.status, 200);
  const answersFor = (m3) => [{ id: "m1", response: "B" }, { id: "m2", response: "C" }, { id: "m3", response: m3 }];
  const resA = await attempt(sitA.body.token, answersFor("A")); // m3's key is A: right
  const recA = (await lastAttempt()).questions.find((q) => q.id === "m3");
  const resB = await attempt(sitB.body.token, answersFor("B")); // wrong
  const recB = (await lastAttempt()).questions.find((q) => q.id === "m3");
  assert.equal(JSON.stringify(resA), JSON.stringify(resB), "the same response to the submission");
  assert.equal(JSON.stringify(recA), JSON.stringify(recB), "the same stored record for the held question");
  assert.deepEqual(recA, { id: "m3", topic: "Kinematics", level: "LOT", paperType: "P1", marks: 1, earned: null, correct: null, spentSec: null, response: null, feedback: null, held: true });
  const revA = await reviewRoute.POST(req({ token: sitA.body.token }));
  const revB = await reviewRoute.POST(req({ token: sitB.body.token }));
  assert.equal(JSON.stringify(revA), JSON.stringify(revB), "the same review, score included");
  assert.deepEqual(revA.body.items.m3, { held: true });
  const storedA = (await attempts.getAttemptsStrict("u1")).find((a) => a.context?.sittingId === sidOf(sitA.body.token));
  assert.equal(storedA.score, 0, "the held questions add nothing to the paper's score");
  assert.equal(storedA.total, 0);
  // Once the hold ends, a later sitting scores it as usual.
  await allocations.markSubmitted("u1", "nohelp", {});
  const sitC = await practice9702({ type: "paper", code: "9702_s18_11" });
  await attempt(sitC.body.token, answersFor("A"));
  const recC = (await lastAttempt()).questions.find((q) => q.id === "m3");
  assert.equal(recC.correct, true, "no longer held: scored");
  assert.equal(recC.held, undefined);
  // Held when submitted, though not when the sitting opened: unscored.
  const sitD = await practice9702({ type: "paper", code: "9702_s18_11" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await allocate("late-hold", { mode: "assignment_nohelp", content: { type: "custom", ids: ["m3"] } });
  await attempt(sitD.body.token, answersFor("A"));
  assert.equal((await lastAttempt()).questions.find((q) => q.id === "m3").held, true, "a hold that began after opening still counts at submission");
  await allocations.markSubmitted("u1", "late-hold", {});
  // Its review keeps what was stored held withheld and out of the score, even
  // though the hold began after the sitting opened (and has since ended).
  const revD = await reviewRoute.POST(req({ token: sitD.body.token }));
  assert.deepEqual(revD.body.items.m3, { held: true }, "stored held: withheld in the review");
  assert.deepEqual(revD.body.mcq, { got: 0, total: 0 }, "and out of its MCQ total");

  // ===== NB2: a staff-written class test pauses no practice paper =====
  await allocate("secure-test", { mode: "test", content: { type: "drillref", drillId: "d2", ref: "DR-2", ids: ["k1", "k2"], spec: { type: "custom", ids: ["k1", "k2"] } } });
  r = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(r.status, 200, "a whole secure class test is not a past paper: P1 papers stay open");
  await allocations.markSubmitted("u1", "secure-test", {});

  // ===== NB3: the first-open freeze is race-safe and survives a stale write =====
  await allocate("race", { mode: "assignment_nohelp", content: { type: "drill", paperType: "P1", topics: ["Waves"], levels: ["LOT", "HOT"], count: 2 } });
  const [tabOne, tabTwo] = await Promise.all([
    allocations.freezeAllocationIds("u1", "race", () => ["m1", "m2"]),
    allocations.freezeAllocationIds("u1", "race", () => ["m2", "m1"]),
  ]);
  assert.deepEqual(tabOne, tabTwo, "two tabs opening at once get the same set");
  assert.deepEqual((await allocations.getAllocation("u1", "race")).frozenIds, tabOne, "and the allocation records it");
  // A stale whole-doc write drops frozenIds: the write-once record still decides.
  const docKey = "portal-data/exam-allocations/u1.json";
  const doc = JSON.parse(files.get(docKey));
  doc.items = doc.items.map((it) => (it.id === "race" ? { ...it, frozenIds: undefined } : it));
  files.set(docKey, JSON.stringify(doc));
  r = await attempt(sitting({ alloc: "race", ids: tabOne }), tabOne.map((id) => ({ id, response: "B" })));
  assert.equal(r.status, 200, "the frozen set is still taken");
  await allocate("race2", { mode: "assignment_nohelp", content: { type: "daily" } });
  await allocations.freezeAllocationIds("u1", "race2", () => ["m1"]);
  r = await attempt(null, [{ id: "m2", response: "C" }], { allocationId: "race2", kind: "assignment", help: false });
  assert.equal(r.status, 400, "and no other set is");

  // ===== NB4: an open lists the scope's reveals once =====
  await allocate("help-two", { content: { type: "custom", ids: ["s1", "s2"] } });
  r = await open({ allocationId: "help-two" });
  await revealRoute.POST(req({ token: r.body.token, id: "s1", answer: "one" }));
  reads.length = 0;
  r = await open({ allocationId: "help-two" });
  assert.deepEqual(r.body.reveals, { s1: "one" });
  assert.deepEqual(reads.filter((p) => p.startsWith("exam-reveals/")), ["exam-reveals/u1/a-help-two/s1.json"], "one listing, then only the revealed question is read");

  // ===== NB5: a hold follows the write-once frozen set, and fails closed =====
  // Still in play: "legacy" and "race2" (frozen on the doc) and "race", whose
  // doc copy a stale write dropped above (its record still holds the set it
  // can submit). Close the first two: only the record can hold m1 / m2 now.
  await allocations.markSubmitted("u1", "legacy", {});
  await allocations.markSubmitted("u1", "race2", {});
  assert.equal((await allocations.getAllocation("u1", "race")).frozenIds, undefined, "the doc copy is gone");
  const staleSit = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(staleSit.status, 200);
  r = await attempt(staleSit.body.token, answersFor("A"));
  assert.equal(r.status, 200);
  const staleRec = await lastAttempt();
  for (const id of tabOne) assert.equal(staleRec.questions.find((q) => q.id === id).held, true, `${id}: held through the frozen record`);
  assert.equal(staleRec.questions.find((q) => q.id === "m3").correct, true, "the rest of the paper is scored");
  // Fail closed: an unreadable record (or listing) refuses rather than un-holds.
  unreadable.add("exam-allocations/frozen/u1/race.json");
  r = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(r.status, 503, "a frozen record that can't be read refuses the sitting");
  r = await revealRoute.POST(req({ token: heldPaper, id: "s1", answer: "" }));
  assert.equal(r.status, 503, "and every other hold reader");
  unreadable.delete("exam-allocations/frozen/u1/race.json");
  listFails = true;
  r = await practice9702({ type: "paper", code: "9702_s18_11" });
  assert.equal(r.status, 503, "so does a listing that fails");
  listFails = false;
  await allocations.markSubmitted("u1", "race", {});

  // Held when the sitting opened, though no longer when it is submitted (its
  // hold lapsed by time in between): still stored unscored.
  const openedAt = Date.now() - 2 * 24 * 60 * 60_000;
  await allocate("lapsing", { mode: "assignment_nohelp", content: { type: "custom", ids: ["m3"] }, dueAt: new Date(Date.now() - rules.IN_PLAY_GRACE_MS - 60 * 60_000).toISOString() });
  const lapDoc = JSON.parse(files.get("portal-data/exam-allocations/u1.json"));
  lapDoc.items = lapDoc.items.map((it) => (it.id === "lapsing" ? { ...it, createdAt: openedAt - 60 * 60_000 } : it));
  files.set("portal-data/exam-allocations/u1.json", JSON.stringify(lapDoc));
  const lapToken = sitting({ ids: ["m1", "m2", "m3"], iat: openedAt });
  r = await attempt(lapToken, answersFor("A"));
  assert.equal(r.status, 200);
  assert.equal((await lastAttempt()).questions.find((q) => q.id === "m3").held, true, "held as of the sitting's opening");
  assert.equal((await lastAttempt()).questions.find((q) => q.id === "m1").correct, true);
  await allocations.markSubmitted("u1", "lapsing", {});

  // ===== R1: inside an allocation, another allocation's held questions are unscored =====
  // A live test holds m2; two no-help assignments each share m2 with it.
  await allocate("r1-test", { mode: "test", content: { type: "custom", ids: ["m2"] } });
  await allocate("r1-a", { mode: "assignment_nohelp", content: { type: "custom", ids: ["m1", "m2"] } });
  await allocate("r1-b", { mode: "assignment_nohelp", content: { type: "custom", ids: ["m3", "m2"] } });
  const r1a = await open({ allocationId: "r1-a" });
  const r1b = await open({ allocationId: "r1-b" });
  assert.equal(r1a.status, 200);
  assert.equal(r1b.status, 200);
  const r1ctx = { kind: "assignment", help: false, integrity: "standard" };
  const resRight = await attempt(r1a.body.token, [{ id: "m1", response: "B" }, { id: "m2", response: "C" }], r1ctx); // m2's key is C
  const recRight = (await lastAttempt()).questions;
  const resWrong = await attempt(r1b.body.token, [{ id: "m3", response: "A" }, { id: "m2", response: "D" }], r1ctx);
  const recWrong = (await lastAttempt()).questions;
  assert.equal(JSON.stringify(resRight), JSON.stringify(resWrong), "the same response to the submission");
  assert.equal(JSON.stringify(recRight.find((q) => q.id === "m2")), JSON.stringify(recWrong.find((q) => q.id === "m2")), "the same stored record for the held question");
  assert.equal(recRight.find((q) => q.id === "m2").held, true);
  assert.equal(recRight.find((q) => q.id === "m1").correct, true, "the allocation's own question is graded");
  assert.equal(recWrong.find((q) => q.id === "m3").correct, true);
  await allocations.markSubmitted("u1", "r1-a", {});
  r = await reviewRoute.POST(req({ token: r1a.body.token }));
  assert.deepEqual(r.body.items.m2, { held: true });
  assert.deepEqual(r.body.mcq, { got: 1, total: 1 }, "the held question is out of the allocation's score");
  for (const id of ["r1-b", "r1-test"]) await allocations.markSubmitted("u1", id, {});

  // ===== OS-A: an allocation takes ONE graded submission; the browser can't buy more =====
  const attemptsKey = "exam-data/u1.json";
  const allocKey = "portal-data/exam-allocations/u1.json";
  const ALREADY = { ok: false, alreadySubmitted: true, error: "This sitting's answers were already recorded — these were not saved again." };
  const osaCtx = (over) => ({ kind: "assignment", help: false, integrity: "standard", ...over });
  // (a) A no-help assignment whose guard "cancelled" it (the browser says so).
  await allocate("osa-work", { mode: "assignment_nohelp", content: { type: "custom", ids: ["m1", "m3"] } });
  r = await open({ allocationId: "osa-work" });
  assert.equal(r.status, 200);
  r = await attempt(r.body.token, [{ id: "m1", response: "A" }, { id: "m3", response: "A" }], osaCtx({ cancelled: true, lockedReason: "Switched tabs" }));
  assert.equal(r.status, 200, "the cancelled sitting is stored");
  saved = await lastAttempt();
  assert.equal(saved.context.cancelled, true, "the browser's report is kept for staff");
  assert.equal(saved.questions.find((q) => q.id === "m3").correct, true, "and graded: it is the submission");
  const closed = await allocations.getAllocation("u1", "osa-work");
  assert.equal(closed.status, "submitted", "the server closes it: no re-sit is offered");
  assert.equal(closed.unattempted, true, "a cancelled sitting earns no credit");
  let before = [files.get(attemptsKey), files.get(allocKey)];
  const again = await attempt(null, [{ id: "m1", response: "B" }, { id: "m3", response: "B" }], osaCtx({ allocationId: "osa-work", cancelled: true }));
  const againWrong = await attempt(null, [{ id: "m1", response: "C" }, { id: "m3", response: "C" }], osaCtx({ allocationId: "osa-work", cancelled: true }));
  assert.equal(again.status, 409, "a second submission saying cancelled is refused");
  assert.deepEqual(again.body, ALREADY, "with a plain message: no score, no correctness");
  assert.equal(JSON.stringify(againWrong), JSON.stringify(again), "whatever it answered");
  assert.deepEqual([files.get(attemptsKey), files.get(allocKey)], before, "and nothing stored changes");
  r = await open({ allocationId: "osa-work" });
  assert.equal(r.status, 409, "nor does it open again");

  // (b) A proctored test: the proctor session locks it (not the browser's flag).
  await allocate("osa-test", { mode: "test", content: { type: "custom", ids: ["m1", "m3"] } });
  const lockId = "alloc-osa-test";
  const started = async () => allocationsRoute.POST(req({ id: "osa-test", action: "started" }));
  const sessionInit = { studentName: "Student One", studentEmail: "s1@example.test", kind: "test", integrity: "strict", meta: { title: "osa-test" }, cameraConsent: true };
  r = await open({ allocationId: "osa-test" });
  assert.equal(r.status, 200);
  const firstTestToken = r.body.token;
  await proctor.startSession("u1", lockId, sessionInit);
  assert.equal((await started()).status, 200);
  await proctor.appendEvents("u1", lockId, [{ type: "tab", reason: "Left the tab", terminal: true, at: Date.now(), source: "guard" }]);
  r = await attempt(firstTestToken, [{ id: "m1", response: "A" }, { id: "m3", response: "A" }], osaCtx({ kind: "test", integrity: "strict", proctored: true, cancelled: true }));
  assert.equal(r.status, 200, "the locked sitting's answers are stored");
  assert.notEqual((await allocations.getAllocation("u1", "osa-test")).status, "submitted", "a proctored one is left to its lock");
  const sessKey = `portal-data/proctor/u1/${lockId}.json`;
  before = [files.get(attemptsKey), files.get(allocKey), files.get(sessKey)];
  r = await attempt(null, [{ id: "m1", response: "B" }, { id: "m3", response: "B" }], osaCtx({ allocationId: "osa-test", kind: "test", cancelled: true }));
  assert.equal(r.status, 409, "cancelled again: refused");
  assert.deepEqual(r.body, ALREADY);
  r = await attempt(sitting({ alloc: "osa-test", ids: ["m1", "m3"], help: false, strict: true }), [{ id: "m1", response: "B" }, { id: "m3", response: "B" }], osaCtx({ kind: "test", cancelled: true }));
  assert.equal(r.status, 409, "a new sitting of it is refused too");
  assert.deepEqual([files.get(attemptsKey), files.get(allocKey), files.get(sessKey)], before, "nothing stored changes");
  r = await open({ allocationId: "osa-test" });
  assert.equal(r.status, 423, "the lock holds");
  // A super-admin unlock grants exactly one more (unlocking twice, still one).
  await proctor.unlockTest("u1", lockId, "sa1", "Super Admin", "camera fault");
  await proctor.unlockTest("u1", lockId, "sa1", "Super Admin", "clicked twice");
  assert.equal(await proctor.unlockCount("u1", lockId), 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  r = await open({ allocationId: "osa-test" });
  assert.equal(r.status, 200, "the unlocked test opens");
  await proctor.startSession("u1", lockId, sessionInit); // the re-sit's session reset
  assert.equal(await proctor.unlockCount("u1", lockId), 1, "the grant survives the reset");
  assert.equal((await started()).status, 200);
  unreadable.add(`proctor/u1/${lockId}.json`);
  before = files.get(attemptsKey);
  const resit = [{ id: "m1", response: "B" }, { id: "m3", response: "A" }];
  r = await attempt(r.body.token, resit, osaCtx({ kind: "test", integrity: "strict", proctored: true }));
  assert.equal(r.status, 503, "an unlock that can't be read is never guessed");
  assert.equal(files.get(attemptsKey), before, "and nothing is stored");
  unreadable.delete(`proctor/u1/${lockId}.json`);
  r = await open({ allocationId: "osa-test" });
  r = await attempt(r.body.token, resit, osaCtx({ kind: "test", integrity: "strict", proctored: true }));
  assert.equal(r.status, 200, "the re-sit is stored");
  assert.equal((await lastAttempt()).questions.find((q) => q.id === "m1").correct, true);
  r = await attempt(null, [{ id: "m1", response: "C" }, { id: "m3", response: "C" }], osaCtx({ allocationId: "osa-test", kind: "test" }));
  assert.equal(r.status, 409, "exactly one more");
  await allocations.markSubmitted("u1", "osa-test", {});
  // A session unlocked before the ledger existed keeps its one grant through the reset.
  await allocate("osa-legacy", { mode: "test", content: { type: "custom", ids: ["m1"] } });
  const legacyKey = "portal-data/proctor/u1/alloc-osa-legacy.json";
  files.set(legacyKey, JSON.stringify({ ...JSON.parse(files.get(sessKey)), attemptId: "alloc-osa-legacy", status: "unlocked", unlocks: undefined, unlock: { by: "sa1", byName: "Super Admin", at: Date.now(), note: "old" } }));
  await proctor.startSession("u1", "alloc-osa-legacy", sessionInit);
  assert.equal(await proctor.unlockCount("u1", "alloc-osa-legacy"), 1, "a legacy unlock still grants one");
  await allocations.markSubmitted("u1", "osa-legacy", {});

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
