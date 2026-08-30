/**
 * Resource Library / Forum. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * A shared space where portal users share resources, ask for help, raise new
 * topics and collaborate. No DDL: threads/posts live as JSON in portal-data,
 * uploaded files live in the private `portal-library` bucket.
 *
 *   portal-data/forum/index.json         → [ThreadMeta] (newest first, capped)
 *   portal-data/forum/threads/<id>.json  → { ...ThreadMeta, posts: Post[] }
 *   portal-library/<threadId>/<file>     → attachments
 */
import { createAdminClient } from "@/lib/supabase/admin";

const DATA = "portal-data";
export const LIB_BUCKET = "portal-library";
const INDEX = "forum/index.json";

export type ForumTag = "resource" | "help" | "topic" | "discussion";
export type Attachment = { path: string; name: string; size: number };
export type Post = { id: string; authorId: string; authorName: string; body: string; attachments: Attachment[]; ts: number; helpful: number; helpfulBy: string[] };
export type ThreadMeta = { id: string; title: string; tag: ForumTag; authorId: string; authorName: string; ts: number; lastTs: number; replies: number; resources: number };
export type Thread = ThreadMeta & { body: string; attachments: Attachment[]; posts: Post[] };

function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function tpath(id: string) { return `forum/threads/${id}.json`; }

async function readJson<T>(bucket: string, path: string, fallback: T): Promise<T> {
  try {
    const { data } = await createAdminClient().storage.from(bucket).download(path);
    if (data) return JSON.parse(await data.text()) as T;
  } catch { /* none */ }
  return fallback;
}
async function writeJson(bucket: string, path: string, obj: unknown): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify(obj)], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(bucket).upload(path, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch { return false; }
}

export async function listThreads(tag?: string): Promise<ThreadMeta[]> {
  const idx = await readJson<ThreadMeta[]>(DATA, INDEX, []);
  const sorted = idx.sort((a, b) => b.lastTs - a.lastTs);
  return tag ? sorted.filter((t) => t.tag === tag) : sorted;
}

export async function getThread(id: string): Promise<Thread | null> {
  return readJson<Thread | null>(DATA, tpath(id), null);
}

async function updateIndex(meta: ThreadMeta) {
  const idx = await readJson<ThreadMeta[]>(DATA, INDEX, []);
  const i = idx.findIndex((t) => t.id === meta.id);
  if (i >= 0) idx[i] = meta; else idx.unshift(meta);
  await writeJson(DATA, INDEX, idx.slice(0, 500));
}

export async function createThread(input: { title: string; body: string; tag: ForumTag; authorId: string; authorName: string; attachments: Attachment[] }): Promise<Thread> {
  const id = newId();
  const now = Date.now();
  const thread: Thread = {
    id, title: input.title.slice(0, 200), tag: input.tag, authorId: input.authorId, authorName: input.authorName,
    ts: now, lastTs: now, replies: 0, resources: input.attachments.length ? 1 : 0,
    body: input.body, attachments: input.attachments, posts: [],
  };
  await writeJson(DATA, tpath(id), thread);
  const { body: _b, attachments: _a, posts: _p, ...meta } = thread; void _b; void _a; void _p;
  await updateIndex(meta);
  return thread;
}

export async function addPost(threadId: string, input: { authorId: string; authorName: string; body: string; attachments: Attachment[] }): Promise<Post | null> {
  const thread = await getThread(threadId);
  if (!thread) return null;
  const post: Post = { id: newId(), authorId: input.authorId, authorName: input.authorName, body: input.body, attachments: input.attachments, ts: Date.now(), helpful: 0, helpfulBy: [] };
  thread.posts.push(post);
  thread.replies = thread.posts.length;
  thread.resources += input.attachments.length ? 1 : 0;
  thread.lastTs = post.ts;
  await writeJson(DATA, tpath(threadId), thread);
  const { body: _b, attachments: _a, posts: _p, ...meta } = thread; void _b; void _a; void _p;
  await updateIndex(meta);
  return post;
}

/** Toggle a "helpful" mark on a post by a user. Returns the target post's authorId if it newly became helpful (for awarding points). */
export async function markHelpful(threadId: string, postId: string, byUid: string): Promise<{ ok: boolean; awardedTo?: string; awardedName?: string; helpful?: number; on?: boolean }> {
  const thread = await getThread(threadId);
  if (!thread) return { ok: false };
  const post = thread.posts.find((p) => p.id === postId);
  if (!post) return { ok: false };
  post.helpfulBy = post.helpfulBy || [];
  const had = post.helpfulBy.includes(byUid);
  let awardedTo: string | undefined;
  if (had) { post.helpfulBy = post.helpfulBy.filter((u) => u !== byUid); }
  else { post.helpfulBy.push(byUid); if (post.authorId !== byUid) awardedTo = post.authorId; }
  post.helpful = post.helpfulBy.length;
  await writeJson(DATA, tpath(threadId), thread);
  return { ok: true, awardedTo, awardedName: post.authorName, helpful: post.helpful, on: !had };
}

/** Upload a library attachment; returns metadata + signed URL. */
export async function uploadAttachment(threadId: string, uid: string, file: File): Promise<{ ok: boolean; error?: string; attachment?: Attachment; url?: string | null }> {
  const MAX = 25 * 1024 * 1024;
  const ALLOW: Record<string, string> = {
    "application/pdf": "pdf", "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/plain": "txt", "application/zip": "zip",
  };
  if (!file || file.size === 0) return { ok: false, error: "Empty file." };
  if (file.size > MAX) return { ok: false, error: "File exceeds 25 MB." };
  let ext = ALLOW[file.type] || (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  if (!Object.values(ALLOW).includes(ext)) return { ok: false, error: `Unsupported file type.` };
  const safeCt = Object.entries(ALLOW).find(([, v]) => v === ext)?.[0] || "application/octet-stream";
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(-80);
  const tid = threadId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40) || "new";
  const path = `${tid}/${uid}-${Date.now()}-${safe}`;
  const sb = createAdminClient();
  const { error } = await sb.storage.from(LIB_BUCKET).upload(path, file, { contentType: safeCt, upsert: false });
  if (error) return { ok: false, error: error.message };
  const { data: signed } = await sb.storage.from(LIB_BUCKET).createSignedUrl(path, 3600);
  return { ok: true, attachment: { path, name: file.name, size: file.size }, url: signed?.signedUrl ?? null };
}

/** Append an uploaded attachment to a thread's opening post (postId omitted) or a reply. */
export async function appendAttachment(threadId: string, att: Attachment, postId?: string): Promise<boolean> {
  const thread = await getThread(threadId);
  if (!thread) return false;
  if (postId) {
    const post = thread.posts.find((p) => p.id === postId);
    if (!post) return false;
    post.attachments = [...(post.attachments || []), att];
  } else {
    thread.attachments = [...(thread.attachments || []), att];
  }
  thread.resources += 1;
  thread.lastTs = Date.now();
  await writeJson(DATA, tpath(threadId), thread);
  const { body: _b, attachments: _a, posts: _p, ...meta } = thread; void _b; void _a; void _p;
  await updateIndex(meta);
  return true;
}

export async function signAttachments(atts: Attachment[]): Promise<(Attachment & { url: string | null })[]> {
  if (!atts.length) return [];
  const sb = createAdminClient();
  const { data } = await sb.storage.from(LIB_BUCKET).createSignedUrls(atts.map((a) => a.path), 3600);
  const byPath = new Map((data || []).map((d) => [d.path, d.signedUrl] as const));
  return atts.map((a) => ({ ...a, url: byPath.get(a.path) ?? null }));
}
