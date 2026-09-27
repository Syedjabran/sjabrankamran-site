// SERVER-ONLY. Provider selection (env-driven) + AI daily budgets for the SAT
// Coach. POLICY: Google Gemini or Groq only — see scripts/check-ai-provider-policy.mjs.
//
// Provider/model conventions mirror src/lib/ai/physics-tutor.ts's Gemini
// wiring (same URL pattern, same guard against the slow "*-latest" aliases);
// the actual selection logic lives in the pure `selectProvider` (llm-core.ts)
// so it can be tested without touching real env vars — this just supplies
// the real `process.env`.
import "server-only";
import { callLlm, selectProvider, type CallOptions, type LlmRequest, type LlmResult, type ProviderConfig } from "./llm-core.ts";
import { takeBudget } from "./usage.ts";
import { pkToday } from "@/lib/portal/pk-time";

export function providerConfig(): ProviderConfig | null {
  return selectProvider(process.env);
}

/** Budget-checked LLM call for the SAT Coach: `reason: "no-provider"` when no
 *  provider is configured; `reason: "budget", scope` when today's per-student
 *  ("student") or global ("global") budget is spent, or a budget counter
 *  couldn't be read ("unavailable") -- every caller falls back to
 *  deterministic text either way, but the tutor tells them apart ("you've
 *  used today's messages" / "back tomorrow" / "try again in a moment").
 *  `opts.deadlineAt` bounds the whole call, retries and fallback included
 *  (see CallOptions). */
export async function complete(
  req: LlmRequest,
  purpose: "insights" | "tutor" | "parent",
  uid: string | null,
  opts: Pick<CallOptions, "deadlineAt"> = {},
): Promise<LlmResult> {
  const cfg = providerConfig();
  if (!cfg) return { ok: false, reason: "no-provider" };

  const today = pkToday();
  const budget = await takeBudget(uid, purpose, today);
  if (!budget.ok) return { ok: false, reason: "budget", scope: budget.reason };

  return callLlm(cfg, req, fetch, (ms) => new Promise((resolve) => setTimeout(resolve, ms)), opts);
}
