// Node tests for the pure LLM adapter core (src/lib/ai/llm-core.ts).
// fetch and sleep are injected so every scenario is deterministic and fast —
// no real network calls, no real timers.
import assert from "node:assert/strict";
import {
  buildGroqBody,
  buildGeminiBody,
  parseGroq,
  parseGemini,
  extractJson,
  callLlm,
  selectProvider,
} from "../src/lib/ai/llm-core.ts";

// --- buildGroqBody -----------------------------------------------------------

{
  const req = {
    system: "SYS PROMPT",
    messages: [{ role: "user", content: "hello", images: [{ mime: "image/png", base64: "AAAA" }] }],
    json: true,
    maxTokens: 500,
  };
  const body = buildGroqBody(req, "test-model");
  assert.equal(body.model, "test-model");
  assert.equal(body.messages[0].role, "system", "system message comes first");
  assert.equal(body.messages[0].content, "SYS PROMPT");
  assert.equal(body.messages[1].role, "user");
  assert.ok(Array.isArray(body.messages[1].content), "a message with images uses content parts");
  const textPart = body.messages[1].content.find((p) => p.type === "text");
  assert.equal(textPart.text, "hello");
  const imgPart = body.messages[1].content.find((p) => p.type === "image_url");
  assert.equal(imgPart.image_url.url, "data:image/png;base64,AAAA");
  assert.deepEqual(body.response_format, { type: "json_object" }, "json:true sets response_format");
  assert.equal(body.max_tokens, 500);

  const noJson = buildGroqBody({ system: "s", messages: [{ role: "user", content: "hi" }], json: false, maxTokens: 100 }, "m");
  assert.equal("response_format" in noJson, false, "json:false omits response_format");
  assert.equal(noJson.messages[1].content, "hi", "no images → plain string content");
}

// --- buildGeminiBody ---------------------------------------------------------

{
  const req = {
    system: "SYS PROMPT",
    messages: [{ role: "user", content: "hello", images: [{ mime: "image/jpeg", base64: "BBBB" }] }],
    json: true,
    maxTokens: 300,
  };
  const body = buildGeminiBody(req);
  assert.equal(body.systemInstruction.parts[0].text, "SYS PROMPT");
  assert.equal(body.contents[0].role, "user");
  const textPart = body.contents[0].parts.find((p) => "text" in p);
  assert.equal(textPart.text, "hello");
  const imgPart = body.contents[0].parts.find((p) => "inline_data" in p);
  assert.deepEqual(imgPart.inline_data, { mime_type: "image/jpeg", data: "BBBB" });
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.maxOutputTokens, 300);

  const noJson = buildGeminiBody({ system: "s", messages: [{ role: "assistant", content: "hi" }], json: false, maxTokens: 100 });
  assert.equal("responseMimeType" in noJson.generationConfig, false, "json:false omits responseMimeType");
  assert.equal(noJson.contents[0].role, "model", "assistant maps to Gemini's model role");
}

// --- parseGroq / parseGemini --------------------------------------------------

{
  const parsed = parseGroq({ choices: [{ message: { content: "hi there" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  assert.deepEqual(parsed, { text: "hi there", usage: { input: 10, output: 5 } });
  assert.equal(parseGroq({ choices: [] }), null, "no choices");
  assert.equal(parseGroq({ choices: [{ message: { content: "" } }] }), null, "empty content");
}

{
  const parsed = parseGemini({
    candidates: [{ content: { parts: [{ text: "hi there" }] } }],
    usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 3 },
  });
  assert.deepEqual(parsed, { text: "hi there", usage: { input: 8, output: 3 } });
  assert.equal(parseGemini({ candidates: [] }), null, "no candidates");
}

// --- extractJson ---------------------------------------------------------------

assert.deepEqual(extractJson('{"a":1}'), { a: 1 }, "plain JSON");
assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 }, "fenced json block");
assert.deepEqual(extractJson('```\n{"a":1}\n```'), { a: 1 }, "fenced block, no language tag");
assert.deepEqual(extractJson('Sure, here you go:\n{"a":1}'), { a: 1 }, "leading prose");
assert.deepEqual(extractJson('{"a":1}\nHope that helps!'), { a: 1 }, "trailing prose");
assert.equal(extractJson("not json at all"), null, "invalid input");
assert.equal(extractJson(""), null, "empty string");
assert.deepEqual(extractJson('See [1] for details: {"a":1}'), { a: 1 }, "a stray leading bracket in prose doesn't win over the real JSON");

// --- callLlm -------------------------------------------------------------------

const groqReq = { system: "s", messages: [{ role: "user", content: "hi" }], json: true, maxTokens: 100 };

function fakeRes(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// 503 then 200 → ok; exactly one retry, sleep called once with 1500ms.
{
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return fakeRes(503, {});
    return fakeRes(200, { choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
  };
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const cfg = { provider: "groq", apiKey: "k", model: "primary-model" };
  const res = await callLlm(cfg, groqReq, fetchImpl, sleep);
  assert.equal(res.ok, true);
  assert.equal(res.model, "primary-model");
  assert.deepEqual(res.json, { a: 1 });
  assert.deepEqual(res.usage, { input: 1, output: 2 });
  assert.equal(calls, 2, "one retry (two calls total)");
  assert.deepEqual(sleeps, [1500]);
}

// 429 with Retry-After → the one retry waits that long (at least 1.5 s,
// at most 8 s); an unreadable header keeps the 1.5 s default.
for (const [header, want] of [["4", 4000], ["0.5", 1500], ["120", 8000], ["soon", 1500]]) {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return { ...fakeRes(429, {}), headers: new Headers({ "retry-after": header }) };
    return fakeRes(200, { choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } });
  };
  const sleeps = [];
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, fetchImpl, async (ms) => { sleeps.push(ms); });
  assert.equal(res.ok, true);
  assert.deepEqual(sleeps, [want], `Retry-After "${header}" waits ${want} ms`);
}

// --- an overall deadline (fake clock): what doesn't fit is skipped --------------
function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; }, sleep: async (ms) => { t += ms; } };
}
const okBody = { choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } };

// Room for the Retry-After wait and a second attempt → it retries.
{
  const c = clock();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    c.advance(1000);
    return calls === 1 ? { ...fakeRes(429, {}), headers: new Headers({ "retry-after": "4" }) } : fakeRes(200, okBody);
  };
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, fetchImpl, c.sleep, { deadlineAt: 45_000, now: c.now });
  assert.equal(res.ok, true);
  assert.equal(calls, 2);
}

// No room for the wait plus a useful attempt → no sleep, no retry, ok:false.
{
  const c = clock();
  let calls = 0;
  const sleeps = [];
  const fetchImpl = async () => { calls++; c.advance(1000); return { ...fakeRes(429, {}), headers: new Headers({ "retry-after": "4" }) }; };
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m", fallbackModel: "fb" }, groqReq, fetchImpl, async (ms) => { sleeps.push(ms); await c.sleep(ms); }, { deadlineAt: 8000, now: c.now });
  assert.deepEqual(res, { ok: false, reason: "http", status: 429 });
  assert.equal(calls, 1, "the retry doesn't fit");
  assert.deepEqual(sleeps, [], "and neither does its wait");
}

// The retry fits but the fallback doesn't → two calls, no fallback.
{
  const c = clock();
  const models = [];
  const fetchImpl = async (_url, opts) => { models.push(JSON.parse(opts.body).model); c.advance(10_000); return fakeRes(503, {}); };
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m", fallbackModel: "fb" }, groqReq, fetchImpl, c.sleep, { deadlineAt: 25_000, now: c.now });
  assert.equal(res.ok, false);
  assert.equal(res.status, 503);
  assert.deepEqual(models, ["m", "m"], "the fallback doesn't fit");
}

// Out of time before the first call → nothing is sent.
{
  const c = clock(50_000);
  let calls = 0;
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, async () => { calls++; return fakeRes(200, okBody); }, c.sleep, { deadlineAt: 45_000, now: c.now });
  assert.deepEqual(res, { ok: false, reason: "timeout" });
  assert.equal(calls, 0);
}

// An attempt's own timeout shrinks to the time left (real timers, tiny budget).
{
  const started = Date.now();
  const hanging = (_url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m", timeoutMs: 20_000 }, groqReq, hanging, async () => {}, { deadlineAt: started + 150, minAttemptMs: 50 });
  assert.deepEqual(res, { ok: false, reason: "timeout" });
  assert.ok(Date.now() - started < 2000, "aborted at the deadline, not after the 20 s attempt timeout");
}

// 503, 503 → switches to fallbackModel → ok with model = fallback.
{
  let calls = 0;
  const seenModels = [];
  const fetchImpl = async (_url, opts) => {
    calls++;
    seenModels.push(JSON.parse(opts.body).model);
    if (calls <= 2) return fakeRes(503, {});
    return fakeRes(200, { choices: [{ message: { content: '{"b":2}' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } });
  };
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const cfg = { provider: "groq", apiKey: "k", model: "primary-model", fallbackModel: "fallback-model" };
  const res = await callLlm(cfg, groqReq, fetchImpl, sleep);
  assert.equal(res.ok, true);
  assert.equal(res.model, "fallback-model");
  assert.deepEqual(res.json, { b: 2 });
  assert.equal(calls, 3);
  assert.deepEqual(seenModels, ["primary-model", "primary-model", "fallback-model"]);
  assert.deepEqual(sleeps, [1500], "no extra sleep before the fallback attempt");
}

// 503, 503, no fallback configured → ok:false http (final status), no throw.
{
  const fetchImpl = async () => fakeRes(503, {});
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, fetchImpl, async () => {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, "http");
  assert.equal(res.status, 503);
}

// A request with images + 503, 503 + a fallback that can't read images →
// ok:false with the last attempt's reason/status; fetch is called exactly
// twice (the fallback is never attempted).
{
  let calls = 0;
  const fetchImpl = async () => { calls++; return fakeRes(503, {}); };
  const reqWithImages = {
    system: "s",
    messages: [{ role: "user", content: "hi", images: [{ mime: "image/png", base64: "AAAA" }] }],
    json: true,
    maxTokens: 100,
  };
  const cfg = { provider: "groq", apiKey: "k", model: "primary-model", fallbackModel: "fallback-model", fallbackAcceptsImages: false };
  const res = await callLlm(cfg, reqWithImages, fetchImpl, async () => {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, "http");
  assert.equal(res.status, 503);
  assert.equal(calls, 2, "the image-blind fallback is never called");
}

// The same shape, but the fallback CAN read images → it is used normally.
{
  let calls = 0;
  const seenModels = [];
  const fetchImpl = async (_url, opts) => {
    calls++;
    seenModels.push(JSON.parse(opts.body).model ?? "gemini");
    if (calls <= 2) return fakeRes(503, {});
    return fakeRes(200, { choices: [{ message: { content: '{"c":3}' } }], usage: {} });
  };
  const reqWithImages = {
    system: "s",
    messages: [{ role: "user", content: "hi", images: [{ mime: "image/png", base64: "AAAA" }] }],
    json: true,
    maxTokens: 100,
  };
  const cfg = { provider: "groq", apiKey: "k", model: "primary-model", fallbackModel: "fallback-model", fallbackAcceptsImages: true };
  const res = await callLlm(cfg, reqWithImages, fetchImpl, async () => {});
  assert.equal(res.ok, true);
  assert.equal(res.model, "fallback-model");
  assert.equal(calls, 3, "the image-capable fallback is used");
}

// 400 → ok:false http, without retry.
{
  let calls = 0;
  const fetchImpl = async () => { calls++; return fakeRes(400, {}); };
  let sleptCalled = false;
  const sleep = async () => { sleptCalled = true; };
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m", fallbackModel: "fb" }, groqReq, fetchImpl, sleep);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "http");
  assert.equal(res.status, 400);
  assert.equal(calls, 1, "no retry on a non-retryable status");
  assert.equal(sleptCalled, false);
}

// timeout → ok:false timeout.
{
  const fetchImpl = async () => { throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" }); };
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, fetchImpl, async () => {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, "timeout");
}

// empty choices → ok:false empty.
{
  const fetchImpl = async () => fakeRes(200, { choices: [] });
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, fetchImpl, async () => {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, "empty");
}

// json requested but the reply can't be parsed as JSON → ok:false parse.
{
  const fetchImpl = async () => fakeRes(200, { choices: [{ message: { content: "not json" } }], usage: {} });
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, groqReq, fetchImpl, async () => {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, "parse");
}

// json:false never attempts extraction; ok:true with json:null.
{
  const fetchImpl = async () => fakeRes(200, { choices: [{ message: { content: "plain text reply" } }], usage: {} });
  const req = { ...groqReq, json: false };
  const res = await callLlm({ provider: "groq", apiKey: "k", model: "m" }, req, fetchImpl, async () => {});
  assert.equal(res.ok, true);
  assert.equal(res.text, "plain text reply");
  assert.equal(res.json, null);
}

// Gemini provider: body/parse wiring goes through callLlm too.
{
  const fetchImpl = async (url) => {
    assert.ok(url.includes("generativelanguage.googleapis.com"), "gemini endpoint");
    return fakeRes(200, { candidates: [{ content: { parts: [{ text: '{"g":1}' }] } }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 } });
  };
  const res = await callLlm({ provider: "gemini", apiKey: "k", model: "gm" }, groqReq, fetchImpl, async () => {});
  assert.equal(res.ok, true);
  assert.equal(res.provider, "gemini");
  assert.deepEqual(res.json, { g: 1 });
}

// --- selectProvider ------------------------------------------------------------

// SAT_AI_PROVIDER wins even when the other provider's key is also set.
{
  const cfg = selectProvider({ SAT_AI_PROVIDER: "groq", GEMINI_API_KEY: "gk", GROQ_API_KEY: "qk" });
  assert.equal(cfg.provider, "groq");
  assert.equal(cfg.apiKey, "qk");
}
{
  const cfg = selectProvider({ SAT_AI_PROVIDER: "gemini", GEMINI_API_KEY: "gk", GROQ_API_KEY: "qk" });
  assert.equal(cfg.provider, "gemini");
  assert.equal(cfg.apiKey, "gk");
}

// No override: GEMINI_API_KEY set → gemini.
{
  const cfg = selectProvider({ GEMINI_API_KEY: "gk" });
  assert.equal(cfg.provider, "gemini");
  assert.equal(cfg.apiKey, "gk");
  assert.equal(cfg.model, "gemini-3.1-flash-lite");
  assert.equal(cfg.fallbackAcceptsImages, true);
}

// GEMINI_MODEL override, and the slow-alias guard still applies.
{
  const cfg = selectProvider({ GEMINI_API_KEY: "gk", GEMINI_MODEL: "gemini-2.0-flash" });
  assert.equal(cfg.model, "gemini-2.0-flash");
  const slow = selectProvider({ GEMINI_API_KEY: "gk", GEMINI_MODEL: "gemini-flash-latest" });
  assert.equal(slow.model, "gemini-3.1-flash-lite", "the slow generic alias is ignored");
}

// GROQ_API_KEY only → groq, with the qwen/gpt-oss defaults and an
// image-blind fallback.
{
  const cfg = selectProvider({ GROQ_API_KEY: "qk" });
  assert.equal(cfg.provider, "groq");
  assert.equal(cfg.apiKey, "qk");
  assert.equal(cfg.model, "qwen/qwen3.8-27b");
  assert.equal(cfg.fallbackModel, "openai/gpt-oss-20b");
  assert.equal(cfg.fallbackAcceptsImages, false);
}

// GROQ_MODEL / GROQ_FALLBACK_MODEL overrides.
{
  const cfg = selectProvider({ GROQ_API_KEY: "qk", GROQ_MODEL: "custom-model", GROQ_FALLBACK_MODEL: "custom-fallback" });
  assert.equal(cfg.model, "custom-model");
  assert.equal(cfg.fallbackModel, "custom-fallback");
}

// Neither key set → null (every caller has a deterministic fallback).
assert.equal(selectProvider({}), null);
assert.equal(selectProvider({ SAT_AI_PROVIDER: "groq" }), null, "an override with no matching key still yields null");

console.log("llm-core tests passed");
