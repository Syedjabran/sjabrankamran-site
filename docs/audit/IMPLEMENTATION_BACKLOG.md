# IMPLEMENTATION_BACKLOG — ranked P0–P3
Effort: S<½d · M≈1–2d · L≈3d+. Status: todo / branch / blocked / done.

## P0 — discoverability, safety, evidence
| ID | Item | Evidence | Effort | Status |
|---|---|---|---|---|
| B1 | **Single canonical host (non-www)**: set `SITE.url`→`https://sjabrankamran.com`, robots host+sitemap non-www, permanent www→non-www redirect (vercel.json), set `NEXT_PUBLIC_SITE_URL` in Vercel | E1 | S | **branch** |
| B2 | Rotate exposed demo password; then run authenticated A2 audit (12 evidence screens, 3 viewports) | spec §3.3 | S + M | **blocked on JB** |
| B3 | Search Console + Bing verification, submit non-www sitemap, coverage report | E1/E5 | S | blocked on access |
| B4 | Supabase RLS/storage-policy audit (never assume RLS; service-role isolation; IDOR test matrix incl. attempts/results/files) | REPO_MAP | M | todo |
| B5 | Backup + tested rollback for DB and portal-data bucket before any migration work | master F3 | S | todo |

## P1 — core learning UX (needs A2 evidence first where marked *)
| ID | Item | Effort |
|---|---|---|
| B6 | Sitemap: add public library/article URLs, correct host, exclude nothing private (verify) | S |
| B7 | *Dashboard priority: one dominant continue-action, next-best-action reason, upcoming test | M |
| B8 | *Global portal search w/ filters (qualification/paper/topic/type) — currently none found in code | L |
| B9 | Design tokens + accessible primitives ("Precision in Motion") as Tailwind theme extension, incremental — no big-bang restyle | M |
| B10 | *Timed-test resilience pass: autosave cadence, reconnect recovery, unanswered count before submit (some exists; verify against E4 spec) | M |
| B11 | *Results diagnosis: topic/outcome breakdown + next-step links (analytics lib exists; surface it) | M |
| B12 | Mobile bottom-nav for portal top destinations | M |

## P2 — public site, content, SEO/GEO
| ID | Item | Effort |
|---|---|---|
| B13 | Qualification hubs: `/physics/cambridge-a-level-9702` (+5054, IB) answer-first pages; no URL changes to existing routes, additive only | L |
| B14 | Structured data: Organization/Person(ProfilePage)/Course+ItemList/BreadcrumbList/Article per template, validated | M |
| B15 | Topic-page template per master §G2 checklist (summary→syllabus alignment→worked example→common mistakes→practice) | L |
| B16 | OG/social metadata per template; breadcrumbs public+internal links | S–M |
| B17 | GEO: answer-first sections, transcripts, entity consistency, OAI-SearchBot decision (owner), llms.txt optional | M |
| B18 | Homepage reorder to spec §6.3 (H1+2 CTAs, proof bar, 3 pathways, how-learning-works, real product preview) | M |

## P3 — differentiators & hardening
| ID | Item |
|---|---|
| B19 | Physics Mastery Constellation (blocked until outcome tagging + mastery events reliable) |
| B20 | Guided worked examples w/ progressive hints |
| B21 | ESLint config restoration (flat config) + CI gate |
| B22 | Storage-as-JSON → consider transactional store for allocations if concurrency evidence appears |
| B23 | Visual regression harness (Playwright already a devDep) for shell/dashboard/exam templates |
| B24 | Analytics events per master §11 (privacy-clean) + KPI dashboard |

Acceptance criteria: master §13 list adopted verbatim.
