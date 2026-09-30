// src/lib/sat/zod-issue-message.ts
//
// Pure logic, no `@/` aliases and no framework import -- importable by plain
// `node --experimental-strip-types` (scripts/test-sat-assignments.mjs), the
// same split as assignment-rules.ts vs. assignments.ts. zod-messages.ts (the
// NextResponse-wrapping module actually imported by the routes) re-exports
// this.
import type { ZodError } from "zod";

/**
 * Turn a failed zod parse into ONE plain sentence, never raw zod text.
 * Only an issue WE authored via `ctx.addIssue({ code: "custom", ... })` (the
 * shared drill-filter schema's domain/section and bank-match refinements, a
 * route's own superRefine for a missing testNo/count) is meant for a user
 * and is surfaced verbatim; every other zod issue -- a wrong type, a bad
 * enum value, an out-of-range number, a malformed uuid -- carries zod's own
 * internal wording and collapses to one generic sentence instead.
 */
export function zodIssueMessage(error: ZodError): string {
  const issue = error.issues[0];
  return issue && issue.code === "custom" ? issue.message : "Invalid request.";
}
