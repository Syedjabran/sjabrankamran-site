import { isAdmin, isCoordinatorOnly, isRegistrarOnly, isStaff, type EduRole } from './roles';

/**
 * Where a nav entry goes. `native` routes render as React Native screens;
 * `web` routes open the real portal page inside an authenticated WebView, so
 * surfaces that depend on browser-only technology (Exam Lab's MediaPipe
 * proctor, the analytics console) stay pixel-identical and fully functional.
 */
export type NavTarget =
  | { kind: 'native'; route: string }
  | { kind: 'web'; path: string };

export type NavItem = { label: string; target: NavTarget };
export type NavSection = { title?: string; items: NavItem[] };

const native = (route: string): NavTarget => ({ kind: 'native', route });
const web = (path: string): NavTarget => ({ kind: 'web', path });

/**
 * Role-aware navigation, ported from the website's navFor() in
 * src/app/portal/(app)/layout.tsx — same sections, same labels, same order,
 * same role gates. Keeping this a faithful port is what makes the app's menu
 * match the portal's sidebar exactly.
 */
export function navFor(roles: EduRole[]): NavSection[] {
  const staff = isStaff(roles);
  const admin = isAdmin(roles);
  const isStudent = roles.includes('student');
  const isParent = roles.includes('parent');
  const sections: NavSection[] = [];

  // --- Attendance Registrar (school-scoped, view-only) ---
  // A registrar with no fuller staff role gets a deliberately minimal nav:
  // just the Dashboard and the read-only daily attendance view for their school.
  if (isRegistrarOnly(roles)) {
    return [
      {
        title: 'Attendance',
        items: [
          { label: 'Dashboard', target: native('/') },
          { label: 'Daily attendance', target: web('/portal/admin/attendance-view') },
          { label: 'Physics timetable', target: web('/portal/timetable') },
        ],
      },
    ];
  }
  if (isCoordinatorOnly(roles)) {
    return [
      {
        title: 'Assigned class',
        items: [
          { label: 'Class staff desk', target: web('/portal/coordinator') },
          { label: 'Physics timetable', target: web('/portal/timetable') },
          { label: 'Daily attendance', target: web('/portal/admin/attendance-view') },
          { label: 'Resource Library', target: native('/library') },
          { label: 'Physics Resources', target: native('/resources') },
          { label: 'Notifications', target: native('/notifications') },
        ],
      },
    ];
  }

  // --- Administration (staff / owner) ---
  const adminItems: NavItem[] = [{ label: 'Dashboard', target: native('/') }];
  if (staff) {
    adminItems.push({ label: 'Physics timetable', target: web('/portal/timetable') });
    adminItems.push({ label: 'Users & activity', target: native('/users') });
    if (roles.includes('super_admin')) {
      adminItems.push({ label: 'Access locks', target: web('/portal/admin/access') });
    }
    adminItems.push({ label: 'Rankings & analytics', target: native('/rankings') });
    adminItems.push({ label: 'Institutions', target: web('/portal/admin/institutions') });
    adminItems.push({ label: 'Post / Tests', target: web('/portal/admin/assign') });
    adminItems.push({ label: 'Attendance', target: web('/portal/admin/attendance') });
    adminItems.push({ label: 'Daily attendance', target: web('/portal/admin/attendance-view') });
    adminItems.push({ label: 'Proctoring & Locks', target: web('/portal/admin/proctoring') });
    adminItems.push({ label: 'Email', target: web('/portal/admin/mail') });
    adminItems.push({ label: 'Notifications', target: native('/notifications') });
  }
  if (roles.includes('coordinator')) {
    adminItems.push({ label: 'Coordinator desk', target: web('/portal/coordinator') });
  }
  if (admin) adminItems.push({ label: 'Announcements', target: web('/portal/admin/notify') });
  if (admin) {
    adminItems.push({ label: 'Academics', target: web('/portal/admin/academics') });
    adminItems.push({ label: 'Fees & Finance', target: web('/portal/admin/finance') });
  }
  if (admin || roles.includes('teacher') || roles.includes('teaching_assistant')) {
    adminItems.push({ label: 'My Classes', target: web('/portal/teach') });
  }
  if (admin || roles.includes('teaching_assistant')) {
    adminItems.push({ label: 'Exam Lab', target: web('/portal/exam-lab') });
  }
  if (staff) adminItems.push({ label: 'Physics Studio', target: web('/portal/studio') });
  // Available to everyone.
  adminItems.push({ label: 'Physics Resources', target: native('/resources') });
  adminItems.push({ label: 'Resource Library', target: native('/library') });
  sections.push({ title: staff ? 'Administration' : undefined, items: adminItems });

  // --- Learning (students only) + parents ---
  const learnItems: NavItem[] = [];
  if (isStudent) {
    learnItems.push({ label: 'Physics timetable', target: web('/portal/timetable') });
    learnItems.push({ label: 'My study plan', target: web('/portal/study-plan') });
    learnItems.push({ label: 'Exam Lab', target: web('/portal/exam-lab') });
    learnItems.push({ label: 'My answer scripts', target: web('/portal/exam-lab/review') });
    learnItems.push({ label: 'My Learning', target: native('/learn') });
    learnItems.push({ label: 'My Progress', target: web('/portal/progress') });
    learnItems.push({ label: 'My Ranking', target: web('/portal/my-ranking') });
    learnItems.push({ label: 'Leaderboard', target: native('/leaderboard') });
    learnItems.push({ label: 'Notifications', target: native('/notifications') });
  }
  if (isParent) {
    learnItems.push({ label: 'My Children', target: web('/portal/family') });
    learnItems.push({ label: 'Physics timetable', target: web('/portal/timetable') });
  }
  if (learnItems.length) sections.push({ title: staff ? 'Learning' : undefined, items: learnItems });

  return sections;
}

/**
 * The four bottom-tab destinations, chosen from the role-aware nav so a
 * student and an admin each get the surfaces they actually use. Everything
 * else stays one tap away under "More", which lists the full nav above.
 */
export function primaryTabsFor(roles: EduRole[]): NavItem[] {
  // The two restricted, school-scoped roles mirror their cut-down sidebar: the
  // website fences them out of every other surface, so the tab bar must not
  // offer one either. Their primary destinations (the attendance view, the
  // coordinator desk) are web surfaces, which the tab bar cannot host — those
  // stay one tap away under "More", where navFor() lists them first.
  if (isRegistrarOnly(roles)) {
    return [{ label: 'Dashboard', target: native('/') }];
  }
  if (isCoordinatorOnly(roles)) {
    return [
      { label: 'Resources', target: native('/resources') },
      { label: 'Library', target: native('/library') },
    ];
  }
  // Staff first: the website lists Administration above Learning, so a user who
  // is both (e.g. an owner with a student role) gets the staff surfaces on the
  // tab bar and the Learning ones under "More".
  if (isStaff(roles)) {
    return [
      { label: 'Dashboard', target: native('/') },
      { label: 'Users', target: native('/users') },
      { label: 'Rankings', target: native('/rankings') },
      { label: 'Resources', target: native('/resources') },
    ];
  }
  if (roles.includes('student')) {
    return [
      { label: 'Dashboard', target: native('/') },
      { label: 'Learning', target: native('/learn') },
      { label: 'Leaderboard', target: native('/leaderboard') },
      { label: 'Resources', target: native('/resources') },
    ];
  }
  return [
    { label: 'Dashboard', target: native('/') },
    { label: 'Resources', target: native('/resources') },
    { label: 'Library', target: native('/library') },
  ];
}
