import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit } from "@/lib/portal/admin";
import { notify, type NotifyTarget } from "@/lib/portal/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — admin broadcast announcement into the Notification Centre.
 * body: {
 *   target: "all" | "students" | "school" | "class" | "individual",
 *   school?, class_id?, email?,
 *   title, message?, link?
 * }
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as {
    target?: string; school?: string; class_id?: string; email?: string;
    title?: string; message?: string; link?: string;
  } | null;
  const title = (b?.title || "").trim();
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  let target: NotifyTarget;
  switch (b?.target) {
    case "all": target = { audience: "all" }; break;
    case "students": target = { audience: "students" }; break;
    case "school": {
      if (!(b.school || "").trim()) return NextResponse.json({ error: "Pick a school." }, { status: 400 });
      target = { audience: "school", school: b.school!.trim() };
      break;
    }
    case "class": {
      if (!(b.class_id || "").trim()) return NextResponse.json({ error: "Pick a class." }, { status: 400 });
      target = { audience: "class", classId: b.class_id!.trim() };
      break;
    }
    case "individual": {
      const email = (b.email || "").trim().toLowerCase();
      if (!email) return NextResponse.json({ error: "Enter the recipient's email." }, { status: 400 });
      const { data: prof } = await createAdminClient().from("edu_profiles").select("id").ilike("email", email).maybeSingle();
      if (!prof?.id) return NextResponse.json({ error: "No portal user found with that email." }, { status: 400 });
      target = { uids: [prof.id as string] };
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }

  const link = (b?.link || "").trim();
  const sent = await notify(target, {
    type: "announcement",
    title,
    body: (b?.message || "").trim() || null,
    href: link || null,
  });
  if (!sent) return NextResponse.json({ error: "No recipients matched that target." }, { status: 400 });

  await audit(admin.id, "notify.broadcast", "edu_notifications", null, {
    target: b?.target, school: b?.school || null, class_id: b?.class_id || null,
    email: b?.email || null, title, recipients: sent,
  });
  return NextResponse.json({ ok: true, recipients: sent }, { status: 200 });
}
