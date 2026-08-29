import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/portal/admin";
import { addAttachment, removeAttachment, signedAttachments, type AttachType } from "@/lib/portal/attachments";

export const runtime = "nodejs";
export const maxDuration = 60;

function okType(t: string | null): t is AttachType {
  return t === "assignment" || t === "assessment";
}

/** GET ?type=&id= → attachments with signed URLs. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id") || "";
  if (!okType(type) || !id) return NextResponse.json({ error: "type and id required." }, { status: 400 });
  return NextResponse.json({ attachments: await signedAttachments(type, id) }, { status: 200 });
}

/** POST multipart (type, id, file) → upload one file. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form." }, { status: 400 });
  const type = String(form.get("type") || "");
  const id = String(form.get("id") || "");
  const file = form.get("file") as File | null;
  if (!okType(type) || !id) return NextResponse.json({ error: "type and id required." }, { status: 400 });
  if (!file) return NextResponse.json({ error: "No file." }, { status: 400 });
  const r = await addAttachment(type, id, file);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  await audit(admin.id, "attachment.add", type, id, { name: r.attachment?.name });
  return NextResponse.json({ ok: true, attachment: r.attachment }, { status: 200 });
}

/** DELETE ?type=&id=&path= → remove one file. */
export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id") || "";
  const path = url.searchParams.get("path") || "";
  if (!okType(type) || !id || !path) return NextResponse.json({ error: "type, id, path required." }, { status: 400 });
  await removeAttachment(type, id, path);
  await audit(admin.id, "attachment.remove", type, id, { path });
  return NextResponse.json({ ok: true }, { status: 200 });
}
