import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Library } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { createClient } from "@/lib/supabase/server";
import { SITE } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Physics Studio Library — Teacher-Reviewed Answers",
  description:
    "A growing library of Cambridge A-Level, O-Level and IBDP physics questions answered and personally reviewed by educator Syed Jabran Ali Kamran.",
  alternates: { canonical: `${SITE.url}/physics-studio/library` },
};

// Refresh every 5 minutes so newly approved answers appear without a redeploy.
export const revalidate = 300;

type LibRow = {
  id: string;
  slug: string | null;
  question: string;
  curriculum: string;
  topic: string | null;
  teacher_answer: string | null;
  ai_answer: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("physics_questions")
    .select("id, slug, question, curriculum, topic, teacher_answer, ai_answer, reviewed_at, created_at")
    .eq("is_public", true)
    .eq("review_status", "approved")
    .eq("moderation_status", "ok")
    .order("reviewed_at", { ascending: false })
    .limit(100);

  const rows = ((data ?? []) as LibRow[]).filter((r) => r.slug);

  return (
    <>
      <PageHero
        eyebrow="Physics Studio · Library"
        title="Teacher-reviewed physics answers"
        intro="A growing, verified library. Every answer here has been personally reviewed by Syed Jabran Ali Kamran — clear physics, correct units, examiner-standard reasoning."
        video="/videos/hero-studio.mp4"
        poster="/videos/hero-studio-poster.jpg"
      />

      <Section tone="void">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald2/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widelabel text-emerald2">
            <BadgeCheck size={13} /> Reviewed by Syed Jabran Ali Kamran
          </span>
          <Link href="/physics-studio" className="btn-ghost !px-3.5 !py-1.5 text-xs">
            Ask your own question <ArrowRight size={13} />
          </Link>
        </div>

        {rows.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r, i) => (
              <Reveal key={r.id} delay={(i % 6) * 0.05}>
                <Link
                  href={`/physics-studio/library/${r.slug}`}
                  className="card card-hover group flex h-full flex-col p-6"
                >
                  <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widelabel text-dust">
                    <span className="text-cyan">{r.curriculum}</span>
                    {r.topic ? <span>· {r.topic}</span> : null}
                  </div>
                  <p className="mt-3 font-display text-lg font-semibold leading-snug text-ice">{r.question}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald2 transition-transform group-hover:translate-x-1">
                    Read the reviewed answer <ArrowRight size={14} />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <Library className="text-cyan/60" size={30} />
            <p className="max-w-md text-sm leading-relaxed text-fog">
              The library is just getting started. Reviewed answers will appear here as they are verified.{" "}
              <Link href="/physics-studio" className="text-cyan hover:underline">
                Ask a question
              </Link>{" "}
              to be part of it.
            </p>
          </div>
        )}
      </Section>
    </>
  );
}
