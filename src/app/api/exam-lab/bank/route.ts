import { NextResponse } from "next/server";
import { canAccessGlobalStaffData, canConductDrills, getPortalUser } from "@/lib/edu/auth";
import { ALL_QUESTIONS, isSecureQuestion, safeQuestion } from "@/lib/exam-lab/bank-all";

export const runtime = "nodejs";

/**
 * GET — STAFF ONLY. Every Exam Lab question (9702, 5054 and the staff-written
 * class-test bank) in its client-safe shape, for the question picker that
 * builds class drills and tests. No answers or mark-scheme paths: the picker
 * never needed them, and the staff UI ships in chunks students can download,
 * so the bank reaches it from here instead of an import.
 */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });
  if (!canConductDrills(user.roles) && !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const questions = ALL_QUESTIONS.map(safeQuestion);
  const secureIds = ALL_QUESTIONS.filter((q) => isSecureQuestion(q.id)).map((q) => q.id);
  return NextResponse.json({ questions, secureIds }, { status: 200, headers: { "cache-control": "private, max-age=300" } });
}
