-- ============================================================================
-- edu-002 — Attendance: Leave + Lesson exemption (and the never-migrated
-- 'online' value the app has been using since the voice-attendance release).
--
-- HOW TO RUN — IMPORTANT
--   `alter type ... add value` cannot run inside a transaction block, so each
--   statement below MUST be executed on its own. In the Supabase SQL Editor,
--   paste and run the statements ONE AT A TIME (or select a single statement
--   and press Run). Every statement is `if not exists` / idempotent, so this
--   file is safe to re-run as many times as needed.
--
-- WHAT IT ADDS to public.edu_attendance_status
--   online  — attended remotely. Already referenced everywhere in the app code
--             but never migrated, so the API silently dropped those marks.
--   leave   — approved, NON-PUNITIVE absence (authorised leave).
--   exempt  — the student is officially exempted from that lesson. An official
--             reason is MANDATORY and is stored in edu_attendance.note.
--
-- WHY NO NEW COLUMN
--   edu_attendance.note (edu-001-foundation.sql) already exists and was unused.
--   It now stores the official exemption reason captured by staff at marking
--   time and replayed in the read-only daily register.
--
-- ATTENDANCE MATHS (enforced in src/lib/edu/attendance.ts)
--   present / late / online  → attended
--   absent                   → counts against attendance
--   excused / leave / exempt → excluded from the attendance denominator; they
--                              are never treated as a plain absence.
-- ============================================================================

alter type public.edu_attendance_status add value if not exists 'online';

alter type public.edu_attendance_status add value if not exists 'leave';

alter type public.edu_attendance_status add value if not exists 'exempt';

-- Documentation only (this one is transaction-safe and can run with the rest).
comment on column public.edu_attendance.note is
  'Free-text staff note. For status = ''exempt'' this holds the MANDATORY official reason for the lesson exemption; optional for ''leave''. Shown in the read-only daily register.';
