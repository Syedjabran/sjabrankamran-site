import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";
import { listTasks, setTaskStatus, type TaskStatus } from "@/lib/portal/tasks";
import { ensureStudyPlan } from "@/lib/portal/study-plan";

export const runtime = "nodejs";

/** GET — the signed-in user's own individualised tasks & challenges. */
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (user.roles.includes("student")) await ensureStudyPlan(user.id).catch(() => null);
  try {
    return NextResponse.json({ tasks: await listTasks(user.id) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Your tasks couldn't be loaded. Please try again." }, { status: 503 });
  }
}

/** POST { task_id, status, note? } — update the status of one of my own tasks. */
export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { task_id?: string; status?: string; note?: string } | null;
  const valid: TaskStatus[] = ["assigned", "in_progress", "done"];
  if (!b?.task_id || !valid.includes((b.status || "") as TaskStatus)) {
    return NextResponse.json({ error: "task_id and a valid status are required." }, { status: 400 });
  }
  const t = await setTaskStatus(user.id, b.task_id, b.status as TaskStatus, b.note);
  if (!t) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ ok: true, task: t }, { status: 200 });
}
