// Manual live smoke test for the SAT Coach LLM adapter — NOT run in CI.
// Reads GROQ_API_KEY from .env.local itself (never process.env set by a
// shell) and NEVER prints the key or any substring of it: only the
// provider/model/timing/token-usage and the parsed JSON's *keys*.
//
// Run: node --no-warnings --experimental-strip-types scripts/smoke-sat-ai.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callLlm } from "../src/lib/ai/llm-core.ts";

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
const apiKey = env.GROQ_API_KEY;
if (!apiKey) {
  console.error("GROQ_API_KEY not found in .env.local — nothing to smoke-test.");
  process.exit(1);
}

const cfg = {
  provider: "groq",
  apiKey,
  model: env.GROQ_MODEL || "qwen/qwen3.8-27b",
  fallbackModel: env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b",
  timeoutMs: 20_000,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function report(label, ms, res) {
  console.log(`\n[${label}]`);
  console.log(`  ok: ${res.ok}`);
  if (res.ok) {
    console.log(`  provider: ${res.provider}  model: ${res.model}  ms: ${ms}`);
    console.log(`  usage: input=${res.usage.input} output=${res.usage.output}`);
    console.log(`  json keys: ${res.json && typeof res.json === "object" ? Object.keys(res.json).join(", ") : String(res.json)}`);
  } else {
    console.log(`  reason: ${res.reason}${res.status ? `  status: ${res.status}` : ""}  ms: ${ms}`);
  }
}

async function jsonCall() {
  const req = {
    system: "You are a terse test harness. Reply with a single JSON object only — no prose, no markdown fences.",
    messages: [{ role: "user", content: 'Reply with exactly this JSON: {"ok": true, "n": 2}' }],
    json: true,
    maxTokens: 200,
  };
  const start = Date.now();
  const res = await callLlm(cfg, req, fetch, sleep);
  report("groq: json call", Date.now() - start, res);
}

function firstCropImage() {
  const dir = path.join(root, "scripts", "exam-lab", "ingest-sat", "out", "crops", "math");
  const file = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".jpg"));
  if (!file) throw new Error(`no .jpg crops found in ${dir}`);
  return path.join(dir, file);
}

async function imageCall() {
  const imagePath = firstCropImage();
  const base64 = readFileSync(imagePath).toString("base64");
  const req = {
    system: "You are a terse test harness. Reply with a single JSON object only — no prose, no markdown fences.",
    messages: [
      {
        role: "user",
        content: 'Look at the attached SAT question crop. Reply with exactly this JSON shape (fill in your best guess): {"subject": "math or reading/writing", "hasText": true}',
        images: [{ mime: "image/jpeg", base64 }],
      },
    ],
    json: true,
    maxTokens: 300,
  };
  const start = Date.now();
  const res = await callLlm(cfg, req, fetch, sleep);
  report(`groq: image call (${path.basename(imagePath)})`, Date.now() - start, res);
}

await jsonCall();
await imageCall();
