import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { getPortalUser, isExamLabStaff } from "@/lib/edu/auth";
import { resolveCourseAccess, COURSE_LABEL } from "@/lib/portal/course-access";
import { examLabCatalog } from "@/lib/exam-lab/catalog";
import { redirect } from "next/navigation";
import { EXAM_LAB_SUBJECTS, examLabContext } from "@/lib/portal/exam-lab-context";
import { courseClassLabel, courseCodeLabel, courseOf, listed, portalItem, type CourseDef } from "@/lib/portal/subjects";

// The hub bundles the paper runner and proctor camera; code-splitting it keeps
// that payload out of the route's critical JS so tab-to-tab navigation paints
// instantly. The question bank is NOT in it any more: the hub lists papers
// from `catalog` (built here, on the server, with no questions or answers)
// and the server opens each sitting (/api/exam-lab/sitting).
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

const EXAM_LAB = portalItem("exam-lab");
const FIRST_PAPERS = EXAM_LAB_SUBJECTS[0]?.examLab;
export const metadata = { title: FIRST_PAPERS ? `${EXAM_LAB.name} — ${FIRST_PAPERS.title}` : EXAM_LAB.name, robots: { index: false } };

const courseDefs = (ids: readonly string[]) => ids.map((id) => courseOf(id)).filter((c): c is CourseDef => !!c);

/** The page header, shared by every state of the page. */
function ExamLabHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
        <FlaskConical size={18} />
      </span>
      <div>
        <h1 className="font-display text-2xl text-ice">{EXAM_LAB.name}</h1>
        <p className="text-sm text-dust">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * The Exam Lab, for the subject and course in the page's context
 * (exam-lab-context.ts): ?course= / ?subject= choose among the courses this
 * user may open, and without them the student's own course opens -- a
 * one-course student never sees a choice. Physics is the only subject with
 * papers today, so a physics user sees exactly the page they always did.
 */
export default async function PortalExamLabPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
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
  // Course guardrail: a student only ever reaches their enrolled course(s);
  // an unassigned user reaches none. Staff keep every track. The context
  // narrows `allowed` to the courses of one subject with papers (physics)
  // before it reaches PapersHub -- SAT never appears in its course choice.
  const [access, query] = await Promise.all([resolveCourseAccess(user), searchParams]);
  const context = examLabContext(access, query);

  if (context.kind === "elsewhere") {
    return (
      <div>
        <ExamLabHeader subtitle="Course access is assigned by your teacher." />
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="font-display text-lg text-ice">{EXAM_LAB.name} is for {listed(EXAM_LAB_SUBJECTS.map((s) => s.label))}</p>
          {context.places.map(({ subject, item }) => (
            <p key={subject.id} className="mx-auto mt-2 max-w-md text-sm text-fog">
              Your {subject.shortLabel} practice is in the {item.menuLabel}.{" "}
              <Link href={item.route} className="text-cyan hover:underline">Go to the {item.menuLabel}</Link>
            </p>
          ))}
        </div>
      </div>
    );
  }
  if (context.kind === "none") {
    const subjects = listed(EXAM_LAB_SUBJECTS.map((s) => s.label), "or");
    const classes = listed(courseDefs(EXAM_LAB_SUBJECTS.flatMap((s) => s.examLab?.courses ?? [])).map(courseClassLabel), "or");
    return (
      <div>
        <ExamLabHeader subtitle="Course access is assigned by your teacher." />
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.05] px-6 py-8 text-center">
          <p className="font-display text-lg text-ice">No course assigned yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-fog">
            Your account has no {subjects} course yet, so the {EXAM_LAB.name} is locked.
            Once your teacher adds you to a class for {classes},
            your papers and drills will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  const papers = context.subject.examLab;
  // PapersHub holds Physics' papers (9702 + 5054), so it takes their course
  // ids; a subject whose papers it doesn't hold never reaches it.
  const hubCourses = context.courses.filter((c): c is "9702" | "5054" => c === "9702" || c === "5054");
  const hubCourse = hubCourses.find((c) => c === context.course);
  const courseLine = access.isStaff && papers
    ? `${papers.source} · ${courseDefs(papers.courses).map(courseCodeLabel).join(" + ")}`
    : COURSE_LABEL[context.course];

  return (
    <div>
      <ExamLabHeader subtitle={`${courseLine}${papers ? ` · ${papers.tagline}` : ""}${first ? ` · ${first}` : ""}`} />

      {papers ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald2/25 bg-emerald2/[0.04] px-5 py-4 text-sm text-fog">
          <ShieldCheck size={16} className="text-emerald2" />
          {papers.intro}
        </div>
      ) : null}

      {hubCourse ? (
        <Suspense fallback={<div className="text-sm text-dust">Loading Exam Lab…</div>}>
          <PapersHub catalog={examLabCatalog()} canConduct={canConduct} canTest={canTest} canPause={canPause} allowedCourses={hubCourses} initialCourse={hubCourse} userId={user.id} />
        </Suspense>
      ) : null}
    </div>
  );
}
