/**
 * Handwriting reader — SERVER-ONLY. Uses Google Gemini's multimodal vision to
 * transcribe ANY handwriting from an uploaded answer-script PDF (cursive, print,
 * mixed, diagrams-with-labels) into clean text an examiner (or Maxwell) can mark.
 *
 * Public-site AI policy = GOOGLE GEMINI ONLY.
 */

const SLOW_ALIASES = new Set(["gemini-flash-latest", "gemini-pro-latest"]);
function model() {
  const c = (process.env.MAXWELL_MODEL || process.env.GEMINI_MODEL || "").trim();
  return c && !SLOW_ALIASES.has(c) ? c : "gemini-3.1-flash-lite";
}

const SYSTEM = `You are a meticulous transcription assistant for Cambridge A-Level Physics answer scripts. You faithfully read handwriting of every style — neat, cursive, hurried, upper/lower case, mixed scripts — and any typed text. You transcribe EXACTLY what the candidate wrote, preserving question numbers and part labels (1(a), 2(b)(i)), equations, units and working. You never invent, correct or mark content. Represent equations in plain text (e.g. "v = u + at"). If a passage is genuinely illegible, write "[illegible]" for just that passage.`;

export type ReadResult = { ok: boolean; text: string; error?: string };

export async function transcribeScript(pdfBase64: string): Promise<ReadResult> {
  if (!process.env.GEMINI_API_KEY) return { ok: false, text: "", error: "no_key" };

  const prompt = `Transcribe this handwritten/typed answer script in full. Keep the candidate's question/part numbering and layout. Output ONLY the transcription (no commentary, no marking).`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, text: "", error: `http_${r.status}:${t.slice(0, 140)}` };
    }
    const j = await r.json();
    const text: string =
      j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    if (!text.trim()) return { ok: false, text: "", error: "empty" };
    return { ok: true, text: text.trim() };
  } catch (e) {
    return { ok: false, text: "", error: `exception:${(e as Error).message}`.slice(0, 140) };
  } finally {
    clearTimeout(timer);
  }
}
