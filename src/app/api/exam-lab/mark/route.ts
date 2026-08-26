import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_BANK } from "@/lib/exam-lab/image-bank";
import { markWithMaxwell } from "@/lib/ai/maxwell";

export const runtime = "nodejs";

const schema = z.object({ id: z.string().max(80), answer: z.string().min(1).max(6000) });

// per-warm-instance rate limit
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 12;
}

async function b64(supabase: ReturnType<typeof createAdminClient>, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("exam-assets").download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString("base64");
}

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Please slow down a moment." }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const q = IMAGE_BANK.find((x) => x.id === parsed.data.id);
  if (!q) return NextResponse.json({ error: "Unknown question." }, { status: 404 });
  if (q.paperType === "P1" || !q.ms_img) {
    return NextResponse.json({ error: "Maxwell marks structured questions only." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [qImg, msImg] = await Promise.all([b64(supabase, q.img), b64(supabase, q.ms_img)]);
  if (!qImg || !msImg) return NextResponse.json({ error: "Could not load the paper images." }, { status: 500 });

  const res = await markWithMaxwell({
    questionImage: qImg,
    markSchemeImage: msImg,
    answer: parsed.data.answer,
    outOf: q.marks || 1,
    topic: q.topic,
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Maxwell couldn’t mark this one — reveal the mark scheme and self-mark." }, { status: 502 });
  }
  return NextResponse.json(
    { ok: true, awarded: res.awarded, outOf: res.outOf, feedback: res.feedback, points: res.points },
    { status: 200 }
  );
}
