import assert from "node:assert/strict";
import {
  findApplicableRestriction,
  isRestrictionActive,
} from "../src/lib/portal/access-shared.ts";

const now = Date.parse("2026-09-11T12:00:00.000Z");
const base = {
  classIds: [], endsAt: null, startsAt: "2026-09-11T10:00:00.000Z",
  createdAt: "2026-09-11T10:00:00.000Z", createdBy: "owner",
  releasedAt: null, releasedBy: null, mode: "locked", message: "Custom lock message",
};
const school = { ...base, id: "school", scopeType: "school", scopeKey: "School A", scopeLabel: "School A" };
const cls = { ...base, id: "class", scopeType: "class", scopeKey: "School A\u001fAS", scopeLabel: "School A — AS", classIds: ["g1", "g2"] };
const group = { ...base, id: "group", scopeType: "group", scopeKey: "g1", scopeLabel: "School A — AS · G1", classIds: ["g1"] };
const user = { ...base, id: "user", scopeType: "user", scopeKey: "u1", scopeLabel: "User One" };
const doc = { version: 1, updatedAt: base.createdAt, restrictions: [school, cls, group, user] };

assert.equal(findApplicableRestriction(doc, { userId: "u1", roles: ["student"], classIds: ["g1"], schools: ["School A"] }, now)?.id, "user");
assert.equal(findApplicableRestriction(doc, { userId: "u2", roles: ["student"], classIds: ["g1"], schools: ["School A"] }, now)?.id, "group");
assert.equal(findApplicableRestriction(doc, { userId: "u3", roles: ["student"], classIds: ["g2"], classKeys: ["School A\u001fAS"], schools: ["School A"] }, now)?.id, "class");
// A group created after the class lock was issued still inherits the class lock
// through the live school+year key, even though it is absent from classIds.
assert.equal(findApplicableRestriction(doc, { userId: "u5", roles: ["student"], classIds: ["g-new"], classKeys: ["School A\u001fAS"], schools: ["School A"] }, now)?.id, "class");
assert.equal(findApplicableRestriction(doc, { userId: "u4", roles: ["teacher"], classIds: [], schools: ["School A"] }, now)?.id, "school");
assert.equal(findApplicableRestriction(doc, { userId: "owner", roles: ["super_admin"], classIds: ["g1"], schools: ["School A"] }, now), null);
assert.equal(isRestrictionActive({ ...school, endsAt: "2026-09-11T11:00:00.000Z" }, now), false);
assert.equal(isRestrictionActive({ ...school, releasedAt: "2026-09-11T11:00:00.000Z" }, now), false);

console.log("access-control tests passed");
