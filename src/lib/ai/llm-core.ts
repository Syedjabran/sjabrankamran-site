// Provider-agnostic LLM request building, parsing and retry. PURE: no `@/`
// alias, no `server-only`, no `process.env` — `fetch` and `sleep` are always
// injected so this runs under plain Node in tests with fakes (see
// scripts/test-llm-core.mjs) and under the real network in src/lib/ai/llm.ts.

export type LlmImage = { mime: "image/jpeg" | "image/png"; base64: string };
export type LlmMessage = { role: "user" | "assistant"; content: string; images?: LlmImage[] };
export type LlmRequest = { system: string; messages: LlmMessage[]; json: boolean; maxTokens: number; temperature?: number };
export type ProviderConfig = { provider: "gemini" | "groq"; apiKey: string; model: string; fallbackModel?: string; timeoutMs?: number };
export type LlmResult =
  | { ok: true; text: string; json: unknown | null; provider: string; model: string; usage: { input: number; output: number } }
  | { ok: false; reason: "timeout" | "http" | "parse" | "empty" | "no-provider"; status?: number };

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([429, 503]);

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

  const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i !== -1);
  if (!starts.length) return null;
  const from = Math.min(...starts);
  const sub = t.slice(from);

  const fromStart = tryParse(sub);
  if (fromStart) return fromStart.value;

  const ends = [sub.lastIndexOf("}"), sub.lastIndexOf("]")].filter((i) => i !== -1);
  if (!ends.length) return null;
  const to = Math.max(...ends);
  const trimmed = tryParse(sub.slice(0, to + 1));
  return trimmed ? trimmed.value : null;
}

type AttemptResult =
  | { kind: "ok"; text: string; usage: { input: number; output: number } }
  | { kind: "retryable"; status: number }
  | { kind: "http"; status?: number }
  | { kind: "timeout" }
  | { kind: "empty" };

async function attempt(cfg: ProviderConfig, req: LlmRequest, model: string, fetchImpl: typeof fetch): Promise<AttemptResult> {
  const isGroq = cfg.provider === "groq";
  const url = isGroq ? GROQ_URL : geminiUrl(model, cfg.apiKey);
  const body = isGroq ? buildGroqBody(req, model) : buildGeminiBody(req);
  const headers: Record<string, string> = isGroq
    ? { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` }
    : { "content-type": "application/json" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
  } catch (e) {
    if (e && typeof e === "object" && (e as { name?: string }).name === "AbortError") return { kind: "timeout" };
    return { kind: "http" };
  } finally {
    clearTimeout(timer);
  }

  if (RETRYABLE_STATUS.has(res.status)) return { kind: "retryable", status: res.status };
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

function terminal(r: AttemptResult): LlmResult | null {
  if (r.kind === "timeout") return { ok: false, reason: "timeout" };
  if (r.kind === "empty") return { ok: false, reason: "empty" };
  if (r.kind === "http") return { ok: false, reason: "http", status: r.status };
  return null;
}

/** One retry after 1.5 s on 429/503, then `fallbackModel` once (if
 *  configured), else `ok: false`. Never throws — fetch/parse failures map to
 *  an `LlmResult` reason. */
export async function callLlm(
  cfg: ProviderConfig,
  req: LlmRequest,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<LlmResult> {
  const first = await attempt(cfg, req, cfg.model, fetchImpl);
  if (first.kind === "ok") return finalize(first, req, cfg, cfg.model);
  const doneFirst = terminal(first);
  if (doneFirst) return doneFirst;

  await sleep(1500);
  const second = await attempt(cfg, req, cfg.model, fetchImpl);
  if (second.kind === "ok") return finalize(second, req, cfg, cfg.model);
  const doneSecond = terminal(second);
  if (doneSecond) return doneSecond;

  if (cfg.fallbackModel) {
    const fb = await attempt(cfg, req, cfg.fallbackModel, fetchImpl);
    if (fb.kind === "ok") return finalize(fb, req, cfg, cfg.fallbackModel);
    const doneFb = terminal(fb);
    if (doneFb) return doneFb;
    return { ok: false, reason: "http", status: (fb as { status?: number }).status };
  }

  return { ok: false, reason: "http", status: (second as { status?: number }).status };
}
