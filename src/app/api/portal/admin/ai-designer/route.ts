import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/portal/admin";
import { IMAGE_BANK } from "@/lib/exam-lab/image-bank";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI Assignment Designer — staff-only agent that designs an Exam Lab paper /
 * assignment / test / challenge from a natural-language brief.
 *
 * The agent reasons over the REAL question bank (topics, papers, difficulty,
 * marks, years) and returns a concrete hand-picked question set + title +
 * instructions, ready to allocate via the existing exam-allocate flow. It
 * never invents questions — it only selects from the bank — so everything a
 * student receives is an exact CAIE original.
 *
 * POST { brief, mode?, count? } →
 *   { title, instructions, ids[], rationale, summary:{count,marks,topics} }
 */

type BankLite = { id: string; paperType: string; topic: string | null; level: string; marks: number; year: string };

function yearOf(code: string): string { const m = code.match(/9702_[smw](\d\d)_/); return m ? "20" + m[1] : ""; }

function bankSummary(): { topics: Record<string, { P1: number; P2: number; P4: number }>; years: string[] } {
  const topics: Record<string, { P1: number; P2: number; P4: number }> = {};
  const years = new Set<string>();
  for (const q of IMAGE_BANK) {
    const t = q.topic || "Other";
    if (!topics[t]) topics[t] = { P1: 0, P2: 0, P4: 0 };
    topics[t][q.paperType as "P1" | "P2" | "P4"]++;
    const y = yearOf(q.code); if (y) years.add(y);
  }
  return { topics, years: [...years].sort() };
}

/** Deterministic fallback designer when Gemini is unavailable. */
function fallbackDesign(brief: string, count: number): { title: string; instructions: string; ids: string[]; rationale: string } {
  const words = brief.toLowerCase();
  const wantP4 = /p4|paper 4|a2\b/.test(words); const wantP2 = /p2|paper 2|as\b|structured/.test(words);
  const paper = wantP4 ? "P4" : wantP2 ? "P2" : "P1";
  const topics = [...new Set(IMAGE_BANK.map((q) => q.topic).filter(Boolean) as string[])];
  const hit = topics.filter((t) => words.includes(t.toLowerCase().split(" ")[0]));
  const pool = IMAGE_BANK.filter((q) => q.paperType === paper && (!hit.length || (q.topic && hit.includes(q.topic))));
  const hot = pool.filter((q) => q.level === "HOT"), lot = pool.filter((q) => q.level === "LOT");
  const ids: string[] = [];
  const take = (arr: typeof pool, n: number) => { const a = [...arr].sort(() => Math.random() - 0.5); for (const q of a) { if (ids.length >= count || n-- <= 0) break; ids.push(q.id); } };
  take(lot, Math.ceil(count * 0.6)); take(hot, count); take(pool, count);
  return {
    title: `${hit.length ? hit.join(" & ") : "Mixed"} ${paper} practice`,
    instructions: "Answer every question. Work carefully and show your reasoning.",
    ids: [...new Set(ids)].slice(0, count),
    rationale: "Designed without AI (fallback): balanced LOT/HOT selection from the matching pool.",
  };
}

export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { brief?: string; count?: number } | null;
  const brief = (b?.brief || "").trim().slice(0, 1200);
  if (!brief) return NextResponse.json({ error: "Describe what you want to set (topics, paper, difficulty, purpose)." }, { status: 400 });
  const count = Math.max(1, Math.min(40, Math.round(b?.count || 10)));

  const key = process.env.GEMINI_API_KEY;
  let design: { title: string; instructions: string; ids: string[]; rationale: string } | null = null;

  if (key) {
    try {
      const { topics, years } = bankSummary();
      const sys = [
        "You are an expert CAIE A-Level Physics (9702) assessment designer.",
        "Design a question selection from the REAL bank described below. International-standard practice: balance recall (LOT) vs analysis (HOT), coherent topic focus, sensible mark total, progression from easier to harder.",
        "Bank topics with available counts per paper:",
        JSON.stringify(topics),
        `Years available: ${years.join(", ")}. Paper types: P1 (MCQ, 1 mark each), P2 (AS structured), P4 (A2 structured).`,
        "Reply ONLY with JSON: {\"title\":string,\"instructions\":string(student-facing),\"criteria\":{\"paperType\":\"P1\"|\"P2\"|\"P4\",\"topics\":string[](exact names from the bank, [] = all),\"levelMix\":{\"LOT\":number,\"HOT\":number}(fractions summing to 1),\"years\":string[]([]=all)},\"rationale\":string(one short paragraph for the teacher)}",
      ].join("\n");
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim()}:generateContent?key=${key}`,
        {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${sys}\n\nTeacher brief (${count} questions wanted):\n${brief}` }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: "application/json" },
          }),
        }
      );
      const j = await r.json().catch(() => null);
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = JSON.parse(text) as { title?: string; instructions?: string; rationale?: string; criteria?: { paperType?: string; topics?: string[]; levelMix?: { LOT?: number; HOT?: number }; years?: string[] } };
      const crit = parsed.criteria || {};
      const paper = ["P1", "P2", "P4"].includes(crit.paperType || "") ? crit.paperType : "P1";
      const tset = new Set((crit.topics || []).filter(Boolean));
      const yset = new Set((crit.years || []).filter(Boolean));
      const pool = IMAGE_BANK.filter((q) => q.paperType === paper && (!tset.size || (q.topic && tset.has(q.topic))) && (!yset.size || yset.has(yearOf(q.code))));
      if (pool.length) {
        const lotWant = Math.round(count * Math.max(0, Math.min(1, crit.levelMix?.LOT ?? 0.6)));
        const shuffled = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
        const lot = shuffled(pool.filter((q) => q.level === "LOT")).slice(0, lotWant);
        const hot = shuffled(pool.filter((q) => q.level === "HOT")).slice(0, count - lot.length);
        let ids = [...lot, ...hot].map((q) => q.id);
        if (ids.length < count) ids = [...new Set([...ids, ...shuffled(pool).map((q) => q.id)])].slice(0, count);
        // order easier → harder (LOT first, then by marks)
        const byId = new Map(IMAGE_BANK.map((q) => [q.id, q]));
        ids.sort((a, z) => { const qa = byId.get(a)!, qz = byId.get(z)!; return (qa.level === qz.level ? (qa.marks || 1) - (qz.marks || 1) : qa.level === "LOT" ? -1 : 1); });
        design = {
          title: (parsed.title || "AI-designed practice").slice(0, 140),
          instructions: (parsed.instructions || "Answer every question carefully.").slice(0, 1500),
          ids,
          rationale: (parsed.rationale || "").slice(0, 1200),
        };
      }
    } catch { design = null; }
  }
  if (!design) design = fallbackDesign(brief, count);

  const byId = new Map(IMAGE_BANK.map((q) => [q.id, q]));
  const qs = design.ids.map((id) => byId.get(id)).filter(Boolean);
  const summary = {
    count: qs.length,
    marks: qs.reduce((s, q) => s + (q!.marks || 1), 0),
    topics: [...new Set(qs.map((q) => q!.topic).filter(Boolean))],
    paperTypes: [...new Set(qs.map((q) => q!.paperType))],
    questions: qs.map((q) => ({ id: q!.id, ref: q!.ref, topic: q!.topic, level: q!.level, marks: q!.marks })),
  };
  return NextResponse.json({ ...design, summary }, { status: 200 });
}
