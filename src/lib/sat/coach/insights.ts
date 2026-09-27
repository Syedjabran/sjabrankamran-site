// src/lib/sat/coach/insights.ts
//
// SERVER-ONLY. "Coach says" (SAT Coach spec 8.2): calls the LLM adapter with
// the compact prompt from insights-core.ts, validates its reply, and caches
// the result at portal-data/sat/insights/<uid>.json, regenerated only when
// insightsFingerprint changes. Storage fails closed (storage-fresh.ts): a
// failed cache read is never followed by a cache write. `studentInsights`
// never throws -- any failure (unreadable cache, no AI provider, a spent
// budget, an unparsable reply, a number the prompt didn't carry) falls back
// to the deterministic rules view.
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { complete } from "@/lib/ai/llm";
import type { InsightsView } from "../client-types.ts";
import { fallbackInsights, insightsFingerprint, insightsPrompt, parseInsights, type InsightsInput } from "./insights-core.ts";

export type { InsightsInput };

const BUCKET = "portal-data";
const CACHE_VERSION = 1;
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;
// A headline + two-sentence summary + up to 3 short tips comfortably fits
// well inside this -- generous headroom against a verbose reply, not a
// budget the student ever notices.
const MAX_OUTPUT_TOKENS = 700;

const cachePath = (uid: string) => `sat/insights/${uid}.json`;

type InsightsCache = { version: typeof CACHE_VERSION; fingerprint: string; view: InsightsView };

function asCache(raw: unknown): InsightsCache | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<InsightsCache>;
  if (c.version !== CACHE_VERSION || typeof c.fingerprint !== "string" || !c.view || typeof c.view !== "object") return null;
  return c as InsightsCache;
}

/** The last "Coach says" view stored for this student, whatever its
 *  fingerprint, or null (none yet, or an unreadable cache). Read-only and
 *  never calls the LLM -- the tutor quotes what the home last showed. */
export async function cachedInsights(uid: string): Promise<InsightsView | null> {
  if (!SAFE_UID.test(uid)) return null;
  const read = await readFreshJson<unknown>(BUCKET, cachePath(uid)).catch(() => null);
  return read?.ok ? asCache(read.data)?.view ?? null : null;
}

/** The student's "Coach says" view. Fresh cache (fingerprint unchanged) is
 *  served without calling the LLM at all; otherwise it asks the adapter for
 *  a new one and validates the reply (shape and the unknown-number guard),
 *  falling back to deterministic rules on any failure. The cache is only
 *  written after a read that itself succeeded (storage fails closed -- rule
 *  5: never write following a failed read). Never throws. */
export async function studentInsights(uid: string, input: InsightsInput, today: string): Promise<InsightsView> {
  try {
    if (!SAFE_UID.test(uid)) return fallbackInsights(input);
    const fingerprint = insightsFingerprint(input, today);

    const read = await readFreshJson<unknown>(BUCKET, cachePath(uid));
    if (read.ok) {
      const cached = asCache(read.data);
      if (cached && cached.fingerprint === fingerprint) return cached.view;
    }

    const { system, user } = insightsPrompt(input);
    const result = await complete(
      { system, messages: [{ role: "user", content: user }], json: true, maxTokens: MAX_OUTPUT_TOKENS },
      "insights",
      uid,
    );
    const view = (result.ok ? parseInsights(result.json, input) : null) ?? fallbackInsights(input);

    if (read.ok) {
      const doc: InsightsCache = { version: CACHE_VERSION, fingerprint, view };
      await writeFreshJson(BUCKET, cachePath(uid), doc);
    }

    return view;
  } catch {
    return fallbackInsights(input);
  }
}
