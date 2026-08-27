import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "answer-scripts";
const GRACE_SEC = 300; // upload window = exam duration + 5 minutes

// Client asks the server to authorise a PDF answer-script upload. The server
// (its own clock) decides whether the submission is on-time or LATE (malpractice)
// and hands back a short-lived signed upload URL to the correct folder. A late
// script is routed to the `_late/` upload folder and flagged in the manifest.
const schema = z.object({
  mode: z.enum(["paper", "drill"]),
  paperType: z.enum(["P1", "P2", "P4", "mixed"]).optional(),
  code: z.string().max(40).optional(),
  ref: z.string().max(80).optional(),
  startedAt: z.number().int().positive(),
  durationSec: z.number().int().min(30).max(20000),
});

function stamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { mode, code, ref, paperType, startedAt, durationSec } = parsed.data;

  const now = Date.now();
  const elapsedSec = Math.max(0, Math.round((now - startedAt) / 1000));
  const allowedSec = durationSec + GRACE_SEC;
  const late = elapsedSec > allowedSec;
  const status: "ontime" | "late" = late ? "late" : "ontime";

  const safe = (code || mode).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "script";
  const path = `${late ? "_late/" : ""}${user.id}/${stamp()}__${safe}.pdf`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("answer sign error", error?.message);
    return NextResponse.json({ error: "Could not prepare the upload. Try again." }, { status: 500 });
  }

  // Append to the per-user manifest so the marker's upload folder shows late flags.
  try {
    const idxPath = `_index/${user.id}.json`;
    let items: unknown[] = [];
    const dl = await supabase.storage.from(BUCKET).download(idxPath);
    if (dl.data) {
      try {
        items = JSON.parse(await dl.data.text())?.items ?? [];
      } catch {
        items = [];
      }
    }
    items.push({
      ts: now, mode, paperType: paperType ?? null, code: code ?? null, ref: ref ?? null,
      status, elapsedSec, allowedSec, path, name: user.fullName || user.email,
    });
    const blob = new Blob([JSON.stringify({ items: (items as unknown[]).slice(-500) })], {
      type: "application/json",
    });
    await supabase.storage.from(BUCKET).upload(idxPath, blob, { upsert: true, contentType: "application/json" });
  } catch (e) {
    console.error("answer manifest error", (e as Error).message);
  }

  return NextResponse.json(
    { ok: true, status, late, elapsedSec, allowedSec, path, signedUrl: data.signedUrl, token: data.token },
    { status: 200 }
  );
}
