/**
 * Loading placeholders for portal pages and panels, in the portal's existing
 * skeleton idiom (pulsing bg-white/[0.06] blocks inside bg-space/60 cards).
 * Server-safe and client-safe (plain markup): route-level loading.tsx files
 * compose the page shapes; client panels use SkeletonRows / SkeletonCard
 * while their first read is on its way. Each announces itself once to
 * assistive technology and draws roughly the shape of what replaces it, so
 * nothing jumps when the content arrives.
 */

const BLOCK = "rounded-lg bg-white/[0.06]";
const CARD = "rounded-2xl border border-white/10 bg-space/60";

/** A pulsing bar. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`${BLOCK} ${className}`} />;
}

/** The busy wrapper: one polite "Loading …" for screen readers. */
function Busy({ label, className = "space-y-6", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={`motion-safe:animate-pulse ${className}`}>
      <span className="sr-only">Loading {label}…</span>
      {children}
    </div>
  );
}

/** A page heading: an icon tile, a title and a line under it. */
function Heading({ icon = true }: { icon?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      {icon ? <div className={`${BLOCK} h-11 w-11 shrink-0 rounded-xl`} /> : null}
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`${BLOCK} h-6 w-48 max-w-[70%]`} />
        <div className={`${BLOCK} h-3.5 w-72 max-w-[90%] bg-white/[0.04]`} />
      </div>
    </div>
  );
}

/** Placeholder list rows, for a client panel's list while it loads. */
export function SkeletonRows({ rows = 4, label }: { rows?: number; label?: string }) {
  const inner = (
    <ul aria-hidden="true" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className={`${CARD} flex items-center gap-3 p-4`}>
          <div className={`${BLOCK} h-9 w-9 shrink-0 rounded-xl`} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`${BLOCK} h-3.5 ${i % 2 ? "w-1/2" : "w-2/3"}`} />
            <div className={`${BLOCK} h-3 w-5/6 bg-white/[0.04]`} />
          </div>
        </li>
      ))}
    </ul>
  );
  return label ? <Busy label={label} className="">{inner}</Busy> : <div className="motion-safe:animate-pulse">{inner}</div>;
}

/** One placeholder card of a given height, for a client panel. */
export function SkeletonCard({ className = "h-40", label }: { className?: string; label?: string }) {
  const card = <div aria-hidden="true" className={`${CARD} ${className}`} />;
  return label ? <Busy label={label} className="">{card}</Busy> : <div className="motion-safe:animate-pulse">{card}</div>;
}

/** A grid of cards: subject spaces, resources, classes. */
export function CardsSkeleton({ label, cards = 4, grid = "sm:grid-cols-2 lg:grid-cols-4", cardClass = "h-32", icon = true }: {
  label: string; cards?: number; grid?: string; cardClass?: string; icon?: boolean;
}) {
  return (
    <Busy label={label}>
      <Heading icon={icon} />
      <div className={`grid gap-3 ${grid}`} aria-hidden="true">
        {Array.from({ length: cards }).map((_, i) => <div key={i} className={`${CARD} ${cardClass}`} />)}
      </div>
    </Busy>
  );
}

/** A heading, an optional filter row and a list: notifications, users, drills. */
export function ListSkeleton({ label, rows = 6, filters = true }: { label: string; rows?: number; filters?: boolean }) {
  return (
    <Busy label={label}>
      <Heading />
      {filters ? (
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          <div className={`${BLOCK} h-10 w-full max-w-sm rounded-xl`} />
          <div className={`${BLOCK} h-10 w-28 rounded-xl`} />
        </div>
      ) : null}
      <SkeletonRows rows={rows} />
    </Busy>
  );
}

/** A heading, an optional row of stat tiles and large panels: progress,
 *  analytics, a class, the SAT hub. */
export function PanelSkeleton({ label, stats = 0, panels = 1, panelClass = "h-72" }: {
  label: string; stats?: number; panels?: number; panelClass?: string;
}) {
  return (
    <Busy label={label}>
      <Heading />
      {stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden="true">
          {Array.from({ length: stats }).map((_, i) => <div key={i} className={`${CARD} h-24`} />)}
        </div>
      ) : null}
      <div className={`grid gap-4 ${panels > 1 ? "lg:grid-cols-2" : ""}`} aria-hidden="true">
        {Array.from({ length: panels }).map((_, i) => <div key={i} className={`${CARD} ${panelClass}`} />)}
      </div>
    </Busy>
  );
}

/** A heading and a form card: settings, onboarding, posting work. */
export function FormSkeleton({ label, fields = 5 }: { label: string; fields?: number }) {
  return (
    <Busy label={label}>
      <Heading />
      <div className={`${CARD} space-y-5 p-5 sm:p-6`} aria-hidden="true">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className={`${BLOCK} h-3 w-32`} />
            <div className={`${BLOCK} h-11 w-full rounded-xl bg-white/[0.04]`} />
          </div>
        ))}
        <div className={`${BLOCK} h-10 w-36 rounded-full`} />
      </div>
    </Busy>
  );
}

/** A question in a sitting: the bar with the timer, the question, the choices. */
export function RunnerSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label} className="space-y-4">
      <div className={`${CARD} flex items-center justify-between p-4`} aria-hidden="true">
        <div className={`${BLOCK} h-4 w-40`} />
        <div className={`${BLOCK} h-8 w-20 rounded-full`} />
      </div>
      <div className={`${CARD} space-y-3 p-5 sm:p-6`} aria-hidden="true">
        <div className={`${BLOCK} h-4 w-5/6`} />
        <div className={`${BLOCK} h-4 w-2/3`} />
        <div className={`${BLOCK} mt-4 h-40 w-full rounded-xl bg-white/[0.04]`} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${CARD} h-14`} />)}
      </div>
    </Busy>
  );
}

/** A conversation: the tutor. */
export function ChatSkeleton({ label }: { label: string }) {
  return (
    <Busy label={label}>
      <Heading />
      <div className={`${CARD} space-y-4 p-5`} aria-hidden="true">
        <div className={`${BLOCK} h-16 w-3/4 rounded-2xl`} />
        <div className={`${BLOCK} ml-auto h-10 w-1/2 rounded-2xl bg-white/[0.04]`} />
        <div className={`${BLOCK} h-24 w-4/5 rounded-2xl`} />
      </div>
      <div className={`${BLOCK} h-12 w-full rounded-2xl`} aria-hidden="true" />
    </Busy>
  );
}

/** The portal home: the welcome line, the subject cards, the next action and
 *  the small groups under them. */
export function HomeSkeleton() {
  return (
    <Busy label="your home page" className="space-y-8">
      <div className={`${BLOCK} h-8 w-56`} aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-40 rounded-3xl border border-white/10 bg-space/60" />)}
      </div>
      <div className="h-36 rounded-3xl border border-white/10 bg-space/60" aria-hidden="true" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${CARD} h-14`} />)}
      </div>
    </Busy>
  );
}

/** A subject space: its heading and its page cards. */
export function SpaceSkeleton() {
  return (
    <Busy label="this subject" className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-4" aria-hidden="true">
        <div className={`${BLOCK} h-14 w-14 shrink-0 rounded-2xl`} />
        <div className="space-y-2">
          <div className={`${BLOCK} h-7 w-40`} />
          <div className={`${BLOCK} h-3.5 w-56 max-w-[60vw] bg-white/[0.04]`} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className={`${CARD} h-36`} />)}
      </div>
    </Busy>
  );
}
