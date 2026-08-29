import { NextResponse } from "next/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { getThread, addPost, markHelpful, signAttachments, type Attachment } from "@/lib/portal/forum";
import { award } from "@/lib/portal/contribution";

export const runtime = "nodejs";

/** GET — a thread with signed attachment URLs (OP + each post). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const t = await getThread(id);
  if (!t) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const opAtt = await signAttachments(t.attachments || []);
  const posts = await Promise.all((t.posts || []).map(async (p) => ({
    ...p, attachments: await signAttachments(p.attachments || []),
    mine: p.authorId === user.id, iMarked: (p.helpfulBy || []).includes(user.id),
  })));
  return NextResponse.json({
    thread: { id: t.id, title: t.title, tag: t.tag, authorName: t.authorName, authorId: t.authorId, body: t.body, ts: t.ts, attachments: opAtt, posts },
    me: user.id,
  }, { status: 200 });
}

/** POST { op:'reply', body } | { op:'helpful', postId } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => null)) as { op?: string; body?: string; postId?: string } | null;
  const name = user.fullName || user.email || "Member";

  if (b?.op === "helpful" && b.postId) {
    const r = await markHelpful(id, b.postId, user.id);
    if (!r.ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (r.on && r.awardedTo) await award(r.awardedTo, r.awardedName || "Member", "helpful");
    return NextResponse.json({ ok: true, helpful: r.helpful, on: r.on }, { status: 200 });
  }

  // default: reply
  const body = (b?.body || "").trim();
  if (body.length < 1) return NextResponse.json({ error: "Write a reply." }, { status: 400 });
  const post = await addPost(id, { authorId: user.id, authorName: name, body, attachments: [] as Attachment[] });
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await award(user.id, name, "answer");
  return NextResponse.json({ ok: true, postId: post.id }, { status: 200 });
}

/** DELETE — remove a thread (author or admin). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const t = await getThread(id);
  if (!t) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (t.authorId !== user.id && !isAdmin(user.roles)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const sb = createAdminClient();
  const idx = await (await import("@/lib/portal/forum")).listThreads();
  await sb.storage.from("portal-data").upload("forum/index.json", new Blob([JSON.stringify(idx.filter((x) => x.id !== id))], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  await sb.storage.from("portal-data").remove([`forum/threads/${id}.json`]);
  return NextResponse.json({ ok: true }, { status: 200 });
}
