/**
 * Shared Google Drive folders (student-visible allow-list). SERVER-ONLY.
 *
 * DEFAULT DENY: regular users can browse ONLY the folders a super-admin has
 * explicitly shared, plus their descendants. Everything else is invisible.
 * The allow-list lives as JSON in the private portal-data bucket.
 *
 *   portal-data/google/shared-folders.json  → { folders: [{id,name}] }
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { googleGet } from "./auth";

const DATA = "portal-data";
const PATH = "google/shared-folders.json";

export type SharedFolder = { id: string; name: string };

let mem: { list: SharedFolder[]; at: number } | null = null;
const TTL = 20_000;

export async function listShared(): Promise<SharedFolder[]> {
  if (mem && Date.now() - mem.at < TTL) return mem.list;
  try {
    const { data } = await createAdminClient().storage.from(DATA).download(PATH);
    if (data) {
      const j = JSON.parse(await data.text());
      const list: SharedFolder[] = Array.isArray(j) ? j : (j.folders || []);
      mem = { list, at: Date.now() };
      return list;
    }
  } catch { /* none yet */ }
  mem = { list: [], at: Date.now() };
  return [];
}

async function writeShared(list: SharedFolder[]): Promise<void> {
  mem = { list, at: Date.now() };
  const body = new Blob([JSON.stringify({ folders: list })], { type: "application/json" });
  await createAdminClient().storage.from(DATA).upload(PATH, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
}

export async function addShared(f: SharedFolder): Promise<SharedFolder[]> {
  const list = await listShared();
  if (!list.find((x) => x.id === f.id)) list.unshift({ id: f.id, name: (f.name || "Folder").slice(0, 160) });
  await writeShared(list);
  return list;
}

export async function removeShared(id: string): Promise<SharedFolder[]> {
  const list = (await listShared()).filter((x) => x.id !== id);
  await writeShared(list);
  return list;
}

/**
 * Is a Drive node (folder or file) inside an allowed subtree?
 * True if the id is itself a shared folder, or any ancestor is shared.
 * Walks the parent chain (capped) via the Drive API. Default deny.
 */
export async function isAllowedNode(id: string): Promise<boolean> {
  const list = await listShared();
  if (!list.length || !id) return false;
  const allowed = new Set(list.map((f) => f.id));
  if (allowed.has(id)) return true;
  let cur = id;
  for (let depth = 0; depth < 15; depth++) {
    let meta: { parents?: string[] };
    try {
      meta = await googleGet(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cur)}?fields=id,parents&supportsAllDrives=true`);
    } catch { return false; }
    const parents = meta.parents || [];
    if (!parents.length) return false;
    for (const p of parents) if (allowed.has(p)) return true;
    cur = parents[0];
  }
  return false;
}
