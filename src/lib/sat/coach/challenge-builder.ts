// src/lib/sat/coach/challenge-builder.ts
//
// Pure challenge-question selection (Node-testable, no server-only imports,
// no answer data): given the bank's public shape, the student's analytics
// and a per-question history, picks the ids for one daily challenge (SAT
// Coach spec section 6.2) and the skill labels it targets.
//
// Composition (exact, from the brief): weak = round(size * 0.6), review =
// round(size * 0.25), stretch = size - weak - review.
//   - weak: the top 3 weakSkills, in rotation, at the lowest difficulty
//     where the student's accuracy on that skill is < 70% (else one step up
//     from the hardest difficulty they've attempted; "M" with no data at
//     all for that skill).
//   - review: questions answered wrong >= 7 days ago (oldest first, each
//     re-asked at most once -- times < 2), then questions from skills not
//     practised in >= 7 days (never, counts as stale).
//   - stretch: one difficulty above the most-improving skill's (max trend)
//     best difficulty -- the highest difficulty it has >= 70% accuracy at
//     ("M" with no data at all).
// Every pick excludes `exclude`, and a question answered correctly in the
// last 30 days, and prefers a question never seen (not in `history`) within
// its pool. Any shortfall (a slot with no eligible candidate) is filled at
// the end with balanced unseen medium questions across the 8 domains. No
// analytics -> the whole challenge is that balanced-domain fill.
import type { SATDifficulty } from "../types.ts";
import type { MasteryRow, SATAnalytics } from "../client-types.ts";
import { SAT_DOMAIN_IDS } from "../client-types.ts";

export type BankLite = { id: string; section: "rw" | "math"; domain: string; skill: string; difficulty: "E" | "M" | "H" };

export type History = Map<string, { lastAt: number; lastCorrect: boolean; times: number }>;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_CORRECT_DAYS = 30;
const STALE_SKILL_DAYS = 7;
const REVIEW_REASK_DAYS = 7;
const MASTERY_THRESHOLD = 0.7;
const DIFFICULTY_ORDER: SATDifficulty[] = ["E", "M", "H"];

function stepUp(d: SATDifficulty): SATDifficulty {
  return d === "E" ? "M" : "H";
}

type BankIndex = {
  byId: Map<string, BankLite>;
  bySkill: Map<string, BankLite[]>; // key = skill.toLowerCase()
  byDomain: Map<string, BankLite[]>;
};

function indexBank(bank: BankLite[]): BankIndex {
  const byId = new Map<string, BankLite>();
  const bySkill = new Map<string, BankLite[]>();
  const byDomain = new Map<string, BankLite[]>();
  for (const b of bank) {
    byId.set(b.id, b);
    const skillKey = b.skill.toLowerCase();
    const skillList = bySkill.get(skillKey);
    if (skillList) skillList.push(b);
    else bySkill.set(skillKey, [b]);
    const domainList = byDomain.get(b.domain);
    if (domainList) domainList.push(b);
    else byDomain.set(b.domain, [b]);
  }
  return { byId, bySkill, byDomain };
}

function recentlyCorrect(id: string, now: number, history: History): boolean {
  const h = history.get(id);
  return Boolean(h) && h!.lastCorrect && now - h!.lastAt < RECENT_CORRECT_DAYS * DAY_MS;
}

function eligible(id: string, now: number, history: History, exclude: Set<string>, used: Set<string>): boolean {
  return !exclude.has(id) && !used.has(id) && !recentlyCorrect(id, now, history);
}

/** Attempts and accuracy for one skill at one difficulty, from the finished
 *  questions in `history` joined to `bank` (each history entry's `lastCorrect`
 *  stands for that question's outcome -- history carries only the latest
 *  result per question, not a full attempt log). */
function skillDifficultyAccuracy(skillKey: string, difficulty: SATDifficulty, bySkill: Map<string, BankLite[]>, history: History): { attempts: number; accuracy: number } {
  const items = (bySkill.get(skillKey) ?? []).filter((b) => b.difficulty === difficulty);
  let attempts = 0;
  let correct = 0;
  for (const b of items) {
    const h = history.get(b.id);
    if (h) {
      attempts += 1;
      if (h.lastCorrect) correct += 1;
    }
  }
  return { attempts, accuracy: attempts > 0 ? correct / attempts : 0 };
}

/** The weak-slot difficulty for a skill: the lowest difficulty where
 *  accuracy is below the mastery threshold, else one step up from the
 *  hardest difficulty attempted, else "M" with no data at all. */
function weakDifficulty(skillKey: string, bySkill: Map<string, BankLite[]>, history: History): SATDifficulty {
  let highestAttempted: SATDifficulty | null = null;
  for (const d of DIFFICULTY_ORDER) {
    const { attempts, accuracy } = skillDifficultyAccuracy(skillKey, d, bySkill, history);
    if (attempts > 0) {
      highestAttempted = d;
      if (accuracy < MASTERY_THRESHOLD) return d;
    }
  }
  return highestAttempted ? stepUp(highestAttempted) : "M";
}

/** The student's "best" (mastered, >= threshold) difficulty for a skill --
 *  the highest attempted difficulty with accuracy >= the threshold, or the
 *  highest attempted difficulty at all when none is mastered, or null with
 *  no data. */
function bestDifficulty(skillKey: string, bySkill: Map<string, BankLite[]>, history: History): SATDifficulty | null {
  let mastered: SATDifficulty | null = null;
  let anyAttempted: SATDifficulty | null = null;
  for (const d of DIFFICULTY_ORDER) {
    const { attempts, accuracy } = skillDifficultyAccuracy(skillKey, d, bySkill, history);
    if (attempts > 0) {
      anyAttempted = d;
      if (accuracy >= MASTERY_THRESHOLD) mastered = d;
    }
  }
  return mastered ?? anyAttempted;
}

/** The stretch-slot difficulty: one step above the skill's best difficulty,
 *  or "M" with no data at all. */
function stretchDifficulty(skillKey: string, bySkill: Map<string, BankLite[]>, history: History): SATDifficulty {
  const best = bestDifficulty(skillKey, bySkill, history);
  return best ? stepUp(best) : "M";
}

/** One eligible id from `candidates`, preferring never-seen (not in
 *  `history`) ones, chosen with `rng` (deterministic when `rng` is). */
function pickFrom(candidates: BankLite[], now: number, history: History, exclude: Set<string>, used: Set<string>, rng: () => number): string | null {
  const pool = candidates.filter((b) => eligible(b.id, now, history, exclude, used));
  if (pool.length === 0) return null;
  const unseen = pool.filter((b) => !history.has(b.id));
  const from = unseen.length > 0 ? unseen : pool;
  const idx = Math.min(from.length - 1, Math.floor(rng() * from.length));
  return from[idx].id;
}

function pickForSkillDifficulty(
  skillKey: string,
  difficulty: SATDifficulty,
  bySkill: Map<string, BankLite[]>,
  now: number,
  history: History,
  exclude: Set<string>,
  used: Set<string>,
  rng: () => number,
): string | null {
  const candidates = (bySkill.get(skillKey) ?? []).filter((b) => b.difficulty === difficulty);
  return pickFrom(candidates, now, history, exclude, used, rng);
}

/** Fills `count` slots by rotating through `skills`, picking each one's
 *  weak difficulty. Stops early once a full rotation yields no pick, so a
 *  bank shortfall for these skills falls through to the balanced fill. */
function fillWeak(
  count: number,
  skills: { key: string; label: string }[],
  bySkill: Map<string, BankLite[]>,
  now: number,
  history: History,
  exclude: Set<string>,
  used: Set<string>,
  rng: () => number,
): string[] {
  const ids: string[] = [];
  if (skills.length === 0) return ids;
  let i = 0;
  let stale = 0;
  while (ids.length < count && stale < skills.length) {
    const skill = skills[i % skills.length];
    const difficulty = weakDifficulty(skill.key, bySkill, history);
    const id = pickForSkillDifficulty(skill.key, difficulty, bySkill, now, history, exclude, used, rng);
    if (id) {
      ids.push(id);
      used.add(id);
      stale = 0;
    } else {
      stale += 1;
    }
    i += 1;
  }
  return ids;
}

/** Wrong-answered questions eligible for spaced review, oldest first (spec
 *  6.2: "re-asked at most once" -- times < 2, the question is not yet on
 *  its second re-ask). */
function wrongReviewCandidates(now: number, byId: Map<string, BankLite>, history: History): string[] {
  return [...history.entries()]
    .filter(([id, h]) => !h.lastCorrect && h.times < 2 && now - h.lastAt >= REVIEW_REASK_DAYS * DAY_MS && byId.has(id))
    .sort((a, b) => a[1].lastAt - b[1].lastAt)
    .map(([id]) => id);
}

/** The last time each skill (by key) was attempted, from `history` joined
 *  to `bank`. A skill with no entry has never been attempted. */
function skillLastAttempt(byId: Map<string, BankLite>, history: History): Map<string, number> {
  const lastAt = new Map<string, number>();
  for (const [id, h] of history) {
    const b = byId.get(id);
    if (!b) continue;
    const key = b.skill.toLowerCase();
    const prev = lastAt.get(key);
    if (prev === undefined || h.lastAt > prev) lastAt.set(key, h.lastAt);
  }
  return lastAt;
}

/** Skill keys not practised in >= STALE_SKILL_DAYS days (never = stalest),
 *  most stale first. */
function staleSkills(now: number, bySkill: Map<string, BankLite[]>, byId: Map<string, BankLite>, history: History): string[] {
  const lastAt = skillLastAttempt(byId, history);
  return [...bySkill.keys()]
    .map((key) => ({ key, lastAt: lastAt.get(key) ?? -Infinity }))
    .filter((s) => now - s.lastAt >= STALE_SKILL_DAYS * DAY_MS)
    .sort((a, b) => a.lastAt - b.lastAt)
    .map((s) => s.key);
}

function fillReview(
  count: number,
  bySkill: Map<string, BankLite[]>,
  byId: Map<string, BankLite>,
  now: number,
  history: History,
  exclude: Set<string>,
  used: Set<string>,
  rng: () => number,
): string[] {
  const ids: string[] = [];
  for (const id of wrongReviewCandidates(now, byId, history)) {
    if (ids.length >= count) break;
    if (eligible(id, now, history, exclude, used)) {
      ids.push(id);
      used.add(id);
    }
  }
  if (ids.length < count) {
    const stale = staleSkills(now, bySkill, byId, history);
    let i = 0;
    let sinceLastPick = 0;
    while (ids.length < count && stale.length > 0 && sinceLastPick < stale.length) {
      const key = stale[i % stale.length];
      let id: string | null = null;
      for (const d of DIFFICULTY_ORDER) {
        id = pickForSkillDifficulty(key, d, bySkill, now, history, exclude, used, rng);
        if (id) break;
      }
      if (id) {
        ids.push(id);
        used.add(id);
        sinceLastPick = 0;
      } else {
        sinceLastPick += 1;
      }
      i += 1;
    }
  }
  return ids;
}

/** The skill with the highest `trend` in `analytics.skills` (ties keep the
 *  first one seen). */
function mostImprovingSkill(analytics: SATAnalytics): MasteryRow | null {
  let best: MasteryRow | null = null;
  for (const s of analytics.skills) {
    if (!best || s.trend > best.trend) best = s;
  }
  return best;
}

function fillStretch(
  count: number,
  analytics: SATAnalytics,
  bySkill: Map<string, BankLite[]>,
  now: number,
  history: History,
  exclude: Set<string>,
  used: Set<string>,
  rng: () => number,
): { ids: string[]; label: string | null } {
  const skill = mostImprovingSkill(analytics);
  if (!skill) return { ids: [], label: null };
  const difficulty = stretchDifficulty(skill.key, bySkill, history);
  const ids: string[] = [];
  while (ids.length < count) {
    const id = pickForSkillDifficulty(skill.key, difficulty, bySkill, now, history, exclude, used, rng);
    if (!id) break;
    ids.push(id);
    used.add(id);
  }
  return { ids, label: skill.label };
}

/** Balanced across domains (round robin over `order`), unseen medium
 *  preferred, falling back to any eligible question in the domain. */
function fillBalanced(
  count: number,
  order: readonly string[],
  byDomain: Map<string, BankLite[]>,
  now: number,
  history: History,
  exclude: Set<string>,
  used: Set<string>,
  rng: () => number,
): string[] {
  const ids: string[] = [];
  if (order.length === 0) return ids;
  let i = 0;
  let sinceLastPick = 0;
  while (ids.length < count && sinceLastPick < order.length) {
    const domain = order[i % order.length];
    const items = byDomain.get(domain) ?? [];
    const medium = items.filter((b) => b.difficulty === "M");
    const id = pickFrom(medium.length > 0 ? medium : items, now, history, exclude, used, rng);
    if (id) {
      ids.push(id);
      used.add(id);
      sinceLastPick = 0;
    } else {
      sinceLastPick += 1;
    }
    i += 1;
  }
  return ids;
}

export function buildChallenge(input: {
  bank: BankLite[];
  analytics: SATAnalytics | null;
  history: History;
  size: number;
  now: number;
  rng: () => number;
  exclude: Set<string>;
}): { ids: string[]; focus: string[] } {
  const { bank, analytics, history, size, now, rng, exclude } = input;
  const { byId, bySkill, byDomain } = indexBank(bank);
  const used = new Set<string>();

  if (!analytics) {
    return { ids: fillBalanced(size, SAT_DOMAIN_IDS, byDomain, now, history, exclude, used, rng), focus: [] };
  }

  const weakCount = Math.round(size * 0.6);
  const reviewCount = Math.round(size * 0.25);
  const stretchCount = size - weakCount - reviewCount;

  const weakSkills = analytics.weakSkills.slice(0, 3).map((w) => ({ key: w.key, label: w.label }));
  const ids = fillWeak(weakCount, weakSkills, bySkill, now, history, exclude, used, rng);
  ids.push(...fillReview(reviewCount, bySkill, byId, now, history, exclude, used, rng));

  const stretch = fillStretch(stretchCount, analytics, bySkill, now, history, exclude, used, rng);
  ids.push(...stretch.ids);

  const shortfall = size - ids.length;
  if (shortfall > 0) ids.push(...fillBalanced(shortfall, SAT_DOMAIN_IDS, byDomain, now, history, exclude, used, rng));

  const focus: string[] = [];
  for (const s of weakSkills) if (!focus.includes(s.label)) focus.push(s.label);
  if (stretch.label && !focus.includes(stretch.label)) focus.push(stretch.label);

  return { ids, focus };
}
