import { PageHero } from "@/components/page-hero";
import { Section, SectionHeading } from "@/components/ui/section";
import { philosophy, timeline } from "@/content/site-data";

export const metadata = { title: "About", description: "The professional journey and philosophy of Syed Jabran Ali Kamran." };

export default function AboutPage() {
  return <>
    <PageHero eyebrow="About" title="A career shaped by first principles." intro="Syed Jabran Ali Kamran brings together the analytical discipline of a Physics educator with the practical judgement of an entrepreneur, adviser, and builder of technology-enabled organisations." />
    <Section tone="light"><SectionHeading eyebrow="Professional story" title="From the classroom to the boardroom—and the factory floor." />
      <div className="mt-10 grid gap-8 text-lg leading-8 text-secondary md:grid-cols-2"><p>Teaching Physics established a lasting professional method: define the problem, examine the evidence, test assumptions, and explain the answer clearly. That method now informs work across strategy, industrial performance, global trade, and technology.</p><p>His ventures connect advisory thinking with operational delivery. The objective is not to collect titles, but to build institutions and systems capable of turning considered strategy into measurable action.</p></div>
    </Section>
    <Section><SectionHeading eyebrow="Journey" title="Selected milestones" tone="dark" />
      <div className="mt-12 border-l border-gold/30">{timeline.map((item) => <article key={item.year} className="relative pb-12 pl-8"><span className="absolute -left-1.5 top-2 h-3 w-3 rounded-full bg-gold"/><p className="font-mono text-xs tracking-widelabel text-gold">{item.year}</p><h2 className="mt-2 text-2xl text-ivory">{item.title}</h2><p className="mt-2 max-w-2xl leading-7 text-mutedlight">{item.body}</p></article>)}</div>
    </Section>
    <Section tone="light"><blockquote className="mx-auto max-w-4xl text-center"><p className="font-display text-4xl leading-tight text-ink md:text-6xl">“{philosophy.quote}”</p><p className="mx-auto mt-7 max-w-2xl leading-7 text-secondary">{philosophy.body}</p></blockquote></Section>
  </>;
}
