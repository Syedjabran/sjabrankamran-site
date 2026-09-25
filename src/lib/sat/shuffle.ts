// src/lib/sat/shuffle.ts
//
// SERVER-SIDE. The one Fisher-Yates shuffle behind adaptive-form assembly
// (forms.ts) and drill ordering (drills.ts). Pure, so Node tests drive it
// with a seeded Rng; the routes pass a crypto-backed one.

export type Rng = () => number;

/** A shuffled copy of `items`; the input is never reordered. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
