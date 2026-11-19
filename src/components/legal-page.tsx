import type { ReactNode } from "react";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";

/** Shared shell for the Privacy Policy and Terms of Service pages. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} intro={intro} />
      <Section tone="void">
        <article className="mx-auto max-w-prose space-y-10 text-[15px] leading-7 text-fog">
          <p className="text-xs uppercase tracking-wider text-dust">Last updated: {updated}</p>
          {children}
        </article>
      </Section>
    </>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-semibold text-ice md:text-2xl">{title}</h2>
      <div className="space-y-4 [&_a]:text-cyan [&_a:hover]:underline [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ice [&_li]:pl-1 [&_strong]:text-ice [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
