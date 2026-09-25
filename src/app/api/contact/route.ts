import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema=z.object({name:z.string().trim().min(2).max(120),email:z.string().email().max(200),type:z.string().trim().min(2).max(80),message:z.string().trim().min(20).max(5000),consent:z.union([z.literal("on"),z.literal(true)]),company_website:z.string().max(0).optional().default("")});
type Enquiry = z.infer<typeof schema>;

// naive in-memory rate limit (per warm instance)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const win = 300_000; // 5 minutes
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

/** Email the enquiry to the site owner. Returns the value stored in delivery_status. */
async function notifyOwner(d: Enquiry): Promise<string> {
  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_TO_EMAIL) return "not_configured";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev",
        to: process.env.CONTACT_TO_EMAIL,
        reply_to: d.email,
        subject: `Website enquiry — ${d.type.replace(/[\r\n]+/g, " ")}`,
        text: `New enquiry from the website contact form.\n\nName: ${d.name}\nEmail: ${d.email}\nType: ${d.type}\n\nMessage:\n${d.message}`,
      }),
    });
    if (!res.ok) console.error("Contact notification failed", res.status);
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid enquiry" }, { status: 400 });
  const d = parsed.data;

  // Anything past validation is a server fault (missing env, DB down), not a bad request.
  try {
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from("contact_enquiries")
      .insert({ name: d.name, email: d.email, enquiry_type: d.type, message: d.message, consent: true, status: "new" })
      .select("id")
      .single();
    if (error) {
      console.error("Contact storage failed", error.code);
      return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
    }

    // The enquiry is stored; notification is best-effort and only recorded.
    const deliveryStatus = await notifyOwner(d);
    const { error: statusErr } = await supabase
      .from("contact_enquiries")
      .update({ delivery_status: deliveryStatus })
      .eq("id", row.id);
    if (statusErr) console.error("Contact delivery_status update failed", statusErr.code);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Contact enquiry failed", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
