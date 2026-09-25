import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStudyPlan } from "@/lib/portal/study-plan";
import { isOnboardingComplete } from "@/lib/portal/onboarding";
import { isAuthorizedCron } from "@/lib/request-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  return NextResponse.json({ ok: true, students: uids.length, generated, failed });
}
