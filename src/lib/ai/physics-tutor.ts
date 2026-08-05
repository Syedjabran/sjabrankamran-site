/**
 * Public-website AI Physics Tutor. SERVER-ONLY.
 *
 * POLICY (per JB, 2026-08-05): the public website uses GOOGLE GEMINI ONLY.
 * Claude and OpenAI are reserved for the Admin Portal — do not wire them
 * into any public-facing route. If GEMINI_API_KEY is missing or the call
 * fails, the question defers to teacher review instead of erroring.
 */

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

export async function askPhysicsTutor(input: {
  question: string; curriculum: string; topic?: string; responseMode?: string;
}): Promise<TutorResult> {
  const prompt = [
    `Curriculum: ${input.curriculum}`, input.topic ? `Topic: ${input.topic}` : "",
    input.responseMode ? `Response mode requested: ${input.responseMode}` : "",
    "", `Student question:`, input.question
  ].filter(Boolean).join("\n");

  if (!process.env.GEMINI_API_KEY) {
    // No provider configured → defer to teacher review.
    return { provider: null, answer: null };
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!r.ok) return { provider: null, answer: null, error: `gemini http ${r.status}` };
    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("\n").trim();
    if (text) return { provider: "gemini", answer: text };
  } catch (e) {
    return { provider: null, answer: null, error: (e as Error).message };
  }

  return { provider: null, answer: null };
}
