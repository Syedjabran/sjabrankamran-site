import { FlaskConical, ShieldCheck } from "lucide-react";
import { getPortalUser } from "@/lib/edu/auth";
import { ExamRunner } from "@/components/exam-lab/exam-runner";

export const metadata = { title: "Exam Lab — CAIE 9702 Exact-Pattern Practice", robots: { index: false } };

export default async function PortalExamLabPage() {
  const user = await getPortalUser();
  const first = (user?.fullName || user?.email || "").split(" ")[0];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
          <FlaskConical size={18} />
        </span>
        <div>
          <h1 className="font-display text-2xl text-ice">Exam Lab</h1>
          <p className="text-sm text-dust">CAIE 9702 exact-pattern practice · past-paper bank{first ? ` · ${first}` : ""}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] px-5 py-4 text-sm text-fog">
        <ShieldCheck size={16} className="text-emerald2" />
        Choose an exam pattern (Paper 1 MCQ · Paper 2 AS · Paper 4 A2) or drill specific topics. Your attempts are recorded for teacher review. Bank grows as past papers are ingested.
      </div>

      <ExamRunner mode="portal" maxCount={20} showPatterns />
    </div>
  );
}
