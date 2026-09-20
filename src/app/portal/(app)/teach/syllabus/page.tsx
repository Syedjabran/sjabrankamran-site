import { redirect } from "next/navigation";
import { BookMarked } from "lucide-react";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { SyllabusCoverageClient } from "./syllabus-client";

export const metadata = { title: "Syllabus coverage" };
export const dynamic = "force-dynamic";

/**
 * Staff record which syllabus topics each class / school has completed.
 * Assignment gating (class drills, daily challenges, automated study plans)
 * draws questions ONLY from topics marked complete here — this page is the
 * single place that frontier is maintained.
 */
export default async function SyllabusCoveragePage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isExamLabStaff(user.roles)) redirect("/portal");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
          <BookMarked size={18} />
        </span>
        <div>
          <h1 className="font-display text-2xl text-ice">Syllabus coverage</h1>
          <p className="text-sm text-dust">
            Tick the topics your class has completed. Drills, daily challenges and automated study plans only draw
            questions from topics marked complete — nothing is ever assigned from uncovered syllabus.
          </p>
        </div>
      </div>
      <SyllabusCoverageClient isAdmin={user.roles.includes("super_admin") || user.roles.includes("admin")} />
    </div>
  );
}
