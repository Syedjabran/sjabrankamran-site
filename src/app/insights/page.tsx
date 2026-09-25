import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { articles, articleCategories } from "@/content/articles";

export const metadata: Metadata = {
  title: "Insights — Physics, Teaching, Entrepreneurship & AI",
  description:
    "Writing by Syed Jabran Ali Kamran on physics concepts, A-Level & O-Level exam technique, teaching, entrepreneurship, and applied AI. Physics and education first.",
  alternates: { canonical: "/insights" },
};

export default function InsightsPage() {
  const physics = articles.filter((a) => a.group === "physics");
  const professional = articles.filter((a) => a.group === "professional");

  return (
    <>
      <PageHero
        eyebrow="Insights"
        title="Physics first, then everything it touches"
        intro="Notes on teaching physics, exam technique, and student thinking — alongside entrepreneurship, leadership, and applied AI. Physics and education lead."
        video="/videos/hero-studio.mp4"
        poster="/videos/hero-studio-poster.jpg"
      />

      <Section tone="void">
        <SectionHeading
          eyebrow="Physics & education"
          title="For students, parents & teachers"
          intro="Articles in preparation. Each is reviewed before publication; nothing goes out under my name without my approval."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {physics.map((a, i) => (
            <Reveal key={a.slug} delay={i * 0.05}>
              <article className="card card-hover flex h-full flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widelabel text-cyan">{a.category}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-dust">
                    {a.status === "draft" ? "In preparation" : "Published"}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-ice">{a.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-fog">{a.excerpt}</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-dust">
                  <Clock size={12} /> {a.readMinutes} min read
                  {a.authorship === "ai_assisted" ? <span className="ml-2">· AI-assisted, edited by SJK</span> : null}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Categories"
          title="Topics I write about"
        />
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Physics &amp; students</p>
            <div className="flex flex-wrap gap-2">
              {articleCategories.physics.map((c) => (
                <span key={c} className="rounded-full border border-cyan/20 bg-cyan/[0.04] px-3 py-1.5 text-sm text-fog">{c}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow-emerald mb-3">Professional</p>
            <div className="flex flex-wrap gap-2">
              {articleCategories.professional.map((c) => (
                <span key={c} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-sm text-fog">{c}</span>
              ))}
            </div>
          </div>
        </div>
        {professional.length === 0 ? (
          <p className="mt-8 text-sm text-dust">Professional essays are in preparation and will appear here after review.</p>
        ) : null}
      </Section>
    </>
  );
}
