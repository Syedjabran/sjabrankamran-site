/**
 * The signed-in viewer's navigation. SERVER-ONLY.
 *
 * Reads what the subject registry needs about the viewer -- their effective
 * roles (a super admin's role preview), the courses course access opens for
 * a student and whether Practical Lab is switched on for them -- and builds
 * the subject-first navigation from it (portal-nav.ts). Memoised per request:
 * the portal layout, the home page and a subject space all read it once.
 */
import "server-only";
import { cache } from "react";
import type { EduRole, PortalUser } from "@/lib/edu/auth";
import { resolveCourseAccess, type CourseAccess } from "@/lib/portal/course-access";
import { practicalLabAccess } from "@/lib/portal/practical-lab";
import { effectiveRoles } from "@/lib/portal/view-as";
import { CLASS_SUBJECTS } from "@/lib/portal/subjects";
import { navigationFor, type PortalNav } from "@/lib/portal/portal-nav";

export type ViewerNav = {
  nav: PortalNav;
  /** A student's course access (the strict read the SAT uses); null for
   *  anyone else and when the read failed. */
  courseAccess: CourseAccess | null;
  /** The roles the portal renders for (a preview's role). */
  roles: EduRole[];
  previewing: EduRole | null;
  /** A student whose subjects couldn't be read just now: the home page says
   *  so rather than showing "no subject". */
  subjectsUnavailable: boolean;
};

export const viewerNav = cache(async (user: PortalUser): Promise<ViewerNav> => {
  const isStudent = user.roles.includes("student");
  // A failed read opens nothing (fail closed): no SAT, no lab.
  const [courseAccess, practicalLab, { roles, previewing }] = await Promise.all([
    isStudent ? resolveCourseAccess(user, { strict: true }).catch(() => null) : Promise.resolve(null),
    isStudent ? practicalLabAccess(user).then((a) => a.ok).catch(() => false) : Promise.resolve(false),
    effectiveRoles(user),
  ]);
  // A super admin previewing the student view sees a physics student's
  // portal, as the preview always has (their own account takes no course).
  const courses = previewing
    ? previewing === "student" ? CLASS_SUBJECTS.flatMap((s) => s.courses).slice(0, 1) : []
    : courseAccess?.allowed ?? [];
  const nav = navigationFor({ roles, courses, practicalLab: previewing ? false : practicalLab });
  return { nav, courseAccess, roles, previewing, subjectsUnavailable: isStudent && !previewing && !courseAccess };
});
