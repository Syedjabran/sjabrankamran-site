"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Library, FileText, ImageIcon, Video, Film, FileType2, Music, Link2, Search, Plus, Upload,
  Trash2, X, Loader2, ExternalLink, FolderOpen, GraduationCap, ChevronRight, Download, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

const BUCKET = "physics-resources";

type Kind = "pdf" | "image" | "video" | "animation" | "document" | "audio" | "link";
type Source = "upload" | "link" | "youtube" | "drive";
type Resource = {
  id: string; title: string; description: string; category: string; kind: Kind; source: Source;
  path: string | null; url: string | null; mime: string | null; size: number | null;
  createdByName: string; createdAt: number; href: string | null; embedUrl: string | null;
};

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const KIND_META: Record<Kind, { label: string; icon: React.ReactNode; cls: string }> = {
  pdf: { label: "PDF", icon: <FileText size={14} />, cls: "text-rose-300" },
  image: { label: "Image", icon: <ImageIcon size={14} />, cls: "text-emerald2" },
  video: { label: "Video", icon: <Video size={14} />, cls: "text-cyan" },
  animation: { label: "Animation", icon: <Film size={14} />, cls: "text-magenta" },
  document: { label: "Document", icon: <FileType2 size={14} />, cls: "text-amber-300" },
  audio: { label: "Audio", icon: <Music size={14} />, cls: "text-violet-300" },
  link: { label: "Link", icon: <Link2 size={14} />, cls: "text-fog" },
};
const KIND_ORDER: Kind[] = ["pdf", "video", "animation", "image", "document", "audio", "link"];
const fmtSize = (n: number | null) => n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function ResourcesClient({ isSuper }: { isSuper: boolean }) {
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [cat, setCat] = useState("");
  const [panel, setPanel] = useState<null | "upload" | "link" | "google" | "classdrive">(null);
  const [preview, setPreview] = useState<Resource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await api("/api/portal/resources"); setItems(j.resources); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(), [items]);
  const filtered = useMemo(() => items.filter((i) =>
    (!kind || i.kind === kind) &&
    (!cat || i.category === cat) &&
    (!q || (i.title + " " + i.description + " " + i.category).toLowerCase().includes(q.toLowerCase()))
  ), [items, kind, cat, q]);

  async function del(id: string) {
    if (!confirm("Remove this resource for everyone?")) return;
    try { await api(`/api/portal/admin/resources?id=${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><Library size={18} /></span>
          <div>
            <h1 className="text-2xl font-semibold text-ice">Physics Resources</h1>
            <p className="text-xs text-dust">Notes, past papers, videos, animations & simulations — curated for you.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPanel((p) => (p === "classdrive" ? null : "classdrive"))} className={"inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs " + (panel === "classdrive" ? "border-amber-300/60 bg-amber-300/10 text-amber-200" : "border-amber-300/40 text-amber-200 hover:bg-amber-300/10")}>
            <FolderOpen size={14} /> Class Drive
          </button>
          {isSuper ? (
            <>
              <button onClick={() => setPanel((p) => (p === "google" ? null : "google"))} className={"inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs " + (panel === "google" ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-cyan/40 text-cyan hover:bg-cyan/10")}>
                <FolderOpen size={14} /> Google Drive &amp; Classroom
              </button>
              <button onClick={() => setPanel((p) => (p === "upload" || p === "link" ? null : "upload"))} className="btn-ghost !px-3.5 !py-2 text-xs">{panel === "upload" || panel === "link" ? <X size={14} /> : <Plus size={14} />} {panel === "upload" || panel === "link" ? "Close" : "Publish resource"}</button>
            </>
          ) : null}
        </div>
      </div>

      {isSuper ? (
        <div className="rounded-xl border border-white/10 bg-abyss/40 px-4 py-2.5 text-[11px] text-dust">
          <b className="text-fog">You&apos;re the super admin.</b> Publish files/links or pull straight from Google Drive &amp; Classroom — every published item appears in the grid below for <b className="text-fog">all users</b>. Students only ever see the published grid, never your Google account or these controls.
        </div>
      ) : null}

      {panel === "classdrive" ? <ClassDrive isSuper={isSuper} /> : null}
      {isSuper && (panel === "upload" || panel === "link" || panel === "google") ? <PublishPanel initialTab={panel} onClose={() => setPanel(null)} onPublished={() => { load(); }} /> : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dust" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources…" className="w-full rounded-lg border border-white/10 bg-abyss/60 py-2 pl-9 pr-3 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
        </div>
        {categories.length ? (
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-white/10 bg-abyss/60 px-2.5 py-2 text-xs text-ice focus:border-cyan focus:outline-none">
            <option value="">All topics</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setKind("")} className={"rounded-full border px-3 py-1 text-xs " + (kind === "" ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>All</button>
        {KIND_ORDER.map((k) => (
          <button key={k} onClick={() => setKind(kind === k ? "" : k)} className={"inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs " + (kind === k ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
            {KIND_META[k].icon} {KIND_META[k].label}
          </button>
        ))}
      </div>

      {err ? <p className="text-xs text-signal">{err}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={15} className="animate-spin" /> Loading…</p>
      ) : filtered.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id} className="group flex flex-col rounded-2xl border border-white/10 bg-space/60 p-4 transition hover:border-cyan/30">
              <button onClick={() => setPreview(r)} className="flex-1 text-left">
                <div className="mb-2 flex items-center justify-between">
                  <span className={"inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[10px] " + KIND_META[r.kind].cls}>{KIND_META[r.kind].icon} {KIND_META[r.kind].label}</span>
                  {r.source === "drive" || r.source === "youtube" || r.source === "link" ? <span className="text-[10px] text-dust capitalize">{r.source}</span> : null}
                </div>
                <p className="text-sm font-semibold leading-snug text-ice">{r.title}</p>
                {r.description ? <p className="mt-1 line-clamp-2 text-xs text-fog">{r.description}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-dust">
                  <span className="rounded-full border border-white/10 px-2 py-0.5">{r.category}</span>
                  {r.size ? <span>{fmtSize(r.size)}</span> : null}
                </p>
              </button>
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                <button onClick={() => setPreview(r)} className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">Open <ChevronRight size={12} /></button>
                {isSuper ? <button onClick={() => del(r.id)} className="text-signal/70 hover:text-signal" title="Remove"><Trash2 size={13} /></button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
          <p className="text-sm text-dust">{items.length ? "No resources match your filters." : "No resources published yet."}</p>
          {isSuper && !items.length ? <p className="mt-1 text-xs text-dust">Use <b className="text-cyan">Publish resource</b> above to add your first one.</p> : null}
        </div>
      )}

      {preview ? <PreviewModal r={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

/* ---------------- Preview ---------------- */
function PreviewModal({ r, onClose }: { r: Resource; onClose: () => void }) {
  const href = r.href;
  const embed = r.embedUrl;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-space" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ice">{r.title}</p>
            <p className="text-[11px] text-dust">{r.category} · {KIND_META[r.kind].label} · by {r.createdByName}</p>
          </div>
          <div className="flex items-center gap-2">
            {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-fog hover:border-cyan/40 hover:text-cyan">{r.source === "upload" ? <Download size={12} /> : <ExternalLink size={12} />} Open</a> : null}
            <button onClick={onClose} className="text-dust hover:text-ice"><X size={18} /></button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-auto bg-abyss/40 p-2">
          <PreviewBody r={r} embed={embed} href={href} />
        </div>
      </div>
    </div>
  );
}

function PreviewBody({ r, embed, href }: { r: Resource; embed: string | null; href: string | null }) {
  if (r.kind === "image" && href) return <img src={href} alt={r.title} className="mx-auto max-h-[70vh] rounded-lg" />;
  if (r.kind === "video") {
    if (r.source === "youtube" && embed) return <div className="aspect-video w-full"><iframe src={embed} className="h-full w-full rounded-lg" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>;
    if (href) return <video src={href} controls className="mx-auto max-h-[70vh] w-full rounded-lg" />;
  }
  if (r.kind === "audio" && href) return <audio src={href} controls className="w-full" />;
  if (r.kind === "pdf" && href) return <iframe src={href} className="h-[70vh] w-full rounded-lg" />;
  if (r.kind === "animation") { const src = embed || href; if (src) return <iframe src={src} className="h-[70vh] w-full rounded-lg" allowFullScreen />; }
  if ((r.source === "drive") && embed) return <iframe src={embed} className="h-[70vh] w-full rounded-lg" allowFullScreen />;
  return (
    <div className="p-8 text-center">
      {r.description ? <p className="mx-auto mb-4 max-w-lg text-sm text-fog">{r.description}</p> : null}
      {href ? <a href={href} target="_blank" rel="noreferrer" className="btn-primary !px-4 !py-2 text-sm">Open resource <ExternalLink size={14} /></a> : <p className="text-sm text-dust">No preview available.</p>}
    </div>
  );
}

/* ---------------- Publish (super-admin) ---------------- */
function PublishPanel({ initialTab = "upload", onPublished, onClose }: { initialTab?: "upload" | "link" | "google"; onPublished: () => void; onClose?: () => void }) {
  const [tab, setTab] = useState<"upload" | "link" | "google">(initialTab);
  const input = "w-full rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";
  return (
    <div className="space-y-4 rounded-2xl border border-cyan/20 bg-space/60 p-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
        {(["upload", "link", "google"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs " + (tab === t ? "bg-cyan/10 text-cyan" : "text-dust hover:text-ice")}>
            {t === "upload" ? <Upload size={13} /> : t === "link" ? <Link2 size={13} /> : <GraduationCap size={13} />} {t === "upload" ? "Upload file" : t === "link" ? "Add link" : "Import from Google"}
          </button>
        ))}
        {onClose ? <button onClick={onClose} className="ml-auto text-dust hover:text-ice" title="Close"><X size={16} /></button> : null}
      </div>
      {tab === "upload" ? <UploadForm input={input} onDone={onPublished} /> : tab === "link" ? <LinkForm input={input} onDone={onPublished} /> : <GooglePanel input={input} onDone={onPublished} />}
    </div>
  );
}

function UploadForm({ input, onDone }: { input: string; onDone: () => void }) {
  const [title, setTitle] = useState(""); const [category, setCategory] = useState(""); const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [ok, setOk] = useState("");

  async function submit() {
    if (!file || !title.trim()) return;
    setBusy("Preparing…"); setErr(""); setOk("");
    try {
      const { path, token } = await api("/api/portal/admin/resources/upload-url", { method: "POST", body: JSON.stringify({ name: file.name }) });
      setBusy("Uploading…");
      const sb = createClient();
      const { error } = await sb.storage.from(BUCKET).uploadToSignedUrl(path, token, file);
      if (error) throw new Error(error.message);
      setBusy("Publishing…");
      await api("/api/portal/admin/resources", { method: "POST", body: JSON.stringify({ mode: "upload", title, category, description, path, name: file.name, mime: file.type, size: file.size }) });
      setOk(`Published “${title}”.`); setTitle(""); setDescription(""); setFile(null);
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  }

  return (
    <div className="space-y-2.5">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={input} />
      <div className="flex flex-wrap gap-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Topic / category (e.g. Mechanics)" className={input + " flex-1"} />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className={input + " resize-none"} />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan/30 bg-abyss/40 px-4 py-6 text-sm text-fog hover:border-cyan/60 hover:text-cyan">
        <Upload size={16} /> {file ? file.name : "Choose a file — PDF, image, video, animation, doc (max 50 MB)"}
        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      {err ? <p className="text-xs text-signal">{err}</p> : null}
      {ok ? <p className="text-xs text-emerald2">{ok}</p> : null}
      <button onClick={submit} disabled={!!busy || !file || !title.trim()} className="btn-primary !px-4 !py-2 text-sm">{busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</> : <><Plus size={14} /> Publish</>}</button>
    </div>
  );
}

function LinkForm({ input, onDone }: { input: string; onDone: () => void }) {
  const [title, setTitle] = useState(""); const [category, setCategory] = useState(""); const [description, setDescription] = useState(""); const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  async function submit() {
    if (!title.trim() || !url.trim()) return;
    setBusy(true); setErr(""); setOk("");
    try {
      await api("/api/portal/admin/resources", { method: "POST", body: JSON.stringify({ mode: "link", title, category, description, url }) });
      setOk(`Published “${title}”.`); setTitle(""); setUrl(""); setDescription(""); onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2.5">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={input} />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL — YouTube, Google Drive, PhET simulation, web page…" className={input} />
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Topic / category (e.g. Waves)" className={input} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description (optional)" className={input + " resize-none"} />
      {err ? <p className="text-xs text-signal">{err}</p> : null}
      {ok ? <p className="text-xs text-emerald2">{ok}</p> : null}
      <button onClick={submit} disabled={busy || !title.trim() || !url.trim()} className="btn-primary !px-4 !py-2 text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Publish link</button>
    </div>
  );
}

/* ---------------- Google import (super-admin) ---------------- */
type DriveFile = { id: string; name: string; mimeType: string; kind: string; webViewLink: string | null; iconLink: string | null; thumbnailLink: string | null; size: number | null };
type Course = { id: string; name: string; section: string | null };
type Material = { kind: string; title: string; url: string | null; thumbnailUrl: string | null };
type Work = { id: string; title: string; description: string | null; workType: string | null; dueDate: string | null; alternateLink: string | null; materials: Material[] };

function GooglePanel({ input, onDone }: { input: string; onDone: () => void }) {
  const [status, setStatus] = useState<{ connected: boolean } | null>(null);
  const [mode, setMode] = useState<"drive" | "classroom">("drive");
  const [category, setCategory] = useState("");
  const [msg, setMsg] = useState("");
  const [folders, setFolders] = useState<Record<string, string> | null>(null);
  const [needsWrite, setNeedsWrite] = useState(false);
  const [prov, setProv] = useState(false);

  useEffect(() => { api("/api/portal/admin/google/status").then(setStatus).catch(() => setStatus({ connected: false })); }, []);
  useEffect(() => { api("/api/portal/admin/google/provision").then((j) => { if (j.folders) setFolders(j.folders); if (j.needsWrite) setNeedsWrite(true); }).catch(() => {}); }, []);

  async function provision() {
    setProv(true); setMsg("");
    try { const j = await api("/api/portal/admin/google/provision", { method: "POST" }); if (j.needsWrite) setNeedsWrite(true); else { setFolders(j.folders); setNeedsWrite(false); } }
    catch (e) { setMsg((e as Error).message); } finally { setProv(false); }
  }

  async function importItem(title: string, url: string | null) {
    if (!url) return;
    setMsg("");
    try { await api("/api/portal/admin/google/import", { method: "POST", body: JSON.stringify({ title, url, category: category || "From Google" }) }); setMsg(`Added “${title}” to Resources.`); onDone(); }
    catch (e) { setMsg((e as Error).message); }
  }

  if (!status) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Checking Google connection…</p>;

  if (!status.connected) return (
    <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.04] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><Sparkles size={15} /> Google not connected yet</p>
      <p className="mt-2 text-xs leading-relaxed text-fog">
        To pull materials from <b>physics@sjabrankamran.com</b>&apos;s Google Drive &amp; Classroom, a one-time OAuth connection is needed.
        Add <code className="text-cyan">GOOGLE_CLIENT_ID</code>, <code className="text-cyan">GOOGLE_CLIENT_SECRET</code> and <code className="text-cyan">GOOGLE_REFRESH_TOKEN</code> in the Vercel project, then redeploy.
        A step-by-step setup guide has been prepared for you. Until then you can still upload files and add links above.
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Connected Drive folders (auto-created; uploads are mirrored here). */}
      <div className="rounded-xl border border-white/10 bg-abyss/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-fog"><FolderOpen size={13} className="text-amber-300" /> Connected Drive folders</p>
          <button onClick={provision} disabled={prov} className="rounded-lg border border-cyan/40 px-2.5 py-1 text-[11px] text-cyan hover:bg-cyan/10">{prov ? "Setting up…" : (folders ? "Refresh" : "Set up folders")}</button>
        </div>
        {needsWrite ? (
          <p className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.04] px-2.5 py-1.5 text-[11px] text-amber-200">Drive is connected <b>read-only</b>. To auto-create folders and mirror uploads, re-authorize with write access (ask Pablo / re-run the connect step).</p>
        ) : folders ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(folders).filter(([, v]) => v).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] text-fog hover:border-cyan/40 hover:text-cyan"><FolderOpen size={10} /> {k} <ExternalLink size={9} /></a>
            ))}
          </div>
        ) : <p className="mt-2 text-[11px] text-dust">Tap “Set up folders” to create the sjabrankamran.com folder tree in your Drive.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(["drive", "classroom"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={"inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs " + (mode === m ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>
              {m === "drive" ? <FolderOpen size={13} /> : <GraduationCap size={13} />} {m === "drive" ? "Drive" : "Classroom"}
            </button>
          ))}
        </div>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Tag imports with topic (optional)" className={input + " flex-1"} />
      </div>
      {msg ? <p className="text-xs text-cyan">{msg}</p> : null}
      {mode === "drive" ? <DriveBrowser onImport={importItem} /> : <ClassroomBrowser onImport={importItem} />}
    </div>
  );
}

function DriveBrowser({ onImport }: { onImport: (t: string, u: string | null) => void }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [stack, setStack] = useState<{ id: string; name: string }[]>([{ id: "root", name: "My Drive" }]);
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [shared, setShared] = useState<Record<string, string>>({});

  const loadShared = useCallback(async () => {
    try { const j = await api("/api/portal/admin/google/shared"); setShared(Object.fromEntries((j.folders || []).map((f: { id: string; name: string }) => [f.id, f.name]))); } catch { /* */ }
  }, []);
  async function toggleShare(f: DriveFile) {
    try {
      if (shared[f.id]) await api(`/api/portal/admin/google/shared?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      else await api("/api/portal/admin/google/shared", { method: "POST", body: JSON.stringify({ id: f.id, name: f.name }) });
      await loadShared();
    } catch (e) { setErr((e as Error).message); }
  }

  const load = useCallback(async (folderId: string, search: string) => {
    setBusy(true); setErr("");
    try {
      const qs = search ? `q=${encodeURIComponent(search)}` : `folderId=${encodeURIComponent(folderId)}`;
      const j = await api(`/api/portal/admin/google/drive?${qs}`);
      if (j.error) setErr(j.error); setFiles(j.files || []);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(stack[stack.length - 1].id, ""); loadShared(); /* eslint-disable-next-line */ }, []);

  const cur = stack[stack.length - 1];
  return (
    <div className="rounded-xl border border-white/10 bg-abyss/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-dust">
          {stack.map((s, i) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight size={11} /> : null}
              <button onClick={() => { const ns = stack.slice(0, i + 1); setStack(ns); load(s.id, ""); setQ(""); }} className={i === stack.length - 1 ? "text-ice" : "hover:text-cyan"}>{s.name}</button>
            </span>
          ))}
        </div>
        <div className="relative ml-auto min-w-[10rem]">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dust" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(cur.id, q); }} placeholder="Search Drive…" className="w-full rounded-lg border border-white/10 bg-space/60 py-1.5 pl-8 pr-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
        </div>
      </div>
      {err ? <p className="mb-2 text-xs text-signal">{err}</p> : null}
      {busy ? <p className="flex items-center gap-2 py-4 text-xs text-dust"><Loader2 size={13} className="animate-spin" /> Loading…</p> : (
        <ul className="max-h-72 space-y-1 overflow-auto">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
              {f.kind === "folder" ? (
                <button onClick={() => { setStack((s) => [...s, { id: f.id, name: f.name }]); load(f.id, ""); setQ(""); }} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-fog hover:text-cyan">
                  <FolderOpen size={14} className="shrink-0 text-amber-300" /> <span className="truncate">{f.name}</span>
                </button>
              ) : (
                <a href={f.webViewLink || "#"} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fog hover:text-cyan">
                  {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" className="h-5 w-5 shrink-0 rounded object-cover" /> : <FileText size={14} className="shrink-0 text-cyan" />}
                  <span className="truncate">{f.name}</span>
                </a>
              )}
              {f.kind === "folder" ? (
                <button onClick={() => toggleShare(f)} title={shared[f.id] ? "Shared with students — click to stop" : "Share this folder with all users"} className={"shrink-0 rounded-lg border px-2 py-0.5 text-[10px] " + (shared[f.id] ? "border-emerald2/50 bg-emerald2/10 text-emerald2" : "border-white/15 text-dust hover:border-amber-300/50 hover:text-amber-200")}>{shared[f.id] ? "✓ Shared" : "Share"}</button>
              ) : (
                <button onClick={() => onImport(f.name, f.webViewLink)} className="shrink-0 rounded-lg border border-cyan/40 px-2 py-0.5 text-[10px] text-cyan hover:bg-cyan/10">Add</button>
              )}
            </li>
          ))}
          {!files.length ? <li className="py-4 text-center text-xs text-dust">Empty.</li> : null}
        </ul>
      )}
    </div>
  );
}

function ClassroomBrowser({ onImport }: { onImport: (t: string, u: string | null) => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [work, setWork] = useState<Work[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => { (async () => { setBusy(true); try { const j = await api("/api/portal/admin/google/classroom"); if (j.error) setErr(j.error); setCourses(j.courses || []); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } })(); }, []);

  async function openCourse(c: Course) {
    setCourse(c); setBusy(true); setErr(""); setWork([]);
    try { const j = await api(`/api/portal/admin/google/classroom?courseId=${encodeURIComponent(c.id)}`); if (j.error) setErr(j.error); setWork(j.items || []); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-abyss/40 p-3">
      {course ? <button onClick={() => { setCourse(null); setWork([]); }} className="mb-2 inline-flex items-center gap-1 text-xs text-dust hover:text-cyan"><ChevronRight size={11} className="rotate-180" /> All courses</button> : null}
      {err ? <p className="mb-2 text-xs text-signal">{err}</p> : null}
      {busy ? <p className="flex items-center gap-2 py-4 text-xs text-dust"><Loader2 size={13} className="animate-spin" /> Loading…</p> : !course ? (
        <ul className="max-h-72 space-y-1 overflow-auto">
          {courses.map((c) => (
            <li key={c.id}><button onClick={() => openCourse(c)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-fog hover:bg-white/[0.03] hover:text-cyan"><GraduationCap size={14} className="shrink-0 text-cyan" /> <span className="truncate">{c.name}{c.section ? ` · ${c.section}` : ""}</span></button></li>
          ))}
          {!courses.length ? <li className="py-4 text-center text-xs text-dust">No courses found.</li> : null}
        </ul>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-auto">
          {work.map((w) => (
            <li key={w.id} className="rounded-lg border border-white/10 bg-space/60 p-2.5">
              <p className="text-xs font-medium text-ice">{w.title} {w.workType ? <span className="text-[10px] text-dust">· {w.workType.toLowerCase()}</span> : null}</p>
              {w.materials.length ? (
                <ul className="mt-1.5 space-y-1">
                  {w.materials.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11px] text-fog">
                      <span className="capitalize text-dust">{m.kind}</span>
                      <span className="min-w-0 flex-1 truncate">{m.title}</span>
                      {m.url ? <button onClick={() => onImport(m.title, m.url)} className="shrink-0 rounded border border-cyan/40 px-2 py-0.5 text-[10px] text-cyan hover:bg-cyan/10">Add</button> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-[10px] text-dust">No attachments.</p>}
              {w.alternateLink ? <button onClick={() => onImport(w.title, w.alternateLink)} className="mt-1.5 text-[10px] text-cyan hover:underline">Add the whole post as a link →</button> : null}
            </li>
          ))}
          {!work.length ? <li className="py-4 text-center text-xs text-dust">No posts in this course.</li> : null}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Class Drive (read-only, ALL users) ---------------- */
function ClassDrive({ isSuper }: { isSuper: boolean }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [stack, setStack] = useState<{ id: string; name: string }[]>([{ id: "", name: "Shared with you" }]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [connected, setConnected] = useState(true); const [root, setRoot] = useState(true);

  const load = useCallback(async (folderId: string) => {
    setBusy(true); setErr("");
    try {
      const j = await api(`/api/portal/google/drive${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`);
      setConnected(j.connected !== false); setRoot(!!j.root); if (j.error) setErr(j.error); setFiles(j.files || []);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(""); /* eslint-disable-next-line */ }, []);

  const cur = stack[stack.length - 1];
  const iconFor = (k: string) => k === "image" ? <ImageIcon size={14} className="shrink-0 text-emerald2" /> : k === "video" ? <Video size={14} className="shrink-0 text-cyan" /> : k === "pdf" ? <FileText size={14} className="shrink-0 text-rose-300" /> : <FileType2 size={14} className="shrink-0 text-amber-300" />;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300/25 bg-space/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><FolderOpen size={16} className="text-amber-300" /> Class Drive</h2>
        <p className="text-[11px] text-dust">Folders shared by your teacher — open to read.</p>
      </div>
      {/* breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-dust">
        {stack.map((s, i) => (
          <span key={s.id || "root"} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight size={11} /> : null}
            <button onClick={() => { const ns = stack.slice(0, i + 1); setStack(ns); load(s.id); }} className={i === stack.length - 1 ? "text-ice" : "hover:text-amber-200"}>{s.name}</button>
          </span>
        ))}
      </div>
      {err ? <p className="text-xs text-signal">{err}</p> : null}
      {!connected ? (
        <p className="rounded-lg border border-white/10 bg-abyss/40 px-3 py-6 text-center text-xs text-dust">The class drive isn&apos;t connected yet. Please check back soon.</p>
      ) : busy ? (
        <p className="flex items-center gap-2 py-6 text-xs text-dust"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : files.length ? (
        <ul className="max-h-96 space-y-1 overflow-auto">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
              {f.kind === "folder" ? (
                <button onClick={() => { setStack((s) => [...s, { id: f.id, name: f.name }]); load(f.id); }} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-fog hover:text-amber-200">
                  <FolderOpen size={15} className="shrink-0 text-amber-300" /> <span className="truncate">{f.name}</span>
                  <ChevronRight size={12} className="ml-auto shrink-0 text-dust" />
                </button>
              ) : (
                <a href={`/api/portal/google/file/${f.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fog hover:text-cyan">
                  {f.thumbnailLink ? <img src={f.thumbnailLink} alt="" className="h-6 w-6 shrink-0 rounded object-cover" /> : iconFor(f.kind)}
                  <span className="truncate">{f.name}</span>
                  <ExternalLink size={11} className="ml-auto shrink-0 text-dust" />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-white/10 bg-abyss/40 px-3 py-6 text-center text-xs text-dust">
          {root ? "No folders have been shared yet." : "This folder is empty."}
          {isSuper && root ? <span className="mt-1 block text-[11px] text-amber-200/80">Tip: open “Google Drive &amp; Classroom”, browse to a folder and press <b>Share</b> to make it visible here for everyone.</span> : null}
        </p>
      )}
    </div>
  );
}
