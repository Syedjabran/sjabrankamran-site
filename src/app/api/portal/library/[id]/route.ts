import { NextResponse } from "next/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { getThread, addPost, markHelpful, react, normReactions, signAttachments, isThreadId, type Attachment, type Reactions } from "@/lib/portal/forum";
import { award } from "@/lib/portal/contribution";

export const runtime = "nodejs";

// Storage-as-DB reads throw on a real failure (so no write follows them);
// surface that as a retryable JSON error instead of an empty 500.
const unavailable = () => NextResponse.json({ error: "The library couldn't be loaded right now — please try again." }, { status: 503 });
const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });

/** GET — a thread with signed attachment URLs (OP + each post). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  if (!isThreadId(id)) return notFound();
  const t = await getThread(id).catch(() => undefined);
  if (t === undefined) return unavailable();
  if (!t) return notFound();
  const opAtt = await signAttachments(t.attachments || []);
  const posts = await Promise.all((t.posts || []).map(async (p) => ({
    ...p, attachments: await signAttachments(p.attachments || []),
    mine: p.authorId === user.id, iMarked: (p.helpfulBy || []).includes(user.id),
    reactions: normReactions(p.reactions),
  })));
  return NextResponse.json({
    thread: { id: t.id, title: t.title, tag: t.tag, authorName: t.authorName, authorId: t.authorId, body: t.body, ts: t.ts, attachments: opAtt, posts, reactions: normReactions(t.reactions), resources: t.resources ?? 0 },
    me: user.id, meName: user.fullName || user.email || "Member",
  }, { status: 200 });
}

/** POST { op:'reply', body } | { op:'helpful', postId } | { op:'reaction', postId?, reaction } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  if (!isThreadId(id)) return notFound();
  const b = (await req.json().catch(() => null)) as { op?: string; body?: string; postId?: string; reaction?: keyof Reactions } | null;
  const name = user.fullName || user.email || "Member";

  try {
    if (b?.op === "helpful" && b.postId) {
      const r = await markHelpful(id, b.postId, user.id);
      if (!r.ok) return notFound();
      // awardedTo is only set the first time this member marks this post.
      if (r.on && r.awardedTo) await award(r.awardedTo, r.awardedName || "Member", "helpful");
      return NextResponse.json({ ok: true, helpful: r.helpful, on: r.on }, { status: 200 });
    }
    if (b?.op === "reaction" && b.reaction && ["like", "dislike", "love"].includes(b.reaction)) {
      const r = await react(id, b.postId || null, b.reaction, user.id);
      if (!r.ok) return notFound();
      return NextResponse.json({ ok: true, reactions: r.reactions }, { status: 200 });
    }
  } catch {
    return unavailable();
  }

  // default: reply
  const body = (b?.body || "").trim();
  if (body.length < 1) return NextResponse.json({ error: "Write a reply." }, { status: 400 });
  const post = await addPost(id, { authorId: user.id, authorName: name, body, attachments: [] as Attachment[] }).catch(() => undefined);
  if (post === undefined) return unavailable();
  if (!post) return notFound();
  await award(user.id, name, "answer");
  return NextResponse.json({ ok: true, postId: post.id, post: { id: post.id, authorId: user.id, authorName: name, body: post.body, attachments: [], ts: post.ts, helpful: 0, mine: true, iMarked: false, reactions: { like: [], dislike: [], love: [] } } }, { status: 200 });
}

/** DELETE — remove a thread (author or admin). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  if (!isThreadId(id)) return notFound();
  const t = await getThread(id).catch(() => undefined);
  if (t === undefined) return unavailable();
  if (!t) return notFound();
  if (t.authorId !== user.id && !isAdmin(user.roles)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const sb = createAdminClient();
  // A failed index read must not be rewritten as an (empty) index.
  const idx = await (await import("@/lib/portal/forum")).listThreads().catch(() => null);
  if (!idx) return unavailable();
  await sb.storage.from("portal-data").upload("forum/index.json", new Blob([JSON.stringify(idx.filter((x) => x.id !== id))], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  await sb.storage.from("portal-data").remove([`forum/threads/${id}.json`]);
  return NextResponse.json({ ok: true }, { status: 200 });
}
