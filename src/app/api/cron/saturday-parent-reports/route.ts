import { NextResponse } from "next/server";
import { sendSaturdayParentReports } from "@/lib/portal/weekly-reports";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const cron = req.headers.get("x-vercel-cron") === "1" || (req.headers.get("user-agent") || "").startsWith("vercel-cron/");
  if (!cron) return NextResponse.json({ error: "Cron only." }, { status: 403 });
  const nowPk = new Date(Date.now() + 5 * 3600_000);
  if (nowPk.getUTCDay() !== 6 || nowPk.getUTCHours() !== 18) return NextResponse.json({ ok: true, skipped: "outside Saturday 18:00 PKT window" });
  const weekKey = nowPk.toISOString().slice(0, 10);
  return NextResponse.json(await sendSaturdayParentReports(weekKey));
}
