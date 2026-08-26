/**
 * Exam Lab — "Model B" question generator. SERVER-ONLY.
 *
 * Public-website AI is GOOGLE GEMINI ONLY (site policy). Generates fresh
 * CAIE 9702-styled practice questions on demand. Falls back to the authored
 * seed bank if the model is unavailable or returns unusable output, so the
 * public tool always produces a paper.
 */
import { z } from "zod";
import { BANK, type ELQuestion, type ELLevel, type ELType } from "./bank";
import { groundingContext } from "@/lib/ai/web-search";

const genQuestion = z.object({
  stem: z.string().min(8).max(1200),
  type: z.enum(["mcq", "structured"]),
  command: z.string().min(2).max(24),
  marks: z.number().int().min(1).max(12),
  options: z.array(z.string().min(1).max(300)).length(4).optional(),
  answer_index: z.number().int().min(0).max(3).optional(),
  scheme: z.array(z.string().min(1).max(400)).min(1).max(8),
});
const genArray = z.array(genQuestion).min(1).max(20);

const SLOW_ALIASES = new Set(["gemini-flash-latest", "gemini-pro-latest"]);

function pickModel() {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  return configured && !SLOW_ALIASES.has(configured) ? configured : "gemini-3.1-flash-lite";
}

function stripFences(s: string) {
  return s.replace(/```(?:json)?/gi, "").trim();
}

/** Best-effort: parse a JSON array even if the model wrapped it in prose. */
function extractJsonArray(text: string): unknown | null {
  const cleaned = stripFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const GEN_SYSTEM = `You are a Cambridge International examiner writing ORIGINAL practice questions for AS & A Level Physics 9702 (2025-2027 syllabus). You never copy real past-paper wording. You always reply with a single valid JSON array and nothing else — no prose, no markdown code fences.`;

export type GenerateInput = {
  topics: string[];
  levels: ELLevel[];
  style: "mixed" | "mcq" | "structured";
  count: number;
};

export type GenerateResult = { source: "ai" | "seed"; questions: ELQuestion[]; provider: string | null; error?: string };

function seedFallback(input: GenerateInput, visibility: "public" | "portal"): ELQuestion[] {
  const pool = BANK.filter((q) => {
    if (visibility === "public" && !(q.visibility === "public" || q.visibility === "both")) return false;
    if (input.topics.length && !input.topics.includes(q.t)) return false;
    if (!input.levels.includes(q.lvl)) return false;
    if (input.style === "mcq" && q.type !== "mcq") return false;
    if (input.style === "structured" && q.type !== "structured") return false;
    return true;
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, input.count);
}

export async function generateQuestions(
  input: GenerateInput,
  opts: { ground?: boolean } = {}
): Promise<GenerateResult> {
  const topics = input.topics.length ? input.topics : ["any AS or A2 topic"];
  const levels = input.levels.length ? input.levels : (["LOT", "HOT"] as ELLevel[]);

  if (!process.env.GEMINI_API_KEY) {
    return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: "no_key" };
  }

  let grounding = "";
  if (opts.ground) {
    grounding = await groundingContext(`CAIE A Level Physics 9702 ${topics.join(", ")} exam question`, 3);
  }

  const styleLine =
    input.style === "mcq"
      ? "Every question MUST be a 4-option (A–D) multiple-choice question (type \"mcq\") with exactly one correct option."
      : input.style === "structured"
      ? "Every question MUST be a structured short-answer question (type \"structured\") — no options."
      : "Mix MCQ and structured questions.";

  const levelLine = levels
    .map((l) =>
      l === "LOT"
        ? "LOT = lower-order thinking (State / Define / Calculate / single-step recall & application)"
        : "HOT = higher-order thinking (Explain / Suggest / Show that / Compare / Evaluate — multi-step reasoning)"
    )
    .join("; ");

  const prompt = `You are a Cambridge International examiner writing ORIGINAL practice questions for AS & A Level Physics 9702 (2025-2027 syllabus). Do NOT copy any real past-paper wording; write fresh questions in the authentic Cambridge style.

Produce exactly ${input.count} question(s).
Topics to draw from: ${topics.join(", ")}.
Thinking levels to use (spread them across the set): ${levelLine}.
${styleLine}

Rules:
- Use correct physics and realistic numbers; keep values self-consistent.
- Typeset ALL mathematics in KaTeX using $...$ (inline) or $$...$$ (display). Never use \\( \\) or \\[ \\].
- Units upright with \\mathrm{}, e.g. $9.81\\,\\mathrm{m\\,s^{-2}}$.
- "command" = the Cambridge command word (State, Define, Calculate, Determine, Explain, Suggest, "Show that", Compare, Describe, Sketch).
- "marks" reflects difficulty (MCQ = 1; structured 3–6).
- "scheme" = the mark-scheme points (each a distinct marking point / the correct working). For MCQ include why the answer is right.
- For MCQ: provide 4 plausible "options" (index 0–3) and the correct "answer_index".
${grounding ? "\n" + grounding + "\n" : ""}
Return ONLY a JSON array (no prose, no markdown fences). Each element:
{"stem": string, "type": "mcq"|"structured", "command": string, "marks": number, "options"?: [4 strings], "answer_index"?: number, "scheme": [strings]}`;

  const model = pickModel();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 22_000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: GEN_SYSTEM }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
        }),
        signal: ctrl.signal,
      }
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `http_${r.status}:${body.slice(0, 160)}` };
    }
    const j = await r.json();
    const text: string =
      j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    if (!text) return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `empty:${JSON.stringify(j?.candidates?.[0]?.finishReason ?? j?.promptFeedback ?? "none").slice(0,120)}` };
    const arr = extractJsonArray(text);
    if (arr === null) return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `parse_fail:${text.slice(0, 120)}` };
    const parsed = genArray.safeParse(arr);
    if (!parsed.success || parsed.data.length === 0) {
      return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `zod_fail:${JSON.stringify(parsed.success ? "empty" : parsed.error.issues.slice(0,2)).slice(0,180)}` };
    }
    const questions: ELQuestion[] = parsed.data.slice(0, input.count).map((g, i) => {
      const type = (input.style === "mcq" ? "mcq" : input.style === "structured" ? "structured" : g.type) as ELType;
      const isMcq = type === "mcq" && Array.isArray(g.options) && g.options.length === 4;
      const lvl = levels[i % levels.length];
      return {
        id: `ai-${Date.now().toString(36)}-${i}`,
        t: input.topics[i % Math.max(1, input.topics.length)] || "Physics 9702",
        lvl,
        type: isMcq ? "mcq" : "structured",
        paper: isMcq ? "P1" : lvl === "HOT" ? "P4" : "P2",
        cmd: g.command,
        marks: isMcq ? 1 : g.marks,
        stem: g.stem,
        opts: isMcq ? g.options : undefined,
        ans: isMcq ? (typeof g.answer_index === "number" ? g.answer_index : 0) : undefined,
        scheme: g.scheme,
        source: "ai",
        visibility: "public",
      };
    });
    return { source: "ai", questions, provider: "gemini" };
  } catch (e) {
    return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `exception:${(e as Error).message}`.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

export function portalBankPool(input: GenerateInput): ELQuestion[] {
  return seedFallbackPortal(input);
}

function seedFallbackPortal(input: GenerateInput): ELQuestion[] {
  const pool = BANK.filter((q) => {
    if (!(q.visibility === "portal" || q.visibility === "both")) return false;
    if (input.topics.length && !input.topics.includes(q.t)) return false;
    if (!input.levels.includes(q.lvl)) return false;
    if (input.style === "mcq" && q.type !== "mcq") return false;
    if (input.style === "structured" && q.type !== "structured") return false;
    return true;
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, input.count);
}
