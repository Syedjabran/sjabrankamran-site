# ROUTE_API_DATA_MAP — sjabrankamran.com
Updated: 2026-09-19 · from production build route table @ `0d78091` + code correlation.

## Public (indexable intent)
| Route | Type | Notes |
|---|---|---|
| `/` | static | H1 + person JSON-LD; canonical → **www (defect E1)** |
| `/education` `/enterprise` `/ai-technology` `/insights` `/contact` `/profile` | static | marketing set |
| `/physics-studio` | static | hub |
| `/physics-studio/library`, `/library/[slug]` | dynamic | public physics questions |
| `/physics-studio/exam-lab` | static | public demo page |
| `/register/lgs-paragon-a1|a2` | static | class self-registration (enrollment-code gated) |
| `/robots.txt` `/sitemap.xml` `/manifest.webmanifest` | gen | robots/sitemap point to **www** (defect E1) |

## Portal (noindex — verified live on /portal/login)
Student: `/portal` (dashboard) · `learn(+assignments/[id])` · `exam-lab(+review)` · `library` · `resources` · `study-plan` · `tasks/[id]` · `progress` · `my-ranking` · `leaderboard` · `notifications` · `timetable` · `settings` · `family` · `install` · `onboarding` · `community(studio)`
Staff/admin: `teach(+[classId]+attendance/[lessonId])` · `coordinator` · `admin/{academics,access,analytics,assign,attendance,attendance-view,demo-student-access,drills(+[id]/print),finance,institutions,mail,notify,proctoring,test-preview/[testId],users(+[id])}`
Auth: `/portal/login` (static) · `/portal/reset` · `/portal/auth/callback|signout`

## API surface (~75 handlers, all `runtime: nodejs`)
Groups → auth gate (verified in code):
- `/api/exam-lab/*` (allocations, answer(+upload), asset, attempt, generate, mark, proctor, read-script, submit) → `getPortalUser()`; per-student storage paths.
- `/api/portal/admin/*` → `isAdmin`/`canConductDrills`/`canViewDrillRecords` + `visibleClassIdsForUid` scoping; `drills/[id]` returns **404** for out-of-scope (anti-enumeration); exam-allocate: `student_ids[]` per-student scope checks; proctored-test mode restricted to super_admin/admin/TA.
- `/api/portal/*` (me, kpi, tasks, notifications, calendar(+[token] ics), resources(+view/[id]), library, push, presence, leaderboard, mail, self-register, forgot-password, onboarding, google/*) → session user; calendar token route is deliberate anonymous ICS.
- `/api/cron/*` → Vercel cron header check only.
- `/api/contact`, `/api/physics-question` → public + rate-limited (`hits`/`limited()` pattern, zod).

## Data flows (core)
- **Exam Lab allocation**: staff POST exam-allocate → snapshot frozen (`drillref` w/ exact ids, `DR-YYMM-XXXX`) → per-uid JSON fan-out → student papers-hub resolves ids verbatim (no shuffle for drills) → attempts/answers via exam-lab APIs → drill record audit copy.
- **Auto study plan**: Vercel cron → `ensureStudyPlan(uid)` per student → tasks + allocations (`lockOnExpiry:false`, `integrity:"off"`, Year-1 scoped to chapter 1 as of 2026-09-19).
- **Attendance**: teach/[classId]/attendance/[lessonId] + registrar API → edu_lessons/edu_attendance.
- **Push**: subscription self-heal on rotation; notify fan-out in admin/notify + notifications lib.

## External integrations
Supabase (auth/DB/storage) · Google (Classroom/Drive import, provision, shared) · Resend mail · web-push · Vercel analytics/crons · ops.sjabrankamran.com (media host in CSP).
