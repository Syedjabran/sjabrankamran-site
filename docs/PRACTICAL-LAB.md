# Practical Lab — owner's guide

The **Practical Lab** is the set of 50 virtual Cambridge 9702 practicals (set up the apparatus,
observe, take your own readings). The pages the student sees live in `public/lab/`; the physics
behind them runs on the server (`src/lib/practical-lab/`). It is a subject an admin switches on per
student, exactly like Digital SAT, and it belongs to **Physics**: later it will appear inside the
Physics space; for now it is an entry in the portal menu.

## Set it up once: `LAB_SECRET`

The lab needs one server setting. In Vercel → the project → **Settings → Environment Variables**,
add `LAB_SECRET` for Production (and Preview if you use it) with a long random value — for example
the output of `openssl rand -hex 32` (at least 32 characters). Redeploy.

- Every student's hidden apparatus values and every lab session are derived from it, so keep it
  private and don't change it casually: a new secret gives every student new apparatus values and
  asks anyone with the lab open to reload.
- **Without it** the lab pages still open, but every practical says "The Practical Lab isn't set up
  on the server yet. Please tell your teacher." (it never runs without its secret).
- On your own computer (`npm run dev`) the lab works without it, using a fixed development secret.

## Turn it on for a student

**Existing student:** **Admin → Users & activity**, open the student, find the **Subjects** card
near the top, and click the switch next to **Practical Lab (Physics)**. It turns cyan and says "On"
once saved. Click it again to turn it off.

**New student:** on the **Create account** form, with the **Student** role selected, tick
**Practical Lab (Physics)** (under the class dropdown, next to Digital SAT).

The student gets a bell notification, "Practical Lab is open for you", which opens the lab.

Things to know:

- The switch is independent of everything else. It doesn't give the student physics (no Exam Lab,
  no timetable), and being in a physics class doesn't give them the lab. A student who should have
  both needs a physics class **and** the switch.
- Staff never need the switch: teachers, coordinators, facilitators, admins and super admins always
  have the lab.
- If the Subjects card says "Couldn't be read just now", the switches are locked until you refresh.
  Nothing is changed.

## What the student sees

**Practical Lab** appears in their portal menu, just under **Exam Lab**. It opens
`/portal/practical-lab`: the lab inside the portal page, as tall as the screen allows, with an
**Open full screen** button that opens the lab on its own (handy on a phone). Staff find it in
their own menu (Administration, or Assigned class for coordinators and facilitators).

A student without the switch doesn't see the menu entry. If they open the page anyway, it says
"Practical Lab isn't switched on for your account yet — ask the admin to add Practical Lab to your
subjects."

Each practical opens in the **lab room**: an empty bench, the equipment tray, the controls, the
instruments, a stopwatch and the student's own notebook. At the bottom, **Source-aligned procedure
and analysis guide** opens the practical's student guide in the page. (The 50 older standalone
practical pages under `/lab/practicals/` have been retired: the lab room covers all 50 practicals,
and those pages carried the physics code in the browser.)

## How the lab keeps its answers hidden

Everything that decides a result — the physics models, each apparatus's true values (spring
constants, resistances, densities, expansion coefficients, …) and the helpers that work out an ideal
answer — runs on the server. The browser sends what the student does (settings, release, reset,
"Inspect instruments") to the lab's own API, `/api/lab`, and gets back only:

- **what the apparatus looks like** — positions and angles to about a pixel, fill levels, whether a
  switch is closed; when something moves, the server sends the motion in advance so the animation
  and the manual stopwatch stay smooth;
- **what an instrument shows** — each reading made on the server with that instrument's resolution
  and scatter, exactly as before. A quantity reads the same whenever what it measures is the same:
  the same length, mass or voltage gives the same reading at any setting, at any moment of a
  trial and however many times "Inspect" is pressed, so repeating or averaging readings can't get
  below the instrument's resolution. A reading changes only when the thing measured changes (the
  student moves a contact, or a capacitor discharges, or a pipe warms).

**Every attempt has its own apparatus.** Each student's attempt at a practical gets its own hidden
values, a few per cent to ±20% around the source values, so a class can't share one answer. Every
value printed on the apparatus stays exactly as printed: resistor and capacitor labels (18 Ω, 22 Ω,
100 Ω and 220 Ω, 47 µF, …), supply and cell voltages, mass labels, the 0.80 m bridge wire and
marker positions — as do physical constants (g, the density of water). Four practicals have no
varied value, only their own reading scatter: the two interrupted pendulums (only g is hidden),
the chain pendulum (its chain length is kept because it decides which support positions work) and
the meter bridge (its only hidden values are how far its labelled resistors are from their labels,
which its model draws for each attempt).

**Attempts.** Reloading or reopening a practical — on any device — continues the same attempt, with
the same apparatus. The notebook's **Fresh attempt** button (click it twice) starts the practical
again on a new apparatus; the notebook shows which attempt the student is on ("Attempt 2"), and
earlier rows stay in it. A fresh attempt closes the previous one: another tab still open on it
says "This practical was restarted as a fresh attempt … Reload the page". A lab left open renews
its session by itself every 12 hours. Attempt numbers are kept in storage at
`portal-data/lab-attempts/<student id>.json` (which attempt each practical is on, and when each
started); each change is read back after it is written, so two tabs or two practicals opened at
the same moment can't lose one another's attempt.

**What the student guides say.** The student guides give neutral instructions. The mark-scheme
content that used to be in them — accepted uncertainty ranges, the comparison criteria ("20%
criterion"), expected trends and the range thresholds — is in the teacher guide only (next
section).

**Limits that stay.** A student sees what a real observation would show, so they can still time a
pendulum from the animation, just as they could film a real one, and a quantity that changes
during a trial (a discharging capacitor) gives a new reading each time it has changed by a scale
step, as a data logger would. What they can't get any more is the exact constants, the formulas,
the ideal answers, or a class-wide shared answer.

## Who can open the lab directly

The lab's own address (`/lab/index.html` and the lab room) and its API are protected, so a link
shared between students doesn't get round the switch:

- **Signed out:** sent to the portal login; after signing in they land back on the same lab page
  (including the practical they picked).
- **Signed in, switch off (and not staff):** a short page saying the lab isn't switched on, with a
  link back to the portal.
- **Account locked** (Admin → Access locks): the lab shows the lock's message, like the portal.
- **Account suspended** (the older "archived" status the portal also blocks): "Your portal access
  has been paused."
- **If the check itself fails** (for example the storage service doesn't answer in time): "The
  Practical Lab couldn't check your access just now. Please reload the page." It never opens the lab
  when it can't check.

How the check works, for the curious: each lab **page** (the two HTML files: the practical list and
the lab room) gets the full check — who you are, your roles, your account status and your Subjects
switch. The files the pages load (scripts, styles, the student guides and one question paper) only
check that you're signed in, because doing the full check on every one of them would slow the lab
down. None of those files holds anything hidden any more: no physics, no true values, no mark
scheme. Only those file types get the lighter check; any other address under `/lab`, in any mix of
capital letters, gets the full one.

Every **lab API request** (each adjustment, reading and release) gets the full check too — signed
in, not suspended or locked, and the Practical Lab switch on or staff — and refuses when it can't
check. To
keep adjustments quick, a successful check is reused for up to 30 seconds, so a lab that is already
open stops working within half a minute of the switch going off. Each student can make a generous
but limited number of lab requests a minute (hundreds of adjustments, a few hundred readings);
past that the lab asks them to wait a moment.

**The teacher guide is not on the website.** `teacher-guides.json` (each practical's governing
model, diagnostic equations, uncertainty analysis, the mark-scheme thresholds and criteria, and the
prompts its authors mark "withhold from students") lives in `src/content/lab/teacher-guides.json`,
which the website never serves. `npm run test:portal` fails if a teacher-only file is put back under
`public/lab`.

## Try it

1. With a test student who is **not** switched on: sign in as them and open
   `https://sjabrankamran.com/lab/index.html` — you should get the "isn't switched on" page, and no
   Practical Lab in their menu.
2. As an admin, switch **Practical Lab (Physics)** on for them.
3. As the student, refresh: **Practical Lab** is in the menu, the page shows the lab, and the bell
   has "Practical Lab is open for you". Open a practical, assemble it, release it and take a
   reading.
4. Reload the practical: the notebook still says the same attempt number and the readings at the
   same settings are the same (press **Inspect instruments** again and again: the numbers don't
   change). Click **Fresh attempt** twice: the attempt number goes up and the
   readings change.
5. Sign in as a second test student and open the same practical at the same settings: their
   readings differ from the first student's.
6. Switch the lab off again and reload the student's lab page — refused again.
7. Signed out, open `/lab/index.html` — you should be sent to the login page.

## Automated checks

`npm run test:portal` also runs `npm run test:practical-lab`, which now has two parts:

- **Access** (`scripts/test-practical-lab.mjs`): the access rules for every role with the switch
  on, off and unreadable, the gate on real lab addresses (signed out, cookie and app sessions,
  staff, locks, suspended accounts, failures), the Subjects switch and its notification, that the
  switch opens no physics course, and that no teacher-only file is served from `public/lab`.
- **The engine and its API** (`scripts/test-practical-lab-engine.mjs`): all 50 practicals give a
  view, readings and a trial on the server; nothing the browser receives holds a hidden value;
  readings keep the old instrument scatter (checked statistically) and 3,000 reads of one setting
  give one reading, so averaging gets nowhere; every attempt gets its own values and keeps them,
  and printed values never vary; every setting that worked still works on every attempt; the
  `/api/lab` routes refuse the wrong people, bad requests, expired sessions and replaced attempts;
  a read made right after an adjustment is for the new setting; and `public/lab` holds no model
  code, no `truth`, no `seededRandom(` and no link to `/lab/models/`.

`npm run test:sat` includes the subjects registry checks.
