import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  Users, School, BookOpen, Receipt, AlertTriangle, Hourglass, GraduationCap,
  UserPlus, ClipboardList, Mail, Activity, ShieldCheck, KeyRound,
  Ban, RotateCcw, Trash2, UserCog, FileText, Paperclip, ArrowRight, Building2,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin, isStaff, isSchoolScopedStaff, ROLE_LABELS, type EduRole } from "@/lib/edu/auth";
import { getRegistry } from "@/lib/portal/institutions";
import { AdminUserSearch } from "./admin-user-search";
import { OnlineNow } from "./online-now";
import { DEMO_STUDENT_UID } from "@/lib/portal/demo-student";
import { formatPk, pkToday } from "@/lib/portal/pk-time";
import { viewerNav } from "@/lib/portal/viewer-nav";
import { satProfileOf, studentWork } from "@/lib/portal/student-work";
import { planLine, satGlance } from "@/lib/portal/glance";
import { SPACE_COOKIE } from "@/lib/portal/space-cookie";
import { courseOf, courseShortLabel, subjectOf, type SubjectId } from "@/lib/portal/subjects";
import { HomeGroups, SubjectCards } from "./portal-home-nav";

export const metadata = { title: "Portal Dashboard" };

async function count(table: string, filter?: (q: unknown) => unknown): Promise<number | null> {
  try {
    const supabase = await createClient();
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) query = filter(query) as typeof query;
    const { count: c, error } = await query;
    if (error) return null;
    return c ?? 0;
  } catch {
    return null;
  }
}

const ACCENT: Record<string, string> = { cyan: "text-cyan", emerald: "text-emerald2", magenta: "text-magenta", amber: "text-amber-300" };

function StatCard({ label, value, icon: Icon, accent = "cyan", href }: {
  label: string; value: number | string | null; icon: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string; href?: string;
}) {
  const inner = (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-space/60 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan/30 hover:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] uppercase leading-tight tracking-wider text-dust">{label}</p>
        <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 " + (ACCENT[accent] || "text-cyan")}><Icon size={15} /></span>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold text-ice">{value === null ? "—" : value}</p>
      {href ? <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-dust opacity-0 transition group-hover:opacity-100">View <ArrowRight size={11} /></span> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ---- Audit-log activity formatting ----
const ACTION_META: Record<string, { icon: React.ComponentType<{ size?: number; className?: string }>; verb: string; color: string }> = {
  "user.create": { icon: UserPlus, verb: "created account", color: "text-emerald2" },
  "user.update": { icon: UserCog, verb: "edited", color: "text-cyan" },
  "user.delete": { icon: Trash2, verb: "deleted account", color: "text-signal" },
  "user.password_reset": { icon: KeyRound, verb: "reset password for", color: "text-cyan" },
  "user.email_credentials": { icon: Mail, verb: "emailed credentials to", color: "text-cyan" },
  "user.suspend": { icon: Ban, verb: "suspended", color: "text-signal" },
  "user.lock": { icon: Ban, verb: "locked portal access for", color: "text-signal" },
  "user.reactivate": { icon: RotateCcw, verb: "reactivated", color: "text-emerald2" },
  "access.locked": { icon: Ban, verb: "activated an access lock", color: "text-signal" },
  "access.suspended": { icon: Hourglass, verb: "started an access suspension", color: "text-amber-300" },
  "access.release": { icon: RotateCcw, verb: "released an access restriction", color: "text-emerald2" },
  "role.grant": { icon: ShieldCheck, verb: "granted a role to", color: "text-cyan" },
  "role.revoke": { icon: ShieldCheck, verb: "revoked a role from", color: "text-dust" },
  "enrolment.add": { icon: GraduationCap, verb: "enrolled", color: "text-emerald2" },
  "enrolment.remove": { icon: GraduationCap, verb: "unenrolled", color: "text-dust" },
  "assignment.create": { icon: ClipboardList, verb: "posted an assignment", color: "text-amber-300" },
  "assessment.create": { icon: FileText, verb: "posted a test", color: "text-magenta" },
  "lesson.create": { icon: BookOpen, verb: "added a lesson", color: "text-cyan" },
  "attachment.add": { icon: Paperclip, verb: "attached a file", color: "text-cyan" },
  "attachment.remove": { icon: Paperclip, verb: "removed a file", color: "text-dust" },
};

function relTime(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return formatPk(iso, { day: "numeric", month: "short", year: "numeric" });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function recentActivity(): Promise<{ id: string; actor: string; action: string; target: string; when: string; targetId: string | null }[]> {
  try {
    const supabase = await createClient();
    const { data: logs } = await supabase
      .from("edu_audit_logs")
      .select("id, actor_id, action, entity, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(14);
    if (!logs?.length) return [];
    const ids = new Set<string>();
    for (const l of logs) {
      if (l.actor_id) ids.add(l.actor_id as string);
      if (l.entity_id && UUID_RE.test(String(l.entity_id))) ids.add(String(l.entity_id));
    }
    const names = new Map<string, string>();
    if (ids.size) {
      const { data: profs } = await supabase.from("edu_profiles").select("id, full_name, email").in("id", [...ids]);
      for (const p of profs || []) names.set(p.id as string, (p.full_name as string) || (p.email as string) || "—");
    }
    return logs.map((l) => {
      const det = (l.details as Record<string, unknown>) || {};
      const entityId = l.entity_id && UUID_RE.test(String(l.entity_id)) ? String(l.entity_id) : null;
      // Only treat the entity as a linkable user when it resolves to a real
      // profile. Assignment/test/lesson/attachment ids are UUIDs too but are NOT
      // users — for those we show the item title instead and never link to a
      // (non-existent) user page.
      const resolvedName = entityId ? names.get(entityId) : undefined;
      const userTargetId = resolvedName ? entityId : null;
      let target = resolvedName || (det.title ? String(det.title) : det.name ? String(det.name) : "");
      if (det.role && resolvedName) target += ` (${det.role})`;
      return { id: String(l.id), actor: names.get(l.actor_id as string) || "System", action: l.action as string, target, when: l.created_at as string, targetId: userTargetId };
    });
  } catch {
    return [];
  }
}

export default async function PortalDashboard() {
  const user = await getPortalUser();
  if (!user) return null;
  if (isSchoolScopedStaff(user.roles)) {
    if (user.roles.includes("coordinator") || user.roles.includes("facilitator")) redirect("/portal/coordinator");
    redirect("/portal/admin/attendance-view");
  }
  const viewer = await viewerNav(user);
  const { nav, roles: effRoles } = viewer;

  if (user.roles.length === 0) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
          <Hourglass size={22} className="mx-auto text-cyan" />
          <h1 className="mt-4 text-xl font-semibold text-ice">Account created — awaiting access</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fog">
            Your account exists but no portal role has been assigned yet. An administrator will
            link your account to a student, parent or staff profile.
          </p>
        </div>
        {nav.spaces.length ? <SubjectCards nav={nav} /> : null}
        <HomeGroups nav={nav} />
      </div>
    );
  }

  if (isStaff(effRoles)) {
    const admin = isAdmin(effRoles);
    const [students, activeStudents, classes, teachers, unpaid, enquiries, reg, activity] = await Promise.all([
      count("edu_students"),
      count("edu_students", (q) => (q as { eq: (c: string, v: string) => unknown }).eq("admission_status", "active")),
      count("edu_classes"),
      count("edu_teachers"),
      admin ? count("edu_invoices", (q) => (q as { in: (c: string, v: string[]) => unknown }).in("status", ["sent", "partially_paid", "overdue"])) : Promise.resolve(null),
      count("edu_students", (q) => (q as { eq: (c: string, v: string) => unknown }).eq("admission_status", "enquiry")),
      getRegistry(),
      admin ? recentActivity() : Promise.resolve([] as Awaited<ReturnType<typeof recentActivity>>),
    ]);
    const schemaMissing = students === null;
    const schools = reg.schools || [];
    const first = (user.fullName || user.email || "").split(" ")[0];
    const roleBadge = user.roles.map((r) => ROLE_LABELS[r as EduRole]).join(" · ");
    const today = formatPk(Date.now(), { weekday: "long", day: "numeric", month: "long" });

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-space/80 via-space/50 to-abyss/40 p-6 md:p-8">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Command Center</p>
              <h1 className="font-display text-3xl font-semibold text-ice">Welcome back, {first}</h1>
              <p className="mt-1 text-sm text-dust">{roleBadge} · {today}</p>
            </div>
            <div className="w-full max-w-sm">
              <AdminUserSearch />
            </div>
          </div>
        </div>

        {schemaMissing ? (
          <div className="flex items-start gap-3 rounded-2xl border border-signal/30 bg-signal/5 p-5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-signal" />
            <div>
              <p className="text-sm font-semibold text-ice">Database foundation not initialised</p>
              <p className="mt-1 text-sm leading-relaxed text-fog">The portal schema (edu-001) is not applied yet.</p>
            </div>
          </div>
        ) : null}

        <SubjectCards nav={nav} />
        <HomeGroups nav={nav} />

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Students" value={students} icon={Users} href="/portal/admin/users?role=student" />
          <StatCard label="Active" value={activeStudents} icon={GraduationCap} accent="emerald" />
          <StatCard label="Classes" value={classes} icon={School} accent="cyan" href="/portal/admin/institutions" />
          <StatCard label="Schools" value={schools.length || "—"} icon={Building2} accent="magenta" href="/portal/admin/institutions" />
          <StatCard label="Open enquiries" value={enquiries} icon={BookOpen} accent="amber" />
          {admin ? <StatCard label="Unpaid invoices" value={unpaid} icon={Receipt} accent="amber" href="/portal/admin/finance" /> : <StatCard label="Teachers" value={teachers} icon={UserCog} />}
        </div>

        <div className={admin ? "grid gap-6 lg:grid-cols-[1.4fr_1fr]" : "space-y-6"}>
          {/* Recent platform activity (admin-only; audit log is admin-readable) */}
          {admin ? (
          <section className="rounded-2xl border border-white/10 bg-space/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><Activity size={16} className="text-cyan" /> Recent activity</h2>
              <Link href="/portal/admin/users" className="text-[11px] text-cyan hover:underline">All users →</Link>
            </div>
            {activity.length ? (
              <ul className="space-y-1">
                {activity.map((a) => {
                  const meta = ACTION_META[a.action] || { icon: Activity, verb: a.action, color: "text-dust" };
                  const Icon = meta.icon;
                  const row = (
                    <div className="flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.03]">
                      <span className={"mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 " + meta.color}><Icon size={13} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-fog"><span className="text-ice">{a.actor}</span> {meta.verb}{a.target ? <span className="text-ice"> {a.target}</span> : ""}</p>
                        <p className="text-[10px] text-dust">{relTime(a.when)}</p>
                      </div>
                    </div>
                  );
                  return <li key={a.id}>{a.targetId ? <Link href={`/portal/admin/users/${a.targetId}`}>{row}</Link> : row}</li>;
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-white/10 bg-abyss/40 p-4 text-xs text-dust">No recorded activity yet. Actions you take (creating users, posting tests, enrolments) appear here.</p>
            )}
            <p className="mt-3 border-t border-white/5 pt-3 text-[11px] text-dust">
              Tip: open <span className="text-cyan">Users &amp; activity</span> and click any person to see their full <span className="text-ice">past · present · future</span> timeline.
            </p>
          </section>
          ) : null}

          {/* Who is online, and the schools */}
          <section className="space-y-3">
            <OnlineNow />
            {schools.length ? (
              <div className="rounded-2xl border border-white/10 bg-space/60 p-4">
                <p className="mb-2 text-[11px] uppercase tracking-widest text-dust">Schools</p>
                <div className="flex flex-wrap gap-1.5">
                  {schools.map((s) => (
                    <Link key={s} href="/portal/admin/institutions" className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-fog hover:border-cyan/40 hover:text-cyan">{s}</Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  // Non-staff (student / parent) home: the subject cards first, then the one
  // dominant next action, deadlines, and the General and More groups. In
  // Super Admin's Student preview, use the private QA student's work so the
  // preview is representative and does not create student tasks against the
  // administrator's own account.
  const planUid = user.roles.includes("student") ? user.id : DEMO_STUDENT_UID;
  const isStudent = effRoles.includes("student");
  const physicsWork = nav.spaces.some((s) => s.modules.some((m) => m.id === "exam-lab"));
  const satSpace = nav.spaces.some((s) => s.modules.some((m) => m.id === "sat-today"));
  // Both reads at once: the open work (all students) and the SAT plan settings.
  const [work, satProfile] = await Promise.all([
    isStudent ? studentWork(planUid) : null,
    isStudent && satSpace ? satProfileOf(planUid) : undefined,
  ]);

  // Priority model (master prompt E1): 1 dominant continue-action, then
  // deadlines. Open allocations sort by due date; a missing due date sorts
  // last. Tasks fill in when no allocation is open.
  const openAllocs = work?.openAllocations ?? [];
  const openTasks = work?.openTasks ?? [];
  const heroAlloc = openAllocs[0] || null;
  const heroTask = heroAlloc ? null : openTasks[0] || null;
  // Labels by Pakistan calendar day: past the due instant → overdue; else
  // today / tomorrow / in N days.
  const todayPk = Date.parse(`${pkToday()}T00:00:00Z`);
  const fmtDue = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const days = Math.round((Date.parse(`${pkToday(d)}T00:00:00Z`) - todayPk) / 86400000);
    const when = formatPk(d, { weekday: "short", day: "numeric", month: "short" });
    if (d.getTime() < Date.now()) return `${when} · overdue`;
    return days <= 0 ? `${when} · today` : days === 1 ? `${when} · tomorrow` : `${when} · in ${days} days`;
  };
  const deadlines: { key: string; label: string; kind: string; due: string | null; href: string; overdue: boolean }[] = [
    ...openAllocs.map((a) => ({
      key: `al-${a.id}`,
      label: a.title,
      kind: a.mode === "test" ? "Test" : "Assignment",
      due: a.dueAt,
      href: `/portal/exam-lab?allocation=${encodeURIComponent(a.id)}`,
      overdue: !!a.dueAt && Date.parse(a.dueAt) < Date.now(),
    })),
    ...openTasks.map((t) => ({
      key: `tk-${t.id}`,
      label: t.title,
      kind: t.kind === "challenge" ? "Challenge" : "Task",
      due: t.dueAt,
      href: `/portal/tasks/${encodeURIComponent(t.id)}`,
      overdue: !!t.dueAt && Date.parse(t.dueAt) < Date.now(),
    })),
  ]
    .sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity))
    .slice(0, 4);

  // Each subject card's one line, from the work read above, and its course.
  const glances: Partial<Record<SubjectId, string | null>> = {};
  if (work && physicsWork) {
    const due = heroAlloc ? fmtDue(heroAlloc.dueAt) : null;
    glances.physics = heroAlloc
      ? `Next: ${heroAlloc.title}${due ? ` · due ${due}` : ""}`
      : planLine(work.plan?.openMandatory ?? 0) ?? "All caught up.";
  }
  if (isStudent && satSpace) glances.sat = satGlance(satProfile, pkToday());
  const courseLines: Partial<Record<SubjectId, string>> = {};
  for (const def of (viewer.courseAccess?.allowed ?? []).map((c) => courseOf(c))) {
    if (def?.code) courseLines[def.subject] = [courseLines[def.subject], courseShortLabel(def)].filter(Boolean).join(" · ");
  }

  // "Continue in Physics": the space last opened, or the only one.
  const rememberedId = (await cookies()).get(SPACE_COOKIE)?.value;
  const continueIn = nav.spaces.find((s) => s.id === rememberedId) ?? (nav.spaces.length === 1 ? nav.spaces[0] : null);
  // Where an all-caught-up student practises: their first space's practice page.
  const practice = nav.spaces
    .map((space) => ({ space, link: space.modules.find((m) => m.id === subjectOf(space.id)?.practice) }))
    .find((p) => p.link);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ice">Welcome{user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</h1>
        {continueIn ? (
          <Link href={continueIn.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-sm text-fog transition hover:border-cyan/40 hover:text-cyan">
            Continue in {continueIn.shortLabel} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <SubjectCards nav={nav} glances={glances} courses={courseLines} unavailable={viewer.subjectsUnavailable} emptyNote={isStudent} />

      {/* Up next — the dominant continue-action */}
      {heroAlloc ? (
        <a
          href={`/portal/exam-lab?allocation=${encodeURIComponent(heroAlloc.id)}`}
          className="group block rounded-3xl border-2 border-cyan/50 bg-gradient-to-br from-cyan/[0.14] to-space/70 p-6 transition hover:border-cyan md:p-8"
          data-tour="continue-hero"
        >
          <p className="eyebrow mb-1">{heroAlloc.mode === "test" ? "Your next test" : "Continue your work"}</p>
          <p className="font-display text-2xl font-semibold text-ice">{heroAlloc.title}</p>
          <p className="mt-2 text-sm text-fog">
            {heroAlloc.mode === "test" ? "Proctored test — read the rules before you begin." : "Assigned in Exam Lab."}
            {fmtDue(heroAlloc.dueAt) ? <span className={heroAlloc.dueAt && Date.parse(heroAlloc.dueAt) < Date.now() ? " text-signal" : " text-amber-300"}> · Due {fmtDue(heroAlloc.dueAt)}</span> : null}
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-abyss transition group-hover:gap-2.5">Start now <ArrowRight size={15} /></span>
        </a>
      ) : heroTask ? (
        <a
          href={heroTask.resourceUrl || `/portal/tasks/${encodeURIComponent(heroTask.id)}`}
          className="group block rounded-3xl border-2 border-cyan/50 bg-gradient-to-br from-cyan/[0.14] to-space/70 p-6 transition hover:border-cyan md:p-8"
          data-tour="continue-hero"
        >
          <p className="eyebrow mb-1">Next best action</p>
          <p className="font-display text-2xl font-semibold text-ice">{heroTask.title}</p>
          <p className="mt-2 text-sm text-fog">{heroTask.details?.slice(0, 140) || "Open the task for details."}{fmtDue(heroTask.dueAt) ? <span className="text-amber-300"> · Due {fmtDue(heroTask.dueAt)}</span> : null}</p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-abyss transition group-hover:gap-2.5">Open <ArrowRight size={15} /></span>
        </a>
      ) : isStudent ? (
        <div className="rounded-3xl border border-emerald2/30 bg-emerald2/5 p-6">
          <p className="flex items-center gap-2 text-lg font-semibold text-emerald2"><CheckCircle2 size={18} /> All caught up</p>
          <p className="mt-1 text-sm text-fog">No open assignments or tasks.{practice ? ` Practise in ${practice.space.label} to stay sharp.` : ""}</p>
          {practice?.link ? (
            <Link href={practice.link.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan">Open {practice.link.name} <ArrowRight size={14} /></Link>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-6">
          <p className="text-sm leading-relaxed text-fog">
            {effRoles.includes("parent")
              ? "Open My Children to follow attendance, results and progress."
              : "Your account and access rights are active."}
          </p>
        </div>
      )}

      {/* Coming up — the next deadlines after the one above */}
      {deadlines.length > 1 ? (
        <section className="rounded-2xl border border-white/10 bg-space/60 p-5" aria-label="Upcoming deadlines">
          <h2 className="mb-3 text-sm font-semibold text-ice">Coming up</h2>
          <ul className="space-y-2">
            {deadlines.slice(1).map((d) => (
              <li key={d.key}>
                <a href={d.href} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:border-cyan/40">
                  <span className="min-w-0 truncate text-fog">{d.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-dust">{d.kind}</span>
                    {d.due ? <span className={d.overdue ? "text-signal" : "text-amber-300"}>{fmtDue(d.due)}</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HomeGroups nav={nav} />
    </div>
  );
}
