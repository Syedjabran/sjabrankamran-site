import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { SchoolLogo } from "@/components/school-logo";
import { Section, SectionHeading } from "@/components/ui/section";
import { CtaLink } from "@/components/ui/cta-link";
import { Reveal } from "@/components/ui/reveal";
import {
  currentlyTeaching,
  previousTeaching,
  teachingCapabilities,
  teachingMethod,
} from "@/content/site-data";

export const metadata: Metadata = {
  title: "Education — A-Level, O-Level & IBDP Physics",
  description:
    "16+ years teaching Cambridge A-Level, O-Level and IBDP Physics in Lahore. Conceptual understanding, exam craft, practical skills, and mentoring that builds independent physicists.",
};

const courseSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Syed Jabran Ali Kamran",
  jobTitle: "Physics Educator",
  knowsAbout: ["Cambridge A-Level Physics", "Cambridge O-Level Physics", "IBDP Physics"],
  hasOccupation: {
    "@type": "Occupation",
    name: "Physics Teacher",
    occupationLocation: { "@type": "City", name: "Lahore" },
  },
};

export default function EducationPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseSchema) }} />
      <PageHero
        eyebrow="Education & Physics"
        title="Sixteen years of teaching physics"
        intro="Cambridge A-Level, O-Level and IBDP Physics. I teach students to think in physics — to reason from first principles, respect evidence, and communicate answers the way an examiner expects."
        field
      />

      {/* CURRENTLY TEACHING */}
      <Section tone="void">
        <SectionHeading
          eyebrow="Currently Teaching"
          title="Active A-Level Physics positions"
          intro="Cambridge A-Level Physics across four Lahore institutions."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {currentlyTeaching.map((role, i) => (
            <Reveal key={role.institution} delay={i * 0.06}>
              <div className="card card-hover flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <SchoolLogo logo={role.logo} onDark={role.onDark} monogram={role.monogram} name={role.institution} height={48} />
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-cyan">
                    <span className="h-2 w-2 animate-pulse-soft rounded-full bg-cyan" /> Currently teaching
                  </span>
                </div>
                <p className="font-display text-lg font-semibold text-ice">{role.institution}</p>
                <p className="mt-auto font-mono text-xs uppercase tracking-widelabel text-dust">{role.curriculum}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* METHOD */}
      <Section>
        <SectionHeading
          eyebrow="Teaching method"
          title="How I build understanding"
          intro="A repeatable process that turns confusion into conceptual clarity, and clarity into marks."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teachingMethod.map((m, i) => (
            <Reveal key={m.step} delay={i * 0.05}>
              <div className="card h-full p-5">
                <span className="font-mono text-xs text-cyan">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 font-display text-base font-semibold text-ice">{m.step}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fog">{m.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* CAPABILITIES */}
      <Section tone="void">
        <SectionHeading
          eyebrow="What I teach"
          title="Physics, end to end"
          intro="From mechanics to modern physics, and from concept to exam technique."
        />
        <div className="mt-10 flex flex-wrap gap-2.5">
          {teachingCapabilities.map((c, i) => (
            <Reveal key={c} delay={i * 0.03}>
              <span className="inline-block rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-fog">
                {c}
              </span>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* TEACHING JOURNEY / PREVIOUS INSTITUTIONS */}
      <Section>
        <SectionHeading
          eyebrow="Teaching journey"
          title="Institutions taught across the years"
          intro="Cambridge A-Level and O-Level, plus IBDP — across many of Lahore's leading schools and colleges."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {previousTeaching.map((role, i) => (
            <Reveal key={role.institution} delay={i * 0.03}>
              <div className="card card-hover flex items-center gap-3 p-4">
                <SchoolLogo logo={role.logo} onDark={role.onDark} monogram={role.monogram} name={role.institution} height={44} />
                <div>
                  <p className="text-sm font-medium leading-tight text-ice">{role.institution}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widelabel text-dust">{role.curriculum}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-dust">
          Institution names and logos are shown solely to describe teaching experience. Logos are the
          trademarks of their respective institutions; their use here does not imply endorsement or
          affiliation. Where an official logo was unavailable, a typographic monogram is used.
        </p>
      </Section>

      {/* CTA */}
      <Section tone="space">
        <div className="card flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="max-w-xl">
            <h3 className="font-display text-2xl font-semibold text-ice">Have a physics question?</h3>
            <p className="mt-2 text-fog">
              Physics Studio gives you AI-assisted, teacher-reviewed help — the way I&rsquo;d explain it in class.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <CtaLink href="/physics-studio">Enter Physics Studio</CtaLink>
            <Link href="/contact" className="btn-ghost">
              Academic enquiry <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
