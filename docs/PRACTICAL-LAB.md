# Practical Lab — owner's guide

The **Practical Lab** is the set of 50 virtual Cambridge 9702 practicals (set up the apparatus,
observe, take your own readings) that lives in `public/lab/`. It is now a subject an admin switches
on per student, exactly like Digital SAT, and it belongs to **Physics**: later it will appear inside
the Physics space; for now it is an entry in the portal menu.

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

## Who can open the lab directly

The lab's own address (`/lab/index.html`, the lab rooms and the 50 practical pages) is protected
too, so a link shared between students doesn't get round the switch:

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

How the check works, for the curious: each lab **page** (the 52 HTML files) gets the full check —
who you are, your roles, your account status and your Subjects switch. The other 70 files the pages
load (scripts, styles, the room settings, the student guides and one question paper) only check
that you're signed in, because doing the full check on every one of them would slow every practical
down. Only those file types get the lighter check; any other address under `/lab`, in any mix of
capital letters, gets the full one. Two consequences:

- Those 70 files are exactly what the lab sends every student who uses it, so a signed-in account
  without the switch (a parent, say) could read one of them if it knew the file's address. It can't
  use the lab that way — that needs a page — and none of them is teacher-only.
- A lab page a student already has open keeps working until they reload or leave it after the
  switch goes off.

**The teacher guide is not on the website.** `teacher-guides.json` (each practical's governing
model, diagnostic equations, uncertainty analysis and the prompts its authors mark "withhold from
students") used to sit in `public/lab/content/`, where any signed-in account could fetch it. Nothing
in the lab loads it, so it now lives in `src/content/lab/teacher-guides.json`, which the website
never serves. `npm run test:portal` fails if a teacher-only file is put back under `public/lab`.

## Try it

1. With a test student who is **not** switched on: sign in as them and open
   `https://sjabrankamran.com/lab/index.html` — you should get the "isn't switched on" page, and no
   Practical Lab in their menu.
2. As an admin, switch **Practical Lab (Physics)** on for them.
3. As the student, refresh: **Practical Lab** is in the menu, the page shows the lab, and the bell
   has "Practical Lab is open for you". Open a practical and take a reading.
4. Switch it off again and reload the student's lab page — refused again.
5. Signed out, open `/lab/index.html` — you should be sent to the login page.

## Automated checks

`npm run test:portal` now also runs `npm run test:practical-lab`: the access rules for every role
with the switch on, off and unreadable, the gate on real lab addresses (signed out, cookie and app
sessions, staff, locks, suspended accounts, failures), the Subjects switch and its notification,
that the switch opens no physics course, and that no teacher-only file is served from `public/lab`.
`npm run test:sat` includes the subjects registry checks.
