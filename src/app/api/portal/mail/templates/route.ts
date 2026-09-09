import { NextResponse } from "next/server";
import { getPortalUser, canAccessGlobalStaffData } from "@/lib/edu/auth";
import { getTemplates, saveTemplates, type Template } from "@/lib/portal/mail";

export const runtime = "nodejs";

export async function GET() {
  const user = await getPortalUser();
  if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  return NextResponse.json({ templates: await getTemplates() }, { status: 200 });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user || !canAccessGlobalStaffData(user.roles)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { templates?: Template[] } | null;
  if (!b || !Array.isArray(b.templates)) return NextResponse.json({ error: "Invalid." }, { status: 400 });
  const clean = b.templates
    .filter((t) => t && t.name && t.subject)
    .map((t) => ({
      id: (t.id || t.name).slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, "-"),
      name: String(t.name).slice(0, 80),
      subject: String(t.subject).slice(0, 200),
      body: String(t.body || "").slice(0, 8000),
    }));
  const ok = await saveTemplates(clean);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
