import { Suspense } from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { PapersHub } from "@/components/exam-lab/papers-hub";

export const metadata = { title: "Exam Lab — Real CAIE 9702 Past Papers", robots: { index: false } };

export default async function PortalExamLabPage() {
  const user = await getPortalUser();
  const first = (user?.fullName || user?.email || "").split(" ")[0];
  // Owner-defined staff set (super_admin / admin / teacher / coordinator /
  // facilitator): the only roles that may conduct, assign/share, or pause.
  // Students NEVER see the assign/share panel or the pause buttons, in any
  // sit mode; the server re-checks on every assign/share API call.
  const canConduct = !!user && isExamLabStaff(user.roles);
  const canTest = canConduct;
  const canPause = canConduct;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
          <FlaskConical size={18} />
        </span>
        <div>
          <h1 className="font-display text-2xl text-ice">Exam Lab</h1>
          <p className="text-sm text-dust">Real CAIE 9702 past papers · exact questions with diagrams · P1 / P2 / P4{first ? ` · ${first}` : ""}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] px-5 py-4 text-sm text-fog">
        <ShieldCheck size={16} className="text-emerald2" />
        Sit a full past paper under timed conditions, or drill a topic. Paper 1 auto-marks; Paper 2 &amp; 4 reveal the official mark scheme. Every question is the exact Cambridge original — diagrams, graphs and all.
      </div>

      <Suspense fallback={<div className="text-sm text-dust">Loading Exam Lab…</div>}>
        <PapersHub canConduct={canConduct} canTest={canTest} canPause={canPause} />
      </Suspense>
    </div>
  );
}
