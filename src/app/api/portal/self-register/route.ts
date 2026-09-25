import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit, genPassword, isEmail, emailCredentials } from "@/lib/portal/admin";

export const runtime = "nodejs";

/**
 * Self-service student registration. Students fill a form → account created →
 * enrolled in their class → welcome email with credentials sent automatically.
 *
 * Protected by a class-specific enrollment code (shared by teacher in class).
 * The page only knows the class id; the student types the code, and it is
 * checked here — codes never leave this file.
 */

// Active enrollment codes: classId → { code, school, className }
const ENROLLMENT_CODES: Record<string, { code: string; school: string; className: string }> = {
  "809c56e4-7af5-4a78-88cf-8025649e9f17": {
    code: "PARAGON-A1-2026",
    school: "LGS Paragon",
    className: "AS (Year 1) Physics",
  },
  "e81bb239-9f4a-46b9-ac50-703452f7bee3": {
    code: "PARAGON-A2-2026",
    school: "LGS Paragon",
    className: "A2 (Year 2) Physics",
  },
};

const schema = z.object({
  full_name: z.string().trim().min(3).max(100),
  email: z.string().trim().toLowerCase().refine(isEmail),
  phone: z.string().trim().max(20).optional().default(""),
  class_id: z.string().trim().max(64),
  enrollment_code: z.string().trim().toUpperCase().min(1).max(40),
  // honeypot
  website: z.string().max(0).optional().default(""),
});

type Registration = z.infer<typeof schema>;
type AdminClient = ReturnType<typeof createAdminClient>;

// Friendly copy per field instead of raw Zod messages.
const FIELD_ERRORS: Record<string, string> = {
  full_name: "Please enter your full name (3 to 100 characters).",
  email: "Please enter a valid email address.",
  phone: "Phone number must be 20 characters or fewer.",
  class_id: "This registration link is invalid. Please check with your teacher.",
  enrollment_code: "Please enter the enrollment code from your teacher.",
};

// Naive in-memory rate limit (per warm instance)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const win = 300_000; // 5 minutes
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5; // max 5 registrations per 5 min per IP
}

/** Profile, role, student record and enrolment for a new account. Stops at the first failure. */
async function provisionStudent(
  sb: AdminClient,
  uid: string,
  d: Registration,
  school: string
): Promise<{ studentId: string | null; error: string | null }> {
  const { error: profileErr } = await sb
    .from("edu_profiles")
    .update({ full_name: d.full_name, email: d.email, phone: d.phone || null, status: "active" })
    .eq("id", uid);
  if (profileErr) return { studentId: null, error: `profile update ${profileErr.code}` };

  const { error: roleErr } = await sb
    .from("edu_user_roles")
    .upsert({ user_id: uid, role: "student", granted_by: uid }, { onConflict: "user_id,role" });
  if (roleErr) return { studentId: null, error: `role upsert ${roleErr.code}` };

  const { data: studentRow, error: studentErr } = await sb
    .from("edu_students")
    .insert({ profile_id: uid, school, admission_status: "active", target_qualification: "CAIE A-Level Physics 9702", created_by: uid })
    .select("id")
    .single();
  if (studentErr || !studentRow) return { studentId: null, error: `student insert ${studentErr?.code ?? "no row"}` };

  const { error: enrolErr } = await sb.from("edu_enrolments").upsert(
    { class_id: d.class_id, student_id: studentRow.id, status: "active", enrolled_on: new Date().toISOString().slice(0, 10) },
    { onConflict: "class_id,student_id" }
  );
  if (enrolErr) return { studentId: studentRow.id, error: `enrolment upsert ${enrolErr.code}` };

  return { studentId: studentRow.id, error: null };
}

/** Undo a half-finished registration so the student can simply retry. */
async function rollback(sb: AdminClient, uid: string, studentId: string | null) {
  // edu_students.created_by references the profile without a cascade, so the
  // student row goes first; deleting the auth user then cascades profile + roles.
  if (studentId) {
    const { error } = await sb.from("edu_students").delete().eq("id", studentId);
    if (error) console.error("Self-register rollback (student) failed:", error.code);
  }
  const { error } = await sb.auth.admin.deleteUser(uid);
  if (error) console.error("Self-register rollback (auth user) failed:", error.message);
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (limited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const field = String(parsed.error.errors[0]?.path[0] ?? "");
    return NextResponse.json({ error: FIELD_ERRORS[field] ?? "Please check your details." }, { status: 400 });
  }

  const d = parsed.data;
  if (d.website) {
    // Honeypot triggered
    return NextResponse.json({ error: "Registration failed." }, { status: 400 });
  }

  // The typed code must match the code for the class this page registers into.
  const classEntry = Object.hasOwn(ENROLLMENT_CODES, d.class_id) ? ENROLLMENT_CODES[d.class_id] : undefined;
  if (!classEntry || classEntry.code !== d.enrollment_code) {
    return NextResponse.json({ error: "That enrollment code isn't right. Please check with your teacher." }, { status: 400 });
  }
  const { school, className } = classEntry;

  let sb: AdminClient;
  try {
    sb = createAdminClient();
  } catch (err) {
    console.error("Self-register admin client unavailable:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Registration is unavailable right now. Please try again later." }, { status: 500 });
  }

  // Generate password and create account. createUser rejects an existing email,
  // so no separate lookup is needed.
  const password = genPassword();
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: d.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name, school, class: className, self_registered: true },
  });

  if (createErr?.code === "email_exists" || createErr?.code === "user_already_exists") {
    return NextResponse.json(
      { error: "An account with this email already exists. Please use the login page or contact your teacher." },
      { status: 409 }
    );
  }
  if (createErr || !created?.user) {
    console.error("Self-register createUser failed:", createErr?.message);
    return NextResponse.json({ error: "Could not create account. Please try again or contact your teacher." }, { status: 500 });
  }

  const uid = created.user.id;

  const provisioned = await provisionStudent(sb, uid, d, school);
  if (provisioned.error) {
    console.error("Self-register provisioning failed:", provisioned.error);
    await rollback(sb, uid, provisioned.studentId);
    return NextResponse.json({ error: "Could not complete registration. Please try again or contact your teacher." }, { status: 500 });
  }

  // Audit
  await audit(uid, "self_register", "edu_profiles", uid, { email: d.email, class_id: d.class_id, school });

  // Send welcome email with credentials
  let emailStatus = "not_sent";
  try {
    const result = await emailCredentials(uid, d.email, d.full_name, password, false);
    emailStatus = result.status;
  } catch {
    emailStatus = "error";
  }

  return NextResponse.json(
    {
      ok: true,
      message: `Welcome to ${school} Physics! Your login credentials have been sent to ${d.email}. Please check your inbox (and spam folder).`,
      emailStatus,
    },
    { status: 201 }
  );
}
