// src/app/api/sat/profile/route.ts
//
// The signed-in student's own SAT profile (SAT Coach spec 5). GET returns
// it (null before setup); PUT validates, logs what changed and saves it.
// Choosing "Take a short diagnostic" -- on the first save, or when switching
// to it later -- also starts (or resumes) the diagnostic drill.
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { pkToday } from "@/lib/portal/pk-time";
import { applyProfileChange, profileSchemaFor } from "@/lib/sat/coach/profile";
import { ownSatProfile, writeProfile, type OwnSatProfile } from "@/lib/sat/coach/profile-store";
import { ensureDiagnostic } from "@/lib/sat/coach/diagnostic-drill";
import { invalidRequest } from "@/lib/sat/zod-messages";

export const runtime = "nodejs";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** The caller as a student with SAT, or the response refusing them. */
async function student(): Promise<{ uid: string; own: Extract<OwnSatProfile, { status: "student" }> } | { refused: NextResponse }> {
  const user = await getPortalUser();
  if (!user) return { refused: error("Please sign in.", 401) };
  const own = await ownSatProfile(user);
  if (own.status === "unavailable") return { refused: error("Your SAT settings couldn't be loaded. Please try again.", 503) };
  if (own.status === "no-access") return { refused: error("The SAT Lab is not part of your courses.", 403) };
  if (own.status === "staff") return { refused: error("SAT settings are for students.", 403) };
  return { uid: user.id, own };
}

export async function GET() {
  const caller = await student();
  if ("refused" in caller) return caller.refused;
  return NextResponse.json({ profile: caller.own.profile });
}

export async function PUT(req: Request) {
  const caller = await student();
  if ("refused" in caller) return caller.refused;
  const parsed = profileSchemaFor(pkToday()).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed);

  const prev = caller.own.profile;
  const now = Date.now();
  // The diagnostic is started before the profile is written: if the write
  // then fails, the retry resumes that same unfinished diagnostic.
  let diagnosticId: string | null = null;
  if (parsed.data.start.kind === "diagnostic" && prev?.start.kind !== "diagnostic") {
    const started = await ensureDiagnostic(caller.uid, now);
    if (!started.ok) return error(started.error, started.status);
    diagnosticId = started.id;
  }

  const profile = applyProfileChange(prev, parsed.data, new Date(now).toISOString());
  if (!(await writeProfile(caller.uid, profile))) return error("Your SAT settings couldn't be saved. Please try again.", 503);
  return NextResponse.json(diagnosticId ? { profile, diagnosticId } : { profile });
}
