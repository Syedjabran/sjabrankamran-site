"use client";
// The home's Your plan card (SAT Coach spec 6.4 / 7.4): the next 14 days day
// by day, then any full exams further out. A full exam the student may still
// move shows "Move": an inline day picker bounded by the move rules, checked
// here with the planner's own checkMove (the same sentences the server
// answers with) before the server re-checks it.
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PlanItem, SATPlanView } from "@/lib/sat/client-types";
import { formatPkDay } from "@/lib/portal/pk-time";
import { MAX_MOCK_MOVES, addDays, checkMove } from "@/lib/sat/coach/planner";
import { PlanItemRow } from "./plan-item-row";
import { FIELD } from "./field-class";

const WINDOW_DAYS = 14;

type MoveFn = (itemId: string, date: string) => Promise<string | null>;

const movesLeft = (item: PlanItem) => MAX_MOCK_MOVES - (item.moves?.length ?? 0);
const movable = (item: PlanItem) => item.kind === "mock" && item.status === "scheduled" && !item.sessionId && movesLeft(item) > 0;

function MoveEditor({ item, plan, today, onMove, onClose }: { item: PlanItem; plan: SATPlanView; today: string; onMove: MoveFn; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exam = plan.horizonEnd;
  if (!exam) return null;
  const left = movesLeft(item);

  async function save() {
    if (!exam) return;
    const check = checkMove(plan.fullExams, item.id, date, today, exam);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onMove(item.id, date);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-end gap-2">
      <label className="block min-w-0 text-xs text-fog">
        Move to
        <input type="date" value={date} min={today} max={addDays(exam, -2)} onChange={(e) => { setDate(e.target.value); setError(null); }} className={FIELD} />
      </label>
      <button disabled={!date || busy} onClick={() => void save()} className="btn-primary !px-3 !py-2 text-xs disabled:opacity-40">
        {busy ? <Loader2 size={14} className="animate-spin" /> : "Move"}
      </button>
      <button onClick={onClose} className="btn-ghost !px-3 !py-2 text-xs">Cancel</button>
      <p className="w-full text-xs text-dust">
        {left === 1 ? "This is its last move." : `You can move it ${left} more times.`} Pick today or later, at least 2 days before your SAT, on a day without another full exam.
      </p>
      {error ? <p role="alert" className="w-full text-sm text-signal">{error}</p> : null}
    </div>
  );
}

function ItemRow({ item, plan, today, showDate, editing, setEditing, onMove }: {
  item: PlanItem; plan: SATPlanView; today: string; showDate: boolean;
  editing: string | null; setEditing: (id: string | null) => void; onMove: MoveFn;
}) {
  const canMove = movable(item) && plan.horizonEnd !== null;
  const note = item.kind === "mock" && item.status === "scheduled" ? `moves left: ${movesLeft(item)}` : undefined;
  const open = editing === item.id;
  return (
    <PlanItemRow
      item={item} showDate={showDate} note={note}
      action={canMove && !open ? <button onClick={() => setEditing(item.id)} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Move</button> : null}
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
