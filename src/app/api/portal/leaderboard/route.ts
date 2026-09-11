import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { getRankingsCached, type RankedStudent } from "@/lib/portal/rankings";
import { aliasFor, getRevealSet } from "@/lib/portal/alias";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Student-facing leaderboard: the caller's standing in their own class, across
 * their school (all sections), and across the whole ecosystem — plus the boards
 * for healthy competition.
 *
 * PRIVACY: by default every other student appears ONLY as their anonymous
 * "conspicuous code" (a stable call-sign, e.g. "Cobalt Falcon A7F3") — never a
 * real name — so no one has to reveal their identity to compete. A student who
 * WANTS to be seen can opt in (Profile → Leaderboard identity) to show their
 * real name; those users are surfaced with their name (full in-class, first
 * name + initial on the wider boards). The caller always sees themselves as
 * "You".
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

  const [data, revealSet] = await Promise.all([getRankingsCached(), getRevealSet()]);
  const me = data.students.find((s) => s.uid === user.id);
  if (!me) {
    return NextResponse.json({ hasData: false, message: "No ranking yet — sit a paper or drill in Exam Lab to appear on the leaderboard." }, { status: 200 });
  }

  const pub = (s: RankedStudent, wide: boolean) => {
    const isMe = s.uid === user.id;
    const revealed = revealSet.has(s.uid);
    // Anonymous by default: everyone except the caller (and opt-in revealers)
    // is shown only by their stable code.
    const name = isMe ? "You" : revealed ? (wide ? shortName(s.name) : s.name) : aliasFor(s.uid);
    return {
      name,
      isMe,
      anon: !isMe && !revealed,
      score: s.score, accuracy: s.accuracy, level: s.level, attempts: s.attempts,
      rankInClass: s.rankInClass, rankInSchool: s.rankInSchool, rankOverall: s.rankOverall,
      hasData: s.hasData,
    };
  };

  const classBoard = data.students
    .filter((s) => s.school === me.school && s.className === me.className)
    .sort((a, b) => a.rankInClass - b.rankInClass)
    .map((s) => pub(s, false));

  // Staff assigned to the caller's class — shown in the class header, never ranked.
  const myClass = data.classes.find((c) => c.school === me.school && c.name === me.className);
  const classStaff = (myClass?.staff || []).map((s) => ({ name: s.name, roleLabel: s.roleLabel }));

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
    classStaff,
    classBoard, schoolBoard, overallBoard,
  }, { status: 200 });
}
