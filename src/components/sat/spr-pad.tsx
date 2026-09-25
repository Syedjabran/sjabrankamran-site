"use client";
import { validateSPR, SPR_MAX_NEGATIVE } from "@/lib/sat/grade";

/** Grid-in answer box with the digital SAT's entry rules and a live preview. */
export function SprPad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const check = value ? validateSPR(value) : null;
  return (
    <div className="max-w-xs">
      <label className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-fog" htmlFor="spr">Your answer</label>
      <input
        id="spr" inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled}
        value={value} maxLength={SPR_MAX_NEGATIVE}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9./-]/g, ""))}
        className="w-full rounded-xl border border-white/15 bg-void px-4 py-3 font-mono text-lg text-ice focus:border-cyan focus:outline-none disabled:opacity-60"
      />
      <p className={"mt-1.5 text-xs " + (check && !check.ok ? "text-amber-200" : "text-dust")}>
        {check && !check.ok ? check.reason : "Up to 5 characters (6 if negative). Fractions like 3/2 or decimals like 1.5; no mixed numbers."}
      </p>
    </div>
  );
}
