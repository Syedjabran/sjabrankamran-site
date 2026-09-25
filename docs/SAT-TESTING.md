# Testing the SAT Lab — owner's guide

This is a plain-language walkthrough for testing the SAT module before it goes live. It
assumes no coding background. If a step doesn't behave the way this guide says, that's
worth flagging before launch.

## 1. What exists

The SAT module has two parts:

**The SAT Lab**, inside the student portal (`/portal/sat-lab`). A student who has access
sees:

- **Adaptive mock exams** — a full Reading & Writing or Math section, built to the digital
  SAT's own timing and question counts. The second half adapts to how the student did on
  the first half, the same way the real digital SAT does. Because College Board has never
  published the real scoring table for this format, these mocks are always scored as an
  **estimate**, and the app says so on the results page.
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
§6), so this variable is **no longer needed** — leave it unset. If it's still set to `1`
in your `.env.local` from earlier testing, images will keep loading from the local
pipeline output on disk instead of the real production files; unset it (or set it to `0`)
to see what a live visitor actually sees.

Signed out, `/portal/sat-lab` redirects to the login page; signed in with access, it loads
the SAT Lab. The public `/sat` page loads for anyone, signed in or not.

## 3. Give a student access

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
coordinator, facilitator, or admin already sees **SAT Lab** and **SAT results** in their
own menu, under Administration — that doesn't depend on being enrolled in anything.
Enrolment is what decides *whose* SAT work a teacher can actually see and assign: a
teacher only sees the students in the SAT-track classes they're themselves enrolled in
(so enrol a teacher in the same class as the student, the same way you enrolled the
student above, if you want that teacher to see this student's results). An admin sees
every SAT student regardless of their own enrolment.

## 4. A 10-minute test script

Run through these as the enrolled test student (and once as staff for the results view):

1. **Drill** — start a drill, answer a question, check that its rationale (answer
   explanation) shows. Reload the page: your first answer should still be there.
2. **Adaptive mock** — start one, answer a few questions, then reload the page: your
   answers and the countdown clock should both have survived the reload. Try submitting a
   module with a question left blank — you should see a confirmation message before it
   actually submits ("N questions are unanswered. Submit this module anyway?"). On the
   score report afterwards, look for the routing disclosure — a note explaining that this
   site's Module 2 routing is an approximation, not College Board's real (unpublished)
   algorithm.
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

## 5. Run the automated checks

From the project's root folder, in order:

1. `npm run test:sat` — runs 9 test suites covering the question bank, adaptive form
   assembly, scoring, access rules, grading, sessions, serving, the runner, and
   assignments. All passed on this checkout.
2. `npm run test:portal` — general portal rules. Passed.
3. `npm run test:access` — access-control rules. Passed.
4. `python -m pytest scripts/exam-lab/ingest-sat/tests -q` — the question-bank pipeline's
   own tests (232 tests). Passed.
5. `npm run build` — a full production build. **Don't run this yourself** while a dev
   server is running from this same checkout; it can break the running server. Whoever
   does the final review runs this separately.

If any of the first four fail, something has regressed since this guide was written and
is worth investigating before testing further by hand.

## 6. Before this goes live

What's actually left, as of this guide:

- **Nothing has been pushed or merged yet.** All of this work is on the `feat/sat-module`
  branch. Merging is the owner's call, once testing above looks good.
- **Check your Supabase storage plan.** The `exam-assets` bucket now holds the
  question-bank images, the 8 official practice tests, and the worked-answer
  (rationale) images, all uploaded — roughly 1.55 GB in total. That's over the Supabase
  Free plan's 1 GB limit — check what plan the project is on and upgrade if needed, or
  storage could start rejecting uploads.
- **The database migration `supabase/migrations/sat-001-sat-lab.sql` is written but not
  yet applied.** Until it is, SAT Lab attempts ("sittings") are stored as files in the
  `portal-data` storage bucket rather than in dedicated database tables. This works fine
  for testing; applying the migration is a separate step for later.
- **Delete the QA test accounts and their data after you finish testing:**
  `qa-student-sat@example.com`, `qa-teacher@example.com`, and the classes `qa-sat` and
  `qa-a1-physics` in the school "QA Test School". Don't leave test accounts in production.
- **Rotate the Supabase service-role key afterwards**, since it will have been used
  outside its normal deployment context during testing.
- No sample-crop sign-off step remains — the question images were reviewed and signed off
  on 2026-09-25.

**If you need to undo the upload:** delete everything under the `sat/` prefix inside the
`exam-assets` bucket. Nothing outside that prefix is touched by any of this work.
