import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { PortalIcon } from "@/components/portal-icon";
import { ACCENT_CLASSES, subjectOf, type SubjectId } from "@/lib/portal/subjects";
import type { NavLink, PortalNav, SpaceNav } from "@/lib/portal/portal-nav";

/**
 * The home page's buttons (the sidebar's replacement): a card per subject
 * space, then small groups for General, Administration and More. Server
 * components; everything they list comes from the viewer's navigation.
 */

/** A link that honours the registry's full-page-load flag. */
function Go({ link, className, children, ...rest }: {
  link: Pick<NavLink, "href" | "hardNavigate">; className: string; children: React.ReactNode;
} & Record<`data-${string}`, string>) {
  return link.hardNavigate
    ? <a href={link.href} className={className} {...rest}>{children}</a>
    : <Link href={link.href} className={className} {...rest}>{children}</Link>;
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan";

/** The line under a subject card's name when no glance was worked out: its pages. */
function pagesLine(space: SpaceNav): string {
  const names = space.modules.map((m) => m.name);
  return names.length > 3 ? `${names.slice(0, 3).join(" · ")} and ${names.length - 3} more` : names.join(" · ");
}

export function SubjectCard({ space, glance, course }: { space: SpaceNav; glance?: string | null; course?: string | null }) {
  const accent = ACCENT_CLASSES[space.accent];
  return (
    <Go link={space} data-tour-space={space.id}
      className={`group flex min-w-0 flex-col justify-between gap-6 rounded-3xl border border-white/10 bg-space/60 p-5 transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.03] sm:p-6 ${FOCUS}`}>
      <div className="flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${accent.border} ${accent.soft} ${accent.text}`}>
          <PortalIcon name={space.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="font-display text-xl font-semibold text-ice">{space.label}</h3>
          {course ? <p className="mt-0.5 truncate text-xs text-dust">{course}</p> : null}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="line-clamp-2 min-w-0 text-sm text-fog">{glance || pagesLine(space)}</p>
        <span className={`inline-flex shrink-0 items-center gap-1 text-sm font-semibold ${accent.text}`}>
          Open <ArrowRight size={15} aria-hidden="true" className="transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Go>
  );
}

/** The viewer's subject cards; a note instead when they have none. */
export function SubjectCards({ nav, glances = {}, courses = {}, unavailable = false }: {
  nav: PortalNav;
  glances?: Partial<Record<SubjectId, string | null>>;
  courses?: Partial<Record<SubjectId, string | null>>;
  /** Their subjects couldn't be read just now. */
  unavailable?: boolean;
}) {
  return (
    <section aria-labelledby="your-subjects">
      <h2 id="your-subjects" className="mb-3 text-xs font-semibold uppercase tracking-wider text-dust">Your subjects</h2>
      {nav.spaces.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {nav.spaces.map((space) => <SubjectCard key={space.id} space={space} glance={glances[space.id]} course={courses[space.id]} />)}
        </div>
      ) : (
        <p className="rounded-2xl border border-white/10 bg-space/60 p-5 text-sm text-fog">
          {unavailable
            ? "Your subjects couldn’t be loaded just now. Refresh the page to try again."
            : "No subject has been added to your account yet. Your teacher or the admin adds your subjects."}
        </p>
      )}
    </section>
  );
}

/** A small button for a general, staff or More page: the icon above the name
 *  on a phone (two to a row, so a long name keeps the tile's full width),
 *  beside it from the small breakpoint up. */
function Tile({ link, tag }: { link: NavLink; tag?: string }) {
  return (
    <Go link={link}
      className={`group flex min-h-14 min-w-0 flex-col items-start gap-2 rounded-2xl border border-white/10 bg-space/40 px-3 py-2.5 transition hover:border-cyan/30 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-3 ${FOCUS}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-fog transition group-hover:text-cyan">
        <PortalIcon name={link.icon} size={16} />
      </span>
      <span className="w-full min-w-0 sm:w-auto">
        <span className="line-clamp-2 break-words text-sm leading-snug text-ice">{link.name}</span>
        {tag ? <span className="block truncate text-[11px] text-dust">{tag}</span> : null}
      </span>
    </Go>
  );
}

const TILE_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";

/** A titled group of small buttons. Long groups show two rows and fold the rest. */
export function LinkGroup({ id, title, links, tour, fold = 8 }: {
  id: string; title: string; links: NavLink[]; tour: string; fold?: number;
}) {
  if (!links.length) return null;
  const first = links.length > fold + 1 ? links.slice(0, fold) : links;
  const rest = links.slice(first.length);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-tour={tour} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-3 text-xs font-semibold uppercase tracking-wider text-dust">{title}</h2>
      <div className={TILE_GRID}>{first.map((link) => <Tile key={link.id} link={link} />)}</div>
      {rest.length ? (
        <details className="group/fold mt-2">
          <summary className={`inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-cyan hover:underline [&::-webkit-details-marker]:hidden ${FOCUS}`}>
            <span className="group-open/fold:hidden">Show {rest.length} more</span>
            <span className="hidden group-open/fold:inline">Show fewer</span>
            <ChevronDown size={13} aria-hidden="true" className="transition group-open/fold:rotate-180" />
          </summary>
          <div className={`${TILE_GRID} mt-2`}>{rest.map((link) => <Tile key={link.id} link={link} />)}</div>
        </details>
      ) : null}
    </section>
  );
}

/** Pages the old menu reached whose subject isn't on the viewer's account,
 *  folded away under "More pages" so they stay one click from home. */
export function MoreGroup({ links }: { links: NavLink[] }) {
  if (!links.length) return null;
  return (
    <details data-tour="group-more" className="group/more rounded-2xl border border-white/10 bg-space/30">
      <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 text-sm text-fog hover:text-ice [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        <span>More pages <span className="text-dust">({links.length})</span></span>
        <ChevronDown size={15} aria-hidden="true" className="shrink-0 transition group-open/more:rotate-180" />
      </summary>
      <div className="px-4 pb-4">
        <p className="mb-3 text-xs text-dust">From subjects that aren&rsquo;t on your account.</p>
        <div className={TILE_GRID}>
          {links.map((link) => <Tile key={link.id} link={link} tag={link.space ? subjectOf(link.space)?.label : undefined} />)}
        </div>
      </div>
    </details>
  );
}

/** A subject space's page as a card: its icon, plain name, one-line purpose
 *  and, where the page has data for it, a live badge ("2 open"). */
export function ModuleCard({ link, badge, detail }: { link: NavLink; badge?: string | null; detail?: string | null }) {
  return (
    <Go link={link} data-tour-module={link.id}
      className={`group flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-space/60 p-4 transition hover:-translate-y-0.5 hover:border-cyan/30 hover:bg-white/[0.03] sm:p-5 ${FOCUS}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-cyan">
          <PortalIcon name={link.icon} size={18} />
        </span>
        {badge ? <span className="truncate rounded-full border border-amber-300/35 bg-amber-300/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-amber-300">{badge}</span> : null}
      </div>
      <div className="min-w-0">
        <p className="font-display text-base font-semibold text-ice">{link.name}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-dust">{detail || link.purpose}</p>
      </div>
    </Go>
  );
}
