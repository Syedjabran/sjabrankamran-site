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

console.log("llm-core tests passed");
