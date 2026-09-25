import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Section } from "@/components/ui/section";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { createClient } from "@supabase/supabase-js";
import { SITE } from "@/lib/utils";

export const revalidate = 300;

type Detail = {
  id: string;
  slug: string;
  question: string;
  curriculum: string;
  topic: string | null;
  teacher_answer: string | null;
  ai_answer: string | null;
  reviewed_at: string | null;
  created_at: string;
};

// Cookie-free anon client (RLS limits it to public rows): keeps the page
// static so `revalidate` applies, and a failure resolves to "not found"
// instead of a 500.
async function fetchQuestion(slug: string): Promise<Detail | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase
      .from("physics_questions")
      .select("id, slug, question, curriculum, topic, teacher_answer, ai_answer, reviewed_at, created_at")
      .eq("slug", slug)
      .eq("is_public", true)
      .eq("review_status", "approved")
      .eq("moderation_status", "ok")
      .maybeSingle();
    return (data as Detail | null) ?? null;
  } catch {
    return null;
  }
}

// JSON.stringify leaves "<" unescaped, and the question text is student-written:
// a "</script>" in it would close the tag. Escape HTML-significant characters.
function toJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const q = await fetchQuestion(slug);
  if (!q) return { title: "Answer not found", robots: { index: false } };
  const desc = `${q.curriculum} physics${q.topic ? ` · ${q.topic}` : ""} — reviewed by Syed Jabran Ali Kamran.`;
  const url = `${SITE.url}/physics-studio/library/${q.slug}`;
  return {
    title: q.question.slice(0, 65),
    description: desc,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: q.question.slice(0, 90), description: desc, images: ["/jb-portrait.jpg"] },
    twitter: { card: "summary_large_image", title: q.question.slice(0, 90), description: desc },
  };
}

export default async function LibraryAnswerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const q = await fetchQuestion(slug);
  if (!q) notFound();

  const answer = q.teacher_answer || q.ai_answer || "";
  const reviewed = q.reviewed_at ? new Date(q.reviewed_at) : null;

  const qaSchema = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: q.question,
      text: q.question,
      answerCount: 1,
      dateCreated: q.created_at,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer.replace(/\$+/g, "").slice(0, 5000),
        url: `${SITE.url}/physics-studio/library/${q.slug}`,
        dateCreated: q.reviewed_at ?? q.created_at,
        author: { "@type": "Person", name: "Syed Jabran Ali Kamran", url: SITE.url },
      },
    },
  };

  return (
    <Section tone="void">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(qaSchema) }} />
      <div className="mx-auto max-w-3xl">
        <Link href="/physics-studio/library" className="inline-flex items-center gap-1.5 text-sm text-dust hover:text-ice">
          <ArrowLeft size={14} /> Physics Studio Library
        </Link>

        <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widelabel text-dust">
          <span className="text-cyan">{q.curriculum}</span>
          {q.topic ? <span>· {q.topic}</span> : null}
        </div>
        <h1 className="mt-3 font-display text-2xl font-semibold leading-snug text-ice md:text-3xl">{q.question}</h1>

        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald2/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widelabel text-emerald2">
          <BadgeCheck size={13} /> Reviewed by Syed Jabran Ali Kamran
          {reviewed ? <span className="text-dust"> · {reviewed.toLocaleDateString()}</span> : null}
        </span>

        <div className="card mt-6 p-6 text-sm leading-relaxed text-fog md:p-8">
          <MarkdownRenderer content={answer} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
          <p className="text-sm text-dust">Have a different physics question?</p>
          <Link href="/physics-studio" className="btn-primary !px-4 !py-2 text-sm">
            Ask Physics Studio
          </Link>
        </div>
      </div>
    </Section>
  );
}
