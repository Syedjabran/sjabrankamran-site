import Link from "next/link";

const YEAR = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-space">
      <div className="container-x grid gap-10 py-16 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <p className="font-display text-xl font-semibold text-ice">Syed Jabran Ali Kamran</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-dust">
            Cambridge Physics educator, entrepreneur and AI &amp; technology consultant.
            One mind, three connected worlds — education first.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-4">Explore</p>
          <ul className="space-y-2 text-sm text-fog/80">
            <li><Link href="/education" className="hover:text-cyan">Education</Link></li>
            <li><Link href="/physics-studio" className="hover:text-cyan">Physics Studio</Link></li>
            <li><Link href="/enterprise" className="hover:text-cyan">Enterprise</Link></li>
            <li><Link href="/ai-technology" className="hover:text-cyan">AI &amp; Technology</Link></li>
            <li><Link href="/insights" className="hover:text-cyan">Insights</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Connect</p>
          <ul className="space-y-2 text-sm text-fog/80">
            <li><Link href="/contact" className="hover:text-cyan">Contact</Link></li>
            <li><a href="https://www.linkedin.com/company/jabran-co/" className="hover:text-cyan" rel="me noopener" target="_blank">LinkedIn</a></li>
            <li><a href="https://x.com/Syed_Jabran" className="hover:text-cyan" rel="me noopener" target="_blank">X (Twitter)</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs text-dust md:flex-row">
          <p>© {YEAR} Syed Jabran Ali Kamran. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-fog">Privacy</Link>
            <Link href="/contact" className="hover:text-fog">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
