import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, FlaskConical } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { SITE } from "@/lib/utils";
import { QUALIFICATIONS, getQualification } from "../qualifications";

export function generateStaticParams() {
  return QUALIFICATIONS.map((q) => ({ slug: q.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const q = getQualification(slug);
  if (!q) return {};
  return {
    title: `${q.shortName} — Course, Papers & Preparation`,
    description: q.summary,
    alternates: { canonical: `${SITE.url}/physics/${q.slug}` },
  };
}

export default async function QualificationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const q = getQualification(slug);
  if (!q) notFound();

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: q.name,
    description: q.summary,
    url: `${SITE.url}/physics/${q.slug}`,
    provider: { "@type": "Person", name: SITE.name, url: SITE.url },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Blended",
      location: { "@type": "City", name: "Lahore" },
    },
    teaches: q.topics.join(", "),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "Physics Courses", item: `${SITE.url}/physics` },
      { "@type": "ListItem", position: 3, name: q.shortName, item: `${SITE.url}/physics/${q.slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([courseSchema, breadcrumbSchema]) }} />
      <PageHero eyebrow="Physics Course" title={q.name} intro={q.summary} />
      <Section tone="void">
        <nav aria-label="Breadcrumb" className="mb-8 text-xs text-dust">
          <Link href="/" className="hover:text-ice">Home</Link> <span aria-hidden>›</span>{" "}
          <Link href="/physics" className="hover:text-ice">Physics Courses</Link> <span aria-hidden>›</span>{" "}
          <span className="text-fog">{q.shortName}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-10">
            <div>
              <SectionHeading eyebrow="Who it's for" title="Audience" />
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-fog">{q.audience}</p>
            </div>
            <div>
              <SectionHeading eyebrow="Assessment" title="Papers & components" />
              <ul className="mt-5 space-y-3">
                {q.papers.map((p) => (
                  <li key={p.name} className="card flex items-start gap-3 p-4">
                    <FlaskConical size={16} className="mt-0.5 shrink-0 text-cyan" />
                    <div>
                      <p className="text-sm font-semibold text-ice">{p.name}</p>
                      <p className="mt-1 text-sm text-fog">{p.focus}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SectionHeading eyebrow="Syllabus" title="Topics covered" />
              <ul className="mt-5 flex flex-wrap gap-2">
                {q.topics.map((t) => (
                  <li key={t} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-fog">{t}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-dust">Topic names summarise the current syllabus; always confirm detail against the official syllabus document for your examination year.</p>
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="card p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><BookOpen size={16} className="text-cyan" /> How I prepare students</h2>
              <ul className="mt-4 space-y-2.5">
                {q.provision.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-fog"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald2" /> {item}</li>
                ))}
              </ul>
            </div>
            <div className="card space-y-3 p-6">
              <p className="text-sm font-semibold text-ice">Start here</p>
              <Link href="/physics-studio/library" className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-fog transition hover:border-cyan/40 hover:text-ice">Free solved questions <ArrowRight size={14} /></Link>
              <Link href="/contact" className="flex items-center justify-between gap-2 rounded-xl border border-cyan/40 bg-cyan/10 px-4 py-3 text-sm font-semibold text-cyan transition hover:bg-cyan/15">Enquire about classes <ArrowRight size={14} /></Link>
              <Link href="/portal/login" className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-fog transition hover:border-cyan/40 hover:text-ice">Student portal login <ArrowRight size={14} /></Link>
            </div>
          </aside>
        </div>

        <p className="mt-12 max-w-3xl text-xs leading-relaxed text-dust">
          Qualification names identify the syllabuses taught. This site is independent and is not affiliated
          with or endorsed by Cambridge International Education or the International Baccalaureate Organization.
        </p>
      </Section>
    </>
  );
}
