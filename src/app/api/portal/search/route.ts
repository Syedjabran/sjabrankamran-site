import { NextResponse } from "next/server";
import { getPortalUser, isStaff } from "@/lib/edu/auth";
import { effectiveRoles } from "@/lib/portal/view-as";
import { listResources } from "@/lib/portal/resources";
import { listTasks } from "@/lib/portal/tasks";
import { listAllocations } from "@/lib/exam-lab/allocations";
import { IMAGE_BANK, IMAGE_PAPERS } from "@/lib/exam-lab/image-bank";

export const runtime = "nodejs";

/**
 * GET /api/portal/search?q=…&types=resource,task,…
 *
 * Role-safe portal-wide search. Every source is already scoped to the
 * signed-in user: resources are portal-wide by design, tasks/allocations are
 * the caller's own stores, topics/papers are public bank metadata. Nothing
 * here widens access; it only aggregates what the user could already open.
 *
 * Matching: case/diacritic-insensitive substring over title + secondary
 * fields, with light typo tolerance (all query tokens must fuzzy-hit).
 * Each result carries `why`, naming the matched field (spec: explain match).
 */

type Hit = {
  type: "page" | "resource" | "task" | "assignment" | "topic" | "paper";
  title: string;
  subtitle: string | null;
  href: string;
  why: string;
  due?: string | null;
  score: number;
};

const PAGES: { label: string; href: string; keywords: string }[] = [
  { label: "Dashboard", href: "/portal", keywords: "home overview" },
  { label: "Exam Lab", href: "/portal/exam-lab", keywords: "past papers drills tests practice sit paper" },
  { label: "My Learning", href: "/portal/learn", keywords: "assignments lessons homework" },
  { label: "Study Plan", href: "/portal/study-plan", keywords: "weekly plan daily challenge" },
  { label: "Resources", href: "/portal/resources", keywords: "notes videos pdf simulations materials" },
  { label: "Library", href: "/portal/library", keywords: "community questions forum answers" },
  { label: "My Progress", href: "/portal/progress", keywords: "results analytics marks performance" },
  { label: "My Ranking", href: "/portal/my-ranking", keywords: "leaderboard position points" },
  { label: "Timetable", href: "/portal/timetable", keywords: "schedule classes calendar" },
  { label: "Notifications", href: "/portal/notifications", keywords: "alerts announcements" },
  { label: "Settings", href: "/portal/settings", keywords: "profile password account" },
];

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Token hits when contained, or within edit-distance 1 of any word (typo tolerance). */
function tokenHits(token: string, haystack: string): boolean {
  if (haystack.includes(token)) return true;
  if (token.length < 4) return false;
  for (const word of haystack.split(/[^a-z0-9]+/)) {
    if (Math.abs(word.length - token.length) > 1) continue;
    let i = 0, j = 0, edits = 0;
    while (i < token.length && j < word.length) {
      if (token[i] === word[j]) { i++; j++; continue; }
      if (++edits > 1) break;
      if (token.length > word.length) i++;
      else if (word.length > token.length) j++;
      else { i++; j++; }
    }
    if (edits + (token.length - i) + (word.length - j) <= 1) return true;
  }
  return false;
}

function match(q: string[], fields: { text: string; name: string; weight: number }[]): { score: number; why: string } | null {
  let score = 0;
  const whyParts = new Set<string>();
  for (const token of q) {
    let hit = false;
    for (const f of fields) {
      const h = norm(f.text);
      if (tokenHits(token, h)) {
        hit = true;
        score += f.weight + (h.startsWith(token) ? 2 : 0);
        whyParts.add(f.name);
      }
    }
    if (!hit) return null; // every token must hit somewhere
  }
  return { score, why: `Matched ${[...whyParts].slice(0, 2).join(" and ")}` };
}

export async function GET(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { roles } = await effectiveRoles(user);

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const typeFilter = new Set((url.searchParams.get("types") || "").split(",").filter(Boolean));
  if (qRaw.length < 2) return NextResponse.json({ query: qRaw, results: [] }, { status: 200 });
  const q = norm(qRaw).split(/\s+/).filter(Boolean).slice(0, 6);
  const want = (t: Hit["type"]) => !typeFilter.size || typeFilter.has(t);

  const hits: Hit[] = [];

  // 1 — portal pages
  if (want("page")) {
    for (const p of PAGES) {
      const m = match(q, [
        { text: p.label, name: "the page name", weight: 6 },
        { text: p.keywords, name: "what the page covers", weight: 3 },
      ]);
      if (m) hits.push({ type: "page", title: p.label, subtitle: null, href: p.href, why: m.why, score: m.score });
    }
  }

  // 2 — syllabus topics + past papers (bank metadata; public within the portal)
  if (want("topic")) {
    const topics = [...new Set(IMAGE_BANK.map((x) => x.topic).filter((t): t is string => !!t))];
    for (const t of topics) {
      const m = match(q, [{ text: t, name: "the topic name", weight: 5 }]);
      if (m) {
        const n = IMAGE_BANK.filter((x) => x.topic === t).length;
        hits.push({ type: "topic", title: t, subtitle: `${n} bank questions · start a drill`, href: `/portal/exam-lab`, why: m.why, score: m.score });
      }
    }
  }
  if (want("paper")) {
    for (const p of IMAGE_PAPERS) {
      const m = match(q, [
        { text: p.code, name: "the paper code", weight: 5 },
        { text: p.ref, name: "the paper reference", weight: 4 },
        { text: p.paperType, name: "the paper type", weight: 2 },
      ]);
      if (m) hits.push({ type: "paper", title: p.ref || p.code, subtitle: "Sit this past paper in Exam Lab", href: `/portal/exam-lab`, why: m.why, score: m.score });
    }
  }

  // 3 — per-user stores + shared resources, best-effort in parallel
  const [resources, tasks, allocations] = await Promise.all([
    want("resource") ? listResources().catch(() => []) : Promise.resolve([]),
    want("task") ? listTasks(user.id).catch(() => []) : Promise.resolve([]),
    want("assignment") ? listAllocations(user.id).catch(() => []) : Promise.resolve([]),
  ]);

  for (const r of resources) {
    const m = match(q, [
      { text: r.title, name: "the title", weight: 6 },
      { text: r.description || "", name: "the description", weight: 3 },
      { text: r.category || "", name: "the category", weight: 4 },
      { text: r.kind, name: "the resource type", weight: 2 },
    ]);
    if (m) hits.push({ type: "resource", title: r.title, subtitle: `${r.category || "Resource"} · ${r.kind}`, href: "/portal/resources", why: m.why, score: m.score });
  }
  for (const t of tasks) {
    if (t.status === "done") continue;
    const m = match(q, [
      { text: t.title, name: "the task title", weight: 6 },
      { text: t.topic || "", name: "the topic", weight: 4 },
      { text: t.details || "", name: "the details", weight: 2 },
    ]);
    if (m) hits.push({ type: "task", title: t.title, subtitle: t.mandatory ? "Mandatory task" : "Task", href: `/portal/tasks/${encodeURIComponent(t.id)}`, why: m.why, due: t.dueAt, score: m.score + 1 });
  }
  for (const a of allocations) {
    if (a.status !== "assigned" && a.status !== "in_progress" && a.status !== "unlocked") continue;
    const m = match(q, [
      { text: a.title, name: "the assignment title", weight: 6 },
      { text: a.mode === "test" ? "test proctored" : "assignment", name: "the kind", weight: 2 },
    ]);
    if (m) hits.push({ type: "assignment", title: a.title, subtitle: a.mode === "test" ? "Proctored test" : "Exam Lab assignment", href: `/portal/exam-lab?allocation=${encodeURIComponent(a.id)}`, why: m.why, due: a.dueAt, score: m.score + 2 });
  }

  // Staff see a hint that admin screens are searched from their own nav, not here.
  const staffNote = isStaff(roles) ? "Admin screens are reachable from the navigation; this search covers learning content." : null;

  hits.sort((a, b) => b.score - a.score);
  return NextResponse.json({ query: qRaw, note: staffNote, results: hits.slice(0, 30) }, { status: 200 });
}
