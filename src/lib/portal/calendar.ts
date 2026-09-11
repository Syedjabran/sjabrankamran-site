/**
 * Personal calendar feed. SERVER-ONLY (service-role).
 *
 * Produces an iCalendar (.ics) subscription of everything on a student's plate —
 * upcoming tests, assignment/task due dates, weekly class timings and extra
 * (dated) lessons — so they can subscribe once in Google Calendar (Add calendar
 * → From URL) and have it stay in sync, with automatic reminders.
 *
 * A stable per-user token (Storage-as-DB) authorises the unauthenticated feed
 * that Google/Apple Calendar fetch on a schedule. No DDL.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { listAllocations } from "@/lib/exam-lab/allocations";
import { listTasks } from "@/lib/portal/tasks";
import { timetableForUid } from "@/lib/portal/timetable";

const DATA = "portal-data";
const tokenPath = (token: string) => `calendar-tokens/${token}.json`;
const byUidPath = (uid: string) => `calendar-tokens/by-uid/${uid}.json`;
const SCHOOL_TZ_OFFSET_MS = 5 * 3600_000; // Asia/Karachi (UTC+5, no DST)
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function sb() { return createAdminClient(); }
function rndToken() { return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 32); }

export type CalEvent = {
  uid: string; title: string; start: number; end: number | null;
  description?: string; url?: string; allDay?: boolean;
  rrule?: string; alarmMin?: number;
};

/** Stable calendar token for the user (created once, reused). */
export async function getOrCreateCalendarToken(uid: string): Promise<string> {
  try {
    const { data } = await sb().storage.from(DATA).download(byUidPath(uid));
    if (data) { const j = JSON.parse(await data.text()) as { token?: string }; if (j.token) return j.token; }
  } catch { /* create below */ }
  const token = rndToken();
  const write = async (p: string, body: object) =>
    sb().storage.from(DATA).upload(p, new Blob([JSON.stringify(body)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  await write(byUidPath(uid), { token, created_at: new Date().toISOString() });
  await write(tokenPath(token), { uid, created_at: new Date().toISOString() });
  return token;
}

export async function resolveCalendarToken(token: string): Promise<string | null> {
  if (!/^[a-z0-9]{8,40}$/i.test(token)) return null;
  try {
    const { data } = await sb().storage.from(DATA).download(tokenPath(token));
    if (data) { const j = JSON.parse(await data.text()) as { uid?: string }; return j.uid || null; }
  } catch { /* miss */ }
  return null;
}

function lessonStartMs(dateStr: string, startsAt: string | null): number {
  const [h, m] = (startsAt || "00:00").slice(0, 5).split(":").map((x) => parseInt(x, 10) || 0);
  const [y, mo, d] = dateStr.split("-").map((x) => parseInt(x, 10) || 0);
  return Date.UTC(y, (mo || 1) - 1, d || 1, h, m) - SCHOOL_TZ_OFFSET_MS;
}
function nextWeeklyOccurrence(weekday: number, startsAt: string): number {
  const nowUtc = Date.now();
  const pkt = new Date(nowUtc + SCHOOL_TZ_OFFSET_MS);
  const [h, m] = (startsAt || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  const add = (weekday - pkt.getUTCDay() + 7) % 7;
  return Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate() + add, h, m) - SCHOOL_TZ_OFFSET_MS;
}

/** Gather the user's upcoming calendar events from every portal source. */
export async function buildCalendarEvents(uid: string, siteOrigin: string): Promise<CalEvent[]> {
  const db = sb();
  const now = Date.now();
  const soon = now + 90 * 24 * 3600_000;
  const events: CalEvent[] = [];

  // Exam Lab tests & assignments
  const allocs = await listAllocations(uid).catch(() => []);
  for (const a of allocs) {
    if (!a.dueAt) continue;
    const t = new Date(a.dueAt).getTime();
    if (t < now - 24 * 3600_000 || t > soon) continue;
    const isTest = a.mode === "test";
    events.push({
      uid: `alloc-${a.id}@sjak`, title: `${isTest ? "Test" : "Exam Lab"}: ${a.title}`,
      start: t, end: t + 3600_000, alarmMin: isTest ? 1440 : 120,
      description: `${isTest ? "Scheduled test" : "Exam Lab assignment"} on the SJAK portal.`,
      url: `${siteOrigin}/portal/exam-lab`,
    });
  }

  // Personal tasks & daily challenges
  const tasks = await listTasks(uid).catch(() => []);
  for (const tk of tasks) {
    if (tk.status === "done" || !tk.dueAt) continue;
    const t = new Date(tk.dueAt).getTime();
    if (t < now - 24 * 3600_000 || t > soon) continue;
    events.push({
      uid: `task-${tk.id}@sjak`, title: `${tk.kind === "challenge" ? "Challenge" : "Task"}: ${tk.title}`,
      start: t, end: t + 1800_000, alarmMin: 120,
      description: tk.details || "Personal task on the SJAK portal.", url: `${siteOrigin}/portal/learn`,
    });
  }

  // Class assignments (open submissions with a due date)
  const { data: stu } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
  if (stu?.id) {
    const { data: subs } = await db
      .from("edu_submissions")
      .select("status, edu_assignments(id, title, due_at)")
      .eq("student_id", stu.id);
    for (const r of (subs || []) as unknown as { status: string; edu_assignments?: { id: string; title: string; due_at: string | null } }[]) {
      const a = r.edu_assignments;
      if (!a?.due_at || (r.status !== "assigned" && r.status !== "resubmit")) continue;
      const t = new Date(a.due_at).getTime();
      if (t < now - 24 * 3600_000 || t > soon) continue;
      events.push({
        uid: `assign-${a.id}@sjak`, title: `Assignment due: ${a.title}`, start: t, end: t + 1800_000,
        alarmMin: 720, description: "Assignment due on the SJAK portal.", url: `${siteOrigin}/portal/learn/assignments/${a.id}`,
      });
    }

  }

  // Role-aware class timings + extra classes. This includes students, parents,
  // assigned staff and the super-admin's complete all-schools timetable.
  const timetable = await timetableForUid(uid);
  for (const s of timetable.slots) {
    const start = nextWeeklyOccurrence(s.weekday, s.startsAt);
    const [sh, sm] = s.startsAt.slice(0, 5).split(":").map(Number);
    const [eh, em] = s.endsAt.slice(0, 5).split(":").map(Number);
    const duration = Math.max(30, (eh * 60 + em) - (sh * 60 + sm)) * 60_000;
    events.push({
      uid: `sched-${s.id}@sjak`, title: `Class: ${s.classMeta.name}`,
      start, end: start + duration, alarmMin: 30, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[s.weekday] || "MO"}`,
      description: "Scheduled Physics class (Pakistan time).", url: `${siteOrigin}/portal/timetable`,
    });
  }
  for (const l of timetable.extras) {
    const start = lessonStartMs(l.lessonDate, l.startsAt);
    if (start > soon) continue;
    const end = l.endsAt ? lessonStartMs(l.lessonDate, l.endsAt) : start + 3600_000;
    events.push({
      uid: `lesson-${l.id}@sjak`, title: `Extra class: ${l.title || l.classMeta.name}`,
      start, end, alarmMin: 60, description: "Additional Physics class scheduled on the portal.",
      url: `${siteOrigin}/portal/timetable`,
    });
  }

  return events.sort((a, b) => a.start - b.start);
}

function icsTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function esc(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Render events as an RFC-5545 iCalendar document. */
export function toICS(events: CalEvent[]): string {
  const stamp = icsTime(Date.now());
  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SJAK Portal//Calendar//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:SJAK Portal",
    "NAME:SJAK Portal", "X-WR-TIMEZONE:Asia/Karachi", "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(e.start)}`);
    if (e.end) lines.push(`DTEND:${icsTime(e.end)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${esc(e.url)}`);
    if (e.alarmMin) lines.push("BEGIN:VALARM", `TRIGGER:-PT${e.alarmMin}M`, "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** A one-click "Add to Google Calendar" URL for a single event. */
export function googleCalendarUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE", text: e.title,
    dates: `${icsTime(e.start)}/${icsTime(e.end || e.start + 3600_000)}`,
    details: `${e.description || ""}${e.url ? `\n${e.url}` : ""}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
