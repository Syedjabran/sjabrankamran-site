import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, Target, Trophy } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { getTask } from "@/lib/portal/tasks";
import { TaskActions } from "./task-actions";

export const metadata = { title: "Assigned task" };
export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("student")) redirect("/portal");
  const { id } = await params;
  const task = await getTask(user.id, id);
  if (!task) notFound();

  const launchHref = task.sourceId && (task.activityType === "daily_challenge" || task.activityType === "short_test")
    ? `/portal/exam-lab?allocation=${encodeURIComponent(task.sourceId)}`
    : task.resourceUrl;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/study-plan" className="text-xs text-cyan hover:underline">← Back to my study plan</Link>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-ice">
          {task.kind === "challenge" ? <Trophy size={21} className="text-amber-300" /> : <Target size={21} className="text-cyan" />}
          {task.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-dust">
          <span>Set by {task.createdByName}</span>
          {task.topic ? <span>· {task.topic}</span> : null}
          {task.expectedMinutes ? <span className="inline-flex items-center gap-1"><Clock size={12} /> {task.expectedMinutes} min</span> : null}
          {task.dueAt ? <span>· due {new Date(task.dueAt).toLocaleString("en-GB")}</span> : null}
          {task.mandatory ? <span className="rounded-full border border-signal/35 px-2 py-0.5 uppercase tracking-wider text-signal">mandatory</span> : null}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-space/60 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-dust">Instructions</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fog">{task.details || "Complete the assigned activity and submit it before the deadline."}</p>
      </div>

      {task.studentNote ? (
        <div className="rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald2">Your submitted note</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-fog">{task.studentNote}</p>
        </div>
      ) : null}

      <TaskActions id={task.id} status={task.status} mandatory={!!task.mandatory} activityType={task.activityType}
        launchHref={launchHref} existingNote={task.studentNote} />
    </div>
  );
}
