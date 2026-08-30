import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, audit } from "@/lib/portal/admin";
import { listTasks, assignTask, removeTask, updateTask, type TaskKind } from "@/lib/portal/tasks";

export const runtime = "nodejs";

/** GET — list a single user's individualised tasks & challenges. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  return NextResponse.json({ tasks: await listTasks(uid) }, { status: 200 });
}

/** POST — assign a new personal task/challenge to this user. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const b = (await req.json().catch(() => null)) as {
    title?: string; details?: string; kind?: TaskKind; due_at?: string | null;
    points?: number | null; resource_url?: string | null; notify?: boolean;
  } | null;
  if (!b?.title || !b.title.trim()) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const task = await assignTask(uid, {
    title: b.title.trim(),
    details: b.details,
    kind: b.kind,
    dueAt: b.due_at ?? null,
    points: b.points ?? null,
    resourceUrl: b.resource_url ?? null,
    createdBy: admin.id,
    createdByName: admin.fullName || admin.email || "Admin",
  });

  // Notify the student in-portal (best-effort).
  if (b.notify !== false) {
    try {
      await createAdminClient().from("edu_notifications").insert({
        user_id: uid,
        kind: task.kind === "challenge" ? "challenge" : "task",
        title: `New personal ${task.kind}: ${task.title}`,
        body: task.details || "Your teacher has set you an individual task. Open My Learning to view it.",
        link: "/portal/learn",
      });
    } catch { /* notifications table optional */ }
  }

  await audit(admin.id, "personal_task.assign", "edu_profiles", uid, { taskId: task.id, kind: task.kind, title: task.title });
  return NextResponse.json({ ok: true, task }, { status: 200 });
}

/** PATCH — edit an existing personal task. body: { task_id, ...fields } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const b = (await req.json().catch(() => null)) as {
    task_id?: string; title?: string; details?: string; kind?: TaskKind;
    due_at?: string | null; points?: number | null; resource_url?: string | null;
  } | null;
  if (!b?.task_id) return NextResponse.json({ error: "task_id required." }, { status: 400 });
  const t = await updateTask(uid, b.task_id, {
    title: b.title, details: b.details, kind: b.kind,
    dueAt: b.due_at, points: b.points, resourceUrl: b.resource_url,
  });
  if (!t) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await audit(admin.id, "personal_task.update", "edu_profiles", uid, { taskId: b.task_id });
  return NextResponse.json({ ok: true, task: t }, { status: 200 });
}

/** DELETE ?task_id= — remove a personal task. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id: uid } = await params;
  const taskId = new URL(req.url).searchParams.get("task_id") || "";
  if (!taskId) return NextResponse.json({ error: "task_id required." }, { status: 400 });
  const ok = await removeTask(uid, taskId);
  if (!ok) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  await audit(admin.id, "personal_task.remove", "edu_profiles", uid, { taskId });
  return NextResponse.json({ ok: true }, { status: 200 });
}
