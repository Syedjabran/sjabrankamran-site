"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { studioSlug } from "@/lib/edu/studio";

type ActionResult = { ok: boolean; error?: string };

async function requireStaff() {
  const user = await getPortalUser();
  if (!user || !isStaff(user.roles)) return null;
  return user;
}

async function audit(actorId: string, action: string, entityId: string, details?: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    await admin.from("edu_audit_logs").insert({
      actor_id: actorId,
      action,
      entity: "physics_question",
      entity_id: entityId,
      details: details ?? {},
    });
  } catch {
    /* audit is best-effort */
  }
}

/** Save (or update) the teacher's reviewed answer without publishing yet. */
export async function saveTeacherAnswer(id: string, teacherAnswer: string): Promise<ActionResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Not authorised." };
  const text = teacherAnswer.trim();
  if (text.length < 10) return { ok: false, error: "Please write a fuller answer before saving." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("physics_questions")
    .update({ teacher_answer: text, review_status: "teacher_answered", reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await audit(user.id, "studio.save_answer", id);
  revalidatePath("/portal/studio");
  return { ok: true };
}

/** Approve + publish an answer to the public library. */
export async function approveAndPublish(id: string, teacherAnswer: string): Promise<ActionResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Not authorised." };
  const text = teacherAnswer.trim();
  if (text.length < 10) return { ok: false, error: "Write a reviewed answer before publishing." };

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("physics_questions")
    .select("id, question, slug")
    .eq("id", id)
    .single();
  if (readErr || !row) return { ok: false, error: readErr?.message ?? "Question not found." };

  const slug = (row.slug as string | null) || studioSlug(row.question as string, row.id as string);

  const { error } = await admin
    .from("physics_questions")
    .update({
      teacher_answer: text,
      review_status: "approved",
      is_public: true,
      moderation_status: "ok",
      slug,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await audit(user.id, "studio.approve_publish", id, { slug });
  revalidatePath("/portal/studio");
  revalidatePath("/physics-studio/library");
  revalidatePath(`/physics-studio/library/${slug}`);
  return { ok: true };
}

/** Unpublish an answer (pull it back from the public library). */
export async function unpublish(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Not authorised." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("physics_questions")
    .update({ is_public: false, review_status: "teacher_answered" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit(user.id, "studio.unpublish", id);
  revalidatePath("/portal/studio");
  revalidatePath("/physics-studio/library");
  return { ok: true };
}

/** Reject / hide a question (moderation). */
export async function rejectQuestion(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  if (!user) return { ok: false, error: "Not authorised." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("physics_questions")
    .update({ moderation_status: "rejected", is_public: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit(user.id, "studio.reject", id);
  revalidatePath("/portal/studio");
  return { ok: true };
}
