import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStudyPlan } from "@/lib/portal/study-plan";
import { isOnboardingComplete } from "@/lib/portal/onboarding";
import { notify } from "@/lib/portal/notifications";
import { pkToday } from "@/lib/portal/pk-time";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { isAuthorizedCron } from "@/lib/request-guards";
import { satAccess } from "@/lib/sat/access";
import { reminderFor } from "@/lib/sat/coach/coach-view";
import { ensureSatPlan } from "@/lib/sat/coach/plan-store";
import { readProfile } from "@/lib/sat/coach/profile-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "portal-data";
const SAT_CONCURRENCY = 5;
// Who was already reminded today (once per student per PKT day).
const remindedPath = (day: string) => `sat/notified/${day}.json`;

/**
 * The SAT pass (SAT Coach spec 6.5): for every student with SAT access and
 * an SAT profile, keep the study plan current (ensureSatPlan) and, when
 * today holds plan work not started yet, send "Today's SAT ... is ready"
 * once. Bounded concurrency; one student's failure never stops the pass.
 * The reminded list is read first -- a failed read sends no reminders this
 * run rather than risk sending them twice -- and rewritten after each
 * reminder (writes serialised), so a run cut short re-reminds nobody.
 */
async function satPass(uids: string[], now: number) {
  const today = pkToday(now);
  const marker = await readFreshJson<{ uids?: string[] }>(BUCKET, remindedPath(today));
  const reminded = marker.ok ? new Set(marker.data?.uids ?? []) : null;
  const tally = { planned: 0, reminded: 0, skipped: 0, failed: 0, remindersOff: reminded === null };
  let saving: Promise<unknown> = Promise.resolve();
  // A failed write is logged: that student could be reminded twice if the
  // run is repeated today (the next successful write carries them too).
  const saveReminded = (list: Set<string>) => (saving = saving.then(async () => {
    if (!(await writeFreshJson(BUCKET, remindedPath(today), { uids: [...list] }))) {
      console.error("daily-study-plans: SAT reminder marker write failed", remindedPath(today), list.size);
    }
  }));

  let next = 0;
  async function worker(): Promise<void> {
    while (next < uids.length) {
      const uid = uids[next++];
      try {
        // Profile first: most students have none, and it costs one read.
        const profile = await readProfile(uid);
        if (!profile) { tally.skipped++; continue; }
        const access = await satAccess({ id: uid, email: "", fullName: "", roles: ["student"], status: "active" });
        if (!access.ok || access.isStaff) { tally.skipped++; continue; }
        const plan = await ensureSatPlan(uid, today, { profile });
        if (!plan) { tally.skipped++; continue; }
        tally.planned++;
        const reminder = reminderFor(plan.items, today);
        if (!reminder || !reminded || reminded.has(uid)) continue;
        if ((await notify({ uids: [uid] }, { type: "sat", title: reminder.title, body: reminder.body, href: "/portal/sat-lab" })) > 0) {
          reminded.add(uid);
          tally.reminded++;
          await saveReminded(reminded);
        }
      } catch (e) {
        tally.failed++;
        console.error("daily-study-plans: SAT plan failed", uid, e instanceof Error ? e.message : e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SAT_CONCURRENCY, uids.length) }, () => worker()));
  await saving;
  return tally;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Cron only." }, { status: 403 });
  const { data } = await createAdminClient().from("edu_user_roles").select("user_id").eq("role", "student");
  const uids = [...new Set((data || []).map((r) => r.user_id as string).filter(Boolean))];
  let generated = 0;
  let failed = 0;
  for (let i = 0; i < uids.length; i += 20) {
    const batch = uids.slice(i, i + 20);
    const eligible = (await Promise.all(batch.map(async (uid) => ({ uid, ok: await isOnboardingComplete(uid) })))).filter((x) => x.ok);
    for (const { uid } of eligible) {
      // One student's failure must not abort the whole run.
      try {
        await ensureStudyPlan(uid);
        generated++;
      } catch (e) {
        failed++;
        console.error("daily-study-plans: ensureStudyPlan failed", uid, e instanceof Error ? e.message : e);
      }
    }
  }
  const sat = await satPass(uids, Date.now());
  return NextResponse.json({ ok: true, students: uids.length, generated, failed, sat });
}
