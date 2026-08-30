/**
 * Individualised tasks & challenges. SERVER-ONLY (service-role, Storage-as-DB).
 *
 * Super-admins/admins can assign a task or challenge to ONE specific student
 * (in addition to class assignments and platform-wide challenges). Students see
 * their personal tasks in "My Learning" and can mark them in-progress / done.
 *
 * No DDL — everything lives as JSON in the private `portal-data` bucket:
 *   portal-data/personal-tasks/<uid>.json  → { tasks: PersonalTask[] }
 */
import { createAdminClient } from "@/lib/supabase/admin";

const DATA = "portal-data";
function tpath(uid: string) { return `personal-tasks/${uid}.json`; }
function newId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export type TaskKind = "task" | "challenge";
export type TaskStatus = "assigned" | "in_progress" | "done";

export type PersonalTask = {
  id: string;
  title: string;
  details: string;
  kind: TaskKind;
  dueAt: string | null;
  points: number | null;
  resourceUrl: string | null;
  status: TaskStatus;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  studentNote: string | null;
};

type Store = { tasks: PersonalTask[] };

async function readStore(uid: string): Promise<Store> {
  try {
    const { data } = await createAdminClient().storage.from(DATA).download(tpath(uid));
    if (data) return JSON.parse(await data.text()) as Store;
  } catch { /* none */ }
  return { tasks: [] };
}

async function writeStore(uid: string, store: Store): Promise<boolean> {
  try {
    const body = new Blob([JSON.stringify(store)], { type: "application/json" });
    const { error } = await createAdminClient().storage.from(DATA).upload(tpath(uid), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
    return !error;
  } catch { return false; }
}

/** Full list for one user (admin view or the student's own view). Newest first. */
export async function listTasks(uid: string): Promise<PersonalTask[]> {
  const store = await readStore(uid);
  return [...store.tasks].sort((a, b) => b.createdAt - a.createdAt);
}

export async function assignTask(uid: string, input: {
  title: string; details?: string; kind?: TaskKind; dueAt?: string | null;
  points?: number | null; resourceUrl?: string | null; createdBy: string; createdByName: string;
}): Promise<PersonalTask> {
  const now = Date.now();
  const task: PersonalTask = {
    id: newId(),
    title: input.title.slice(0, 200),
    details: (input.details || "").slice(0, 4000),
    kind: input.kind === "challenge" ? "challenge" : "task",
    dueAt: input.dueAt ? new Date(input.dueAt).toISOString() : null,
    points: input.points != null && !Number.isNaN(input.points) ? Math.max(0, Math.round(input.points)) : null,
    resourceUrl: (input.resourceUrl || "").trim() || null,
    status: "assigned",
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    studentNote: null,
  };
  const store = await readStore(uid);
  store.tasks.unshift(task);
  await writeStore(uid, store.tasks.length > 500 ? { tasks: store.tasks.slice(0, 500) } : store);
  return task;
}

/** Admin removes a personal task. */
export async function removeTask(uid: string, taskId: string): Promise<boolean> {
  const store = await readStore(uid);
  const before = store.tasks.length;
  store.tasks = store.tasks.filter((t) => t.id !== taskId);
  if (store.tasks.length === before) return false;
  return writeStore(uid, store);
}

/** Admin edits a personal task in place. */
export async function updateTask(uid: string, taskId: string, patch: Partial<Pick<PersonalTask, "title" | "details" | "kind" | "dueAt" | "points" | "resourceUrl">>): Promise<PersonalTask | null> {
  const store = await readStore(uid);
  const t = store.tasks.find((x) => x.id === taskId);
  if (!t) return null;
  if (patch.title != null) t.title = patch.title.slice(0, 200);
  if (patch.details != null) t.details = patch.details.slice(0, 4000);
  if (patch.kind != null) t.kind = patch.kind === "challenge" ? "challenge" : "task";
  if (patch.dueAt !== undefined) t.dueAt = patch.dueAt ? new Date(patch.dueAt).toISOString() : null;
  if (patch.points !== undefined) t.points = patch.points != null ? Math.max(0, Math.round(patch.points)) : null;
  if (patch.resourceUrl !== undefined) t.resourceUrl = (patch.resourceUrl || "").trim() || null;
  t.updatedAt = Date.now();
  await writeStore(uid, store);
  return t;
}

/** Student updates their own task status / adds a note. */
export async function setTaskStatus(uid: string, taskId: string, status: TaskStatus, note?: string): Promise<PersonalTask | null> {
  const store = await readStore(uid);
  const t = store.tasks.find((x) => x.id === taskId);
  if (!t) return null;
  t.status = status;
  t.completedAt = status === "done" ? Date.now() : null;
  if (note !== undefined) t.studentNote = note.slice(0, 1000) || null;
  t.updatedAt = Date.now();
  await writeStore(uid, store);
  return t;
}

/** Lightweight counts for dashboards. */
export function summarise(tasks: PersonalTask[]) {
  return {
    total: tasks.length,
    open: tasks.filter((t) => t.status !== "done").length,
    done: tasks.filter((t) => t.status === "done").length,
    challenges: tasks.filter((t) => t.kind === "challenge").length,
  };
}
