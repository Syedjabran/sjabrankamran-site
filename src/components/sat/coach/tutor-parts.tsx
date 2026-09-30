"use client";
// Pieces of the SAT tutor's UI shared by the full chat (tutor-chat.tsx) and
// the in-page "Explain my mistake" overlay (../explain-button.tsx): a
// message bubble, the tutor's reply as light formatting (paragraphs, "- "
// bullets, **bold**) built as React nodes -- never HTML -- the typing
// indicator, the paused notice and the action buttons.
import type { ReactNode } from "react";
import { ArrowRight, CalendarClock, Dumbbell, Loader2, PauseCircle } from "lucide-react";
import { TUTOR_PAUSED_MESSAGE, type TutorAction, type TutorMessageView } from "@/lib/sat/client-types";
import { actionDestination } from "./tutor-client";

export function PausedNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] p-4 text-sm text-fog">
      <PauseCircle size={18} className="mt-0.5 shrink-0 text-amber-200" />
      <p className="min-w-0 flex-1 basis-48">{TUTOR_PAUSED_MESSAGE}</p>
      <button type="button" onClick={onRetry} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Check again</button>
    </div>
  );
}

export function Bubble({ message }: { message: TutorMessageView }) {
  const mine = message.role === "user";
  return (
    <div className={"min-w-0 break-words rounded-2xl border px-4 py-3 text-sm leading-6 " + (mine ? "border-cyan/30 bg-cyan/10 text-ice" : "border-white/10 bg-white/[0.02] text-fog")}>
      {mine ? <p className="whitespace-pre-wrap">{message.text}</p> : <RichText text={message.text} />}
    </div>
  );
}

export function Typing() {
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

/** The latest reply's action buttons. `withDestination`: each button says
 *  under it where it goes (the in-page overlay, where a tap may leave the
 *  page the student is on). */
export function ActionButtons({ actions, pending, notes, busy, disabled, onRun, withDestination = false }: {
  actions: TutorAction[]; pending: string[]; notes: Record<string, string>; busy: string | null; disabled: boolean; onRun: (a: TutorAction) => void; withDestination?: boolean;
}) {
  return (
    <div className={"flex min-w-0 flex-wrap gap-2" + (withDestination ? " flex-col items-start" : "")}>
      {actions.map((a) => {
        if (notes[a.id]) return <p key={a.id} className="rounded-xl border border-emerald2/30 px-3 py-1.5 text-xs text-emerald2">{notes[a.id]}</p>;
        const live = pending.includes(a.id);
        const Icon = ACTION_ICON[a.type];
        const button = (
          <button
            key={a.id} type="button" disabled={!live || disabled || busy !== null} onClick={() => onRun(a)}
            title={live ? undefined : "This suggestion has expired — ask the tutor again."}
            className={(a.type === "create_drill" ? "btn-primary" : "btn-ghost") + " max-w-full !rounded-2xl !px-3 !py-1.5 text-left text-xs disabled:opacity-40"}
          >
            {busy === a.id ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Icon size={14} className="shrink-0" />}
            <span className="min-w-0 break-words">{a.label}</span>
          </button>
        );
        if (!withDestination) return button;
        return (
          <div key={a.id} className="min-w-0 max-w-full space-y-1">
            {button}
            <p className="break-words pl-1 text-xs text-dust">{live ? actionDestination(a) : "This suggestion has expired — ask the tutor again."}</p>
          </div>
        );
      })}
    </div>
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
export function RichText({ text }: { text: string }) {
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
