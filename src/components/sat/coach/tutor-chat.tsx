"use client";
// The Digital SAT Tutor chat (SAT Coach spec 8.4): the stored conversation,
// suggested prompts, the tutor's action buttons (Start drill / Move exam /
// Open), "n messages left today", a typing indicator and the paused state
// while a timed module runs. Replies are plain text with light formatting
// (paragraphs, "- " bullets, **bold**) built as React nodes -- never HTML.
// `explainId` (from ?explain=, with the attempt `explainFrom` from &from=)
// asks for an explanation of that finished question once, then drops the
// parameters so a reload doesn't ask again.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, Dumbbell, Loader2, PauseCircle, SendHorizontal } from "lucide-react";
import {
  TUTOR_COUNT_UNAVAILABLE, TUTOR_EXPLAIN_MESSAGE, TUTOR_MAX_MESSAGE_CHARS, TUTOR_PAUSED_MESSAGE, type TutorAction, type TutorMessageView, type TutorPayload, type TutorTurnResult,
} from "@/lib/sat/client-types";

// The server answers a turn within ~45 s (its route runs for at most 60).
const TURN_TIMEOUT_MS = 58_000;
const ACTION_TIMEOUT_MS = 30_000;
const EXPLAIN_LAST = "Explain my last wrong answer";
const SUGGESTIONS = [
  "What should I work on this week?",
  EXPLAIN_LAST,
  "Make me a 10-question drill on my weakest skill",
  "How should I pace the Math module?",
];
const TIMED_OUT = "The tutor took too long to answer — please try again.";

type Meta = Pick<TutorPayload, "remaining" | "limit" | "paused" | "lastWrongId">;

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

const errorText = (data: Record<string, unknown>, fallback: string) => (typeof data.error === "string" ? data.error : fallback);
const isTimeout = (e: unknown) => e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");

export function TutorChat({ firstName, explainId, explainFrom = null }: { firstName: string; explainId: string | null; explainFrom?: string | null }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [messages, setMessages] = useState<TutorMessageView[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const explained = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch("/api/sat/tutor", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "The tutor couldn't be loaded. Please try again.");
      const payload = j as TutorPayload;
      setMessages(payload.messages);
      setPending(payload.pending);
      setMeta({ remaining: payload.remaining, limit: payload.limit, paused: payload.paused, lastWrongId: payload.lastWrongId });
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  /** `typed`: the message came from the box -- it empties now and comes
   *  back if the turn fails. */
  async function send(text: string, explainQuestionId?: string, typed = false, from?: string) {
    const message = text.trim();
    if ((!message && !explainQuestionId) || sending) return;
    setSending(true);
    setError(null);
    if (typed) setDraft("");
    setMessages((list) => [...list, { role: "user", text: message || TUTOR_EXPLAIN_MESSAGE, at: Date.now() }]);
    try {
      const { ok, status, data } = await postJson("/api/sat/tutor", { message, ...(explainQuestionId ? { explainQuestionId, ...(from ? { explainFrom: from } : {}) } : {}) }, TURN_TIMEOUT_MS);
      if (!ok) {
        if (status === 423) setMeta((m) => (m ? { ...m, paused: true } : m));
        if (status === 429) setMeta((m) => (m ? { ...m, remaining: 0 } : m));
        throw new Error(errorText(data, "The tutor couldn't answer. Please try again."));
      }
      const turn = data as unknown as TutorTurnResult;
      setMessages((list) => [...list, { role: "assistant", text: turn.reply, at: Date.now(), ...(turn.actions.length ? { actions: turn.actions } : {}) }]);
      setPending(turn.actions.map((a) => a.id));
      setMeta((m) => (m ? { ...m, remaining: turn.remaining } : m));
    } catch (e) {
      // The question wasn't answered (and wasn't counted): take it back off
      // the list so the chat only shows what the tutor remembers.
      setMessages((list) => list.slice(0, -1));
      if (typed) setDraft((d) => d || text);
      setError(isTimeout(e) ? TIMED_OUT : (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // ?explain=<id>: ask once, then drop the parameter (a reload won't re-ask).
  useEffect(() => {
    if (!meta || !explainId || explained.current === explainId) return;
    explained.current = explainId;
    router.replace("/portal/sat-lab/tutor", { scroll: false });
    void send("", explainId, false, explainFrom ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send reads current state; this must run once per explainId
  }, [meta, explainId]);

  function suggest(text: string) {
    if (text === EXPLAIN_LAST && meta?.lastWrongId) void send(EXPLAIN_LAST, meta.lastWrongId);
    else void send(text);
  }

  async function runAction(action: TutorAction) {
    setBusyAction(action.id);
    setError(null);
    try {
      const { ok, status, data } = await postJson("/api/sat/tutor/action", { id: action.id }, ACTION_TIMEOUT_MS);
      if (!ok) {
        if (status === 410) setPending((ids) => ids.filter((id) => id !== action.id));
        if (status === 423) setMeta((m) => (m ? { ...m, paused: true } : m));
        throw new Error(errorText(data, "That couldn't be done. Please try again."));
      }
      if (typeof data.note === "string") {
        setNotes((n) => ({ ...n, [action.id]: data.note as string }));
        setPending((ids) => ids.filter((id) => id !== action.id));
        setBusyAction(null);
        return;
      }
      router.push(String(data.href));
    } catch (e) {
      setError(isTimeout(e) ? "That took too long — please try again." : (e as Error).message);
      setBusyAction(null);
    }
  }

  if (loadError && !meta) {
    return <p className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">{loadError} <button className="ml-2 text-cyan underline" onClick={() => void load()}>Retry</button></p>;
  }
  if (!meta) return <p className="flex items-center gap-2 text-sm text-dust"><Loader2 size={14} className="animate-spin" /> Loading the tutor…</p>;

  const lastAssistant = messages.map((m) => m.role).lastIndexOf("assistant");
  // An unreadable count (null) says "couldn't check" and leaves the box open:
  // the turn itself re-checks the count on the server.
  const outOfMessages = meta.remaining !== null && meta.remaining <= 0;
  const blocked = meta.paused || outOfMessages;
  return (
    <div className="space-y-4">
      {meta.remaining === null ? (
        <p className="text-xs text-dust">
          {TUTOR_COUNT_UNAVAILABLE} <button type="button" onClick={() => void load()} className="ml-1 text-cyan underline">Check again</button>
        </p>
      ) : (
        <p className="text-xs text-dust">{meta.remaining} of {meta.limit} messages left today</p>
      )}
      {meta.paused ? <PausedNotice onRetry={() => void load()} /> : null}
      <section className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-space/60 p-4 sm:p-5">
        {messages.length === 0 ? <Welcome firstName={firstName} /> : null}
        <ol className="space-y-4">
          {messages.map((m, i) => (
            <li key={`${m.at}-${i}`} className={"flex min-w-0 " + (m.role === "user" ? "justify-end" : "justify-start")}>
              <div className="min-w-0 max-w-[88%] space-y-3">
                <Bubble message={m} />
                {i === lastAssistant && m.actions?.length ? (
                  <ActionButtons actions={m.actions} pending={pending} notes={notes} busy={busyAction} disabled={meta.paused} onRun={(a) => void runAction(a)} />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {sending ? <Typing /> : null}
        {messages.length === 0 && !sending ? <Suggestions disabled={blocked} onPick={suggest} /> : null}
        <div ref={endRef} />
      </section>
      <Composer
        draft={draft} onDraft={setDraft} sending={sending} disabled={blocked}
        placeholder={meta.paused ? TUTOR_PAUSED_MESSAGE : outOfMessages ? "No messages left today — they come back tomorrow." : "Ask about the SAT, your plan or a question you finished…"}
        onSend={() => void send(draft, undefined, true)}
      />
      {error ? <p className="text-sm text-signal">{error}</p> : null}
    </div>
  );
}

// --- pieces --------------------------------------------------------------------

function Welcome({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-1">
      <p className="font-display text-lg text-ice">Hi {firstName}, I&rsquo;m your SAT tutor.</p>
      <p className="text-sm text-fog">I can see your plan, your scores and which skills need work. Ask me anything about the SAT, or pick one of these:</p>
    </div>
  );
}

function PausedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4 text-sm text-fog">
      <PauseCircle size={18} className="mt-0.5 shrink-0 text-amber-200" />
      <p className="min-w-0 flex-1 basis-48">{TUTOR_PAUSED_MESSAGE}</p>
      <button onClick={onRetry} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Check again</button>
    </div>
  );
}

function Suggestions({ disabled, onPick }: { disabled: boolean; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS.map((s) => (
        <button key={s} type="button" disabled={disabled} onClick={() => onPick(s)} className="max-w-full rounded-full border border-cyan/30 px-3 py-1.5 text-left text-xs text-cyan hover:bg-cyan/10 disabled:opacity-40">
          {s}
        </button>
      ))}
    </div>
  );
}

function Bubble({ message }: { message: TutorMessageView }) {
  const mine = message.role === "user";
  return (
    <div className={"min-w-0 break-words rounded-2xl border px-4 py-3 text-sm leading-6 " + (mine ? "border-cyan/30 bg-cyan/10 text-ice" : "border-white/10 bg-white/[0.02] text-fog")}>
      {mine ? <p className="whitespace-pre-wrap">{message.text}</p> : <RichText text={message.text} />}
    </div>
  );
}

function Typing() {
  return (
    <p className="flex items-center gap-2 text-sm text-dust" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan/70" style={{ animationDelay: `${i * 150}ms` }} />)}
      </span>
      The tutor is thinking…
    </p>
  );
}

const ACTION_ICON = { create_drill: Dumbbell, move_mock: CalendarClock, open: ArrowRight } as const;

function ActionButtons({ actions, pending, notes, busy, disabled, onRun }: {
  actions: TutorAction[]; pending: string[]; notes: Record<string, string>; busy: string | null; disabled: boolean; onRun: (a: TutorAction) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {actions.map((a) => {
        if (notes[a.id]) return <p key={a.id} className="rounded-xl border border-emerald2/30 px-3 py-1.5 text-xs text-emerald2">{notes[a.id]}</p>;
        const live = pending.includes(a.id);
        const Icon = ACTION_ICON[a.type];
        return (
          <button
            key={a.id} type="button" disabled={!live || disabled || busy !== null} onClick={() => onRun(a)}
            title={live ? undefined : "This suggestion has expired — ask the tutor again."}
            className={(a.type === "create_drill" ? "btn-primary" : "btn-ghost") + " max-w-full !rounded-2xl !px-3 !py-1.5 text-left text-xs disabled:opacity-40"}
          >
            {busy === a.id ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Icon size={14} className="shrink-0" />}
            <span className="min-w-0 break-words">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Composer({ draft, onDraft, sending, disabled, placeholder, onSend }: {
  draft: string; onDraft: (v: string) => void; sending: boolean; disabled: boolean; placeholder: string; onSend: () => void;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSend();
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  }
  return (
    <form onSubmit={submit} className="flex min-w-0 items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Message the tutor</span>
        <textarea
          value={draft} onChange={(e) => onDraft(e.target.value.slice(0, TUTOR_MAX_MESSAGE_CHARS))} onKeyDown={onKey} rows={2} maxLength={TUTOR_MAX_MESSAGE_CHARS}
          disabled={disabled} placeholder={placeholder}
          className="block w-full min-w-0 resize-y rounded-2xl border border-white/10 bg-space/60 px-4 py-3 text-sm text-ice placeholder:text-dust focus:border-cyan/50 focus:outline-none disabled:opacity-50"
        />
      </label>
      <button type="submit" disabled={disabled || sending || !draft.trim()} className="btn-primary shrink-0 !px-3 !py-3 disabled:opacity-40" aria-label="Send">
        {sending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
      </button>
    </form>
  );
}

// --- light formatting ------------------------------------------------------------

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** "**bold**" -> <strong>; everything else stays text. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ice">{part.slice(2, -2)}</strong>
      : part);
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

/** Blank lines end a block; bullet ("- ", "* ", "• ") and numbered lines
 *  group into lists; other lines join a paragraph, line breaks kept. */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let open = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      open = false;
      continue;
    }
    const last = open ? blocks[blocks.length - 1] : undefined;
    if (BULLET.test(line)) {
      const kind = /^\s*\d/.test(line) ? "ol" : "ul";
      const item = line.replace(BULLET, "");
      if (last && last.kind !== "p" && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last && last.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
    open = true;
  }
  return blocks;
}

/** The tutor's reply as paragraphs and lists of React text nodes, so
 *  nothing the model writes can become markup. */
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {blocksOf(text).map((block, b) => {
        if (block.kind === "p") return <p key={b}>{block.lines.flatMap((line, i) => (i ? [<br key={`br${i}`} />, ...inline(line, String(i))] : inline(line, String(i))))}</p>;
        const items = block.items.map((item, i) => <li key={i}>{inline(item, String(i))}</li>);
        return block.kind === "ol"
          ? <ol key={b} className="list-decimal space-y-1 pl-5">{items}</ol>
          : <ul key={b} className="list-disc space-y-1 pl-5">{items}</ul>;
      })}
    </div>
  );
}
