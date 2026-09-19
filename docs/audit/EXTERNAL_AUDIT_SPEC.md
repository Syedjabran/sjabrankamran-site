# S. Jabran Kamran Education Platform
## UX, Portal, Content, SEO and GEO Audit & Redesign Specification

**Prepared:** 19 September 2026  
**Website:** `https://sjabrankamran.com`  
**Portal entry:** `https://sjabrankamran.com/portal/login`

---

## 1. Executive outcome

This report separates verified evidence from recommendations and from items that still require authenticated observation.

The authenticated portal could **not** be entered in this session. A saved ChatGPT Work browser permission blocked access to `sjabrankamran.com` before the browser contacted the website. The owner explicitly approved a retry, but the saved block remained in force. Therefore:

- No login attempt reached the website.
- No authenticated dashboard, course, test, result, search, or mobile portal screen was observed.
- No portal screenshots were captured.
- The temporary password is intentionally absent from this report.
- No portal defect is presented as a verified fact.

The public domain also did not surface a relevant result in the available site-restricted search, and direct public retrieval was unavailable in this audit environment. That is **not enough to conclude that the site is unindexed or broken**. It is a material discoverability warning that must be verified in Google Search Console, Bing Webmaster Tools, the live `robots.txt`, the XML sitemap, and server logs.

The strongest defensible deliverable today is therefore:

1. a transparent audit-status record;
2. a benchmark-backed target experience;
3. a detailed portal validation matrix;
4. a frontend/backend redesign specification;
5. an SEO/GEO content architecture;
6. measurable acceptance criteria; and
7. a phased OpenClaw implementation prompt that requires the agent to inspect the real system before changing it.

The attached master prompt is designed to convert the pending observations into evidence and then implement the redesign without guessing, cloning competitors, or rewriting a working backend unnecessarily.

---

## 2. Evidence and confidence labels

| Label | Meaning |
|---|---|
| **Verified — system** | Directly observed in the audit workflow, such as the saved domain permission block. |
| **Verified — benchmark** | Confirmed from a current first-party education or technical source. |
| **Risk — requires verification** | A warning signal exists, but the cause has not been proven. |
| **Target** | Recommended future behavior or measurable standard. |
| **Pending authenticated audit** | Must be observed in the real demo account before it may be called a current defect. |

---

## 3. Stage 1 authenticated forensic audit status

### 3.1 Access record

| Item | Status | Evidence / implication |
|---|---|---|
| Direct portal navigation | **Blocked before site contact** | A saved Work browser permission denied this domain. This is not evidence of a website outage or login failure. |
| User authorization | **Granted** | The owner approved all audit actions and a retry. The system-level saved preference still blocked the retry. |
| Credential use | **Not attempted** | Secure authentication never began. |
| Dashboard audit | **Pending** | No defensible findings can be made. |
| Portal screenshots | **None** | A blank or permission screen would not be useful portal evidence. The uploaded credential image is excluded for security. |
| Mobile/responsive audit | **Pending** | Requires a successful live session or a runnable codebase. |
| Console/network/runtime review | **Pending** | Requires live access or repository access. |

### 3.2 How to unlock the full audit

The account owner must remove the saved Work browser block for `sjabrankamran.com` or start an approved browser session in which the domain is allowed. Then rerun the audit using a new temporary demo password supplied through the secure sign-in control—not in chat, a screenshot, source code, or an issue tracker.

After access is restored, capture at least these evidence screens at desktop and mobile widths:

1. login and error states;
2. first dashboard view;
3. expanded primary navigation;
4. course overview;
5. lesson/resource view;
6. global search and filters;
7. test start and in-progress state;
8. test submission confirmation;
9. result/topic analysis;
10. empty, loading, error, and unauthorized states;
11. profile/help/logout; and
12. one complete mobile journey.

For every screen, record URL/route, role, viewport, load time, click path, observed problem, impact, severity, and proposed fix.

### 3.3 Security note

The demo password appeared in an uploaded screenshot and this conversation. Treat it as exposed. Rotate or revoke it before the next audit, and revoke the replacement immediately after the audit is complete.

---

## 4. Current risk register

| Risk | Evidence level | Severity | Required action |
|---|---|---:|---|
| Authenticated UX is currently unknown | Verified — system | P0 | Restore allowed audit access or provide the repository and a runnable preview. |
| Search discoverability may be weak or blocked | Risk — requires verification | P0 | Inspect Search Console coverage, URL Inspection, `robots.txt`, canonical tags, sitemap submission, and server responses. |
| Private portal content may accidentally be indexable | Pending authenticated/code audit | P0 | Confirm `noindex`, authentication guards, sitemap exclusion, cache headers, and authorization on every portal route. |
| Backend authorization may rely on UI-only controls | Pending code audit | P0 | Inspect route guards, API authorization, object-level access, and—if Supabase is used—RLS policies. |
| Navigation and resource click depth may impede learning | Pending authenticated audit | P1 | Measure the journeys in §8 before changing labels or routes. |
| Search may not support syllabus-aware retrieval | Pending authenticated audit | P1 | Test queries by qualification, syllabus code, paper, session, year, topic, resource type, and keyword. |
| Results may report marks without actionable diagnosis | Pending authenticated audit | P1 | Verify topic tagging, mark loss categories, next-step recommendations, and longitudinal progress. |
| Mobile learning tasks may be incomplete | Pending authenticated audit | P1 | Test real devices/widths, timed tests, PDFs, video, diagrams, tables, and touch targets. |
| Visual redesign could become decorative rather than useful | Target | P1 | Use the proposed academic-premium design principles and test task completion, not taste alone. |

---

## 5. What the leading education platforms do well

These products should be used as pattern references, not cloned. Their text, brand, illustrations, layouts, and interaction details remain their own.

| Platform | Evidence-backed pattern | Adaptation for SJK |
|---|---|---|
| [Cambridge International Physics 9702](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-physics-9702/) | Qualification-first structure, explicit syllabus years, separate syllabus/past-paper/resource entry points, and authoritative terminology. | Make qualification, syllabus code, examination year, paper/component, and resource type first-class metadata. Show “valid for exams in …” wherever syllabus changes matter. |
| [Khan Academy](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery) | Course and unit mastery, understandable skill states, progress percentages, and recommended follow-up based on performance. | Build an honest syllabus-outcome mastery map: Not started, Attempted, Developing, Secure, Mastered. Explain how status is calculated. |
| [MIT OpenCourseWare](https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/) | A legible course spine connecting syllabus, textbook/readings, assignments, lessons, worked examples, and problem sets. | Give each physics course one persistent left-side course map and consistent previous/next lesson movement. |
| [Brilliant](https://brilliant.org/) | Visual guided learning, hints instead of answer dumping, adaptive pacing, interventions when stuck, and progress analysis. | Add guided worked examples and progressive hints. If an AI tutor is built, require syllabus citations and pedagogical guardrails. |
| [Coursera Physics & Astronomy](https://www.coursera.org/browse/physical-science-and-engineering/physics-and-astronomy) | Prominent search, topic discovery, popular/top-rated/short-course groupings, provider trust, and scannable cards. | Let students browse by qualification, paper, topic, goal, duration, difficulty, and popularity without losing the syllabus hierarchy. |
| [edX Physics](https://www.edx.org/learn/physics) | Outcome-led topic landing pages, key takeaways, learning pathways, credibility signals, and clear explanatory content around the catalog. | Create substantial public landing pages that answer learner intent before showing course cards or a sales CTA. |
| [PhET](https://phet.colorado.edu/en/simulations/filter?subjects=physics&type=html) | A dedicated, filterable catalog of interactive science simulations. | Curate simulations by SJK syllabus outcome and embed only where they deepen conceptual understanding. |
| [OpenStax Science](https://openstax.org/subjects/science) | Content-first access to structured learning resources and readable long-form study material. | Provide clean printable notes, equations, diagrams, accessibility, stable URLs, and low-friction reading. |
| [CK-12](https://www.ck12info.org/) | A combined library of textbooks, videos, exercises, flashcards, customizable FlexBooks, and adaptive practice. | Unify resources under one taxonomy and use diagnostics to recommend the next resource type. |
| [FutureLearn](https://www.futurelearn.com/courses) | Filters for subject, availability, start date, language, and product type; cards state duration, weekly effort, rating, and provider. | Put decision-critical metadata on cards: syllabus, paper, topic, type, duration, level, last updated, and completion status. |

### Synthesis

The common pattern is not “more content.” It is a clearer answer to four questions:

1. Where am I in the curriculum?
2. What should I do next?
3. Why is this resource right for me?
4. What has improved after I used it?

The redesigned platform should make those four answers visible within seconds.

---

## 6. Product positioning and design direction

### 6.1 Recommended positioning

**Master Physics. Think Like an Examiner.**

Supporting copy:

> Structured Cambridge International AS & A Level Physics (9702), O Level Physics (5054), and IB Physics learning—combining concept mastery, exam-focused practice, practical guidance, and clear progress tracking with Syed Jabran Ali Kamran.

Use qualification names accurately and include any trademark disclaimer required by the awarding body. Do not imply endorsement or official affiliation.

### 6.2 Visual concept: “Precision in Motion”

The platform should feel premium, contemporary, scientific, and calm—not like a generic LMS and not like a luxury brand pasted onto a school portal.

- Base: deep midnight navy / near-black.
- Reading surfaces: warm white and very light cool gray.
- Primary accent: electric/cobalt blue for interaction and progress.
- Prestige accent: restrained warm gold for key achievements and selected states only.
- Feedback: accessible green, amber, and red with icons/text—not color alone.
- Typography: a highly readable modern sans for UI plus an optional restrained serif for editorial headings. Use locally optimized or privacy-safe web fonts.
- Motifs: field lines, vectors, trajectories, grids, waveforms, or orbital paths used as subtle structure rather than decoration.
- Motion: brief, purposeful transitions with reduced-motion support.
- Components: consistent radius, elevation, focus rings, spacing, icon weight, and data visualization grammar.

An “out-of-the-box” element should be functional: a **Physics Mastery Constellation** that maps syllabus outcomes and visually connects weak prerequisite skills to the next recommended action. It must degrade to an accessible list/table and must never obscure exact marks or progress.

### 6.3 Homepage content order

1. Clear H1, audience, qualifications, and two CTAs: **Explore Physics Courses** and **Try Free Resources**.
2. Proof bar: verified teaching experience, qualifications taught, real student outcomes, and institutions only where permission/evidence exists.
3. Three learning pathways: Cambridge 9702, O Level 5054, and IB Physics.
4. “How learning works”: Learn → Practise → Test → Diagnose → Improve.
5. Interactive product preview or real dashboard capture—not a decorative mockup mislabeled as live.
6. Featured free resources organized by search intent.
7. Teacher profile with complete credentials and teaching philosophy.
8. Verified student stories with context; avoid anonymous or unverifiable superlatives.
9. Latest syllabus-aligned articles/videos.
10. FAQ and a single strong final CTA.

---

## 7. Recommended information architecture

### 7.1 Public website

```text
Home
Courses
  Cambridge International AS & A Level Physics (9702)
  Cambridge O Level Physics (5054)
  IB Physics
Free Resources
  Notes & Formula Sheets
  Topical Questions
  Past-Paper Guidance
  Practical Skills
  Video Lessons
Results & Student Stories
About Syed Jabran Ali Kamran
Insights
Contact
Student Login
```

Keep the primary desktop navigation to roughly 5–7 top-level choices. “Student Login” should be visually distinct but not compete with the main enrolment/resource CTA.

### 7.2 Authenticated portal

```text
Dashboard
Learn
Practice
Tests
Results
Resources
Calendar / Announcements
Help
Profile
```

The same object should not appear under several labels unless each placement serves a clear shortcut. Avoid vague labels such as “Materials,” “Content,” and “Library” coexisting without defined differences.

### 7.3 URL and metadata model

Recommended public patterns:

```text
/physics/cambridge-a-level-9702
/physics/cambridge-a-level-9702/[topic]
/physics/o-level-5054/[topic]
/physics/ib/[topic]
/resources/[qualification]/[resource-type]/[slug]
/past-papers/[qualification]/[paper]/[session]/[year]
/insights/[slug]
```

Do not change live URLs until the real route inventory, traffic, backlinks, and redirect map are complete.

Every learning object should support normalized metadata such as qualification, syllabus code/version, paper/component, topic, learning outcome, resource type, difficulty, estimated duration, publication/update date, author/reviewer, access level, and prerequisite outcomes.

---

## 8. Portal forensic validation matrix and target behavior

The rows below are **test cases**, not claims about the current portal.

| Journey | What to measure | Target |
|---|---|---|
| Login → next useful activity | Time, clicks, redirect correctness, loading/error feedback | Continue-current-work action visible immediately; no redirect loop. |
| Dashboard → current lesson | Click depth and context preserved | One click from the dashboard. |
| Dashboard → upcoming test | Visibility, date/time/timezone, readiness info | No more than two clicks; clear attempt rules before launch. |
| Find a resource | Query success, filters, relevance, zero-results recovery | Relevant item in two interactions for common queries. |
| Browse a course | Orientation and hierarchy | Student always sees course, unit, lesson, completion, and next action. |
| Complete a lesson | Progress persistence and feedback | Autosave, visible completion, next recommended task. |
| Take a timed test | Autosave, timer, navigation, flags, accessibility, reconnect behavior | No lost answers; explicit warnings; recoverable session. |
| Submit a test | Confirmation and accidental-submit protection | Clear unanswered count and intentional final confirmation. |
| Review a result | Mark, percentage, topic loss, answer/mark scheme, next steps | Actionable diagnosis, not only a total score. |
| Compare progress | Date range, course/topic filters, trend clarity | Exact data plus an understandable summary. |
| Use on mobile | Reachability, touch targets, PDFs, equations, diagrams, timers | Full core journey; no desktop-only requirement. |
| Recover from an error | Message clarity and preservation | Explain what happened, preserve work, give a useful next action. |

### 8.1 Dashboard target

Prioritize in this order:

1. **Continue learning** with course/unit/lesson and estimated time.
2. **Next best action** based on upcoming work and weak outcomes.
3. Upcoming tests/deadlines.
4. Mastery/progress summary with an explanation of calculation.
5. Recent results and feedback.
6. Bookmarks/recent resources.
7. Announcements.

Avoid a dashboard made of equally weighted cards. One task must be visually dominant.

### 8.2 Search target

Provide global search with typo tolerance and filters for:

- qualification and syllabus code;
- syllabus version/exam year;
- paper/component;
- topic and learning outcome;
- resource type;
- difficulty;
- duration;
- free/enrolled access;
- completed/not started; and
- updated date.

Each result should say why it matched. Record zero-result searches and result clicks. Offer spelling correction, broader filters, and related topics rather than a dead end.

### 8.3 Course and lesson target

- Persistent course outline on desktop; accessible drawer on mobile.
- Breadcrumbs plus previous/next movement.
- Lesson objective, prerequisite, estimated time, and syllabus alignment.
- Video transcript/captions, readable notes, accessible equations, downloadable/printable option where permitted.
- Worked example with progressive reveal.
- Common mistakes and examiner technique.
- Short retrieval practice before marking complete.
- Bookmark, report issue, and resume position.

### 8.4 Tests and results target

- Server-authoritative timing and grading where applicable.
- Autosave every answer and after navigation.
- Question palette: answered, unanswered, flagged, current.
- Keyboard-accessible equation/diagram interactions.
- Explicit attempt rules and accessibility accommodations.
- Result breakdown by topic/outcome, command word, calculation/concept/practical skill, and paper.
- Review states must respect test-release policy; do not expose answers before permitted.
- Recommended remediation links directly to the relevant lesson/practice set.
- Longitudinal view uses raw marks and percentages carefully; do not compare unlike papers without explanation.

### 8.5 Required UI states

Every data-driven component requires designed states for loading, empty, partial data, error, offline/reconnect, unauthorized, expired session, unavailable resource, and success. Skeletons should match final dimensions to avoid layout shift.

---

## 9. Frontend and backend architecture requirements

These are architecture rules; the actual stack must be discovered from the repository.

### 9.1 Frontend

- Preserve the working framework unless a measured constraint justifies migration.
- Create design tokens for color, typography, spacing, radius, shadow, motion, and breakpoints.
- Build accessible primitives before page-specific variants.
- Use server rendering/static generation for public content where supported.
- Keep private portal data out of public HTML, caches, and search indexes.
- Prefer route-level code splitting and lazy-load heavy video/PDF/chart modules.
- Use semantic HTML, real headings, landmarks, labels, focus management, and skip links.
- Render equations with accessible MathML/fallback text and printable styling.
- Make tables responsive without hiding important data.

### 9.2 Backend and data

First produce a current-system map: auth provider, roles, routes, APIs/actions, database tables, storage, search, background jobs, analytics, and deployment.

Suggested domain entities—adapt, do not blindly recreate:

- users/profiles/roles;
- courses, course_versions, enrolments;
- units, lessons, learning_outcomes, prerequisites;
- resources, resource_versions, resource_tags;
- tests, questions, rubrics, attempts, answers, results;
- progress_events and outcome_mastery;
- announcements;
- bookmarks and recent_items;
- search_documents/search_events; and
- security/audit_events.

If Supabase exists, inspect row-level security, storage policies, service-role isolation, auth hooks, indexes, query plans, and migration history. Never expose the service-role key to the client. If Supabase is not present, do not introduce it merely because it is familiar.

### 9.3 Security

- Enforce RBAC and object-level authorization on the server for every request.
- Prevent IDOR across students, attempts, results, files, and courses.
- Use signed/authorized file access where resources are private.
- Protect assessment answers and mark schemes by release state.
- Rate-limit login, search abuse, test submission, and expensive APIs.
- Validate uploads and serve them with safe content headers.
- Rotate secrets, redact logs, and prohibit production credentials in prompts.
- Create additive, reversible database migrations with backups and rollback instructions.

---

## 10. SEO and GEO specification

### 10.1 Technical SEO

1. Verify canonical HTTPS host and redirect all alternatives once.
2. Return meaningful status codes; remove soft 404s and redirect chains.
3. Generate unique titles, H1s, and intent-matched descriptions.
4. Create canonical tags and prevent parameter/facet duplication.
5. Generate an XML sitemap or sitemap index for courses, resources, articles, and videos; exclude portal and private URLs. Google explains that sitemaps identify important pages/media and help crawlers discover complex or new sites ([source](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)).
6. Inspect `robots.txt`; allow public content and block no private content solely through robots—authentication and `noindex`/headers must do the real protection.
7. Add breadcrumbs and strong contextual internal links.
8. Use descriptive image filenames, dimensions, alt text, responsive formats, and lazy loading below the fold.
9. Publish video transcripts, captions, thumbnails, duration, upload date, and landing pages.
10. Connect Search Console and Bing Webmaster Tools; monitor coverage, queries, rich-result errors, manual actions, and Core Web Vitals.

### 10.2 Structured data

Use JSON-LD only where it matches visible page content:

- `Organization` / `EducationalOrganization` as appropriate;
- `Person` or `ProfilePage` for the teacher profile;
- `Course` plus `ItemList` for genuine course series;
- `BreadcrumbList`;
- `Article` for substantive editorial content;
- `VideoObject` for watch pages;
- `Quiz`, `Question`, and `Answer` only for eligible visible education-Q&A/flashcard pages; and
- `WebSite` and other types only where supported and truthful.

Google’s course guidance requires real curriculum units with educational outcomes and valid course/provider information; markup does not guarantee a rich result ([source](https://developers.google.com/search/docs/appearance/structured-data/course)). Never add fake ratings, awards, prices, reviews, or affiliations.

### 10.3 Content architecture

Create one authoritative hub per qualification, then one canonical page per meaningful learner intent—not hundreds of thin keyword variants.

Priority clusters:

- Cambridge International AS & A Level Physics 9702;
- Cambridge O Level Physics 5054;
- IB Physics SL/HL;
- Paper 1, 2, 3, 4, and 5 guidance where applicable;
- topical past-paper questions;
- practical planning, data analysis, uncertainty, graphs, and evaluation;
- command words and examiner technique;
- formula sheets and derivations;
- common misconceptions by topic;
- revision plans and diagnostic tests; and
- student/parent guides to course pathways.

Every substantial topic page should include:

1. direct answer/summary;
2. syllabus alignment and exam-year validity;
3. learning objectives and prerequisites;
4. concept explanation;
5. equations with symbol definitions and units;
6. diagram or simulation where useful;
7. worked example;
8. common mistake;
9. examiner technique;
10. short practice and answer guidance;
11. related resources;
12. author/reviewer, references, and last-updated date.

### 10.4 GEO / answer-engine readiness

“GEO” has no single guaranteed ranking formula. Optimize for extractability, authority, and trust:

- keep important answers in crawlable semantic HTML rather than only video, PDF, canvas, or client-only UI;
- use concise answer-first sections followed by evidence and detail;
- maintain a consistent entity identity for Syed Jabran Ali Kamran and the platform;
- cite primary sources, especially official syllabus documents;
- state dates, syllabus versions, units, assumptions, and scope;
- add author expertise, review process, corrections policy, and contact details;
- write self-contained headings that match real questions;
- publish transcripts and text alternatives;
- keep facts and statistics verifiable;
- avoid fabricated “best,” “number one,” distinction, or success-rate claims;
- allow `OAI-SearchBot` if appearing in ChatGPT Search is desired. OpenAI states that `OAI-SearchBot` governs search visibility separately from `GPTBot`, which concerns model training ([source](https://developers.openai.com/api/docs/bots)); and
- treat `llms.txt` as optional/experimental documentation, not a substitute for crawlable pages, robots controls, sitemaps, structured data, or high-quality content.

### 10.5 Performance and accessibility

Targets at the 75th percentile on mobile and desktop:

- LCP ≤ 2.5 seconds;
- INP < 200 milliseconds;
- CLS < 0.1.

These are Google’s current “good” Core Web Vitals thresholds ([source](https://developers.google.com/search/docs/appearance/core-web-vitals)).

Meet WCAG 2.2 AA: keyboard completion, visible focus, logical order, sufficient contrast, text zoom/reflow, captions/transcripts, non-color status cues, descriptive errors, accessible authentication, target sizes, reduced motion, alt text, table semantics, and accessible math/diagrams. Test with automation and manual keyboard/screen-reader checks.

---

## 11. Measurement plan

Track useful learning and usability events—not vanity metrics or unnecessary personal data.

### Product events

- dashboard primary-action click;
- lesson start/resume/complete;
- search query category, filter use, result click, and zero result;
- resource open/download/bookmark;
- test start, answer save failure, reconnect, submit, and abandon;
- feedback/result viewed;
- recommended remediation opened/completed;
- support/report-issue action; and
- session expiry or authorization failure.

### Core KPIs

| KPI | Baseline | Initial target |
|---|---:|---:|
| Median clicks: dashboard → current lesson | Measure first | ≤ 1 |
| Median clicks: dashboard → known resource | Measure first | ≤ 2 |
| Successful common resource searches | Measure first | ≥ 90% |
| Zero-result search rate | Measure first | < 5% after taxonomy cleanup |
| Test answer-save failure | Measure first | 0 tolerated; alert immediately |
| Students viewing actionable result feedback | Measure first | ≥ 80% of submitted attempts |
| Mobile core-task completion | Measure first | No material gap vs desktop |
| WCAG critical/serious defects | Measure first | 0 before release |
| Good Core Web Vitals URLs | Measure first | ≥ 90% of key templates |

Targets must be revised after reliable baselines and cohort size are known.

---

## 12. Prioritized implementation roadmap

### P0 — Evidence, safety, and foundations

- Restore live audit access or run the codebase locally.
- Inventory routes, roles, components, APIs, database, storage, and analytics.
- Capture baseline screenshots, task times, click counts, Lighthouse/field data, accessibility issues, and search coverage.
- Rotate demo credentials.
- Fix authentication/authorization, answer exposure, private indexing, data-loss, and broken-route risks before visual redesign.
- Verify backups and rollback.

### P1 — Information architecture and core portal

- Establish design tokens and accessible primitives.
- Simplify portal navigation and labels based on observed journeys.
- Build the priority dashboard and persistent course map.
- Implement syllabus-aware global search and filters.
- Improve lesson/resume/progress behavior.
- Make tests resilient and results diagnostic.
- Complete the full mobile journey.

### P2 — Public website, content, SEO and GEO

- Rebuild qualification hubs and resource taxonomy.
- Rewrite homepage, course pages, teacher profile, resource templates, and FAQs.
- Implement metadata, canonicalization, sitemap, robots review, structured data, transcripts, and internal linking.
- Improve Core Web Vitals and accessibility across templates.

### P3 — Differentiating learning experience

- Mastery constellation and prerequisite graph.
- Guided worked examples and progressive hints.
- Personalized next-best action.
- Curated interactive simulations.
- Parent/teacher reporting only if role and privacy requirements support it.

Do not begin P3 before P0/P1 measurement and data quality are dependable.

---

## 13. Definition of done

The redesign is not complete until:

- every changed route has loading, empty, error, unauthorized, and responsive states;
- the target journeys pass on desktop, tablet, and mobile;
- there are no P0/P1 authorization or data-loss defects;
- portal pages are excluded from public indexing and public pages are crawlable as intended;
- structured data validates and exactly matches visible content;
- WCAG 2.2 AA critical flows pass automated and manual checks;
- Core Web Vitals targets are met or documented with an owner and remediation plan;
- old URLs have tested redirect mappings;
- analytics verify the key funnels without leaking PII;
- a rollback plan and database backup exist;
- before/after screenshots and measured click-depth comparisons are attached; and
- the owner approves the evidence-based final experience.

---

## 14. Required next evidence

For a genuinely forensic “current component → problem → proposed component → backend implication” report, provide either:

1. an allowed Work browser session for the domain; or
2. repository access plus setup instructions and safe development environment variables.

The most accurate route is both: audit the live demo account, inspect the repository, reproduce locally, then map every observed issue to the responsible component/API/data model.

---

## 15. Primary benchmark and technical sources

- [Cambridge International AS & A Level Physics 9702](https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-physics-9702/)
- [Khan Academy Course and Unit Mastery](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery)
- [MIT OpenCourseWare Classical Mechanics](https://ocw.mit.edu/courses/8-01sc-classical-mechanics-fall-2016/)
- [Brilliant](https://brilliant.org/)
- [Coursera Physics & Astronomy](https://www.coursera.org/browse/physical-science-and-engineering/physics-and-astronomy)
- [edX Physics](https://www.edx.org/learn/physics)
- [PhET Physics Simulations](https://phet.colorado.edu/en/simulations/filter?subjects=physics&type=html)
- [OpenStax Science](https://openstax.org/subjects/science)
- [CK-12](https://www.ck12info.org/)
- [FutureLearn Course Catalog](https://www.futurelearn.com/courses)
- [Google Course structured data](https://developers.google.com/search/docs/appearance/structured-data/course)
- [Google Education Q&A structured data](https://developers.google.com/search/docs/appearance/structured-data/education-qa)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [OpenAI crawler controls](https://developers.openai.com/api/docs/bots)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

