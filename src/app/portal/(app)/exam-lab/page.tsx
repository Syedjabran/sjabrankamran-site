import { Suspense } from "react";
import dynamic from "next/dynamic";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { resolveCourseAccess, COURSE_LABEL } from "@/lib/portal/course-access";
import { redirect } from "next/navigation";

// The hub bundles the full 646 KB question bank (2,529 exact past-paper
// questions) plus the paper runner and proctor camera. Code-splitting it keeps
// that payload out of the route's critical JS so tab-to-tab navigation paints
// instantly and the bank chunk streams in parallel, cached long-term by the
// browser (immutable content hash).
const PapersHub = dynamic(() => import("@/components/exam-lab/papers-hub").then((m) => m.PapersHub), {
  loading: () => <PapersHubSkeleton />,
});

function PapersHubSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading Exam Lab">
      <div className="h-10 w-64 rounded-lg bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl border border-white/10 bg-space/60" />
        ))}
      </div>
      <div className="h-40 rounded-2xl border border-white/10 bg-space/60" />
    </div>
  );
}

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

  if (!user) redirect("/portal/login?next=%2Fportal%2Fexam-lab");
  // Course guardrail: a student only ever reaches their enrolled course; an
  // unassigned user reaches none. Staff keep both tracks.
  const access = await resolveCourseAccess(user);

  if (access.allowed.length === 0) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
            <FlaskConical size={18} />
          </span>
          <div>
            <h1 className="font-display text-2xl text-ice">Exam Lab</h1>
            <p className="text-sm text-dust">Course access is assigned by your teacher.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="font-display text-lg text-ice">No course assigned yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fog">
            Your account isn&rsquo;t enrolled in a physics course, so the Exam Lab is locked.
            Once your teacher assigns you to an A Level (9702) or O Level (5054) class,
            your papers and drills will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
          <FlaskConical size={18} />
        </span>
        <div>
          <h1 className="font-display text-2xl text-ice">Exam Lab</h1>
          <p className="text-sm text-dust">{access.isStaff ? "Real CAIE past papers · A Level 9702 + O Level 5054" : COURSE_LABEL[access.primary ?? access.allowed[0]]} · exact questions with diagrams{first ? ` · ${first}` : ""}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] px-5 py-4 text-sm text-fog">
        <ShieldCheck size={16} className="text-emerald2" />
        Sit a full past paper under timed conditions, or drill a topic. Paper 1 auto-marks; Paper 2 &amp; 4 reveal the official mark scheme. Every question is the exact Cambridge original — diagrams, graphs and all.
      </div>

      <Suspense fallback={<div className="text-sm text-dust">Loading Exam Lab…</div>}>
        <PapersHub canConduct={canConduct} canTest={canTest} canPause={canPause} allowedCourses={access.allowed} initialCourse={access.primary ?? access.allowed[0]} userId={user.id} />
      </Suspense>
    </div>
  );
}
