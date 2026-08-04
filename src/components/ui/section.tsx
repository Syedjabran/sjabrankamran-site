import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  tone = "abyss",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "abyss" | "void" | "space";
  id?: string;
}) {
  const tones = {
    abyss: "bg-transparent text-ice",
    void: "bg-void/60 text-ice",
    space: "bg-space text-ice",
  };
  return (
    <section id={id} className={cn("py-20 md:py-28", tones[tone], className)}>
      <div className="container-x">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  eyebrowTone = "cyan",
  title,
  intro,
}: {
  eyebrow?: string;
  eyebrowTone?: "cyan" | "emerald" | "magenta";
  title: string;
  intro?: string;
}) {
  const eb = {
    cyan: "eyebrow",
    emerald: "eyebrow-emerald",
    magenta: "eyebrow-magenta",
  }[eyebrowTone];
  return (
    <div className="max-w-2xl">
      {eyebrow ? <p className={cn(eb, "mb-3")}>{eyebrow}</p> : null}
      <h2 className="text-3xl text-ice md:text-4xl">{title}</h2>
      {intro ? <p className="mt-4 text-lg leading-relaxed text-fog">{intro}</p> : null}
    </div>
  );
}
