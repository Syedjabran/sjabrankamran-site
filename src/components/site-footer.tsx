import Link from "next/link";

const YEAR = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-charcoal">
      <div className="container-x grid gap-10 py-16 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="font-display text-xl text-ivory">Syed Jabran Ali Kamran</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Entrepreneur, educator, and strategic consultant — building and advising
            businesses across education, international trade, industrial performance, and
            AI-driven transformation.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-4">Explore</p>
          <ul className="space-y-2 text-sm text-mutedlight/70">
            <li><Link href="/about" className="hover:text-gold">About</Link></li>
            <li><Link href="/ventures" className="hover:text-gold">Ventures</Link></li>
            <li><Link href="/consulting" className="hover:text-gold">Consulting</Link></li>
            <li><Link href="/insights" className="hover:text-gold">Insights</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Connect</p>
          <ul className="space-y-2 text-sm text-mutedlight/70">
            <li><a href="https://www.linkedin.com/company/jabran-co/" className="hover:text-gold" rel="me noopener" target="_blank">LinkedIn</a></li>
            <li><a href="https://x.com/Syed_Jabran" className="hover:text-gold" rel="me noopener" target="_blank">X (Twitter)</a></li>
            <li><Link href="/contact" className="hover:text-gold">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted md:flex-row">
          <p>© {YEAR} Syed Jabran Ali Kamran. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-mutedlight">Privacy</Link>
            <Link href="/terms" className="hover:text-mutedlight">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
