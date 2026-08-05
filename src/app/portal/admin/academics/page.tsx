import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { School } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";

export const metadata = { title: "Academics" };

async function createClass(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const courseId = String(formData.get("course_id") ?? "");
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("edu_classes").insert({
    name,
    course_id: courseId || null,
  });
  await supabase.from("edu_audit_logs").insert({
    action: "class.create",
    entity: "edu_classes",
    details: { name },
  });
  revalidatePath("/portal/admin/academics");
}

async function createCourse(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const programmeId = String(formData.get("programme_id") ?? "");
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("edu_courses").insert({
    name,
    programme_id: programmeId || null,
  });
  await supabase.from("edu_audit_logs").insert({
    action: "course.create",
    entity: "edu_courses",
    details: { name },
  });
  revalidatePath("/portal/admin/academics");
}

export default async function AcademicsPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!isAdmin(user.roles)) redirect("/portal");

  const supabase = await createClient();
  const [{ data: programmes }, { data: courses }, { data: classes, error }] = await Promise.all([
    supabase.from("edu_programmes").select("id, code, name").order("code"),
    supabase.from("edu_courses").select("id, name, edu_programmes(code)").order("name"),
    supabase
      .from("edu_classes")
      .select("id, name, active, edu_courses(name), edu_teachers(id)")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <School size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">Academics</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
          Could not load academic data — has the <code className="font-mono text-xs">edu-001</code>{" "}
          migration been applied? ({error.message})
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-dust">Programmes</h2>
        <div className="flex flex-wrap gap-2">
          {(programmes ?? []).map((p) => (
            <span
              key={p.id}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-fog"
              title={p.name}
            >
              {p.code}
            </span>
          ))}
          {!programmes?.length ? <span className="text-xs text-dust">No programmes found.</span> : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-dust">Courses</h2>
        <ul className="space-y-2">
          {(courses ?? []).map((c) => (
            <li key={c.id} className="rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm text-fog">
              {c.name}{" "}
              <span className="font-mono text-[10px] uppercase text-dust">
                {(c.edu_programmes as unknown as { code: string } | null)?.code ?? ""}
              </span>
            </li>
          ))}
          {!courses?.length ? <li className="text-xs text-dust">No courses yet — create the first one below.</li> : null}
        </ul>
        <form action={createCourse} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            name="name"
            required
            placeholder="New course name (e.g. A2 Physics 2027)"
            className="w-64 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <select
            name="programme_id"
            aria-label="Programme"
            className="rounded-lg border border-white/10 bg-abyss/60 px-2 py-2 text-xs text-ice focus:border-cyan focus:outline-none"
          >
            <option value="">No programme</option>
            {(programmes ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ghost !px-3 !py-2 text-xs">
            Create course
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-dust">Classes</h2>
        <ul className="space-y-2">
          {(classes ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm text-fog">
              <span>
                {c.name}{" "}
                <span className="text-xs text-dust">
                  {(c.edu_courses as unknown as { name: string } | null)?.name ?? "no course"}
                </span>
              </span>
              <span className={`font-mono text-[10px] uppercase ${c.active ? "text-emerald2" : "text-dust"}`}>
                {c.active ? "active" : "inactive"}
              </span>
            </li>
          ))}
          {!classes?.length && !error ? <li className="text-xs text-dust">No classes yet — create the first one below.</li> : null}
        </ul>
        <form action={createClass} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            name="name"
            required
            placeholder="New class name (e.g. AS Evening Batch)"
            className="w-64 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <select
            name="course_id"
            aria-label="Course"
            className="rounded-lg border border-white/10 bg-abyss/60 px-2 py-2 text-xs text-ice focus:border-cyan focus:outline-none"
          >
            <option value="">No course</option>
            {(courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ghost !px-3 !py-2 text-xs">
            Create class
          </button>
        </form>
        <p className="mt-3 text-xs text-dust">
          Teacher allocation, schedules and enrolments open up in the next stage.
        </p>
      </section>
    </div>
  );
}
