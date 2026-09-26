// SERVER-ONLY. Provider selection (env-driven) + AI daily budgets for the SAT
// Coach. POLICY: Google Gemini or Groq only — see scripts/check-ai-provider-policy.mjs.
//
// Provider/model conventions mirror src/lib/ai/physics-tutor.ts's Gemini
// wiring (same URL pattern, same guard against the slow "*-latest" aliases).
import "server-only";
import { callLlm, type LlmRequest, type LlmResult, type ProviderConfig } from "./llm-core.ts";
import { takeBudget } from "./usage.ts";
import { pkToday } from "@/lib/portal/pk-time";

const TIMEOUT_MS = 20_000;

// Same slow-alias guard as physics-tutor.ts: these generic "*-latest" Gemini
// aliases resolve to heavy reasoning models that blow the serverless time
// budget, so an explicit override of one of these names is ignored.
const GEMINI_SLOW_ALIASES = new Set(["gemini-flash-latest", "gemini-pro-latest"]);
const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";

// Groq free tier: qwen/qwen3.8-27b supports JSON mode + images; the fallback
// is text-only but steadier under load (see global-constraints.md).
const GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b";
const GROQ_DEFAULT_FALLBACK_MODEL = "openai/gpt-oss-20b";

function geminiConfig(): ProviderConfig | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const configured = (process.env.GEMINI_MODEL || "").trim();
  const model = configured && !GEMINI_SLOW_ALIASES.has(configured) ? configured : GEMINI_DEFAULT_MODEL;
  return { provider: "gemini", apiKey, model, timeoutMs: TIMEOUT_MS };
}

function groqConfig(): ProviderConfig | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = (process.env.GROQ_MODEL || "").trim() || GROQ_DEFAULT_MODEL;
  const fallbackModel = (process.env.GROQ_FALLBACK_MODEL || "").trim() || GROQ_DEFAULT_FALLBACK_MODEL;
  return { provider: "groq", apiKey, model, fallbackModel, timeoutMs: TIMEOUT_MS };
}

/** `SAT_AI_PROVIDER` ("gemini" | "groq") wins when set; otherwise Gemini when
 *  `GEMINI_API_KEY` is set, else Groq when `GROQ_API_KEY` is set, else null
 *  (no provider configured — every caller has a deterministic fallback). */
export function providerConfig(): ProviderConfig | null {
  const explicit = (process.env.SAT_AI_PROVIDER || "").trim().toLowerCase();
  if (explicit === "gemini") return geminiConfig();
  if (explicit === "groq") return groqConfig();
  return geminiConfig() ?? groqConfig();
}

/**
 * Budget-checked LLM call for the SAT Coach. Denies (deterministic fallback
 * upstream) with `reason: "no-provider"` when no provider is configured, or
 * when today's per-student or global budget is spent — the LlmResult type
 * has no dedicated budget reason, and every caller already treats any
 * `ok: false` as "fall back to deterministic text", so budget denial reuses
 * "no-provider" rather than adding a reason nothing else would handle.
 */
export async function complete(
  req: LlmRequest,
  purpose: "insights" | "tutor" | "parent",
  uid: string | null,
): Promise<LlmResult> {
  const cfg = providerConfig();
  if (!cfg) return { ok: false, reason: "no-provider" };

  const today = pkToday();
  const budget = await takeBudget(uid, purpose, today);
  if (!budget.ok) return { ok: false, reason: "no-provider" };

  return callLlm(cfg, req, fetch, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}
