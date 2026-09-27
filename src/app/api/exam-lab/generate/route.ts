import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuestions, portalBankPool } from "@/lib/exam-lab/generate";
import { ALL_TOPICS_WITH_OL, type ELQuestion, type ELLevel } from "@/lib/exam-lab/bank";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCourseAccess } from "@/lib/portal/course-access";
import { questionKey, takeHit } from "@/lib/exam-lab/answer-rules";
import { questionById } from "@/lib/exam-lab/bank-all";
import { examLabKey } from "@/lib/exam-lab/keys";
import { sealableSet, withoutHeld, withoutKeys } from "@/lib/exam-lab/practice-set";
import { sealJson } from "@/lib/exam-lab/seal";
import { heldIds } from "@/lib/exam-lab/sittings";

export const runtime = "nodejs";

// Topics go straight into the Gemini prompt (and web search when grounding is
// on), so accept only the fixed syllabus list the Exam Lab UI offers.
const KNOWN_TOPICS = new Set(ALL_TOPICS_WITH_OL);

const schema = z.object({
  mode: z.enum(["public", "portal"]).default("public"),
  topics: z.array(z.string().refine((t) => KNOWN_TOPICS.has(t))).max(30).default([]),
  levels: z.array(z.enum(["LOT", "HOT"])).min(1).default(["LOT", "HOT"]),
  style: z.enum(["mixed", "mcq", "structured"]).default("mixed"),
  count: z.number().int().min(1).max(40).default(6),
  // Forwarded so a topic both courses share (e.g. Kinematics) draws from the right bank.
  course: z.enum(["9702", "5054"]).optional(),
});

// naive per-warm-instance rate limit
const hits = new Map<string, number[]>();

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Best-effort read of ingested past-paper questions from the portal bank
 *  (service role: the table is closed to anon/authenticated). */
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

/**
 * The questions go to the browser WITHOUT `ans` / `scheme`; those are sealed
 * into `set` (practice-set.ts), which /api/exam-lab/submit opens to mark the
 * whole set and hand the answers and mark schemes back.
 */
function issued(mode: "public" | "portal", uid: string | null, questions: ELQuestion[], extra: Record<string, unknown>) {
  const key = examLabKey("practice-set");
  if (!key) return NextResponse.json({ error: "Practice is unavailable right now. Please try again later." }, { status: 503 });
  const set = sealJson(sealableSet(mode, uid, questions, Date.now()), key);
  return NextResponse.json({ ok: true, ...extra, questions: questions.map(withoutKeys), set }, { status: 200, headers: { "cache-control": "no-store" } });
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
    if (!takeHit(hits, "portal:" + user.id, Date.now(), 60_000, 30)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });

    // Only a course the student is enrolled in; never a question held back
    // for them (the text copy of a past-paper question in an open test or
    // no-help assignment of theirs).
    let access;
    try { access = await resolveCourseAccess(user); } catch { return NextResponse.json({ error: "Your access couldn't be checked. Please try again." }, { status: 503 }); }
    const course = d.course ?? "9702";
    if (!access.allowed.includes(course)) return NextResponse.json({ error: "You do not have access to this course's papers." }, { status: 403 });
    let heldKeys = new Set<string>();
    if (!access.isStaff) {
      try {
        const held = await heldIds(user.id, Date.now());
        heldKeys = new Set([...held].map((id) => questionById(id)).filter((q) => !!q).map((q) => questionKey(q!.code, q!.qnum)));
      } catch {
        return NextResponse.json({ error: "Exam Lab is temporarily unavailable. Please retry." }, { status: 503 });
      }
    }

    const seed = portalBankPool({ topics: d.topics, levels: d.levels, style: d.style, count: 500, course });
    const db = await dbPortalPool(d.topics, d.levels, d.style);
    const merged = withoutHeld(shuffle([...db, ...seed]), heldKeys); // prefer real past papers first, then shuffle whole pool
    const available = merged.length;
    const questions = merged.slice(0, Math.min(d.count, available));
    return issued("portal", user.id, questions, { source: "portal-bank", available });
  }

  // Public: short, AI-generated (Model B) with graceful seed fallback.
  if (!takeHit(hits, "public:" + ip, Date.now(), 60_000, 8)) return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  const count = Math.min(d.count, 5); // public tests are short
  const ground = process.env.EXAM_LAB_WEB_GROUNDING === "1";
  const res = await generateQuestions(
    { topics: d.topics, levels: d.levels, style: d.style, count, course: d.course },
    { ground }
  );
  // Raw provider errors are for local debugging only, never for public callers.
  const diag = process.env.NODE_ENV === "development" && request.headers.get("x-el-diag") === "1";
  return issued("public", null, res.questions, {
    source: res.source,
    provider: res.provider,
    available: res.questions.length,
    ...(diag ? { debug: res.error ?? null } : {}),
  });
}
