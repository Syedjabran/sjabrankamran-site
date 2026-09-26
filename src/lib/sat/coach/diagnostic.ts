// src/lib/sat/coach/diagnostic.ts
//
// The starting-point diagnostic (SAT Coach spec 5): 3 questions from each of
// the 8 College Board domains, one Easy, one Medium and one Hard. Pure: it
// sees only ids, domains and difficulties (never an answer), and the caller
// passes the rng -- a seeded one in tests, a crypto-backed one in routes.
import { SAT_DOMAIN_IDS } from "../client-types.ts";

const LEVELS = ["E", "M", "H"] as const;
export const DIAGNOSTIC_SIZE = SAT_DOMAIN_IDS.length * LEVELS.length;
export const DIAGNOSTIC_TITLE = `Diagnostic — ${DIAGNOSTIC_SIZE} questions`;

export type DiagnosticCandidate = { id: string; domain: string; difficulty: "E" | "M" | "H" };

/**
 * 24 question ids, Reading and Writing domains first, Easy → Hard within
 * each domain. `exclude` (e.g. questions of the student's running sittings)
 * is never drawn. When a domain has no question left at one difficulty,
 * another of that domain's questions stands in, so the domain still gets
 * three; a domain with nothing left at all cannot make a diagnostic.
 */
export function pickDiagnostic(bank: DiagnosticCandidate[], rng: () => number, exclude?: Set<string>): string[] {
  const out: string[] = [];
  for (const domain of SAT_DOMAIN_IDS) {
    const pool = bank.filter((q) => q.domain === domain && !exclude?.has(q.id));
    const taken = new Set<string>();
    for (const level of LEVELS) {
      const open = pool.filter((q) => !taken.has(q.id));
      const exact = open.filter((q) => q.difficulty === level);
      const choices = exact.length ? exact : open;
      if (!choices.length) throw new Error("There aren't enough questions to build a diagnostic right now.");
      const pick = choices[Math.min(choices.length - 1, Math.floor(rng() * choices.length))];
      taken.add(pick.id);
      out.push(pick.id);
    }
  }
  return out;
}
