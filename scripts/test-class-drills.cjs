/* Integration regression: real allocation route + storage helpers, in-memory I/O. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = new Map();
let user, visible = ['class-a', 'class-b'], failPath = null;
const bank = [1, 2, 3].map(n => ({ id: `q${n}`, ref: `Q${n}`, paperType: 'P1', code: 'paper', qnum: n, topic: 'Waves', level: 'LOT', marks: 1, img: `q${n}.png`, ms_img: null, answer: 'A' }));
const sb = {
  storage: { from: () => ({
    download: async p => ({ data: files.has(p) ? new Blob([files.get(p)]) : null }),
    upload: async (p, body) => { if (p === failPath) return { error: { message: 'storage unavailable' } }; files.set(p, await body.text()); return { error: null }; }
  }) },
  from: table => {
    const query = {
      select() { return this; }, in() { return this; }, eq() { return this; }, order() { return this; },
      then(resolve) { return Promise.resolve({ data: table === 'edu_enrolments' ? [{ edu_students: { profile_id: 'student-one' } }, { edu_students: { profile_id: 'student-two' } }] : table === 'edu_classes' ? [ { id: 'class-a', name: 'A', active: true }, { id: 'outside', name: 'Outside', active: true } ] : [] }).then(resolve); }
    }; return query;
  }
};
const mocks = {
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/supabase/admin': { createAdminClient: () => sb },
  '@/lib/supabase/server': { createClient: () => { throw new Error('unexpected auth I/O'); } },
  '@/lib/portal/admin': { audit: async () => {} },
  '@/lib/portal/notifications': { notify: async () => {} },
  '@/lib/portal/timetable': { visibleClassIdsForUid: async () => visible },
  '@/lib/portal/institutions': { getRegistry: async () => ({ classes: [{ id: 'class-a', name: 'A', school: 'School A' }, { id: 'outside', name: 'Outside', school: 'Other School' }], schools: ['School A', 'Other School'] }) },
  '@/lib/exam-lab/image-bank': { FULL_BANK: bank }
};
const cache = new Map();
function load(file) {
  const full = path.join(root, file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} }; cache.set(full, module);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireLocal = name => { if (mocks[name]) return mocks[name]; if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`); throw new Error(`Unexpected import ${name}`); };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: full })(requireLocal, module, module.exports);
  return module.exports;
}
const auth = load('src/lib/edu/auth.ts'); auth.getPortalUser = async () => user;
const route = load('src/app/api/portal/admin/exam-allocate/route.ts');
const picker = load('src/app/api/portal/admin/classes/route.ts');
const allocations = load('src/lib/exam-lab/allocations.ts');
const records = load('src/lib/exam-lab/drill-records.ts');
const payload = { title: 'Shared class paper', mode: 'assignment_help', target_type: 'group', class_ids: ['class-a','class-b'], content: { type: 'custom', ids: ['q3','q1','q2'] } };
const post = body => route.POST({ json: async () => structuredClone(body) });
(async () => {
  for (const role of ['teacher','super_admin','coordinator','facilitator']) {
    files.clear(); user = { id: 'staff', roles: [role], fullName: 'Staff', email: 'staff@example.test' };
    const response = await post(payload); assert.equal(response.status, 200, role);
    const record = await records.getDrillRecord(response.body.drillId);
    assert.deepEqual(record.snapshot.map(q => q.id), payload.content.ids);
    for (const uid of ['staff','student-one','student-two']) {
      const first = (await allocations.listAllocations(uid))[0];
      const reopened = await allocations.getAllocation(uid, first.id);
      assert.deepEqual(first.content.ids, payload.content.ids, `${role}: ${uid}`);
      assert.deepEqual(reopened.content.ids, first.content.ids);
      assert.equal(first.content.ref, record.ref);
    }
  }
  user.roles = ['teacher'];
  const choices = await picker.GET(); assert.equal(choices.status, 200);
  assert.deepEqual(choices.body.classes.map(c => c.id), ['class-a']);
  assert.deepEqual(choices.body.schools, ['School A']);
  visible = []; assert.equal((await post(payload)).status, 403, 'unmapped teacher must fail closed');
  visible = ['class-a']; assert.equal((await post(payload)).status, 403, 'out-of-scope group denied');
  visible = ['class-a','class-b']; user.roles = ['student']; assert.equal((await post(payload)).status, 403); assert.equal((await picker.GET()).status, 403);
  user.roles = ['teacher']; assert.equal((await post({...payload, content: {type:'custom',ids:['missing']}})).status,400);
  user.roles = ['super_admin']; files.clear();
  const test = await post({...payload,mode:'test'}); assert.equal(test.status,200); assert.deepEqual((await allocations.listAllocations('student-one'))[0].content.ids,payload.content.ids);
  files.clear(); failPath='exam-drills/index.json'; assert.equal((await post(payload)).status,503); assert.equal((await allocations.listAllocations('student-one')).length,0); failPath=null;
  // Runner may not shuffle or regenerate a frozen paper, even for tests.
  const hub=fs.readFileSync(path.join(root,'src/components/exam-lab/papers-hub.tsx'),'utf8');
  const frozen=hub.split('else if (al.content.type === "drillref")')[1].split('else if (al.content.type === "drill")')[0];
  assert.ok(!/shuffle|legacyDrillQuestions/.test(frozen));
  console.log('PASS: four staff roles, class/group scope, exact ordered fanout, staff copy, reopening, tests, missing questions, storage failure, scoped picker.');
})().catch(e => { console.error(e); process.exitCode=1; });
