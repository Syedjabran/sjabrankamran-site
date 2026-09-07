/**
 * AI progress reports. SERVER-ONLY.
 *
 * Builds a student's progress snapshot (Exam Lab attempts + attendance + level)
 * and composes a warm, professional email from the teacher using Google Gemini,
 * with a deterministic fallback so a report is ALWAYS produced even if the AI
 * call fails. Used by the progress-email route (manual + scheduled agent).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { attendancePercent } from "@/lib/edu/attendance";

export type ProgressStats = {
  name: string;
  className: string;
  attempts: number;
  papersSat: number;
  scoredQuestions: number;
  accuracy: number | null;
  level: number;
  levelLabel: string;
  strengths: string[];
  focus: string[];
  attendancePct: number | null;
  trend: "up" | "down" | "flat" | "n/a";
  lastActive: number | null;
};

function model() {
  const c = (process.env.MAXWELL_MODEL || process.env.GEMINI_MODEL || "").trim();
  const slow = new Set(["gemini-flash-latest", "gemini-pro-latest"]);
  return c && !slow.has(c) ? c : "gemini-3.1-flash-lite";
}

export async function buildStats(uid: string, studentId: string, name: string, className: string): Promise<ProgressStats> {
  const supabase = createAdminClient();
  const attempts = uid ? await getAttempts(uid) : [];
  const a = analyse(attempts);

  let attendancePct: number | null = null;
  if (studentId) {
    const { data: att } = await supabase.from("edu_attendance").select("status").eq("student_id", studentId);
    // excused / leave / exempt are excluded from the denominator, so an
    // approved absence never drags a parent-facing report down.
    if (att && att.length) attendancePct = attendancePercent(att.map((x) => x.status as string));
  }

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
    name, className,
    attempts: a.totalAttempts, papersSat: a.papersSat, scoredQuestions: a.scoredQuestions,
    accuracy: a.scoredQuestions ? a.overallAccuracy : null,
    level: a.level, levelLabel: a.levelLabel,
    strengths: a.strengths.slice(0, 3).map((t) => t.topic),
    focus: a.weaknesses.slice(0, 3).map((t) => t.topic),
    attendancePct,
    trend,
    lastActive: attempts.length ? Math.max(...attempts.map((x) => x.ts)) : null,
  };
}

function fallbackEmail(s: ProgressStats, forParent: boolean): { subject: string; body: string } {
  const who = forParent ? `your child ${s.name}` : "you";
  const acc = s.accuracy != null ? `${s.accuracy}%` : "not enough scored questions yet";
  const trendLine = s.trend === "up" ? "The trend is improving — keep it up." :
    s.trend === "down" ? "Accuracy has dipped recently; a little more consistent practice will help." :
    s.trend === "flat" ? "Performance is steady." : "";
  const lines = [
    `Dear ${forParent ? "Parent/Guardian" : s.name},`,
    "",
    `Here is a brief Physics progress update for ${who} (${s.className}).`,
    "",
    `• Exam Lab practice: ${s.attempts} session(s), ${s.papersSat} full paper(s), ${s.scoredQuestions} questions scored.`,
    `• Overall accuracy: ${acc}.`,
    `• Progress level: ${s.level}/10 (${s.levelLabel}).`,
    s.attendancePct != null ? `• Class attendance: ${s.attendancePct}%.` : "",
    s.strengths.length ? `• Strengths: ${s.strengths.join(", ")}.` : "",
    s.focus.length ? `• Focus areas: ${s.focus.join(", ")}.` : "",
    trendLine ? `• ${trendLine}` : "",
    "",
    "Please keep practising regularly on the portal. Do reach out if you have any questions.",
    "",
    "Warm regards,",
    "Syed Jabran Ali Kamran",
    "Physics — sjabrankamran.com",
  ].filter((l) => l !== "");
  return { subject: `Physics progress update — ${s.name}`, body: lines.join("\n") };
}

export async function composeProgressEmail(s: ProgressStats, forParent: boolean): Promise<{ subject: string; body: string }> {
  if (!process.env.GEMINI_API_KEY) return fallbackEmail(s, forParent);
  const audience = forParent
    ? "the student's parent/guardian (address them warmly and refer to the student by name in the third person)"
    : "the student directly (encouraging, second person)";
  const prompt = `You are Syed Jabran Ali Kamran, an experienced Cambridge A-Level Physics teacher. Write a short, warm, professional progress-update email to ${audience}. British English. 130-190 words. No markdown, plain text with short bullet lines using "• ". End with a sign-off "Warm regards,\\nSyed Jabran Ali Kamran".

Student: ${s.name}
Class: ${s.className}
Data:
- Exam Lab sessions: ${s.attempts}; full papers: ${s.papersSat}; scored questions: ${s.scoredQuestions}
- Overall accuracy: ${s.accuracy != null ? s.accuracy + "%" : "insufficient data"}
- Progress level: ${s.level}/10 (${s.levelLabel})
- Attendance: ${s.attendancePct != null ? s.attendancePct + "%" : "n/a"}
- Strengths: ${s.strengths.join(", ") || "n/a"}
- Focus areas: ${s.focus.join(", ") || "n/a"}
- Recent trend: ${s.trend}

Reply in EXACTLY this format:
SUBJECT: <subject line>
BODY:
<the email body>`;

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
    if (!r.ok) return fallbackEmail(s, forParent);
    const j = await r.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    const m = text.match(/SUBJECT:\s*(.+?)\s*\nBODY:\s*([\s\S]+)/i);
    if (!m) return fallbackEmail(s, forParent);
    return { subject: m[1].trim().slice(0, 200), body: m[2].trim().slice(0, 6000) };
  } catch {
    return fallbackEmail(s, forParent);
  } finally {
    clearTimeout(timer);
  }
}
