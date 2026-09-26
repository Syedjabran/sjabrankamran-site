import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { audit } from "@/lib/portal/admin";
import { DIRECT_SUBJECT_ONLY, directSubjectOf } from "@/lib/portal/subjects";
import { switchSubject } from "@/lib/portal/subject-admin";
import { invalidRequest } from "@/lib/sat/zod-messages";

export const runtime = "nodejs";

const body = z.object({
  subject: z.string().refine((id) => !!directSubjectOf(id), { message: DIRECT_SUBJECT_ONLY }),
  on: z.boolean(),
});

/** POST /api/portal/admin/users/[id]/subjects { subject, on } — switch a
 *  direct-grant subject (Digital SAT) on or off for a user. Admin-only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Same admin gate as the users action route (requireAdmin), split so a
  // signed-out caller gets 401 rather than 403.
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!isAdmin(user.roles)) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { id: uid } = await params;
  if (!z.string().uuid().safeParse(uid).success) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidRequest(parsed);
  const subject = directSubjectOf(parsed.data.subject);
  if (!subject) return NextResponse.json({ error: DIRECT_SUBJECT_ONLY }, { status: 400 });

  const { data: profile, error: profileError } = await createAdminClient().from("edu_profiles").select("id").eq("id", uid).maybeSingle();
  if (profileError) return NextResponse.json({ error: "The account couldn't be checked just now. Please try again." }, { status: 503 });
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const { on } = parsed.data;
  let saved;
  try {
    saved = await switchSubject(uid, subject.id, on, user.id);
  } catch {
    return NextResponse.json({ error: `${subject.label} couldn't be saved just now. Please try again.` }, { status: 503 });
  }
  await audit(user.id, on ? "subject.grant" : "subject.revoke", "portal_subjects", uid, { subject: subject.id });
  return NextResponse.json({ ok: true, grants: saved.grants });
}
