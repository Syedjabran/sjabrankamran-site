import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { askPhysicsTutor } from "@/lib/ai/physics-tutor";

const schema = z.object({
  question: z.string().trim().min(10).max(4000),
  curriculum: z.enum(["A-Level", "O-Level", "IBDP", "General", "Other"]),
  topic: z.string().trim().max(80).optional().default(""),
  responseMode: z.string().trim().max(60).optional().default("Explain the concept"),
  requestReview: z.boolean().optional().default(false),
  email: z.string().email().max(200).optional().or(z.literal("")),
  consent: z.boolean().optional().default(false),
  // honeypot
  website: z.string().max(0).optional().default(""),
});

// naive in-memory rate limit (per warm instance)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const win = 60_000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 6;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please check your question and options." }, { status: 400 });

  const d = parsed.data;

  // Ask the AI tutor (provider-independent).
  const ai = await askPhysicsTutor({
    question: d.question,
    curriculum: d.curriculum,
    topic: d.topic || undefined,
    responseMode: d.responseMode,
  });

  let reviewStatus = d.requestReview ? "review_requested" : ai.answer ? "ai_answered" : "review_requested";

  // Store the question. The AI answer is already paid for, so a storage failure
  // (including a missing admin env var) must not discard it.
  let rowId: string | null = null;
  try {
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from("physics_questions")
      .insert({
        question: d.question,
        curriculum: d.curriculum,
        topic: d.topic || null,
        response_mode: d.responseMode,
        student_email: d.consent && d.email ? d.email : null,
        consent: d.consent,
        ai_answer: ai.answer,
        ai_provider: ai.provider,
        review_status: reviewStatus,
        is_public: false,
        moderation_status: "ok",
      })
      .select("id")
      .single();
    if (error) console.error("physics_question storage failed", error.code);
    else rowId = row.id;
  } catch (err) {
    console.error("physics_question storage failed", err instanceof Error ? err.message : "unknown error");
  }

  if (!rowId) {
    // Nothing to show and nothing queued for review.
    if (!ai.answer) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
    // Unsaved, so it cannot enter the review queue: report it as the AI answer it is.
    reviewStatus = "ai_answered";
  }

  // Notify teacher on review request (best-effort; never blocks the response).
  if (rowId && d.requestReview && process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev",
          to: process.env.CONTACT_TO_EMAIL,
          subject: `Physics Studio — teacher review requested (${d.curriculum})`,
          text: `A student requested your review.\n\nCurriculum: ${d.curriculum}\nTopic: ${d.topic || "—"}\n\nQuestion:\n${d.question}\n\nReview in the admin queue (id: ${rowId}).`,
        }),
      });
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json(
    {
      ok: true,
      id: rowId,
      answer: ai.answer,
      provider: ai.provider,
      status: reviewStatus,
      label: ai.answer ? "AI Physics Tutor — Not Yet Reviewed" : "Sent for teacher review",
    },
    { status: 201 }
  );
}
