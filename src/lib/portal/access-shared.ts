export const ACCESS_CONTROL_BUCKET = "portal-data";
export const ACCESS_CONTROL_PATH = "access/access-control.json";

export type AccessScopeType = "user" | "school" | "class" | "group";
export type AccessRestrictionMode = "locked" | "suspended";

export type AccessRestriction = {
  id: string;
  scopeType: AccessScopeType;
  scopeKey: string;
  scopeLabel: string;
  /** Class ids materialised when a class-level or exact group restriction is created. */
  classIds: string[];
  mode: AccessRestrictionMode;
  message: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  createdBy: string;
  releasedAt: string | null;
  releasedBy: string | null;
};

export type AccessControlDocument = {
  version: 1;
  updatedAt: string;
  restrictions: AccessRestriction[];
};

export type AccessContext = {
  userId: string;
  roles: string[];
  classIds: string[];
  classKeys?: string[];
  schools: string[];
};

export const CLASS_SCOPE_SEPARATOR = "\u001f";
export function classScopeKey(school: string, year: string) {
  return `${school}${CLASS_SCOPE_SEPARATOR}${year}`;
}

export function emptyAccessControl(): AccessControlDocument {
  return { version: 1, updatedAt: new Date(0).toISOString(), restrictions: [] };
}

export function isRestrictionActive(r: AccessRestriction, now = Date.now()): boolean {
  const starts = Date.parse(r.startsAt);
  const ends = r.endsAt ? Date.parse(r.endsAt) : Number.POSITIVE_INFINITY;
  return !r.releasedAt && Number.isFinite(starts) && starts <= now && ends > now;
}

/**
 * Resolve the most specific active restriction. Super admins always bypass
 * the gate so the owner cannot be locked out of the recovery controls.
 */
export function findApplicableRestriction(
  doc: AccessControlDocument,
  ctx: AccessContext,
  now = Date.now()
): AccessRestriction | null {
  if (ctx.roles.includes("super_admin")) return null;

  const classes = new Set(ctx.classIds);
  const classKeys = new Set(ctx.classKeys || []);
  const schools = new Set(ctx.schools.map((s) => s.trim()).filter(Boolean));
  const priority: Record<AccessScopeType, number> = { user: 4, group: 3, class: 2, school: 1 };

  return doc.restrictions
    .filter((r) => isRestrictionActive(r, now))
    .filter((r) => {
      if (r.scopeType === "user") return r.scopeKey === ctx.userId;
      if (r.scopeType === "school") return schools.has(r.scopeKey);
      if (r.scopeType === "class") return classKeys.has(r.scopeKey) || r.classIds.some((id) => classes.has(id));
      return r.classIds.some((id) => classes.has(id));
    })
    .sort((a, b) => {
      const specificity = priority[b.scopeType] - priority[a.scopeType];
      if (specificity) return specificity;
      if (a.mode !== b.mode) return a.mode === "locked" ? -1 : 1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    })[0] || null;
}
