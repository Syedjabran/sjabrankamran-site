/**
 * Notification Centre. SERVER-ONLY (service-role).
 *
 * One general library behind the bell icon AND the /portal/notifications page.
 * Rows live in the EXISTING `edu_notifications` table (user_id, kind, title,
 * body, link, read_at, created_at) — atomic inserts, no shared-JSON races.
 *
 * Extras that need no cron and no DDL:
 *  - notify() fans a message out to explicit uids or a resolved audience
 *    (everyone / all students / a school / a class).
 *  - Per-user cap ~100: enforced lazily on read (cheap, single-user cost).
 *  - Synthesized-on-read reminders: when the bell/page loads we check the
 *    user's Exam Lab allocations / class assignments / personal tasks due in
 *    the next 48h and freshly-marked submissions, and insert real notification
 *    rows once. De-dupe uses a per-user "reminded" marker file
 *    (portal-data/notify-markers/<uid>.json) — per-user file, so bursty
 *    read-modify-write on a shared JSON can never lose updates.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/portal/push";
import { listAllocations } from "@/lib/exam-lab/allocations";
import { listTasks } from "@/lib/portal/tasks";
import { getRegistry } from "@/lib/portal/institutions";
import { timetableForUid } from "@/lib/portal/timetable";
import { isStaff, type EduRole } from "@/lib/edu/auth";

export type NotifKind =
  | "task" | "challenge" | "assignment" | "test" | "announcement"
  | "mail" | "resource" | "marks" | "attendance" | "rank" | "reminder";

export type NotificationRow = {
  id: string; kind: string; title: string; body: string | null;
  link: string | null; read_at: string | null; created_at: string;
};

export type NotifyInput = { type: NotifKind; title: string; body?: string | null; href?: string | null };

export type NotifyTarget =
  | { uids: string[] }
  | { audience: "all" }
  | { audience: "students" }
  | { audience: "school"; school: string }
  | { audience: "class"; classId: string };

const CAP = 100;
const DATA = "portal-data";
const markerPath = (uid: string) => `notify-markers/${uid}.json`;

function sb() { return createAdminClient(); }

/** Resolve a notify target to a de-duplicated list of auth uids. */
export async function resolveAudience(target: NotifyTarget): Promise<string[]> {
  try {
    if ("uids" in target) return [...new Set(target.uids.filter(Boolean))];
    const db = sb();
    if (target.audience === "all") {
      const { data } = await db.from("edu_profiles").select("id, status");
      return (data || []).filter((r) => r.status !== "archived").map((r) => r.id as string);
    }
    if (target.audience === "students") {
      const { data } = await db.from("edu_user_roles").select("user_id").eq("role", "student");
      return [...new Set((data || []).map((r) => r.user_id as string))];
    }
    let classIds: string[] = [];
    if (target.audience === "school") {
      const reg = await getRegistry();
      classIds = reg.classes.filter((c) => c.school === target.school).map((c) => c.id);
    } else {
      classIds = [target.classId];
    }
    if (!classIds.length) return [];
    const { data: enr } = await db
      .from("edu_enrolments")
      .select("edu_students(profile_id)")
      .in("class_id", classIds)
      .eq("status", "active");
    const rows = (enr || []) as unknown as { edu_students?: { profile_id?: string } }[];
    const candidates = [...new Set(rows.map((r) => r.edu_students?.profile_id).filter((x): x is string => !!x))];
    if (!candidates.length) return [];
    const { data: roleRows } = await db.from("edu_user_roles").select("user_id, role").in("user_id", candidates);
    const roles = new Map<string, EduRole[]>();
    for (const row of (roleRows || []) as { user_id: string; role: EduRole }[]) {
      const list = roles.get(row.user_id) || [];
      list.push(row.role);
      roles.set(row.user_id, list);
    }
    return candidates.filter((uid) => {
      const userRoles = roles.get(uid) || [];
      return userRoles.includes("student") && !isStaff(userRoles);
    });
  } catch {
    return [];
  }
}

/**
 * Fan one notification out to a target. Best-effort (never throws); returns
 * how many users were notified. Inserts are chunked so big broadcasts work.
 */
export async function notify(target: NotifyTarget, input: NotifyInput): Promise<number> {
  try {
    const uids = await resolveAudience(target);
    if (!uids.length) return 0;
    const rows = uids.map((u) => ({
      user_id: u,
      kind: input.type,
      title: input.title.slice(0, 200),
      body: (input.body || "").slice(0, 1000) || null,
      link: (input.href || "").slice(0, 300) || null,
    }));
    const db = sb();
    for (let i = 0; i < rows.length; i += 400) {
      await db.from("edu_notifications").insert(rows.slice(i, i + 400));
    }
    // Mirror to OS-level Web Push for installed PWAs (no-op until VAPID is set).
    void sendPush(uids, { title: input.title, body: input.body || undefined, url: input.href || "/portal/notifications", tag: input.type });
    // Cap enforcement for single-user targets is cheap; broadcasts rely on the
    // lazy on-read cap instead (per-user queries for 100s of users are wasteful).
    if (uids.length <= 3) await Promise.all(uids.map((u) => enforceCap(u)));
    return uids.length;
  } catch {
    return 0;
  }
}

/** Keep only the newest ~CAP rows for a user (drop oldest beyond the cap). */
export async function enforceCap(uid: string): Promise<void> {
  try {
    const db = sb();
    const { data } = await db
      .from("edu_notifications")
      .select("id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(CAP, CAP + 400);
    const ids = (data || []).map((r) => r.id as string);
    if (ids.length) await db.from("edu_notifications").delete().in("id", ids);
  } catch { /* best effort */ }
}

/** The user's notifications (newest first) + unread count. */
export async function listNotifications(uid: string, limit = 30): Promise<{ items: NotificationRow[]; unread: number }> {
  const db = sb();
  const [{ data: items }, { count }] = await Promise.all([
    db.from("edu_notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), CAP)),
    db.from("edu_notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).is("read_at", null),
  ]);
  return { items: (items || []) as NotificationRow[], unread: count || 0 };
}

export async function markRead(uid: string, id: string): Promise<void> {
  await sb().from("edu_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).eq("id", id);
}

export async function markAllRead(uid: string): Promise<void> {
  await sb().from("edu_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
}

/** In-portal "You've got mail" — maps recipient emails to portal users. */
export async function notifyMailReceived(toEmails: string[], subject: string): Promise<void> {
  try {
    const emails = [...new Set(toEmails.flatMap((e) => [e, e.toLowerCase()]).filter(Boolean))];
    if (!emails.length) return;
    const { data } = await sb().from("edu_profiles").select("id, email").in("email", emails);
    const uids = [...new Set((data || []).map((r) => r.id as string))];
    if (!uids.length) return;
    await notify({ uids }, {
      type: "mail",
      title: `You've got mail: ${subject.slice(0, 140)}`,
      body: "An email from the Physics portal has been sent to your inbox — check your email.",
      href: null,
    });
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Synthesized-on-read reminders (no cron)
// ---------------------------------------------------------------------------

type MarkerDoc = { keys: string[]; updated_at?: string };

async function readMarkers(uid: string): Promise<{ seen: Set<string>; existed: boolean }> {
  try {
    const { data } = await sb().storage.from(DATA).download(markerPath(uid));
    if (data) {
      const j = JSON.parse(await data.text()) as MarkerDoc;
      return { seen: new Set(j.keys || []), existed: true };
    }
  } catch { /* none */ }
  return { seen: new Set(), existed: false };
}

async function writeMarkers(uid: string, keys: Set<string>): Promise<void> {
  try {
    const doc: MarkerDoc = { keys: [...keys].slice(-400), updated_at: new Date().toISOString() };
    const body = new Blob([JSON.stringify(doc)], { type: "application/json" });
    await sb().storage.from(DATA).upload(markerPath(uid), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  } catch { /* best effort */ }
}

function fmtDue(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
    (d.getHours() || d.getMinutes() ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "");
}

// Class schedules/lessons store wall-clock time for the school's timezone
// (Asia/Karachi, UTC+5, no DST). Compute occurrences against that offset so a
// UTC serverless runtime doesn't drift the "class today" window by 5 hours.
const SCHOOL_TZ_OFFSET_MS = 5 * 3600_000;
function hhmm(t: string | null): string { return (t || "").slice(0, 5); }
/** Next real-UTC timestamp for a weekly weekday+time slot (0=Sun..6=Sat, PKT). */
function nextWeeklyOccurrence(weekday: number, startsAt: string): number {
  const nowUtc = Date.now();
  const pkt = new Date(nowUtc + SCHOOL_TZ_OFFSET_MS);
  const [h, m] = (startsAt || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  let add = (weekday - pkt.getUTCDay() + 7) % 7;
  let ms = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate() + add, h, m) - SCHOOL_TZ_OFFSET_MS;
  if (add === 0 && ms <= nowUtc) ms += 7 * 24 * 3600_000;
  return ms;
}
/** Real-UTC timestamp for a dated PKT wall-clock lesson. */
function lessonStartMs(dateStr: string, startsAt: string | null): number {
  const [h, m] = hhmm(startsAt || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  const [y, mo, d] = dateStr.split("-").map((x) => parseInt(x, 10) || 0);
  return Date.UTC(y, (mo || 1) - 1, d || 1, h, m) - SCHOOL_TZ_OFFSET_MS;
}

// Per-warm-instance throttle so the 60s bell poll doesn't hammer Storage.
const _lastSynth = new Map<string, number>();

/**
 * Merge "virtual" reminder items for work due in the next 48h and marks that
 * have been recorded on the user's submissions — inserted as REAL rows exactly
 * once (deduped via the per-user marker file). Call on bell/page load.
 */
export async function synthesizeForUser(uid: string, opts?: { force?: boolean }): Promise<void> {
  const last = _lastSynth.get(uid) || 0;
  if (!opts?.force && Date.now() - last < 5 * 60_000) return;
  _lastSynth.set(uid, Date.now());

  try {
    const db = sb();
    const now = Date.now();
    const horizon = now + 48 * 3600_000;
    const pending: { key: string; input: NotifyInput }[] = [];

    // -- Exam Lab allocations due within 48h and not yet submitted --
    const allocs = await listAllocations(uid).catch(() => []);
    const testHorizon = now + 7 * 24 * 3600_000; // surface upcoming tests a week out
    for (const a of allocs) {
      if (a.status !== "assigned" || !a.dueAt) continue;
      const due = new Date(a.dueAt).getTime();
      if (due <= now) continue;
      const isTest = a.mode === "test";
      if (due > (isTest ? testHorizon : horizon)) continue;
      pending.push({
        key: isTest ? `test-due:${a.id}` : `alloc-due:${a.id}`,
        input: isTest
          ? { type: "test", title: `Upcoming test: ${a.title}`, body: `Your proctored/self test is on ${fmtDue(a.dueAt)}. Prepare in Exam Lab.`, href: "/portal/exam-lab" }
          : { type: "reminder", title: `Due soon: ${a.title}`, body: `Your Exam Lab assignment is due ${fmtDue(a.dueAt)}.`, href: "/portal/exam-lab" },
      });
    }

    // -- Class assignments (edu_submissions still open) + freshly marked work --
    const { data: stu } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (stu?.id) {
      const { data: subs } = await db
        .from("edu_submissions")
        .select("assignment_id, status, marks, edu_assignments(id, title, due_at, max_marks)")
        .eq("student_id", stu.id);
      type SubRow = { assignment_id: string; status: string; marks: number | null; edu_assignments?: { id: string; title: string; due_at: string | null; max_marks: number | null } };
      for (const r of (subs || []) as unknown as SubRow[]) {
        const a = r.edu_assignments;
        if (!a) continue;
        if ((r.status === "assigned" || r.status === "resubmit") && a.due_at) {
          const due = new Date(a.due_at).getTime();
          if (due > now && due <= horizon) {
            pending.push({
              key: `assign-due:${r.assignment_id}`,
              input: {
                type: "reminder",
                title: `Due soon: ${a.title}`,
                body: `Your assignment is due ${fmtDue(a.due_at)}. Submit it in My Learning.`,
                href: `/portal/learn/assignments/${a.id}`,
              },
            });
          }
        }
        // Marks / feedback recorded (grading happens outside the app's routes,
        // so we detect it here rather than at a write path).
        if ((r.status === "marked" || r.status === "returned" || r.marks != null) && r.marks != null) {
          pending.push({
            key: `marked:${r.assignment_id}:${r.marks}`,
            input: {
              type: "marks",
              title: `Marks recorded: ${a.title}`,
              body: `You scored ${r.marks}${a.max_marks ? ` / ${a.max_marks}` : ""} — open the assignment to read any feedback.`,
              href: `/portal/learn/assignments/${a.id}`,
            },
          });
        }
      }
    }

    // -- Personal tasks / challenges due within 48h --
    const tasks = await listTasks(uid).catch(() => []);
    for (const t of tasks) {
      if (t.status === "done" || !t.dueAt) continue;
      const due = new Date(t.dueAt).getTime();
      if (due <= now || due > horizon) continue;
      pending.push({
        key: `task-due:${t.id}`,
        input: {
          type: "reminder",
          title: `Due soon: ${t.title}`,
          body: `Your personal ${t.kind} is due ${fmtDue(t.dueAt)}.`,
          href: `/portal/tasks/${encodeURIComponent(t.id)}`,
        },
      });
    }

    // -- Scheduled class timings (weekly) + extra/dated lessons --
    const timetable = await timetableForUid(uid);
    const soon = now + 24 * 3600_000;
    for (const s of timetable.slots) {
      const occ = nextWeeklyOccurrence(s.weekday, s.startsAt);
      if (occ <= now || occ > soon) continue;
      const day = new Date(occ + SCHOOL_TZ_OFFSET_MS).toISOString().slice(0, 10);
      pending.push({
        key: `class:${s.classId}:${day}:${hhmm(s.startsAt)}`,
        input: { type: "reminder", title: `Class reminder: ${s.classMeta.name}`, body: `Scheduled ${fmtDue(new Date(occ).toISOString())}–${hhmm(s.endsAt)} Pakistan time.`, href: "/portal/timetable" },
      });
    }
    for (const l of timetable.extras) {
      const t = lessonStartMs(l.lessonDate, l.startsAt);
      if (t <= now || t > horizon) continue;
      pending.push({
        key: `lesson:${l.id}`,
        input: {
          type: "announcement",
          title: `Extra class: ${l.title || l.classMeta.name}`,
          body: `An additional class has been scheduled for ${fmtDue(new Date(t).toISOString())}${l.endsAt ? `–${hhmm(l.endsAt)}` : ""} Pakistan time.`,
          href: "/portal/timetable",
        },
      });
    }

    if (!pending.length) return;
    const { seen, existed } = await readMarkers(uid);
    // First-ever synthesis: baseline historical "marks recorded" silently so a
    // user with months of already-marked work isn't flooded. Due-soon reminders
    // still fire (they are genuinely current).
    if (!existed) for (const p of pending) if (p.input.type === "marks") seen.add(p.key);
    const fresh = pending.filter((p) => !seen.has(p.key));
    for (const p of fresh) {
      await notify({ uids: [uid] }, p.input);
      seen.add(p.key);
    }
    if (fresh.length || !existed) await writeMarkers(uid, seen);
  } catch { /* best effort — never break the bell */ }
}
