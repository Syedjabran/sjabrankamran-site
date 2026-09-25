/** Automated weakness-led study plans. SERVER-ONLY. */
import { getAttempts } from "@/lib/exam-lab/attempts";
import { analyse } from "@/lib/exam-lab/analytics";
import { allocateToStudents, listAllocations, newAllocId } from "@/lib/exam-lab/allocations";
import { assignTask, listTasks, type PersonalTask } from "@/lib/portal/tasks";
import { notify } from "@/lib/portal/notifications";
import { getRegistry } from "@/lib/portal/institutions";
import { createAdminClient } from "@/lib/supabase/admin";
import { classesForUids, coveredTopicsForClasses, DEFAULT_COURSE } from "@/lib/exam-lab/syllabus-coverage";
import { pkToday } from "@/lib/portal/pk-time";

const OWNER_ID = "a9ed04e6-5386-41c7-8713-fa557431a309";
const OWNER_NAME = "Syed Jabran Ali Kamran · Head of Physics World";

function pkDate(offsetDays = 0) {
  return pkToday(Date.now() + offsetDays * 86400_000);
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
// Cambridge O Level Physics (5054) topic frontier (mirrors bank TOPICS.OL).
const OL_TOPICS = [
  "Measurements & units", "Kinematics", "Dynamics & forces", "Mass, weight & density",
  "Turning effects & pressure", "Energy, work & power", "Momentum",
  "Kinetic model & thermal properties", "Transfer of thermal energy",
  "General wave properties", "Light & optics", "Electromagnetic spectrum & sound",
  "Magnetism", "Electrical quantities & circuits", "Practical electricity & safety",
  "Electromagnetic effects", "Radioactivity & the nuclear atom",
];
const CANONICAL_TOPICS = [...AS_TOPICS, ...A2_TOPICS, ...OL_TOPICS];
function safeTopic(topic: string) { return TOPIC_MAP[topic] || topic; }
function searchUrl(kind: "resources" | "video" | "simulation", topic: string, syllabusLabel = "CAIE 9702 Physics") {
  const q = encodeURIComponent(`${syllabusLabel} ${topic}`);
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
async function courseStage(uid: string): Promise<"AS" | "A2" | "OL"> {
  try {
    const db = createAdminClient();
    const { data: student } = await db.from("edu_students").select("id").eq("profile_id", uid).maybeSingle();
    if (!student?.id) return "AS";
    const { data: enrolments } = await db.from("edu_enrolments").select("class_id").eq("student_id", student.id).eq("status", "active");
    const ids = new Set((enrolments || []).map((e) => e.class_id as string));
    const registry = await getRegistry();
    const years = registry.classes.filter((c) => ids.has(c.id)).map((c) => c.year.toUpperCase());
    // O Level (5054) takes precedence when the enrolled class is an O-Level cohort.
    if (years.some((y) => y.includes("O LEVEL") || y.includes("O-LEVEL") || y.includes("OLEVEL") || y.includes("5054") || /^O[\s-]?\d/.test(y))) return "OL";
    return years.some((y) => y === "A2" || y.includes("YEAR 2")) ? "A2" : "AS";
  } catch {
    return "AS";
  }
}

/**
 * Idempotently creates one weekly preparation sequence plus today's targeted
 * daily challenge. All generated work is stored in the normal task/allocation
 * records, so completion and submission remain auditable.
 *
 * SYLLABUS GATING (owner rule): question-drawing work is generated ONLY from
 * topics confirmed completed on the Syllabus coverage page for the student's
 * class/school. If nothing is marked complete, no drill/test/challenge is
 * created at all — never random uncovered syllabus.
 */
export async function ensureStudyPlan(uid: string): Promise<StudyPlanSummary> {
  const [attempts, stage, classes] = await Promise.all([
    getAttempts(uid).catch(() => []),
    courseStage(uid),
    classesForUids([uid]).catch(() => []),
  ]);
  // O-Level cohorts track the 5054 coverage board; everyone else tracks 9702.
  const course = stage === "OL" ? "5054" : DEFAULT_COURSE;
  const covered = await coveredTopicsForClasses(course, classes).catch(() => new Set<string>());
  const syllabusLabel = stage === "OL" ? "Cambridge O Level 5054 Physics" : "CAIE 9702 Physics";
  const a = analyse(attempts);
  // The teachable frontier = the course stage filtered to covered topics only.
  const stageTopics = (stage === "A2" ? A2_TOPICS : stage === "OL" ? OL_TOPICS : AS_TOPICS).filter((t) => covered.has(t));
  const paperType = stage === "A2" ? "P4" : "P2";
  const rawFocus = a.weaknesses.length ? a.weaknesses.map((x) => safeTopic(x.topic)) : stageTopics.slice(0, 3);
  // De-duplicate and keep only covered, canonical topics.
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

  if (!focus.length) {
    // Nothing is marked complete for this student's class yet: per the owner
    // rule we refuse to generate question work from uncovered syllabus.
    // Non-question plan steps are skipped too — the whole plan keys off the
    // covered-topic frontier. Staff see the nudge in the summary.
    const generatedNone = tasks.filter((t) => t.generatedKey?.startsWith("auto-")).slice(0, 30);
    return {
      generatedFor: today, level: a.level, levelLabel: a.levelLabel, focusTopics: [],
      tasks: generatedNone, openMandatory: generatedNone.filter((t) => t.mandatory && t.status !== "done").length,
    };
  }

  // Weekly sequence. The short-test allocation is created BEFORE any task, and
  // each piece is checked separately, so a failure part-way (e.g. the
  // allocation write throws) never leaves the week key present with the test
  // missing: the next run creates only what is absent, reusing this week's
  // test allocation if one already exists.
  const weekTasks = tasks.filter((t) => t.generatedKey === weeklyKey);
  const hasStep = (type: PersonalTask["activityType"]) => weekTasks.some((t) => t.activityType === type);
  const topic = weekTasks.find((t) => t.topic)?.topic || focus[0];
  const specs: Array<Pick<PersonalTask, "title" | "details" | "activityType" | "expectedMinutes"> & { url: string | null; due: string }> = [
    { title: `Targeted study material · ${topic}`, details: `Read a concise explanation and make five retrieval notes on ${topic}.`, activityType: "study_material", expectedMinutes: 20, url: searchUrl("resources", topic), due: duePk(1, 20) },
    { title: `Video lesson · ${topic}`, details: "Watch one focused lesson, pause to solve each worked example, and record your key correction.", activityType: "video", expectedMinutes: 25, url: searchUrl("video", topic), due: duePk(2, 20) },
    { title: `Interactive simulation · ${topic}`, details: "Explore a relevant Physics simulation. Change at least two variables and write what changes and why.", activityType: "simulation", expectedMinutes: 20, url: searchUrl("simulation", topic), due: duePk(3, 20) },
    { title: `Mandatory summary assignment · ${topic}`, details: "Submit a structured one-page explanation: definitions, equations, one worked example and your most common error.", activityType: "assignment", expectedMinutes: 35, url: null, due: duePk(4, 20) },
  ];
  const missingSpecs = specs.filter((spec) => !hasStep(spec.activityType));
  if (missingSpecs.length || !hasStep("short_test")) {
    let testId: string | null = null;
    if (!hasStep("short_test")) {
      const weekStart = Date.parse(`${monday}T00:00:00+05:00`);
      const existingTest = (await listAllocations(uid)).find((x) => x.createdBy === OWNER_ID && x.title.startsWith("Weekly short test · ") && x.createdAt >= weekStart);
      testId = existingTest?.id || newAllocId();
      await allocateToStudents([uid], {
        id: testId, mode: "assignment_nohelp", content: { type: "drill", paperType, topics: [topic], levels: a.level >= 5 ? ["LOT", "HOT"] : ["LOT"], count: 10 },
        title: `Weekly short test · ${topic}`, instructions: "Diagnostic check. The timer is a pacing guide only — it will not lock your answers, and you may switch tabs freely.", durationMin: 25, lockOnExpiry: false, integrity: "off",
        dueAt: duePk(5, 20), startsAt: null, classId: null, className: "Automated study plan", createdBy: OWNER_ID, createdByName: OWNER_NAME,
      });
    }
    for (const s of missingSpecs) await assignTask(uid, {
      title: s.title, details: s.details, kind: "task", dueAt: s.due, points: 10, resourceUrl: s.url,
      createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: s.activityType,
      expectedMinutes: s.expectedMinutes, generatedKey: weeklyKey,
    });
    const shortTestTask = testId ? await assignTask(uid, {
      title: `Mandatory short test · ${topic}`, details: "Complete the assigned 10-question diagnostic in Exam Lab and submit it.", kind: "challenge", dueAt: duePk(5, 20), points: 20,
      resourceUrl: `/portal/exam-lab?allocation=${encodeURIComponent(testId)}`, createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: "short_test", expectedMinutes: 25, generatedKey: weeklyKey, sourceId: testId,
    }) : null;
    if (!weekTasks.length && shortTestTask) {
      await notify({ uids: [uid] }, { type: "assignment", title: "Your personalised weekly study plan is ready", body: `This week focuses on ${topic}. Every step is mandatory and recorded.`, href: `/portal/tasks/${encodeURIComponent(shortTestTask.id)}` });
    }
  }

  tasks = await listTasks(uid);
  // The daily challenge is due at 20:00 PKT. A plan generated after that has
  // no "today" left, so it sets TOMORROW's challenge (keyed to tomorrow, so
  // tomorrow's run does not add a second one) instead of one already late.
  const pastCutoff = Date.now() >= Date.parse(duePk(0, 20));
  const dailyOffset = pastCutoff ? 1 : 0;
  const dailyFor = pkDate(dailyOffset);
  const dailyForKey = `auto-daily:${dailyFor}`;
  if (!tasks.some((t) => t.generatedKey === dailyKey || t.generatedKey === dailyForKey)) {
    const topic = focus[Math.abs(new Date(`${dailyFor}T12:00:00+05:00`).getUTCDay()) % focus.length];
    const dayWord = pastCutoff ? "Tomorrow’s" : "Today’s";
    const allocationId = newAllocId();
    await allocateToStudents([uid], {
      id: allocationId, mode: "assignment_nohelp", content: { type: "drill", paperType, topics: [topic], levels: ["LOT", "HOT"], count: 5 },
      title: `Daily challenge · ${topic}`, instructions: "Targeted practice. The timer is a pacing guide only — it will not lock your answers, and you may switch tabs freely.", durationMin: 15, lockOnExpiry: false, integrity: "off",
      dueAt: duePk(dailyOffset, 20), startsAt: null, classId: null, className: "Automated study plan", createdBy: OWNER_ID, createdByName: OWNER_NAME, daily: true,
    });
    const dailyTask = await assignTask(uid, {
      title: `Daily mandatory challenge · ${topic}`, details: `Complete ${dayWord.toLowerCase()} five targeted questions in Exam Lab and submit them.`, kind: "challenge", dueAt: duePk(dailyOffset, 20), points: 10,
      resourceUrl: `/portal/exam-lab?allocation=${encodeURIComponent(allocationId)}`, createdBy: OWNER_ID, createdByName: OWNER_NAME, mandatory: true, topic, activityType: "daily_challenge", expectedMinutes: 15, generatedKey: dailyForKey, sourceId: allocationId,
    });
    await notify({ uids: [uid] }, { type: "challenge", title: `${dayWord} mandatory challenge · ${topic}`, body: "A five-question targeted challenge is ready in Exam Lab.", href: `/portal/tasks/${encodeURIComponent(dailyTask.id)}` });
  }

  tasks = await listTasks(uid);
  const generated = tasks.filter((t) => t.generatedKey?.startsWith("auto-")).slice(0, 30);
  return { generatedFor: today, level: a.level, levelLabel: a.levelLabel, focusTopics: focus, tasks: generated, openMandatory: generated.filter((t) => t.mandatory && t.status !== "done").length };
}
