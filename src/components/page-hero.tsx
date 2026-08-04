export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <section className="border-b border-white/10 bg-charcoal py-20 md:py-28">
      <div className="container-x max-w-5xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-5 text-5xl leading-[1.02] text-ivory md:text-7xl">{title}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-mutedlight md:text-xl">{intro}</p>
      </div>
    </section>
  );
}
