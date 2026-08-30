/**
 * Physics Resources. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * A curated resource library visible to EVERY signed-in portal user, where only
 * super-admins/admins publish materials — documents, images, videos,
 * animations, PDFs — plus external links (YouTube, Google Drive, web).
 *
 * No DDL. Metadata is JSON in `portal-data`; uploaded files live in the private
 * `physics-resources` bucket and are served via short-lived signed URLs.
 *
 *   portal-data/resources/index.json   → { items: ResourceItem[] }
 *   physics-resources/<id>/<file>      → uploaded binaries
 */
import { createAdminClient } from "@/lib/supabase/admin";

const DATA = "portal-data";
export const RES_BUCKET = "physics-resources";
const INDEX = "resources/index.json";

export type ResourceKind = "pdf" | "image" | "video" | "animation" | "document" | "audio" | "link";
export type ResourceSource = "upload" | "link" | "youtube" | "drive";

export type ResourceItem = {
  id: string;
  title: string;
  description: string;
  category: string;        // topic / section, e.g. "Mechanics", "P4 Fields"
  kind: ResourceKind;
  source: ResourceSource;
  path: string | null;     // storage path (uploads)
  url: string | null;      // external URL (links) or original file url
  mime: string | null;
  size: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
};

/** Item as returned to clients (adds a fresh signed/display URL). */
export type ResourceView = ResourceItem & { href: string | null; embedUrl: string | null };

function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

async function readIndex(): Promise<ResourceItem[]> {
  try {
    const { data } = await createAdminClient().storage.from(DATA).download(INDEX);
    if (data) { const j = JSON.parse(await data.text()); return Array.isArray(j) ? j : (j.items || []); }
  } catch { /* none */ }
  return [];
}
async function writeIndex(items: ResourceItem[]): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify({ items })], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(DATA).upload(INDEX, body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch { return false; }
}

const EXT_KIND: Record<string, ResourceKind> = {
  pdf: "pdf",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", svg: "image",
  mp4: "video", webm: "video", mov: "video", mkv: "video", m4v: "video",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio",
  doc: "document", docx: "document", ppt: "document", pptx: "document", xls: "document", xlsx: "document", txt: "document", zip: "document",
  html: "animation", htm: "animation", swf: "animation",
};

export function kindFromName(name: string, mime?: string): ResourceKind {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (EXT_KIND[ext]) return EXT_KIND[ext];
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "document";
}

/** Classify an external URL into a source + kind + embeddable form. */
export function classifyUrl(url: string): { source: ResourceSource; kind: ResourceKind; embedUrl: string | null } {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* */ }
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    const id = ytId(url);
    return { source: "youtube", kind: "video", embedUrl: id ? `https://www.youtube.com/embed/${id}` : null };
  }
  if (host === "drive.google.com" || host === "docs.google.com") {
    return { source: "drive", kind: "document", embedUrl: drivePreview(url) };
  }
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  return { source: "link", kind: EXT_KIND[ext] || "link", embedUrl: null };
}

function ytId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    return u.searchParams.get("v");
  } catch { return null; }
}
function drivePreview(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return url.replace(/\/edit.*$/, "/preview");
}

/** List all resources (any signed-in user) with fresh signed URLs. */
export async function listResources(): Promise<ResourceView[]> {
  const items = (await readIndex()).sort((a, b) => b.createdAt - a.createdAt);
  const uploadPaths = items.filter((i) => i.source === "upload" && i.path).map((i) => i.path!) as string[];
  const signed = new Map<string, string>();
  if (uploadPaths.length) {
    const sb = createAdminClient();
    const { data } = await sb.storage.from(RES_BUCKET).createSignedUrls(uploadPaths, 3600);
    for (const d of data || []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
  }
  return items.map((i) => {
    const href = i.source === "upload" && i.path ? (signed.get(i.path) ?? null) : (i.url ?? null);
    let embedUrl: string | null = null;
    if (i.source === "youtube" || i.source === "drive") embedUrl = classifyUrl(i.url || "").embedUrl;
    else if (i.source === "upload" && (i.kind === "video" || i.kind === "audio" || i.kind === "image" || i.kind === "pdf" || i.kind === "animation")) embedUrl = href;
    return { ...i, href, embedUrl };
  });
}

/** Add an external-link resource. */
export async function addLinkResource(input: {
  title: string; description?: string; category?: string; url: string;
  kind?: ResourceKind; createdBy: string; createdByName: string;
}): Promise<ResourceItem> {
  const c = classifyUrl(input.url);
  const item: ResourceItem = {
    id: newId(),
    title: input.title.slice(0, 200),
    description: (input.description || "").slice(0, 2000),
    category: (input.category || "General").slice(0, 80),
    kind: input.kind || c.kind,
    source: c.source,
    path: null,
    url: input.url.trim(),
    mime: null,
    size: null,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: Date.now(),
  };
  const items = await readIndex();
  items.unshift(item);
  await writeIndex(items);
  return item;
}

/** Register a file that the browser already uploaded straight to storage. */
export async function registerUpload(input: {
  title: string; description?: string; category?: string; path: string;
  name: string; mime?: string; size?: number; createdBy: string; createdByName: string;
}): Promise<ResourceItem> {
  const item: ResourceItem = {
    id: newId(),
    title: input.title.slice(0, 200),
    description: (input.description || "").slice(0, 2000),
    category: (input.category || "General").slice(0, 80),
    kind: kindFromName(input.name, input.mime),
    source: "upload",
    path: input.path,
    url: null,
    mime: input.mime || null,
    size: input.size ?? null,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: Date.now(),
  };
  const items = await readIndex();
  items.unshift(item);
  await writeIndex(items);
  return item;
}

/** Create a short-lived signed upload URL so the browser uploads directly to
 * storage (bypasses the serverless request-body size limit). */
export async function createUploadUrl(name: string): Promise<{ path: string; token: string; signedUrl: string } | null> {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(-100) || "file";
  const path = `${newId()}/${safe}`;
  const { data, error } = await createAdminClient().storage.from(RES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return null;
  return { path, token: data.token, signedUrl: data.signedUrl };
}

/** Remove a resource (and its stored file, if any). */
export async function removeResource(id: string): Promise<boolean> {
  const items = await readIndex();
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  if (item.source === "upload" && item.path) {
    try { await createAdminClient().storage.from(RES_BUCKET).remove([item.path]); } catch { /* best-effort */ }
  }
  await writeIndex(items.filter((i) => i.id !== id));
  return true;
}
