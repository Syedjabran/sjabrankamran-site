import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listThreads, createThread, type ForumTag } from "@/lib/portal/forum";
import { award } from "@/lib/portal/contribution";
import { notify } from "@/lib/portal/notifications";

export const runtime = "nodejs";

const TAGS: ForumTag[] = ["resource", "help", "topic", "discussion"];

/** GET ?tag= — list library threads. Any signed-in user. */
export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const tag = new URL(req.url).searchParams.get("tag") || undefined;
  try {
    return NextResponse.json({ threads: await listThreads(tag && TAGS.includes(tag as ForumTag) ? tag : undefined) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "The library couldn't be loaded. Please try again." }, { status: 503 });
  }
}

/** POST { title, body, tag } — start a thread (share / ask / raise a topic). */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { title?: string; body?: string; tag?: string } | null;
  const title = (b?.title || "").trim();
  const body = (b?.body || "").trim();
  const tag = (TAGS.includes((b?.tag || "") as ForumTag) ? b!.tag : "discussion") as ForumTag;
  if (title.length < 4) return NextResponse.json({ error: "Give your post a clear title." }, { status: 400 });
  const name = user.fullName || user.email || "Member";
  let thread: Awaited<ReturnType<typeof createThread>>;
  try {
    thread = await createThread({ title, body, tag, authorId: user.id, authorName: name, attachments: [] });
  } catch {
    return NextResponse.json({ error: "Your post couldn't be saved. Please try again." }, { status: 503 });
  }
  await award(user.id, name, tag === "topic" ? "topic" : "thread");
  // A shared resource is worth surfacing to every student's bell.
  if (tag === "resource") {
    await notify({ audience: "students" }, {
      type: "resource",
      title: `New resource: ${title}`,
      body: `${name} shared a resource in the Resource Library.`,
      href: "/portal/library",
    });
  }
  return NextResponse.json({ ok: true, id: thread.id }, { status: 200 });
}
