// src/lib/sat/coach/student-guard.ts
//
// SERVER-ONLY. The gate the study-plan routes share (GET /api/sat/coach,
// POST /api/sat/plan/start, POST /api/sat/plan/move): a signed-in student
// with SAT access -- staff have no plan of their own. A failed access read
// is a 503 (retry), never "not part of your courses".
import "server-only";
import { NextResponse } from "next/server";
import { getPortalUser, type PortalUser } from "@/lib/edu/auth";
import { satAccess } from "../access.ts";

export const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function satStudent(): Promise<{ user: PortalUser } | { refused: NextResponse }> {
  const user = await getPortalUser();
  if (!user) return { refused: errorResponse("Please sign in.", 401) };
  let access;
  try {
    access = await satAccess(user);
  } catch {
    return { refused: errorResponse("Your access couldn't be checked. Please try again.", 503) };
  }
  if (!access.ok) return { refused: errorResponse("The SAT Lab is not part of your courses.", 403) };
  if (access.isStaff) return { refused: errorResponse("The study plan is for students — staff have none of their own.", 403) };
  return { user };
}
