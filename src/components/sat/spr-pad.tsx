"use client";
import { useId, useState } from "react";
import { validateSPR, SPR_MAX_NEGATIVE } from "@/lib/sat/grade";
import { mixedNumberWarning, nextTypedSPR, sprAnswerPreview, stripSPR } from "./sat-runner-utils";

/** Grid-in answer box with the digital SAT's entry rules and a live answer
 *  preview. Like Bluebook, the box keeps only digits, ".", "/" and "-", so a
 *  typed "1 1/2" is graded as 11/2 -- the preview shows that, and a warning
 *  quoting what the student typed explains it. */
export function SprPad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  // What the student typed, whitespace included (the box drops a space the
  // moment it's typed). A value changed from outside -- another question, a
  // server re-sync -- no longer matches it, and wins.
  const [typed, setTyped] = useState(value);
  const current = stripSPR(typed) === value ? typed : value;
  const check = value ? validateSPR(value) : null;
  const message = mixedNumberWarning(current) ?? (check && !check.ok ? check.reason : null);
  const preview = sprAnswerPreview(value);
  return (
    <div className="max-w-xs">
      <label className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-fog" htmlFor={id}>Your answer</label>
      <input
        id={id} inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled}
        value={value} maxLength={SPR_MAX_NEGATIVE}
        onChange={(e) => {
          setTyped(nextTypedSPR(current, e.target.value, e.target.selectionEnd));
          onChange(stripSPR(e.target.value));
        }}
        className="w-full rounded-xl border border-white/15 bg-void px-4 py-3 font-mono text-lg text-ice focus:border-cyan focus:outline-none disabled:opacity-60"
      />
      {preview ? <p className="mt-1.5 text-xs text-fog">Answer preview: <span className="font-mono text-ice">{preview}</span></p> : null}
      <p className={"mt-1.5 text-xs " + (message ? "text-amber-200" : "text-dust")}>
        {message ?? "Up to 5 characters (6 if negative). Fractions like 3/2 or decimals like 1.5; no mixed numbers."}
      </p>
    </div>
  );
}
