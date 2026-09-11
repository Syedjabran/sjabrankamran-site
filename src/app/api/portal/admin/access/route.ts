import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit, isSuperAdmin, requireAdmin } from "@/lib/portal/admin";
import { getRegistry } from "@/lib/portal/institutions";
import {
  getAccessControlDocument,
  saveAccessControlDocument,
} from "@/lib/portal/access-control";
import {
  isRestrictionActive,
  classScopeKey,
  type AccessRestriction,
  type AccessRestrictionMode,
  type AccessScopeType,
} from "@/lib/portal/access-shared";
import type { EduRole } from "@/lib/edu/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
  const user = await requireAdmin();
  return user && isSuperAdmin(user) ? user : null;
}

async function targetOptions() {
  const [registry, profilesResult] = await Promise.all([
    getRegistry(),
    createAdminClient()
      .from("edu_profiles")
      .select("id, full_name, email, edu_user_roles!edu_user_roles_user_id_fkey(role)")
      .order("full_name", { ascending: true }),
  ]);

  type ProfileRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    edu_user_roles?: { role: EduRole }[];
  };
  const users = ((profilesResult.data || []) as unknown as ProfileRow[])
    .map((p) => ({
      id: p.id,
      label: p.full_name || p.email || "Unnamed user",
      email: p.email || "",
      roles: (p.edu_user_roles || []).map((r) => r.role),
    }))
    .filter((u) => !u.roles.includes("super_admin"));

  const classMap = new Map<string, { key: string; label: string; classIds: string[] }>();
  for (const c of registry.classes) {
    const key = classScopeKey(c.school, c.year);
    const found = classMap.get(key) || { key, label: `${c.school} — ${c.year}`, classIds: [] };
    if (!found.classIds.includes(c.id)) found.classIds.push(c.id);
    classMap.set(key, found);
  }

  const groups = registry.classes.map((c) => ({
    key: c.id,
    label: `${c.school} — ${c.year}${c.section ? ` · ${c.section}` : ""}`,
    classIds: [c.id],
  })).sort((a, b) => a.label.localeCompare(b.label));

  return {
    users,
    schools: [...registry.schools].sort().map((school) => ({ key: school, label: school })),
    classes: [...classMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    groups,
  };
}

export async function GET() {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Super admins only." }, { status: 403 });
  const [doc, options] = await Promise.all([getAccessControlDocument(true), targetOptions()]);
  return NextResponse.json({
    restrictions: [...doc.restrictions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    options,
    now: new Date().toISOString(),
  }, { status: 200, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Super admins only." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    scopeType?: AccessScopeType;
    scopeKey?: string;
    mode?: AccessRestrictionMode;
    message?: string;
    endsAt?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const scopeType = body.scopeType;
  const scopeKey = (body.scopeKey || "").trim();
  const mode = body.mode;
  const message = (body.message || "").trim();
  if (!scopeType || !["user", "school", "class", "group"].includes(scopeType)) {
    return NextResponse.json({ error: "Choose a valid access scope." }, { status: 400 });
  }
  if (!scopeKey) return NextResponse.json({ error: "Choose who this restriction applies to." }, { status: 400 });
  if (!mode || !["locked", "suspended"].includes(mode)) {
    return NextResponse.json({ error: "Choose Lock or Temporary suspension." }, { status: 400 });
  }
  if (message.length < 10 || message.length > 1200) {
    return NextResponse.json({ error: "The custom message must contain 10–1,200 characters." }, { status: 400 });
  }

  let endsAt: string | null = null;
  if (mode === "suspended") {
    const end = Date.parse(body.endsAt || "");
    if (!Number.isFinite(end) || end <= Date.now() + 60_000) {
      return NextResponse.json({ error: "Choose a suspension end time at least one minute in the future." }, { status: 400 });
    }
    endsAt = new Date(end).toISOString();
  }

  const options = await targetOptions();
  let scopeLabel = "";
  let classIds: string[] = [];
  if (scopeType === "user") {
    const found = options.users.find((u) => u.id === scopeKey);
    if (!found) return NextResponse.json({ error: "User not found, or this is a protected super-admin account." }, { status: 404 });
    scopeLabel = `${found.label}${found.email ? ` (${found.email})` : ""}`;
  } else if (scopeType === "school") {
    const found = options.schools.find((s) => s.key === scopeKey);
    if (!found) return NextResponse.json({ error: "School not found." }, { status: 404 });
    scopeLabel = found.label;
  } else if (scopeType === "class") {
    const found = options.classes.find((c) => c.key === scopeKey);
    if (!found) return NextResponse.json({ error: "Class not found." }, { status: 404 });
    scopeLabel = found.label;
    classIds = found.classIds;
  } else {
    const found = options.groups.find((g) => g.key === scopeKey);
    if (!found) return NextResponse.json({ error: "Group not found." }, { status: 404 });
    scopeLabel = found.label;
    classIds = found.classIds;
  }

  const doc = await getAccessControlDocument(true);
  const duplicate = doc.restrictions.find((r) =>
    r.scopeType === scopeType && r.scopeKey === scopeKey && isRestrictionActive(r)
  );
  if (duplicate) {
    return NextResponse.json({ error: "An active restriction already exists for this target. Release it before creating another." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const restriction: AccessRestriction = {
    id: crypto.randomUUID(),
    scopeType,
    scopeKey,
    scopeLabel,
    classIds,
    mode,
    message,
    startsAt: now,
    endsAt,
    createdAt: now,
    createdBy: owner.id,
    releasedAt: null,
    releasedBy: null,
  };
  doc.restrictions.push(restriction);
  await saveAccessControlDocument(doc);
  await audit(owner.id, `access.${mode}`, "portal_access", restriction.id, {
    scopeType, scopeKey, scopeLabel, classIds, endsAt,
  });
  return NextResponse.json({ ok: true, restriction }, { status: 201 });
}

export async function PATCH(req: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Super admins only." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: string; action?: string } | null;
  if (!body?.id || body.action !== "release") {
    return NextResponse.json({ error: "A restriction id and release action are required." }, { status: 400 });
  }

  const doc = await getAccessControlDocument(true);
  const index = doc.restrictions.findIndex((r) => r.id === body.id);
  if (index < 0) return NextResponse.json({ error: "Restriction not found." }, { status: 404 });
  const current = doc.restrictions[index];
  if (!isRestrictionActive(current)) {
    return NextResponse.json({ error: "This restriction is no longer active." }, { status: 409 });
  }
  const releasedAt = new Date().toISOString();
  doc.restrictions[index] = { ...current, releasedAt, releasedBy: owner.id };
  await saveAccessControlDocument(doc);
  await audit(owner.id, "access.release", "portal_access", current.id, {
    scopeType: current.scopeType,
    scopeKey: current.scopeKey,
    scopeLabel: current.scopeLabel,
  });
  return NextResponse.json({ ok: true, releasedAt }, { status: 200 });
}
