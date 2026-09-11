/**
 * Physics Performance Index (PPI) — the KPI ranking engine. SERVER-ONLY
 * (service-role). No DDL: reads existing edu_ tables + Storage-as-DB docs, and
 * caches the computed table as JSON in the private `portal-data` bucket.
 *
 * A transparent 0–100 composite built from six pillars, each 0–100, weighted
 * toward what actually improves CAIE Physics outcomes:
 *
 *   Mastery                30 — accuracy on scored questions; the last 30 days
 *                               count double; low volume (<10 scored Qs) is
 *                               confidence-scaled so one lucky answer ≠ mastery.
 *   Practice & Consistency 20 — attempt volume (log-scaled cap), active days in
 *                               the last 30, self-chosen practice sessions.
 *   Assignments & Tasks    15 — completion rate AND on-time rate of assigned
 *                               work (class assignments, Exam Lab allocations,
 *                               personal tasks).
 *   Daily Challenges       10 — participation + performance in daily-challenge
 *                               allocations and personal challenges.
 *   Attendance             10 — present + online = attended, late = half,
 *                               excused excluded from the denominator.
 *   Peer Contribution      15 — library resources shared, answers/help given,
 *                               peers marking you "Helpful" (log-scaled points).
 *
 * Volume terms are log-scaled and capped everywhere so grinding can never beat
 * genuine mastery. A pillar with no assessable data yet scores a neutral 50
 * (labelled in its detail) — except Peer Contribution, where zero really means
 * zero (it is fully in the student's hands).
 *
 * Caching: kpi/latest.json (15-min TTL, rebuilt on demand server-side) with the
 * previous snapshot in kpi/prev.json. On rebuild we diff network ranks and
 * notify movers (rate-limited to one rank notification per user per 24h).
 *
 * The older rankings.ts composite (accuracy 60 / level 25 / attendance 15)
 * still powers the staff analytics page and the student leaderboard; it is kept
 * and clearly labelled — the PPI is the richer system surfaced at
 * /portal/my-ranking and the KPI APIs.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAttempts, type Attempt } from "@/lib/exam-lab/attempts";
import { getRegistry, staffRoleMap } from "@/lib/portal/institutions";
import { listAllocations, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { listTasks, type PersonalTask } from "@/lib/portal/tasks";
import { getContrib } from "@/lib/portal/contribution";
import { notify } from "@/lib/portal/notifications";
import { countedStatuses } from "@/lib/edu/attendance";

const DATA = "portal-data";
const LATEST_KEY = "kpi/latest.json";
const PREV_KEY = "kpi/prev.json";
export const KPI_TTL_MS = 15 * 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const KPI_WEIGHTS = {
  mastery: 30,
  practice: 20,
  assignments: 15,
  daily: 10,
  attendance: 10,
  contribution: 15,
} as const;

export type PillarKey = keyof typeof KPI_WEIGHTS;

export const PILLAR_INFO: Record<PillarKey, { label: string; blurb: string }> = {
  mastery: { label: "Mastery", blurb: "Accuracy on scored questions — recent 30 days weighted 2×." },
  practice: { label: "Practice & Consistency", blurb: "Attempt volume (log-capped), active days and self-tests." },
  assignments: { label: "Assignments & Tasks", blurb: "Completion AND on-time rate of assigned work." },
  daily: { label: "Daily Challenges", blurb: "Participation + performance in daily/individual challenges." },
  attendance: { label: "Attendance", blurb: "Present + online = attended, late counts half." },
  contribution: { label: "Peer Contribution", blurb: "Resources shared, answers given, 'Helpful' marks earned." },
};

export type PillarScore = { score: number; detail: string };

export type KpiAction = { text: string; href: string; gain: number; pillar: PillarKey };

export type KpiStudent = {
  uid: string;
  studentId: string;
  name: string;
  email: string;
  school: string;
  classId: string;
  className: string;
  section: string | null;
  pillars: Record<PillarKey, PillarScore>;
  composite: number; // 0-100, 1dp
  hasData: boolean;
  attempts: number;
  rankClass: number; outOfClass: number;
  rankSchool: number; outOfSchool: number;
  rankNetwork: number; outOfNetwork: number;
  advice: KpiAction[];
  prev: { composite: number; rankNetwork: number; rankClass: number } | null;
};

export type KpiTable = {
  computed_at: string;
  totals: { students: number; schools: number; classes: number; avgComposite: number };
  students: KpiStudent[];
};

// ---------------------------------------------------------------------------
// Pillar computation
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const logCap = (n: number, full: number) => clamp01(Math.log10(1 + Math.max(0, n)) / Math.log10(1 + full));

function accuracyOf(qs: { earned: number | null; marks: number }[]): { acc: number | null; scored: number } {
  let e = 0, a = 0, scored = 0;
  for (const q of qs) {
    if (q.earned === null) continue;
    scored++; e += q.earned || 0; a += q.marks || 1;
  }
  return { acc: a > 0 ? (e / a) * 100 : null, scored };
}

function masteryPillar(attempts: Attempt[]): PillarScore {
  const cutoff = Date.now() - 30 * 864e5;
  const allQ = attempts.flatMap((at) => at.questions);
  const recentQ = attempts.filter((at) => at.ts >= cutoff).flatMap((at) => at.questions);
  const all = accuracyOf(allQ);
  const recent = accuracyOf(recentQ);
  if (all.acc === null) return { score: 0, detail: "No scored questions yet — sit a drill or paper in Exam Lab." };
  // Recent 30 days weighted 2x when present.
  const blended = recent.acc !== null ? (all.acc + 2 * recent.acc) / 3 : all.acc;
  // Confidence scale below 10 scored questions.
  const confidence = clamp01(all.scored / 10);
  const score = Math.round(blended * confidence);
  return {
    score,
    detail: `${Math.round(all.acc)}% overall on ${all.scored} scored questions` +
      (recent.acc !== null ? `, ${Math.round(recent.acc)}% in the last 30 days (weighted 2×)` : ", nothing scored in the last 30 days") +
      (confidence < 1 ? ` — low volume, confidence-scaled ×${confidence.toFixed(1)}` : ""),
  };
}

function practicePillar(attempts: Attempt[]): { pillar: PillarScore; activeDays30: number; attempts30: number } {
  const cutoff = Date.now() - 30 * 864e5;
  const recent = attempts.filter((a) => a.ts >= cutoff);
  const days = new Set(recent.map((a) => new Date(a.ts).toISOString().slice(0, 10))).size;
  const selfTests = recent.filter((a) => !a.context || a.context.kind === "practice").length;
  const vol = logCap(attempts.length, 150);        // 150 lifetime attempts = full volume credit
  const consistency = clamp01(days / 12);          // active 12 of the last 30 days = full credit
  const self = clamp01(selfTests / 8);             // 8 self-chosen sessions / 30 days = full credit
  const score = Math.round((0.4 * vol + 0.4 * consistency + 0.2 * self) * 100);
  return {
    pillar: {
      score,
      detail: `${attempts.length} lifetime attempts, active ${days}/30 recent days, ${selfTests} self-tests in 30 days`,
    },
    activeDays30: days,
    attempts30: recent.length,
  };
}

type SubRow = { status: string; marks: number | null; submitted_at: string | null; due_at: string | null; title: string };

function assignmentsPillar(
  subs: SubRow[],
  allocs: ExamAllocation[],
  tasks: PersonalTask[],
): { pillar: PillarScore; overdue: number; open: number } {
  type Item = { done: boolean; onTime: boolean; overdue: boolean };
  const now = Date.now();
  const items: Item[] = [];

  for (const s of subs) {
    const done = ["submitted", "late", "marked", "returned"].includes(s.status);
    const onTime = done && s.status !== "late" &&
      (!s.due_at || !s.submitted_at || new Date(s.submitted_at).getTime() <= new Date(s.due_at).getTime());
    const overdue = !done && !!s.due_at && new Date(s.due_at).getTime() < now;
    items.push({ done, onTime, overdue });
  }
  for (const a of allocs) {
    if (a.status === "cancelled") continue;
    const done = a.status === "submitted" || a.status === "locked" || a.status === "unlocked" ? a.completedAt != null : false;
    const onTime = done && (!a.dueAt || (a.completedAt || 0) <= new Date(a.dueAt).getTime());
    const overdue = !done && !!a.dueAt && new Date(a.dueAt).getTime() < now;
    items.push({ done, onTime, overdue });
  }
  for (const t of tasks) {
    if (t.kind !== "task") continue; // challenges are scored in the Daily pillar
    const done = t.status === "done";
    const onTime = done && (!t.dueAt || (t.completedAt || 0) <= new Date(t.dueAt).getTime());
    const overdue = !done && !!t.dueAt && new Date(t.dueAt).getTime() < now;
    items.push({ done, onTime, overdue });
  }

  if (!items.length) {
    return { pillar: { score: 50, detail: "No assigned work yet — neutral 50 until something is set." }, overdue: 0, open: 0 };
  }
  const doneN = items.filter((i) => i.done).length;
  const onTimeN = items.filter((i) => i.onTime).length;
  const completion = doneN / items.length;
  const onTimeRate = doneN ? onTimeN / doneN : 0;
  const score = Math.round((0.6 * completion + 0.4 * onTimeRate) * 100);
  const overdue = items.filter((i) => i.overdue).length;
  return {
    pillar: {
      score,
      detail: `${doneN}/${items.length} completed, ${doneN ? Math.round(onTimeRate * 100) : 0}% of those on time` +
        (overdue ? `, ${overdue} overdue` : ""),
    },
    overdue,
    open: items.length - doneN,
  };
}

function dailyPillar(attempts: Attempt[], allocs: ExamAllocation[], tasks: PersonalTask[]): PillarScore {
  const cutoff = Date.now() - 30 * 864e5;
  const dailyAllocs = allocs.filter((a) => a.content.type === "daily" && a.createdAt >= cutoff && a.status !== "cancelled");
  const challenges = tasks.filter((t) => t.kind === "challenge" && t.createdAt >= cutoff);
  const assigned = dailyAllocs.length + challenges.length;
  const done = dailyAllocs.filter((a) => a.completedAt != null).length + challenges.filter((t) => t.status === "done").length;
  if (!assigned) return { score: 50, detail: "No daily challenges set in the last 30 days — neutral 50." };
  const participation = done / assigned;
  // Performance: accuracy on attempts linked to daily allocations; fall back to recent accuracy.
  const dailyIds = new Set(dailyAllocs.map((a) => a.id));
  const linkedQ = attempts
    .filter((at) => at.context?.allocationId && dailyIds.has(at.context.allocationId))
    .flatMap((at) => at.questions);
  let perf = accuracyOf(linkedQ).acc;
  if (perf === null) perf = accuracyOf(attempts.filter((a) => a.ts >= cutoff).flatMap((a) => a.questions)).acc;
  const perfN = perf === null ? 50 : perf;
  const score = Math.round(0.6 * participation * 100 + 0.4 * perfN);
  return { score, detail: `${done}/${assigned} daily challenges completed in 30 days, ${Math.round(perfN)}% accuracy on them` };
}

function attendancePillar(statuses: string[]): PillarScore {
  // excused / leave / exempt are authorised non-attendance: dropped from the
  // denominator so approved leave can never read as truancy.
  const counted = countedStatuses(statuses);
  if (!counted.length) return { score: 50, detail: "No attendance recorded yet — neutral 50." };
  const attended = counted.filter((s) => s === "present" || s === "online").length;
  const late = counted.filter((s) => s === "late").length;
  const score = Math.round(((attended + 0.5 * late) / counted.length) * 100);
  return { score, detail: `${attended} attended + ${late} late of ${counted.length} lessons (excused, leave & exemptions excluded)` };
}

function contributionPillar(contrib: { total: number; monthPoints: number } | null): PillarScore {
  if (!contrib || contrib.total <= 0) {
    return { score: 0, detail: "No library contributions yet — share a resource or answer a question." };
  }
  const allTime = logCap(contrib.total, 150);   // 150 lifetime points = full credit
  const monthly = logCap(contrib.monthPoints, 50); // 50 points this month = full credit
  const score = Math.round((0.7 * allTime + 0.3 * monthly) * 100);
  return { score, detail: `${contrib.total} contribution points all-time, ${contrib.monthPoints} this month` };
}

// ---------------------------------------------------------------------------
// "How to climb" advice
// ---------------------------------------------------------------------------

function adviceFor(
  s: Pick<KpiStudent, "pillars">,
  ctx: { overdue: number; open: number; activeDays30: number; weakestTopic: string | null; contribTotal: number },
): KpiAction[] {
  const gainCap = (pillar: PillarKey, deltaPillar: number) =>
    round1(Math.min(100 - s.pillars[pillar].score, Math.max(0, deltaPillar)) * (KPI_WEIGHTS[pillar] / 100));

  const candidates: { pillar: PillarKey; action: KpiAction }[] = [];

  if (ctx.overdue > 0 || ctx.open > 0) {
    const n = ctx.overdue || ctx.open;
    const label = ctx.overdue ? `overdue assignment${n === 1 ? "" : "s"}` : `open assignment${n === 1 ? "" : "s"}`;
    candidates.push({
      pillar: "assignments",
      action: { pillar: "assignments", text: `Complete your ${n} ${label}`, href: "/portal/learn", gain: gainCap("assignments", n * 15) },
    });
  }
  candidates.push({
    pillar: "practice",
    action: { pillar: "practice", text: "Attempt 3 topic drills this week", href: "/portal/exam-lab", gain: gainCap("practice", 12) },
  });
  candidates.push({
    pillar: "mastery",
    action: {
      pillar: "mastery",
      text: ctx.weakestTopic ? `Revise ${ctx.weakestTopic} and redo a drill on it` : "Sit a scored past paper in Exam Lab",
      href: "/portal/exam-lab",
      gain: gainCap("mastery", 8),
    },
  });
  candidates.push({
    pillar: "contribution",
    action: {
      pillar: "contribution",
      text: ctx.contribTotal > 0 ? "Answer a question in the Resource Library" : "Share your first resource in the Resource Library",
      href: "/portal/library",
      gain: gainCap("contribution", ctx.contribTotal > 0 ? 10 : 25),
    },
  });
  candidates.push({
    pillar: "daily",
    action: { pillar: "daily", text: "Complete your daily challenges this week", href: "/portal/exam-lab", gain: gainCap("daily", 20) },
  });
  candidates.push({
    pillar: "attendance",
    action: { pillar: "attendance", text: "Attend every lesson for the next month", href: "/portal/learn", gain: gainCap("attendance", 10) },
  });

  // Top 3 weakest pillars by weighted headroom, one concrete action each.
  const headroom = (p: PillarKey) => (100 - s.pillars[p].score) * KPI_WEIGHTS[p];
  const order = [...new Set(candidates.map((c) => c.pillar))].sort((a, b) => headroom(b) - headroom(a));
  const picked: KpiAction[] = [];
  for (const p of order) {
    if (picked.length >= 3) break;
    const best = candidates.filter((c) => c.pillar === p).sort((a, b) => b.action.gain - a.action.gain)[0];
    if (best && best.action.gain > 0) picked.push(best.action);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function assignRanks<T>(sorted: T[], score: (t: T) => number): (T & { _rank: number })[] {
  let rank = 0; let prev = Number.NaN;
  return sorted.map((item, i) => {
    const sc = score(item);
    if (sc !== prev) { rank = i + 1; prev = sc; }
    return { ...item, _rank: rank };
  });
}

export async function buildKpiTable(prev: KpiTable | null): Promise<KpiTable> {
  const sb = createAdminClient();
  const reg = await getRegistry();

  type Flat = Omit<KpiStudent, "rankClass" | "outOfClass" | "rankSchool" | "outOfSchool" | "rankNetwork" | "outOfNetwork">;
  const flats: Flat[] = [];
  const prevByUid = new Map((prev?.students || []).map((p) => [p.uid, p]));

  await Promise.all(reg.classes.map(async (cls) => {
    const { data: enr } = await sb
      .from("edu_enrolments")
      .select("student_id, edu_students(id, profile_id, edu_profiles!edu_students_profile_id_fkey(full_name, email))")
      .eq("class_id", cls.id)
      .eq("status", "active");
    type Row = { student_id: string; edu_students?: { id: string; profile_id: string; edu_profiles?: { full_name?: string; email?: string } } };
    const rows = (enr || []) as unknown as Row[];
    // Staff assigned to the class (coordinator/facilitator/etc.) are enrolled for
    // access but must never be scored or ranked as students.
    const roleMap = await staffRoleMap(rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x));

    await Promise.all(rows.map(async (r) => {
      const st = r.edu_students;
      const uid = st?.profile_id;
      if (!st?.id || !uid || roleMap.has(uid)) return;

      const [attempts, attRows, subRows, allocs, tasks, contrib] = await Promise.all([
        getAttempts(uid).catch(() => [] as Attempt[]),
        sb.from("edu_attendance").select("status").eq("student_id", st.id).then((x) => (x.data || []).map((y) => y.status as string)),
        sb.from("edu_submissions")
          .select("status, marks, submitted_at, edu_assignments(title, due_at)")
          .eq("student_id", st.id)
          .then((x) => ((x.data || []) as unknown as { status: string; marks: number | null; submitted_at: string | null; edu_assignments?: { title?: string; due_at?: string | null } }[])
            .map((y) => ({ status: y.status, marks: y.marks, submitted_at: y.submitted_at, due_at: y.edu_assignments?.due_at ?? null, title: y.edu_assignments?.title || "" }))),
        listAllocations(uid).catch(() => [] as ExamAllocation[]),
        listTasks(uid).catch(() => [] as PersonalTask[]),
        getContrib(uid).catch(() => null),
      ]);

      const mastery = masteryPillar(attempts);
      const practice = practicePillar(attempts);
      const assignments = assignmentsPillar(subRows, allocs, tasks);
      const daily = dailyPillar(attempts, allocs, tasks);
      const attendance = attendancePillar(attRows);
      const contribution = contributionPillar(contrib);

      const pillars: Record<PillarKey, PillarScore> = {
        mastery, practice: practice.pillar, assignments: assignments.pillar,
        daily, attendance, contribution,
      };
      const composite = round1(
        (Object.keys(KPI_WEIGHTS) as PillarKey[]).reduce((sum, k) => sum + pillars[k].score * (KPI_WEIGHTS[k] / 100), 0)
      );

      // Weakest topic (≥2 scored questions) for mastery advice.
      const topicMap = new Map<string, { e: number; a: number; n: number }>();
      for (const at of attempts) for (const q of at.questions) {
        if (q.earned === null) continue;
        const t = topicMap.get(q.topic || "Unclassified") || { e: 0, a: 0, n: 0 };
        t.e += q.earned || 0; t.a += q.marks || 1; t.n++; topicMap.set(q.topic || "Unclassified", t);
      }
      const weakestTopic = [...topicMap.entries()]
        .filter(([, v]) => v.n >= 2 && v.a > 0)
        .sort((a, b) => a[1].e / a[1].a - b[1].e / b[1].a)[0]?.[0] || null;

      const p = prevByUid.get(uid);
      flats.push({
        uid, studentId: st.id,
        name: st.edu_profiles?.full_name || st.edu_profiles?.email || "Student",
        email: st.edu_profiles?.email || "",
        school: cls.school, classId: cls.id, className: cls.name, section: cls.section,
        pillars, composite,
        hasData: attempts.length > 0 || subRows.length > 0 || attRows.length > 0,
        attempts: attempts.length,
        advice: adviceFor({ pillars }, {
          overdue: assignments.overdue, open: assignments.open,
          activeDays30: practice.activeDays30, weakestTopic,
          contribTotal: contrib?.total || 0,
        }),
        prev: p ? { composite: p.composite, rankNetwork: p.rankNetwork, rankClass: p.rankClass } : null,
      });
    }));
  }));

  // ---- Ranks: network / school / class (dense; ties share) ----
  const byScore = (a: Flat, b: Flat) => b.composite - a.composite || b.attempts - a.attempts;
  const students: KpiStudent[] = flats.map((f) => ({
    ...f, rankClass: 0, outOfClass: 0, rankSchool: 0, outOfSchool: 0, rankNetwork: 0, outOfNetwork: 0,
  }));
  const byUid = new Map(students.map((s) => [s.uid, s]));

  const netRanked = assignRanks([...flats].sort(byScore), (t) => t.composite);
  for (const s of netRanked) { const t = byUid.get(s.uid)!; t.rankNetwork = s._rank; t.outOfNetwork = netRanked.length; }

  const groupRank = (keyOf: (f: Flat) => string, apply: (t: KpiStudent, rank: number, outOf: number) => void) => {
    const groups = new Map<string, Flat[]>();
    for (const f of flats) { const k = keyOf(f); const arr = groups.get(k) || []; arr.push(f); groups.set(k, arr); }
    for (const [, arr] of groups) {
      const ranked = assignRanks([...arr].sort(byScore), (t) => t.composite);
      for (const s of ranked) apply(byUid.get(s.uid)!, s._rank, ranked.length);
    }
  };
  groupRank((f) => f.school, (t, r, o) => { t.rankSchool = r; t.outOfSchool = o; });
  groupRank((f) => f.classId, (t, r, o) => { t.rankClass = r; t.outOfClass = o; });

  students.sort((a, b) => a.rankNetwork - b.rankNetwork);

  const avgComposite = students.length ? round1(students.reduce((s, x) => s + x.composite, 0) / students.length) : 0;
  return {
    computed_at: new Date().toISOString(),
    totals: {
      students: students.length,
      schools: new Set(flats.map((f) => f.school)).size,
      classes: new Set(flats.map((f) => f.classId)).size,
      avgComposite,
    },
    students,
  };
}

// ---------------------------------------------------------------------------
// Cache + rebuild + rank-change notifications
// ---------------------------------------------------------------------------

async function readTable(key: string): Promise<KpiTable | null> {
  try {
    const { data } = await createAdminClient().storage.from(DATA).download(key);
    if (data) return JSON.parse(await data.text()) as KpiTable;
  } catch { /* none */ }
  return null;
}

async function writeTable(key: string, table: KpiTable): Promise<void> {
  try {
    const body = new Blob([JSON.stringify(table)], { type: "application/json" });
    await createAdminClient().storage.from(DATA).upload(key, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  } catch { /* best effort */ }
}

/** Rank-movement notifications, rate-limited to one per user per 24h. */
async function notifyRankChanges(prev: KpiTable, next: KpiTable): Promise<void> {
  try {
    const sb = createAdminClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: recent } = await sb
      .from("edu_notifications").select("user_id").eq("kind", "rank").gte("created_at", since);
    const recentlyNotified = new Set((recent || []).map((r) => r.user_id as string));
    const prevByUid = new Map(prev.students.map((s) => [s.uid, s]));

    for (const s of next.students) {
      if (!s.hasData || recentlyNotified.has(s.uid)) continue;
      const p = prevByUid.get(s.uid);
      if (!p || !p.rankNetwork || !s.rankNetwork) continue;
      const delta = p.rankNetwork - s.rankNetwork; // positive = climbed
      if (delta === 0) continue;
      const places = Math.abs(delta);
      await notify({ uids: [s.uid] }, {
        type: "rank",
        title: delta > 0
          ? `You climbed ${places} place${places === 1 ? "" : "s"} — now #${s.rankNetwork} of ${s.outOfNetwork} across the network 🎉`
          : `You slipped ${places} place${places === 1 ? "" : "s"} — now #${s.rankNetwork} of ${s.outOfNetwork} across the network`,
        body: delta > 0
          ? `Your Physics Performance Index is ${s.composite}. Keep it up!`
          : `Your Physics Performance Index is ${s.composite}. Open My Ranking to see how to climb back.`,
        href: "/portal/my-ranking",
      });
    }
  } catch { /* best effort */ }
}

let _mem: { at: number; table: KpiTable } | null = null;
let _building: Promise<KpiTable> | null = null;

/** The cached KPI table (15-min TTL). Rebuilds on demand; on rebuild, diffs
 * ranks vs the previous snapshot and notifies movers. */
export async function getKpiCached(ttlMs = KPI_TTL_MS): Promise<KpiTable> {
  if (_mem && Date.now() - _mem.at < ttlMs) return _mem.table;
  const stored = await readTable(LATEST_KEY);
  if (stored && Date.now() - new Date(stored.computed_at).getTime() < ttlMs) {
    _mem = { at: new Date(stored.computed_at).getTime(), table: stored };
    return stored;
  }
  if (_building) return _building;
  _building = (async () => {
    try {
      const table = await buildKpiTable(stored);
      await writeTable(LATEST_KEY, table);
      if (stored) {
        await writeTable(PREV_KEY, stored);
        await notifyRankChanges(stored, table);
      }
      _mem = { at: Date.now(), table };
      return table;
    } finally {
      _building = null;
    }
  })();
  return _building;
}

/** One student's KPI record (or null). Any signed-in user may fetch their own. */
export async function getMyKpi(uid: string): Promise<{ me: KpiStudent | null; computed_at: string }> {
  const table = await getKpiCached();
  return { me: table.students.find((s) => s.uid === uid) || null, computed_at: table.computed_at };
}
