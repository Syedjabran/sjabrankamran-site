/**
 * Pure analytics over a student's attempts — strengths, weaknesses, progress,
 * and a Level 1-10 ranking. No side effects; used by the progress dashboard.
 */
import type { Attempt } from "./attempts";

export type TopicStat = { topic: string; attempted: number; earned: number; available: number; accuracy: number };
export type Analytics = {
  totalAttempts: number;
  papersSat: number;
  questionsAttempted: number;
  scoredQuestions: number;
  overallAccuracy: number; // 0-100 over scored questions
  byTopic: TopicStat[];
  strengths: TopicStat[];
  weaknesses: TopicStat[];
  byLevel: { LOT: number; HOT: number };
  byPaper: { paperType: string; attempts: number; accuracy: number }[];
  timeline: { ts: number; accuracy: number; label: string }[];
  level: number; // 1-10
  levelLabel: string;
  nextLevelHint: string;
  recentAttempts: Attempt[];
  recommendations: string[];
};

const LEVEL_NAMES = [
  "Beginner", "Foundation", "Developing", "Competent", "Proficient",
  "Advanced", "Strong", "Expert", "Elite", "Mastery",
];

export function analyse(attempts: Attempt[]): Analytics {
  const scored = (q: { earned: number | null }) => q.earned !== null;
  const topicMap = new Map<string, { attempted: number; earned: number; available: number }>();
  const levelCount = { LOT: { e: 0, a: 0 }, HOT: { e: 0, a: 0 } };
  const paperMap = new Map<string, { attempts: number; e: number; a: number }>();
  let totalEarned = 0, totalAvail = 0, questionsAttempted = 0, scoredQuestions = 0;

  for (const at of attempts) {
    for (const q of at.questions) {
      questionsAttempted++;
      if (!scored(q)) continue;
      scoredQuestions++;
      const e = q.earned || 0, a = q.marks || 1;
      totalEarned += e; totalAvail += a;
      const tk = q.topic || "Unclassified";
      const t = topicMap.get(tk) || { attempted: 0, earned: 0, available: 0 };
      t.attempted++; t.earned += e; t.available += a; topicMap.set(tk, t);
      const L = levelCount[q.level] || levelCount.LOT; L.e += e; L.a += a;
    }
    const pk = at.paperType;
    const p = paperMap.get(pk) || { attempts: 0, e: 0, a: 0 };
    p.attempts++; p.e += at.score; p.a += at.total; paperMap.set(pk, p);
  }

  const byTopic: TopicStat[] = [...topicMap.entries()]
    .map(([topic, v]) => ({ topic, attempted: v.attempted, earned: v.earned, available: v.available, accuracy: v.available ? Math.round((v.earned / v.available) * 100) : 0 }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const overallAccuracy = totalAvail ? Math.round((totalEarned / totalAvail) * 100) : 0;
  const enough = byTopic.filter((t) => t.attempted >= 2);
  const strengths = enough.slice(0, 5);
  const weaknesses = [...enough].reverse().slice(0, 5);

  const papersSat = new Set(attempts.filter((a) => a.mode === "paper" && a.code).map((a) => a.code)).size;

  const timeline = attempts
    .filter((a) => a.total > 0)
    .slice(-20)
    .map((a) => ({ ts: a.ts, accuracy: Math.round((a.score / a.total) * 100), label: a.ref || a.paperType }));

  // Level 1-10: blends accuracy (0-70%) and volume (0-30%).
  const volumeScore = Math.min(1, scoredQuestions / 400); // 400 scored Q → full volume credit
  const raw = (overallAccuracy / 100) * 0.7 + volumeScore * 0.3;
  const level = Math.max(1, Math.min(10, Math.round(raw * 10) || 1));
  const levelLabel = LEVEL_NAMES[level - 1];

  const recommendations: string[] = [];
  if (weaknesses[0]) recommendations.push(`Focus on ${weaknesses[0].topic} — currently ${weaknesses[0].accuracy}%.`);
  if (levelCount.HOT.a && Math.round((levelCount.HOT.e / levelCount.HOT.a) * 100) < 55)
    recommendations.push("Practise more HOT (higher-order: explain / analyse / evaluate) questions.");
  if (papersSat < 3) recommendations.push("Sit at least 3 full past papers under timed conditions to build exam stamina.");
  if (weaknesses[1]) recommendations.push(`Revisit ${weaknesses[1].topic} (${weaknesses[1].accuracy}%).`);
  if (!recommendations.length) recommendations.push("Strong across the board — push into full A2 (Paper 4) papers to reach Mastery.");

  const nextLevelHint = level >= 10
    ? "You're at Mastery — maintain it with mixed timed papers."
    : `Reach Level ${level + 1} (${LEVEL_NAMES[level]}) by lifting overall accuracy and clearing your weak topics.`;

  return {
    totalAttempts: attempts.length,
    papersSat,
    questionsAttempted,
    scoredQuestions,
    overallAccuracy,
    byTopic,
    strengths,
    weaknesses,
    byLevel: {
      LOT: levelCount.LOT.a ? Math.round((levelCount.LOT.e / levelCount.LOT.a) * 100) : 0,
      HOT: levelCount.HOT.a ? Math.round((levelCount.HOT.e / levelCount.HOT.a) * 100) : 0,
    },
    byPaper: [...paperMap.entries()].map(([paperType, v]) => ({ paperType, attempts: v.attempts, accuracy: v.a ? Math.round((v.e / v.a) * 100) : 0 })),
    timeline,
    level,
    levelLabel,
    nextLevelHint,
    recentAttempts: attempts.slice(-8).reverse(),
    recommendations,
  };
}
