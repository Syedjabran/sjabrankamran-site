import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOnboarding, saveOnboarding, validateOnboarding, type Onboarding, type Guardian,
} from "@/lib/portal/onboarding";

export const runtime = "nodejs";

// GET: current onboarding + read-only school/class (from enrolment).
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const existing = await getOnboarding(user.id);
  const supabase = createAdminClient();
  const { data: student } = await supabase.from("edu_students").select("id, school, date_of_birth").eq("profile_id", user.id).maybeSingle();
  let classLabel = "";
  if (student?.id) {
    const { data: enr } = await supabase
      .from("edu_enrolments")
      .select("edu_classes(name, room)")
      .eq("student_id", student.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const cls = (enr as { edu_classes?: { name?: string; room?: string } } | null)?.edu_classes;
    if (cls) classLabel = cls.name || "";
  }

  return NextResponse.json({
    onboarding: existing,
    defaults: {
      full_name: existing?.full_name || user.fullName || "",
      school: student?.school || existing?.school || "",
      class_label: classLabel || existing?.class_label || "",
      date_of_birth: existing?.date_of_birth || student?.date_of_birth || "",
    },
    complete: !!existing?.completed_at,
  });
}

// POST: save (and, if valid, complete) onboarding.
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!user.roles.includes("student")) {
    return NextResponse.json({ error: "Only students complete onboarding." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Partial<Onboarding> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const guardians: Guardian[] = (body.guardians || [])
    .filter((g) => g && (g.name || g.email || g.phone))
    .map((g, i) => ({
      relationship: (g.relationship || "parent").slice(0, 40),
      name: (g.name || "").slice(0, 120),
      email: (g.email || "").trim().slice(0, 160),
      phone: (g.phone || "").slice(0, 40),
      is_primary: !!g.is_primary || i === 0,
    }));
  if (guardians.length && !guardians.some((g) => g.is_primary)) guardians[0].is_primary = true;

  const draft: Onboarding = {
    completed_at: null,
    full_name: (body.full_name || "").slice(0, 120).trim(),
    preferred_name: (body.preferred_name || "").slice(0, 80),
    date_of_birth: (body.date_of_birth || "").slice(0, 10),
    gender: (body.gender || "").slice(0, 20),
    phone: (body.phone || "").slice(0, 40),
    whatsapp: (body.whatsapp || "").slice(0, 40),
    city: (body.city || "").slice(0, 80),
    address: (body.address || "").slice(0, 300),
    photo_path: (body.photo_path || "").slice(0, 200) || undefined,
    school: (body.school || "").slice(0, 120),
    class_label: (body.class_label || "").slice(0, 120),
    guardians,
    emergency_name: (body.emergency_name || "").slice(0, 120),
    emergency_phone: (body.emergency_phone || "").slice(0, 40),
    consent: !!body.consent,
    updated_at: new Date().toISOString(),
  };

  const errors = validateOnboarding(draft);
  if (errors.length) return NextResponse.json({ ok: false, errors }, { status: 422 });

  draft.completed_at = new Date().toISOString();
  const ok = await saveOnboarding(user.id, draft);
  if (!ok) return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });

  // Mirror the essentials into the relational record (best-effort).
  try {
    const supabase = createAdminClient();
    await supabase.from("edu_profiles").update({ full_name: draft.full_name, phone: draft.phone }).eq("id", user.id);
    await supabase.from("edu_students").update({ date_of_birth: draft.date_of_birth || null }).eq("profile_id", user.id);
    await supabase.from("edu_audit_logs").insert({
      actor_id: user.id, action: "onboarding.complete", entity: "portal_onboarding", entity_id: user.id,
      details: { guardians: guardians.length },
    });
  } catch {
    /* non-fatal */
  }

  // Immediately clear the middleware onboarding gate for this browser. The
  // cookie value is the student's own id (middleware only trusts a match), so a
  // different account on a shared device is still re-checked. This also avoids a
  // brief re-gate if storage read-after-write lags right after completion.
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set("pb_onb", user.id, {
    path: "/portal", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12,
  });
  return res;
}
