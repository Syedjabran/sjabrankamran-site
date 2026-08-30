/** Google Drive (read) for the connected account. SERVER-ONLY. */
import { googleGet } from "./auth";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  kind: "folder" | "doc" | "image" | "video" | "pdf" | "file";
  webViewLink: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  size: number | null;
  modifiedTime: string | null;
};

function classify(mime: string): DriveFile["kind"] {
  if (mime === "application/vnd.google-apps.folder") return "folder";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("application/vnd.google-apps") || mime.includes("document") || mime.includes("presentation") || mime.includes("spreadsheet")) return "doc";
  return "file";
}

type RawFile = { id: string; name: string; mimeType: string; webViewLink?: string; iconLink?: string; thumbnailLink?: string; size?: string; modifiedTime?: string };

/**
 * List Drive files. Defaults to items in the account's root or a folder; pass a
 * free-text `q` to search by name across the whole Drive.
 */
export async function listDrive(opts: { folderId?: string; q?: string; pageToken?: string } = {}): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const params = new URLSearchParams({
    pageSize: "100",
    fields: "nextPageToken, files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,size,modifiedTime)",
    orderBy: "folder,modifiedTime desc",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    spaces: "drive",
  });
  const clauses: string[] = ["trashed = false"];
  if (opts.q && opts.q.trim()) {
    clauses.push(`name contains '${opts.q.trim().replace(/'/g, "\\'")}'`);
  } else {
    clauses.push(`'${opts.folderId || "root"}' in parents`);
  }
  params.set("q", clauses.join(" and "));
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  const data = await googleGet<{ files?: RawFile[]; nextPageToken?: string }>(`https://www.googleapis.com/drive/v3/files?${params}`);
  const files: DriveFile[] = (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    kind: classify(f.mimeType),
    webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    iconLink: f.iconLink || null,
    thumbnailLink: f.thumbnailLink || null,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
  }));
  return { files, nextPageToken: data.nextPageToken || null };
}
