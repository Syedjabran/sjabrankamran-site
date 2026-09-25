import { redirect } from "next/navigation";
import { BookOpenCheck, BrainCircuit, ShieldCheck, Target } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { ensureStudyPlan } from "@/lib/portal/study-plan";
import { effectiveRoles } from "@/lib/portal/view-as";
import { DEMO_STUDENT_UID } from "@/lib/portal/demo-student";
import { MyTasks } from "../learn/my-tasks";

export const metadata = { title: "My study plan" };
export const dynamic = "force-dynamic";

export default async function StudyPlanPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const { roles, previewing } = await effectiveRoles(user);
  if (!roles.includes("student")) redirect("/portal");
  const isRealStudent = user.roles.includes("student");
  // Storage reads now fail loudly rather than returning empty data, so a blip
  // must not take the whole page down.
  const plan = await ensureStudyPlan(isRealStudent ? user.id : DEMO_STUDENT_UID).catch(() => null);
  if (!plan) {
    return (
      <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-fog">
        <p className="font-semibold text-ice">Your study plan couldn&apos;t be loaded just now.</p>
        <p className="mt-1">Nothing has been lost. Please refresh the page in a moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-ice"><BrainCircuit size={22} className="text-cyan" /> My personalised weekly study plan</h1>
        <p className="mt-1 max-w-2xl text-sm text-fog">Your ranking and Exam Lab evidence determine this gradual weekly preparation path. It refreshes as your results improve.</p>
        {previewing === "student" && !isRealStudent ? <p className="mt-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-xs text-amber-200">Student preview uses the private Portal QA Student record. Activities are read-only in preview mode.</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-space/60 p-4"><p className="text-[10px] uppercase tracking-widest text-dust">Current level</p><p className="mt-1 text-xl font-semibold text-ice">{plan.level}/10 · {plan.levelLabel}</p></div>
        <div className="rounded-2xl border border-white/10 bg-space/60 p-4"><p className="text-[10px] uppercase tracking-widest text-dust">Priority topics</p><p className="mt-1 text-sm text-ice">{plan.focusTopics.join(" · ")}</p></div>
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.04] p-4"><p className="text-[10px] uppercase tracking-widest text-amber-300">Mandatory outstanding</p><p className="mt-1 text-xl font-semibold text-ice">{plan.openMandatory}</p></div>
      </div>
      <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-5 text-sm text-fog">
        <p className="flex items-center gap-2 font-semibold text-ice"><BookOpenCheck size={16} className="text-cyan" /> How the sequence works</p>
        <p className="mt-2">Targeted reading → video lesson → interactive simulation → written summary → short diagnostic test, plus one daily challenge. Each activity, status, due date and submitted test attempt remains in your learning record.</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-amber-200"><ShieldCheck size={13} /> Mandatory work should be completed in order and before its deadline.</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-space/40 p-5">
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-dust"><Target size={14} className="text-cyan" /> Your plan activities</p>
        <MyTasks initialTasks={plan.tasks} readOnly={!isRealStudent} showEmpty />
      </div>
    </div>
  );
}
