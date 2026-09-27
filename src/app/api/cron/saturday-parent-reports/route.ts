import { NextResponse } from "next/server";
import { sendSaturdayParentReports } from "@/lib/portal/weekly-reports";
import { isAuthorizedCron } from "@/lib/request-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

// Called twice each Saturday (vercel.json: 13:00 and 13:10 UTC, both inside
// the 18:00 PKT window): the second call picks up whoever a partial first
// run left. sendSaturdayParentReports checkpoints every completed student
// in weekly-parent-reports/<week>.json and skips them, so nobody done is
// emailed twice (and a failed checkpoint read stops the run before any mail).

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Cron only." }, { status: 403 });
  const nowPk = new Date(Date.now() + 5 * 3600_000);
  if (nowPk.getUTCDay() !== 6 || nowPk.getUTCHours() !== 18) return NextResponse.json({ ok: true, skipped: "outside Saturday 18:00 PKT window" });
  const weekKey = nowPk.toISOString().slice(0, 10);
  return NextResponse.json(await sendSaturdayParentReports(weekKey));
}
