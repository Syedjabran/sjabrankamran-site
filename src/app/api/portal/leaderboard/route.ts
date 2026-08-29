import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getRankingsCached, type RankedStudent } from "@/lib/portal/rankings";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Student-facing leaderboard: the caller's standing in their own class, across
 * their school (all sections), and across the whole ecosystem — plus the boards
 * for healthy competition. Only real names of the student's own school are
 * shown; the wider board shows first-name + initial.
 */
function shortName(full: string): string {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || "Student";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!user.roles.includes("student")) return NextResponse.json({ error: "Students only." }, { status: 403 });

  const data = await getRankingsCached();
  const me = data.students.find((s) => s.uid === user.id);
  if (!me) {
    return NextResponse.json({ hasData: false, message: "No ranking yet — sit a paper or drill in Exam Lab to appear on the leaderboard." }, { status: 200 });
  }

  const pub = (s: RankedStudent, wide: boolean) => ({
    name: s.uid === user.id ? "You" : wide ? shortName(s.name) : s.name,
    isMe: s.uid === user.id,
    score: s.score, accuracy: s.accuracy, level: s.level, attempts: s.attempts,
    rankInClass: s.rankInClass, rankInSchool: s.rankInSchool, rankOverall: s.rankOverall,
    hasData: s.hasData,
  });

  const classBoard = data.students
    .filter((s) => s.school === me.school && s.className === me.className)
    .sort((a, b) => a.rankInClass - b.rankInClass)
    .map((s) => pub(s, false));

  const schoolBoard = data.students
    .filter((s) => s.school === me.school)
    .sort((a, b) => a.rankInSchool - b.rankInSchool)
    .slice(0, 15)
    .map((s) => pub(s, true));

  const overallBoard = data.students
    .sort((a, b) => a.rankOverall - b.rankOverall)
    .slice(0, 15)
    .map((s) => pub(s, true));

  return NextResponse.json({
    hasData: true,
    me: {
      name: me.name, school: me.school, className: me.className, section: me.section,
      score: me.score, accuracy: me.accuracy, level: me.level, attempts: me.attempts,
      rankInClass: me.rankInClass, outOfClass: me.outOfClass,
      rankInSchool: me.rankInSchool, outOfSchool: me.outOfSchool,
      rankOverall: me.rankOverall, outOfOverall: me.outOfOverall,
    },
    classBoard, schoolBoard, overallBoard,
  }, { status: 200 });
}
