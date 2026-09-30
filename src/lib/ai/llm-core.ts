// Provider-agnostic LLM request building, parsing and retry. PURE: no `@/`
// alias, no `server-only`, no `process.env` — `fetch` and `sleep` are always
// injected so this runs under plain Node in tests with fakes (see
// scripts/test-llm-core.mjs) and under the real network in src/lib/ai/llm.ts.

export type LlmImage = { mime: "image/jpeg" | "image/png"; base64: string };
export type LlmMessage = { role: "user" | "assistant"; content: string; images?: LlmImage[] };
export type LlmRequest = { system: string; messages: LlmMessage[]; json: boolean; maxTokens: number; temperature?: number };
/** `fallbackAcceptsImages`: whether `fallbackModel` can read images (Groq's
 *  text-only fallback cannot; a Gemini fallback would). A request that
 *  carries images is never sent to a fallback that can't read them. */
export type ProviderConfig = { provider: "gemini" | "groq"; apiKey: string; model: string; fallbackModel?: string; fallbackAcceptsImages: boolean; timeoutMs?: number };
export type LlmResult =
  | { ok: true; text: string; json: unknown | null; provider: string; model: string; usage: { input: number; output: number } }
  | { ok: false; reason: "timeout" | "http" | "parse" | "empty" | "no-provider"; status?: number }
  // "unavailable": a budget counter couldn't be read (try again in a moment).
  | { ok: false; reason: "budget"; scope: "student" | "global" | "unavailable" };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([429, 503]);
// The one retry waits the provider's Retry-After (Groq sends it on a 429
// when a per-minute token limit is hit), at least RETRY_MIN_MS and at most
// RETRY_MAX_MS so a turn still fits a 60 s serverless function.
const RETRY_MIN_MS = 1500;
const RETRY_MAX_MS = 8000;
// Under an overall deadline, an attempt is only started with at least this
// much time left (a shorter one would just time out).
const DEFAULT_MIN_ATTEMPT_MS = 5000;

/** An overall deadline for one call, retries and fallback included:
 *  `deadlineAt` (epoch ms, on the `now` clock -- Date.now by default).
 *  An attempt's own timeout shrinks to the time left, and a retry (with its
 *  wait) or the fallback is skipped when fewer than `minAttemptMs` would be
 *  left for it. */
export type CallOptions = { deadlineAt?: number; now?: () => number; minAttemptMs?: number };

// Same slow-alias guard as physics-tutor.ts: these generic "*-latest" Gemini
// aliases resolve to heavy reasoning models that blow the serverless time
// budget, so an explicit override of one of these names is ignored.
const GEMINI_SLOW_ALIASES = new Set(["gemini-flash-latest", "gemini-pro-latest"]);
const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";

// Groq free tier: qwen/qwen3.8-27b supports JSON mode + images; the fallback
// is text-only but steadier under load (see global-constraints.md).
const GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b";
const GROQ_DEFAULT_FALLBACK_MODEL = "openai/gpt-oss-20b";

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function geminiFromEnv(env: Record<string, string | undefined>): ProviderConfig | null {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const configured = (env.GEMINI_MODEL || "").trim();
  const model = configured && !GEMINI_SLOW_ALIASES.has(configured) ? configured : GEMINI_DEFAULT_MODEL;
  return { provider: "gemini", apiKey, model, timeoutMs: DEFAULT_TIMEOUT_MS, fallbackAcceptsImages: true };
}

function groqFromEnv(env: Record<string, string | undefined>): ProviderConfig | null {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = (env.GROQ_MODEL || "").trim() || GROQ_DEFAULT_MODEL;
  const fallbackModel = (env.GROQ_FALLBACK_MODEL || "").trim() || GROQ_DEFAULT_FALLBACK_MODEL;
  return { provider: "groq", apiKey, model, fallbackModel, timeoutMs: DEFAULT_TIMEOUT_MS, fallbackAcceptsImages: false };
}

/** `SAT_AI_PROVIDER` ("gemini" | "groq") wins when set; otherwise Gemini when
 *  `GEMINI_API_KEY` is set, else Groq when `GROQ_API_KEY` is set, else null
 *  (no provider configured — every caller has a deterministic fallback).
 *  PURE: takes the env map as a parameter (llm.ts calls it with
 *  `process.env`) so it can be tested without touching real env vars. */
export function selectProvider(env: Record<string, string | undefined>): ProviderConfig | null {
  const explicit = (env.SAT_AI_PROVIDER || "").trim().toLowerCase();
  if (explicit === "gemini") return geminiFromEnv(env);
  if (explicit === "groq") return groqFromEnv(env);
  return geminiFromEnv(env) ?? groqFromEnv(env);
}

/** Whether the configured primary model reads images: every Gemini model
 *  does; on Groq, the default qwen model and the vision/Llama-4 families do,
 *  while text models such as the gpt-oss fallback don't. Callers send a
 *  text alternative instead of images when this is false. */
export function modelAcceptsImages(cfg: ProviderConfig): boolean {
  if (cfg.provider === "gemini") return true;
  return cfg.model === GROQ_DEFAULT_MODEL || /vision|llama-4|qwen[^/]*-vl/i.test(cfg.model);
}

/** OpenAI-compatible chat body for Groq: system message first, images as
 *  `image_url` data URIs, `response_format: json_object` when `json`. */
export function buildGroqBody(req: LlmRequest, model: string): object {
  const messages = [
    { role: "system", content: req.system },
    ...req.messages.map((m) => ({
      role: m.role,
      content: m.images?.length
        ? [
            { type: "text", text: m.content },
            ...m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } })),
          ]
        : m.content,
    })),
  ];
  return {
    model,
    messages,
    max_tokens: req.maxTokens,
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
    ...(req.json ? { response_format: { type: "json_object" } } : {}),
  };
}

/** Gemini `contents`/`parts` body: system as `systemInstruction`, images as
 *  `inline_data`, `responseMimeType: application/json` when `json`. */
export function buildGeminiBody(req: LlmRequest): object {
  const contents = req.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      { text: m.content },
      ...(m.images ?? []).map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } })),
    ],
  }));
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents,
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      ...(req.json ? { responseMimeType: "application/json" } : {}),
    },
  };
}

type Parsed = { text: string; usage: { input: number; output: number } };

/** Groq (OpenAI-compatible) response → text + token usage, or null when the
 *  reply carries no usable text (missing/empty choices). */
export function parseGroq(body: unknown): Parsed | null {
  const b = body as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
  const content = b?.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((p) => (p as { text?: string })?.text ?? "").join("")
      : "";
  if (!text.trim()) return null;
  const usage = b?.usage ?? {};
  return { text, usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 } };
}

/** Gemini response → text + token usage, or null when there is no usable text. */
export function parseGemini(body: unknown): Parsed | null {
  const b = body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } } | null;
  const parts = b?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => p?.text ?? "").join("\n").trim() : "";
  if (!text) return null;
  const usage = b?.usageMetadata ?? {};
  return { text, usage: { input: usage.promptTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0 } };
}

/** Strips ``` fences and leading/trailing prose around a JSON value, then
 *  `JSON.parse`s it; returns null when nothing in the text parses as JSON. */
export function extractJson(text: string): unknown | null {
  if (typeof text !== "string") return null;
  let t = text.trim();
  if (!t) return null;
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();

  const tryParse = (s: string): { value: unknown } | null => {
    try {
      return { value: JSON.parse(s) };
    } catch {
      return null;
    }
  };

  const whole = tryParse(t);
  if (whole) return whole.value;

  // Every plausible JSON start position, in order. A leading citation like
  // "See [1] for details: {...}" must not let the stray "[1]" win over the
  // real object later in the text, so each candidate start is tried in turn
  // rather than only the first one found.
  const starts: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "{" || t[i] === "[") starts.push(i);

  for (const from of starts) {
    const sub = t.slice(from);
    const fromStart = tryParse(sub);
    if (fromStart) return fromStart.value;

    const ends = [sub.lastIndexOf("}"), sub.lastIndexOf("]")].filter((i) => i !== -1);
    if (!ends.length) continue;
    const to = Math.max(...ends);
    const trimmed = tryParse(sub.slice(0, to + 1));
    if (trimmed) return trimmed.value;
  }
  return null;
}

type AttemptResult =
  | { kind: "ok"; text: string; usage: { input: number; output: number } }
  | { kind: "retryable"; status: number; retryAfterMs?: number }
  | { kind: "http"; status?: number }
  | { kind: "timeout" }
  | { kind: "empty" };

/** A Retry-After header given in seconds, as ms; undefined when absent or
 *  unreadable (an HTTP-date form is ignored). */
function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers?.get?.("retry-after");
  const seconds = raw == null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

function retryDelay(r: AttemptResult): number {
  const wanted = r.kind === "retryable" ? r.retryAfterMs ?? 0 : 0;
  return Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, wanted));
}

async function attempt(cfg: ProviderConfig, req: LlmRequest, model: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<AttemptResult> {
  const isGroq = cfg.provider === "groq";
  const url = isGroq ? GROQ_URL : geminiUrl(model, cfg.apiKey);
  const body = isGroq ? buildGroqBody(req, model) : buildGeminiBody(req);
  const headers: Record<string, string> = isGroq
    ? { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` }
    : { "content-type": "application/json" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
  } catch (e) {
    if (e && typeof e === "object" && (e as { name?: string }).name === "AbortError") return { kind: "timeout" };
    return { kind: "http" };
  } finally {
    clearTimeout(timer);
  }

  if (RETRYABLE_STATUS.has(res.status)) return { kind: "retryable", status: res.status, retryAfterMs: retryAfterMs(res) };
  if (!res.ok) return { kind: "http", status: res.status };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: "empty" };
  }
  const parsed = isGroq ? parseGroq(json) : parseGemini(json);
  if (!parsed) return { kind: "empty" };
  return { kind: "ok", text: parsed.text, usage: parsed.usage };
}

function finalize(r: Extract<AttemptResult, { kind: "ok" }>, req: LlmRequest, cfg: ProviderConfig, model: string): LlmResult {
  if (!req.json) return { ok: true, text: r.text, json: null, provider: cfg.provider, model, usage: r.usage };
  const json = extractJson(r.text);
  if (json === null) return { ok: false, reason: "parse" };
  return { ok: true, text: r.text, json, provider: cfg.provider, model, usage: r.usage };
}

/** A non-`"ok"` attempt converted to its final `LlmResult`, or `null` when
 *  it's `"retryable"` (the only kind that isn't terminal yet). */
function terminal(r: AttemptResult): LlmResult | null {
  switch (r.kind) {
    case "timeout": return { ok: false, reason: "timeout" };
    case "empty": return { ok: false, reason: "empty" };
    case "http": return { ok: false, reason: "http", status: r.status };
    case "retryable": return null;
    case "ok": return null;
  }
}

/** The HTTP status of a `"retryable"` or `"http"` attempt, for a final
 *  `ok: false` result once no more retries/fallback are available. */
function statusOf(r: AttemptResult): number | undefined {
  switch (r.kind) {
    case "retryable":
    case "http":
      return r.status;
    default:
      return undefined;
  }
}

function hasImages(req: LlmRequest): boolean {
  return req.messages.some((m) => (m.images?.length ?? 0) > 0);
}

/** One retry on 429/503 (after the provider's Retry-After, 1.5-8 s), then `fallbackModel` once (if
 *  configured, and only when the request has no images or the fallback can
 *  read them), else `ok: false`. With `opts.deadlineAt`, whatever doesn't
 *  fit before the deadline is skipped (see CallOptions): no time for a
 *  first attempt is `reason: "timeout"`; no time for the retry or the
 *  fallback ends on the last attempt's status. Never throws — fetch/parse
 *  failures map to an `LlmResult` reason. */
export async function callLlm(
  cfg: ProviderConfig,
  req: LlmRequest,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  opts: CallOptions = {},
): Promise<LlmResult> {
  const now = opts.now ?? Date.now;
  const minAttempt = opts.minAttemptMs ?? DEFAULT_MIN_ATTEMPT_MS;
  const perAttempt = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const left = () => (opts.deadlineAt === undefined ? Infinity : opts.deadlineAt - now());
  /** This attempt's timeout, or null when there isn't time to start one
   *  after waiting `waitMs` first. */
  const budgetFor = (waitMs: number): number | null => {
    const remaining = left() - waitMs;
    return remaining < minAttempt ? null : Math.min(perAttempt, remaining);
  };

  const firstBudget = budgetFor(0);
  if (firstBudget === null) return { ok: false, reason: "timeout" };
  const first = await attempt(cfg, req, cfg.model, fetchImpl, firstBudget);
  if (first.kind === "ok") return finalize(first, req, cfg, cfg.model);
  const doneFirst = terminal(first);
  if (doneFirst) return doneFirst;

  const wait = retryDelay(first);
  if (budgetFor(wait) === null) return { ok: false, reason: "http", status: statusOf(first) };
  await sleep(wait);
  const secondBudget = budgetFor(0);
  if (secondBudget === null) return { ok: false, reason: "http", status: statusOf(first) };
  const second = await attempt(cfg, req, cfg.model, fetchImpl, secondBudget);
  if (second.kind === "ok") return finalize(second, req, cfg, cfg.model);
  const doneSecond = terminal(second);
  if (doneSecond) return doneSecond;

  const fallbackModel = cfg.fallbackModel;
  const fallbackBudget = budgetFor(0);
  if (fallbackModel && fallbackBudget !== null && (!hasImages(req) || cfg.fallbackAcceptsImages)) {
    const fb = await attempt(cfg, req, fallbackModel, fetchImpl, fallbackBudget);
    if (fb.kind === "ok") return finalize(fb, req, cfg, fallbackModel);
    const doneFb = terminal(fb);
    if (doneFb) return doneFb;
    return { ok: false, reason: "http", status: statusOf(fb) };
  }

  return { ok: false, reason: "http", status: statusOf(second) };
}
