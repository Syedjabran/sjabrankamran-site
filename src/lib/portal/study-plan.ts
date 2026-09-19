/** Automated weakness-led study plans. SERVER-ONLY. */
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { allocateToStudents, newAllocId } from "@/lib/exam-lab/allocations";
import { assignTask, listTasks, type PersonalTask } from "@/lib/portal/tasks";
import { notify } from "@/lib/portal/notifications";
import { getRegistry } from "@/lib/portal/institutions";
import { createAdminClient } from "@/lib/supabase/admin";

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
// Map analytics weakness labels to the canonical IMAGE_BANK topic strings.
const TOPIC_MAP: Record<string, string> = {
  "Unclassified": "Physical quantities & units",
  "Core Physics foundations": "Physical quantities & units",
  "Measurements and uncertainties": "Physical quantities & units",
};
const AS_TOPICS = [
  "Physical quantities & units", "Kinematics", "Dynamics", "Forces, density & pressure",
  "Work, energy & power", "Deformation of solids", "Waves", "Superposition",
  "Electricity", "D.C. circuits", "Particle physics",
];
const A2_TOPICS = [
  "Circular motion", "Gravitational fields", "Thermal physics", "Ideal gases", "Oscillations",
  "Electric fields", "Capacitance", "Magnetic fields", "Alternating currents", "Quantum physics",
  "Nuclear physics", "Astronomy & cosmology",
];
const CANONICAL_TOPICS = [...AS_TOPICS, ...A2_TOPICS];
// Coverage frontier for Year 1 (AS): students have only covered chapter 1 so
// far, so every auto-generated task/challenge must stay within it. Widen this
// slice as the cohort progresses through the syllabus.
const AS_COVERED_TOPICS = AS_TOPICS.slice(0, 1); // ["Physical quantities & units"]
function safeTopic(topic: string) { return TOPIC_MAP[topic] || topic; }
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

/** Resolve the student's enrolled course stage; ranking level is performance,
 * not AS/A2 course placement, so it must never choose the paper type. */
async function courseStage(uid: string): Promise<"AS" | "A2"> {
  try {
    const db = createAdminClient();
    const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (!student?.id) return "AS";
    const { data: enrolments } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
    const ids = new Set((enrolments || []).map((e) => e.class_id as string));
    const registry = await getRegistry();
    const years = registry.classes.filter((c) => ids.has(c.id)).map((c) => c.year.toUpperCase());
    return years.some((y) => y === "A2" || y.includes("YEAR 2")) ? "A2" : "AS";
  } catch {
    return "AS";
  }
}

/**
 * Idempotently creates one weekly preparation sequence plus today's targeted
 * daily challenge. All generated work is stored in the normal task/allocation
 * records, so completion and submission remain auditable.
 */
export async function ensureStudyPlan(uid: string): Promise<StudyPlanSummary> {
  const [attempts, stage] = await Promise.all([getAttempts(uid).catch(() => []), courseStage(uid)]);
  const a = analyse(attempts);
  // Year 1 (AS) is scoped to covered chapters only; anything a weakness analysis
  // surfaces from a later, not-yet-taught topic is filtered out below.
  const stageTopics = stage === "A2" ? A2_TOPICS : AS_COVERED_TOPICS;
  const paperType = stage === "A2" ? "P4" : "P2";
  const rawFocus = a.weaknesses.length ? a.weaknesses.map((x) => safeTopic(x.topic)) : stageTopics.slice(0, 3);
  // De-duplicate and ensure every topic exists in the image bank.
  const seen = new Set<string>();
  const focus = rawFocus.filter((t) => stageTopics.includes(t) && CANONICAL_TOPICS.includes(t) && !seen.has(t) && (seen.add(t), true)).slice(0, 3);
  if (!focus.length) focus.push(...stageTopics.slice(0, 3));
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
    const specs: Array<Pick<PersonalTask, "title" | "details" | "activityType" | "expectedMinutes"> & { url: string | null; due: string }> = [
      { title: `Targeted study material · ${topic}`, details: `Read a concise explanation and make five retrieval notes on ${topic}.`, activityType: "study_material", expectedMinutes: 20, url: searchUrl("resources", topic), due: duePk(1, 20) },
      { title: `Video lesson · ${topic}`, details: "Watch one focused lesson, pause to solve each worked example, and record your key correction.", activityType: "video", expectedMinutes: 25, url: searchUrl("video", topic), due: duePk(2, 20) },
      { title: `Interactive simulation · ${topic}`, details: "Explore a relevant Physics simulation. Change at least two variables and write what changes and why.", activityType: "simulation", expectedMinutes: 20, url: searchUrl("simulation", topic), due: duePk(3, 20) },
      { title: `Mandatory summary assignment · ${topic}`, details: "Submit a structured one-page explanation: definitions, equations, one worked example and your most common error.", activityType: "assignment", expectedMinutes: 35, url: null, due: duePk(4, 20) },
    ];
    for (const s of specs) await assignTask(uid, {
      title: s.title, details: s.details, kind: "task", dueAt: s.due, points: 10, resourceUrl: s.url,
      createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: s.activityType,
      expectedMinutes: s.expectedMinutes, generatedKey: weeklyKey,
    });

    const testId = newAllocId();
    await allocateToStudents([uid], {
      id: testId, mode: "assignment_nohelp", content: { type: "drill", paperType, topics: [topic], levels: a.level >= 5 ? ["LOT", "HOT"] : ["LOT"], count: 10 },
      title: `Weekly short test · ${topic}`, instructions: "Diagnostic check. The timer is a pacing guide only — it will not lock your answers.", durationMin: 25, lockOnExpiry: false,
      dueAt: duePk(5, 20), startsAt: null, classId: null, className: "Automated study plan", createdBy: OWNER_ID, createdByName: OWNER_NAME,
    });
    const shortTestTask = await assignTask(uid, {
      title: `Mandatory short test · ${topic}`, details: "Complete the assigned 10-question diagnostic in Exam Lab and submit it.", kind: "challenge", dueAt: duePk(5, 20), points: 20,
      resourceUrl: `/portal/exam-lab?allocation=${encodeURIComponent(testId)}`, createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: "short_test", expectedMinutes: 25, generatedKey: weeklyKey, sourceId: testId,
    });
    await notify({ uids: [uid] }, { type: "assignment", title: "Your personalised weekly study plan is ready", body: `This week focuses on ${topic}. Every step is mandatory and recorded.`, href: `/portal/tasks/${encodeURIComponent(shortTestTask.id)}` });
  }

  tasks = await listTasks(uid);
  if (!tasks.some((t) => t.generatedKey === dailyKey)) {
    const topic = focus[Math.abs(new Date(`${today}T12:00:00+05:00`).getUTCDay()) % focus.length];
    const allocationId = newAllocId();
    await allocateToStudents([uid], {
      id: allocationId, mode: "assignment_nohelp", content: { type: "drill", paperType, topics: [topic], levels: ["LOT", "HOT"], count: 5 },
      title: `Daily challenge · ${topic}`, instructions: "Targeted practice. The timer is a pacing guide only — it will not lock your answers.", durationMin: 15, lockOnExpiry: false,
      dueAt: duePk(0, 20), startsAt: null, classId: null, className: "Automated study plan", createdBy: OWNER_ID, createdByName: OWNER_NAME,
    });
    const dailyTask = await assignTask(uid, {
      title: `Daily mandatory challenge · ${topic}`, details: "Complete today’s five targeted questions in Exam Lab and submit them.", kind: "challenge", dueAt: duePk(0, 20), points: 10,
      resourceUrl: `/portal/exam-lab?allocation=${encodeURIComponent(allocationId)}`, createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: "daily_challenge", expectedMinutes: 15, generatedKey: dailyKey, sourceId: allocationId,
    });
    await notify({ uids: [uid] }, { type: "challenge", title: `Today’s mandatory challenge · ${topic}`, body: "A five-question targeted challenge is ready in Exam Lab.", href: `/portal/tasks/${encodeURIComponent(dailyTask.id)}` });
  }

  tasks = await listTasks(uid);
  const generated = tasks.filter((t) => t.generatedKey?.startsWith("auto-")).slice(0, 30);
  return { generatedFor: today, level: a.level, levelLabel: a.levelLabel, focusTopics: focus, tasks: generated, openMandatory: generated.filter((t) => t.mandatory && t.status !== "done").length };
}
