import assert from "node:assert/strict";
import { formatPk, parsePkDateTime, pkDateTimeToIso, pkToday } from "../src/lib/portal/pk-time.ts";
import { isOnboardingDocComplete, validateOnboarding } from "../src/lib/portal/onboarding-shared.ts";

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

console.log("portal rules tests passed");
