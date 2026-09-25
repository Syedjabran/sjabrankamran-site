// src/lib/sat/filter-schema.ts
//
// SERVER-ONLY. The zod schema for a drill filter (SATFilter), shared by
// src/app/api/sat/sessions/route.ts (a student starting a drill directly)
// and src/app/api/sat/assignments/route.ts (staff assigning a filtered
// drill) -- fix round 1 ruling: one SAT_DOMAINS + filter zod schema, shared
// by both routes, so the domain list and its validation rules can never
// drift between a student's own drill and a staff-assigned one.
import { z } from "zod";
import { loadQuestionBank, filterQuestions } from "./bank.ts";
import type { SATSection } from "./types.ts";

export const SAT_DOMAINS = [
  "information-ideas", "craft-structure", "expression-ideas", "standard-english",
  "algebra", "advanced-math", "psda", "geometry-trig",
] as const;

const DOMAIN_SECTION: Record<(typeof SAT_DOMAINS)[number], SATSection> = {
  "information-ideas": "rw", "craft-structure": "rw", "expression-ideas": "rw", "standard-english": "rw",
  algebra: "math", "advanced-math": "math", psda: "math", "geometry-trig": "math",
};

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
  domain: z.enum(SAT_DOMAINS).optional(),
  difficulty: z.enum(["E", "M", "H"]).optional(),
  skill: z.string().max(120).optional(),
}).superRefine((f, ctx) => {
  if (f.section && f.domain && DOMAIN_SECTION[f.domain] !== f.section) {
    ctx.addIssue({ code: "custom", message: "That domain isn't part of the selected section.", path: ["domain"] });
    return;
  }
  if (!filterQuestions(loadQuestionBank(), f).length) {
    ctx.addIssue({ code: "custom", message: "No drill questions match that filter.", path: ["domain"] });
  }
});
