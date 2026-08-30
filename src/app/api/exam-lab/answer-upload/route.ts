import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mirrorUserUpload } from "@/lib/google/drive-write";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "answer-scripts";
const MAX = 15 * 1024 * 1024; // 15 MB
// kind "drawing" = annotated question image (png); "attachment" = PDF/Word/image.
const DRAW_TYPES: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };
const ATTACH_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};

/** POST multipart (kind, qid, code, file) — student writes-on-paper drawings and
 * PDF/Word answer attachments for Exam Lab. Any authed user; stored under their
 * own uid folder in the private answer-scripts bucket. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form." }, { status: 400 });

  // Strict whitelist — kind is interpolated into the storage key.
  const kind = String(form.get("kind") || "attachment") === "drawing" ? "drawing" : "attachment";
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(0, 60);
  const qid = clean(String(form.get("qid") || "q"));
  const code = clean(String(form.get("code") || "exam"));
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "File exceeds 15 MB." }, { status: 400 });

  const allow = kind === "drawing" ? DRAW_TYPES : ATTACH_TYPES;
  const ext = allow[file.type] || (file.name.split(".").pop() || "").toLowerCase();
  if (!Object.values(allow).includes(ext)) return NextResponse.json({ error: `Unsupported file type (${file.type || ext}).` }, { status: 400 });
  const safeCt = Object.entries(allow).find(([, v]) => v === ext)?.[0] || "application/octet-stream";

  const path = `${user.id}/exam-answers/${code}/${qid}-${kind}-${Date.now()}.${ext}`;
  const sb = createAdminClient();
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: safeCt, upsert: kind === "drawing" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  // Best-effort mirror into Google Drive → sjabrankamran.com/Tests/<student>
  try {
    const label = user.fullName ? `${user.fullName} (${user.email})` : user.email;
    await mirrorUserUpload("tests", user.id, label, `${code}-${qid}-${Date.now()}.${ext}`, safeCt, file);
  } catch { /* optional */ }
  return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null, name: file.name }, { status: 200 });
}
