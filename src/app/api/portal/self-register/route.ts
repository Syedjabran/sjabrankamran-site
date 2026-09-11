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
  full_name: z.string().trim().min(3, "Name must be at least 3 characters").max(100),
  email: z.string().trim().toLowerCase().refine(isEmail, "Please enter a valid email address"),
  phone: z.string().trim().max(20).optional().default(""),
  enrollment_code: z.string().trim().toUpperCase(),
  // honeypot
  website: z.string().max(0).optional().default(""),
});

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
    const firstError = parsed.error.errors[0]?.message || "Please check your details.";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const d = parsed.data;
  if (d.website) {
    // Honeypot triggered
    return NextResponse.json({ error: "Registration failed." }, { status: 400 });
  }

  // Find class by enrollment code
  const classEntry = Object.entries(ENROLLMENT_CODES).find(([, v]) => v.code === d.enrollment_code);
  if (!classEntry) {
    return NextResponse.json({ error: "Invalid enrollment code. Please check with your teacher." }, { status: 400 });
  }
  const [classId, { school, className }] = classEntry;

  const sb = createAdminClient();

  // Check if email already exists
  const { data: existingUsers } = await sb.auth.admin.listUsers({ perPage: 1 });
  let existingUser = null;
  for (let page = 1; page <= 50; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users?.find((u) => u.email?.toLowerCase() === d.email);
    if (found) {
      existingUser = found;
      break;
    }
    if (!data?.users?.length || data.users.length < 200) break;
  }

  if (existingUser) {
    return NextResponse.json(
      { error: "This email is already registered. Please use the login page or contact your teacher." },
      { status: 400 }
    );
  }

  // Generate password and create account
  const password = genPassword();
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: d.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name, school, class: className, self_registered: true },
  });

  if (createErr || !created?.user) {
    console.error("Self-register createUser failed:", createErr?.message);
    return NextResponse.json({ error: "Could not create account. Please try again or contact your teacher." }, { status: 500 });
  }

  const uid = created.user.id;

  // Update profile
  await sb.from("edu_profiles").update({ full_name: d.full_name, email: d.email, phone: d.phone || null, status: "active" }).eq("id", uid);

  // Grant student role
  await sb.from("edu_user_roles").upsert({ user_id: uid, role: "student", granted_by: uid }, { onConflict: "user_id,role" });

  // Create student record
  const { data: studentRow } = await sb
    .from("edu_students")
    .insert({ profile_id: uid, school, admission_status: "active", target_qualification: "CAIE A-Level Physics 9702", created_by: uid })
    .select("id")
    .maybeSingle();

  // Enroll in class
  if (studentRow?.id) {
    await sb.from("edu_enrolments").upsert(
      { class_id: classId, student_id: studentRow.id, status: "active", enrolled_on: new Date().toISOString().slice(0, 10) },
      { onConflict: "class_id,student_id" }
    );
  }

  // Audit
  await audit(uid, "self_register", "edu_profiles", uid, { email: d.email, class_id: classId, school });

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
