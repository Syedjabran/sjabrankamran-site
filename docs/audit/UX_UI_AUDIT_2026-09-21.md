# UX/UI Professional Audit — sjabrankamran.com & Student Portal
_Date: 2026-09-21 · Method: code-level audit (src/app, src/components, globals.css, tailwind) + public fetch. Portal audited from code (authenticated session not available). Findings grounded in file paths; treat live-render items as to-confirm in an authenticated pass._

## 1. Information Architecture & Navigation
- Clean split between public marketing and authenticated portal.
- Public: flat hierarchy, homepage single-page with deep links to courses.
- Portal: dual-navigation — top header (identity, role-switch, profile) + sticky searchable left sidebar (`PortalNavigation`).
- Watch: role-based server checks can cause perceived layout shift when the sidebar changes between roles in Preview Mode.

## 2. Visual Design
- Type: `Space Grotesk` (display) + `Inter` (body) — effective educational/tech contrast.
- Color/contrast: palette (Abyss #0A1024, Cyan #3DE1F0) exceeds WCAG AA for primary text; `fog`/`dust` add depth.
- Spacing: consistent Tailwind rhythm; `Section` uses `py-20` mobile / `py-28` desktop.
- Polish: shimmer skeletons, staggered hero entrance, cosmic gradients.

## 3. Landing & Conversion
- Video hero + "Open Education Portal" CTA is high-impact.
- Prospects funnel through `/physics`.
- P2: `QUALIFICATIONS` cards on the physics page are text-heavy; add curriculum icons / color codes for scannability.

## 4. Portal UX
- Dashboard: lacks one dominant action; add "Continue where you left off" / urgent-task hero. (Note: a priority student dashboard shipped in `3d1c0cb`; confirm live.)
- Exam Lab: strong flow; `dynamic` imports keep nav snappy; anti-cheat integrated without breaking layout.
- States: good skeletons; login/form errors could be more descriptive.

## 5. Mobile & Responsive
- Drawer nav; items ~`min-h-11` (≈44px) meet touch targets.
- 2-col → 1-col transitions cleanly.

## 6. Accessibility
- Good semantics (`nav`/`section`/`header`).
- Keyboard: `focus-visible` rings, `aria-expanded`.
- Reduced motion: explicit `prefers-reduced-motion` stripping — excellent.

---

## Detailed Findings
| Severity | Area | Location | Problem | Recommendation |
|---|---|---|---|---|
| P0 | Performance | `src/app/portal/(app)/exam-lab/page.tsx` | Large question-bank JS payload even when code-split. | Load metadata first; stream question assets on demand (JSON/API). |
| P1 | UX/IA | `src/app/portal/(app)/page.tsx` | Student dashboard lacks a primary-action hero. | Add "Next drill / Today's study plan" hero at top. |
| P1 | Mobile UX | `src/components/portal-navigation.tsx` | Search inside mobile drawer hard to reach. | Global header search or floating button on mobile. |
| P2 | Visual/IA | `src/app/physics/page.tsx` | Course cards visually identical. | Distinct accents: Cyan=A-Level, Emerald=O-Level, Magenta=IB. |
| P2 | A11y | `src/app/portal/(app)/layout.tsx` | Programmatic focus target exists but no focus-shift on route change. | `useEffect` to focus `#portal-content` on route change. |
| P2 | UX | `src/app/portal/login/page.tsx` | Only generic contact for sign-in trouble. | Add password-reset / troubleshoot micro-copy. |
| P3 | Visual | `tailwind.config.ts` | `float`/`orbit` animations risk distraction if overused. | Limit cosmic animations to hero/marketing. |
| P3 | Design | `src/app/globals.css` | `::selection` `bg-cyan/30` may be low-contrast. | Test AA; consider `bg-cyan/40` or darker selection bg. |

## Top 10 Prioritized Fixes
1. P0 — Optimize Exam Lab bank loading (bundle → JSON/API stream).
2. P1 — Student dashboard primary-action hero.
3. P1 — Mobile nav search reachability.
4. P1 — Focus management on portal route change.
5. P2 — Differentiate O-Level/A-Level/IB course cards by accent.
6. P2 — Better login error/troubleshoot feedback.
7. P2 — Audit Preview-Mode role switching for layout shift.
8. P2 — ARIA labels/alt text on all Exam Lab diagrams.
9. P3 — `::selection` contrast.
10. P3 — Re-verify reduced-motion across all animations.

## Quick Wins (<1h each)
- `::selection` contrast in `globals.css`.
- Accent borders on course cards (`src/app/physics/page.tsx`).
- "Forgot password?" link in `LoginForm`.
- Current-page title on mobile nav toggle.
- Slightly tighter mobile `Section` padding (`py-16`).

_Source: automated designer audit (google/gemini-3-flash-preview), reviewed by Pablo (Opus 4.8). Live-render claims to confirm in an authenticated pass._
