# REPO_MAP — sjabrankamran-site
Updated: 2026-09-19 · Lead agent single-scan snapshot (Phase A1). Sources: repo @ `0d78091`, production build output, live checks.

## Stack (verified)
| Layer | Value |
|---|---|
| Framework | Next.js **16.3.0**, App Router, TypeScript, React 19 line |
| Package manager | npm (`package-lock.json`) |
| CSS | Tailwind (`tailwind.config.ts`, `src/app/globals.css` with print rules `@media print`, `.el-noprint`) |
| Fonts | Inter + Space Grotesk + mono (see `src/app/layout.tsx`: `inter`, `spaceGrotesk`, `mono`) |
| Icons | `lucide-react` (graph god-node, 83 imports) |
| Math | KaTeX (`katex`, `rehype-katex`, `remark-math`) |
| Auth/DB/storage | **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`); service-role admin client server-only (`src/lib/supabase/admin.ts`) |
| Email | Resend + portal mail relay (`/api/portal/mail*`) |
| Push | `web-push` (VAPID), self-healing subscriptions (commit `ac1a736`) |
| Analytics | `@vercel/analytics` only |
| Validation | `zod` on AI/exam endpoints |
| Deployment | Vercel, Git auto-deploy from `main`; crons via `vercel.json` (daily-study-plans, saturday-parent-reports) |
| Tests | `scripts/test-access-control.mjs` (`npm run test:access`); Playwright present as devDep but no e2e suite found |
| Lint | **BROKEN repo-wide**: `next lint` removed in Next 16, no ESLint config. Gate = `tsc --noEmit` + `next build` |

## Key directories
- `src/app/(marketing)…` public pages: `/`, `/education`, `/enterprise`, `/ai-technology`, `/insights`, `/contact`, `/profile`, `/physics-studio(+library, exam-lab)`, `/register/lgs-paragon-a1|a2`
- `src/app/portal/(app)/…` authenticated portal (student + staff + admin)
- `src/app/api/…` ~75 route handlers (see ROUTE_API_DATA_MAP)
- `src/components/exam-lab/` runner, papers-hub, answer-pad (stylus), proctor-camera, use-exam-guard, class-drill-assign
- `src/lib/edu/auth.ts` roles/RBAC helpers; `src/lib/portal/*` domain libs; `src/lib/exam-lab/*` banks/allocations/drill-records/fullscreen
- `supabase/migrations/` 6 SQL files: initial+redesign schema, `edu-001-foundation` (edu_* tables), attendance/leave, coordinator role, `el-001-exam-lab` (el_* tables)

## Auth & session (verified in code)
- Supabase cookie session; `src/middleware.ts` protects `/portal`, cheap cookie-presence check, **fails open** deferring to per-page `getPortalUser()`; RLS is the backstop claim (RLS audit itself = pending, see backlog).
- Roles: 12 (`EduRole`) incl. school-scoped coordinator/facilitator/attendance_registrar; helpers `isAdmin/isStaff/canConductDrills/canViewDrillRecords/SCHOOL_SCOPED_ROLES`.
- CSP present (verified live header), `frame-ancestors 'self'`, supabase + jsdelivr + vercel-scripts allowlist.

## Data model (from migrations + code)
- `edu_*`: profiles, user_roles, students, classes, enrolments, lessons(attendance), teachers, announcements, assignments, assessments, audit_logs, certificates…
- `el_*`: tests, questions, attempts (+indexes).
- Public site: `public.articles`, `contact_enquiries`, `ventures`, `audit_logs`, `physics_questions/topics`.
- **Storage-as-DB pattern**: `portal-data` bucket JSON for allocations (`exam-lab/allocations/<uid>.json`), drill records (`exam-drills/index.json` + per-id), tasks, subs. Consistency relies on app code, no transactions — flagged in backlog.

## Content source
No CMS. Marketing copy hardcoded in page components; articles table exists; physics content = image banks (`image-bank.json`, `secure-bank.json`) + Google Drive integration.

## Known hotspots / debt (observed)
- `next lint` broken (tooling), no ESLint config.
- Storage-as-JSON concurrency (allocations write loop per-uid; last-write-wins).
- `tp.mjs`, `tmp-*` dirs untracked clutter at repo root.
- Teacher with zero class mapping retains allocate access (deliberate compat softening, 2026-09-19).
- Single JSON-LD block only on homepage (person schema); no Course/Breadcrumb/Article schema yet.
