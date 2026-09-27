/**
 * What every /api/lab route shares: the access gate, the rate limit, the
 * attempt token check, request schemas and error answers. SERVER-ONLY.
 *
 * The gate is the lab's own rule (practical-lab.ts, the same as the /lab
 * pages): signed in AND (Practical Lab switched on OR lab staff), the legacy
 * "archived" status refused, and anything that can't be checked refused
 * (fail closed). The middleware has already applied the portal's access
 * locks (/api/lab is a portal API there).
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalUser, type PortalUser } from "@/lib/edu/auth";
import { practicalLabAccess } from "@/lib/portal/practical-lab";
import { LAB_ARCHIVED_MESSAGE } from "@/lib/portal/practical-lab-access";
import { attemptKey, currentAttempt, labSecret, readAttempt, resetAttemptCache, tokenExpired } from "@/lib/practical-lab/attempt";
import { attemptParams } from "@/lib/practical-lab/params";
import { LabInputError, experimentOf } from "@/lib/practical-lab/engine.mjs";

export type LabRoute = "attempt" | "view" | "sample" | "trial";

/** Requests per student per minute, per server instance. The room makes a
 *  view request per settled adjustment, a sample per "Inspect instruments"
 *  (and per live adjustment of a circuit), a trial request per release and
 *  one per 20 s of a running trial. */
export const LAB_RATE_LIMITS: Readonly<Record<LabRoute, number>> = { attempt: 30, view: 600, sample: 240, trial: 180 };

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(uid: string, route: LabRoute, now: number): boolean {
  const key = `${route}|${uid}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20_000) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > LAB_RATE_LIMITS[route];
}

/** A successful access check is reused for 30 s (per server instance), so
 *  dragging a control doesn't re-read the student's subjects on every step.
 *  A switch turned off reaches an open lab within that time. */
const ACCESS_TTL_MS = 30_000;
const accessUntil = new Map<string, number>();

/** Tests only: forget cached access checks, attempt numbers and request counts. */
export function resetLabApiState(): void {
  hits.clear();
  accessUntil.clear();
  resetAttemptCache();
}

export function labJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

const refuse = (status: number, error: string, code?: string) => ({ refused: labJson(code ? { error, code } : { error }, status) });

/** The caller, if they may use the lab now; otherwise the refusal. */
export async function labCaller(route: LabRoute, now = Date.now()): Promise<{ user: PortalUser; secret: string } | { refused: NextResponse }> {
  const user = await getPortalUser();
  if (!user) return refuse(401, "Please sign in to use the Practical Lab.", "signed-out");
  if (user.status === "archived") return refuse(403, LAB_ARCHIVED_MESSAGE, "archived");
  if (!((accessUntil.get(user.id) ?? 0) > now)) {
    let access: { ok: boolean };
    try {
      access = await practicalLabAccess(user);
    } catch {
      return refuse(503, "The Practical Lab couldn’t check your access just now. Please try again.", "unavailable");
    }
    if (!access.ok) {
      return refuse(403, "Practical Lab isn’t switched on for your account yet. Ask the admin to add Practical Lab to your subjects.", "no-access");
    }
    accessUntil.set(user.id, now + ACCESS_TTL_MS);
  }
  const secret = labSecret();
  if (!secret) return refuse(503, "The Practical Lab isn’t set up on the server yet. Please tell your teacher.", "not-configured");
  if (rateLimited(user.id, route, now)) return refuse(429, "That’s a lot of lab requests at once. Please wait a moment and try again.", "slow-down");
  return { user, secret };
}

export type LabAttempt = {
  id: string;
  family: string;
  n: number;
  params: Record<string, number>;
  attemptKey: Buffer;
};

/**
 * The attempt a room's token names, for this caller only, while it is still
 * their current attempt at that practical and the token is under 12 hours
 * old. An expired token gets code "expired" (the room renews it, resuming the
 * same attempt); a token for an attempt that a fresh one has replaced gets
 * 409 "superseded" (the room says to reload).
 */
export async function labAttempt(token: string, user: PortalUser, secret: string): Promise<LabAttempt | { refused: NextResponse }> {
  const claims = readAttempt(secret, token);
  if (!claims) return refuse(400, "This lab session isn’t valid any more. Reload the page to carry on.", "attempt");
  if (claims.uid !== user.id) return refuse(403, "This lab session belongs to another account. Reload the page to carry on.", "attempt");
  const experiment = experimentOf(claims.experiment);
  if (!experiment) return refuse(400, "That practical isn’t in the lab.", "attempt");
  if (tokenExpired(claims)) return refuse(401, "This lab session has expired. Reconnecting…", "expired");
  let current: number | null;
  try {
    current = await currentAttempt(user.id, experiment.id);
  } catch {
    return refuse(503, "The Practical Lab couldn’t check your attempt just now. Please try again.", "unavailable");
  }
  if (current !== claims.n) {
    return refuse(409, "This practical was restarted as a fresh attempt (perhaps in another tab). Reload the page to carry on with the new apparatus.", "superseded");
  }
  return {
    id: experiment.id,
    family: experiment.family,
    n: claims.n,
    params: attemptParams(secret, experiment.family, user.id, experiment.id, claims.n),
    attemptKey: attemptKey(secret, claims),
  };
}

// --- request bodies ---------------------------------------------------------------

const settingValue = z.union([z.number(), z.string().max(40)]);
const settingsShape = z.record(settingValue).refine((s) => Object.keys(s).length <= 12, "Too many settings.");
const stateShape = z.object({
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  t: z.number().optional(),
  run: z.number().int().optional(),
  history: z.array(z.object({ t: z.number(), settings: settingsShape })).max(32).optional(),
}).strict();

export const attemptBody = z.object({ experiment: z.string().max(40), fresh: z.boolean().optional() }).strict();
export const viewBody = z.object({ attempt: z.string().max(600), settings: settingsShape, state: stateShape.optional() }).strict();
export const sampleBody = viewBody;
export const trialBody = z.object({
  attempt: z.string().max(600),
  settings: settingsShape,
  state: stateShape.optional(),
  chunk: z.number().int().min(0).max(1000).optional(),
}).strict();

/** The parsed body, or a plain-sentence 400. */
export async function labBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ body: T } | { refused: NextResponse }> {
  // The largest real request (an LED trial with 32 adjustments) is a few KB.
  if (Number(req.headers.get("content-length") ?? 0) > 32_768) return refuse(413, "That lab request is too large. Reload the page and try again.", "bad-request");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return refuse(400, "The lab couldn’t read that request. Reload the page and try again.", "bad-request");
  return { body: parsed.data };
}

/**
 * An engine error as an answer: a request the lab can't accept is 400; a
 * setting the apparatus itself rules out (a model's RangeError, e.g. "Level
 * the string before reading") is 422 with that message, which the room shows
 * as it always has; anything else is a plain 500 that says nothing about the
 * model.
 */
export function labError(error: unknown): NextResponse {
  if (error instanceof LabInputError) return labJson({ error: error.message, code: "bad-request" }, 400);
  if (error instanceof RangeError) return labJson({ error: error.message, code: "apparatus" }, 422);
  console.error("practical-lab engine error", error);
  return labJson({ error: "The lab couldn’t work that out just now. Please try again.", code: "engine" }, 500);
}
