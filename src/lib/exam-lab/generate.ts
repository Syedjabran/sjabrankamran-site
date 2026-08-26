/**
 * Exam Lab — "Model B" question generator. SERVER-ONLY.
 *
 * Public-website AI is GOOGLE GEMINI ONLY (site policy). Generates fresh
 * CAIE 9702-styled practice questions on demand.
 *
 * IMPORTANT: physics questions are LaTeX-heavy ($\frac$, $\times$, $\mathrm$…).
 * JSON is a poor carrier for that (lone backslashes are illegal JSON escapes and
 * commands like \f \t \n collide with JSON control escapes), so the model is
 * asked for a simple line-delimited format that needs NO escaping. Falls back to
 * the authored seed bank if the model is unavailable or returns nothing usable.
 */
import { BANK, ALL_TOPICS, type ELQuestion, type ELLevel, type ELType } from "./bank";
import { PASTPAPER_BANK } from "./pastpaper-bank";
import { groundingContext } from "@/lib/ai/web-search";

const SLOW_ALIASES = new Set(["gemini-flash-latest", "gemini-pro-latest"]);

function pickModel() {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  return configured && !SLOW_ALIASES.has(configured) ? configured : "gemini-3.1-flash-lite";
}

export type GenerateInput = {
  topics: string[];
  levels: ELLevel[];
  style: "mixed" | "mcq" | "structured";
  count: number;
};

export type GenerateResult = { source: "ai" | "seed"; questions: ELQuestion[]; provider: string | null; error?: string };

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seedFallback(input: GenerateInput, visibility: "public" | "portal"): ELQuestion[] {
  // Portal draws from the authored bank PLUS real ingested past-paper MCQs.
  const source = visibility === "portal" ? [...PASTPAPER_BANK, ...BANK] : BANK;
  const pool = source.filter((q) => {
    if (visibility === "public" && !(q.visibility === "public" || q.visibility === "both")) return false;
    if (visibility === "portal" && !(q.visibility === "portal" || q.visibility === "both")) return false;
    if (input.topics.length && !input.topics.includes(q.t)) return false;
    if (!input.levels.includes(q.lvl)) return false;
    if (input.style === "mcq" && q.type !== "mcq") return false;
    if (input.style === "structured" && q.type !== "structured") return false;
    return true;
  });
  return shuffle(pool).slice(0, input.count);
}

// ---------- line-delimited parser (LaTeX-safe) ------------------------------
type RawQ = {
  topic?: string;
  level?: string;
  type?: string;
  command?: string;
  marks?: number;
  stem?: string;
  options: string[];
  answer?: string;
  scheme: string[];
};

const KNOWN = new Set(["TOPIC", "LEVEL", "TYPE", "COMMAND", "MARKS", "STEM", "A", "B", "C", "D", "ANSWER", "MARK"]);

function parseBlocks(text: string): RawQ[] {
  const cleaned = text.replace(/```[a-z]*/gi, "").trim();
  const blocks = cleaned
    .split(/^\s*===Q===\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  const out: RawQ[] = [];
  for (const block of blocks) {
    const rec: RawQ = { options: [], scheme: [] };
    let last = "";
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z]+):\s?(.*)$/);
      const key = m ? m[1].toUpperCase() : "";
      if (!m || !KNOWN.has(key)) {
        if (last === "STEM" && rec.stem && line.trim()) rec.stem += " " + line.trim();
        continue;
      }
      const val = m[2].trim();
      switch (key) {
        case "TOPIC": rec.topic = val; last = "TOPIC"; break;
        case "LEVEL": rec.level = val.toUpperCase().replace(/[^A-Z]/g, ""); last = "LEVEL"; break;
        case "TYPE": rec.type = val.toLowerCase(); last = "TYPE"; break;
        case "COMMAND": rec.command = val; last = "COMMAND"; break;
        case "MARKS": rec.marks = parseInt(val, 10); last = "MARKS"; break;
        case "STEM": rec.stem = val; last = "STEM"; break;
        case "A": case "B": case "C": case "D": rec.options.push(val); last = "OPT"; break;
        case "ANSWER": rec.answer = val.toUpperCase().replace(/[^ABCD]/g, "").charAt(0); last = "ANSWER"; break;
        case "MARK": if (val) rec.scheme.push(val); last = "MARK"; break;
      }
    }
    if (rec.stem && rec.stem.length >= 8 && rec.scheme.length >= 1) out.push(rec);
  }
  return out;
}

export async function generateQuestions(
  input: GenerateInput,
  opts: { ground?: boolean } = {}
): Promise<GenerateResult> {
  const topics = input.topics.length ? input.topics : ["any AS or A2 9702 topic"];
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
      ? "EVERY question must be TYPE: mcq (four options A–D, exactly one correct)."
      : input.style === "structured"
      ? "EVERY question must be TYPE: structured (no options)."
      : "Mix mcq and structured questions.";

  const levelLine = levels
    .map((l) =>
      l === "LOT"
        ? "LOT = lower-order (State/Define/Calculate; single-step recall & application)"
        : "HOT = higher-order (Explain/Suggest/Show that/Compare/Evaluate; multi-step reasoning)"
    )
    .join("; ");

  const system = `You are a Cambridge International examiner writing ORIGINAL practice questions for AS & A Level Physics 9702 (2025-2027 syllabus). Never copy real past-paper wording; write fresh, exam-authentic questions. Output ONLY the delimited blocks specified — no preamble, no markdown fences.`;

  const prompt = `Write exactly ${input.count} question(s).
Topics to draw from: ${topics.join(", ")}.
Thinking levels (spread across the set): ${levelLine}.
${styleLine}

Physics rules:
- Correct physics, realistic self-consistent numbers.
- Typeset ALL mathematics in KaTeX using $...$ (inline) or $$...$$. Never use \\( \\) or \\[ \\]. Units upright, e.g. $9.81\\,\\mathrm{m\\,s^{-2}}$.

OUTPUT FORMAT — repeat this block per question, separated by a line containing exactly ===Q===
===Q===
TOPIC: <the ONE syllabus topic this question is about, copied from the list above>
LEVEL: LOT | HOT
TYPE: mcq | structured
COMMAND: <Cambridge command word: State, Define, Calculate, Determine, Explain, Suggest, Show that, Compare, Describe, Sketch>
MARKS: <integer; mcq=1, structured 3-6>
STEM: <the full question on ONE single line; LaTeX allowed>
A: <option A>            (mcq only)
B: <option B>            (mcq only)
C: <option C>            (mcq only)
D: <option D>            (mcq only)
ANSWER: <A|B|C|D>        (mcq only)
MARK: <one mark-scheme point>
MARK: <another mark-scheme point>
(repeat MARK for each marking point; for mcq include why the answer is correct)

Start the first block with ===Q=== and keep each field on its own single line.${grounding ? "\n\n" + grounding : ""}`;

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
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
        }),
        signal: ctrl.signal,
      }
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `http_${r.status}:${body.slice(0, 140)}` };
    }
    const j = await r.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    if (!text) {
      return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `empty:${JSON.stringify(j?.candidates?.[0]?.finishReason ?? j?.promptFeedback ?? "none").slice(0, 120)}` };
    }
    const raw = parseBlocks(text);
    if (raw.length === 0) {
      return { source: "seed", questions: seedFallback(input, "public"), provider: null, error: `parse_fail:${text.slice(0, 140)}` };
    }
    const questions: ELQuestion[] = raw.slice(0, input.count).map((g, i) => {
      const wantMcq = input.style === "mcq" || (input.style === "mixed" && g.type === "mcq");
      const isMcq = wantMcq && g.options.length === 4 && !!g.answer;
      const type: ELType = isMcq ? "mcq" : "structured";
      // Prefer the model's own tags when valid, so labels match the question.
      const modelLvl = g.level === "LOT" || g.level === "HOT" ? (g.level as ELLevel) : undefined;
      const lvl: ELLevel = modelLvl && levels.includes(modelLvl) ? modelLvl : levels[i % levels.length];
      const modelTopic = g.topic && ALL_TOPICS.includes(g.topic) ? g.topic : undefined;
      const tag = modelTopic || input.topics[i % Math.max(1, input.topics.length)] || (topics[0] as string);
      const ansIdx = g.answer ? "ABCD".indexOf(g.answer) : -1;
      return {
        id: `ai-${Date.now().toString(36)}-${i}`,
        t: tag,
        lvl,
        type,
        paper: isMcq ? "P1" : lvl === "HOT" ? "P4" : "P2",
        cmd: g.command || (type === "mcq" ? "Calculate" : "Explain"),
        marks: isMcq ? 1 : g.marks && g.marks > 0 ? g.marks : 4,
        stem: g.stem as string,
        opts: isMcq ? g.options : undefined,
        ans: isMcq ? (ansIdx >= 0 ? ansIdx : 0) : undefined,
        scheme: g.scheme.length ? g.scheme : ["Award marks for correct physics and working."],
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
  return seedFallback(input, "portal");
}
