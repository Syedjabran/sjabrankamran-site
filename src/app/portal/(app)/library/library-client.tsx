"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, MessageSquare, Paperclip, ThumbsUp, ArrowLeft, Trophy, Sparkles, Upload, FileText, Trash2, HandHelping, Lightbulb, Library, Loader2 } from "lucide-react";

type Tag = "resource" | "help" | "topic" | "discussion";
type ThreadMeta = { id: string; title: string; tag: Tag; authorName: string; ts: number; lastTs: number; replies: number; resources: number };
type Att = { path: string; name: string; size: number; url: string | null };
type Reactions = { like: string[]; dislike: string[]; love: string[] };
type Post = { id: string; authorName: string; authorId: string; body: string; attachments: Att[]; ts: number; helpful: number; mine: boolean; iMarked: boolean; reactions: Reactions };
type Thread = { id: string; title: string; tag: Tag; authorName: string; authorId: string; body: string; ts: number; attachments: Att[]; posts: Post[]; reactions: Reactions };
type Row = { uid: string; name: string; total: number; monthPoints: number; rank: number; isMe: boolean };
type Community = { month: string; monthlyTop5: Row[]; allTime: Row[]; me: { total: number; monthPoints: number }; guide: { kind: string; label: string; pts: number }[] };

const TAG_META: Record<Tag, { label: string; cls: string; icon: React.ReactNode }> = {
  resource: { label: "Resource", cls: "border-cyan/40 text-cyan", icon: <FileText size={11} /> },
  help: { label: "Help wanted", cls: "border-signal/40 text-signal", icon: <HandHelping size={11} /> },
  topic: { label: "New topic", cls: "border-magenta/40 text-magenta", icon: <Lightbulb size={11} /> },
  discussion: { label: "Discussion", cls: "border-white/20 text-fog", icon: <MessageSquare size={11} /> },
};

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function rel(ts: number) { const s = Math.floor((Date.now() - ts) / 1000); if (s < 60) return "just now"; const m = Math.floor(s / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return new Date(ts).toLocaleDateString(); }

export function LibraryClient({ isAdmin }: { isAdmin: boolean }) {
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [filter, setFilter] = useState<"" | Tag>("");
  const [open, setOpen] = useState<Thread | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState("");

  const loadList = useCallback(async () => {
    try { const j = await api(`/api/portal/library${filter ? `?tag=${filter}` : ""}`); setThreads(j.threads); } catch (e) { setErr((e as Error).message); }
  }, [filter]);
  const loadCommunity = useCallback(async () => { try { setCommunity(await api("/api/portal/community")); } catch { /* */ } }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  const openThread = async (id: string) => { try { const j = await api(`/api/portal/library/${id}`); setOpen(j.thread); } catch (e) { setErr((e as Error).message); } };

  if (open) return <ThreadView thread={open} isAdmin={isAdmin} onBack={() => { setOpen(null); loadList(); loadCommunity(); }} onReload={() => openThread(open.id)} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><Library size={18} /></span>
          <div>
            <h1 className="text-2xl font-semibold text-ice">Resource Library &amp; Community</h1>
            <p className="text-xs text-dust">Share resources, ask for help, raise new topics — and work together.</p>
          </div>
        </div>
        <button onClick={() => setShowNew((s) => !s)} className="btn-ghost !px-3.5 !py-2 text-xs"><Plus size={14} /> New post</button>
      </div>

      {/* Guidance + rewards */}
      <div className="rounded-2xl border border-cyan/20 bg-gradient-to-br from-space/80 to-abyss/40 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ice"><Sparkles size={15} className="text-cyan" /> Earn your place on the Community board</p>
        <p className="mt-1 text-xs leading-relaxed text-fog">
          Help classmates, share great resources, raise new topics and take part. You earn <b className="text-cyan">contribution points</b> that lift your ranking — and the <b className="text-amber-300">top 5 each month are rewarded</b>. 🏆
        </p>
        {community?.guide ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {community.guide.map((g) => <span key={g.kind} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] text-dust">{g.label} <b className="text-cyan">+{g.pts}</b></span>)}
          </div>
        ) : null}
      </div>

      {showNew ? <NewThread onCreated={(id) => { setShowNew(false); loadList(); loadCommunity(); openThread(id); }} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {([["", "All"], ["resource", "Resources"], ["help", "Help"], ["topic", "Topics"], ["discussion", "Discussion"]] as [string, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v as "" | Tag)} className={"rounded-full border px-3 py-1 text-xs " + (filter === v ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-dust hover:text-ice")}>{l}</button>
            ))}
          </div>
          {err ? <p className="text-xs text-signal">{err}</p> : null}
          {threads.length ? (
            <ul className="space-y-2">
              {threads.map((t) => (
                <li key={t.id}>
                  <button onClick={() => openThread(t.id)} className="w-full rounded-2xl border border-white/10 bg-space/60 p-4 text-left transition hover:border-cyan/30 hover:bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] " + TAG_META[t.tag].cls}>{TAG_META[t.tag].icon} {TAG_META[t.tag].label}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ice">{t.title}</span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-dust">
                      <span>{t.authorName}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {t.replies}</span>
                      {t.resources ? <span className="inline-flex items-center gap-1 text-cyan"><Paperclip size={11} /> {t.resources}</span> : null}
                      <span>· {rel(t.lastTs)}</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-dust">No posts yet — be the first to share a resource or ask for help.</p>}
        </div>

        <CommunityPanel community={community} />
      </div>
    </div>
  );
}

function CommunityPanel({ community }: { community: Community | null }) {
  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-amber-300/20 bg-space/60 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><Trophy size={15} className="text-amber-300" /> This month&apos;s top contributors</h2>
        {community?.monthlyTop5?.length ? (
          <ul className="mt-3 space-y-1.5">
            {community.monthlyTop5.map((r) => (
              <li key={r.uid} className={"flex items-center gap-2 rounded-lg px-2 py-1.5 " + (r.isMe ? "border border-cyan/40 bg-cyan/[0.06]" : "")}>
                <span className="w-6 text-center">{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}</span>
                <span className={"min-w-0 flex-1 truncate text-sm " + (r.isMe ? "font-semibold text-cyan" : "text-fog")}>{r.isMe ? "You" : r.name}</span>
                <span className="font-mono text-xs text-amber-300">{r.monthPoints} pts</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-dust">No points yet this month. Share or help to get on the board!</p>}
        <p className="mt-3 border-t border-white/5 pt-2 text-[11px] text-dust">🎁 Top 5 are rewarded each month. Resets on the 1st.</p>
      </div>
      {community?.me ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-4 text-center">
          <p className="text-[11px] uppercase tracking-widest text-dust">Your contribution</p>
          <p className="font-display text-2xl font-semibold text-ice">{community.me.monthPoints} <span className="text-sm text-dust">this month</span></p>
          <p className="text-[11px] text-dust">{community.me.total} all-time</p>
        </div>
      ) : null}
    </section>
  );
}

function NewThread({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [tag, setTag] = useState<Tag>("resource");
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const input = "w-full rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none";
  async function submit() {
    setBusy(true); setErr("");
    try {
      const j = await api("/api/portal/library", { method: "POST", body: JSON.stringify({ title, body, tag }) });
      if (file) { const fd = new FormData(); fd.append("file", file); await fetch(`/api/portal/library/${j.id}/upload`, { method: "POST", body: fd }); }
      onCreated(j.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-2xl border border-cyan/20 bg-space/60 p-5">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TAG_META) as Tag[]).map((t) => (
          <button key={t} onClick={() => setTag(t)} className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] " + (tag === t ? TAG_META[t].cls + " bg-white/[0.04]" : "border-white/10 text-dust")}>{TAG_META[t].icon} {TAG_META[t].label}</button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tag === "help" ? "What do you need help with?" : tag === "resource" ? "Resource title" : "Title"} className={input} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Add details… (optional)" className={input + " resize-none"} />
      <label className="flex cursor-pointer items-center gap-2 text-xs text-fog">
        <Upload size={14} /> <span>{file ? file.name : "Attach a resource (PDF, Word, image…) — optional"}</span>
        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.zip" />
      </label>
      {err ? <p className="text-xs text-signal">{err}</p> : null}
      <button onClick={submit} disabled={busy || title.trim().length < 4} className="btn-primary !px-4 !py-2 text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Post</button>
    </div>
  );
}

function ThreadView({ thread, isAdmin, onBack, onReload }: { thread: Thread; isAdmin: boolean; onBack: () => void; onReload: () => void }) {
  const [reply, setReply] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  async function sendReply() {
    setBusy(true); setErr("");
    try {
      await api(`/api/portal/library/${thread.id}`, { method: "POST", body: JSON.stringify({ op: "reply", body: reply }) });
      if (file) { const fd = new FormData(); fd.append("file", file); fd.append("postId", ""); await fetch(`/api/portal/library/${thread.id}/upload`, { method: "POST", body: fd }); }
      setReply(""); setFile(null); onReload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function helpful(postId: string) { try { await api(`/api/portal/library/${thread.id}`, { method: "POST", body: JSON.stringify({ op: "helpful", postId }) }); onReload(); } catch { /* */ } }
  async function reaction(reaction: keyof Reactions, postId?: string) { try { await api(`/api/portal/library/${thread.id}`, { method: "POST", body: JSON.stringify({ op: "reaction", postId, reaction }) }); onReload(); } catch { /* ignore */ } }
  async function del() { if (!confirm("Delete this thread?")) return; try { await api(`/api/portal/library/${thread.id}`, { method: "DELETE" }); onBack(); } catch (e) { setErr((e as Error).message); } }
  async function addResource() { if (!file) return; setBusy(true); try { const fd = new FormData(); fd.append("file", file); await fetch(`/api/portal/library/${thread.id}/upload`, { method: "POST", body: fd }); setFile(null); onReload(); } finally { setBusy(false); } }

  const AttList = ({ atts }: { atts: Att[] }) => atts.length ? (
    <ul className="mt-2 space-y-1">
      {atts.map((a) => <li key={a.path}><a href={a.url || "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-cyan hover:underline"><FileText size={12} /> {a.name} <span className="text-dust">({Math.round(a.size / 1024)} KB)</span></a></li>)}
    </ul>
  ) : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-dust hover:text-cyan"><ArrowLeft size={13} /> Library</button>
      <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] " + TAG_META[thread.tag].cls}>{TAG_META[thread.tag].icon} {TAG_META[thread.tag].label}</span>
            <h1 className="mt-2 text-xl font-semibold text-ice">{thread.title}</h1>
            <p className="text-[11px] text-dust">{thread.authorName} · {rel(thread.ts)}</p>
          </div>
          {isAdmin ? <button onClick={del} className="text-signal hover:text-signal/70" title="Delete (admin)"><Trash2 size={15} /></button> : null}
        </div>
        {thread.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fog">{thread.body}</p> : null}
        <ReactionBar reactions={thread.reactions} onReact={(r) => reaction(r)} />
        <AttList atts={thread.attachments} />
        <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-dust hover:text-cyan">
          <Paperclip size={12} /> {file ? file.name : "Add a resource to this thread"}
          <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.zip" />
        </label>
        {file ? <button onClick={addResource} disabled={busy} className="ml-2 text-[11px] text-cyan hover:underline">upload</button> : null}
      </div>

      <div className="space-y-2">
        {thread.posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-space/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ice">{p.authorName}</p>
              <span className="text-[10px] text-dust">{rel(p.ts)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-fog">{p.body}</p>
            <AttList atts={p.attachments} />
            <button onClick={() => helpful(p.id)} className={"mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] " + (p.iMarked ? "border-emerald2/50 text-emerald2 bg-emerald2/10" : "border-white/10 text-dust hover:text-emerald2")}>
              <ThumbsUp size={11} /> Helpful {p.helpful ? p.helpful : ""}
            </button>
            <ReactionBar reactions={p.reactions} onReact={(r) => reaction(r, p.id)} />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-space/60 p-4">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a reply / help out…" className="w-full resize-none rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-sm text-ice placeholder:text-dust focus:border-cyan focus:outline-none" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-dust hover:text-cyan"><Paperclip size={12} /> {file ? file.name : "attach"}<input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          <button onClick={sendReply} disabled={busy || reply.trim().length < 1} className="btn-primary ml-auto !px-4 !py-1.5 text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} Reply</button>
        </div>
        {err ? <p className="mt-1 text-xs text-signal">{err}</p> : null}
      </div>
    </div>
  );
}

function ReactionBar({ reactions, onReact }: { reactions: Reactions; onReact: (r: keyof Reactions) => void }) {
  const items: [keyof Reactions, string, string][] = [["like", "👍", "Like"], ["love", "❤️", "Love"], ["dislike", "👎", "Dislike"]];
  return <div className="mt-2 flex flex-wrap gap-1.5">{items.map(([key, emoji, label]) => <button key={key} onClick={() => onReact(key)} title={label} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-dust hover:border-cyan/40 hover:text-ice">{emoji} {reactions?.[key]?.length || ""}</button>)}</div>;
}
