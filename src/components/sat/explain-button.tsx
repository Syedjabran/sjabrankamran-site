"use client";
// "Explain my mistake" for one finished question (drill and daily-challenge
// review, the diagnostic, a score report, the Progress page's recent
// mistakes). A tap opens the SAT tutor's explanation in an overlay ON THIS
// PAGE -- a right-side panel from 640 px up, a full-height bottom sheet
// below -- so the student never leaves the drill or report they are in:
// closing it (the X, Esc, a tap on the backdrop) puts them back exactly
// where they were. The request is the tutor's own explain turn
// (coach/tutor-client.ts: POST /api/sat/tutor with the question and
// `from`), so the server's rules all hold -- only a question this student
// finished, paused while a timed module runs, 40 messages a day.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessagesSquare, X } from "lucide-react";
import type { TutorAction, TutorTurnResult } from "@/lib/sat/client-types";
import { requestAction, requestTurn, turnBody } from "./coach/tutor-client";
import { ActionButtons, Bubble, Typing } from "./coach/tutor-parts";

type Ask =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "answered"; turn: TutorTurnResult }
  // `retry`: asking again can help (not after today's messages are used up).
  | { kind: "failed"; error: string; retry: boolean };

/** The explain turn and its actions, kept while the overlay is closed: a
 *  second open shows the same reply without spending another message. */
function useExplain(questionId: string, from: string | undefined) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask>({ kind: "idle" });
  const [pending, setPending] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const explain = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAsk({ kind: "asking" });
    const outcome = await requestTurn(turnBody("", questionId, from));
    inFlight.current = false;
    if (outcome.ok) {
      setPending(outcome.turn.actions.map((a) => a.id));
      setAsk({ kind: "answered", turn: outcome.turn });
    } else {
      setAsk({ kind: "failed", error: outcome.error, retry: outcome.status !== 429 });
    }
  }, [questionId, from]);

  /** Only on the student's tap. A drill or a SAT Lab page leaves this page
   *  (the overlay says so under the button); a full-exam move stays. */
  async function runAction(action: TutorAction) {
    setBusy(action.id);
    setActionError(null);
    const outcome = await requestAction(action.id);
    if (!outcome.ok) {
      if (outcome.status === 410) setPending((ids) => ids.filter((id) => id !== action.id));
      setActionError(outcome.error);
      setBusy(null);
      return;
    }
    if (outcome.note !== null) {
      setNotes((n) => ({ ...n, [action.id]: outcome.note as string }));
      setPending((ids) => ids.filter((id) => id !== action.id));
      setBusy(null);
      return;
    }
    router.push(outcome.href);
  }

  return { ask, explain, pending, notes, busy, actionError, runAction };
}

/** `from`: the drill or sitting the question was answered in (whose answer
 *  the tutor explains). `context`: what the overlay names the question by
 *  ("Question 4"). */
export function ExplainButton({ questionId, from, label = "Explain my mistake", context }: {
  questionId: string; from?: string; label?: string; context?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const state = useExplain(questionId, from);
  const { ask, explain } = state;
  const close = useCallback(() => setOpen(false), []);

  function openPanel() {
    setOpen(true);
    // Asked on the tap itself (never from an effect, which development
    // mode runs twice): one tap, one message.
    if (ask.kind === "idle" || (ask.kind === "failed" && ask.retry)) void explain();
  }

  return (
    <>
      <button
        ref={buttonRef} type="button" onClick={openPanel} aria-haspopup="dialog" aria-expanded={open}
        className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
      >
        <MessagesSquare size={14} /> {label}
      </button>
      {open ? (
        <Sheet onClose={close} returnFocus={buttonRef} context={context}>
          <ExplainBody {...state} />
        </Sheet>
      ) : null}
    </>
  );
}

function ExplainBody({ ask, explain, pending, notes, busy, actionError, runAction }: ReturnType<typeof useExplain>) {
  if (ask.kind === "idle" || ask.kind === "asking") return <Typing />;
  if (ask.kind === "failed") {
    return (
      <div className="space-y-3">
        <p role="alert" className="break-words rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-fog">{ask.error}</p>
        {ask.retry ? <button type="button" onClick={() => void explain()} className="btn-ghost !px-3 !py-1.5 text-xs">Try again</button> : null}
      </div>
    );
  }
  const { turn } = ask;
  return (
    <div className="space-y-4">
      <Bubble message={{ role: "assistant", text: turn.reply, at: 0 }} />
      {turn.actions.length ? (
        <ActionButtons actions={turn.actions} pending={pending} notes={notes} busy={busy} disabled={false} onRun={(a) => void runAction(a)} withDestination />
      ) : null}
      {actionError ? <p role="alert" className="break-words text-sm text-signal">{actionError}</p> : null}
      <p className="text-xs text-dust">{turn.remaining} tutor {turn.remaining === 1 ? "message" : "messages"} left today</p>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab stay inside the open panel. */
function keepFocusInside(e: KeyboardEvent, panel: HTMLElement) {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!items.length) { e.preventDefault(); panel.focus(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !panel.contains(active) || active === panel;
  if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
}

/** The overlay itself: a modal dialog over the page, the page's scroll
 *  locked (and kept) while it is open, the rest of the page `inert` (no
 *  focus, clicks or screen-reader reading behind it), focus inside it, and
 *  back on the button that opened it when it closes. */
function Sheet({ onClose, returnFocus, context, children }: {
  onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null>; context?: string; children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const opener = returnFocus.current;
    const body = document.body;
    // Everything else on the page goes inert while the dialog is open (the
    // dialog is portalled straight into <body>, so that is its siblings).
    const behind = Array.from(body.children).filter((el) => el !== rootRef.current && !el.hasAttribute("inert"));
    for (const el of behind) el.setAttribute("inert", "");
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    // The scrollbar goes while the page is locked: pad by its width so the
    // page behind doesn't shift sideways.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    panel?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Tab" && panel) keepFocusInside(e, panel);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const el of behind) el.removeAttribute("inert"); // before focusing back into the page
      body.style.overflow = before.overflow;
      body.style.paddingRight = before.paddingRight;
      // preventScroll: the page stays exactly where the student left it.
      opener?.focus({ preventScroll: true });
    };
  }, [onClose, returnFocus]);

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="absolute inset-x-0 bottom-0 top-6 flex min-w-0 flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-abyss shadow-2xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
      >
        <header className="flex min-w-0 items-start gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan/30 text-cyan"><MessagesSquare size={16} /></span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg text-ice">Explain my mistake</h2>
            {context ? <p className="break-words text-xs text-dust">{context}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-fog transition hover:text-ice">
            <X size={16} />
          </button>
        </header>
        {/* polite: the reply is read out when it replaces "thinking" */}
        <div aria-live="polite" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        <footer className="border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-xs text-dust sm:px-5">
          <Link href="/portal/sat-lab/tutor" className="text-cyan underline">Open the full tutor</Link> to keep talking — it leaves this page; this explanation is saved there.
        </footer>
      </div>
    </div>,
    document.body,
  );
}
