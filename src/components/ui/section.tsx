import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  tone = "dark",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "dark" | "light" | "graphite";
  id?: string;
}) {
  const tones = {
    dark: "bg-midnight text-ivory",
    graphite: "bg-charcoal text-ivory",
    light: "bg-ivory text-ink",
  };
  return (
    <section id={id} className={cn("py-20 md:py-28", tones[tone], className)}>
      <div className="container-x">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  tone = "dark",
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className={cn("text-3xl md:text-4xl", tone === "light" ? "text-ink" : "text-ivory")}>
        {title}
      </h2>
      {intro ? (
        <p className={cn("mt-4 text-lg leading-relaxed", tone === "light" ? "text-muted" : "text-mutedlight/70")}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}
