import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import {
  startSession, appendEvents, saveSnapshot, endSession, requestUnlock, getSession, ATTEMPT_ID_RE,
  type ProctorEvent, type ProctorSession,
} from "@/lib/exam-lab/proctor";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Student-facing proctor endpoint. Everything is scoped to the signed-in user's
 * own uid — a student can only write to their own forensic session.
 *
 * POST body: { action, attemptId, ... }
 *   start          → open a forensic session for an attempt
 *   event          → append integrity events (terminal ones lock/cancel)
 *   snapshot       → store one violation still (base64 JPEG)
 *   end            → mark the attempt submitted (only if not already terminal)
 *   unlock-request → student asks the super-admin to review a locked test
 *   status         → read this attempt's current status
 */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const b = (await req.json().catch(() => null)) as {
    action?: string; attemptId?: string;
    kind?: ProctorSession["kind"]; integrity?: ProctorSession["integrity"];
    meta?: ProctorSession["meta"]; cameraConsent?: boolean;
    events?: Array<{ type?: string; reason?: string; terminal?: boolean; source?: string; at?: number }>;
    dataUrl?: string; reason?: string; note?: string; status?: string;
  } | null;
  if (!b?.action || !b.attemptId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const uid = user.id;
  const attemptId = String(b.attemptId);
  // The id is part of a storage key: reject anything but a plain id.
  if (!ATTEMPT_ID_RE.test(attemptId)) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });

  switch (b.action) {
    case "start": {
      let s: ProctorSession;
      try {
        s = await startSession(uid, attemptId, {
          studentName: user.fullName || user.email, studentEmail: user.email,
          kind: b.kind === "assignment" || b.kind === "test" ? b.kind : "practice",
          integrity: b.integrity === "strict" || b.integrity === "standard" ? b.integrity : "off",
          meta: {
            title: String(b.meta?.title || "Exam Lab").slice(0, 160),
            subtitle: b.meta?.subtitle ? String(b.meta.subtitle).slice(0, 200) : undefined,
            code: b.meta?.code ? String(b.meta.code).slice(0, 40) : undefined,
            ref: b.meta?.ref ? String(b.meta.ref).slice(0, 60) : undefined,
            paperType: b.meta?.paperType ? String(b.meta.paperType).slice(0, 10) : undefined,
          },
          cameraConsent: !!b.cameraConsent,
        });
      } catch {
        return NextResponse.json({ ok: false, error: "Could not open the proctor session. Please retry." }, { status: 503 });
      }
      return NextResponse.json({ ok: true, status: s.status, lockedReason: s.lockedReason }, { status: 200 });
    }
    case "event": {
      const events: ProctorEvent[] = (b.events || []).slice(0, 100).map((e) => ({
        type: String(e.type || "event").slice(0, 40),
        reason: String(e.reason || "").slice(0, 300),
        terminal: !!e.terminal,
        at: typeof e.at === "number" ? e.at : Date.now(),
        source: e.source === "camera" || e.source === "system" ? e.source : "guard",
      }));
      if (!events.length) return NextResponse.json({ ok: true }, { status: 200 });
      const s = await appendEvents(uid, attemptId, events);
      if (!s) return NextResponse.json({ ok: false, error: "No session." }, { status: 404 });
      return NextResponse.json({ ok: true, status: s.status, locked: s.status === "locked", lockedReason: s.lockedReason }, { status: 200 });
    }
    case "snapshot": {
      if (!b.dataUrl) return NextResponse.json({ error: "No image." }, { status: 400 });
      const path = await saveSnapshot(uid, attemptId, b.dataUrl, String(b.reason || "").slice(0, 200));
      return NextResponse.json({ ok: !!path }, { status: path ? 200 : 400 });
    }
    case "end": {
      const status = b.status === "submitted" ? "submitted" : "submitted";
      await endSession(uid, attemptId, status);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    case "unlock-request": {
      const ok = await requestUnlock(uid, attemptId, String(b.note || ""));
      return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
    }
    case "status": {
      const s = await getSession(uid, attemptId);
      if (!s) return NextResponse.json({ ok: true, status: "none" }, { status: 200 });
      return NextResponse.json({ ok: true, status: s.status, lockedReason: s.lockedReason, unlockRequested: !!s.unlockRequest }, { status: 200 });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
