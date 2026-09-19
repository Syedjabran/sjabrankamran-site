"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ImgQuestion } from "@/lib/exam-lab/image-bank";

type ClassChoice = { id: string; name: string; school: string };

/** Assign the paper on screen, not a recipe that would generate another paper. */
export function ClassDrillAssign({ questions, title, duration, onAssigned }: {
  questions: ImgQuestion[]; title: string; duration: number; onAssigned: (ref: string) => void;
}) {
  const preferredClass = useSearchParams().get("class");
  const [classes, setClasses] = useState<ClassChoice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ ref: string; students: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/portal/admin/classes").then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load classes.");
      if (alive) {
        const choices = j.classes.filter((c: ClassChoice & { active: boolean }) => c.active);
        setClasses(choices);
        if (preferredClass && choices.some((c: ClassChoice) => c.id === preferredClass)) setSelected([preferredClass]);
      }
    }).catch((e) => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [preferredClass]);

  async function assign() {
    setBusy(true); setError("");
    try {
      const labels = classes.filter((c) => selected.includes(c.id)).map((c) => c.name);
      const r = await fetch("/api/portal/admin/exam-allocate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_type: selected.length === 1 ? "class" : "group", class_ids: selected,
          scope_label: labels.join(", "), mode: "assignment_help", title,
          content: { type: "custom", ids: questions.map((q) => q.id) }, duration_min: duration, notify: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not assign the drill. Please retry.");
      setResult({ ref: j.drillRef, students: j.students }); onAssigned(j.drillRef);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <section className="el-noprint mb-4 rounded-xl border border-cyan/30 bg-space p-4">
    <h2 className="font-semibold text-ice">Conduct class / group drill</h2>
    <p className="mb-3 text-sm text-dust">Assign these exact {questions.length} questions in this order. Students open the drill from “Assigned to you” in Exam Lab. Your copy is saved there too.</p>
    {result ? <p role="status" className="text-emerald2">Assigned to {result.students} students · Reference {result.ref}. <a className="underline" href={`/portal/admin/drills/${result.ref}/print`}>Print / Save as PDF</a></p> : <>
      {loading ? <p>Loading your classes…</p> : !classes.length ? <p>No classes are mapped to your account. Ask an administrator to assign your class.</p> : <div className="mb-3 flex flex-wrap gap-3">
        {classes.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm text-fog">
          <input type="checkbox" disabled={busy} checked={selected.includes(c.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id))} />{c.name} · {c.school}
        </label>)}
      </div>}
      <button className="btn-primary" disabled={loading || busy || !selected.length} onClick={assign}>{busy ? "Assigning…" : "Assign this exact drill"}</button>
    </>}
    {error && <p role="alert" className="mt-2 text-signal">{error}</p>}
  </section>;
}
