import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { viewerNav } from "@/lib/portal/viewer-nav";
import { satProfileOf, studentWork } from "@/lib/portal/student-work";
import { countBadge, satGlance } from "@/lib/portal/glance";
import { pkToday } from "@/lib/portal/pk-time";
import { ACCENT_CLASSES, courseOf, courseShortLabel, spaceForPath, spaceRoute, type CourseDef, type PortalItemId, type SubjectDef } from "@/lib/portal/subjects";
import { PortalIcon } from "@/components/portal-icon";
import { ModuleCard } from "../../portal-home-nav";

type Params = { params: Promise<{ subject: string }> };

/** The space a URL names: a top-level subject only (Practical Lab lives inside Physics). */
const spaceNamed = (id: string): SubjectDef | null => spaceForPath(spaceRoute(id as SubjectDef["id"]));

export async function generateMetadata({ params }: Params) {
  const space = spaceNamed((await params).subject);
  return { title: space?.label ?? "Subject", robots: { index: false } };
}

/**
 * A subject space: one subject's own home, with each of its pages as a card
 * (the viewer's visible modules of that subject and of the subjects shown
 * inside it, in registry order). Live badges where the student's data is
 * already read for the home page (open Exam Lab work, study-plan activities).
 */
export default async function SubjectSpacePage({ params }: Params) {
  const { subject: id } = await params;
  const subject = spaceNamed(id);
  if (!subject) notFound();
  const user = await getPortalUser();
  if (!user) redirect(`/portal/login?next=${encodeURIComponent(spaceRoute(subject.id))}`);
  const { nav, courseAccess, roles } = await viewerNav(user);
  const space = nav.spaces.find((s) => s.id === subject.id);
  const accent = ACCENT_CLASSES[subject.accent];

  if (!space) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl border ${accent.border} ${accent.text}`}><PortalIcon name={subject.icon} size={22} /></span>
        <h1 className="mt-4 font-display text-xl font-semibold text-ice">{subject.label} isn&rsquo;t on your account</h1>
        <p className="mt-2 text-sm text-fog">Your teacher or the admin adds subjects to your account.</p>
        <Link href="/portal" className="btn-ghost mt-5 !px-4 !py-2 text-xs"><ArrowLeft size={14} /> Back to your subjects</Link>
      </div>
    );
  }

  // A student's live badges and header line, from data the home page reads too.
  const student = roles.includes("student") && !!courseAccess && !courseAccess.isStaff;
  const badges: Partial<Record<PortalItemId, string | null>> = {};
  const details: Partial<Record<PortalItemId, string | null>> = {};
  let headline: string | null = null;
  if (student && space.modules.some((m) => m.id === "exam-lab" || m.id === "study-plan")) {
    const work = await studentWork(user.id);
    badges["exam-lab"] = countBadge(work.openAllocations.length, "open");
    if (work.plan) {
      badges["study-plan"] = countBadge(work.plan.openMandatory, "to do");
      if (work.plan.focusTopics.length) details["study-plan"] = `Priority: ${work.plan.focusTopics.join(" · ")}`;
    }
  }
  if (student && space.modules.some((m) => m.id === "sat-today")) {
    headline = satGlance(await satProfileOf(user.id), pkToday());
  }
  // "A Level · 9702": the student's own courses of this subject that have a code.
  const courseLine = student
    ? (courseAccess?.allowed ?? []).map((c) => courseOf(c)).filter((c): c is CourseDef => !!c && c.subject === subject.id && !!c.code).map(courseShortLabel).join(" · ")
    : "";

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex min-w-0 items-center gap-4">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${accent.border} ${accent.soft} ${accent.text}`}>
          <PortalIcon name={space.icon} size={26} />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ice sm:text-3xl">{space.label}</h1>
          <p className="mt-0.5 truncate text-sm text-dust">{headline || courseLine || `Everything for ${space.label} in one place.`}</p>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {space.modules.map((link) => (
          <ModuleCard key={link.id} link={link} badge={badges[link.id]} detail={details[link.id]} />
        ))}
      </div>
    </div>
  );
}
