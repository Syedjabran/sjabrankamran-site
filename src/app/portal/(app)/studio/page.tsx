import { redirect } from "next/navigation";
import Link from "next/link";
import { FlaskConical, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import type { PhysicsQuestion } from "@/lib/edu/studio";
import { ReviewPanel } from "./review-panel";

export const metadata = { title: "Physics Studio — Review", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function StudioReviewPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isStaff(user.roles)) redirect("/portal");

  // physics_questions RLS only exposes approved+public rows to normal clients,
  // so the review queue must be read with the service-role admin client.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("physics_questions")
    .select(
      "id, question, curriculum, topic, response_mode, student_email, consent, ai_answer, ai_provider, teacher_answer, review_status, is_public, moderation_status, reported, slug, created_at, reviewed_at"
    )
    .neq("moderation_status", "rejected")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as PhysicsQuestion[];
  const pending = rows.filter((r) => !r.is_public && r.review_status !== "approved");
  const published = rows.filter((r) => r.is_public);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FlaskConical size={20} className="text-cyan" />
          <h1 className="text-2xl font-semibold text-ice">Physics Studio — review</h1>
        </div>
        <Link href="/physics-studio/library" className="btn-ghost !px-3.5 !py-1.5 text-xs" target="_blank">
          View public library <ExternalLink size={13} />
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
          Could not load the review queue ({error.message}). Confirm the{" "}
          <code className="font-mono text-xs">physics_questions</code> table exists and the service-role key is set.
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widelabel text-dust">
              Awaiting review
              <span className="rounded-full border border-signal/30 px-2 py-0.5 font-mono text-[10px] text-signal">
                {pending.length}
              </span>
            </h2>
            {pending.length ? (
              pending.map((q) => <ReviewPanel key={q.id} q={q} />)
            ) : (
              <p className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-fog">
                Nothing waiting. New questions from Physics Studio (and any personal-review requests) appear here.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widelabel text-dust">
              Published to library
              <span className="rounded-full border border-emerald2/30 px-2 py-0.5 font-mono text-[10px] text-emerald2">
                {published.length}
              </span>
            </h2>
            {published.length ? (
              published.map((q) => <ReviewPanel key={q.id} q={q} />)
            ) : (
              <p className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-fog">
                No answers published yet. Approve a reviewed answer to add it to the public library.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
