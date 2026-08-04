import Link from "next/link";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { CtaLink } from "@/components/ui/cta-link";
import { coreAreas, ventures, philosophy } from "@/content/site-data";
import { ArrowUpRight } from "lucide-react";

export default function HomePage() {
  const featured = ventures.filter((v) => v.featured);
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_70%_0%,rgba(198,165,90,0.08),transparent)]" />
        <div className="container-x relative flex min-h-[88vh] flex-col justify-center py-24">
          <Reveal>
            <p className="eyebrow mb-6">Entrepreneur · Educator · Strategic Consultant</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="max-w-4xl text-4xl leading-[1.05] md:text-6xl lg:text-7xl">
              Where the discipline of physics meets the instincts of a founder.
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-mutedlight/75 md:text-xl">
              Syed Jabran Ali Kamran builds and advises businesses across education,
              international trade, industrial performance, and AI-driven digital
              transformation — pairing sixteen years of teaching with the operating
              instincts of an entrepreneur across Pakistan and the United Kingdom.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-10 flex flex-wrap gap-4">
              <CtaLink href="/contact">Work with me</CtaLink>
              <CtaLink href="/ventures" variant="ghost">Explore ventures</CtaLink>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CORE AREAS */}
      <Section tone="graphite">
        <SectionHeading
          eyebrow="What I do"
          title="A coherent practice across several disciplines"
          intro="Not a collection of unrelated roles — one operating philosophy applied to education, enterprise, and industry."
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5 md:grid-cols-2 lg:grid-cols-3">
          {coreAreas.map((area, i) => (
            <Reveal key={area.title} delay={i * 0.04}>
              <div className="h-full bg-charcoal p-8 transition-colors hover:bg-graphite">
                <h3 className="text-xl text-ivory">{area.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mutedlight/65">{area.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* SELECTED VENTURES */}
      <Section tone="dark">
        <SectionHeading
          eyebrow="Ventures"
          title="Businesses built and led"
          intro="A founder-led portfolio spanning international consulting, facilities management, technology, and design."
        />
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {featured.map((v, i) => (
            <Reveal key={v.slug} delay={i * 0.05}>
              <Link
                href={`/ventures/${v.slug}`}
                className="group flex h-full flex-col justify-between rounded-xl border border-white/8 bg-charcoal p-8 transition-all hover:border-gold/40"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl text-ivory">{v.name}</h3>
                    <ArrowUpRight className="shrink-0 text-muted transition-colors group-hover:text-gold" size={20} />
                  </div>
                  <p className="mt-2 font-mono text-xs uppercase tracking-widelabel text-gold">
                    {v.role} · {v.geography}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-mutedlight/65">{v.summary}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* PHILOSOPHY */}
      <Section tone="light">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="eyebrow mb-6">Philosophy</p>
            <blockquote className="font-display text-3xl leading-tight text-ink md:text-4xl">
              “{philosophy.quote}”
            </blockquote>
            <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-muted">
              {philosophy.body}
            </p>
          </Reveal>
        </div>
      </Section>

      {/* CTA */}
      <Section tone="graphite">
        <div className="flex flex-col items-start justify-between gap-8 rounded-2xl border border-gold/20 bg-gradient-to-br from-charcoal to-midnight p-10 md:flex-row md:items-center md:p-14">
          <div className="max-w-xl">
            <h2 className="text-3xl text-ivory md:text-4xl">Let's talk about your next move.</h2>
            <p className="mt-4 text-mutedlight/70">
              Consulting, industrial performance, AI transformation, training, or partnership —
              start a conversation.
            </p>
          </div>
          <CtaLink href="/contact">Get in touch</CtaLink>
        </div>
      </Section>
    </>
  );
}
