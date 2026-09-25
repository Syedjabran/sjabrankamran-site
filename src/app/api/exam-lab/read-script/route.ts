import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeScript } from "@/lib/ai/handwriting";
import { isSafeStorageKey } from "@/lib/request-guards";

export const runtime = "nodejs";

const BUCKET = "answer-scripts";
const schema = z.object({ path: z.string().min(5).max(200) });

// per-warm-instance rate limit
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 6;
}

// Reads a candidate's own uploaded PDF answer script and returns a faithful
// handwriting transcription (Gemini vision). Owner-scoped: a user may only read
// scripts stored under their own uid folder.
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Please slow down a moment." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { path } = parsed.data;

  // storage-js does not encode keys, so reject traversal before the prefix check.
  if (!isSafeStorageKey(path)) return NextResponse.json({ error: "Invalid script path." }, { status: 400 });
  // Ownership: `<uid>/...` or `_late/<uid>/...`
  const owns = path.startsWith(`${user.id}/`) || path.startsWith(`_late/${user.id}/`);
  if (!owns) return NextResponse.json({ error: "Not your script." }, { status: 403 });
  const scriptKey = new RegExp(`^(?:_late/)?${user.id}/[A-Za-z0-9._/-]+\\.[pP][dD][fF]$`);
  if (!scriptKey.test(path)) return NextResponse.json({ error: "PDF only." }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return NextResponse.json({ error: "Could not load the script." }, { status: 404 });

  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.length > 18 * 1024 * 1024) {
    return NextResponse.json({ error: "Script too large to read (max 18 MB)." }, { status: 413 });
  }
  const res = await transcribeScript(buf.toString("base64"));
  if (!res.ok) return NextResponse.json({ error: "Maxwell couldn’t read this script." }, { status: 502 });
  return NextResponse.json({ ok: true, text: res.text }, { status: 200 });
}
