import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PORTAL_BUCKET, PHOTO_PREFIX, PHOTO_MAX_BYTES, PHOTO_TYPES,
} from "@/lib/portal/onboarding";
import { mirrorUserUpload } from "@/lib/google/drive-write";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Required student photo upload for onboarding. Multipart: field "file".
 * Student-only. Stores to the PRIVATE portal-data bucket at photos/<uid>.<ext>
 * and returns { path, url } where url is a short-lived signed preview link.
 */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.roles.includes("student")) {
    return NextResponse.json({ error: "Only students upload an onboarding photo." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const ext = PHOTO_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Please upload a JPG, PNG or WebP image." }, { status: 415 });
  if (file.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: `Image is too large (max ${PHOTO_MAX_BYTES / (1024 * 1024)} MB).` }, { status: 413 });
  }

  const supabase = createAdminClient();
  const path = `${PHOTO_PREFIX}/${user.id}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(PORTAL_BUCKET)
    .upload(path, buf, { upsert: true, contentType: file.type });
  if (upErr) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });

  const { data: signed } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrl(path, 3600);
  try {
    const label = user.fullName ? `${user.fullName} (${user.email})` : user.email;
    await mirrorUserUpload("profiles", user.id, label, `profile-${Date.now()}.${ext}`, file.type, buf);
  } catch { /* primary upload already succeeded */ }
  return NextResponse.json({ ok: true, path, url: signed?.signedUrl || null }, { status: 200 });
}
