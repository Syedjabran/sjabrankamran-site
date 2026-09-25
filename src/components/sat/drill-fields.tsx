"use client";
import { DOMAIN_LABEL, DOMAIN_SECTIONS, DRILL_COUNT_MAX, DRILL_COUNT_MIN } from "@/lib/sat/client-types";

// String-literal unions kept local (not imported from lib/sat/types.ts) so
// this client component never reaches past client-types.ts into the
// answer-key-carrying side of src/lib/sat/.
export type SectionFilter = "" | "rw" | "math";
export type DifficultyFilter = "" | "E" | "M" | "H";

const FIELD = "mt-1 w-full min-w-0 rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-ice focus:border-cyan focus:outline-none";

/**
 * The four drill-filter inputs (section, domain, difficulty, question
 * count) -- one shared component so the hub's own "Start drill" form and
 * the staff Assign panel's drill fields can never drift apart (fix round
 * 1 dedupe ruling). Renders as a fragment: the caller supplies its own grid
 * wrapper, since the two call sites use different column counts.
 */
export function DrillFields({
  section, domain, difficulty, count,
  onSectionChange, onDomainChange, onDifficultyChange, onCountChange,
  labelClassName = "block min-w-0 text-xs text-fog",
  disabled = false,
}: {
  section: SectionFilter;
  domain: string;
  difficulty: DifficultyFilter;
  count: number;
  onSectionChange: (v: SectionFilter) => void;
  onDomainChange: (v: string) => void;
  onDifficultyChange: (v: DifficultyFilter) => void;
  onCountChange: (v: number) => void;
  labelClassName?: string;
  // Fix round 2 finding 6: a send in flight (the staff Assign panel) locks
  // every field, these four included, so nothing about the payload can
  // change out from under a request that's already on the wire.
  disabled?: boolean;
}) {
  const domainOptions = DOMAIN_SECTIONS.filter((d) => !section || d.section === section);

  return (
    <>
      <label className={labelClassName}>
        Section
        <select
          value={section}
          // Switching section clears domain too -- the old domain may no
          // longer be one of the options shown (and, since fix round 1,
          // the server rejects a domain that isn't part of the section).
          onChange={(e) => { onSectionChange(e.target.value as SectionFilter); onDomainChange(""); }}
          disabled={disabled}
          className={FIELD}
        >
          <option value="">Any</option>
          <option value="rw">Reading and Writing</option>
          <option value="math">Math</option>
        </select>
      </label>
      <label className={labelClassName}>
        Domain
        <select value={domain} onChange={(e) => onDomainChange(e.target.value)} disabled={disabled} className={FIELD}>
          <option value="">Any domain</option>
          {domainOptions.map((d) => <option key={d.value} value={d.value}>{DOMAIN_LABEL[d.value] ?? d.value}</option>)}
        </select>
      </label>
      <label className={labelClassName}>
        Difficulty
        <select value={difficulty} onChange={(e) => onDifficultyChange(e.target.value as DifficultyFilter)} disabled={disabled} className={FIELD}>
          <option value="">Any</option>
          <option value="E">Easy</option>
          <option value="M">Medium</option>
          <option value="H">Hard</option>
        </select>
      </label>
      <label className={labelClassName}>
        Questions
        <input
          type="number" min={DRILL_COUNT_MIN} max={DRILL_COUNT_MAX} step={1} value={count}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            onCountChange(Number.isFinite(n) ? Math.min(DRILL_COUNT_MAX, Math.max(DRILL_COUNT_MIN, n)) : DRILL_COUNT_MIN);
          }}
          disabled={disabled}
          className={FIELD}
        />
      </label>
    </>
  );
}
