"use client";
// The home's Today card (SAT Coach spec 7.4): today's plan work with Start
// or Resume -- and Move for a full exam dated today, which the student may
// still move (spec 6.4, "today or later") -- the last few missed sessions
// that can still be done late, the streak and the countdown to the SAT.
// coach-home.tsx owns the calls.
import { useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import type { PlanItem, SATPlanView } from "@/lib/sat/client-types";
import { formatPkDay } from "@/lib/portal/pk-time";
import { PlanItemRow } from "./plan-item-row";
import { MoveButton, MoveEditor, canMove, moveNote, type MoveFn } from "./move-editor";

function countdown(plan: SATPlanView): string | null {
  const days = plan.daysToExam;
  if (days === null || days < 0 || !plan.horizonEnd) return null;
  if (!plan.examDate) {
    const month = formatPkDay(plan.horizonEnd, { month: "long", year: "numeric" });
    return days === 0 ? `${month} starts today` : `${days} ${days === 1 ? "day" : "days"} to ${month}`;
  }
  if (days === 0) return "Your SAT is today";
  return `${days} ${days === 1 ? "day" : "days"} to your SAT`;
}

/** `busyId`: the item being started (its spinner); while set, every Start waits. */
function TodayAction({ item, busyId, onStart, onOpen }: { item: PlanItem; busyId: string | null; onStart: (item: PlanItem) => void; onOpen: (sessionId: string) => void }) {
  if (item.kind === "exam") return null;
  const finished = item.status === "done" || item.status === "late";
  if (item.sessionId) {
    const sessionId = item.sessionId;
    return finished
      ? <button onClick={() => onOpen(sessionId)} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Report</button>
      : <button onClick={() => onOpen(sessionId)} className="btn-primary shrink-0 !px-3 !py-1.5 text-xs">Resume</button>;
  }
  if (finished) return null;
  return (
    <button disabled={busyId !== null} onClick={() => onStart(item)} className="btn-primary shrink-0 !px-3 !py-1.5 text-xs disabled:opacity-40">
      {busyId === item.id ? <Loader2 size={14} className="animate-spin" /> : "Start"}
    </button>
  );
}

function NothingToday({ plan }: { plan: SATPlanView }) {
  const next = plan.upcoming.find((i) => i.kind !== "exam");
  return (
    <p className="mt-3 text-sm text-fog">
      Nothing on your plan today.{next ? ` Next up: ${formatPkDay(next.date)}.` : ""}
    </p>
  );
}

export function TodayCard({ plan, today, busyId, onStart, onOpen, onMove }: {
  plan: SATPlanView;
  today: string;
  busyId: string | null;
  onStart: (item: PlanItem) => void;
  onOpen: (sessionId: string) => void;
  onMove: MoveFn;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const left = countdown(plan);
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-lg text-ice">Today</h2>
        {left ? <p className="font-display text-sm text-cyan">{left}</p> : null}
      </div>
      {plan.streak > 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-fog">
          <Flame size={14} aria-hidden className="text-amber-200" />
          {plan.streak} {plan.streak === 1 ? "session" : "sessions"} done on the day, in a row
        </p>
      ) : null}
      {plan.today.length ? (
        <ul className="mt-3 space-y-2">
          {plan.today.map((item) => {
            const movable = canMove(item, plan);
            const open = editing === item.id;
            return (
              <PlanItemRow
                key={item.id} item={item} showDate={item.date !== today}
                note={item.status === "missed" && !item.sessionId ? "you can still do it" : moveNote(item)}
                action={
                  <>
                    <TodayAction item={item} busyId={busyId} onStart={onStart} onOpen={onOpen} />
                    {movable && !open ? <MoveButton onClick={() => setEditing(item.id)} /> : null}
                  </>
                }
              >
                {movable && open ? <MoveEditor item={item} plan={plan} today={today} onMove={onMove} onClose={() => setEditing(null)} /> : null}
              </PlanItemRow>
            );
          })}
        </ul>
      ) : <NothingToday plan={plan} />}
    </section>
  );
}
