import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { PhysicsField } from "@/components/physics-field";
import { positioning, timeline } from "@/content/site-data";

export const metadata: Metadata = {
  title: "Profile — Syed Jabran Ali Kamran",
  description:
    "Executive and academic profile of Syed Jabran Ali Kamran — Cambridge Physics educator with 16+ years' experience, entrepreneur, and AI & technology consultant.",
};

export default function ProfilePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <PhysicsField />
        <div className="container-x relative grid items-center gap-12 py-16 md:grid-cols-[0.8fr_1.2fr] md:py-20">
          <div className="relative mx-auto w-full max-w-xs">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-cyan/20 via-indigo2/10 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10">
              <Image
                src="/jb-portrait.jpg"
                alt="Portrait of Syed Jabran Ali Kamran"
                width={741}
                height={1024}
                className="h-full w-full object-cover"
                priority
              />
            </div>
          </div>
          <div>
            <p className="eyebrow mb-4">Profile</p>
            <h1 className="text-4xl font-semibold leading-tight text-ice md:text-5xl">
              Syed Jabran Ali Kamran
            </h1>
            <p className="mt-3 font-mono text-sm text-cyan">{positioning.title}</p>
            <p className="mt-6 max-w-xl text-lg leading-8 text-fog">
              A Cambridge Physics educator of sixteen-plus years who became an entrepreneur and
              technologist by extending the same discipline — evidence, first principles, and
              execution — from the classroom into companies and intelligent systems.
            </p>
          </div>
        </div>
      </section>

      {/* BIOGRAPHY */}
      <Section tone="void">
        <div className="mx-auto max-w-prose space-y-5 text-fog">
          <SectionHeading eyebrow="Biography" title="One mind, three connected worlds" />
          <p className="pt-4 leading-relaxed">
            Syed Jabran Ali Kamran has spent more than sixteen years teaching Cambridge Physics —
            A-Level, O-Level and IBDP — across many of Lahore&rsquo;s leading institutions. Physics is
            not just what he teaches; it is how he thinks. The habits of the discipline — measuring
            before claiming, reasoning from first principles, and rebuilding understanding rather than
            memorising it — shape everything he builds.
          </p>
          <p className="leading-relaxed">
            As an entrepreneur, he founded and leads <strong className="text-ice">Jabran &amp; Co</strong>,
            an international business and advisory group, and has built ventures across Pakistan and the
            United Kingdom spanning facilities management, technology consulting, and design. As a
            technologist, he architects AI-agent operations and Supabase-backed enterprise systems that
            pair the speed of automation with the safety of human approval.
          </p>
          <p className="leading-relaxed">
            The result is a single, coherent professional identity: a teacher first, an entrepreneur by
            experience, and a technology builder by evolution.
          </p>
        </div>
      </Section>

      {/* MILESTONES */}
      <Section>
        <SectionHeading eyebrow="Selected milestones" title="A career timeline" />
        <div className="mt-10 space-y-0">
          {timeline.map((t, i) => (
            <Reveal key={t.year} delay={i * 0.06}>
              <div className="flex gap-6 border-l border-white/10 pb-8 pl-6 last:pb-0">
                <div className="relative -ml-[31px] mt-1 grid h-4 w-4 shrink-0 place-items-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan ring-4 ring-abyss" />
                </div>
                <div>
                  <span className="font-mono text-sm text-cyan">{t.year}</span>
                  <p className="mt-0.5 font-display text-lg font-semibold text-ice">{t.title}</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fog">{t.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="space">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-fog">
            For speaking, teaching, consulting or partnership enquiries, get in touch.
          </p>
          <Link href="/contact" className="btn-primary">
            Contact me <ArrowRight size={16} />
          </Link>
        </div>
      </Section>
    </>
  );
}
