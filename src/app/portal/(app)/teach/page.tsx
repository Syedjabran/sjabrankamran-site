import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";

export const metadata = { title: "My Classes" };

export default async function TeachHome() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  const allowed = user.roles.includes("teacher") || user.roles.includes("teaching_assistant") || isAdmin(user.roles);
  if (!allowed) redirect("/portal");

  const supabase = await createClient();

  // Admin sees all classes; teachers see the ones assigned to them (RLS scopes anyway).
  const { data: classes, error } = await supabase
    .from("edu_classes")
    .select("id, name, active, room, meeting_url, edu_courses(name), edu_enrolments(id)")
    .eq("active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">My classes</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
          Could not load classes — has the <code className="font-mono text-xs">edu-001</code> migration
          been applied? ({error.message})
        </div>
      ) : !classes?.length ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm leading-relaxed text-fog">
          No classes are assigned to you yet. An administrator assigns teachers to classes on the
          Academics page.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/teach/${c.id}`}
                className="card-hover block rounded-2xl border border-white/10 bg-space/60 p-5"
              >
                <p className="text-sm font-semibold text-ice">{c.name}</p>
                <p className="mt-1 text-xs text-dust">
                  {(c.edu_courses as unknown as { name: string } | null)?.name ?? "No course"} ·{" "}
                  {((c.edu_enrolments as unknown as { id: string }[]) ?? []).length} student
                  {((c.edu_enrolments as unknown as { id: string }[]) ?? []).length === 1 ? "" : "s"}
                </p>
                {c.room ? <p className="mt-1 text-xs text-dust">Room: {c.room}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
