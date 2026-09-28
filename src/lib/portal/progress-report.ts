/**
 * AI progress reports. SERVER-ONLY.
 *
 * Builds a student's progress snapshot (Exam Lab attempts + attendance + level)
 * and composes a warm, professional email from the teacher using Google Gemini,
 * with a deterministic fallback so a report is ALWAYS produced even if the AI
 * call fails. Used by the progress-email route (manual + scheduled agent). The
 * wording -- the prompt, the fallback, the teacher and the subject -- is
 * portal-emails.ts's, for the report's courses.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudentAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { attendancePercent } from "@/lib/edu/attendance";
import { listTasks } from "@/lib/portal/tasks";
import { studentCourses } from "@/lib/portal/course-access";
import type { Course } from "@/lib/portal/course-labels";
import { fallbackProgressEmail, progressPrompt, reportCourses, type ProgressStats } from "@/lib/portal/portal-emails";

export type { ProgressStats };

function model() {
  const c = (process.env.MAXWELL_MODEL || process.env.GEMINI_MODEL || "").trim();
  const slow = new Set(["gemini-flash-latest", "gemini-pro-latest"]);
  return c && !slow.has(c) ? c : "gemini-3.1-flash-lite";
}

/** The courses a student's progress report is written for (portal-emails.ts
 *  reportCourses), from a strict read of their courses: a failed read keeps
 *  the Physics report every student got before courses were read. */
export async function reportCoursesFor(uid: string): Promise<Course[]> {
  return reportCourses(await studentCourses(uid, { strict: true }).catch(() => null));
}

/** `courses`: the courses the report is written for (reportCoursesFor). */
export async function buildStats(uid: string, studentId: string, name: string, className: string, courses: Course[]): Promise<ProgressStats> {
  const supabase = createAdminClient();
  // The student's own view: the report goes to them and their parents.
  const attempts = uid ? await getStudentAttempts(uid) : [];
  const a = analyse(attempts);

  let attendancePct: number | null = null;
  let assignmentsSubmitted = 0, assignmentsOutstanding = 0;
  if (studentId) {
    const [{ data: att }, { data: submissions }] = await Promise.all([
      supabase.from("edu_attendance").select("status").eq("student_id", studentId),
      supabase.from("edu_submissions").select("status").eq("student_id", studentId),
    ]);
    // excused / leave / exempt are excluded from the denominator, so an
    // approved absence never drags a parent-facing report down.
    if (att && att.length) attendancePct = attendancePercent(att.map((x) => x.status as string));
    assignmentsSubmitted = (submissions || []).filter((x) => ["submitted", "late", "marked", "returned"].includes(x.status as string)).length;
    assignmentsOutstanding = (submissions || []).filter((x) => ["assigned", "resubmit"].includes(x.status as string)).length;
  }
  const tasks = await listTasks(uid).catch(() => []);

  let trend: ProgressStats["trend"] = "n/a";
  if (a.timeline.length >= 2) {
    const half = Math.floor(a.timeline.length / 2);
    const first = a.timeline.slice(0, half);
    const last = a.timeline.slice(half);
    const avg = (xs: { accuracy: number }[]) => xs.reduce((s, x) => s + x.accuracy, 0) / xs.length;
    const d = avg(last) - avg(first);
    trend = d > 4 ? "up" : d < -4 ? "down" : "flat";
  }

  return {
    name, className, courses,
    attempts: a.totalAttempts, papersSat: a.papersSat, scoredQuestions: a.scoredQuestions,
    accuracy: a.scoredQuestions ? a.overallAccuracy : null,
    level: a.level, levelLabel: a.levelLabel,
    strengths: a.strengths.slice(0, 3).map((t) => t.topic),
    focus: a.weaknesses.slice(0, 3).map((t) => t.topic),
    attendancePct,
    trend,
    lastActive: attempts.length ? Math.max(...attempts.map((x) => x.ts)) : null,
    tasksOpen: tasks.filter((t) => t.status !== "done").length,
    tasksCompleted: tasks.filter((t) => t.status === "done").length,
    assignmentsSubmitted,
    assignmentsOutstanding,
  };
}

export async function composeProgressEmail(s: ProgressStats, forParent: boolean, recipientName?: string, opts?: { ai?: boolean }): Promise<{ subject: string; body: string }> {
  if (opts?.ai === false || !process.env.GEMINI_API_KEY) return fallbackProgressEmail(s, forParent, recipientName);
  const prompt = progressPrompt(s, forParent, recipientName);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 700 } }),
        signal: ctrl.signal,
      }
    );
    if (!r.ok) return fallbackProgressEmail(s, forParent, recipientName);
    const j = await r.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    const m = text.match(/SUBJECT:\s*(.+?)\s*\nBODY:\s*([\s\S]+)/i);
    if (!m) return fallbackProgressEmail(s, forParent, recipientName);
    return { subject: m[1].trim().slice(0, 200), body: m[2].trim().slice(0, 6000) };
  } catch {
    return fallbackProgressEmail(s, forParent, recipientName);
  } finally {
    clearTimeout(timer);
  }
}
