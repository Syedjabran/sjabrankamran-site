# Adding a subject

The portal was built for Physics, then gained Digital SAT and the Practical Lab. Everything the
portal knows about a subject now lives in one file, the **subject registry**:
`src/lib/portal/subjects.ts`. This guide says what to add there for a new subject, what else a new
subject needs, and what already adapts on its own.

No subject has been added this way yet. Physics is still the only subject with Exam Lab papers.

## What the registry holds

| Part | What it is | Today |
|---|---|---|
| `COURSES` | Each awarding-body course: id, full name, level, syllabus code, awarding body, and the first lines of a new student's welcome email | 9702, 5054, SAT |
| `SUBJECTS` | Each subject: label, short label, lucide icon, accent token, how it is granted, its courses, its modules in display order, and optionally its Exam Lab papers, its practice module and its helper persona | Physics, Digital SAT, Practical Lab (shown inside Physics) |
| `GENERAL_ITEMS` | Places that belong to every subject: home, My Children, My Learning, the timetable (class-based: it lists every class, SAT classes too), the library, notifications, search, profile, install, plus three pages that are no destination (onboarding, a single task, the subject space page itself) | 12 items |
| `STAFF_ITEMS` | The staff consoles (Administration), plus the super admin's demo-student page | 16 items |

Every place (a subject's module or a general/staff item) has: `id`, `route` (an existing portal
page, optionally with a `#section`; a `[param]` segment matches any value, as in the page's folder
name), `name` (the plain name inside its subject: what its button says), `menuLabel` (its name where
no subject is on screen: the browser-tab title, and a name the finder also knows it by, e.g. "Physics
Resources"), an optional `deskLabel` (the coordinator desk's name for it),
`icon`, a one-line `purpose`, and `access` — the audiences that see it. A page that is no
destination (onboarding, a single task, a test preview) is marked `listed: false`: it is in no menu,
finder or space, but its title and breadcrumb still resolve (`itemForPath`).

The audiences are listed at the top of `subjects.ts` (`Audience`). Each one names a rule from
`src/lib/edu/roles.ts`, so the registry never repeats a list of roles.

**Who sees what** is one function, `visibleItems({ roles, courses, practicalLab })`. The caller passes
what the server knows: the viewer's roles, the courses course access opens for them
(`resolveCourseAccess(user).allowed`; for a parent, their children's courses when known) and whether
Practical Lab is switched on for them. An item is shown when the viewer is in one of its audiences
and, for a subject's module, has that subject. The subjects come from `viewerSubjects`:

- Exam Lab staff (teacher, coordinator, facilitator, admin, super admin) have every subject;
- everyone else has the subjects of their own courses, plus Practical Lab when it is switched on;
- anyone who isn't a student (other staff, parents, an account with no role) also keeps the
  class-granted subjects (Physics), whose shared pages they have always had.

A student has only their own subjects: an SAT-only student sees no Physics module. With a physics
course assumed for students, this shows exactly what the portal menu showed before the registry, for
every combination of roles and switches (`npm run test:subject-registry` checks all 16,384), with one
deliberate change: Users & activity is listed for admins only, because its page and API are admin-only.

## How the navigation is built

The portal has no sidebar and no menu list of its own. `src/lib/portal/portal-nav.ts`
(`navigationFor`) turns the viewer's `visibleItems` into:

- **subject spaces** — one per top-level subject (`SUBJECT_SPACES`) the viewer has anything in:
  that subject's visible modules plus those of any subject shown inside it (`partOf`), in `order`.
  Each space is a page, `/portal/subjects/<id>` (`spaceRoute`), and a card on the home page. A space
  that would hold only `shared` pages (a parent's Physics Resources) is not shown: those pages go to
  General;
- **General** — the visible `GENERAL_ITEMS` (Home and Profile live in the top bar), plus a subject's
  `shared` modules, under their full menu label ("Physics Resources"), for a viewer with no space of
  that subject. A module is `shared` when it is useful without the subject (Physics Resources' Class
  Drive holds every class's folders). The old menu showed every student Physics: a student who
  doesn't take it keeps those shared pages, and the subject's other pages leave their navigation
  (the routes still open by URL);
- **Administration** — the visible `STAFF_ITEMS`, listed most used first (a long group shows eight
  and folds the rest).

The home page (subject cards, then the groups), each subject space, a desk role's desk (coordinator
desk, daily attendance — their Home; `DeskGroups`), the top bar (Home, the subject switcher, the
breadcrumb, "Find a page…" / Ctrl+K), the desk roles' page fence (`deskRoutes`), the admin's Subjects
card line and the product tour (`tourSteps`) are all drawn from that one result.
`src/lib/portal/viewer-nav.ts` reads the viewer's roles, courses and Practical Lab switch on the
server once per request and calls it.

## Checklist for a new subject

### 1. Its course(s)

- Add the course id to the `Course` type in `src/lib/portal/course-labels.ts`. Course ids are stored
  in student records, so pick one you will never rename.
- Add a `COURSES` entry in `subjects.ts`: full name, level, syllabus code, the awarding body when it
  prints one with the code ("CAIE 9702"), and `welcome`, the first lines of a new student's welcome
  email. The course names shown across the portal (`COURSE_LABEL`, the Exam Lab's course choice,
  My Progress, the practice paper header, the staff question picker) are built from these fields.
- **If the subject comes from class enrolment** (`grant: "class"`), teach `courseFromYear` in
  `course-labels.ts` to recognise the new classes' year labels. It matters: an enrolled class whose
  label names no course counts as A Level Physics (9702) (`coursesForEnrolment`, the long-standing
  default), so an unrecognised label would give those students physics instead of the new subject.

### 2. The subject entry

Add the id to the `SubjectId` type and an entry to `SUBJECTS`:

- `label` ("Chemistry") and `shortLabel` (for tight places: the subject switcher, "Your SAT practice").
- `icon`: a lucide-react icon name. Add it to the `IconName` type too. The registry test checks it exists.
- `accent`: one of the `AccentToken`s; `ACCENT_CLASSES` holds its Tailwind classes. To add a new
  accent, add it there with the full class names written out.
- `grant`: `"class"` (from class enrolment, like Physics) or `"direct"` (an admin switches it on per
  student, like Digital SAT and Practical Lab).
- `courses`: the course ids from step 1 (the registry test checks these match `COURSES`).
- `partOf` (optional): the subject whose space shows this one, like Practical Lab inside Physics.
- `setupPath` (optional): where a student finishes setting the subject up.
- `practice` (optional): the module where its practice lives. The Exam Lab sends students there when
  it has no papers for them ("Your SAT practice is in the SAT Lab").

### 3. Its modules

For each page of the subject, add a module to its `modules` list, in display order. Add each id to
the `PortalItemId` type. Give it:

- the page's `route` (build the page first, under `src/app/portal/(app)/`),
- a plain `name` ("Resources") and a `menuLabel` that still makes sense with no subject around it
  ("Chemistry Resources"),
- an `icon`, a one-line `purpose` (the product tour shows it), an `order`, and its `access`
  (usually `["student", ...]` plus the staff audience that should see it).

That is all the navigation needs: the module appears in its subject's space, the finder and the
tour for everyone its `access` and the subject rule allow (see "How the navigation is built"). If the
module needs a live badge on its space card (a count of open work), add it where the space page
works its badges out (`src/app/portal/(app)/subjects/[subject]/page.tsx`); the home page's subject
card glance is worked out in `src/app/portal/(app)/page.tsx` from `src/lib/portal/glance.ts`.
A portal page that reads data also gets a `loading.tsx` from `src/components/portal-skeletons.tsx`
(`npm run test:portal` checks).

### 4. Access

The registry only decides what is **shown**. Every page and API route must still check access on the
server itself:

- **Class-granted:** `resolveCourseAccess` already returns the new course once `courseFromYear`
  knows its classes. Check the course in the subject's pages (as `satAccess` does for SAT).
- **Directly granted:** the admin's Subjects card, the Create account checkbox, the grants storage
  and the "Only … can be added directly" message all pick the subject up from `DIRECT_SUBJECTS` with
  no further change. `coursesFromGrants` turns the grant into its courses. What the student's bell
  says when it is switched on is subject wording, in `OPENED_NOTICE` (`src/lib/portal/subject-admin.ts`);
  without an entry no notification is sent. Write an access check for
  its pages (like `satAccess`, or `practicalLabAccess` for a subject with no course), fail closed when
  the grants can't be read, and gate its API paths in `src/middleware.ts` if it has its own.
- Keep answer keys and marking data server-only, and add the subject's server modules to a
  client-import guard like `scripts/check-sat-client-imports.mjs`.

### 5. Optional parts

- **Exam Lab papers:** an `examLab` entry (its courses with papers, what the papers are, the tab
  title -- which names no single course -- the header tagline and the intro banner). The Exam Lab has
  no subject selector: the subject is reached by link, `/portal/exam-lab?subject=<id>` or
  `?course=<course>`, and a student whose only paper course is the new one opens on it by default. A
  staff user with more than one paper subject opens on the first in the registry unless the link
  names another -- add a subject choice to the page when a second paper subject arrives. The papers
  themselves are drawn by a papers hub: today only Physics' (`PapersHub`, for 9702 and 5054), so a new
  subject with papers also needs its own hub on the Exam Lab page.
- **A floating helper:** a persona in `src/lib/portal/subject-helpers.ts` (its name, lines,
  examples, curricula and which curriculum each course preselects, the API route it asks, its two
  images, its full page) set as the subject's `helper`, plus that API route. The companion shows it
  on the subject's pages. A subject without one shows no floating helper on its pages (the SAT has
  its own tutor page instead). If the subject has timed or no-help work, add its paths to
  `src/lib/ai/helper-pause-paths.ts`.

### 6. Check it

Run `npm run test:subject-registry` (part of `npm run test:portal`). It checks that ids are unique,
every route is a real page, every icon exists, courses and subjects agree, and that the general and
staff items never name a subject. Update its expected lists (subject ids, item ids, the Physics and
SAT spaces) to include the new subject, and the personas in `scripts/test-portal-nav.mjs` (what each
kind of viewer's home page and spaces show) and `scripts/test-app-nav.mjs` (what the mobile app
is sent). Then run the rest: `npx tsc --noEmit -p tsconfig.json`,
`npm run test:sat`, `npm run test:portal`, `npm run test:access`.

## What adapts on its own

Once the registry has the subject, these need no change:

- **Course names** everywhere they are shown (`COURSE_LABEL`, the Exam Lab header and course choice,
  the question picker's bank names).
- **The Exam Lab page:** its header, intro, course choice and both "nothing here" messages read the
  subject's entry; the context rules (`src/lib/portal/exam-lab-context.ts`) only ever choose among
  courses the user may already open.
- **The navigation:** a card on the home page, its own space at `/portal/subjects/<id>` with a card
  per module, an entry in the top bar's subject switcher, every module in "Find a page…", the
  breadcrumb ("Chemistry › Resources"), and the admin's Subjects card line ("Their home page shows
  …"). A subject shown inside another (`partOf`) appears in that space instead.
- **The mobile app** (`mobile/`): its home screen, subject screens and More list come from
  `GET /api/portal/navigation` (`src/lib/portal/app-nav.ts`, built from the same navigation), so
  the new subject and its modules appear in the app with no app release. A module opens its portal
  page inside the app unless the app has a native screen for it (`APP_NATIVE_SCREENS`); its icon
  can be any lucide icon; an accent the app doesn't know yet shows as cyan.
- **The product tour:** it walks the subject cards on the home page and a space's modules in the
  space, each explained by its registry `purpose`.
- **The floating helper:** it follows the open page's subject.
- **Admin:** the Subjects card switches, the Create account checkbox and the grants record for a
  directly granted subject.
- **Page lookups** for titles and breadcrumbs (`itemForPath`, `itemForRoute`) and each subject's
  space (`spaceModules`, with a `partOf` subject's modules interleaved by `order`).

## What is still Physics-first

These were left as they are on purpose; each needs its own decision when a subject is added:

- **The account emails' wording:** the new-account, password-reset and forgot-password emails still
  say "Physics portal" (`src/lib/portal/admin.ts`, `src/lib/portal/mail.ts`,
  `src/app/api/portal/forgot-password/route.ts`). The portal's own name is already neutral,
  "Learning Portal", in one place: `src/lib/portal/brand.ts` (the top bar, the install pages, the web
  manifest).
- **The contact and sender address** (physics@sjabrankamran.com), in `src/lib/portal/mail.ts`, the
  access-paused messages and the email pages.
- **Physics' own modules and content:** the study plan, My Progress, My Ranking and the Physics
  Performance Index, Physics Resources (with its Class Drive, the same shared folders for everyone),
  Physics Studio and syllabus coverage (9702 topics). They are described in the registry as Physics
  modules; a new subject brings its own.
- **Emails:** the progress emails and the Saturday parent report have Physics (and SAT) sections.
  The welcome email already follows the new account's course (each course's `welcome`).
- **The subject cards' glances:** Physics' card shows the next Exam Lab work or the study-plan count
  and the SAT's the exam countdown (`src/lib/portal/glance.ts`); a new subject's card lists its first
  pages until it gets a glance of its own.
- **Shared pages for students who don't take the subject:** the rule assumes the class-granted
  subjects (Physics) for every student, because that is what the old menu showed. A second
  class-granted subject's `shared` pages would appear in General for students not in its classes
  too; decide then whether they should.
