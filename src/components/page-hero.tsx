import { PhysicsField } from "@/components/physics-field";
import { HeroVideo } from "@/components/hero-video";
import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  intro,
  tone = "cyan",
  field = false,
  video,
  poster,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  tone?: "cyan" | "emerald" | "magenta";
  field?: boolean;
  video?: string;
  poster?: string;
}) {
  const eb = { cyan: "eyebrow", emerald: "eyebrow-emerald", magenta: "eyebrow-magenta" }[tone];
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06] py-20 md:py-28">
      {video && poster ? <HeroVideo src={video} poster={poster} /> : field ? <PhysicsField /> : null}
      <div className="container-x relative max-w-5xl">
        <p className={cn(eb, "hero-item hero-item-1")}>{eyebrow}</p>
        <h1 className="hero-item hero-item-2 mt-5 text-4xl font-semibold leading-[1.04] text-ice md:text-6xl">{title}</h1>
        <p className="hero-item hero-item-3 mt-6 max-w-3xl text-lg leading-8 text-fog md:text-xl">{intro}</p>
      </div>
    </section>
  );
}
