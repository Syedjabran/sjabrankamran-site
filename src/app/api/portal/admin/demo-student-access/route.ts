import { NextResponse } from "next/server";
import { audit, genPassword, isSuperAdmin, requireAdmin } from "@/lib/portal/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_STUDENT_UID } from "@/lib/portal/demo-student";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generate a fresh, one-time-visible login for the private QA student. */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: "Super Admin only." }, { status: 403 });

  const sb = createAdminClient();
  const { data, error } = await sb.auth.admin.getUserById(DEMO_STUDENT_UID);
  const email = data.user?.email;
  if (error || !email) return NextResponse.json({ error: "Demo student account was not found." }, { status: 404 });

  const password = genPassword();
  const { error: updateError } = await sb.auth.admin.updateUserById(DEMO_STUDENT_UID, { password });
  if (updateError) return NextResponse.json({ error: "Could not generate a fresh demo login." }, { status: 500 });

  await audit(admin.id, "demo_login_rotated", "auth.users", DEMO_STUDENT_UID, { demo: true });
  return NextResponse.json(
    {
      loginUrl: "https://sjabrankamran.com/portal/login",
      email,
      password,
      name: "Portal QA Student",
      className: "LACAS JT — AS Year 1, G1",
    },
    { status: 200, headers: { "Cache-Control": "no-store, private" } },
  );
}
