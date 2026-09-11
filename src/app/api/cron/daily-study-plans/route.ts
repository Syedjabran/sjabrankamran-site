import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStudyPlan } from "@/lib/portal/study-plan";
import { isOnboardingComplete } from "@/lib/portal/onboarding";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const cron = req.headers.get("x-vercel-cron") === "1" || (req.headers.get("user-agent") || "").startsWith("vercel-cron/");
  if (!cron) return NextResponse.json({ error: "Cron only." }, { status: 403 });
  const { data } = await createAdminClient().from("edu_user_roles").select("user_id").eq("role", "student");
  const uids = [...new Set((data || []).map((r) => r.user_id as string).filter(Boolean))];
  let generated = 0;
  for (let i = 0; i < uids.length; i += 20) {
    const batch = uids.slice(i, i + 20);
    const eligible = (await Promise.all(batch.map(async (uid) => ({ uid, ok: await isOnboardingComplete(uid) })))).filter((x) => x.ok);
    for (const { uid } of eligible) { await ensureStudyPlan(uid); generated++; }
  }
  return NextResponse.json({ ok: true, students: uids.length, generated });
}
