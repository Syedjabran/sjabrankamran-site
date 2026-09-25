import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ventures, philosophy } from "@/content/site-data";

export const metadata: Metadata = {
  title: "Enterprise — Ventures, Strategy & Leadership",
  description:
    "The ventures Syed Jabran Ali Kamran has built and leads across Pakistan and the United Kingdom — strategic advisory, industrial performance, global trade, and technology.",
  alternates: { canonical: "/enterprise" },
};

export default function EnterprisePage() {
  return (
    <>
      <PageHero
        eyebrow="Enterprise & Ventures"
        title="Building, from first principles"
        intro="The same discipline that governs a physics problem governs a business one: define it precisely, respect the evidence, and reason toward something that works. Here are the ventures I have built and lead."
        tone="emerald"
        video="/videos/hero-enterprise.mp4"
        poster="/videos/hero-enterprise-poster.jpg"
      />

      <Section tone="void">
        <SectionHeading
          eyebrowTone="emerald"
          eyebrow="Ventures"
          title="What I have built"
          intro="My role, thinking, and contribution in each — with links to the official organisations."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {ventures.map((v, i) => (
            <Reveal key={v.slug} delay={i * 0.06}>
              <div className="card card-hover flex h-full flex-col p-7">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-xl font-semibold text-ice">{v.name}</h3>
                  <span className="shrink-0 rounded-full border border-emerald2/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widelabel text-emerald2">
                    {v.role}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-dust">
                  <span>{v.sector}</span>
                  <span>·</span>
                  <span>{v.geography}</span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-fog">{v.summary}</p>
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widelabel text-emerald2">My contribution</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-fog">{v.contribution}</p>
                </div>
                {v.url ? (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener"
                    className="mt-5 inline-flex items-center gap-1.5 text-sm text-emerald2 hover:underline"
                  >
                    Visit official site <ArrowRight size={14} />
                  </a>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-display text-2xl font-semibold leading-snug text-ice md:text-3xl">
            &ldquo;{philosophy.quote}&rdquo;
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-fog">{philosophy.body}</p>
          <div className="mt-8">
            <Link href="/contact" className="btn-ghost">
              Corporate &amp; partnership enquiries <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
