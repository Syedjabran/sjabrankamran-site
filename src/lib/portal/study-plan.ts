/** Automated weakness-led study plans. SERVER-ONLY. */
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { allocateToStudents, newAllocId } from "@/lib/exam-lab/allocations";
import { assignTask, listTasks, type PersonalTask } from "@/lib/portal/tasks";
import { notify } from "@/lib/portal/notifications";

const OWNER_ID = "a9ed04e6-5386-41c7-8713-fa557431a309";
const OWNER_NAME = "Syed Jabran Ali Kamran · Head of Physics World";

function pkDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86400_000));
}
function duePk(offsetDays: number, hour: number) {
  const [y, m, d] = pkDate(offsetDays).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 5, 0)).toISOString();
}
function safeTopic(topic: string) { return topic === "Unclassified" ? "Core Physics foundations" : topic; }
function searchUrl(kind: "resources" | "video" | "simulation", topic: string) {
  const q = encodeURIComponent(`CAIE 9702 Physics ${topic}`);
  if (kind === "resources") return `/portal/resources?search=${encodeURIComponent(topic)}`;
  if (kind === "video") return `https://www.youtube.com/results?search_query=${q}`;
  return `https://phet.colorado.edu/en/simulations/filter?subjects=physics&type=html`;
}

export type StudyPlanSummary = {
  generatedFor: string; level: number; levelLabel: string; focusTopics: string[];
  tasks: PersonalTask[]; openMandatory: number;
};

/**
 * Idempotently creates one weekly preparation sequence plus today's targeted
 * daily challenge. All generated work is stored in the normal task/allocation
 * records, so completion and submission remain auditable.
 */
export async function ensureStudyPlan(uid: string): Promise<StudyPlanSummary> {
  const attempts = await getAttempts(uid).catch(() => []);
  const a = analyse(attempts);
  const focus = (a.weaknesses.length ? a.weaknesses.map((x) => safeTopic(x.topic)) : ["Core Physics foundations", "Measurements and uncertainties"]).slice(0, 3);
  const today = pkDate();
  const monday = (() => {
    const noon = new Date(`${today}T12:00:00+05:00`);
    const day = noon.getUTCDay() || 7;
    return pkDate(1 - day);
  })();
  const weeklyKey = `auto-plan:${monday}`;
  const dailyKey = `auto-daily:${today}`;
  let tasks = await listTasks(uid);

  if (!tasks.some((t) => t.generatedKey === weeklyKey)) {
    const topic = focus[0];
    const specs: Array<Pick<PersonalTask, "title" | "details" | "activityType" | "expectedMinutes"> & { url: string; due: string }> = [
      { title: `Targeted study material · ${topic}`, details: `Read a concise explanation and make five retrieval notes on ${topic}.`, activityType: "study_material", expectedMinutes: 20, url: searchUrl("resources", topic), due: duePk(1, 20) },
      { title: `Video lesson · ${topic}`, details: "Watch one focused lesson, pause to solve each worked example, and record your key correction.", activityType: "video", expectedMinutes: 25, url: searchUrl("video", topic), due: duePk(2, 20) },
      { title: `Interactive simulation · ${topic}`, details: "Explore a relevant Physics simulation. Change at least two variables and write what changes and why.", activityType: "simulation", expectedMinutes: 20, url: searchUrl("simulation", topic), due: duePk(3, 20) },
      { title: `Mandatory summary assignment · ${topic}`, details: "Submit a structured one-page explanation: definitions, equations, one worked example and your most common error.", activityType: "assignment", expectedMinutes: 35, url: "/portal/learn", due: duePk(4, 20) },
    ];
    for (const s of specs) await assignTask(uid, {
      title: s.title, details: s.details, kind: "task", dueAt: s.due, points: 10, resourceUrl: s.url,
      createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: s.activityType,
      expectedMinutes: s.expectedMinutes, generatedKey: weeklyKey,
    });

    const testId = newAllocId();
    await allocateToStudents([uid], {
      id: testId, mode: "assignment_nohelp", content: { type: "drill", paperType: a.level >= 6 ? "P4" : "P2", topics: [topic], levels: a.level >= 5 ? ["LOT", "HOT"] : ["LOT"], count: 10 },
      title: `Weekly short test · ${topic}`, instructions: "Mandatory diagnostic check. Complete and submit before the deadline.", durationMin: 25,
      dueAt: duePk(5, 20), startsAt: null, classId: null, className: "Automated study plan", createdBy: OWNER_ID, createdByName: OWNER_NAME,
    });
    await assignTask(uid, {
      title: `Mandatory short test · ${topic}`, details: "Complete the assigned 10-question diagnostic in Exam Lab and submit it.", kind: "challenge", dueAt: duePk(5, 20), points: 20,
      resourceUrl: "/portal/exam-lab", createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: "short_test", expectedMinutes: 25, generatedKey: weeklyKey, sourceId: testId,
    });
    await notify({ uids: [uid] }, { type: "assignment", title: "Your personalised weekly study plan is ready", body: `This week focuses on ${topic}. Every step is mandatory and recorded.`, href: "/portal/study-plan" });
  }

  tasks = await listTasks(uid);
  if (!tasks.some((t) => t.generatedKey === dailyKey)) {
    const topic = focus[Math.abs(new Date(`${today}T12:00:00+05:00`).getUTCDay()) % focus.length];
    const allocationId = newAllocId();
    await allocateToStudents([uid], {
      id: allocationId, mode: "assignment_nohelp", content: { type: "drill", paperType: a.level >= 6 ? "P4" : "P2", topics: [topic], levels: ["LOT", "HOT"], count: 5 },
      title: `Daily challenge · ${topic}`, instructions: "Mandatory daily targeted practice. Complete and submit today.", durationMin: 15,
      dueAt: duePk(0, 20), startsAt: null, classId: null, className: "Automated study plan", createdBy: OWNER_ID, createdByName: OWNER_NAME,
    });
    await assignTask(uid, {
      title: `Daily mandatory challenge · ${topic}`, details: "Complete today’s five targeted questions in Exam Lab and submit them.", kind: "challenge", dueAt: duePk(0, 20), points: 10,
      resourceUrl: "/portal/exam-lab", createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: "daily_challenge", expectedMinutes: 15, generatedKey: dailyKey, sourceId: allocationId,
    });
    await notify({ uids: [uid] }, { type: "challenge", title: `Today’s mandatory challenge · ${topic}`, body: "A five-question targeted challenge is ready in Exam Lab.", href: "/portal/study-plan" });
  }

  tasks = await listTasks(uid);
  const generated = tasks.filter((t) => t.generatedKey?.startsWith("auto-")).slice(0, 30);
  return { generatedFor: today, level: a.level, levelLabel: a.levelLabel, focusTopics: focus, tasks: generated, openMandatory: generated.filter((t) => t.mandatory && t.status !== "done").length };
}
