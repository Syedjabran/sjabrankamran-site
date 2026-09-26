"use client";
// The home's Your plan card (SAT Coach spec 6.4 / 7.4): the next 14 days day
// by day, then any full exams further out. A full exam the student may still
// move shows "Move" (move-editor.tsx).
import { useMemo, useState } from "react";
import type { PlanItem, SATPlanView } from "@/lib/sat/client-types";
import { formatPkDay } from "@/lib/portal/pk-time";
import { addDays } from "@/lib/sat/coach/planner";
import { PlanItemRow } from "./plan-item-row";
import { MoveButton, MoveEditor, canMove, moveNote, type MoveFn } from "./move-editor";

const WINDOW_DAYS = 14;

function ItemRow({ item, plan, today, showDate, editing, setEditing, onMove }: {
  item: PlanItem; plan: SATPlanView; today: string; showDate: boolean;
  editing: string | null; setEditing: (id: string | null) => void; onMove: MoveFn;
}) {
  const open = editing === item.id;
  return (
    <PlanItemRow
      item={item} showDate={showDate} note={moveNote(item)}
      action={canMove(item, plan) && !open ? <MoveButton onClick={() => setEditing(item.id)} /> : null}
    >
      {open ? <MoveEditor item={item} plan={plan} today={today} onMove={onMove} onClose={() => setEditing(null)} /> : null}
    </PlanItemRow>
  );
}

export function PlanCard({ plan, today, onMove }: { plan: SATPlanView; today: string; onMove: MoveFn }) {
  const [editing, setEditing] = useState<string | null>(null);
  const days = useMemo(() => {
    const byDay = new Map<string, PlanItem[]>();
    for (const item of plan.upcoming) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
    return [...byDay.entries()];
  }, [plan.upcoming]);
  const later = useMemo(() => {
    const last = addDays(today, WINDOW_DAYS);
    return plan.fullExams.filter((i) => i.date > last);
  }, [plan.fullExams, today]);
  const rowProps = { plan, today, editing, setEditing, onMove };

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-space/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-lg text-ice">Your plan</h2>
        <span className="text-xs text-dust">Next {WINDOW_DAYS} days</span>
      </div>
      {days.length ? (
        <div className="mt-3 space-y-4">
          {days.map(([day, items]) => (
            <div key={day} className="min-w-0 space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-dust">{formatPkDay(day)}</h3>
              <ul className="space-y-2">
                {items.map((item) => <ItemRow key={item.id} item={item} showDate={false} {...rowProps} />)}
              </ul>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-fog">Nothing scheduled in the next {WINDOW_DAYS} days.</p>}
      {later.length ? (
        <div className="mt-5 min-w-0 space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-dust">Later full exams</h3>
          <ul className="space-y-2">
            {later.map((item) => <ItemRow key={item.id} item={item} showDate {...rowProps} />)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
