# Testing the SAT Lab — owner's guide

This is a plain-language walkthrough for testing the SAT module before it goes live. It
assumes no coding background. If a step doesn't behave the way this guide says, that's
worth flagging before launch.

**What's new in this update:** the SAT Lab now comes with a coach on top — a student with
Digital SAT switched on gets their own exam-date-driven plan, daily challenges, progress
tracking, an AI tutor and a parent email section, with no teacher involved. New sections
below cover turning SAT on for a student, SAT setup, the plan, progress and "Coach says",
the tutor, the parent email and the AI keys; the rest of this guide (what exists, running
it locally, the original class-based access path, the 10-minute test script, the automated
checks and the pre-launch checklist) is carried over, with the last two updated for the
new features.

## 1. What exists

The SAT module has two parts:

**The SAT Lab**, inside the student portal (`/portal/sat-lab`). A student who has access
sees:

- **Adaptive mock exams** — a whole digital SAT: both sections, Reading and Writing and then
  Math, each in two timed modules (four modules, 98 questions), with a 10-minute break
  between the sections, built to the digital SAT's own timing and question counts. The
  second module of each section adapts to how the student did on its first module, the
  same way the real digital SAT does. Because College Board has never published the real
  scoring table for this format, these mocks are always scored as an **estimate**, and the
  app says so on the results page.
- **The 8 official College Board paper practice tests** (Tests 4–11). These use the
  timing printed on that paper (longer than the digital SAT's own timing) and are scored
  against College Board's own official conversion table for that specific test, so these
  scores are labelled **official**, not estimated.
- **Drills** — practice on a single topic ("domain"), skill, or difficulty level, pulled
  from the full question bank, each with its own answer explanation ("rationale").
- **Score reports** after every mock or practice test, and **assignments** — a teacher can
  assign a specific drill or test to a student or a whole class.
- **Staff results** — teachers and admins can see their students' SAT Lab activity and
  scores for the classes they're scoped to.

**The public `/sat` pages** (`/sat`, `/sat/digital-sat`, `/sat/reading-and-writing`,
`/sat/math`) are informational pages, open to anyone, describing the digital SAT's format
and what the SAT Lab offers. They don't require signing in.

**"Estimated" vs "official," in one line:** an adaptive mock's score is this site's best
guess, clearly labelled as one; a practice test's score is calculated the same way College
Board itself would score that exact paper.

## 2. Run it locally

1. Make sure `.env.local` has these three variables set, pointing at the site's production
   Supabase project (not a test project): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. `npm install`
3. `npm run dev -- -p 3005`
4. Open `http://localhost:3005/portal/sat-lab` and sign in.

A note on a fourth variable, `SAT_LOCAL_CROPS`: this was a workaround used while the
question and answer images had not been uploaded yet — it told the site to read images off
a developer's own disk instead of Supabase. The images are now uploaded to production (see
§13), so this variable is **no longer needed** — leave it unset. If it's still set to `1`
in your `.env.local` from earlier testing, images will keep loading from the local
pipeline output on disk instead of the real production files; unset it (or set it to `0`)
to see what a live visitor actually sees.

Signed out, `/portal/sat-lab` redirects to the login page; signed in with access, it loads
the SAT Lab. The public `/sat` page loads for anyone, signed in or not.

## 3. Turn SAT on for a student

This is the normal way to give a student the SAT Coach today — simpler than the
class-based method in the next section, and the one that also switches on their plan,
progress and tutor.

**For an existing student:**

1. Go to **Admin → Users & activity** and open the student's profile.
2. Find the **Subjects** card, near the top of the page (it only shows for accounts with
   the student role).
3. Physics is shown there too, but read-only — it says "From class: `<class name>`" when
   the student is enrolled in a physics class, or "Not in a physics class — use Enrolments
   below" when not; physics is still switched on and off purely by class enrolment, further
   down the page.
4. Next to **Digital SAT**, click the switch. It turns cyan and shows "On" once saved (a
   couple of seconds; it says "Saving…" in between). Click it again to turn SAT back off —
   this removes the student's access, but keeps anything they already did.

**For a brand-new student:** on the **Create account** form (**Admin → Users & activity →
Create account**), tick the **Digital SAT** checkbox before clicking **Create account**. It
sits just under the class dropdown, and only appears when the **Student** role is selected.

Either way, the student sees **SAT Lab** appear in their portal menu, and the next time they
open it (or finish onboarding, if they're brand-new) they're taken straight to the SAT setup
page — see §6 below.

## 4. Give a student access (the class-based way)

This older method still works — it's unchanged, and it's still how Physics access works —
but for SAT specifically, the Subjects switch above is the simpler path; use this one only
if you'd rather manage SAT the same way as a physics class.

The SAT Lab uses the same "which class is the student in" system as the rest of the
portal — there's no separate SAT toggle.

1. Go to **Admin → Academics**.
2. In the **Classes** section, create a class where the **Year** field contains the word
   `SAT` — for example, `SAT 2026`. (Fill in a class name, a school, and a year; section
   and subject are optional.) Click **Create class**.
3. Go to **Admin → Users & activity** and open the student's profile.
4. In the **Enrolments (schools & classes)** panel, pick the class you just created from
   the **"Add to class…"** dropdown and click **Enrol**.

The student will now see **SAT Lab** in their portal menu, alongside their other learning
links.

Staff menu access and student-data access are two different things. Any teacher,
coordinator, facilitator, admin, or super admin already sees **SAT Lab** and **SAT results**
in their own menu, under Administration — that doesn't depend on being enrolled in anything.
Enrolment is what decides *whose* SAT work a teacher can actually see and assign: a
teacher only sees the students in the SAT-track classes they're themselves enrolled in
(so enrol a teacher in the same class as the student, the same way you enrolled the
student above, if you want that teacher to see this student's results). An admin or super
admin sees every student in an SAT-track class regardless of their own enrolment.

**Important — SAT results only list SAT-class members.** A student who got SAT through
the **Subjects** switch (§3) and is not in any SAT-year class does **not** appear in
**SAT results** or the assign panel, for anyone — admins included. Their SAT Coach (plan,
progress, tutor, parent email) works normally; the staff results page just doesn't cover
coach-only students (by design for this round). To see such a student's SAT work there,
also enrol them in an SAT-year class as above.

## 5. A 10-minute test script

Run through these as the enrolled test student (and once as staff for the results view):

1. **Drill** — start a drill, answer a question, check that its rationale (answer
   explanation) shows. Reload the page: your first answer should still be there.
2. **Adaptive mock** — start one, answer a few questions, then reload the page: your
   answers and the countdown clock should both have survived the reload. Try submitting a
   module with a question left blank — you should see a confirmation message before it
   actually submits ("N questions are unanswered. Submit this module anyway?"). On the
   score report afterwards, look for the routing disclosure — a note explaining that this
   site's Module 2 routing is an approximation, not College Board's real (unpublished)
   algorithm. When you reach Math (on the break screen, and on both Math modules), check
   the note that the real digital SAT has a built-in Desmos graphing calculator and a
   reference sheet, which this practice module doesn't include yet — students use their
   own approved calculator and reference sheet.
3. **Grid-in (fill-in-the-blank) answers** — in a Math question with a typed-answer box,
   try typing `1 1/2`. The box doesn't accept spaces, so it's graded as if you'd typed
   `11/2`, and you'll see a warning:
   > Mixed numbers aren't allowed — “1 1/2” is read as 11/2. Enter 3/2 or 1.5.

   (The real digital SAT's own answer box does the same thing — this isn't a bug, it's
   matching how the exam works.) Separately, try typing `.6667` for an answer of 2/3 —
   that should be accepted, since it fills the whole answer box the way College Board's
   own rules allow.
4. **A practice test's timing** — start one of the 8 official practice tests and check the
   Reading & Writing module's clock starts at 39 minutes (not the mock exam's 32 minutes)
   — this is the paper's own printed timing, not the digital SAT's shorter timing.
5. **Phone width** — shrink your browser window (or use your phone) and check the SAT Lab
   pages stay usable — no cut-off text or buttons you can't reach.

## 6. SAT setup

The first time SAT is switched on for a student — right after they finish onboarding, or
on their next SAT Lab visit if it's switched on later — they land on a short setup page
before anything else (`/portal/sat-lab/setup`). It's five short blocks with sensible
defaults already filled in:

1. **When is your SAT?** Choose **I've booked it** and pick a date (must be tomorrow or
   later, and no more than 18 months out), or **Not booked yet** and pick a target month
   instead.
2. **Target score** — a slider/stepper from 400 to 1600, in steps of 10 (starts at 1200).
3. **Where are you starting?** Three choices: **Take a short diagnostic** (24 questions,
   about 30 minutes), **I have a past SAT or PSAT score** (enter the total, and optionally
   the Reading & Writing and Math sections and the date), or **Skip for now**. Entering a
   past score also nudges the target score to roughly that score plus 150, until the
   student touches the target themselves.
4. **Which days will you practise?** Presets — Every day / Weekdays / Weekends / Once a
   week / Custom (tick your own days).
5. **How long per session?** 15, 30, 45 or 60 minutes.

A live preview line appears under the form once days are picked (something like "43 days
to go · 6 full practice exams · 5 sessions a week of ~15 questions"). The full-exam count
is the planner's own count for a plan built today; it's left out when there would be none
(no date yet, or 2 days or fewer to go). Saving either starts the diagnostic (if that was
chosen) or opens the SAT Lab.

**To change any of this later:** SAT Lab → **Settings** (`/portal/sat-lab/settings` — same
form, same five blocks). A note under the form warns that changing the date or the practice
days rebuilds the future plan; anything already done is kept. If a save is refused, the
reason shows next to the **Save changes** button as well as in its block (so on a phone you
see it without scrolling back up).

## 7. The plan

Once setup is saved, the SAT Lab home shows two cards, refreshed automatically each visit:

**Today** — what's due today: a daily challenge, the diagnostic, a review session or a full
exam, with a **Start** or **Resume** button, a streak count ("N sessions done on the day, in
a row") and the days-to-your-SAT (or days-to-target-month) countdown.

**Your plan** — the next 14 days, grouped by day, plus any full exams further out.

A few rules worth checking by hand:

- **Daily challenges** land on the student's chosen practice days. They're fixed — there is
  no Move button on a challenge, only on a full exam.
- **Full exams** (an adaptive mock or one of the 8 official practice tests, alternating)
  land on their own days. A full exam shows a **Move** button with a note ("moves left: 2",
  counting down as it's used). Clicking it opens an inline date picker: the new date must be
  today or later, at least 2 days before the SAT, and not a day that already has another
  full exam — the picker enforces this (`min`/`max` on the date field) and repeats the rule
  in a line underneath; the server checks the same rule again. Each full exam can be moved
  **at most twice**.
- **Status badges** — a finished item shows **Done** or **Done late** (finished after its
  own date); an unfinished item whose date has passed shows **Missed**, with a note that you
  can still do it late (it still counts as practice, but still counts as a miss for the
  weekly parent-email warning).
- **Passed the exam date without a result?** The plan cards are replaced by a card headed
  "Your SAT date has passed — how did it go?", with **Add your score** and **Set a new
  date** links (both open Settings, scrolled to the right block). In Settings the passed
  date can stay as it is while the student enters their score (block 3, "I have a past SAT
  or PSAT score") or changes the target, days or minutes — **Save changes** works. Only a
  date the student *changes* has to be tomorrow or later (a new target month: next month
  or later), so setting the next SAT date works too, and picking another past date is
  refused with "Your SAT date must be after today." The same holds on exam day itself.
- **Not booked yet, and the target month has started?** From the second day of that month
  the card reads "Your target month is here — book your SAT date or pick a new month.",
  with one link to the date block in Settings. The started month stays selected there (it
  isn't blank), so other settings still save while it's kept; a *new* month must be next
  month or later.
- **Reminders** — each morning at 06:15 Pakistan time, a student with SAT work due today
  gets one in-portal notification ("Today's SAT challenge is ready", or the full exam /
  diagnostic / review). SAT notifications show a graduation-cap icon and appear under the
  **Reminders** filter on the Notifications page.

## 8. Progress and Coach says

**Coach says**, on the SAT Lab home, is a short card: a one-line headline, a two-sentence
summary, and up to three tips (each with a **Drill this** button when it names a specific
skill). A small badge in the corner reads **AI** or **Coach** — "AI" means an AI provider
wrote this text; "Coach" means the rule-based fallback did (see §11). It only regenerates
when something actually changed (new finished work, a plan change, or a new day) — reloading
the page a second time in the same state shouldn't visibly change it.

Coach says never states a score it wasn't given: an AI reply that mentions a score-sized
number (200 or more) or a "points" figure that isn't in the student's own numbers (the
target, the latest score range, days to go…) is thrown away and the rule-based view shows
instead.

**This week's goals**, just above Coach says, is fully rule-based (no AI text at all):
each goal has a title, a progress bar and a detail line — e.g. this week's challenges
done, raising the weakest important skill's mastery, this week's full exam (if a missed
exam was moved to later in the week, the goal shows the new day), a pacing goal (only
when pacing is flagged), and the target score. The score goal shows the real latest range
with its label — e.g. "Latest: 1000–1100 (estimated) · target 1200" (or "official range")
— never a single made-up number; its title gives the gap as a range ("Reach your 1200
target — 100–200 points to go"), or says the range already reaches the target. Its bar
runs from 400 to the target, solid to the bottom of the range and lighter across it (the
same bar as in the parent email), with no percentage next to it.

**Progress page** (`/portal/sat-lab/progress`, linked from the SAT Lab; before SAT setup
it sends the student to setup, like the home): questions answered — blanks left in a
submitted module don't count as answered, though they still count as wrong in the accuracy
— and 7-day accuracy; **Scores** (latest official practice-test range, latest adaptive-mock
estimate, and score history — only real scores, nothing invented); **Accuracy by section**;
**Mastery by domain** (all 8 official SAT domains, recency-weighted — a couple of lucky
answers won't read as 100%); **Weakest skills** with a **Drill this** button on each, and a
separate list of skills with "not enough data yet" (fewer than 3 questions); **Pacing**
(median seconds per question against the real exam's own pace — about 71s for Reading &
Writing, 95s for Math — flagging any skill that's both slow and often wrong); and **Recent
mistakes**, each with an **Explain** link straight into the tutor.

## 9. The Digital SAT Tutor

Open it from **Ask the tutor** on the SAT Lab home, or `/portal/sat-lab/tutor` directly.
Things worth trying:

- **Suggested prompts** (shown before your first message): "What should I work on this
  week?", "Explain my last wrong answer", "Make me a 10-question drill on my weakest
  skill", "How should I pace the Math module?".
- **Explain** — on a wrong answer (in a score report, a drill review, or the Progress
  page's Recent mistakes list), tap **Explain** to open the tutor already asking about that
  question. This only works for questions the student has actually finished; it sends the
  tutor the official question image, the worked answer, and the student's own answer, and
  it usually offers a drill button on that skill afterwards (labelled something like "Start
  10-question drill: Geometry").
- **"Make me a drill"** — ask in plain words (e.g. "make me a 10-question drill on
  geometry") and the tutor offers a "Start N-question drill: …" button; tapping it creates
  the drill and opens it.
- **"Move my exam"** — ask the tutor to move a scheduled full exam to a specific date; it
  offers a button labelled "Move … to …" that applies the same move rules as §7 (and the
  server checks them again).
- Every suggested action is a button under the tutor's reply — nothing happens until it's
  tapped, and a button left over from an earlier reply disables itself ("This suggestion
  has expired — ask the tutor again.").

**The 40-messages-a-day limit:** the composer area shows "N of 40 messages left today"
(Pakistan time; resets at midnight PKT). At zero, the message box disables with "No messages
left today — they come back tomorrow." An unanswered or failed turn (including a "brain"
failure, see §11) is not counted against the limit. If the count itself can't be read for
a moment (a storage hiccup), the line says "Couldn't check your messages — try again in a
moment." with a **Check again** link and the message box stays open — it never shows "0
left" or "come back tomorrow" for that.

**Pausing during a timed module:** while an adaptive mock or a practice test's current
module is running (or on the inter-section break), the tutor shows an amber notice — "I'm
paused while your exam is running — submit the module first, then come back." — with a
**Check again** button, and the message box is disabled. This doesn't use up a message.

## 10. Parent email

The existing Saturday parent-progress email now has a **section per subject** the student
has — a student with SAT but no Physics now gets an email too. The SAT section, top to
bottom: a warning line (only shown when every session scheduled that week was missed, in
red; a softer amber note for a partial miss); this week's numbers (sessions done/scheduled,
questions answered — blanks don't count as answered — accuracy versus last week, time
practised, this week's full exam result or "missed"/"none this week", and the streak); a
two-line AI summary (or its rule-based fallback); and a short "progress so far" block (days
to the SAT and the target, score history, section accuracy, strongest and weakest area).

**When it's sent:** once, Saturday 18:00 Pakistan time (cron `0 13 * * 6`). A run that
reaches its time limit stops taking new students and reports `partial` with how many are
left; those are only sent if the run is started again by hand within the same hour (the
route refuses outside Saturday 18:00–18:59 PKT). The run records every family it has
finished and skips them on a re-run.

**To preview it without sending anything** (admin only, while signed in as an admin), open:

```
/api/portal/admin/parent-report-preview?uid=<student id>
```

It never sends mail and never changes the student's plan. It answers with JSON, not a
rendered page: `{ "html": …, "text": …, "week": … }` — `html` is the SAT section as a
SAT-only family would get it this week (paste it into an `.html` file to view it), `text`
its plain-text version, and `week` the numbers behind it. The Physics part is left out.
Add `&ai=1` to have the AI write the two-line summary — that spends one of the student's
two daily "parent" AI calls; without it the preview shows the rule-based summary and costs
nothing.

## 11. AI keys

The coach's AI-written text — Coach says' headline/summary/tips, the two-line parent
summary, and the tutor's replies — comes from one of two providers, chosen with:

- `SAT_AI_PROVIDER` — `gemini` or `groq`. Leave unset and it picks Gemini when
  `GEMINI_API_KEY` is set, else Groq when `GROQ_API_KEY` is set, else no provider at all.
- `GEMINI_API_KEY` — the production provider (the same key used by the Physics tutor).
- `GEMINI_MODEL` — which Gemini model; the slow "thinking" aliases `gemini-flash-latest`
  and `gemini-pro-latest` are ignored in favour of `gemini-3.1-flash-lite` (the default).
- `GROQ_API_KEY` — the testing provider. Groq's free tier is roughly 1,000 requests a day
  and 8,000 tokens a minute, so it's meant for trying things out, not for production load.
- `GROQ_MODEL` / `GROQ_FALLBACK_MODEL` — optional overrides for which Groq model answers
  first, and which one is tried once if that model fails twice.
- `SAT_AI_DAILY_BUDGET` — a best-effort cap on requests per day, shared across every
  student, so a single busy day can't burn through the Groq free tier (default 800).

**Without any key configured** (or if the configured provider is down), nothing breaks:
Coach says and the parent email's two-line summary quietly fall back to plain rule-based
text built from the same analytics, and the Digital SAT Tutor answers every message with
"I can't reach my brain right now — try again in a minute." (that reply doesn't use up one
of the day's 40 messages).

**Live check of a provider** (sends the three calls the coach really makes — Coach says,
a tutor turn, and an explanation with a question image — and checks each reply the way the
app does; it reads the keys from `.env.local` and never prints them):

```
node --no-warnings --experimental-strip-types scripts/smoke-sat-ai.mjs gemini
node --no-warnings --experimental-strip-types scripts/smoke-sat-ai.mjs groq
```

Each prints a small table (HTTP status, finish reason, token counts, whether the JSON
parsed and passed validation) and ends with exit code 0 when all three passed. The Groq run
waits 65 seconds between calls (its free tier counts tokens per minute), so it takes a few
minutes; add `--dry` to check the requests build without calling anyone, or `--only=explain`
(or `insights`, `tutor`) for one call. On 2026-09-27 the Gemini run passed all three
(finish reason STOP, no thinking tokens, well under its output limits), and Groq passed
each call — its image call once sent a minute after the others, which is why the run now
waits.

## 12. Run the automated checks

From the project's root folder, in order:

1. `npm run test:sat` — runs 21 test scripts (29 test groups, since several scripts cover
   more than one): the question bank, adaptive form assembly, scoring, access rules
   (including what happens when the access check itself can't be read), the subjects
   registry, grading, sessions, serving (and the session list's size cap), the runner,
   assignments, the SAT profile, the AI adapter (`llm-core`) and the AI budget rules,
   analytics, the planner, the challenge builder and goals, Coach says' insights, the plan
   API and the daily cron's time guard, the tutor, the parent email, and a check that no
   code sent to the browser can reach the answer key. All 29 passed on this checkout.
2. `npm run test:portal` — general portal rules. Passed.
3. `npm run test:access` — access-control rules. Passed.
4. `python -m pytest scripts/exam-lab/ingest-sat/tests -q` — the question-bank pipeline's
   own tests (307 tests). Passed.
5. `node scripts/check-ai-provider-policy.mjs` — checks no disallowed AI provider (only
   Gemini or Groq) is wired in anywhere. Passed ("AI provider policy OK: no Anthropic,
   OpenAI, Moonshot/Kimi, or OpenClaw connection.").
6. `npm run build` — a full production build. **Don't run this yourself** while a dev
   server is running from this same checkout; it can break the running server. Whoever
   does the final review runs this separately.

If any of the first five fail, something has regressed since this guide was written and
is worth investigating before testing further by hand.

## 13. Before this goes live

What's actually left, as of this guide:

- **Nothing has been pushed or merged yet.** All of this work is on the `feat/sat` branch
  (which itself builds on the earlier `feat/sat-module` work). Merging is the owner's call,
  once testing above looks good.
- **Scheduled jobs.** `vercel.json` now runs three: the physics study plans daily at 06:00
  PKT (`/api/cron/daily-study-plans`, unchanged), the SAT plans and reminders daily at
  06:15 PKT (`/api/cron/daily-sat-plans`, new — it stops taking students after 4 of its 5
  minutes and reports `partial`), and the Saturday parent email at 18:00 PKT
  (`/api/cron/saturday-parent-reports`, unchanged). On Vercel's Hobby plan a job may run at
  any minute within its scheduled hour.
- **Check your Supabase storage plan.** The `exam-assets` bucket now holds the
  question-bank images, the 8 official practice tests, and the worked-answer
  (rationale) images, all uploaded — roughly 1.55 GB in total. That's over the Supabase
  Free plan's 1 GB limit — check what plan the project is on and upgrade if needed, or
  storage could start rejecting uploads.
- **The database migration `supabase/migrations/sat-001-sat-lab.sql` is written but not
  yet applied.** Until it is, SAT Lab attempts ("sittings") are stored as files in the
  `portal-data` storage bucket rather than in dedicated database tables. This works fine
  for testing; applying the migration is a separate step for later.
- **Rotate the QA student's password, or delete the QA accounts.** During this round of
  testing, the QA student's password was exposed in a local dev log — treat it as
  compromised. Either set that account a fresh password (**Admin → Users & activity →** the
  student **→ Reset password**) or delete the QA test accounts and their data entirely:
  `qa-student-sat@example.com`, `qa-teacher@example.com`, and the classes `qa-sat` and
  `qa-a1-physics` in the school "QA Test School". Don't leave test accounts in production
  either way.
- **Rotate the Supabase service-role key afterwards**, since it will have been used
  outside its normal deployment context during testing.
- **Set a production `GEMINI_API_KEY`** before launch — see §11. Without it (and without a
  Groq key), the coach still works end to end, but Coach says, the parent email's summary
  and the tutor all run on their plain rule-based fallbacks instead of AI-written text.
- **The parent email sends through the portal's existing mail relay** (`sendMail`, with its
  existing queue and checkpointing) — nothing new to configure there; it's the same path
  the Physics section of the Saturday email already uses.
- No sample-crop sign-off step remains — the question images were reviewed and signed off
  on 2026-09-25.

**If you need to undo the upload:** delete everything under the `sat/` prefix inside the
`exam-assets` bucket. Nothing outside that prefix is touched by any of this work.
