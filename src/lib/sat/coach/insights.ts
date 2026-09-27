// src/lib/sat/coach/insights.ts
//
// SERVER-ONLY. "Coach says" (SAT Coach spec 8.2): calls the LLM adapter with
// the compact prompt from insights-core.ts, validates its reply, and caches
// the result at portal-data/sat/insights/<uid>.json, regenerated only when
// insightsFingerprint changes -- after every finished attempt, a new day or
// a changed plan/profile, never on a plain reload. Storage fails closed
// (storage-fresh.ts): a failed cache read is never followed by a cache
// write. `studentInsights` never throws -- any failure (unreadable cache, no
// AI provider, a spent budget, an unparsable reply, a number the prompt
// didn't carry) falls back to the deterministic rules view, built from the
// same fresh numbers.
import "server-only";
import { readFreshJson, writeFreshJson } from "@/lib/exam-lab/storage-fresh";
import { complete } from "@/lib/ai/llm";
import type { InsightsView } from "../client-types.ts";
import { INSIGHTS_DEADLINE_MS, fallbackInsights, insightsFingerprint, insightsFromResult, insightsRequest, shareInFlight, type InsightsInput } from "./insights-core.ts";

export type { InsightsInput };

const BUCKET = "portal-data";
const CACHE_VERSION = 1;
const SAFE_UID = /^[A-Za-z0-9_-]{6,64}$/;

const cachePath = (uid: string) => `sat/insights/${uid}.json`;

type InsightsCache = { version: typeof CACHE_VERSION; fingerprint: string; view: InsightsView };

// Regenerations running in this server process, by student and fingerprint:
// a second request for the same new view (another tab, the development
// double-mount) waits for the first instead of paying for its own AI call.
const inFlight = new Map<string, Promise<InsightsView>>();

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
 *  falling back to deterministic rules on any failure. `opts.work`: the
 *  student's finished-work key (analytics-data.ts `work`), part of the
 *  fingerprint. The whole call -- retry and fallback model included -- ends
 *  by `opts.deadlineAt` (default 50 s from now; the route runs for at most
 *  60). The cache is only written after a read that itself succeeded
 *  (storage fails closed -- rule 5: never write following a failed read),
 *  and never for a fallback a passing provider failure caused
 *  (insightsCacheable): the next visit tries again. Concurrent calls for
 *  the same new view share one run. Never throws. */
export async function studentInsights(
  uid: string, input: InsightsInput, today: string, opts: { deadlineAt?: number; work?: string } = {},
): Promise<InsightsView> {
  try {
    if (!SAFE_UID.test(uid)) return fallbackInsights(input);
    const fingerprint = insightsFingerprint(input, today, opts.work);
    return await shareInFlight(inFlight, `${uid}:${fingerprint}`, () => regenerate(uid, input, fingerprint, opts.deadlineAt ?? Date.now() + INSIGHTS_DEADLINE_MS));
  } catch {
    return fallbackInsights(input);
  }
}

async function regenerate(uid: string, input: InsightsInput, fingerprint: string, deadlineAt: number): Promise<InsightsView> {
  try {
    const read = await readFreshJson<unknown>(BUCKET, cachePath(uid));
    if (read.ok) {
      const cached = asCache(read.data);
      if (cached && cached.fingerprint === fingerprint) return cached.view;
    }

    const result = await complete(insightsRequest(input), "insights", uid, { deadlineAt });
    const { view, cacheable } = insightsFromResult(result, input);

    if (read.ok && cacheable) {
      const doc: InsightsCache = { version: CACHE_VERSION, fingerprint, view };
      await writeFreshJson(BUCKET, cachePath(uid), doc);
    }

    return view;
  } catch {
    return fallbackInsights(input);
  }
}
