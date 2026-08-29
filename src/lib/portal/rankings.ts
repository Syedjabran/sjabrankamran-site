/**
 * Ranking & analytics engine. SERVER-ONLY (service-role, via getInstitutionReport).
 *
 * Builds on getInstitutionReport() (per-school → per-class → per-student
 * progress from Exam Lab attempts + attendance) and derives leaderboards and
 * ranks at every level: each student is ranked within their class, within their
 * school, and across the whole ecosystem; each class within its school and
 * overall; each school overall. Plus a composite performance score, level
 * distribution, and top-N boards — everything the analytics UI needs.
 */
import { getInstitutionReport } from "@/lib/portal/institutions";

export type RankedStudent = {
  studentId: string; uid: string; name: string; email: string;
  school: string; className: string; section: string | null;
  accuracy: number | null; attempts: number; papersSat: number;
  level: number; attendance: number | null; lastActive: number | null;
  hasData: boolean; score: number;
  rankOverall: number; rankInClass: number; rankInSchool: number;
  outOfOverall: number; outOfClass: number; outOfSchool: number;
};
export type RankedClass = {
  id: string; name: string; school: string; section: string | null; year: string;
  students: number; activeStudents: number;
  avgAccuracy: number | null; avgLevel: number; avgAttendance: number | null; totalAttempts: number;
  score: number; rankOverall: number; rankInSchool: number; outOfOverall: number; outOfSchool: number;
};
export type RankedSchool = {
  school: string; classes: number; students: number; activeStudents: number;
  avgAccuracy: number | null; avgLevel: number; avgAttendance: number | null; totalAttempts: number;
  score: number; rankOverall: number; outOf: number;
};
export type RankingsData = {
  generatedAt: string;
  totals: { schools: number; classes: number; students: number; activeStudents: number; totalAttempts: number; avgAccuracy: number | null; avgAttendance: number | null; avgLevel: number };
  schools: RankedSchool[];
  classes: RankedClass[];
  students: RankedStudent[];
  levelDistribution: { level: number; count: number }[];
  topStudents: RankedStudent[];
  topClasses: RankedClass[];
  topSchools: RankedSchool[];
};

// Composite 0-100 performance score. Weighted: accuracy 60%, level 25%,
// attendance 15%. Missing signals contribute 0 so no-data records rank last.
function scoreOf(accuracy: number | null, level: number, attendance: number | null): number {
  const a = accuracy ?? 0;
  const l = (Math.max(1, Math.min(10, level)) / 10) * 100;
  const at = attendance ?? 0;
  return Math.round(a * 0.6 + l * 0.25 + at * 0.15);
}
function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}
function mean(nums: number[]): number {
  return nums.length ? Math.round((nums.reduce((s, x) => s + x, 0) / nums.length) * 10) / 10 : 0;
}
// Dense-rank a list already sorted best-first by score; ties share a rank.
function assignRanks<T extends { score: number }>(sorted: T[]): (T & { _rank: number })[] {
  let rank = 0; let prev = Number.NaN;
  return sorted.map((item, i) => {
    if (item.score !== prev) { rank = i + 1; prev = item.score; }
    return { ...item, _rank: rank };
  });
}

export async function buildRankings(): Promise<RankingsData> {
  const schoolsReport = await getInstitutionReport();

  // ---- Flatten students, tagging school/class ----
  type SFlat = RankedStudent & { _classId: string };
  const studentsFlat: SFlat[] = [];
  const classesFlat: RankedClass[] = [];

  for (const sr of schoolsReport) {
    for (const cr of sr.classes) {
      classesFlat.push({
        id: cr.id, name: cr.name, school: cr.school, section: cr.section, year: cr.year,
        students: cr.students.length, activeStudents: cr.activeStudents,
        avgAccuracy: cr.avgAccuracy, avgLevel: mean(cr.students.map((s) => s.level)),
        avgAttendance: cr.avgAttendance, totalAttempts: cr.totalAttempts,
        score: scoreOf(cr.avgAccuracy, mean(cr.students.map((s) => s.level)), cr.avgAttendance),
        rankOverall: 0, rankInSchool: 0, outOfOverall: 0, outOfSchool: 0,
      });
      for (const s of cr.students) {
        studentsFlat.push({
          studentId: s.studentId, uid: s.uid, name: s.name, email: s.email,
          school: cr.school, className: cr.name, section: cr.section,
          accuracy: s.accuracy, attempts: s.attempts, papersSat: s.papersSat,
          level: s.level, attendance: s.attendancePct, lastActive: s.lastActive,
          hasData: s.scoredQuestions > 0 || s.attempts > 0,
          score: scoreOf(s.accuracy, s.level, s.attendancePct),
          rankOverall: 0, rankInClass: 0, rankInSchool: 0,
          outOfOverall: 0, outOfClass: 0, outOfSchool: 0, _classId: cr.id,
        });
      }
    }
  }

  const byScoreThenAttempts = <T extends { score: number; attempts?: number; totalAttempts?: number }>(a: T, b: T) =>
    b.score - a.score || ((b.attempts ?? b.totalAttempts ?? 0) - (a.attempts ?? a.totalAttempts ?? 0));

  // ---- Rank students: overall, in-class, in-school ----
  const stuOverall = assignRanks([...studentsFlat].sort(byScoreThenAttempts));
  const rankMap = new Map<string, RankedStudent>();
  for (const s of stuOverall) { s.rankOverall = s._rank; s.outOfOverall = stuOverall.length; rankMap.set(s.studentId, s); }
  // in-class
  const byClass = new Map<string, SFlat[]>();
  for (const s of studentsFlat) { const a = byClass.get(s._classId) || []; a.push(s); byClass.set(s._classId, a); }
  for (const [, arr] of byClass) {
    const ranked = assignRanks([...arr].sort(byScoreThenAttempts));
    for (const s of ranked) { const t = rankMap.get(s.studentId)!; t.rankInClass = s._rank; t.outOfClass = ranked.length; }
  }
  // in-school
  const bySchool = new Map<string, SFlat[]>();
  for (const s of studentsFlat) { const a = bySchool.get(s.school) || []; a.push(s); bySchool.set(s.school, a); }
  for (const [, arr] of bySchool) {
    const ranked = assignRanks([...arr].sort(byScoreThenAttempts));
    for (const s of ranked) { const t = rankMap.get(s.studentId)!; t.rankInSchool = s._rank; t.outOfSchool = ranked.length; }
  }
  const students = [...rankMap.values()].sort((a, b) => a.rankOverall - b.rankOverall);

  // ---- Rank classes: overall + in-school ----
  const clsOverall = assignRanks([...classesFlat].sort(byScoreThenAttempts));
  const clsMap = new Map<string, RankedClass>();
  for (const c of clsOverall) { c.rankOverall = c._rank; c.outOfOverall = clsOverall.length; clsMap.set(c.id, c); }
  const clsBySchool = new Map<string, RankedClass[]>();
  for (const c of classesFlat) { const a = clsBySchool.get(c.school) || []; a.push(c); clsBySchool.set(c.school, a); }
  for (const [, arr] of clsBySchool) {
    const ranked = assignRanks([...arr].sort(byScoreThenAttempts));
    for (const c of ranked) { const t = clsMap.get(c.id)!; t.rankInSchool = c._rank; t.outOfSchool = ranked.length; }
  }
  const classes = [...clsMap.values()].sort((a, b) => a.rankOverall - b.rankOverall);

  // ---- Rank schools ----
  const schoolsFlat: RankedSchool[] = schoolsReport.map((sr) => {
    const allLevels = sr.classes.flatMap((c) => c.students.map((s) => s.level));
    return {
      school: sr.school, classes: sr.classes.length, students: sr.students, activeStudents: sr.activeStudents,
      avgAccuracy: sr.avgAccuracy, avgLevel: mean(allLevels), avgAttendance: sr.avgAttendance, totalAttempts: sr.totalAttempts,
      score: scoreOf(sr.avgAccuracy, mean(allLevels), sr.avgAttendance), rankOverall: 0, outOf: schoolsReport.length,
    };
  });
  const schOverall = assignRanks([...schoolsFlat].sort(byScoreThenAttempts));
  const schools = schOverall.map((s) => ({ ...s, rankOverall: s._rank }));

  // ---- Level distribution (1..10) ----
  const levelDistribution = Array.from({ length: 10 }, (_, i) => ({ level: i + 1, count: 0 }));
  for (const s of students) levelDistribution[Math.max(1, Math.min(10, s.level)) - 1].count++;

  // ---- Totals ----
  const allLevels = students.map((s) => s.level);
  const totals = {
    schools: schools.length, classes: classes.length, students: students.length,
    activeStudents: students.filter((s) => s.attempts > 0).length,
    totalAttempts: students.reduce((s, x) => s + x.attempts, 0),
    avgAccuracy: avg(students.map((s) => s.accuracy)),
    avgAttendance: avg(students.map((s) => s.attendance)),
    avgLevel: mean(allLevels),
  };

  const stripClass = (s: RankedStudent) => { const { ...rest } = s as RankedStudent & { _classId?: string }; delete (rest as { _classId?: string })._classId; return rest; };

  return {
    generatedAt: new Date().toISOString(),
    totals,
    schools,
    classes,
    students: students.map(stripClass),
    levelDistribution,
    topStudents: students.filter((s) => s.hasData).slice(0, 10).map(stripClass),
    topClasses: classes.slice(0, 10),
    topSchools: schools.slice(0, 10),
  };
}
