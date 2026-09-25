// src/lib/sat/bank.ts
//
// Loading and indexing for both generated banks. The JSON is emitted by
// scripts/exam-lab/ingest-sat/build_sat_bank.py and build_sat_tests.py and
// is imported directly, exactly as src/lib/exam-lab/ does with its own
// generated banks -- it is build-time data, not a runtime fetch.
import questionBank from "./question-bank.json" with { type: "json" };
import practiceTests from "./practice-tests.json" with { type: "json" };
import type {
  SATDomain, SATDifficulty, SATPracticeTest, SATQuestion, SATSection,
} from "./types.ts";

export function loadQuestionBank(): SATQuestion[] {
  return questionBank as SATQuestion[];
}

export function loadPracticeTests(): SATPracticeTest[] {
  return (practiceTests as { tests: SATPracticeTest[] }).tests;
}

export function practiceTest(testNo: number): SATPracticeTest | null {
  return loadPracticeTests().find((t) => t.testNo === testNo) ?? null;
}

export type SATFilter = {
  section?: SATSection;
  domain?: SATDomain;
  difficulty?: SATDifficulty;
  skill?: string;
};

/** Drill filtering. An absent key means "no constraint", so `{}` returns the
 *  whole bank rather than nothing. */
export function filterQuestions(bank: SATQuestion[], f: SATFilter): SATQuestion[] {
  return bank.filter((q) =>
    (f.section === undefined || q.section === f.section) &&
    (f.domain === undefined || q.domain === f.domain) &&
    (f.difficulty === undefined || q.difficulty === f.difficulty) &&
    (f.skill === undefined || q.skill === f.skill));
}

export function byDomain(
  bank: SATQuestion[], section: SATSection,
): Record<string, SATQuestion[]> {
  const out: Record<string, SATQuestion[]> = {};
  for (const q of bank) {
    if (q.section !== section) continue;
    (out[q.domain] ||= []).push(q);
  }
  return out;
}

/**
 * Each domain's share of a section, measured from the bank itself.
 *
 * College Board publishes blueprint percentages, but nothing on disk states
 * them, and integrity rule 2 says ship only what the material supports. So
 * the target mix for assembled forms is derived from the labelled corpus --
 * a fact this repo can verify -- and the UI calls it that. It is not
 * presented as College Board's blueprint.
 */
export function domainProportions(
  bank: SATQuestion[], section: SATSection,
): Record<string, number> {
  const groups = byDomain(bank, section);
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
  const out: Record<string, number> = {};
  for (const [domain, items] of Object.entries(groups)) {
    out[domain] = total === 0 ? 0 : items.length / total;
  }
  return out;
}
