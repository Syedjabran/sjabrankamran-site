/**
 * Physics Studio review helpers (SERVER-ONLY).
 * The physics_questions table has RLS that only exposes APPROVED + PUBLIC rows
 * to anon/auth clients. Staff review therefore goes through the service-role
 * admin client, always guarded by an explicit staff check.
 */
import "server-only";

export type ReviewStatus =
  | "ai_answered"
  | "review_requested"
  | "teacher_answered"
  | "approved";

export type PhysicsQuestion = {
  id: string;
  question: string;
  curriculum: string;
  topic: string | null;
  response_mode: string | null;
  student_email: string | null;
  consent: boolean;
  ai_answer: string | null;
  ai_provider: string | null;
  teacher_answer: string | null;
  review_status: ReviewStatus;
  is_public: boolean;
  moderation_status: string;
  reported: boolean;
  slug: string | null;
  created_at: string;
  reviewed_at: string | null;
};

/** URL-safe slug from a question + short id suffix for guaranteed uniqueness. */
export function studioSlug(question: string, id: string): string {
  const base = question
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70)
    .replace(/-+$/g, "");
  const suffix = id.replace(/-/g, "").slice(0, 6);
  return `${base || "physics-question"}-${suffix}`;
}
