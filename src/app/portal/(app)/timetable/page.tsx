import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Clock3, ExternalLink, School, Sparkles } from "lucide-react";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { timetableForUid, WEEKDAY } from "@/lib/portal/timetable";

export const metadata = { title: "Physics timetable" };
export const dynamic = "force-dynamic";

function time(t: string | null) {
  if (!t) return "Time to be confirmed";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, h, m)));
}

export default async function TimetablePage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const data = await timetableForUid(user.id, user.roles);
  const grouped = new Map<number, typeof data.slots>();
  for (const slot of data.slots) grouped.set(slot.weekday, [...(grouped.get(slot.weekday) || []), slot]);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ice"><CalendarClock size={22} className="text-cyan" /> Physics timetable</h1>
          <p className="mt-1 max-w-2xl text-sm text-fog">
            {isAdmin(user.roles)
              ? "Syed Jabran Ali Kamran · Super Admin / CEO · Head of sjabrankamran.com Physics World — all schools timetable."
              : "Your timetable is filtered automatically by your assigned school, class, level and group."}
          </p>
          <p className="mt-1 text-xs text-dust">All times are Pakistan Standard Time (Asia/Karachi).</p>
        </div>
        <Link href="/portal/notifications" className="inline-flex items-center gap-2 rounded-xl border border-cyan/30 px-3.5 py-2 text-xs text-cyan hover:bg-cyan/10">
          <ExternalLink size={13} /> Alerts &amp; Google Calendar
        </Link>
      </div>

      {!data.slots.length ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-7 text-center">
          <School className="mx-auto text-amber-300" size={28} />
          <h2 className="mt-3 text-lg font-semibold text-ice">No timetable assigned yet</h2>
          <p className="mt-1 text-sm text-fog">Ask an administrator to confirm your active school, class, level and group assignment.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((day) => {
            const slots = grouped.get(day) || [];
            if (!slots.length) return null;
            return (
              <section key={day} className="overflow-hidden rounded-2xl border border-white/10 bg-space/60">
                <h2 className="border-b border-white/10 px-5 py-3 font-display text-sm font-semibold text-ice">{WEEKDAY[day]}</h2>
                <ul className="divide-y divide-white/[0.06]">
                  {slots.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 px-5 py-3.5">
                      <Clock3 size={15} className="mt-0.5 shrink-0 text-cyan" />
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-ice">{time(s.startsAt)}–{time(s.endsAt)}</p>
                        <p className="mt-0.5 text-sm text-fog">{s.classMeta.school}</p>
                        <p className="text-xs text-dust">{s.classMeta.year}{s.classMeta.section ? ` · Group ${s.classMeta.section}` : ""} · {s.classMeta.subject}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-magenta/25 bg-magenta/[0.04] p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><Sparkles size={15} className="text-magenta" /> Extra and rescheduled classes</h2>
        {data.extras.length ? (
          <ul className="mt-3 space-y-2">
            {data.extras.map((x) => (
              <li key={x.id} className="rounded-xl border border-white/10 bg-space/60 px-4 py-3 text-sm text-fog">
                <b className="text-ice">{x.lessonDate} · {time(x.startsAt)}{x.endsAt ? `–${time(x.endsAt)}` : ""}</b>
                <span className="block text-xs text-dust">{x.classMeta.school} · {x.classMeta.year}{x.classMeta.section ? ` · ${x.classMeta.section}` : ""}{x.title ? ` · ${x.title}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-dust">No extra classes are currently scheduled. New sessions will appear here and in Notifications.</p>}
      </section>
    </div>
  );
}
