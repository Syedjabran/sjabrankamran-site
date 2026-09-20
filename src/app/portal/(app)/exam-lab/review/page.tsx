import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Clock3, FileText, TrendingUp } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { getAttempts } from "@/lib/exam-lab/attempts";

export const metadata = { title: "My answer scripts", robots: { index: false } };
export const dynamic = "force-dynamic";

function when(ts: number) { return new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }); }
function mins(sec?: number | null) { return sec == null ? "—" : `${Math.max(1, Math.round(sec / 60))} min`; }

/** Immutable review pages for every submitted Exam Lab drill, paper, assignment and test. */
export default async function AnswerScriptReviewPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("student")) redirect("/portal");
  const attempts = (await getAttempts(user.id)).slice().sort((a, b) => b.ts - a.ts);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><ClipboardCheck size={18} /></span>
        <div><h1 className="font-display text-2xl text-ice">My question records</h1><p className="text-sm text-dust">Revisit every submitted topical drill and past-paper answer, including time spent and feedback.</p></div>
        </div>
        <Link href="/portal/progress" className="btn-ghost !px-3.5 !py-1.5 text-xs"><TrendingUp size={13} /> My Progress</Link>
      </div>
      {!attempts.length ? <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-dust">No submitted scripts yet. Complete a drill or paper in <Link className="text-cyan hover:underline" href="/portal/exam-lab">Exam Lab</Link> and it will appear here.</div> : null}
      {attempts.map((a) => {
        const score = a.total ? `${a.score}/${a.total} marks` : `${a.scoredCount}/${a.qCount} auto-scored`;
        const mode = a.context?.kind === "test" ? "Proctored test" : a.context?.kind === "assignment" ? "Assignment" : a.mode === "drill" ? "Topical drill" : "Past paper";
        return <details key={`${a.id}-${a.ts}`} className="rounded-2xl border border-white/10 bg-space/60 p-4">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display text-base text-ice">{a.code || a.ref || mode}</p><p className="mt-1 text-xs text-dust">{mode} · {when(a.ts)} · <Clock3 className="inline" size={11} /> {mins(a.durationSec)}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan/30 px-2.5 py-1 font-mono text-xs text-cyan">{score}</span>{a.context?.status === "unattempted" ? <span className="rounded-full border border-amber-400/50 px-2.5 py-1 font-mono text-[10px] text-amber-300" title="No answers were attempted — this submission earns no points">Unattempted</span> : a.context?.status === "late submission" ? <span className="rounded-full border border-signal/50 px-2.5 py-1 font-mono text-[10px] text-signal">Late submission</span> : a.context?.status === "late attempt" ? <span className="rounded-full border border-signal/50 px-2.5 py-1 font-mono text-[10px] text-signal">Late attempt</span> : null}{a.context && a.context.pausedSec ? <span className="rounded-full border border-amber-400/40 px-2.5 py-1 font-mono text-[10px] text-amber-200" title="A staff member paused the timer during this attempt">Paused {a.context.pausedSec}s</span> : null}<span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] text-dust">{a.context?.cancelled ? "locked/cancelled" : "submitted"}</span></div></div>
          </summary>
          <div className="mt-4 border-t border-white/10 pt-4"><p className="mb-3 flex items-center gap-1.5 text-xs text-dust"><FileText size={13} /> Script record link: <a className="text-cyan hover:underline" href={`/portal/exam-lab/review#${a.id}`}>/portal/exam-lab/review#{a.id}</a></p>
            <ol id={a.id} className="space-y-3">{a.questions.map((q, i) => <li key={`${a.id}-${q.id}-${i}`} className="rounded-xl border border-white/[0.08] bg-abyss/50 p-3"><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold text-ice">Q{i + 1} · {q.topic || "General"} · {q.paperType}</span><span className="font-mono text-dust">{q.earned == null ? "Pending marking" : `${q.earned}/${q.marks}`} · {mins(q.spentSec)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-fog"><b className="text-ice">Your answer: </b>{q.response || "No answer recorded"}</p>{q.feedback ? <p className="mt-2 whitespace-pre-wrap rounded-lg border border-cyan/15 bg-cyan/[0.04] p-2 text-xs text-fog"><b className="text-cyan">Feedback: </b>{q.feedback}</p> : null}</li>)}</ol>
          </div>
        </details>;
      })}
    </div>
  );
}
