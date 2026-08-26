import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuestions, portalBankPool } from "@/lib/exam-lab/generate";
import type { ELQuestion, ELLevel } from "@/lib/exam-lab/bank";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  mode: z.enum(["public", "portal"]).default("public"),
  topics: z.array(z.string().max(60)).max(30).default([]),
  levels: z.array(z.enum(["LOT", "HOT"])).min(1).default(["LOT", "HOT"]),
  style: z.enum(["mixed", "mcq", "structured"]).default("mixed"),
  count: z.number().int().min(1).max(40).default(6),
});

// naive per-warm-instance rate limit
const hits = new Map<string, number[]>();
function limited(ip: string, max: number) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Best-effort read of ingested past-paper questions from the portal bank. */
async function dbPortalPool(
  topics: string[],
  levels: ELLevel[],
  style: string
): Promise<ELQuestion[]> {
  try {
    const supabase = createAdminClient();
    let q = supabase
      .from("el_questions")
      .select("id,topic,level,qtype,paper,command_word,marks,stem,options,answer_index,scheme,source,visibility")
      .eq("is_active", true)
      .in("visibility", ["portal", "both"])
      .in("level", levels)
      .limit(400);
    if (topics.length) q = q.in("topic", topics);
    if (style === "mcq") q = q.eq("qtype", "mcq");
    if (style === "structured") q = q.eq("qtype", "structured");
    const { data, error } = await q;
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id as string,
      t: r.topic as string,
      lvl: r.level as ELLevel,
      type: r.qtype as "mcq" | "structured",
      paper: (r.paper as "P1" | "P2" | "P4") ?? "P2",
      cmd: (r.command_word as string) ?? "",
      marks: (r.marks as number) ?? 1,
      stem: r.stem as string,
      opts: (r.options as string[] | null) ?? undefined,
      ans: (r.answer_index as number | null) ?? undefined,
      scheme: (r.scheme as string[] | null) ?? [],
      source: (r.source as string) ?? "pastpaper",
      visibility: "portal" as const,
    }));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please check your selections." }, { status: 400 });
  const d = parsed.data;

  if (d.mode === "portal") {
    // Portal bank is auth-gated (CAIE exact-pattern / real past-paper material).
    const user = await getPortalUser();
    if (!user) return NextResponse.json({ error: "Please sign in to the portal." }, { status: 401 });
    if (limited("portal:" + ip, 30)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });

    const seed = portalBankPool({ topics: d.topics, levels: d.levels, style: d.style, count: 500 });
    const db = await dbPortalPool(d.topics, d.levels, d.style);
    const merged = shuffle([...db, ...seed]); // prefer real past papers first, then shuffle whole pool
    const available = merged.length;
    const questions = merged.slice(0, Math.min(d.count, available));
    return NextResponse.json({ ok: true, source: "portal-bank", available, questions }, { status: 200 });
  }

  // Public: short, AI-generated (Model B) with graceful seed fallback.
  if (limited("public:" + ip, 8)) return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  const count = Math.min(d.count, 5); // public tests are short
  const ground = process.env.EXAM_LAB_WEB_GROUNDING === "1";
  const res = await generateQuestions(
    { topics: d.topics, levels: d.levels, style: d.style, count },
    { ground }
  );
  return NextResponse.json(
    { ok: true, source: res.source, provider: res.provider, available: res.questions.length, questions: res.questions },
    { status: 200 }
  );
}
