import { NextResponse } from "next/server";
import { sendSaturdayParentReports } from "@/lib/portal/weekly-reports";
import { isAuthorizedCron } from "@/lib/request-guards";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Cron only." }, { status: 403 });
  const nowPk = new Date(Date.now() + 5 * 3600_000);
  if (nowPk.getUTCDay() !== 6 || nowPk.getUTCHours() !== 18) return NextResponse.json({ ok: true, skipped: "outside Saturday 18:00 PKT window" });
  const weekKey = nowPk.toISOString().slice(0, 10);
  return NextResponse.json(await sendSaturdayParentReports(weekKey));
}
