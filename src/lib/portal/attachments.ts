/**
 * Assignment / test attachments. SERVER-ONLY (service-role).
 *
 * Files live in the private `edu-resources` bucket under
 *   <type>/<id>/<ts>-<safe-name>
 * and a lightweight index is kept as Storage-as-DB in `portal-data` at
 *   attachments/<type>-<id>.json      (no schema migration required)
 *
 * `type` is "assignment" | "assessment". Access is always gated by the caller
 * (admin APIs, or the student's own assignment page).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export const RES_BUCKET = "edu-resources";
export const IDX_BUCKET = "portal-data";
export const ATTACH_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
export const ATTACH_ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
  "application/zip": "zip",
};

export type AttachType = "assignment" | "assessment";
export type Attachment = { path: string; name: string; size: number; ct: string; ts: number };

function idxPath(type: AttachType, id: string) {
  return `attachments/${type}-${id}.json`;
}

export async function listAttachments(type: AttachType, id: string): Promise<Attachment[]> {
  try {
    const sb = createAdminClient();
    const { data } = await sb.storage.from(IDX_BUCKET).download(idxPath(type, id));
    if (data) return JSON.parse(await data.text()) as Attachment[];
  } catch {
    /* none */
  }
  return [];
}

async function writeIndex(type: AttachType, id: string, list: Attachment[]): Promise<boolean> {
  try {
    const sb = createAdminClient();
    const body = new Blob([JSON.stringify(list)], { type: "application/json" });
    const { error } = await sb.storage.from(IDX_BUCKET).upload(idxPath(type, id), body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch {
    return false;
  }
}

/** Attach a list with fresh signed URLs (1h) for display/download. */
export async function signedAttachments(type: AttachType, id: string): Promise<(Attachment & { url: string | null })[]> {
  const list = await listAttachments(type, id);
  if (!list.length) return [];
  const sb = createAdminClient();
  const { data } = await sb.storage.from(RES_BUCKET).createSignedUrls(list.map((a) => a.path), 3600);
  const byPath = new Map((data || []).map((d) => [d.path, d.signedUrl] as const));
  return list.map((a) => ({ ...a, url: byPath.get(a.path) ?? null }));
}

export async function addAttachment(type: AttachType, id: string, file: File): Promise<{ ok: boolean; error?: string; attachment?: Attachment }> {
  if (!file || file.size === 0) return { ok: false, error: "Empty file." };
  if (file.size > ATTACH_MAX_BYTES) return { ok: false, error: "File exceeds 15 MB." };
  let ext = (ATTACH_ALLOWED[file.type] || (file.name.split(".").pop() || "").toLowerCase()).trim();
  if (ext === "jpeg") ext = "jpg";
  if (!Object.values(ATTACH_ALLOWED).includes(ext)) return { ok: false, error: `Unsupported file type (${file.type || ext}).` };
  // Store a content-type we trust (derived from the validated extension), not the
  // client-supplied MIME.
  const safeCt = Object.entries(ATTACH_ALLOWED).find(([, v]) => v === ext)?.[0] || "application/octet-stream";
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${type}/${id}/${Date.now()}-${safe}`;
  const sb = createAdminClient();
  const { error } = await sb.storage.from(RES_BUCKET).upload(path, file, { contentType: safeCt, upsert: false });
  if (error) return { ok: false, error: error.message };
  const attachment: Attachment = { path, name: file.name, size: file.size, ct: safeCt, ts: Date.now() };
  const list = await listAttachments(type, id);
  list.push(attachment);
  await writeIndex(type, id, list);
  return { ok: true, attachment };
}

export async function removeAttachment(type: AttachType, id: string, path: string): Promise<boolean> {
  const sb = createAdminClient();
  try {
    await sb.storage.from(RES_BUCKET).remove([path]);
  } catch {
    /* ignore storage miss */
  }
  const list = (await listAttachments(type, id)).filter((a) => a.path !== path);
  return writeIndex(type, id, list);
}
