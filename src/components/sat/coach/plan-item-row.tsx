"use client";
// One study-plan item as a row (SAT Coach Task 9), shared by the home's
// Today and Your plan cards: what it is, its size or kind, its day when
// that isn't obvious, a status badge, and whatever action the card offers.
import type { ReactNode } from "react";
import { Compass, GraduationCap, RotateCcw, Target, Timer, type LucideIcon } from "lucide-react";
import { planItemTitle, type PlanItem } from "@/lib/sat/client-types";
import { formatPkDay } from "@/lib/portal/pk-time";

const ICON: Record<PlanItem["kind"], LucideIcon> = { diagnostic: Compass, challenge: Target, review: RotateCcw, mock: Timer, exam: GraduationCap };

function detailOf(item: PlanItem, showDate: boolean): string {
  const what = item.kind === "exam" ? "Good luck!" : item.kind === "mock" ? "Full exam, timed" : item.size ? `${item.size} questions` : "Practice session";
  return showDate ? `${formatPkDay(item.date)} · ${what}` : what;
}

function StatusBadge({ status }: { status: PlanItem["status"] }) {
  if (status === "scheduled") return null;
  const look = {
    done: "border-emerald2/30 text-emerald2",
    late: "border-amber-400/30 text-amber-200",
    missed: "border-signal/30 text-signal",
  }[status];
  const label = { done: "Done", late: "Done late", missed: "Missed" }[status];
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${look}`}>{label}</span>;
}

export function PlanItemRow({ item, showDate = false, note, action, children }: {
  item: PlanItem;
  showDate?: boolean;
  note?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = ICON[item.kind];
  return (
    <li className="min-w-0 rounded-xl border border-white/10 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
        <Icon size={16} aria-hidden className="shrink-0 text-cyan" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ice">{planItemTitle(item)}</p>
          <p className="truncate text-xs text-dust">{detailOf(item, showDate)}{note ? ` · ${note}` : ""}</p>
        </div>
        <StatusBadge status={item.status} />
        {action}
      </div>
      {children}
    </li>
  );
}
