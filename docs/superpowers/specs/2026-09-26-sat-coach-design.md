# SAT Coach — subjects, SAT profile, analytics, planner, AI guidance, parent reports

Date: 2026-09-26 · Branch: `feat/sat` · Builds on: `docs/superpowers/specs/2026-09-22-sat-module-design.md` (the SAT Lab) — that spec's integrity rules still bind.

## 1. Goal

Turn the SAT Lab from a set of tools into an autonomous coach. A student with SAT enabled works on their own, with no teacher: the system knows their exam date and target, measures what they are good and weak at, schedules what to do on which day, explains it in plain words, and answers their questions as a tutor that knows their record. Parents get a clear weekly picture and a warning when a week is missed.

"More than Khan Academy" means, concretely: a plan that counts back from the student's real exam date and re-targets every week; per-skill mastery with recency and confidence rather than raw percentages; spaced re-asking of questions the student got wrong; pacing analysis against the real exam's clock; a tutor that can see the student's analytics, explain the student's own mistakes from the official question and worked answer, build a drill on request and propose plan changes.

## 2. Decisions taken with the owner (2026-09-26)

| Topic | Decision |
| --- | --- |
| Getting into SAT | The admin creates the account (unchanged) and adds **subjects**. Subjects come from one registry; today Physics and SAT, more later. Physics stays class-based as today; SAT is granted directly (no class, no teacher). |
| SAT onboarding | The existing onboarding form is unchanged. If SAT is enabled, an **SAT setup page** follows it (and appears on the first SAT Lab visit if SAT is added later). It asks: exam date *or* "not booked yet" + target month; target score; starting point (short diagnostic / past SAT or PSAT score / skip); practice days; minutes per session. All editable later in the SAT Lab. |
| Plan authority | **Rules decide, AI explains.** A deterministic planner builds the schedule; the AI writes tips, goals' wording, summaries and tutor replies, and can *propose* changes the student confirms. |
| Daily challenges | Scheduled on the student's practice days. **Students cannot move, skip or reshuffle them.** Due by the end of their day (Pakistan time); done later = "late", still counts as missed for warnings, still credited as practice. |
| Full exams | Scheduled per day (not time), alternating the adaptive mock and the 8 official practice tests. Cadence "steady build-up" (§6.3). **Students may move a full exam up to 2 times**: the new day must be today or later, at least 2 days before the SAT, and not a day that already has a full exam. |
| Tutor | Digital SAT Tutor with the student's analytics and plan as context. Abilities: explain my mistakes (finished questions only, with the official question image and worked answer), make drills on request, remember conversations, propose plan changes (student confirms with one tap; never daily challenges). Paused while a timed mock/practice module is running. **40 messages per student per day.** |
| AI provider | Provider-agnostic adapter over plain `fetch`. **Groq** now for testing (free tier: 1,000 requests/day, 8,000 tokens/minute — keep context compact), **Gemini** in production. Selected by env. Everything degrades to deterministic text when no key works. |
| Insights refresh | On each SAT Lab visit, regenerate tips/goals/summary **only when the inputs changed** (new finished work, plan change, new day). |
| Parent email | **One Saturday email with a section per subject.** SAT section: the week's metrics first, a two-line summary of the student, progress so far. **Clear warning when the student missed every challenge scheduled that week** (softer note for partial misses). Sent through the portal's existing mail system (`sendMail`, queue, checkpoint). |
| Branch / delivery | Build on `feat/sat`, same implement → review → fix process as the SAT Lab, push `feat/sat` when done. |

## 3. Integrity rules (carried from the SAT Lab, extended)

1. **The answer key never reaches the browser before submission.** Analytics, insights and the tutor use only *finished* items: checked drill questions and submitted mock/practice modules. The tutor never receives an unanswered question's answer; "explain my mistake" is refused for any question not finished by this student.
2. **The tutor is paused during timed work.** If the student has an adaptive mock or practice test whose current module is running (or on a break), tutor requests return a pause message and cost nothing.
3. **No invented scores.** Only scores that already exist are shown: official practice-test ranges (official tables) and adaptive-mock estimates (labelled "Estimated" with basis). The coach adds no new score model. Mastery is shown as a percentage *per skill*, never as a scaled score.
4. **Minimal data to AI providers.** The prompt carries the student's first name, SAT profile and aggregated analytics — never email, phone, guardian data, school or photos.
5. **Storage reads fail closed** (`readFreshJson`/`writeFreshJson`); a failed read is never treated as "no document" followed by a write.
6. **Pakistan time** for every plan date and every shown date (`formatPk`, PKT calendar days).
7. **AI provider policy** (`scripts/check-ai-provider-policy.mjs`) still passes: no Anthropic/OpenAI/Moonshot/Kimi packages, hosts or env names. Groq is called at `api.groq.com`.

## 4. Subjects (sub-project 1a)

**Registry** — `src/lib/portal/subjects.ts` (pure):

```ts
type SubjectId = "physics" | "sat";
interface SubjectDef { id: SubjectId; label: string; grant: "class" | "direct"; courses: Course[]; setupPath?: string }
SUBJECTS = [
  { id: "physics", label: "Physics", grant: "class", courses: ["9702", "5054"] },
  { id: "sat", label: "Digital SAT", grant: "direct", courses: ["SAT"], setupPath: "/portal/sat-lab/setup" },
]
```

Adding a subject later = one registry entry (+ its own area). `grant: "class"` subjects come from class enrolment exactly as today; `grant: "direct"` subjects are toggled by an admin.

**Grants** — `portal-data/subjects/<uid>.json`: `{ grants: { [subjectId]: { by: uid, at: iso } }, history: [{ subject, on: boolean, by, at }] }` (history capped at 50). Server module `src/lib/portal/subject-grants.ts`: `readGrants(uid)` (fails closed → throws), `setGrant(uid, subject, on, by)` (fresh read → write → verify).

**Access** — `resolveCourseAccess` adds direct grants to the class-derived courses. SAT access = SAT-year class (unchanged) **or** SAT grant. Physics default rule: the legacy default stays class-based — every enrolled class whose year is not recognised as another course grants 9702, whatever the student's grants; a student with **no classes** gets 9702 only when they also have no direct grants (an SAT-only account created through subjects does not get physics, and adding SAT never removes physics). A recognised O Level class still blocks the 9702 default (existing rule), and at the access level a student with no enrolment and no grant has no course (existing gate). Later code reads courses through `resolveCourseAccess`/`satAccess`, never `coursesForEnrolment` directly. Strict mode (SAT path) throws on a grants read failure → 503, as for enrolments.

**Admin UI** — admin user page (`src/app/portal/(app)/admin/users/[id]/user-detail.tsx`) gets a **Subjects** card: Physics shows "From class: <class name>" or "Not enrolled in a physics class" (managed by the existing Enrolments card); Digital SAT is a toggle. The user-creation form (`admin/users/users-console.tsx` → `POST /api/portal/admin/users`) gets the same Digital SAT checkbox. Turning SAT on notifies the student ("SAT Lab is now open for you"). Turning it off removes access; stored sittings are kept. Route: `POST /api/portal/admin/users/[id]/subjects` `{ subject, on }`, admin-only, audited.

## 5. SAT profile and setup (sub-project 1b)

**Profile** — `portal-data/sat/profile/<uid>.json`:

```ts
interface SATProfile {
  examDate: string | null;          // "YYYY-MM-DD" (PKT), future, ≤ 18 months ahead
  targetMonth: string | null;       // "YYYY-MM" when examDate is null ("not booked yet")
  targetScore: number;              // 400–1600, multiple of 10
  start: { kind: "diagnostic" } | { kind: "score"; total: number; rw?: number; math?: number; source: "SAT" | "PSAT"; date?: string } | { kind: "skip" };
  days: number[];                   // practice weekdays, 0 = Sunday … 6 = Saturday, 1–7 entries
  minutes: 15 | 30 | 45 | 60;       // per session
  createdAt: string; updatedAt: string;
  changes: { at: string; field: string; from: unknown; to: unknown }[];   // capped at 50
}
```

The plan horizon ends on `examDate`, or on the first day of `targetMonth` when not booked.

**Setup page** — `/portal/sat-lab/setup` (student). One page, five short blocks with sensible defaults:
1. *When is your SAT?* date picker · or *Not booked yet* → month picker.
2. *Target score* — slider/stepper 400–1600 (default 1200 or last score + 150, rounded).
3. *Where are you starting?* Take a short diagnostic (24 questions, ~30 min) · I have a past SAT/PSAT score (total, optional sections, source) · Skip.
4. *Which days will you practise?* presets Every day / Weekdays / Weekends / Once a week (pick day) / Custom (toggle days).
5. *How long per session?* 15 / 30 / 45 / 60 min.

A live preview line under the form: "43 days to go · 6 full practice exams · 5 sessions a week of ~15 questions".

**Flow** — the onboarding submit (`/api/portal/onboarding`) returns a `next` URL; when SAT is enabled and no SAT profile exists, `next = /portal/sat-lab/setup`, so setup feels like the last onboarding step. The SAT Lab pages redirect to setup while no profile exists (the rest of the portal is not blocked). Settings are editable at `/portal/sat-lab/settings` (same component); every change is appended to `changes` and triggers plan regeneration (§6.5).

API: `GET/PUT /api/sat/profile` (student-own; zod-validated; plain-sentence errors via the shared `invalidRequest`).

**Diagnostic** — a drill of kind `"diagnostic"`: 24 questions = 3 from each of the 8 domains, difficulty mix Easy/Medium/Hard = 1/1/1 per domain, drawn from the bank. Created when the student chooses it; it is the plan's first item (today).

## 6. Planner (sub-project 3)

### 6.1 Model

`portal-data/sat/plan/<uid>.json`:

```ts
interface SATPlan { version: 1; generatedAt: string; inputsKey: string; items: PlanItem[] }
interface PlanItem {
  id: string;                        // stable
  date: string;                      // "YYYY-MM-DD" PKT
  kind: "diagnostic" | "challenge" | "mock" | "review" | "exam";
  status: "scheduled" | "done" | "late" | "missed";
  mock?: { kind: "adaptive" } | { kind: "practice"; testNo: number };
  size?: number;                     // questions, for challenge/review/diagnostic
  sessionId?: string;                // the drill/sitting that fulfils it
  moves?: { from: string; to: string; at: string }[];   // mocks only, ≤ 2
  completedAt?: string;
}
```

### 6.2 Challenges

- On every practice day (profile `days`) from today to the day before the exam, except days that already hold a full exam, and never on the exam day.
- Size from minutes: 15 → 8, 30 → 15, 45 → 22, 60 → 30 questions.
- **Content is chosen when the student starts it**, from the latest analytics, so it always targets current weaknesses: ≈60% from the 3 weakest skills (rotating), ≈25% spaced review (skills not practised for ≥7 days, and questions answered wrong ≥7 days ago — re-asked once, "mistake review"), ≈15% stretch (one difficulty step above the student's comfortable level on an improving skill). Prefer questions never seen; never a question answered correctly in the last 30 days. With no data yet: balanced across domains, medium difficulty.
- Excludes questions of the student's running sittings (existing rule).
- A started challenge is a drill doc with `planItemId`; done when every question is checked; status `done` if finished on its date (PKT), `late` if later; `missed` once its date has passed unfinished.

### 6.3 Full exams — "steady build-up"

Let *d* = days from today to the exam.
- *d* > 56: one every 14 days. 21 < *d* ≤ 56: one every 7 days. 7 ≤ *d* ≤ 21: one every 7 days, the last about 5 days before the exam. 3 ≤ *d* < 7: exactly one, at least 2 days before the exam. *d* < 3: none — `review` items instead (a short mixed review of the weakest skills, size = the challenge size) and test-day tips.
- The last full exam aims for about 5 days before the exam in every band of 7 days or more; earlier ones are spaced backwards from it. **Light schedules:** when the student practises on fewer than 3 days a week, full exams are never closer than 14 days apart (otherwise every session in the final weeks would be a full exam).
- Day choice: prefer the student's practice days, weekend first; never the exam day or the day before.
- Alternation: official practice tests in order (untaken first, 4 → 11), alternating with the adaptive mock; once all 8 are taken, adaptive mocks.
- Started from the plan → a sitting with `planItemId`; `done`/`late` by the date it finished; a `missed` full exam is rescheduled automatically by the planner to the next suitable day (the planner may do what the student may not).

**Settled by the planner's review rounds (2026-09-26):** on light schedules a student's own full exams are never closer than 14 days, including after edits (a new exam is dropped when a kept exam lies within 13 days); a schedule edit keeps unmoved, unstarted full exams dated today or tomorrow; a full exam's first moved-from day (the planner's grid day) blocks new exams within 3 days, later moved-from days (days the student picked) and a first moved-from day that is today or tomorrow block with the kept-exam window; a missed exam that was started is never replaced; the 14-day light rule wins over a final-week exam when both can't hold.

### 6.4 Moving a full exam (student)

`POST /api/sat/plan/move { itemId, date }` — only `kind: "mock"`, `status: "scheduled"`, fewer than 2 `moves`, `date` ≥ today (PKT), `date` ≤ exam − 2 days, no other full exam on `date`. The challenge on the target day (if any) stays — challenges are never removed. The old day gets nothing new. Plain-sentence errors for each rule.

### 6.5 Generation and freshness

`ensureSatPlan(uid, today)` (idempotent, like `ensureStudyPlan`): a **full rebuild** happens only on the first build and when profile fields change — exam date, target month (only when the horizon moves) or practice days re-plan future full exams ("schedule"); minutes only resize challenges ("sizes"); other fields change nothing (`inputsKey` = the profile fields; challenge content is chosen at start, so no weekly rebuild is needed). Past items are frozen; future mocks are kept where still valid (moved ones included), and a new full-exam target is skipped when a kept/done/late/moved full exam or a moved-from day lies within 3 days of it, or — for the final-week target — when a full exam already lies within the cadence gap. A **daily maintenance** step marks statuses, re-places each newly missed full exam once on the next suitable day (practice day, ≥ tomorrow, ≤ exam − 2, no other full exam that day, ≥ 4 days from other full exams), and re-validates future practice exams against the tests already taken. Runs on the SAT Lab visit (`GET /api/sat/coach`) and in the existing 06:00 PKT daily cron for SAT students, which also sends the in-app/push notification "Today's SAT challenge is ready" on days with an item. When the exam date passes, the plan ends and the SAT Lab asks for the result and/or a next date.

## 7. Analytics (sub-project 2)

### 7.1 Per-question timing

The runner and the drill track visible, active time per question (`visibilitychange`-aware) and send `timeMs: Record<questionId, number>` with each save/check; the server merges by max, capped at the module's minutes. Stored on the doc (`timeMs`). Old docs without it simply have no pacing data.

### 7.2 Engine

`src/lib/sat/analytics.ts` (pure, Node-testable) over a list of finished items `{ qid, section, domain|null, skill|null, difficulty|null, correct, at, timeMs?, source }` plus sitting scores:

- **Mastery per skill and domain**: recency-weighted accuracy (half-life 14 days) with a Beta(2,2) prior, so 1/1 is not 100%; `confidence` = effective sample size; `trend` = last 14 days vs the 14 before.
- **By section and difficulty**: accuracy and counts.
- **Pacing**: median seconds per question by section and difficulty vs the real exam's pace (R&W 71 s, Math 95 s per question); flags skills where time is high and accuracy low.
- **Weak skills**: ranked by (1 − mastery) × the domain's weight on the real test (R&W: Information and Ideas 26%, Craft and Structure 28%, Expression of Ideas 20%, Standard English Conventions 26%; Math: Algebra 35%, Advanced Math 35%, Problem-Solving and Data Analysis 15%, Geometry and Trigonometry 15%) × a confidence factor; skills with fewer than 3 attempts are listed separately as "not enough data yet".
- **Scores**: the latest official practice range and the latest adaptive estimate, with dates, and their history (no new score model).
- **Adherence**: challenges done/late/missed this week and overall, current streak.
- Practice-test questions (no College Board skill labels) count toward section accuracy, scores and pacing, not skill mastery.

### 7.3 Loading and caching

`src/lib/sat/analytics-data.ts` (server-only): lists the student's summaries, loads each doc (bounded concurrency), joins the bank index, builds the item list (finished items only), computes, and caches `portal-data/sat/analytics/<uid>.json` keyed by a fingerprint of the summaries (ids + finishedAt + drill checked counts). Recomputed only when the fingerprint changes.

### 7.4 Surfaces

- `GET /api/sat/coach` — one call for the SAT Lab home: profile, today's items, next 14 days, countdown, analytics summary, insights (§8.2), goals (§8.3). One round trip instead of several.
- `GET /api/sat/analytics` — the full analytics for the Progress page.
- **SAT Lab home** (student): *Today* card (today's challenge/exam with Start; missed/late badges; streak), *Your plan* (next 14 days + countdown to the SAT; move control on full exams), *Coach says* (insights + goals with progress bars), then the existing sections (mock, practice tests, custom drills, history).
- **Progress page** `/portal/sat-lab/progress`: score history, section accuracy, 8-domain mastery grid, weakest skills with "Drill this", pacing, trend. Charts follow the repo's dataviz guidance; sparse.

## 8. AI layer (sub-project 4)

### 8.1 Adapter

`src/lib/ai/llm.ts` (server-only), plain `fetch`:

```ts
complete({ system, messages, json: true, images?, maxTokens, temperature, purpose }) → { ok, json?, text?, provider, model, usage } | { ok: false, reason }
```

- Providers: `gemini` (generativelanguage.googleapis.com, `responseMimeType: application/json`, `inline_data` images; model from the repo's existing `GEMINI_MODEL` convention) and `groq` (`https://api.groq.com/openai/v1/chat/completions`, `response_format: json_object`, `image_url` data URIs; `GROQ_MODEL` default `qwen/qwen3.8-27b`, which accepts images; `GROQ_FALLBACK_MODEL` default `openai/gpt-oss-20b`, text-only).
- Selection: `SAT_AI_PROVIDER` (`gemini` | `groq`), else Gemini when `GEMINI_API_KEY` is set, else Groq when `GROQ_API_KEY` is set, else none → deterministic fallbacks everywhere.
- 20 s timeout; one retry with back-off on 429/503, then the fallback model, then `ok: false`. JSON validated with zod; invalid → `ok: false`.
- Budgets: per-student per-day counters `portal-data/sat/ai-usage/<uid>/<date>.json` (tutor ≤ 40, insights ≤ 6) and a best-effort global daily counter (`SAT_AI_DAILY_BUDGET`, default 800 requests) so the Groq free tier is never exhausted; over budget → deterministic text. Context kept under ~3,000 tokens per call.

### 8.2 Insights ("Coach says")

Input: compact analytics (top/bottom skills with mastery and confidence, section accuracy, pacing flags, adherence), plan status (days to exam, next full exam, this week's done/missed), profile (target, starting point). Output (validated JSON): `{ headline, summary /* ≤ 2 sentences */, tips: [{ title, body, skill? }] (≤ 3) }`. Cached in `portal-data/sat/insights/<uid>.json` with an inputs fingerprint + PKT date; regenerated on visit only when the fingerprint changes. Deterministic fallback builds the same shape from analytics (weakest skill, pacing flag, adherence).

### 8.3 Goals (deterministic)

Weekly goals computed by rules and tracked automatically: complete this week's challenges (x/y); raise the weakest high-weight skill's mastery by ~7 points; the week's full exam (if scheduled); a pacing goal when a pacing flag exists; the target-score gap shown against the latest score. The AI may phrase a one-line motivation per goal; the goal, metric and progress are computed, never generated.

### 8.4 Digital SAT Tutor

- `POST /api/sat/tutor { message, explainQuestionId? }` → `{ reply, actions[], remaining }`; `GET /api/sat/tutor` → history + remaining. `POST /api/sat/tutor/action { id }` executes a proposed action.
- **Pause**: refused while a timed module is running or on break (§3, rule 2).
- **Prompt**: a compact SAT knowledge pack (`src/lib/sat/coach/knowledge.ts`: format, timing, adaptive modules, scoring and ranges, the 8 domains and their skills with one-line descriptions, question types, strategies, Desmos and reference sheet on the real test, test-day logistics) + the student context (profile, analytics summary, next 7 days, latest insights) + rules (coach, hint-first for questions the student pastes; never invent official scores; SAT and study topics only; reply JSON `{ reply, actions }`).
- **Memory**: `portal-data/sat/tutor/<uid>.json` — the last 40 messages and a rolling summary of older turns (compacted by the model when history exceeds 20 turns); each call sends the summary + the last 8 turns.
- **Actions** (validated server-side; rendered as buttons; executed only when tapped):
  - `create_drill { section?, domain?, skill?, difficulty?, count 5–30 }` → the existing drill creation with the shared filter schema → "Start drill" link.
  - `move_mock { itemId, date }` → the §6.4 rules; tap = the move.
  - `open { href }` → only `/portal/sat-lab/...` paths.
- **Explain my mistake**: "Explain" buttons on wrong answers in score reports, drill review and the Progress page open the tutor with `explainQuestionId`; the server checks the question is finished by this student, downloads the question image and the rationale image from the bucket (service role) and sends them with the official answer and the student's answer. The reply explains the idea, the student's likely misstep and a transferable tip, then offers `create_drill` on that skill.
- **Limit**: 40 messages per student per day (PKT), shown as "n left today".
- **UI**: `/portal/sat-lab/tutor` page + an "Ask the tutor" entry on the home; message list, suggested prompts ("What should I work on this week?", "Explain my last wrong answer", "Make me a 10-question drill on my weakest skill"), action buttons, typing indicator (non-streaming).

## 9. Parent weekly report (sub-project 5)

- `weekly-reports.ts` becomes section-based: for each student, one email with a section per subject they have (Physics section = today's content, unchanged; SAT section new). Students with SAT but no physics now receive a report.
- **SAT section** (`src/lib/sat/coach/parent-report.ts`), top to bottom:
  1. *Warning* (red, only when every challenge scheduled that week was missed): "⚠ <Name> missed all <n> SAT practice sessions this week." Amber note for partial misses: "<Name> missed 2 of 5 sessions."
  2. *This week* metric tiles: sessions done/scheduled, questions answered, accuracy (± vs last week), time practised, full exam (score or "missed" or "none this week"), streak.
  3. *In two lines*: AI summary for parents (fallback deterministic).
  4. *Progress so far*: days to the SAT and target; score history (official/estimated ranges with dates); section accuracy bars; strongest and weakest area.
- HTML email, table-based with inline styles, mobile-friendly, small CSS bar charts; plain-text alternative. Guardians from the onboarding doc (as today). Sent via `sendMail` with the existing checkpointing.
- Admin preview: `GET /api/portal/admin/parent-report-preview?uid=` renders the HTML without sending (admin-only), for testing.

## 10. Files (new unless noted)

- `src/lib/portal/subjects.ts`, `src/lib/portal/subject-grants.ts`; modified `course-access.ts`, `course-labels.ts`, admin user detail/console + routes, onboarding route (`next`).
- `src/lib/sat/coach/`: `profile.ts` (types, validation, store), `planner.ts` (pure), `plan-store.ts`, `challenge-builder.ts` (pure question selection), `goals.ts` (pure), `insights.ts`, `tutor.ts`, `knowledge.ts`, `parent-report.ts`; `src/lib/sat/analytics.ts` (pure), `src/lib/sat/analytics-data.ts`; `src/lib/ai/llm.ts`, `src/lib/ai/usage.ts`.
- Routes: `src/app/api/sat/{profile,coach,analytics,plan/move,tutor,tutor/action}/route.ts`; `src/app/api/portal/admin/users/[id]/subjects/route.ts`; `src/app/api/portal/admin/parent-report-preview/route.ts`; modified `src/app/api/cron/daily-study-plans/route.ts`, `src/lib/portal/weekly-reports.ts`.
- Pages/components: `src/app/portal/(app)/sat-lab/{setup,settings,progress,tutor}/page.tsx`; `src/components/sat/coach/*`; modified hub, runner, drill (timing + Explain entry points), score report (Explain).
- Tests: `scripts/test-sat-coach-*.mjs` wired into `npm run test:sat`.

## 11. Error handling

- Every storage read fails closed; routes answer 503 with a plain sentence.
- AI failure → deterministic text, never an error screen; the tutor says "I can't reach my brain right now — try again in a minute" and does not count the message.
- Plan generation failure → the SAT Lab still shows sittings, drills and history; the plan card shows "Your plan couldn't be loaded — retry".
- Mail not configured → messages queue (existing behaviour).

## 12. Testing

- Node tests (pure modules): planner (fixed dates across every cadence band, practice-day patterns, mock alternation, exam-day exclusions, missed → auto-reschedule, regeneration keeps past items), move rules, challenge builder composition, analytics math (prior, half-life, trend, pacing, weighting), goals, warning rule, subjects/access resolution (grant + class + physics default), LLM adapter (mocked fetch: JSON parsing, retry, fallback model, budget), tutor action validation and pause rule, parent report rendering (warning/partial/none).
- Live AI smoke test against Groq (one insights call, one tutor call, one image explanation) — manual script, not in CI.
- Browser pass with the QA accounts (SAT setup, home, plan move, tutor, progress, Explain), 360 px layout; production build + bundle grep for answer-key markers.

## 13. Out of scope (this round)

Public self-sign-up; payments; streaming tutor replies; voice; SAT data in SQL tables; teacher dashboards for coach data (the existing staff results page is unchanged); push to parents (email only).
