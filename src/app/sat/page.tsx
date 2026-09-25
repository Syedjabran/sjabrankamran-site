import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Calculator, GraduationCap } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
import { SITE } from "@/lib/utils";
import { SAT_PROGRAMMES } from "./programs";

export const metadata: Metadata = {
  title: "SAT Lab — Digital SAT Practice, Official Tests & Drills",
  description:
    "The SAT Lab in the student portal: adaptive mock exams, the 8 official College Board paper practice tests, and topic drills from the official question bank, covering the digital SAT's Reading and Writing and Math sections.",
  alternates: { canonical: `${SITE.url}/sat` },
};

// JSON.stringify leaves "<" unescaped, so a "</script>" inside any value would
// close the tag. Escape the HTML-significant characters for inline JSON-LD.
function toJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const PROGRAMME_ICON: Record<string, typeof GraduationCap> = {
  "digital-sat": GraduationCap,
  "reading-and-writing": BookOpen,
  math: Calculator,
};

const listSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "SAT Lab programmes",
  itemListElement: SAT_PROGRAMMES.map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE.url}/sat/${p.slug}`,
    name: p.name,
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
    { "@type": "ListItem", position: 2, name: "SAT Lab", item: `${SITE.url}/sat` },
  ],
};

export default function SatHubPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd([listSchema, breadcrumbSchema]) }} />
      <PageHero
        eyebrow="SAT Lab"
        title="Practice the digital SAT the way it's actually run."
        intro="Adaptive mock exams, the 8 official College Board paper practice tests, and topic drills from the official question bank — all inside the student portal's SAT Lab."
      />
      <Section tone="void">
        <nav aria-label="Breadcrumb" className="mb-8 text-xs text-dust">
          <Link href="/" className="hover:text-ice">Home</Link> <span aria-hidden>›</span> <span className="text-fog">SAT Lab</span>
        </nav>
        <div className="grid gap-5 md:grid-cols-3">
          {SAT_PROGRAMMES.map((p) => {
            const Icon = PROGRAMME_ICON[p.slug] ?? GraduationCap;
            return (
              <Link key={p.slug} href={`/sat/${p.slug}`} className="card card-hover group flex h-full min-w-0 flex-col gap-3 p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/25 text-cyan"><Icon size={18} /></span>
                <h2 className="text-lg font-semibold text-ice">{p.name}</h2>
                <p className="flex-1 text-sm leading-relaxed text-fog">{p.summary}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan">Explore the programme <ArrowRight size={14} className="transition group-hover:translate-x-1" /></span>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/portal/sat-lab" className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan/40 bg-cyan/10 px-4 py-3 text-sm font-semibold text-cyan transition hover:bg-cyan/15">
            Open the SAT Lab <ArrowRight size={14} />
          </Link>
          <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-fog transition hover:border-cyan/40 hover:text-ice">
            Ask a question
          </Link>
        </div>

        <p className="mt-10 max-w-3xl text-xs leading-relaxed text-dust">
          SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this website.
        </p>
      </Section>
    </>
  );
}
