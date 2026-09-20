# UX_EVIDENCE_LOG — sjabrankamran.com
Rule: only verified observations get a Verified label. External-audit claims stay **Pending** until reproduced (their session never reached the site).

## Evidence corrections and current status — 2026-09-19

This section supersedes conflicting conclusions in the historical table below.

- **E1:** Both hosts serving content with the same www canonical does not establish split ranking signals, an indexing failure, or the cause of weak search visibility. Consolidating redirects is a consistency improvement; ranking impact remains unmeasured without Search Console evidence. P0 severity was not justified by the observations. The apex configuration is now present in source (commits `fc54857`, `01cf6f1`); earlier live verification is recorded in DECISIONS.md. No new production verification is claimed by this correction.
- The former assertion that `NEXT_PUBLIC_SITE_URL` was unset was an unsupported inference; rendered canonical output alone cannot determine environment configuration.
- **E3:** A login noindex tag proves only that response's indexing directive, not privacy or authorization for the entire portal. Robots disallow is not access control and can prevent crawlers from observing noindex.
- **E4:** CSP presence is observed, but policy effectiveness, inline-script allowances, authorization and storage controls need separate testing. Do not label the portal secure based on this header.
- **E5:** Current `src/app/sitemap.ts` contains nine static entries and a query for approved/public library slugs, capped at 1,000. A response without dynamic entries does not prove missing generation code; record publication eligibility or query failures before diagnosing it. Static lastModified values use request-time dates rather than evidenced content-update dates (code-verified follow-up).
- **E6:** Current root layout emits WebSite, EducationalOrganization and Person schemas. Their presence alone does not prove eligibility or factual validation; nested Organization types are not evidence of a separate validated organization graph.
- **Authentication:** Protected-store metadata checked this turn contains no demo login/password entries. Authenticated journeys remain untested. Repeated masked-dialog requests have not resolved entry; do not infer client-wide lack of support solely from these interrupted requests.
- **Release status:** The complete redesign, authenticated accessibility audit, performance targets and assessment recovery acceptance criteria are not complete. TypeScript/build success is not end-to-end or hardware verification.

## Verified — authenticated portal audit, session 1 (2026-09-20 ≈14:50–15:15 CEST, demo account, managed Chromium 1440×900)

| ID | Observation | Evidence | Severity |
|---|---|---|---|
| A1 | Login → dashboard works; demo account lands on the Admin Command Center: KPI row (378 students / 249 active / 10 classes / 4 schools / 129 enquiries / 0 unpaid), live recent-activity feed with correct relative times. | body text read + `auth-dashboard-1440.png` | OK |
| A2 | New role-preview switcher works: “View as → Student” switches instantly with a clear “Preview mode — viewing as Student” banner. | body text read | OK |
| A3 | **New student priority dashboard renders as designed** (release `3d1c0cb`): dominant “CONTINUE YOUR WORK” hero (Daily challenge · Kinematics, overdue flagged, Start now), “Coming up” list with kind chips + overdue dates, study-plan card showing Priority: Physical quantities & units — confirming the Year-1 chapter-1 scoping is in effect in production data. | body text read + `auth-student-dashboard-1440.png` | OK |
| A4 | New Search nav entry appears for both Admin and Student roles (release `69adfd1`/`6b01b15`). | body text read | OK |
| A5 | Zero page errors reported by the browser error log across dashboard + role switch. | `browser errors` → “No page errors” | OK |
| A6 | **Vercel Security Checkpoint (Code 29) blocks fresh document loads from the automated session** (`/portal/search?q=…` and subsequent `/portal` reloads). Same-session client-side navigation was unaffected. This is bot protection doing its job against automation, not an app defect; note that privacy-hardened real browsers could conceivably meet the same interstitial. Search-page live behaviour therefore **not yet verified in-browser**; its API auth gate (401 signed-out) was verified separately. | body text: “Failed to verify your browser / Code 29 / Vercel Security Checkpoint” | Env note |

Pending from this session: live search interaction, Exam Lab attempt UI, mobile (390×844) pass — resume after checkpoint clearance.

## Verified — live technical evidence (2026-09-19, Europe/Berlin, curl from gateway host)

| ID | Observation | Evidence | Severity |
|---|---|---|---|
| E1 | **Canonical host split.** `https://www.sjabrankamran.com/` serves 200 (no redirect); non-www serves 200; canonical tag on BOTH points to `https://www.sjabrankamran.com`; robots.txt `Host:` + sitemap URLs = www. Brand/all shared links use non-www. Two indexable hosts, signals split → plausible root cause of weak search visibility. | robots.txt body; curl -sI on 3 host variants; `<link rel=canonical>` on both hosts; `src/lib/utils.ts:11` fallback `https://www.sjabrankamran.com`; `NEXT_PUBLIC_SITE_URL` unset in Vercel (inferred: canonical shows fallback). | **P0 (SEO)** |
| E2 | `http→https` per-host 308s exist and work. | curl 308 outputs | OK |
| E3 | `/portal/login` correctly `noindex` + robots disallows `/admin/`,`/api/` but **not** `/portal/` (meta noindex is the actual guard; robots allows crawl of login URL). | live HTML meta + robots body | P3 note |
| E4 | Strong CSP on portal responses (default-src 'self', frame-ancestors 'self', explicit allowlist). | curl -sI headers | OK |
| E5 | Sitemap contains only 10 marketing URLs (`/`, profile, education, physics-studio(+library), enterprise, ai-technology, insights, contact, exam-lab). No article/library-slug URLs; all www. | live sitemap.xml | P1 (SEO) |
| E6 | Homepage has exactly 1 JSON-LD block (person schema); no Course/Breadcrumb/Organization schema on key templates. | curl grep count; `layout.tsx` personSchema | P2 |
| E7 | Exam Lab drill determinism + refs + roles verified end-to-end in code and regression-tested (2026-09-19 fixes `f829326`, `0d78091`). | repo commits + access test run | Fixed |

## Pending authenticated audit (test cases, NOT findings)
The full §8 matrix of the external spec (login→next activity, dashboard click depth, search quality, timed-test resilience, results diagnosis, mobile journeys, a11y keyboard/screen-reader passes, console/network capture at 1440×900 / 768×1024 / 390×844) requires a **demo student account via secure channel** + browser session. Blocked: no demo credentials held; the previously circulated demo password must be treated as **exposed → rotate before the audit** (external spec §3.3).

## Public-page heuristics (code-level, medium confidence, to confirm in browser pass)
- Marketing IA is venture-oriented (`education/enterprise/ai-technology/insights`) rather than qualification-oriented (9702/5054/IB) → mismatch with learner search intent; no qualification hub pages, no topic pages, no past-paper guidance pages (master-prompt Phase C/G gap).
- No breadcrumbs on public templates; internal linking thin.
- Portal dashboard (`/portal` page.tsx) renders many equally-weighted cards; no single dominant continue-action (to verify in A2).
