export type TutorResult = { provider: string | null; answer: string | null; error?: string };

const SYSTEM = `You are the AI Physics Tutor for Physics Studio, created for the official website of Cambridge Physics educator Syed Jabran Ali Kamran.

Teach accurately at the student's stated curriculum level. Explain the physics before substituting numbers, show assumptions, distinguish scalars from vectors, and finish with a brief conceptual check. Do not merely provide a final answer.

PHYSICS AND MATHEMATICS NOTATION RULES:
- Use standard physics symbols and conventional notation: Δ for change, θ for angle, λ for wavelength, ρ for density, ω for angular velocity, α for angular acceleration, μ for coefficient of friction, and g for gravitational field strength.
- Use SI unit symbols correctly and case-sensitively: m, s, kg, N, J, W, Pa, C, V, A, Ω, Hz, T and Wb.
- Typeset every equation using KaTeX-compatible LaTeX.
- Use $...$ for inline mathematics and $$...$$ for displayed equations.
- Never use \\(...\\) or \\[...\\] delimiters.
- Write units upright with \\mathrm{}, for example $9.81\\,\\mathrm{m\\,s^{-2}}$.
- Use \\vec{} for vectors where direction matters and ordinary italic symbols for scalars.
- Define each symbol when it first appears.
- Do not place LaTeX equations inside Markdown code fences.

Be concise, supportive, and explicit about uncertainty. If a question is ambiguous or missing data, say what is missing instead of inventing it.`;

// Helper to wrap providers with fallbacks
async function tryProvider(_provider: string, call: () => Promise<string | null>): Promise<string | null> {
  try { return await call(); } catch { return null; }
}

export async function askPhysicsTutor(input: {
  question: string; curriculum: string; topic?: string; responseMode?: string;
}): Promise<TutorResult> {
  const prompt = [
    `Curriculum: ${input.curriculum}`, input.topic ? `Topic: ${input.topic}` : "",
    input.responseMode ? `Response mode requested: ${input.responseMode}` : "",
    "", `Student question:`, input.question
  ].filter(Boolean).join("\n");

  // 1. Anthropic (Primary)
  if (process.env.ANTHROPIC_API_KEY) {
    const res = await tryProvider("claude", async () => {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
          max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: prompt }]
        })
      });
      const j = await r.json();
      return j?.content?.map((c: any) => c.text).join("\n").trim() || null;
    });
    if (res) return { provider: "claude", answer: res };
  }

  // 2. OpenAI (Fallback 1)
  if (process.env.OPENAI_API_KEY) {
    const res = await tryProvider("openai", async () => {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY!}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }]
        })
      });
      const j = await r.json();
      return j?.choices?.[0]?.message?.content?.trim() || null;
    });
    if (res) return { provider: "openai", answer: res };
  }

  // 3. Google Gemini (Fallback 2)
  if (process.env.GEMINI_API_KEY) {
    const res = await tryProvider("gemini", async () => {
      const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: prompt }] }] })
      });
      const j = await r.json();
      return j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n").trim() || null;
    });
    if (res) return { provider: "gemini", answer: res };
  }

  return { provider: null, answer: null };
}
