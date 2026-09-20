import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Atom } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
import { SITE } from "@/lib/utils";
import { QUALIFICATIONS } from "./qualifications";

export const metadata: Metadata = {
  title: "Physics Courses — Cambridge 9702, O Level 5054 & IB Physics",
  description:
    "Structured physics teaching with Syed Jabran Ali Kamran: Cambridge International AS & A Level Physics (9702), Cambridge O Level Physics (5054) and IB Diploma Physics — concept mastery, exam-focused practice and clear progress tracking.",
  alternates: { canonical: `${SITE.url}/physics` },
};

const listSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Physics courses taught by Syed Jabran Ali Kamran",
  itemListElement: QUALIFICATIONS.map((q, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${SITE.url}/physics/${q.slug}`,
    name: q.name,
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
    { "@type": "ListItem", position: 2, name: "Physics Courses", item: `${SITE.url}/physics` },
  ],
};

export default function PhysicsCoursesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([listSchema, breadcrumbSchema]) }} />
      <PageHero
        eyebrow="Physics Courses"
        title="Master physics. Think like an examiner."
        intro="Structured Cambridge International AS & A Level Physics (9702), Cambridge O Level Physics (5054) and IB Physics — combining concept mastery, exam-focused practice, practical guidance and clear progress tracking."
      />
      <Section tone="void">
        <nav aria-label="Breadcrumb" className="mb-8 text-xs text-dust">
          <Link href="/" className="hover:text-ice">Home</Link> <span aria-hidden>›</span> <span className="text-fog">Physics Courses</span>
        </nav>
        <div className="grid gap-5 md:grid-cols-3">
          {QUALIFICATIONS.map((q) => (
            <Link key={q.slug} href={`/physics/${q.slug}`} className="card card-hover group flex h-full flex-col gap-3 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/25 text-cyan"><Atom size={18} /></span>
              <h2 className="text-lg font-semibold text-ice">{q.name}</h2>
              <p className="flex-1 text-sm leading-relaxed text-fog">{q.summary}</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan">Explore the course <ArrowRight size={14} className="transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
        <p className="mt-10 max-w-3xl text-xs leading-relaxed text-dust">
          Cambridge International and IB qualification names are used to identify the syllabuses taught.
          This site is independent and is not affiliated with or endorsed by Cambridge International Education
          or the International Baccalaureate Organization.
        </p>
      </Section>
    </>
  );
}
