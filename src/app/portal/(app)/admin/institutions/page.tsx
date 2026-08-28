import { redirect } from "next/navigation";
import { Building2, Users, Target, Activity, CalendarCheck, GraduationCap, TrendingUp, MessageCircle } from "lucide-react";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { getInstitutionReport, type StudentProgress } from "@/lib/portal/institutions";

export const metadata = { title: "Institutions — progress by school & class", robots: { index: false } };

function acc(a: number | null) {
  if (a == null) return "#7a8699";
  return a >= 75 ? "#12D48C" : a >= 55 ? "#3DE1F0" : a >= 40 ? "#FF7A2F" : "#F03Dce";
}
function fmtPct(v: number | null) {
  return v == null ? "—" : `${v}%`;
}
function ago(ts: number | null) {
  if (!ts) return "never";
  const d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dust">{icon}{label}</div>
      <div className="mt-0.5 font-display text-lg" style={{ color: color || "#E9EEF5" }}>{value}</div>
    </div>
  );
}

function waLink(num: string) {
  const digits = num.replace(/\D/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

function Avatar({ s }: { s: StudentProgress }) {
  const initials = (s.name || "?")
    .split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-void font-mono text-[10px] text-dust">
      {s.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

function StudentRow({ s }: { s: StudentProgress }) {
  const wa = s.whatsapp ? waLink(s.whatsapp) : null;
  return (
    <tr className="border-t border-white/[0.06]">
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2.5">
          <Avatar s={s} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm text-ice">{s.name}</span>
              {!s.onboarded && <span className="rounded-full border border-amber-400/40 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">onboarding</span>}
            </div>
            <div className="font-mono text-[10px] text-dust">{s.studentNo || s.email}</div>
          </div>
        </div>
      </td>
      <td className="py-2 pr-3 text-center">
        {s.whatsapp ? (
          wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald2 hover:underline">
              <MessageCircle size={11} /> {s.whatsapp}
            </a>
          ) : (
            <span className="font-mono text-[11px] text-fog">{s.whatsapp}</span>
          )
        ) : (
          <span className="font-mono text-[11px] text-dust">—</span>
        )}
      </td>
      <td className="py-2 pr-3 text-center font-mono text-xs" style={{ color: acc(s.accuracy) }}>{fmtPct(s.accuracy)}</td>
      <td className="py-2 pr-3 text-center font-mono text-xs text-fog">{s.attempts}</td>
      <td className="py-2 pr-3 text-center font-mono text-xs text-fog">L{s.level}</td>
      <td className="py-2 pr-3 text-center font-mono text-xs text-fog">{fmtPct(s.attendancePct)}</td>
      <td className="py-2 text-right font-mono text-[10px] text-dust">{ago(s.lastActive)}</td>
    </tr>
  );
}

export default async function InstitutionsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isStaff(user.roles)) redirect("/portal");

  const schools = await getInstitutionReport();
  const totalStudents = schools.reduce((s, x) => s + x.students, 0);
  const totalActive = schools.reduce((s, x) => s + x.activeStudents, 0);
  const totalAttempts = schools.reduce((s, x) => s + x.totalAttempts, 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><Building2 size={18} /></span>
        <div>
          <h1 className="font-display text-2xl text-ice">Institutions</h1>
          <p className="text-sm text-dust">Progress by school, class & section — and every student within.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Building2 size={12} />} label="Schools" value={String(schools.length)} />
        <Stat icon={<Users size={12} />} label="Students" value={String(totalStudents)} />
        <Stat icon={<Activity size={12} />} label="Active" value={String(totalActive)} color="#12D48C" />
        <Stat icon={<TrendingUp size={12} />} label="Attempts" value={String(totalAttempts)} color="#3DE1F0" />
      </div>

      {schools.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-dust">No schools registered yet.</p>
      )}

      <div className="space-y-8">
        {schools.map((sc) => (
          <section key={sc.school} className="rounded-2xl border border-white/10 bg-white/[0.015] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg text-ice"><GraduationCap size={18} className="text-cyan" /> {sc.school}</h2>
              <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-fog">{sc.students} students · {sc.activeStudents} active</span>
                <span className="rounded-full border px-2.5 py-0.5" style={{ borderColor: acc(sc.avgAccuracy) + "55", color: acc(sc.avgAccuracy) }}>avg {fmtPct(sc.avgAccuracy)}</span>
                <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-fog">attend {fmtPct(sc.avgAttendance)}</span>
              </div>
            </div>

            <div className="space-y-5">
              {sc.classes.map((cl) => (
                <div key={cl.id} className="rounded-xl border border-white/[0.08] bg-void/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-display text-sm text-ice">{cl.year}{cl.section ? ` · ${cl.section}` : ""} <span className="text-dust">· {cl.subject}</span></p>
                      <p className="font-mono text-[10px] text-dust">{cl.students.length} enrolled · {cl.onboardedPct}% onboarded</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Stat icon={<Target size={11} />} label="avg acc" value={fmtPct(cl.avgAccuracy)} color={acc(cl.avgAccuracy)} />
                      <Stat icon={<Activity size={11} />} label="active" value={`${cl.activeStudents}/${cl.students.length}`} />
                      <Stat icon={<TrendingUp size={11} />} label="attempts" value={String(cl.totalAttempts)} />
                      <Stat icon={<CalendarCheck size={11} />} label="attend" value={fmtPct(cl.avgAttendance)} />
                    </div>
                  </div>

                  {cl.students.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left">
                        <thead>
                          <tr className="font-mono text-[10px] uppercase tracking-widest text-dust">
                            <th className="pb-1 font-normal">Student</th>
                            <th className="pb-1 text-center font-normal">WhatsApp</th>
                            <th className="pb-1 text-center font-normal">Accuracy</th>
                            <th className="pb-1 text-center font-normal">Attempts</th>
                            <th className="pb-1 text-center font-normal">Level</th>
                            <th className="pb-1 text-center font-normal">Attend</th>
                            <th className="pb-1 text-right font-normal">Last active</th>
                          </tr>
                        </thead>
                        <tbody>{cl.students.map((s) => <StudentRow key={s.studentId || s.uid} s={s} />)}</tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-dust">No students enrolled yet.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
