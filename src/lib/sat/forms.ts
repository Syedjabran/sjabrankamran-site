// src/lib/sat/forms.ts
//
// Assemble an adaptive mock to the real digital blueprint (spec 7).
//
// The official papers cannot do this job: they are linear, 33/33/27/27, with
// exactly one Module 2 per section, so there is no upper/lower pair to route
// between. Splitting them into invented variants would fabricate forms
// College Board never published. Adaptive mocks are therefore drawn from the
// question bank, using College Board's own E/M/H labels, and are scored as
// *estimated* (spec 8) precisely because no published curve exists for them.
import { byDomain, domainProportions } from "./bank.ts";
import type { SATForm, SATFormKey, SATQuestion, SATSection } from "./types.ts";

export const BLUEPRINT = {
  rw: { perModule: 27, minutes: 32 },
  math: { perModule: 22, minutes: 35 },
  breakMinutes: 10,
} as const;

/** Difficulty mix per module set. Module 1 is mixed; Module 2 splits into an
 *  easier and a harder variant. These weights are this module's own
 *  calibration, not a College Board published mix, and the UI says so. */
const DIFFICULTY_WEIGHTS = {
  m1:    { E: 0.34, M: 0.33, H: 0.33 },
  lower: { E: 0.50, M: 0.35, H: 0.15 },
  upper: { E: 0.15, M: 0.35, H: 0.50 },
} as const;

export type Rng = () => number;

/**
 * Split `total` across domains by proportion, using largest remainder.
 *
 * Plain rounding does not work: four domains rounded independently can total
 * 26 or 28 against a 27-question module, and a module that is one question
 * short is a broken form, not a rounding detail.
 */
export function allocateByDomain(
  total: number, proportions: Record<string, number>,
): Record<string, number> {
  const domains = Object.keys(proportions);
  const exact = domains.map((d) => ({ d, want: total * proportions[d] }));
  const out: Record<string, number> = {};
  let used = 0;
  for (const { d, want } of exact) {
    out[d] = Math.floor(want);
    used += out[d];
  }
  const order = [...exact].sort(
    (a, b) => (b.want - Math.floor(b.want)) - (a.want - Math.floor(a.want)),
  );
  for (let i = 0; used < total; i++, used++) out[order[i % order.length].d]++;
  return out;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw `n` questions from `pool` to a difficulty mix.
 *
 * Falls back across difficulties rather than returning short: a form that
 * cannot be filled is useless, and the bank is deep enough in every cell
 * (the thinnest is ~348 items) that a shortfall means a filter bug, not a
 * genuinely empty pool.
 */
export function pickWeighted(
  pool: SATQuestion[], n: number,
  weights: Record<string, number>, rng: Rng,
): SATQuestion[] {
  const buckets: Record<string, SATQuestion[]> = { E: [], M: [], H: [] };
  for (const q of pool) buckets[q.difficulty]?.push(q);
  for (const k of Object.keys(buckets)) buckets[k] = shuffle(buckets[k], rng);

  const want = allocateByDomain(n, weights);
  const picked: SATQuestion[] = [];
  for (const [difficulty, count] of Object.entries(want)) {
    picked.push(...buckets[difficulty].splice(0, count));
  }
  const spare = shuffle([...buckets.E, ...buckets.M, ...buckets.H], rng);
  while (picked.length < n && spare.length) picked.push(spare.shift()!);
  return picked;
}

function buildSet(
  bank: SATQuestion[], section: SATSection, weights: Record<string, number>,
  used: Set<string>, rng: Rng,
): SATQuestion[] {
  const groups = byDomain(bank, section);
  const allocation = allocateByDomain(BLUEPRINT[section].perModule, domainProportions(bank, section));
  const out: SATQuestion[] = [];
  for (const [domain, count] of Object.entries(allocation)) {
    const available = (groups[domain] ?? []).filter((q) => !used.has(q.id));
    const chosen = pickWeighted(available, count, weights, rng);
    for (const q of chosen) used.add(q.id);
    out.push(...chosen);
  }
  return shuffle(out, rng);
}

/**
 * A full adaptive form: six question sets.
 *
 * Module 1 and both Module 2 variants are disjoint, because a student sits
 * Module 1 and then exactly one Module 2 — meeting the same question twice
 * in one sitting would invalidate the score. The two Module 2 variants may
 * overlap each other: no student ever sees both.
 */
export function assembleForm(bank: SATQuestion[], rng: Rng): SATForm {
  const sets = {} as Record<SATFormKey, SATQuestion[]>;
  for (const section of ["rw", "math"] as const) {
    const used = new Set<string>();
    sets[`${section}.m1`] = buildSet(bank, section, DIFFICULTY_WEIGHTS.m1, used, rng);
    // A fresh `used` per Module 2 variant, seeded with Module 1's ids: the
    // two variants are alternatives, so they may share questions with each
    // other but never with Module 1.
    const afterM1 = new Set(used);
    sets[`${section}.m2.lower`] = buildSet(bank, section, DIFFICULTY_WEIGHTS.lower, new Set(afterM1), rng);
    sets[`${section}.m2.upper`] = buildSet(bank, section, DIFFICULTY_WEIGHTS.upper, new Set(afterM1), rng);
  }
  return { id: `form-${Date.now().toString(36)}`, kind: "adaptive", sets };
}
