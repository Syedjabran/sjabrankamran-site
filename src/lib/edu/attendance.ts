/**
 * Canonical attendance vocabulary — declared ONCE here.
 *
 * Every marking surface, the read-only register and every attendance-%
 * consumer imports from this module instead of re-declaring string arrays,
 * so the DB enum (supabase/migrations/edu-002-attendance-leave-exemption.sql)
 * and the app can never drift apart again.
 */

/** Order matters: it drives the UI cycle order and the counts summary row. */
export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "online",
  "absent",
  "bunk",
  "excused",
  "leave",
  "exempt",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Counts positively towards attendance. */
export const ATTENDED_STATUSES = ["present", "late", "online"] as const;

/**
 * Unauthorised absences that COUNT AGAINST attendance (kept in the denominator,
 * never attended): a plain `absent`, and `bunk` — a deliberate, unauthorised
 * skip. `bunk` is scored exactly like `absent`; it is a separate mark only so
 * staff can distinguish wilful skipping from a normal absence in the register.
 */
export const UNAUTHORISED_ABSENCE_STATUSES = ["absent", "bunk"] as const;

/**
 * Authorised non-attendance. These are removed from the attendance
 * denominator entirely — they must never be scored as a plain absence.
 * `excused` already worked this way in kpi.ts; `leave`/`exempt` join it.
 */
export const EXCLUDED_STATUSES = ["excused", "leave", "exempt"] as const;

/**
 * Values that only exist in the DB enum after edu-002 has been run. Used by
 * the save API to degrade gracefully (save what the DB accepts, warn loudly)
 * instead of losing a whole register.
 */
export const PENDING_MIGRATION_STATUSES = ["online", "leave", "exempt", "bunk"] as const;

/** The one-time migration an admin has to run for the values above. */
export const ATTENDANCE_MIGRATION_FILE = "supabase/migrations/edu-002-attendance-leave-exemption.sql";

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  online: "Online",
  absent: "Absent",
  bunk: "Bunk",
  excused: "Excused",
  leave: "Leave",
  exempt: "Exempt",
};

/** Official exemption reasons are stored in edu_attendance.note (text). */
export const ATTENDANCE_NOTE_MAX = 500;

const ALL = new Set<string>(ATTENDANCE_STATUSES);
const ATTENDED = new Set<string>(ATTENDED_STATUSES);
const EXCLUDED = new Set<string>(EXCLUDED_STATUSES);
const PENDING = new Set<string>(PENDING_MIGRATION_STATUSES);

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && ALL.has(value);
}

/** present | late | online */
export function isAttended(status: string): boolean {
  return ATTENDED.has(status);
}

/** excused | leave | exempt — dropped from the denominator, never an absence. */
export function isExcludedFromAttendance(status: string): boolean {
  return EXCLUDED.has(status);
}

/** Needs the one-time enum migration before the DB will accept it. */
export function needsEnumMigration(status: string): boolean {
  return PENDING.has(status);
}

/** An official reason is MANDATORY for a lesson exemption. */
export function requiresReason(status: string): boolean {
  return status === "exempt";
}

/**
 * Statuses a reason may be recorded against. A reason is only ever kept for
 * these, so moving a student back to e.g. `present` cannot leave a stale
 * exemption reason behind (API and UI both rely on this).
 */
export function allowsReason(status: string): boolean {
  return status === "exempt" || status === "leave";
}

/** Trim + cap a staff-typed reason; returns "" for anything blank. */
export function normaliseReason(note: unknown): string {
  return typeof note === "string" ? note.trim().slice(0, ATTENDANCE_NOTE_MAX) : "";
}

/** Marks that count towards a percentage (excused/leave/exempt removed). */
export function countedStatuses(statuses: string[]): string[] {
  return statuses.filter((s) => !isExcludedFromAttendance(s));
}

/**
 * Attendance percentage: attended ÷ (all marks minus excused/leave/exempt).
 * Returns null when the student has no countable marks at all.
 */
export function attendancePercent(statuses: string[]): number | null {
  const counted = countedStatuses(statuses);
  if (!counted.length) return null;
  return Math.round((counted.filter(isAttended).length / counted.length) * 100);
}
