import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Sparkles, ListChecks, FileDown } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { Reveal } from "@/components/ui/reveal";
import { ExamRunner } from "@/components/exam-lab/exam-runner";

export const metadata: Metadata = {
  title: "Exam Lab — On-demand CAIE 9702 Physics Practice Tests",
  description:
    "Generate a short Cambridge A-Level Physics (9702) practice test on demand, tagged by topic and thinking level (LOT/HOT). Answer on screen, get auto-marked, reveal examiner mark schemes, and export to PDF.",
};

const FEAT = [
  { icon: Sparkles, t: "Fresh every time", b: "AI writes original 9702-style questions on demand — no two papers are the same." },
  { icon: ListChecks, t: "Topic + LOT/HOT tagged", b: "Pick topics and choose lower-order (recall/apply) or higher-order (analyse/evaluate) thinking." },
  { icon: FileDown, t: "Answer · mark · PDF", b: "Answer on screen, submit for instant MCQ marking with model answers, then save the paper as a PDF." },
];

export default function ExamLabPage() {
  return (
    <>
      <PageHero
        eyebrow="Physics Studio · Exam Lab"
        title="Build a 9702 physics test in seconds."
        intro="Choose your topics and thinking level, and the Exam Lab assembles a randomised Cambridge-style practice paper. Answer it here, get auto-marked, then reveal examiner-style mark schemes — or export the whole thing to PDF."
        field
      />

      <Section tone="void">
        <SectionHeading eyebrow="Quick practice" title="Generate a paper" intro="Short, AI-generated papers — free and open. For full CAIE exact-pattern papers from the past-paper bank, use the portal." />
        <div className="mt-8">
          <ExamRunner mode="public" maxCount={5} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan/25 bg-cyan/[0.04] px-5 py-4">
          <span className="inline-flex items-center gap-2 text-sm text-fog">
            <Lock size={16} className="text-cyan" /> Students &amp; classes: full CAIE exact-pattern papers (P1 / P2 / P4) live in the portal.
          </span>
          <Link href="/portal/exam-lab" className="btn-ghost !px-3.5 !py-1.5 text-xs">
            Open in portal <ArrowRight size={13} />
          </Link>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="How it works" title="Pick · Practise · Perfect" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {FEAT.map((f, i) => (
            <Reveal key={f.t} delay={i * 0.07}>
              <div className="card card-hover h-full p-6">
                <f.icon size={22} className="text-cyan" />
                <h3 className="mt-4 font-display text-lg text-ice">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fog">{f.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-dust">
          Questions here are original, generated in the style of the Cambridge International AS &amp; A Level Physics 9702 (2025–2027) syllabus. Cambridge Assessment International Education is not affiliated with this tool and does not endorse it.
        </p>
      </Section>
    </>
  );
}
