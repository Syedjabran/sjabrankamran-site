"use client";
// The coach part of the SAT Lab home (SAT Coach spec 7.4), for a student
// with an SAT profile: Today, Your plan and This week's goals from one GET
// /api/sat/coach, then Coach says from GET /api/sat/coach/insights -- asked
// for only once the plan is showing, so the plan never waits on the AI (a
// skeleton holds its place meanwhile). Starting today's work, moving a full
// exam and "Drill this" are one tap each, and one start at a time. When the
// SAT date has gone by, a card asks how it went instead of the plan (not
// booked: once the target month is here, it asks for a date or a new month).
// Every visit loads fresh (nothing is cached in the browser), and a tab left
// in the background refreshes when it comes back -- a drill finished in
// another tab shows here too; the card on screen stays until the new one
// arrives ("Updating…"). The server regenerates Coach says only when the
// student's finished work, plan or day changed, so an idle refresh is free.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SkeletonCard } from "@/components/portal-skeletons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DRILL_COUNT_DEFAULT, type CoachInsightsPayload, type CoachPayload, type InsightsView, type PlanItem } from "@/lib/sat/client-types";
import { CoachSays, CoachSaysSkeleton } from "./coach-says";
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

/** The plan has run out. Booked: the SAT date has passed, so ask how it
 *  went. Not booked: the plan ran to the target month's first day, which is
 *  usually before the real SAT -- ask for a date or a later month instead. */
function HorizonPassed({ booked }: { booked: boolean }) {
  if (!booked) {
    return (
      <section className="min-w-0 rounded-2xl border border-cyan/30 bg-space/60 p-5">
        <h2 className="font-display text-lg text-ice">Your target month is here — book your SAT date or pick a new month.</h2>
        <p className="mt-2 text-sm text-fog">Set your SAT date once it&rsquo;s booked for a plan that counts down to it, or choose a later month to keep practising.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/portal/sat-lab/settings#sat-when" className="btn-primary !px-4 !py-2 text-sm">Set your SAT date or month</Link>
        </div>
      </section>
    );
  }
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

// A tab hidden at least this long refreshes the coach when it is shown again.
const REFRESH_AFTER_HIDDEN_MS = 10_000;

export function CoachHome() {
  const router = useRouter();
  const [data, setData] = useState<CoachPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightsView | null>(null);
  const [insightsState, setInsightsState] = useState<"loading" | "ready" | "failed">("loading");
  // Coach says is being fetched again while a view is on screen.
  const [updating, setUpdating] = useState(false);
  const refreshing = useRef(false);
  // Every load is numbered: only the latest one's answer is shown (an older
  // one landing late is dropped), and "Updating…" stays until the latest
  // Coach says request has answered.
  const coachSeq = useRef(0);
  const insightsSeq = useRef(0);

  // Coach says is optional: a failure hides the card (a view already shown stays).
  async function loadInsights() {
    const mine = ++insightsSeq.current;
    setUpdating(true);
    try {
      const res = await fetch("/api/sat/coach/insights", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const view = ((await res.json()) as CoachInsightsPayload).insights;
      if (mine !== insightsSeq.current) return;
      setInsights(view);
      setInsightsState("ready");
    } catch {
      if (mine === insightsSeq.current) setInsightsState((state) => (state === "ready" ? state : "failed"));
    } finally {
      if (mine === insightsSeq.current) setUpdating(false);
    }
  }

  /** Today, the plan and the goals; then Coach says. Resolves once the plan
   *  is in (null when it failed or a newer load took over); `insights`
   *  settles once Coach says has answered too. */
  async function load(): Promise<{ insights: Promise<void> } | null> {
    const mine = ++coachSeq.current;
    setLoadError(null);
    try {
      const res = await fetch("/api/sat/coach", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Your plan couldn't be loaded — retry.");
      if (mine !== coachSeq.current) return null;
      setData(j as CoachPayload);
    } catch (e) {
      if (mine === coachSeq.current) setLoadError((e as Error).message);
      return null;
    }
    return { insights: loadInsights() };
  }
  useEffect(() => { void load(); }, []);

  // Back to this tab after a while (or restored from the browser's
  // back/forward cache): refresh Today, the plan, the goals and Coach says,
  // keeping what is on screen until the new data lands.
  useEffect(() => {
    async function refresh() {
      if (refreshing.current) return;
      refreshing.current = true;
      // Held until Coach says has answered too, so one return to the tab
      // is one refresh.
      try {
        const started = await load();
        if (started) await started.insights;
      } finally {
        refreshing.current = false;
      }
    }
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= REFRESH_AFTER_HIDDEN_MS) void refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only uses state setters; listen once
  }, []);

  async function begin(key: string, url: string, body: unknown) {
    if (busyId) return;
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
  if (!data) return <SkeletonCard className="h-64" label="your plan" />;

  return (
    <div className="space-y-6">
      {actionError ? <Notice>{actionError}</Notice> : null}
      {data.horizonPassed ? <HorizonPassed booked={data.profile.examDate !== null} /> : data.plan ? (
        <>
          <TodayCard plan={data.plan} today={data.today} busyId={busyId} onStart={start} onOpen={(id) => router.push(`/portal/sat-lab/${id}`)} onMove={move} />
          <PlanCard plan={data.plan} today={data.today} onMove={move} />
        </>
      ) : (
        <Notice>{data.planError ?? "Your plan couldn't be loaded — retry."} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></Notice>
      )}
      {data.goals.length ? <GoalsCard goals={data.goals} /> : null}
      {insights ? <CoachSays view={insights} onDrill={drill} busy={busyId !== null} updating={updating} /> : insightsState === "loading" ? <CoachSaysSkeleton /> : null}
    </div>
  );
}
