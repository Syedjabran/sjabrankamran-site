/**
 * The portal's role-aware menu (the sidebar), built from the subject
 * registry. Pure: the portal layout renders it and plain Node tests check it.
 *
 * Every entry is a registry item (subjects.ts), so its link and label come
 * from there; this file only decides which items each role sees and how they
 * are grouped -- exactly as the menu did before the registry described them.
 * Owner and staff see an Administration console, and only actual students see
 * the personal Learning surfaces, so the owner is never shown their own quiz
 * attempts as if they were a student.
 */
import {
  canConductDrills, isAdmin, isCoordinatorOnly, isExamLabStaff, isRegistrarOnly, isStaff, type EduRole,
} from "../edu/roles.ts";
import { labInLearning } from "./practical-lab-access.ts";
import { portalItem, type PortalItemId } from "./subjects.ts";

export type MenuItem = { href: string; label: string; hardNavigate?: boolean };
export type MenuSection = { title?: string; items: MenuItem[] };
/** The admin-switched subjects this (student) user has: they add their own
 *  menu entries. Staff get SAT Lab and Practical Lab from their role. */
export type SwitchedOn = { sat: boolean; practicalLab: boolean };

/** A registry item as a menu link. `desk`: the coordinator/facilitator desk's
 *  own name for it, where it has one. */
function entry(id: PortalItemId, desk = false): MenuItem {
  const item = portalItem(id);
  const label = desk && item.deskLabel ? item.deskLabel : item.menuLabel;
  return item.hardNavigate ? { href: item.route, label, hardNavigate: true } : { href: item.route, label };
}

function sectionsFor(roles: readonly EduRole[], switchedOn: SwitchedOn): MenuSection[] {
  const staff = isStaff(roles);
  const admin = isAdmin(roles);
  const isStudent = roles.includes("student");
  const isParent = roles.includes("parent");
  const sections: MenuSection[] = [];

  // --- Attendance Registrar (school-scoped, view-only) ---
  // A registrar with no fuller staff role gets a deliberately minimal menu:
  // the Dashboard, the read-only daily attendance view and the timetable.
  if (isRegistrarOnly(roles)) {
    return [{ title: "Attendance", items: [entry("home"), entry("daily-attendance"), entry("timetable")] }];
  }
  if (isCoordinatorOnly(roles)) {
    return [{ title: "Assigned class", items: [
      entry("coordinator", true),
      entry("exam-lab", true),
      entry("practical-lab"),
      entry("post-work", true),
      entry("drill-records"),
      entry("timetable"),
      entry("daily-attendance"),
      entry("library"),
      entry("resources"),
      entry("notifications"),
    ] }];
  }

  // --- Administration (staff / owner) ---
  const adminItems: MenuItem[] = [entry("home")];
  if (staff) {
    adminItems.push(entry("timetable"));
    adminItems.push(entry("users"));
    if (roles.includes("super_admin")) adminItems.push(entry("access-locks"));
    adminItems.push(entry("analytics"));
    adminItems.push(entry("institutions"));
    adminItems.push(entry("post-work"));
    if (canConductDrills(roles)) adminItems.push(entry("drill-records"));
    adminItems.push(entry("attendance"));
    adminItems.push(entry("daily-attendance"));
    adminItems.push(entry("proctoring"));
    adminItems.push(entry("email"));
    adminItems.push(entry("notifications"));
  }
  if (roles.includes("coordinator")) adminItems.push(entry("coordinator"));
  if (admin) adminItems.push(entry("announcements"));
  if (admin) {
    adminItems.push(entry("academics"));
    adminItems.push(entry("finance"));
  }
  if (admin || roles.includes("teacher") || roles.includes("teaching_assistant")) {
    adminItems.push(entry("classes"));
  }
  if (canConductDrills(roles)) adminItems.push(entry("exam-lab"));
  if (isExamLabStaff(roles)) {
    adminItems.push(entry("practical-lab"));
    adminItems.push(entry("sat-today"));
    adminItems.push(entry("sat-results"));
  }
  if (isExamLabStaff(roles)) adminItems.push(entry("syllabus-coverage"));
  if (staff) adminItems.push(entry("studio"));
  // Available to everyone.
  adminItems.push(entry("resources"));
  adminItems.push(entry("library"));
  sections.push({ title: staff ? "Administration" : undefined, items: adminItems });

  // --- Learning (students only) + parents ---
  const learnItems: MenuItem[] = [];
  if (isStudent) {
    learnItems.push(entry("timetable"));
    // The study plan opens with a full page load (registry `hardNavigate`):
    // the route was added after some students already had a long-lived PWA /
    // App Router session, and a hard navigation avoids replaying a stale
    // client-side 404 cached before the route existed. The server response
    // itself is always private/no-store and protected by the middleware.
    learnItems.push(entry("study-plan"));
    learnItems.push(entry("exam-lab"));
    if (labInLearning(roles, switchedOn.practicalLab)) learnItems.push(entry("practical-lab"));
    if (switchedOn.sat) learnItems.push(entry("sat-today"));
    learnItems.push(entry("answer-scripts"));
    learnItems.push(entry("learning"));
    learnItems.push(entry("progress"));
    learnItems.push(entry("ranking"));
    learnItems.push(entry("leaderboard"));
    learnItems.push(entry("notifications"));
  }
  if (isParent) {
    learnItems.push(entry("family"));
    learnItems.push(entry("timetable"));
  }
  if (learnItems.length) sections.push({ title: staff ? "Learning" : undefined, items: learnItems });

  return sections;
}

/**
 * The whole menu for a set of roles: global search on top (every role but
 * the registrar's desk; the search API only aggregates content the caller
 * could already open), the role's own sections, then the app install page.
 */
export function menuFor(roles: readonly EduRole[], switchedOn: SwitchedOn): MenuSection[] {
  const sections = sectionsFor(roles, switchedOn);
  if (!isRegistrarOnly(roles)) sections.unshift({ items: [entry("search")] });
  sections.push({ title: "Portal App", items: [entry("install")] });
  return sections;
}
