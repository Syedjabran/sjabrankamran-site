import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { uploadAttachment, appendAttachment } from "@/lib/portal/forum";
import { award } from "@/lib/portal/contribution";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST multipart (file, postId?) — attach a resource to a thread's OP (or a reply). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form." }, { status: 400 });
  const file = form.get("file") as File | null;
  const postId = (form.get("postId") as string) || undefined;
  if (!file) return NextResponse.json({ error: "No file." }, { status: 400 });

  const up = await uploadAttachment(id, user.id, file);
  if (!up.ok || !up.attachment) return NextResponse.json({ error: up.error || "Upload failed." }, { status: 400 });
  const ok = await appendAttachment(id, up.attachment, postId);
  if (!ok) return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  await award(user.id, user.fullName || user.email || "Member", "resource");
  return NextResponse.json({ ok: true, attachment: { ...up.attachment, url: up.url } }, { status: 200 });
}
