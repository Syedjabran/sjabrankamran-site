import assert from "node:assert/strict";
import { formatPk, parsePkDateTime, pkDateTimeToIso, pkToday } from "../src/lib/portal/pk-time.ts";
import { isOnboardingDocComplete, validateOnboarding } from "../src/lib/portal/onboarding-shared.ts";
import { expiredOnResume, finishedLate, secondsLeft } from "../src/lib/exam-lab/sitting-clock.ts";

// --- Pakistan time -----------------------------------------------------------
// A datetime-local value is Pakistan wall-clock time, not UTC: 09:00 PKT = 04:00Z.
assert.equal(pkDateTimeToIso("2026-09-30T09:00"), "2026-09-30T04:00:00.000Z");
assert.equal(pkDateTimeToIso("2026-09-30T09:00:30"), "2026-09-30T04:00:30.000Z");
// A date alone is midnight in Pakistan.
assert.equal(pkDateTimeToIso("2026-09-30"), "2026-09-29T19:00:00.000Z");
// Values that already carry a zone are left alone.
assert.equal(pkDateTimeToIso("2026-09-30T04:00:00.000Z"), "2026-09-30T04:00:00.000Z");
assert.equal(pkDateTimeToIso("2026-09-30T09:00+05:00"), "2026-09-30T04:00:00.000Z");
assert.equal(parsePkDateTime(""), null);
assert.equal(parsePkDateTime(null), null);
assert.equal(parsePkDateTime("next tuesday"), null);
assert.equal(parsePkDateTime("2026-13-45T99:00"), null);
// 16:00 PKT is shown as 16:00 whatever timezone the server runs in.
assert.match(formatPk("2026-09-25T11:00:00.000Z"), /16:00/);
// 02:00 PKT on the 26th is still the 25th in UTC; "today" must be the 26th.
assert.equal(pkToday(Date.parse("2026-09-25T21:00:00.000Z")), "2026-09-26");

// --- Onboarding completeness (one rule for middleware + layout) --------------
const complete = {
  completed_at: "2026-09-20T10:00:00.000Z",
  full_name: "Test Student", date_of_birth: "2009-04-01", phone: "03001234567",
  whatsapp: "03001234567", city: "Lahore", photo_path: "photos/u1.jpg",
  guardians: [{ relationship: "Father", name: "Parent One", email: "parent@example.com", phone: "03007654321", is_primary: true }],
  consent: true,
};
assert.deepEqual(validateOnboarding(complete), []);
assert.equal(isOnboardingDocComplete(complete), true);
// A record completed before the photo became required (2026-09-09) is incomplete.
assert.equal(isOnboardingDocComplete({ ...complete, photo_path: undefined }), false);
// The old middleware rule accepted these; the layout rejected them, so a student
// passed one gate and was bounced back to the form by the other.
assert.equal(isOnboardingDocComplete({ ...complete, city: "" }), false);
assert.equal(isOnboardingDocComplete({ ...complete, consent: false }), false);
assert.equal(isOnboardingDocComplete({ ...complete, completed_at: null }), false);
assert.equal(isOnboardingDocComplete(null), false);

// --- Exam Lab sitting clock --------------------------------------------------
const MIN = 60_000;
const monday = Date.parse("2026-09-28T04:00:00.000Z"); // 09:00 PKT
// A 60-minute test started Monday and resumed Wednesday ran out Monday 10:00
// PKT; the runner shows that instead of auto-submitting an empty sitting.
assert.equal(expiredOnResume(monday, monday + 2 * 24 * 60 * MIN, 3600), monday + 60 * MIN);
// Resumed with 20 minutes left: not expired, the clock simply continues.
assert.equal(expiredOnResume(monday, monday + 40 * MIN, 3600), null);
assert.equal(secondsLeft(monday, monday + 40 * MIN, 3600), 20 * 60);
// Staff-pause time is credited back before deciding.
assert.equal(expiredOnResume(monday, monday + 65 * MIN, 3600, 10 * MIN), null);
assert.equal(expiredOnResume(monday, monday + 70 * MIN, 3600, 10 * MIN), monday + 70 * MIN);
// Same rounding as the countdown display: 00:00 on screen counts as run out.
assert.equal(expiredOnResume(monday, monday + 60 * MIN - 400, 3600), monday + 60 * MIN);
// A relaxed daily challenge due 20:00 PKT, opened at 09:00 and handed in at
// 09:20 (5 minutes past its 15-minute countdown), is on time...
const due = Date.parse("2026-09-28T15:00:00.000Z"); // 20:00 PKT
const nine20 = monday + 20 * MIN;
assert.equal(finishedLate({ relaxed: true, dueAt: due, now: nine20, secondsLeft: secondsLeft(monday, nine20, 900) }), false);
// ...and late once the due time has passed, whatever its countdown says.
assert.equal(finishedLate({ relaxed: true, dueAt: due, now: due + 1000, secondsLeft: 600 }), true);
// Without a due time (self-serve practice / daily challenge) the countdown decides.
assert.equal(finishedLate({ relaxed: true, dueAt: null, now: nine20, secondsLeft: -300 }), true);
assert.equal(finishedLate({ relaxed: true, dueAt: null, now: nine20, secondsLeft: 60 }), false);
// A non-relaxed run is judged by its countdown even when it has a due time.
assert.equal(finishedLate({ relaxed: false, dueAt: due, now: nine20, secondsLeft: -1 }), true);

console.log("portal rules tests passed");
