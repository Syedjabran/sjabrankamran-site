// Manual live smoke test for the SAT Coach's AI calls — NOT run in CI.
//
// Sends the three calls the coach really makes, built by the same pure code
// the app uses, to ONE provider, and checks each reply the way the app does:
//   1. insights    -- "Coach says" (insightsRequest -> parseInsights)
//   2. tutor       -- one tutor turn (tutorRequest -> parseTutorReply)
//   3. explain     -- "Explain my mistake" with the question image inline
//                     (tutorRequest with images -> parseTutorReply)
// For each it prints the HTTP status, the finish reason, the token counts
// (thinking tokens too, when the provider reports them) and whether the
// JSON parsed and passed the app's own validation.
//
// Provider: the first argument ("gemini" | "groq"), else SAT_AI_PROVIDER,
// else what the app would pick (selectProvider: Gemini when its key is set).
// Keys come from .env.local, read here -- NEVER printed, nor any part of
// them, nor a request URL (Gemini's carries the key). Only provider, model,
// status, finish reason, token counts, timings and parse results are shown.
// Each run makes 3 calls (a 429/503 retry or a fallback model adds one). On
// Groq it waits 65 s between calls: its free tier's 8,000 tokens a minute
// counts each call's max_tokens too, so three calls back to back hit 429.
//
// Run: node --no-warnings --experimental-strip-types scripts/smoke-sat-ai.mjs gemini
//      node --no-warnings --experimental-strip-types scripts/smoke-sat-ai.mjs groq
// Options: --only=insights|tutor|explain (one call), --gap=<seconds> between
// calls, --dry (build the requests and print their sizes; no call at all).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callLlm, selectProvider } from "../src/lib/ai/llm-core.ts";
import { insightsKnownNumbers, insightsRequest, onlyKnownNumbers, parseInsights } from "../src/lib/sat/coach/insights-core.ts";
import { parseTutorReply, tutorRequest } from "../src/lib/sat/coach/tutor-core.ts";
import { loadQuestionBank } from "../src/lib/sat/bank.ts";
import { reviewItem } from "../src/lib/sat/serve.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Minimal .env.local reader — no shell export, no third-party dependency,
 *  values never logged. */
function readEnvLocal(file) {
  const out = {};
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = readEnvLocal(path.join(root, ".env.local"));
const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dry = args.includes("--dry");
const only = option("only");
const wanted = (args.find((a) => !a.startsWith("--")) || process.env.SAT_AI_PROVIDER || env.SAT_AI_PROVIDER || "").trim().toLowerCase();
if (wanted && wanted !== "gemini" && wanted !== "groq") {
  console.error(`Unknown provider "${wanted}" — use gemini or groq.`);
  process.exit(1);
}
const cfg = selectProvider({ ...env, SAT_AI_PROVIDER: wanted });
if (!cfg) {
  console.error(`No API key for ${wanted || "any provider"} in .env.local — nothing to smoke-test.`);
  process.exit(1);
}

// --- a fetch that records each provider response's status, finish reason and
// token counts (never the URL, headers or key) ---------------------------------

let calls = 0;
let last = null;

function meta(body) {
  if (cfg.provider === "gemini") {
    const u = body?.usageMetadata ?? {};
    return {
      finish: body?.candidates?.[0]?.finishReason ?? "(none)",
      tokens: { prompt: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thoughts: u.thoughtsTokenCount ?? 0, total: u.totalTokenCount ?? 0 },
    };
  }
  const u = body?.usage ?? {};
  return {
    finish: body?.choices?.[0]?.finish_reason ?? "(none)",
    tokens: { prompt: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0, thoughts: u.completion_tokens_details?.reasoning_tokens ?? 0, total: u.total_tokens ?? 0 },
  };
}

async function recordingFetch(url, init) {
  calls++;
  const res = await fetch(url, init);
  const body = await res.clone().json().catch(() => null);
  const model = JSON.parse(init.body).model ?? String(url).match(/models\/([^:]+):/)?.[1] ?? "?";
  last = { status: res.status, model, ...meta(body) };
  return res;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- fixtures: a realistic student record (no real student's data) ----------

const TODAY = "2026-10-01";
const NOW = Date.parse(`${TODAY}T10:00:00+05:00`);

const insightsInput = {
  firstName: "Aisha",
  daysToExam: 37,
  targetScore: 1400,
  latestScore: { authority: "official", lower: 1180, upper: 1210, testNo: 4 },
  sections: { rw: { accuracy: 0.72 }, math: { accuracy: 0.58 } },
  weakSkills: [{ label: "Linear functions", mastery: 0.41 }, { label: "Boundaries", mastery: 0.48 }, { label: "Percentages", mastery: 0.52 }],
  strongSkills: [{ label: "Words in Context", mastery: 0.83 }],
  pacingFlags: [{ label: "Linear functions", medianSec: 140, accuracy: 0.4 }],
  week: { scheduled: 5, done: 3, late: 0, missed: 1 },
  nextMock: { date: "Sat 10 Oct", title: "Official Practice Test 5" },
};

function bankSkills() {
  const seen = new Map();
  for (const q of loadQuestionBank()) {
    const key = q.skill.toLowerCase();
    if (!seen.has(key)) seen.set(key, { skill: q.skill, domain: q.domain, section: q.section });
  }
  return [...seen.values()];
}

const tutorCtx = {
  firstName: "Aisha",
  today: TODAY,
  profile: { examDate: "2026-11-07", targetMonth: null, targetScore: 1400, start: { kind: "score", total: 1150, source: "PSAT" }, days: [1, 3, 5, 6], minutes: 30 },
  plan: {
    items: [
      { id: "c1", date: "2026-10-01", kind: "challenge", status: "scheduled", size: 15 },
      { id: "c2", date: "2026-10-02", kind: "challenge", status: "scheduled", size: 15 },
      { id: "m1", date: "2026-10-10", kind: "mock", status: "scheduled", mock: { kind: "practice", testNo: 5 } },
      { id: "exam", date: "2026-11-07", kind: "exam", status: "scheduled" },
    ],
  },
  analytics: {
    totals: { answered: 320, attempted: 326, correct: 210, last7: { answered: 40, attempted: 40, correct: 28 }, last30: { answered: 200, attempted: 204, correct: 130 } },
    sections: { rw: { answered: 180, correct: 130, accuracy: 0.72 }, math: { answered: 146, correct: 80, accuracy: 0.55 } },
    skills: [
      { key: "words in context", label: "Words in Context", section: "rw", domain: "craft-structure", mastery: 0.83, confidence: 12, attempts: 14, trend: 0.05 },
      { key: "linear functions", label: "Linear functions", section: "math", domain: "algebra", mastery: 0.41, confidence: 9, attempts: 10, trend: -0.02 },
    ],
    weakSkills: [
      { key: "linear functions", label: "Linear functions", domain: "algebra", section: "math", mastery: 0.41, priority: 0.2 },
      { key: "boundaries", label: "Boundaries", domain: "standard-english", section: "rw", mastery: 0.48, priority: 0.13 },
    ],
    notEnoughData: [{ key: "circles", label: "Circles", attempts: 1 }],
    pacing: { rw: { medianSec: 80, targetSec: 71, samples: 120 }, math: { medianSec: 104, targetSec: 95, samples: 90 } },
    pacingFlags: [{ skill: "linear functions", label: "Linear functions", medianSec: 140, accuracy: 0.4 }],
    scores: {
      latestOfficial: { id: "s1", kind: "practice", title: "Official Practice Test 4", finishedAt: NOW - 6 * 86_400_000, score: { authority: "official", lower: 1180, upper: 1210, testNo: 4 } },
      latestEstimate: null,
      history: [{ id: "s1", kind: "practice", title: "Official Practice Test 4", finishedAt: NOW - 6 * 86_400_000, score: { authority: "official", lower: 1180, upper: 1210, testNo: 4 } }],
    },
  },
  insights: { headline: "Push Linear functions this week", summary: "Math is your gap.", tips: [{ title: "Drill Linear functions", body: "..." }] },
  mistakes: [],
  bankSkills: bankSkills(),
  turnId: "smoke",
};

/** A math question with a local crop (the app downloads the same image from
 *  the private bucket), explained as if the student had picked a wrong choice. */
function explainCase() {
  const dir = path.join(root, "scripts", "exam-lab", "ingest-sat", "out", "crops", "math");
  const crops = new Set(readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".jpg")).map((f) => f.slice(0, -4)));
  const q = loadQuestionBank().find((x) => x.section === "math" && crops.has(x.id) && reviewItem(x.id, 1, null)?.kind === "mcq");
  if (!q) throw new Error(`no multiple-choice math question with a crop in ${dir}`);
  const answer = reviewItem(q.id, 1, null).answer;
  const wrong = ["A", "B", "C", "D"].find((c) => c !== answer);
  const item = reviewItem(q.id, 1, wrong);
  const base64 = readFileSync(path.join(dir, `${q.id}.jpg`)).toString("base64");
  const explain = {
    questionId: q.id, section: item.section, domain: item.domain, skill: item.skill, difficulty: item.difficulty, kind: item.kind,
    answer: item.answer, response: item.response, correct: item.correct, rationale: item.rationale, withImages: true,
  };
  return { ctx: { ...tutorCtx, explain }, images: [{ mime: "image/jpeg", base64 }], label: q.id };
}

// --- the three calls ---------------------------------------------------------

const rows = [];
const gapMs = Number(option("gap") ?? (cfg.provider === "groq" ? 65 : 0)) * 1000;
let sent = 0;

/** Why the app would refuse this "Coach says" reply: the unknown-number
 *  guard (the numbers it names), or the shape (length, sentences, tips). */
function insightsRejection(json) {
  const known = insightsKnownNumbers(insightsInput);
  const texts = json && typeof json === "object" ? [json.headline, json.summary, ...(Array.isArray(json.tips) ? json.tips.flatMap((t) => [t?.title, t?.body]) : [])] : [];
  const unknown = texts.filter((t) => typeof t === "string" && !onlyKnownNumbers(t, known));
  return unknown.length ? `a number the prompt didn't carry: ${unknown.map((t) => JSON.stringify(t)).join(" | ")}` : "shape (length, sentence count or tips)";
}

async function run(name, key, req, check, rejection = () => "") {
  if (only && only !== key) return;
  if (dry) {
    const images = req.messages.reduce((n, m) => n + (m.images?.length ?? 0), 0);
    console.log(`[dry] ${name}: system ${req.system.length} chars, ${req.messages.length} message(s), ${images} image(s), json ${req.json}, maxTokens ${req.maxTokens}`);
    return;
  }
  if (sent++ > 0 && gapMs > 0) {
    console.log(`\n(waiting ${gapMs / 1000} s for the provider's per-minute token limit)`);
    await sleep(gapMs);
  }
  last = null;
  const before = calls;
  const started = Date.now();
  const res = await callLlm(cfg, req, recordingFetch, sleep);
  const ms = Date.now() - started;
  const parsed = res.ok ? check(res.json) : null;
  const row = {
    call: name,
    status: last?.status ?? "-",
    model: last?.model ?? cfg.model,
    finish: last?.finish ?? "-",
    ...(last?.tokens ?? {}),
    maxOut: req.maxTokens,
    json: res.ok ? "yes" : `no (${res.reason}${res.status ? ` ${res.status}` : ""})`,
    valid: parsed ? "yes" : "no",
    attempts: calls - before,
    ms,
  };
  rows.push(row);
  console.log(`\n[${cfg.provider}: ${name}]`);
  for (const [k, v] of Object.entries(row)) if (k !== "call") console.log(`  ${k}: ${v}`);
  if (parsed) console.log(`  reply: ${parsed.summaryLine}`);
  else if (res.ok) console.log(`  refused because: ${rejection(res.json)}\n  reply JSON: ${JSON.stringify(res.json).slice(0, 1200)}`);
}

console.log(`Provider: ${cfg.provider}  model: ${cfg.model}${cfg.fallbackModel ? `  fallback: ${cfg.fallbackModel}` : ""}`);

await run("insights", "insights", insightsRequest(insightsInput), (json) => {
  const view = parseInsights(json, insightsInput);
  return view && { summaryLine: `headline ${JSON.stringify(view.headline)}; ${view.tips.length} tip(s)` };
}, insightsRejection);

await run("tutor turn", "tutor", tutorRequest(tutorCtx, { summary: "", history: [], message: "What should I work on this week?" }), (json) => {
  const reply = parseTutorReply(json, tutorCtx);
  return reply && { summaryLine: `${reply.reply.length} chars; actions: ${reply.actions.map((a) => a.type).join(", ") || "none"}` };
}, () => "no usable reply text");

const ex = explainCase();
await run(`explain (image ${ex.label})`, "explain", tutorRequest(ex.ctx, { summary: "", history: [], message: "Explain my mistake on this question.", images: ex.images }), (json) => {
  const reply = parseTutorReply(json, ex.ctx);
  return reply && { summaryLine: `${reply.reply.length} chars; actions: ${reply.actions.map((a) => a.type).join(", ") || "none"}` };
}, () => "no usable reply text");

if (dry) process.exit(0);
console.log(`\nLive provider requests made: ${calls}`);
console.log("\n| call | status | model | finish | prompt | output | thoughts | max out | JSON | valid | ms |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of rows) console.log(`| ${r.call} | ${r.status} | ${r.model} | ${r.finish} | ${r.prompt ?? "-"} | ${r.output ?? "-"} | ${r.thoughts ?? "-"} | ${r.maxOut} | ${r.json} | ${r.valid} | ${r.ms} |`);
process.exit(rows.every((r) => r.valid === "yes") ? 0 : 1);
