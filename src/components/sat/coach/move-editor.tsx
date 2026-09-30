"use client";
// Moving a full exam (SAT Coach spec 6.4), shared by the home's Today card
// (an exam dated today) and Your plan card: a "Move" button, the "moves
// left" note, and the inline day picker bounded by the move rules. The pick
// is checked here with the planner's own checkMove -- the same sentences the
// server answers with -- before the server re-checks it.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { PlanItem, SATPlanView } from "@/lib/sat/client-types";
import { addDays, checkMove } from "@/lib/sat/coach/planner";
import { isMovable, movesLeft } from "@/lib/sat/coach/plan-moves";
import { FIELD } from "./field-class";

/** Moves `itemId` to `date`; resolves to the error sentence, or null when done. */
export type MoveFn = (itemId: string, date: string) => Promise<string | null>;

/** Whether `item` shows a Move control in this plan (a movable exam, and a
 *  plan with an end date to count back from). */
export function canMove(item: PlanItem, plan: SATPlanView): boolean {
  return isMovable(item) && plan.horizonEnd !== null;
}

/** The row note for a movable exam; nothing for anything else. */
export function moveNote(item: PlanItem): string | undefined {
  return isMovable(item) ? `moves left: ${movesLeft(item)}` : undefined;
}

export function MoveButton({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Move</button>;
}

export function MoveEditor({ item, plan, today, onMove, onClose }: { item: PlanItem; plan: SATPlanView; today: string; onMove: MoveFn; onClose: () => void }) {
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
