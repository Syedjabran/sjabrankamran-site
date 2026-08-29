import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/portal/admin";
import { VIEW_AS_COOKIE, PREVIEWABLE } from "@/lib/portal/view-as";
import type { EduRole } from "@/lib/edu/auth";

export const runtime = "nodejs";

/** POST { role } — enter preview as a role; { role: null } clears. Super-admin only. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { role?: string | null };
  const role = b.role as EduRole | null | undefined;
  const valid = role && PREVIEWABLE.includes(role);
  const res = NextResponse.json({ ok: true, role: valid ? role : null }, { status: 200 });
  if (valid) {
    res.cookies.set(VIEW_AS_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 });
  } else {
    res.cookies.set(VIEW_AS_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  }
  return res;
}
