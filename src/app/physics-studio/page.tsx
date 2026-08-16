import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { PhysicsStudioForm } from "@/components/physics-studio-form";
import { WaveDivider } from "@/components/wave-divider";

export const metadata: Metadata = {
  title: "Physics Studio — AI-Assisted, Teacher-Reviewed Physics Help",
  description:
    "Ask a physics question and get AI-assisted, teacher-reviewed guidance for Cambridge A-Level, O-Level and IBDP Physics. The tutor teaches — it doesn't just hand over answers.",
};

const FLOW = [
  { n: "01", t: "Ask", b: "Submit your question and choose curriculum, topic and how you want to be helped." },
  { n: "02", t: "Guided AI help", b: "An AI physics tutor explains — hints, worked examples, or examiner-style guidance." },
  { n: "03", t: "Request review", b: "Want it verified? Ask for a personal review by Syed Jabran Ali Kamran." },
  { n: "04", t: "Verified answer", b: "Reviewed answers are clearly labelled and can join the public library." },
  { n: "05", t: "Explore resources", b: "Follow related concepts and articles to go deeper." },
];

export default function PhysicsStudioPage() {
  return (
    <>
      <PageHero
        eyebrow="Physics Studio"
        title="Ask physics. Get taught, not just told."
        intro="An AI-assisted learning environment built by a Cambridge Physics educator. Every answer is clearly labelled, and you can always request a personal teacher review."
        video="/videos/hero-studio.mp4"
        poster="/videos/hero-studio-poster.jpg"
      />

      <Section tone="void">
        <SectionHeading eyebrow="Ask a question" title="Physics Studio tutor" />
        <div className="mt-8">
          <PhysicsStudioForm />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] px-5 py-4">
          <span className="inline-flex items-center gap-2 text-sm text-fog">
            <BadgeCheck size={16} className="text-emerald2" /> Browse the growing library of teacher-reviewed answers.
          </span>
          <Link href="/physics-studio/library" className="btn-ghost !px-3.5 !py-1.5 text-xs">
            Open the library <ArrowRight size={13} />
          </Link>
        </div>
      </Section>

      <WaveDivider />

      <Section>
        <SectionHeading
          eyebrow="How it works"
          title="Ask · Learn · Review"
          intro="AI helps you learn; a human educator verifies. The two are always kept clearly separate."
        />
        <div className="mt-10 grid gap-3 md:grid-cols-5">
          {FLOW.map((f, i) => (
            <Reveal key={f.n} delay={i * 0.07}>
              <div className="card h-full p-5">
                <span className="font-mono text-xs text-cyan">{f.n}</span>
                <p className="mt-2 font-display text-base font-semibold text-ice">{f.t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fog">{f.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="space">
        <div className="card p-7">
          <p className="eyebrow mb-2">Honesty &amp; safety</p>
          <p className="max-w-3xl text-sm leading-relaxed text-fog">
            The AI tutor never impersonates the teacher. Responses are labelled as
            <span className="text-cyan"> AI Physics Tutor — Not Yet Reviewed</span> until a human review is done, at
            which point they may be marked <span className="text-cyan">Reviewed by Syed Jabran Ali Kamran</span>. The
            tutor states uncertainty, uses correct units and significant figures, and never fabricates citations or
            mark schemes. Submissions are rate-limited and moderated.
          </p>
        </div>
      </Section>
    </>
  );
}
