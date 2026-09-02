"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Users, RefreshCw } from "lucide-react";

type Student = { name: string; status: string };
type ClassRow = {
  classId: string;
  className: string;
  section: string | null;
  year: string;
  total: number;
  marked: number;
  present: number;
  late: number;
  online: number;
  absent: number;
  excused: number;
  students: Student[];
};
type Payload = {
  date: string;
  school: string | null;
  canChooseSchool: boolean;
  schools: string[];
  register: ClassRow[];
  error?: string;
};

const STATUS_STYLE: Record<string, string> = {
  present: "border-emerald2/40 bg-emerald2/10 text-emerald2",
  online: "border-cyan/40 bg-cyan/10 text-cyan",
  late: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  excused: "border-white/20 bg-white/5 text-fog",
  absent: "border-signal/40 bg-signal/10 text-signal",
  unmarked: "border-white/10 bg-white/[0.02] text-dust",
};
const STATUS_LABEL: Record<string, string> = {
  present: "Present", online: "Online", late: "Late", excused: "Excused", absent: "Absent", unmarked: "Not marked",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceView() {
  const [date, setDate] = useState(todayISO());
  const [school, setSchool] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ date });
      if (school) qs.set("school", school);
      const r = await fetch(`/api/portal/registrar/attendance?${qs.toString()}`);
      const j = (await r.json()) as Payload;
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, school]);

  useEffect(() => { load(); }, [load]);

  const totals = (data?.register || []).reduce(
    (t, c) => ({
      present: t.present + c.present + c.online,
      late: t.late + c.late,
      absent: t.absent + c.absent,
      total: t.total + c.total,
    }),
    { present: 0, late: 0, absent: 0, total: 0 }
  );

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><CalendarCheck size={18} /></span>
        <div>
          <h1 className="font-display text-2xl text-ice">Daily attendance</h1>
          <p className="text-sm text-dust">
            Who attended class{data?.school ? <> — <b className="text-fog">{data.school}</b></> : null}. View only.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-dust">
          <span className="mb-1 block uppercase tracking-widest">Date</span>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-abyss/60 px-3 py-1.5 text-sm text-ice focus:border-cyan focus:outline-none" />
        </label>
        {data?.canChooseSchool ? (
          <label className="text-xs text-dust">
            <span className="mb-1 block uppercase tracking-widest">School</span>
            <select value={school} onChange={(e) => setSchool(e.target.value)}
              className="min-w-[12rem] rounded-lg border border-white/10 bg-abyss/60 px-3 py-1.5 text-sm text-ice focus:border-cyan focus:outline-none">
              <option value="">All schools</option>
              {data.schools.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        ) : null}
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-fog hover:border-cyan/40 hover:text-cyan">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {err ? <p className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-fog">{err}</p> : null}

      {data && !err ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["Attended", totals.present, "#12D48C"], ["Late", totals.late, "#F5C451"], ["Absent", totals.absent, "#F03Dce"], ["On roster", totals.total, "#E9EEF5"]] as [string, number, string][]).map(([k, v, c]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
                <div className="font-mono text-[10px] uppercase tracking-widest text-dust">{k}</div>
                <div className="mt-0.5 font-display text-lg" style={{ color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {data.register.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-dust">No classes found for this school.</p>
          ) : (
            <div className="space-y-5">
              {data.register.map((cl) => (
                <section key={cl.classId} className="rounded-2xl border border-white/10 bg-white/[0.015] p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-display text-base text-ice">
                      <Users size={16} className="text-cyan" /> {cl.className}
                    </h2>
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                      <span className="rounded-full border border-emerald2/30 px-2.5 py-0.5 text-emerald2">{cl.present + cl.online} attended</span>
                      {cl.late ? <span className="rounded-full border border-amber-400/30 px-2.5 py-0.5 text-amber-300">{cl.late} late</span> : null}
                      {cl.absent ? <span className="rounded-full border border-signal/30 px-2.5 py-0.5 text-signal">{cl.absent} absent</span> : null}
                      <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-dust">{cl.marked}/{cl.total} marked</span>
                    </div>
                  </div>

                  {cl.total === 0 ? (
                    <p className="text-xs text-dust">No students enrolled.</p>
                  ) : cl.marked === 0 ? (
                    <p className="text-xs text-dust">Attendance for this date has not been marked yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {cl.students.map((s, i) => (
                        <span key={i} className={"inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs " + (STATUS_STYLE[s.status] || STATUS_STYLE.unmarked)}>
                          {s.name} <span className="font-mono text-[10px] opacity-80">· {STATUS_LABEL[s.status] || s.status}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
