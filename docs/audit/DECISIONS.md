# DECISIONS — premium redesign programme
Format: date · decision · owner · status.

| # | Date | Decision | Owner | Status |
|---|---|---|---|---|
| D1 | 2026-09-19 | Master prompt + external spec adopted as operating contract (`MASTER_PROMPT.md`, `EXTERNAL_AUDIT_SPEC.md`). Audit-before-edit; ≤3 bounded workers; phase gates. | JB (approved all actions) | Active |
| D2 | 2026-09-19 | Work branch `feat/premium-education-ux`; `main` receives only reviewed merges. Urgent Exam-Lab fixes shipped earlier today stay on `main` (already live). | Pablo | Active |
| D3 | 2026-09-19 | Verification gate = `tsc --noEmit` + `next build` (repo lint broken: Next 16 removed `next lint`, no ESLint config). Adding ESLint config = backlog item, not a blocker. | Pablo | Active |
| D4 | 2026-09-19 | **Canonical host = `https://sjabrankamran.com` (non-www).** JB approved & shipped: www 308→apex (vercel.json), canonical/robots/sitemap all apex, legacy `NEXT_PUBLIC_SITE_URL=www` neutralised in code. Verified live. | JB approved | **Done** |
| D5 | 2026-09-19 | External audit's portal criticisms remain test cases only (their browser never reached the site). No redesign justified by them until reproduced (A2). | Per master prompt | Active |
| D6 | 2026-09-19 | Demo password previously circulated is treated as exposed; JB must rotate before the authenticated A2 audit; credentials only via secure channel, never chat. | JB | **Waiting on JB** |
| D7 | 2026-09-19 | Framework/auth/DB/hosting are kept (Next+Supabase+Vercel). No migration proposals without measured cause (master rule 6). | Per master prompt | Active |
| D8 | — | Target IA + "Precision in Motion" visual direction approval (phase gate before broad implementation). | **JB — pending** | Open |
