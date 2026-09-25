import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { techWork } from "@/content/site-data";

export const metadata: Metadata = {
  title: "AI & Technology — Intelligent Systems & Automation",
  description:
    "Practical AI and technology work by Syed Jabran Ali Kamran — AI-agent operations, multi-model orchestration, Supabase-backed enterprise systems, and approval-controlled automation.",
  alternates: { canonical: "/ai-technology" },
};

const FLOW = [
  { label: "Enquiry", body: "A business enquiry arrives." },
  { label: "AI drafts", body: "An AI agent structures it into a CRM record and proposes next actions." },
  { label: "Human approves", body: "A person reviews and approves any consequential action." },
  { label: "System acts", body: "Data moves securely between systems; the action is logged." },
  { label: "Decision", body: "Analytics turn the outcome into a management decision." },
];

export default function AiTechnologyPage() {
  return (
    <>
      <PageHero
        eyebrow="AI & Technology"
        title="Intelligence, with a human in the loop"
        intro="I build AI systems that produce measurable business outcomes — agents that assist, systems that scale, and automation that always keeps a person in control of the decisions that matter."
        tone="magenta"
        video="/videos/hero-technology.mp4"
        poster="/videos/hero-technology-poster.jpg"
      />

      <Section tone="void">
        <SectionHeading
          eyebrowTone="magenta"
          eyebrow="What I build"
          title="Practical AI & systems work"
          intro="Not a logo wall — the outcomes these systems produce."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {techWork.map((t, i) => (
            <Reveal key={t.title} delay={i * 0.06}>
              <div className="card card-hover flex h-full flex-col p-6">
                <h3 className="font-display text-lg font-semibold text-ice">{t.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-fog">{t.body}</p>
                <div className="mt-4 rounded-lg border border-magenta/20 bg-magenta/[0.04] px-3 py-2">
                  <p className="text-xs font-medium text-magenta-soft">Outcome</p>
                  <p className="mt-0.5 text-sm text-fog">{t.outcome}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* WORKFLOW DIAGRAM */}
      <Section>
        <SectionHeading
          eyebrowTone="magenta"
          eyebrow="How it works"
          title="Enquiry → AI draft → human approval → action"
          intro="A simplified view of an approval-controlled AI workflow."
        />
        <div className="mt-10 grid gap-3 md:grid-cols-5">
          {FLOW.map((f, i) => (
            <Reveal key={f.label} delay={i * 0.08}>
              <div className="card relative h-full p-5">
                <span className="font-mono text-xs text-magenta">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 font-display text-base font-semibold text-ice">{f.label}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fog">{f.body}</p>
                {i < FLOW.length - 1 ? (
                  <ArrowRight size={16} className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-magenta/40 md:block" />
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="space">
        <div className="card flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="max-w-xl">
            <h3 className="font-display text-2xl font-semibold text-ice">Exploring AI for your organisation?</h3>
            <p className="mt-2 text-fog">
              From AI agents to CRM and automation — let&rsquo;s talk about outcomes, not just tools.
            </p>
          </div>
          <Link href="/contact" className="btn-primary">
            Technology &amp; AI consultation <ArrowRight size={16} />
          </Link>
        </div>
      </Section>
    </>
  );
}
