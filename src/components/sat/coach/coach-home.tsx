"use client";
// The coach part of the SAT Lab home (SAT Coach spec 7.4), for a student
// with an SAT profile: Today, Your plan, This week's goals and Coach says,
// from one GET /api/sat/coach. Starting today's work, moving a full exam and
// "Drill this" are one tap each. When the SAT date has gone by, a card asks
// how it went instead of showing the plan.
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DRILL_COUNT_DEFAULT, type CoachPayload, type PlanItem } from "@/lib/sat/client-types";
import { CoachSays } from "./coach-says";
import { GoalsCard } from "./goals-card";
import { PlanCard } from "./plan-card";
import { TodayCard } from "./today-card";

/** POST JSON; the parsed reply, or an Error carrying the server's sentence. */
async function postJson(url: string, body: unknown, fallback: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : fallback);
  return j;
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">{children}</div>;
}

function ExamPassed() {
  return (
    <section className="min-w-0 rounded-2xl border border-cyan/30 bg-space/60 p-5">
      <h2 className="font-display text-lg text-ice">Your SAT date has passed — how did it go?</h2>
      <p className="mt-2 text-sm text-fog">Add your score so the coach knows where you stand, or set the date of your next SAT to get a new plan.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/portal/sat-lab/settings#sat-start" className="btn-primary !px-4 !py-2 text-sm">Add your score</Link>
        <Link href="/portal/sat-lab/settings#sat-when" className="btn-ghost !px-4 !py-2 text-sm">Set a new date</Link>
      </div>
    </section>
  );
}

export function CoachHome() {
  const router = useRouter();
  const [data, setData] = useState<CoachPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/sat/coach", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Your plan couldn't be loaded — retry.");
      setData(j as CoachPayload);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  async function begin(key: string, url: string, body: unknown) {
    setBusyId(key);
    setActionError(null);
    try {
      const j = await postJson(url, body, "It couldn't be started. Please try again.");
      router.push(`/portal/sat-lab/${String(j.id)}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusyId(null);
    }
  }

  const start = (item: PlanItem) => void begin(item.id, "/api/sat/plan/start", { itemId: item.id });
  const drill = (skill: string) => void begin(`drill-${skill}`, "/api/sat/sessions", { kind: "drill", filter: { skill }, count: DRILL_COUNT_DEFAULT });

  async function move(itemId: string, date: string): Promise<string | null> {
    try {
      await postJson("/api/sat/plan/move", { itemId, date }, "The full exam couldn't be moved. Please try again.");
    } catch (e) {
      return (e as Error).message;
    }
    await load();
    return null;
  }

  if (loadError && !data) {
    return <Notice>{loadError} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></Notice>;
  }
  if (!data) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading your plan…</p>;

  return (
    <div className="space-y-6">
      {actionError ? <Notice>{actionError}</Notice> : null}
      {data.horizonPassed ? <ExamPassed /> : data.plan ? (
        <>
          <TodayCard plan={data.plan} today={data.today} busyId={busyId} onStart={start} onOpen={(id) => router.push(`/portal/sat-lab/${id}`)} />
          <PlanCard plan={data.plan} today={data.today} onMove={move} />
        </>
      ) : (
        <Notice>{data.planError ?? "Your plan couldn't be loaded — retry."} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></Notice>
      )}
      {data.goals.length ? <GoalsCard goals={data.goals} /> : null}
      {data.insights ? <CoachSays view={data.insights} onDrill={drill} /> : null}
    </div>
  );
}
