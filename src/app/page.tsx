import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GraduationCap, Building2, Cpu } from "lucide-react";
import { PhysicsField } from "@/components/physics-field";
import { Section, SectionHeading } from "@/components/ui/section";
import { CtaLink } from "@/components/ui/cta-link";
import { Reveal } from "@/components/ui/reveal";
import {
  positioning,
  ecosystems,
  currentlyTeaching,
  teachingMethod,
  ventures,
  timeline,
  philosophy,
} from "@/content/site-data";

const ECO_ICON = { education: GraduationCap, enterprise: Building2, technology: Cpu };
const ECO_ACCENT = {
  education: "text-cyan border-cyan/30",
  enterprise: "text-emerald2 border-emerald2/30",
  technology: "text-magenta border-magenta/30",
};

export default function HomePage() {
  return (
    <>
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <PhysicsField dense />
        <div className="container-x relative grid items-center gap-12 py-16 md:grid-cols-[1.15fr_0.85fr] md:py-24">
          <div>
            <p className="eyebrow mb-5">Physics Educator · Entrepreneur · AI &amp; Technology Consultant</p>
            <h1 className="text-4xl font-semibold leading-[1.03] text-ice sm:text-5xl md:text-6xl">
              {positioning.headline}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-fog">
              {positioning.subhead}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <CtaLink href="/education">Explore my teaching journey</CtaLink>
              <Link href="/physics-studio" className="btn-ghost">
                Enter Physics Studio <ArrowRight size={16} />
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-dust">
              <Link href="/enterprise" className="link-underline hover:text-ice">Explore enterprise work</Link>
              <Link href="/ai-technology" className="link-underline hover:text-ice">Explore AI &amp; technology</Link>
              <Link href="/contact" className="link-underline hover:text-ice">Contact me</Link>
            </div>
          </div>

          {/* Portrait */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-cyan/20 via-indigo2/10 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-void/40">
              <Image
                src="/jb-portrait.jpg"
                alt="Syed Jabran Ali Kamran, Cambridge Physics educator"
                width={741}
                height={1024}
                priority
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-space/90 to-transparent p-5">
                <p className="font-display text-base font-semibold text-ice">Syed Jabran Ali Kamran</p>
                <p className="text-xs text-cyan">16+ years · Cambridge Physics</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CURRENT TEACHING ============ */}
      <Section tone="void">
        <SectionHeading
          eyebrow="Currently Teaching"
          title="Active A-Level Physics positions"
          intro="Teaching Cambridge A-Level Physics across four Lahore institutions."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {currentlyTeaching.map((role, i) => (
            <Reveal key={role.institution} delay={i * 0.06}>
              <div className="card card-hover flex h-full flex-col gap-3 p-5">
                <span className="flex items-center gap-2 text-xs font-medium text-cyan">
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-cyan" /> Active
                </span>
                <p className="font-display text-lg font-semibold text-ice">{role.institution}</p>
                <p className="mt-auto font-mono text-xs uppercase tracking-widelabel text-dust">
                  {role.curriculum}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ============ THREE ECOSYSTEMS ============ */}
      <Section>
        <SectionHeading
          eyebrow="One mind, three worlds"
          title="Education first — then enterprise, then technology"
          intro="Three connected dimensions of the same person. Teaching physics is the foundation; building ventures and intelligent systems are its natural extensions."
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {ecosystems.map((e, i) => {
            const Icon = ECO_ICON[e.key];
            const featured = e.key === "education";
            return (
              <Reveal key={e.key} delay={i * 0.08}>
                <Link
                  href={e.href}
                  className={`card card-hover group flex h-full flex-col p-7 ${
                    featured ? "lg:scale-[1.02] lg:border-cyan/25" : ""
                  }`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl border ${ECO_ACCENT[e.key]}`}>
                    <Icon size={20} />
                  </span>
                  <div className="mt-5 flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold text-ice">{e.label}</h3>
                    <span className="font-mono text-[10px] uppercase tracking-widelabel text-dust">{e.weight}</span>
                  </div>
                  <p className={`mt-1 text-sm font-medium ${ECO_ACCENT[e.key].split(" ")[0]}`}>{e.tagline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-fog">{e.body}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-ice/80 transition-transform group-hover:translate-x-1">
                    Explore <ArrowRight size={14} />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* ============ TEACHING METHOD ============ */}
      <Section tone="void">
        <SectionHeading
          eyebrow="Teaching philosophy & method"
          title="How I teach physics"
          intro="Not memorising solutions — rebuilding understanding from first principles until it holds under exam pressure."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* ============ TIMELINE ============ */}
      <Section>
        <SectionHeading eyebrow="The journey" title="From the classroom outward" />
        <div className="mt-10 space-y-0">
          {timeline.map((t, i) => (
            <Reveal key={t.year} delay={i * 0.06}>
              <div className="flex gap-6 border-l border-white/10 pb-8 pl-6 last:pb-0">
                <div className="relative -ml-[31px] mt-1 grid h-4 w-4 shrink-0 place-items-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan ring-4 ring-abyss" />
                </div>
                <div>
                  <span className="font-mono text-sm text-cyan">{t.year}</span>
                  <p className="mt-0.5 font-display text-lg font-semibold text-ice">{t.title}</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fog">{t.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ============ SELECTED VENTURES ============ */}
      <Section tone="void">
        <SectionHeading
          eyebrowTone="emerald"
          eyebrow="Selected enterprise work"
          title="Ventures I have built and lead"
          intro="A physicist's discipline applied to building companies. Explore the full enterprise ecosystem for roles, thinking, and contribution."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {ventures.filter((v) => v.featured).map((v, i) => (
            <Reveal key={v.slug} delay={i * 0.06}>
              <div className="card card-hover flex h-full flex-col p-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-lg font-semibold text-ice">{v.name}</h3>
                  <span className="shrink-0 rounded-full border border-emerald2/30 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widelabel text-emerald2">
                    {v.role}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-dust">{v.geography}</p>
                <p className="mt-3 text-sm leading-relaxed text-fog">{v.summary}</p>
                {v.url ? (
                  <a href={v.url} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald2 hover:underline">
                    Visit site <ArrowRight size={14} />
                  </a>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/enterprise" className="btn-ghost">
            Enter the enterprise ecosystem <ArrowRight size={16} />
          </Link>
        </div>
      </Section>

      {/* ============ PHILOSOPHY / CTA ============ */}
      <section className="relative overflow-hidden border-t border-white/[0.06] py-24">
        <PhysicsField />
        <div className="container-x relative max-w-3xl text-center">
          <p className="font-display text-2xl font-semibold leading-snug text-ice md:text-3xl">
            &ldquo;{philosophy.quote}&rdquo;
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-fog">{philosophy.body}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <CtaLink href="/physics-studio">Ask a physics question</CtaLink>
            <Link href="/contact" className="btn-ghost">Get in touch <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
