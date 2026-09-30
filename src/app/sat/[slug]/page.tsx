import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Info, ListChecks } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { SITE } from "@/lib/utils";
import { toJsonLd } from "@/lib/json-ld";
import { ROUTING_DISCLOSURE } from "@/lib/sat/client-types";
import { SAT_PROGRAMMES, getSatProgramme } from "../programs";

export function generateStaticParams() {
  return SAT_PROGRAMMES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getSatProgramme(slug);
  if (!p) return {};
  return {
    title: `${p.shortName} — Format & SAT Lab Practice`,
    description: p.summary,
    alternates: { canonical: `${SITE.url}/sat/${p.slug}` },
  };
}

export default async function SatProgrammePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getSatProgramme(slug);
  if (!p) notFound();

  const courseSchema = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: p.name,
    description: p.summary,
    url: `${SITE.url}/sat/${p.slug}`,
    provider: { "@type": "Person", name: SITE.name, url: SITE.url },
    ...(p.domains.length > 0 && { teaches: p.domains.join(", ") }),
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Online",
      location: { "@type": "VirtualLocation", url: `${SITE.url}/portal/sat-lab` },
    },
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "SAT Lab", item: `${SITE.url}/sat` },
      { "@type": "ListItem", position: 3, name: p.shortName, item: `${SITE.url}/sat/${p.slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd([courseSchema, breadcrumbSchema]) }} />
      <PageHero eyebrow="SAT Lab" title={p.name} intro={p.summary} />
      <Section tone="void">
        <nav aria-label="Breadcrumb" className="mb-8 text-xs text-dust">
          <Link href="/" className="hover:text-ice">Home</Link> <span aria-hidden>›</span>{" "}
          <Link href="/sat" className="hover:text-ice">SAT Lab</Link> <span aria-hidden>›</span>{" "}
          <span className="text-fog">{p.shortName}</span>
        </nav>

        <div className="grid min-w-0 gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="min-w-0 space-y-10">
            <div className="min-w-0">
              <SectionHeading eyebrow="Overview" title="What it covers" />
              <ul className="mt-5 space-y-3">
                {p.points.map((point) => (
                  <li key={point} className="card flex min-w-0 items-start gap-3 p-4">
                    <ListChecks size={16} className="mt-0.5 shrink-0 text-cyan" />
                    <p className="text-sm leading-relaxed text-fog">{point}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">
              <SectionHeading eyebrow="Structure" title="Format" />
              <ul className="mt-5 space-y-3">
                {p.format.map((f) => (
                  <li key={f.label} className="card flex min-w-0 items-start gap-3 p-4">
                    <Clock size={16} className="mt-0.5 shrink-0 text-cyan" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ice">{f.label}</p>
                      <p className="mt-1 text-sm text-fog">{f.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-dust">{p.paperTimingNote}</p>
            </div>

            {p.domains.length ? (
              <div className="min-w-0">
                <SectionHeading eyebrow="College Board domains" title="What's tested" />
                <ul className="mt-5 flex flex-wrap gap-2">
                  {p.domains.map((d) => (
                    <li key={d} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-fog">{d}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-dust">Domain and skill labels are the College Board&apos;s own, as published with the official question bank.</p>
              </div>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="card min-w-0 p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ice"><CheckCircle2 size={16} className="text-cyan" /> In the SAT Lab</h2>
              <ul className="mt-4 space-y-2.5">
                {p.provision.map((item) => (
                  <li key={item} className="flex min-w-0 items-start gap-2 text-sm text-fog"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald2" /> {item}</li>
                ))}
              </ul>
              {/* Spec 10.6: every programme page describes Module 2 routing, so the approximation is said verbatim. */}
              <p className="mt-4 flex gap-2 border-t border-white/10 pt-4 text-xs leading-relaxed text-dust">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span><span className="text-fog">About the adaptive mock&rsquo;s routing:</span> {ROUTING_DISCLOSURE}</span>
              </p>
            </div>
            <div className="card min-w-0 space-y-3 p-6">
              <p className="text-sm font-semibold text-ice">Start here</p>
              <Link href="/portal/sat-lab" className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-cyan/40 bg-cyan/10 px-4 py-3 text-sm font-semibold text-cyan transition hover:bg-cyan/15">
                Open the SAT Lab <ArrowRight size={14} />
              </Link>
              <Link href="/contact" className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-fog transition hover:border-cyan/40 hover:text-ice">
                Ask a question <ArrowRight size={14} />
              </Link>
            </div>
          </aside>
        </div>

        <p className="mt-12 max-w-3xl text-xs leading-relaxed text-dust">
          SAT® is a trademark registered by the College Board, which is not affiliated with, and does not endorse, this website.
        </p>
      </Section>
    </>
  );
}
