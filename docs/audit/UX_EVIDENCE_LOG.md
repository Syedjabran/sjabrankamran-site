# UX_EVIDENCE_LOG — sjabrankamran.com
Rule: only verified observations get a Verified label. External-audit claims stay **Pending** until reproduced (their session never reached the site).

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
