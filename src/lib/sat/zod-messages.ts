// src/lib/sat/zod-messages.ts
//
// SERVER-ONLY. One shared "invalid request" response for every SAT route
// that validates a request body with zod -- src/app/api/sat/assignments/
// route.ts and src/app/api/sat/sessions/route.ts (fix round 2 finding 3).
// Each route previously kept its own copy of this response, both surfacing
// `parsed.error.issues[0]?.message` unconditionally regardless of where
// that message came from -- fine for an issue we authored ourselves, but a
// plain shape mismatch (a bad uuid, an out-of-range number, a wrong type...)
// carries zod's own generated English, never meant for a user. The mapping
// itself lives in zod-issue-message.ts (no `@/` alias, no framework import,
// so it's importable by plain node); this module just wraps it in the
// NextResponse both routes need.
import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { zodIssueMessage } from "./zod-issue-message.ts";

export { zodIssueMessage };

export function invalidRequest(parsed: { success: false; error: ZodError }) {
  return NextResponse.json({ error: zodIssueMessage(parsed.error) }, { status: 400 });
}
