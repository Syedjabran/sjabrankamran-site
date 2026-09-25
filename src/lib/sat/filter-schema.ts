// src/lib/sat/filter-schema.ts
//
// SERVER-ONLY. The zod schema for a drill filter (SATFilter), shared by
// src/app/api/sat/sessions/route.ts (a student starting a drill directly)
// and src/app/api/sat/assignments/route.ts (staff assigning a filtered
// drill) -- fix round 1 ruling: one filter zod schema, shared by both
// routes, so the domain list and its validation rules can never drift
// between a student's own drill and a staff-assigned one.
import { z } from "zod";
import { loadQuestionBank, filterQuestions } from "./bank.ts";
// The domain ids and their sections are spelled once, in client-types.ts
// (shared with the hub's and the assign panel's drill-filter dropdowns);
// this schema derives its enum and its domain->section lookup from them.
import { DOMAIN_SECTIONS, SAT_DOMAIN_IDS, type SATDomainId } from "./client-types.ts";

const DOMAIN_SECTION = new Map(DOMAIN_SECTIONS.map((d) => [d.value, d.section]));

/**
 * `{}` (no constraint at all) always matches the whole bank, so the two
 * checks below only ever reject a filter that's actually impossible:
 *  - a domain that isn't part of the chosen section (a client bug, or a
 *    stale request from before a section switch);
 *  - a combination -- however syntactically valid -- that the bank simply
 *    has no questions for (e.g. a skill string that doesn't exist), so
 *    staff can never assign a whole class a drill nobody can start.
 */
export const satFilterSchema = z.object({
  section: z.enum(["rw", "math"]).optional(),
  domain: z.enum(SAT_DOMAIN_IDS as [SATDomainId, ...SATDomainId[]]).optional(),
  difficulty: z.enum(["E", "M", "H"]).optional(),
  skill: z.string().max(120).optional(),
}).superRefine((f, ctx) => {
  if (f.section && f.domain && DOMAIN_SECTION.get(f.domain) !== f.section) {
    ctx.addIssue({ code: "custom", message: "That domain isn't part of the selected section.", path: ["domain"] });
    return;
  }
  if (!filterQuestions(loadQuestionBank(), f).length) {
    ctx.addIssue({ code: "custom", message: "No drill questions match that filter.", path: ["domain"] });
  }
});
