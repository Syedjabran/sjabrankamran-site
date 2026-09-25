// src/lib/sat/analytics.ts
//
// Pure analytics engine (Node-testable, no server-only imports): turns a
// student's finished SAT items into recency-weighted mastery per
// skill/domain, pacing, weak-skill priorities and score history. Carries no
// answer data -- only qid/section/domain/skill/difficulty/correct/at/timeMs,
// so it is safe for "use client" modules to import (spec 10.5, the "no
// invented scores" rule: mastery is a percentage, never a scaled score).
//
// Rules implemented here (exact, from the SAT Coach spec section 7.2):
//   - weight w = 0.5^(ageDays / halfLifeDays), halfLifeDays default 14.
//   - mastery = (2 + Sum(w*correct)) / (4 + Sum(w))  -- Beta(2,2) prior.
//   - confidence = Sum(w) (effective sample size).
//   - trend = mastery over the last 14 days minus mastery over the 14 days
//     before that (0 when either window has no items), using the same
//     recency-weighted formula restricted to each window.
//   - skill key = skill.toLowerCase(); label = the most frequent original
//     spelling for that key (the bank spells "Cross-Text Connections" two
//     ways).
//   - domain weight (the real test's blueprint weight): R&W
//     information-ideas .26, craft-structure .28, expression-ideas .20,
//     standard-english .26; Math algebra .35, advanced-math .35, psda .15,
//     geometry-trig .15.
//   - priority = (1 - mastery) * domainWeight * min(1, confidence / 5).
//   - skills with attempts < 3 go to notEnoughData; the rest to weakSkills,
//     sorted by priority desc, top 5.
//   - pacing target: R&W 71s, Math 95s per question.
//   - a pacing flag = a skill with >= 5 timed attempts, median > 1.3x the
//     section's target and mastery < 0.6.
//   - items with domain/skill null (practice-test questions) count toward
//     sections, difficulty (when known) and pacing, and totals -- never
//     toward domain/skill mastery.
import type { SATDifficulty, SATScore, SATSection } from "./types.ts";
import type { MasteryRow, SATAnalytics } from "./client-types.ts";
import { DOMAIN_LABEL } from "./client-types.ts";

export type AnalyticsItem = {
  qid: string;
  section: SATSection;
  domain: string | null;
  skill: string | null;
  difficulty: SATDifficulty | null;
  correct: boolean;
  at: number; // ms epoch
  timeMs?: number;
  source: "drill" | "diagnostic" | "challenge" | "adaptive" | "practice";
};

export type SittingScore = {
  id: string;
  kind: "adaptive" | "practice";
  title: string;
  finishedAt: number;
  score: SATScore | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HALF_LIFE_DAYS = 14;

const PACING_TARGET_SEC: Record<SATSection, number> = { rw: 71, math: 95 };

/** The real test's blueprint weight per domain (spec 7.2 / the weak-skills
 *  priority formula). Kept local to the engine -- it is analytics-specific
 *  data, not a general SAT constant like DOMAIN_LABEL. */
const DOMAIN_WEIGHT: Record<string, number> = {
  "information-ideas": 0.26,
  "craft-structure": 0.28,
  "expression-ideas": 0.2,
  "standard-english": 0.26,
  algebra: 0.35,
  "advanced-math": 0.35,
  psda: 0.15,
  "geometry-trig": 0.15,
};

/** Which section a domain id belongs to, derived from its weight table
 *  membership isn't enough (weights don't carry section), so this is spelled
 *  once here from the same eight ids DOMAIN_LABEL carries. */
const DOMAIN_SECTION: Record<string, SATSection> = {
  "information-ideas": "rw",
  "craft-structure": "rw",
  "expression-ideas": "rw",
  "standard-english": "rw",
  algebra: "math",
  "advanced-math": "math",
  psda: "math",
  "geometry-trig": "math",
};

function emptyCount() {
  return { answered: 0, correct: 0 };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function betaMastery(sumW: number, sumWCorrect: number): number {
  return (2 + sumWCorrect) / (4 + sumW);
}

type Group = {
  key: string;
  section: SATSection;
  domainId: string | null; // null for domain-level groups (key IS the domain id)
  labelCounts: Map<string, number>;
  domainCounts: Map<string, number>;
  attempts: number;
  correct: number;
  sumW: number;
  sumWCorrect: number;
  lastAt: number | null;
  timedSec: number[];
  items: AnalyticsItem[];
};

function newGroup(key: string, section: SATSection, domainId: string | null): Group {
  return {
    key,
    section,
    domainId,
    labelCounts: new Map(),
    domainCounts: new Map(),
    attempts: 0,
    correct: 0,
    sumW: 0,
    sumWCorrect: 0,
    lastAt: null,
    timedSec: [],
    items: [],
  };
}

function topEntry(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function computeAnalytics(
  items: AnalyticsItem[],
  sittings: SittingScore[],
  now: number,
  opts?: { halfLifeDays?: number },
): SATAnalytics {
  const halfLifeDays = opts?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const weightOf = (at: number): number => Math.pow(0.5, (now - at) / DAY_MS / halfLifeDays);

  // Windowed (0..14 days, 14..28 days) recency-weighted mastery, for `trend`.
  function windowMastery(groupItems: AnalyticsItem[], loDays: number, hiDays: number): number | null {
    let sumW = 0;
    let sumWCorrect = 0;
    let count = 0;
    for (const it of groupItems) {
      const ageDays = (now - it.at) / DAY_MS;
      if (ageDays >= loDays && ageDays < hiDays) {
        const w = weightOf(it.at);
        sumW += w;
        if (it.correct) sumWCorrect += w;
        count += 1;
      }
    }
    return count === 0 ? null : betaMastery(sumW, sumWCorrect);
  }

  function trendOf(groupItems: AnalyticsItem[]): number {
    const recent = windowMastery(groupItems, 0, 14);
    const prior = windowMastery(groupItems, 14, 28);
    return recent === null || prior === null ? 0 : recent - prior;
  }

  // --- totals / sections / difficulty / pacing: every item, regardless of
  // whether domain/skill are known (practice-test items still count here).
  let totalAnswered = 0;
  let totalCorrect = 0;
  let last7Answered = 0;
  let last7Correct = 0;
  let last30Answered = 0;
  let last30Correct = 0;
  const last7Cutoff = now - 7 * DAY_MS;
  const last30Cutoff = now - 30 * DAY_MS;

  const sectionAcc: Record<SATSection, { answered: number; correct: number }> = { rw: emptyCount(), math: emptyCount() };
  const difficultyAcc: Record<SATSection, Record<SATDifficulty, { answered: number; correct: number }>> = {
    rw: { E: emptyCount(), M: emptyCount(), H: emptyCount() },
    math: { E: emptyCount(), M: emptyCount(), H: emptyCount() },
  };
  const timedSecBySection: Record<SATSection, number[]> = { rw: [], math: [] };

  // --- domain/skill groups: only items that carry both a domain and a skill
  // (practice-test items never do -- College Board does not label them).
  const domainGroups = new Map<string, Group>();
  const skillGroups = new Map<string, Group>();

  for (const it of items) {
    totalAnswered += 1;
    if (it.correct) totalCorrect += 1;
    if (it.at >= last7Cutoff) {
      last7Answered += 1;
      if (it.correct) last7Correct += 1;
    }
    if (it.at >= last30Cutoff) {
      last30Answered += 1;
      if (it.correct) last30Correct += 1;
    }

    sectionAcc[it.section].answered += 1;
    if (it.correct) sectionAcc[it.section].correct += 1;

    if (it.difficulty) {
      difficultyAcc[it.section][it.difficulty].answered += 1;
      if (it.correct) difficultyAcc[it.section][it.difficulty].correct += 1;
    }

    if (typeof it.timeMs === "number") {
      timedSecBySection[it.section].push(it.timeMs / 1000);
    }

    if (it.domain != null && it.skill != null) {
      const w = weightOf(it.at);

      let domainGroup = domainGroups.get(it.domain);
      if (!domainGroup) {
        domainGroup = newGroup(it.domain, DOMAIN_SECTION[it.domain] ?? it.section, it.domain);
        domainGroups.set(it.domain, domainGroup);
      }
      domainGroup.attempts += 1;
      if (it.correct) domainGroup.correct += 1;
      domainGroup.sumW += w;
      if (it.correct) domainGroup.sumWCorrect += w;
      domainGroup.lastAt = domainGroup.lastAt == null ? it.at : Math.max(domainGroup.lastAt, it.at);
      domainGroup.items.push(it);

      const skillKey = it.skill.toLowerCase();
      let skillGroup = skillGroups.get(skillKey);
      if (!skillGroup) {
        skillGroup = newGroup(skillKey, it.section, it.domain);
        skillGroups.set(skillKey, skillGroup);
      }
      skillGroup.attempts += 1;
      if (it.correct) skillGroup.correct += 1;
      skillGroup.sumW += w;
      if (it.correct) skillGroup.sumWCorrect += w;
      skillGroup.lastAt = skillGroup.lastAt == null ? it.at : Math.max(skillGroup.lastAt, it.at);
      skillGroup.items.push(it);
      skillGroup.labelCounts.set(it.skill, (skillGroup.labelCounts.get(it.skill) ?? 0) + 1);
      skillGroup.domainCounts.set(it.domain, (skillGroup.domainCounts.get(it.domain) ?? 0) + 1);
      if (typeof it.timeMs === "number") skillGroup.timedSec.push(it.timeMs / 1000);
    }
  }

  function toRow(group: Group, label: string, domain: string | undefined): MasteryRow {
    return {
      key: group.key,
      label,
      section: group.section,
      domain,
      attempts: group.attempts,
      correct: group.correct,
      mastery: betaMastery(group.sumW, group.sumWCorrect),
      confidence: group.sumW,
      trend: trendOf(group.items),
      lastAt: group.lastAt,
    };
  }

  // Domain rows: always all 8 (the Progress page's 8-domain grid), zero-filled
  // for domains the student hasn't attempted yet (prior-only mastery 0.5).
  const domains: MasteryRow[] = Object.keys(DOMAIN_LABEL).map((domainId) => {
    const group = domainGroups.get(domainId) ?? newGroup(domainId, DOMAIN_SECTION[domainId] ?? "rw", domainId);
    return toRow(group, DOMAIN_LABEL[domainId] ?? domainId, undefined);
  });

  const skills: MasteryRow[] = [...skillGroups.values()]
    .map((group) => toRow(group, topEntry(group.labelCounts) ?? group.key, topEntry(group.domainCounts) ?? undefined))
    .sort((a, b) => a.label.localeCompare(b.label));

  // --- weak skills / not enough data (from the raw skill groups, not the
  // sorted `skills` rows, so the domain weight lookup uses the group's own
  // majority domain id directly).
  const weakCandidates: { key: string; label: string; domain: string; section: SATSection; mastery: number; priority: number }[] = [];
  const notEnoughData: { key: string; label: string; attempts: number }[] = [];

  for (const group of skillGroups.values()) {
    const label = topEntry(group.labelCounts) ?? group.key;
    if (group.attempts < 3) {
      notEnoughData.push({ key: group.key, label, attempts: group.attempts });
      continue;
    }
    const domainId = topEntry(group.domainCounts) ?? group.domainId ?? "";
    const mastery = betaMastery(group.sumW, group.sumWCorrect);
    const confidence = group.sumW;
    const domainWeight = DOMAIN_WEIGHT[domainId] ?? 0;
    const priority = (1 - mastery) * domainWeight * Math.min(1, confidence / 5);
    weakCandidates.push({ key: group.key, label, domain: domainId, section: group.section, mastery, priority });
  }
  weakCandidates.sort((a, b) => b.priority - a.priority);
  const weakSkills = weakCandidates.slice(0, 5);

  // --- pacing (per section) + pacing flags (per skill).
  const pacing: SATAnalytics["pacing"] = {
    rw: { medianSec: median(timedSecBySection.rw), targetSec: PACING_TARGET_SEC.rw, samples: timedSecBySection.rw.length },
    math: { medianSec: median(timedSecBySection.math), targetSec: PACING_TARGET_SEC.math, samples: timedSecBySection.math.length },
  };

  const pacingFlags: SATAnalytics["pacingFlags"] = [];
  for (const group of skillGroups.values()) {
    if (group.timedSec.length < 5) continue;
    const medianSec = median(group.timedSec);
    if (medianSec == null) continue;
    const target = PACING_TARGET_SEC[group.section];
    const mastery = betaMastery(group.sumW, group.sumWCorrect);
    if (medianSec > 1.3 * target && mastery < 0.6) {
      pacingFlags.push({
        skill: group.key,
        label: topEntry(group.labelCounts) ?? group.key,
        medianSec,
        accuracy: group.attempts > 0 ? group.correct / group.attempts : 0,
      });
    }
  }

  // --- scores: latest official practice range, latest adaptive estimate,
  // and history (chronological, oldest first, for a score-history chart).
  const scored = sittings.filter((s): s is SittingScore & { score: SATScore } => s.score != null);
  const latestOfficial = scored
    .filter((s) => s.score.authority === "official")
    .sort((a, b) => b.finishedAt - a.finishedAt)[0] ?? null;
  const latestEstimate = scored
    .filter((s) => s.score.authority === "estimated")
    .sort((a, b) => b.finishedAt - a.finishedAt)[0] ?? null;
  const history = [...scored].sort((a, b) => a.finishedAt - b.finishedAt);

  const sections: SATAnalytics["sections"] = {
    rw: { ...sectionAcc.rw, accuracy: sectionAcc.rw.answered > 0 ? sectionAcc.rw.correct / sectionAcc.rw.answered : null },
    math: { ...sectionAcc.math, accuracy: sectionAcc.math.answered > 0 ? sectionAcc.math.correct / sectionAcc.math.answered : null },
  };

  return {
    generatedAt: now,
    totals: {
      answered: totalAnswered,
      correct: totalCorrect,
      last7: { answered: last7Answered, correct: last7Correct },
      last30: { answered: last30Answered, correct: last30Correct },
    },
    sections,
    domains,
    skills,
    difficulty: difficultyAcc,
    pacing,
    pacingFlags,
    weakSkills,
    notEnoughData,
    scores: { latestOfficial, latestEstimate, history },
  };
}
