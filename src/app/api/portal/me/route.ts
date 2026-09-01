import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/edu/auth";
import { aliasFor, isRevealed, setReveal } from "@/lib/portal/alias";

export const runtime = "nodejs";

/** GET — the signed-in user's own profile (incl. their leaderboard code). */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase.from("edu_profiles").select("full_name, email, phone").eq("id", user.id).maybeSingle();
  return NextResponse.json({
    id: user.id,
    full_name: data?.full_name ?? user.fullName ?? "",
    email: data?.email ?? user.email ?? "",
    phone: data?.phone ?? "",
    roles: user.roles,
    alias: aliasFor(user.id),          // the user's anonymous leaderboard code
    reveal_name: await isRevealed(user.id), // true = shows real name on the board
  }, { status: 200 });
}

/** PATCH — update own display name / phone (RLS: id = auth.uid()). */
export async function PATCH(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { full_name?: string; phone?: string; reveal_name?: boolean } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Leaderboard identity preference (Storage-as-DB; independent of edu_profiles).
  if (typeof b.reveal_name === "boolean") {
    const ok = await setReveal(user.id, b.reveal_name);
    if (!ok) return NextResponse.json({ error: "Could not update your leaderboard preference. Please try again." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof b.full_name === "string") {
    const n = b.full_name.trim();
    if (n.length < 2) return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
    patch.full_name = n.slice(0, 100);
  }
  if (typeof b.phone === "string") patch.phone = b.phone.trim().slice(0, 40);
  if (Object.keys(patch).length) {
    const supabase = await createClient();
    const { error } = await supabase.from("edu_profiles").update(patch).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
