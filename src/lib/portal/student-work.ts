/**
 * A student's open work, read once per request: the home page's "Up next"
 * and subject-card glances and the Physics space's badges read the same
 * copy. SERVER-ONLY.
 *
 * Each read fails soft, as the home page always has: a storage blip hides a
 * glance or a badge, never the page.
 */
import "server-only";
import { cache } from "react";
import { ensureStudyPlan } from "@/lib/portal/study-plan";
import { listAllocations, type ExamAllocation } from "@/lib/exam-lab/allocations";
import { listTasks, type PersonalTask } from "@/lib/portal/tasks";
import { readProfile } from "@/lib/sat/coach/profile-store";

const byDue = (a: { dueAt: string | null }, b: { dueAt: string | null }) =>
  (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);

export const studentWork = cache(async (uid: string) => {
  const [plan, allocations, tasks] = await Promise.all([
    // A storage blip while generating the plan must not take down the page.
    ensureStudyPlan(uid).catch(() => null),
    listAllocations(uid).catch((): ExamAllocation[] => []),
    listTasks(uid).catch((): PersonalTask[] => []),
  ]);
  return {
    plan,
    /** Exam Lab work still to do, soonest due first (no due date last). */
    openAllocations: allocations
      .filter((a) => a.status === "assigned" || a.status === "in_progress" || a.status === "unlocked")
      .sort(byDue),
    /** Tasks not done, soonest due first. */
    openTasks: tasks.filter((t) => t.status !== "done").sort(byDue),
  };
});

/** The student's SAT plan settings: null when they haven't set it up,
 *  undefined when it couldn't be read. */
export const satProfileOf = cache(async (uid: string) => readProfile(uid).catch(() => undefined));
