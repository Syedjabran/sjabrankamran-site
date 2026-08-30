/**
 * Google Drive WRITE helpers. SERVER-ONLY.
 *
 * Provisions a tidy folder tree under the connected account and routes portal
 * uploads into it:
 *
 *   sjabrankamran.com/
 *     ├─ Physics Resource/            ← Physics Resources uploads
 *     ├─ Resource Library/            ← community library attachments
 *     ├─ Tests/<Student>/             ← Exam Lab answer uploads (per user)
 *     └─ Assignments/<Student>/       ← assignment submissions (per user)
 *
 * Folder ids are cached in portal-data/secrets/google-folders.json so we don't
 * re-search on every upload. All mirroring is BEST-EFFORT — a Drive failure
 * must never block the primary Supabase upload.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken, googleReady } from "./auth";

const ROOT_NAME = "sjabrankamran.com";
const SUB = { physicsResource: "Physics Resource", resourceLibrary: "Resource Library", tests: "Tests", assignments: "Assignments" } as const;
const CACHE_PATH = "secrets/google-folders.json";

type FolderCache = {
  root?: string;
  physicsResource?: string;
  resourceLibrary?: string;
  tests?: string;
  assignments?: string;
  users?: Record<string, { tests?: string; assignments?: string }>;
};

let mem: FolderCache | null = null;

async function readCache(): Promise<FolderCache> {
  if (mem) return mem;
  try {
    const { data } = await createAdminClient().storage.from("portal-data").download(CACHE_PATH);
    if (data) { mem = JSON.parse(await data.text()); return mem!; }
  } catch { /* none */ }
  mem = {};
  return mem;
}
async function writeCache(c: FolderCache) {
  mem = c;
  try {
    const body = new Blob([JSON.stringify(c)], { type: "application/json" });
    await createAdminClient().storage.from("portal-data").upload(CACHE_PATH, body, { upsert: true, contentType: "application/json" });
  } catch { /* best-effort */ }
}

async function driveFetch(url: string, init: RequestInit) {
  const token = await getAccessToken();
  return fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}

/** Find or create a folder by name under a parent; returns its id. */
async function ensureFolder(name: string, parentId: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name = '${safe}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { method: "GET" });
  const j = (await r.json().catch(() => ({}))) as { files?: { id: string }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(`Drive folder search failed: ${j.error?.message || r.status}`);
  if (j.files && j.files.length) return j.files[0].id;
  const cr = await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const cj = (await cr.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!cr.ok || !cj.id) throw new Error(`Drive folder create failed: ${cj.error?.message || cr.status}`);
  return cj.id;
}

/** Ensure the whole base tree exists; returns (and caches) the folder ids. */
export async function ensureBaseFolders(): Promise<Required<Omit<FolderCache, "users">> & { users: Record<string, { tests?: string; assignments?: string }> }> {
  const c = await readCache();
  if (!c.root) c.root = await ensureFolder(ROOT_NAME, "root");
  if (!c.physicsResource) c.physicsResource = await ensureFolder(SUB.physicsResource, c.root);
  if (!c.resourceLibrary) c.resourceLibrary = await ensureFolder(SUB.resourceLibrary, c.root);
  if (!c.tests) c.tests = await ensureFolder(SUB.tests, c.root);
  if (!c.assignments) c.assignments = await ensureFolder(SUB.assignments, c.root);
  if (!c.users) c.users = {};
  await writeCache(c);
  return c as Required<Omit<FolderCache, "users">> & { users: Record<string, { tests?: string; assignments?: string }> };
}

/** Ensure a per-user subfolder under Tests/ or Assignments/; returns its id. */
async function ensureUserFolder(kind: "tests" | "assignments", uid: string, label: string): Promise<string> {
  const base = await ensureBaseFolders();
  const c = await readCache();
  c.users = c.users || {};
  c.users[uid] = c.users[uid] || {};
  if (c.users[uid][kind]) return c.users[uid][kind]!;
  const parent = kind === "tests" ? base.tests : base.assignments;
  const folderName = label.replace(/[\\/]/g, "-").slice(0, 100) || uid.slice(0, 8);
  const id = await ensureFolder(folderName, parent);
  c.users[uid][kind] = id;
  await writeCache(c);
  return id;
}

async function uploadBytes(folderId: string, name: string, mime: string, bytes: Uint8Array): Promise<{ id: string; webViewLink: string | null } | null> {
  const boundary = "sjk_" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [folderId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime || "application/octet-stream"}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head, "utf8"), Buffer.from(bytes), Buffer.from(tail, "utf8")]);
  const r = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true", {
    method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body,
  });
  const j = (await r.json().catch(() => ({}))) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`Drive upload failed: ${j.error?.message || r.status}`);
  return { id: j.id, webViewLink: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
}

async function toBytes(file: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  return new Uint8Array(await file.arrayBuffer());
}

/** Best-effort mirror of an admin resource / library file to its Drive folder. */
export async function mirrorToDrive(target: "physicsResource" | "resourceLibrary", name: string, mime: string, file: Blob | ArrayBuffer | Uint8Array): Promise<{ id: string; webViewLink: string | null } | null> {
  try {
    if (!(await googleReady())) return null;
    const base = await ensureBaseFolders();
    const folder = target === "physicsResource" ? base.physicsResource : base.resourceLibrary;
    return await uploadBytes(folder, name, mime, await toBytes(file));
  } catch (e) { console.warn("[drive mirror]", target, (e as Error).message); return null; }
}

/** Best-effort mirror of a user upload into Tests/<user> or Assignments/<user>. */
export async function mirrorUserUpload(kind: "tests" | "assignments", uid: string, label: string, name: string, mime: string, file: Blob | ArrayBuffer | Uint8Array): Promise<{ id: string; webViewLink: string | null } | null> {
  try {
    if (!(await googleReady())) return null;
    const folder = await ensureUserFolder(kind, uid, label);
    return await uploadBytes(folder, name, mime, await toBytes(file));
  } catch (e) { console.warn("[drive user mirror]", kind, (e as Error).message); return null; }
}

/** Links to the base folders (for the admin "connected folders" view). */
export async function baseFolderLinks(): Promise<Record<string, string>> {
  const c = await ensureBaseFolders();
  const link = (id?: string) => (id ? `https://drive.google.com/drive/folders/${id}` : "");
  return {
    root: link(c.root), "Physics Resource": link(c.physicsResource), "Resource Library": link(c.resourceLibrary),
    Tests: link(c.tests), Assignments: link(c.assignments),
  };
}
