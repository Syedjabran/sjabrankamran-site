/**
 * Provider-independent AI physics tutor layer. SERVER-ONLY.
 *
 * Routes to whichever production API key is configured, in priority order:
 *   1. Anthropic Claude   (ANTHROPIC_API_KEY)
 *   2. OpenAI             (OPENAI_API_KEY)
 *   3. Google Gemini      (GEMINI_API_KEY)
 *
 * If none is configured, returns { provider: null } so the caller can store
 * the question for teacher review instead of failing.
 *
 * The tutor TEACHES — it never impersonates the teacher, never invents
 * citations, states uncertainty, and uses correct units & significant figures.
 */

export type TutorResult = { provider: string | null; answer: string | null; error?: string };

const SYSTEM = `You are the AI Physics Tutor for Physics Studio, an educational tool created by Cambridge Physics educator Syed Jabran Ali Kamran.

Rules:
- TEACH; do not merely give a final answer. Match the requested response mode.
- Never claim to be Syed Jabran Ali Kamran or a human teacher. You are an AI tutor.
- Use correct SI units and appropriate significant figures. Check dimensional consistency.
- State assumptions explicitly. State uncertainty honestly. Do not invent citations or fabricate exam mark schemes.
- Ground answers in standard Cambridge/IB physics. Do not reproduce copyrighted textbooks or full mark schemes.
- Use clear notation. Write equations in readable inline form (LaTeX-style is fine).
- Keep it focused, rigorous, and encouraging.`;

function buildPrompt(input: {
  question: string;
  curriculum: string;
  topic?: string;
  responseMode?: string;
}): string {
  return [
    `Curriculum: ${input.curriculum}`,
    input.topic ? `Topic: ${input.topic}` : "",
    input.responseMode ? `Response mode requested: ${input.responseMode}` : "",
    "",
    `Student question:`,
    input.question,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function askPhysicsTutor(input: {
  question: string;
  curriculum: string;
  topic?: string;
  responseMode?: string;
}): Promise<TutorResult> {
  const prompt = buildPrompt(input);

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
          max_tokens: 1200,
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = j?.content?.map((c: { text?: string }) => c.text).join("\n").trim();
        if (text) return { provider: "claude", answer: text };
      }
    }

    if (process.env.OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          max_tokens: 1200,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = j?.choices?.[0]?.message?.content?.trim();
        if (text) return { provider: "openai", answer: text };
      }
    }

    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (r.ok) {
        const j = await r.json();
        const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("\n").trim();
        if (text) return { provider: "gemini", answer: text };
      }
    }
  } catch (e) {
    return { provider: null, answer: null, error: (e as Error).message };
  }

  // No provider configured or all failed → defer to teacher review.
  return { provider: null, answer: null };
}
