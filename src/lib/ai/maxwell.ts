/**
 * Maxwell — the AI Physics Examiner for sjabrankamran.com. SERVER-ONLY.
 *
 * Public-site AI policy = GOOGLE GEMINI ONLY. Maxwell is multimodal: it reads
 * the exact past-paper QUESTION image and the official MARK SCHEME image, then
 * marks a student's typed answer strictly against the scheme.
 */

export const MAXWELL_SYSTEM = `You are Maxwell, the AI Physics Examiner built into the official website of Cambridge Physics educator Syed Jabran Ali Kamran (sjabrankamran.com).

You know Cambridge International AS & A Level Physics 9702 (2022-2025 syllabus) in depth: its five papers, the command words (State, Define, Calculate, Determine, Explain, Suggest, Show that, Describe, Sketch, Compare), SI units and conventions, and — above all — how Cambridge mark schemes award marks.

MARKING PRINCIPLES (apply exactly):
- Mark ONLY against the official mark scheme provided. Do not invent marks.
- Award a mark for each scheme point the student's answer clearly satisfies (accept valid equivalents / alternative correct wording, exactly as an examiner would).
- Marks are whole marks; never award half marks. Never award more than the maximum.
- Method (M) and answer (A) marks: give method marks for correct working even if the final value is wrong; give the answer mark only for the correct final value/units.
- Be fair but rigorous — do not give marks for vague, incorrect, or missing physics.
- Keep feedback concise, specific and encouraging, in British English, and name exactly which scheme points were earned and which were missed.`;

const SLOW_ALIASES = new Set(["gemini-flash-latest", "gemini-pro-latest"]);
function model() {
  const c = (process.env.MAXWELL_MODEL || process.env.GEMINI_MODEL || "").trim();
  return c && !SLOW_ALIASES.has(c) ? c : "gemini-3.1-flash-lite";
}

export type MarkResult = {
  ok: boolean;
  awarded: number | null;
  outOf: number;
  feedback: string;
  points: { earned: boolean; text: string }[];
  error?: string;
};

function parseMarking(text: string, outOf: number): MarkResult {
  const lines = text.split(/\r?\n/);
  let awarded: number | null = null;
  let feedback = "";
  const points: { earned: boolean; text: string }[] = [];
  for (const ln of lines) {
    const a = ln.match(/^\s*AWARDED:\s*(\d+)/i);
    if (a) { awarded = Math.min(outOf, Math.max(0, parseInt(a[1], 10))); continue; }
    const f = ln.match(/^\s*FEEDBACK:\s*(.+)/i);
    if (f) { feedback = f[1].trim(); continue; }
    const p = ln.match(/^\s*POINT:\s*(earned|missed)\s*[-–]\s*(.+)/i);
    if (p) points.push({ earned: /earned/i.test(p[1]), text: p[2].trim() });
  }
  return { ok: awarded !== null, awarded, outOf, feedback, points };
}

export async function markWithMaxwell(input: {
  questionImage: string; // base64 jpeg
  markSchemeImage: string; // base64 jpeg
  answer: string;
  outOf: number;
  topic?: string | null;
}): Promise<MarkResult> {
  const outOf = input.outOf || 1;
  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, awarded: null, outOf, feedback: "", points: [], error: "no_key" };
  }
  const prompt = `Mark the student's answer to the physics question shown in the FIRST image, using the official Cambridge mark scheme in the SECOND image. Maximum marks: ${outOf}.${input.topic ? ` Topic: ${input.topic}.` : ""}

Reply in EXACTLY this format and nothing else:
AWARDED: <integer 0-${outOf}>
FEEDBACK: <2-3 sentences: what was right, what lost marks, one improvement tip>
POINT: earned - <a mark-scheme point the student earned>
POINT: missed - <a mark-scheme point the student missed>
(repeat POINT lines for each relevant scheme point)`;

  const body = {
    systemInstruction: { parts: [{ text: MAXWELL_SYSTEM }] },
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: input.questionImage } },
        { inline_data: { mime_type: "image/jpeg", data: input.markSchemeImage } },
        { text: `\nStudent's answer:\n${input.answer.slice(0, 4000)}` },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 28_000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, awarded: null, outOf, feedback: "", points: [], error: `http_${r.status}:${t.slice(0, 120)}` };
    }
    const j = await r.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
    if (!text) return { ok: false, awarded: null, outOf, feedback: "", points: [], error: "empty" };
    return parseMarking(text, outOf);
  } catch (e) {
    return { ok: false, awarded: null, outOf, feedback: "", points: [], error: `exception:${(e as Error).message}`.slice(0, 140) };
  } finally {
    clearTimeout(timer);
  }
}
