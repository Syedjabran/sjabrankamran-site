import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin, ROLE_LABELS, type EduRole } from "@/lib/edu/auth";

export const metadata = { title: "Users & Roles" };

const ALL_ROLES = Object.keys(ROLE_LABELS) as EduRole[];

async function grantRole(formData: FormData) {
  "use server";
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as EduRole;
  if (!userId || !ALL_ROLES.includes(role)) return;
  const supabase = await createClient();
  await supabase.from("edu_user_roles").insert({ user_id: userId, role });
  await supabase.from("edu_audit_logs").insert({
    action: "role.grant",
    entity: "edu_user_roles",
    entity_id: userId,
    details: { role },
  });
  revalidatePath("/portal/admin/users");
}

async function revokeRole(formData: FormData) {
  "use server";
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as EduRole;
  if (!userId || !ALL_ROLES.includes(role)) return;
  const supabase = await createClient();
  await supabase.from("edu_user_roles").delete().eq("user_id", userId).eq("role", role);
  await supabase.from("edu_audit_logs").insert({
    action: "role.revoke",
    entity: "edu_user_roles",
    entity_id: userId,
    details: { role },
  });
  revalidatePath("/portal/admin/users");
}

export default async function UsersPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isAdmin(user.roles)) redirect("/portal");

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("edu_profiles")
    // edu_user_roles has TWO FKs back to edu_profiles (user_id AND granted_by),
    // so the embed MUST be disambiguated by the user_id constraint or PostgREST
    // errors with PGRST201 (“more than one relationship was found”).
    .select("id, full_name, email, status, edu_user_roles!edu_user_roles_user_id_fkey(role)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserCog size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">Users &amp; roles</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
          Could not load users — has the <code className="font-mono text-xs">edu-001</code> migration
          been applied? ({error.message})
        </div>
      ) : !profiles?.length ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm text-fog">
          No portal accounts yet. Accounts appear here automatically when someone signs up or is
          invited through Supabase Auth.
        </div>
      ) : (
        <ul className="space-y-3">
          {profiles.map((p) => {
            const roles = ((p.edu_user_roles as { role: EduRole }[] | null) ?? []).map(
              (r) => r.role
            );
            return (
              <li key={p.id} className="rounded-2xl border border-white/10 bg-space/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ice">{p.full_name || "(no name)"}</p>
                    <p className="text-xs text-dust">{p.email}</p>
                  </div>
                  <span className="rounded-full border border-white/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dust">
                    {p.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {roles.length === 0 ? (
                    <span className="text-xs text-dust">No roles assigned</span>
                  ) : (
                    roles.map((r) => (
                      <form key={r} action={revokeRole}>
                        <input type="hidden" name="user_id" value={p.id} />
                        <input type="hidden" name="role" value={r} />
                        <button
                          type="submit"
                          title="Remove this role"
                          className="rounded-full border border-cyan/30 px-3 py-1 text-xs text-cyan transition hover:border-signal/50 hover:text-signal"
                        >
                          {ROLE_LABELS[r]} ×
                        </button>
                      </form>
                    ))
                  )}
                </div>

                <form action={grantRole} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="user_id" value={p.id} />
                  <select
                    name="role"
                    aria-label="Role to add"
                    className="rounded-lg border border-white/10 bg-abyss/60 px-2 py-1.5 text-xs text-ice focus:border-cyan focus:outline-none"
                    defaultValue="student"
                  >
                    {ALL_ROLES.filter((r) => !roles.includes(r)).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-ghost !px-3 !py-1.5 text-xs">
                    Add role
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-dust">
        New accounts are created via Supabase Auth (sign-up or admin invitation). Roles control
        everything a user can see; removing a role takes effect immediately.
      </p>
    </div>
  );
}
