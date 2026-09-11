import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing required environment key: ${key}`);

const CLASS_ID = "838a2ca5-3182-4b78-92c1-b542a9b5f201";
const CLASS_NAME = "Lacas JT — AS (Year 1) · G1 · Physics";
const SCHOOL = "Lacas JT";
const OWNER_ID = "a9ed04e6-5386-41c7-8713-fa557431a309";
const OWNER_NAME = "Syed Jabran Ali Kamran · Head of Physics World";
const now = Date.now();
const tag = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex")}`;
const email = `private.student.demo.${tag}@sjabrankamran.com`;
const password = `Qa!${randomBytes(15).toString("base64url")}7z`;
const fullName = "Portal QA Student";
const studentNo = `DEMO-${tag.toUpperCase()}`;
const guardianEmail = `private.guardian.demo.${tag}@sjabrankamran.com`;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let uid = null;
try {
  const { data: classRow, error: classError } = await admin.from("edu_classes").select("id, name").eq("id", CLASS_ID).maybeSingle();
  if (classError || !classRow) throw new Error("Representative class is unavailable.");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, school: SCHOOL, class: CLASS_NAME, demo_account: true, private_qa: true },
  });
  if (createError || !created.user) throw new Error(createError?.message || "Could not create demo user.");
  uid = created.user.id;

  const { error: profileError } = await admin.from("edu_profiles").update({
    full_name: fullName, email, phone: "+92 300 0000000", status: "active",
  }).eq("id", uid);
  if (profileError) throw profileError;

  const { error: roleError } = await admin.from("edu_user_roles").upsert(
    { user_id: uid, role: "student", granted_by: OWNER_ID }, { onConflict: "user_id,role" }
  );
  if (roleError) throw roleError;

  const { data: student, error: studentError } = await admin.from("edu_students").insert({
    profile_id: uid,
    student_no: studentNo,
    date_of_birth: "2009-01-15",
    school: SCHOOL,
    target_qualification: "CAIE A-Level Physics 9702",
    admission_status: "active",
    created_by: OWNER_ID,
  }).select("id").single();
  if (studentError || !student) throw studentError || new Error("Student record was not created.");

  const { error: enrolError } = await admin.from("edu_enrolments").insert({
    class_id: CLASS_ID, student_id: student.id, status: "active", enrolled_on: new Date().toISOString().slice(0, 10),
  });
  if (enrolError) throw enrolError;

  const photoPath = `photos/${uid}/profile.png`;
  const photo = readFileSync("public/icons/icon-192.png");
  const { error: photoError } = await admin.storage.from("portal-data").upload(photoPath, photo, {
    upsert: true, contentType: "image/png", cacheControl: "0",
  });
  if (photoError) throw photoError;

  const onboarding = {
    completed_at: new Date().toISOString(),
    full_name: fullName,
    preferred_name: "QA Student",
    date_of_birth: "2009-01-15",
    gender: "Prefer not to say",
    phone: "+92 300 0000000",
    whatsapp: "+92 300 0000000",
    city: "Lahore",
    address: "Private QA account — not a real student address",
    photo_path: photoPath,
    school: SCHOOL,
    class_label: CLASS_NAME,
    guardians: [{
      relationship: "Guardian", name: "Demo Guardian", email: guardianEmail,
      phone: "+92 300 0000001", is_primary: true,
    }],
    emergency_name: "Demo Guardian",
    emergency_phone: "+92 300 0000001",
    consent: true,
    updated_at: new Date().toISOString(),
  };
  const { error: onboardingError } = await admin.storage.from("portal-data").upload(`onboarding/${uid}.json`, new Blob([JSON.stringify(onboarding)]), {
    upsert: true, contentType: "application/json", cacheControl: "0",
  });
  if (onboardingError) throw onboardingError;

  const secure = JSON.parse(readFileSync("src/lib/exam-lab/secure-bank.json", "utf8"));
  const questionIds = secure.map((q) => q.id);
  if (questionIds.length !== 20) throw new Error("Expected the sealed 20-question test bank.");
  const dailyId = `demo-daily-${tag}`;
  const allocations = [
    {
      id: dailyId, attemptId: `alloc-${dailyId}`, mode: "assignment_nohelp",
      content: { type: "drill", paperType: "P2", topics: ["Physical quantities & units"], levels: ["LOT", "HOT"], count: 5 },
      title: "Demo daily challenge · Physical quantities & units",
      instructions: "Use this private activity to verify how a student's daily challenge opens and submits.",
      durationMin: 15, dueAt: new Date(now + 24 * 3600_000).toISOString(), startsAt: null,
      classId: null, className: "Private QA environment", createdBy: OWNER_ID, createdByName: OWNER_NAME,
      createdAt: now, updatedAt: now, status: "assigned", completedAt: null,
    },
    ...[
      ["ct1-lacas-sep11-7pm", "Class Test 1 · Physical Quantities & Units · 7:00 PM", "2026-09-11T14:00:00.000Z", "2026-09-11T15:00:00.000Z"],
      ["ct1-lacas-sep11-9pm", "Class Test 1 · Physical Quantities & Units · 9:00 PM", "2026-09-11T16:00:00.000Z", "2026-09-11T17:00:00.000Z"],
    ].map(([id, title, startsAt, dueAt]) => ({
      id, attemptId: `alloc-${id}`, mode: "test",
      content: { type: "custom", ids: questionIds }, title,
      instructions: "Strictly proctored CAIE 9702 MCQ test. Complete at least one scheduled sitting.",
      durationMin: 30, dueAt, startsAt, classId: CLASS_ID, className: CLASS_NAME,
      createdBy: OWNER_ID, createdByName: OWNER_NAME, createdAt: now, updatedAt: now,
      status: "assigned", completedAt: null,
    })),
  ];
  const { error: allocationError } = await admin.storage.from("portal-data").upload(`exam-allocations/${uid}.json`, new Blob([JSON.stringify({ items: allocations })]), {
    upsert: true, contentType: "application/json", cacheControl: "0",
  });
  if (allocationError) throw allocationError;

  const tasks = [
    {
      id: `demo-task-daily-${tag}`, title: "Demo daily mandatory challenge · Physical quantities & units",
      details: "Open the linked five-question Exam Lab challenge and submit it.", kind: "challenge",
      dueAt: new Date(now + 24 * 3600_000).toISOString(), points: 10,
      resourceUrl: `/portal/exam-lab?allocation=${encodeURIComponent(dailyId)}`, status: "assigned",
      createdBy: OWNER_ID, createdByName: OWNER_NAME, createdAt: now, updatedAt: now,
      completedAt: null, studentNote: null, mandatory: true, topic: "Physical quantities & units",
      activityType: "daily_challenge", expectedMinutes: 15, generatedKey: `demo:${tag}`, sourceId: dailyId,
    },
    {
      id: `demo-task-assignment-${tag}`, title: "Demo mandatory summary assignment · Physical quantities & units",
      details: "Write a short explanation of SI base units, include one derived-unit example, and submit your response from the task page.",
      kind: "task", dueAt: new Date(now + 48 * 3600_000).toISOString(), points: 10,
      resourceUrl: null, status: "assigned", createdBy: OWNER_ID, createdByName: OWNER_NAME,
      createdAt: now - 1, updatedAt: now, completedAt: null, studentNote: null, mandatory: true,
      topic: "Physical quantities & units", activityType: "assignment", expectedMinutes: 20,
      generatedKey: `demo:${tag}`, sourceId: null,
    },
  ];
  const { error: taskError } = await admin.storage.from("portal-data").upload(`personal-tasks/${uid}.json`, new Blob([JSON.stringify({ tasks })]), {
    upsert: true, contentType: "application/json", cacheControl: "0",
  });
  if (taskError) throw taskError;

  const { error: notificationError } = await admin.from("edu_notifications").insert([
    { user_id: uid, kind: "announcement", title: "Private demo environment ready", body: "This is the student-facing portal QA account.", link: "/portal" },
    { user_id: uid, kind: "challenge", title: "Demo daily challenge assigned", body: "Open the linked task to test the corrected student flow.", link: `/portal/tasks/${encodeURIComponent(tasks[0].id)}` },
    { user_id: uid, kind: "assignment", title: "Demo summary assignment assigned", body: "Open, write a response and submit it from the task page.", link: `/portal/tasks/${encodeURIComponent(tasks[1].id)}` },
  ]);
  if (notificationError) throw notificationError;

  await admin.from("edu_audit_logs").insert({
    actor_id: OWNER_ID, action: "qa.student.create", entity: "edu_profiles", entity_id: uid,
    details: { class_id: CLASS_ID, school: SCHOOL, private_demo: true },
  });

  const authCheck = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: login, error: loginError } = await authCheck.auth.signInWithPassword({ email, password });
  if (loginError || login.user?.id !== uid) throw new Error("Created account failed the password-login check.");
  await authCheck.auth.signOut();

  const archive = "/root/private-credentials-archive";
  mkdirSync(archive, { recursive: true, mode: 0o700 });
  chmodSync(archive, 0o700);
  const credentialPath = `${archive}/SJAK-Portal-Private-Demo-Student-${tag}.txt`;
  const sheet = [
    "SJAK PORTAL — PRIVATE DEMO STUDENT",
    "==================================",
    `Created: ${new Date().toISOString()}`,
    "Purpose: Super-admin QA of the exact student-facing portal experience",
    "",
    "Login URL: https://sjabrankamran.com/portal/login",
    `Email: ${email}`,
    `Password: ${password}`,
    "",
    `Student: ${fullName}`,
    `School/Class: ${CLASS_NAME}`,
    `Student number: ${studentNo}`,
    "Onboarding: complete (private placeholder profile + guardian contact)",
    "Seeded: timetable access, two scheduled tests, one daily challenge, one written assignment, notifications",
    "",
    "SECURITY: Private QA credential. Do not publish or share with students.",
  ].join("\n");
  writeFileSync(credentialPath, sheet, { mode: 0o600 });
  chmodSync(credentialPath, 0o600);

  console.log(JSON.stringify({
    ok: true, uid, classId: CLASS_ID, credentialPath,
    checks: { passwordLogin: true, onboardingComplete: true, enrolments: 1, allocations: allocations.length, tasks: tasks.length, notifications: 3 },
  }, null, 2));
} catch (error) {
  if (uid) await admin.auth.admin.deleteUser(uid).catch(() => {});
  throw error;
}
