// src/app/api/cron/daily-sat-plans/route.ts
//
// The daily SAT pass (SAT Coach spec 6.5), on its own cron at 06:15 PKT
// (vercel.json "15 1 * * *"), apart from the physics study plans at 06:00
// (daily-study-plans), so a slow physics run can't cut it short: for every
// student with SAT access and an SAT profile, keep the study plan current
// (ensureSatPlan) and, when today holds plan work not started yet, send
// "Today's SAT ... is ready" once. Bounded concurrency; one student's failure
// never stops the pass. It takes no new student after 240 s of its 300 and
// answers `partial` with how many are left: their plans are still kept
// current by their next SAT Lab visit -- only today's reminder is missed.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/portal/notifications";
import { pkToday } from "@/lib/portal/pk-time";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { isAuthorizedCron } from "@/lib/request-guards";
import { satAccess } from "@/lib/sat/access";
import { poolBeforeDeadline, reminderFor } from "@/lib/sat/coach/coach-view";
import { ensureSatPlan } from "@/lib/sat/coach/plan-store";
import { readProfile } from "@/lib/sat/coach/profile-store";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "portal-data";
const SAT_CONCURRENCY = 5;
// No new student after this long (maxDuration is 300 s): one student --
// a profile read, an access check, a plan build and a reminder -- fits
// comfortably in the minute left.
const DEADLINE_MS = 240_000;
// Who was already reminded today (once per student per PKT day).
const remindedPath = (day: string) => `sat/notified/${day}.json`;

/**
 * The reminded list is read first -- a failed read sends no reminders this
 * run rather than risk sending them twice -- and rewritten after each
 * reminder (writes serialised), so a run cut short re-reminds nobody.
 */
async function satPass(uids: string[], startedAt: number) {
  const today = pkToday(startedAt);
  const marker = await readFreshJson<{ uids?: string[] }>(BUCKET, remindedPath(today));
  const reminded = marker.ok ? new Set(marker.data?.uids ?? []) : null;
  const tally = { planned: 0, reminded: 0, skipped: 0, failed: 0, remindersOff: reminded === null };
  let saving: Promise<unknown> = Promise.resolve();
  // A failed write is logged: that student could be reminded twice if the
  // run is repeated today (the next successful write carries them too).
  const saveReminded = (list: Set<string>) => (saving = saving.then(async () => {
    if (!(await writeFreshJson(BUCKET, remindedPath(today), { uids: [...list] }))) {
      console.error("daily-sat-plans: SAT reminder marker write failed", remindedPath(today), list.size);
    }
  }));

  async function planStudent(uid: string): Promise<void> {
    try {
      // Profile first: most students have none, and it costs one read.
      const profile = await readProfile(uid);
      if (!profile) { tally.skipped++; return; }
      const access = await satAccess({ id: uid, email: "", fullName: "", roles: ["student"], status: "active" });
      if (!access.ok || access.isStaff) { tally.skipped++; return; }
      const plan = await ensureSatPlan(uid, today, { profile });
      if (!plan) { tally.skipped++; return; }
      tally.planned++;
      const reminder = reminderFor(plan.items, today);
      if (!reminder || !reminded || reminded.has(uid)) return;
      if ((await notify({ uids: [uid] }, { type: "sat", title: reminder.title, body: reminder.body, href: "/portal/sat-lab" })) > 0) {
        reminded.add(uid);
        tally.reminded++;
        await saveReminded(reminded);
      }
    } catch (e) {
      tally.failed++;
      console.error("daily-sat-plans: SAT plan failed", uid, e instanceof Error ? e.message : e);
    }
  }

  const run = await poolBeforeDeadline(uids, { concurrency: SAT_CONCURRENCY, now: Date.now, deadlineAt: startedAt + DEADLINE_MS, handle: planStudent });
  await saving;
  return { ...tally, partial: run.partial, remaining: uids.length - run.started };
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Cron only." }, { status: 403 });
  const startedAt = Date.now();
  const { data } = await createAdminClient().from("edu_user_roles").select("user_id").eq("role", "student");
  const uids = [...new Set((data || []).map((r) => r.user_id as string).filter(Boolean))];
  const sat = await satPass(uids, startedAt);
  return NextResponse.json({ ok: true, students: uids.length, sat });
}
