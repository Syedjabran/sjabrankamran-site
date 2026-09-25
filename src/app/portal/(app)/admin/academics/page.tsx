import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { School } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, isAdmin } from "@/lib/edu/auth";
import { getRegistry, type ClassMeta, type Registry } from "@/lib/portal/institutions";
import { PORTAL_BUCKET } from "@/lib/portal/onboarding";
import { readStorageJson, writeStorageJson } from "@/lib/portal/resources";

export const metadata = { title: "Academics" };

const REGISTRY_PATH = "institutions.json";

/**
 * Add a class to the registry (portal-data/institutions.json). The registrar
 * view, KPIs, rankings and access scopes all read the registry, so a class
 * that exists only in edu_classes is invisible to them. Cache-busted read +
 * merge (a failed read throws rather than overwriting), cacheControl "0" write.
 */
async function addClassToRegistry(meta: ClassMeta): Promise<void> {
  const reg = await readStorageJson<Registry>(PORTAL_BUCKET, REGISTRY_PATH, { updated_at: "", schools: [], classes: [] });
  const classes = [...(reg.classes || []).filter((c) => c.id !== meta.id), meta];
  const schools = (reg.schools || []).includes(meta.school) ? reg.schools : [...(reg.schools || []), meta.school];
  const ok = await writeStorageJson(PORTAL_BUCKET, REGISTRY_PATH, { ...reg, updated_at: new Date().toISOString(), schools, classes });
  if (!ok) throw new Error(`Class ${meta.id} was created but could not be added to the institutions registry.`);
}

async function createClass(formData: FormData) {
  "use server";
  // The registry write below is service-role, so gate the action itself.
  const user = await getPortalUser();
  if (!user || !isAdmin(user.roles)) return;
  const field = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const name = field("name", 160);
  const courseId = field("course_id", 64);
  const school = field("school", 160);
  const year = field("year", 40);
  const section = field("section", 40) || null;
  const subject = field("subject", 80) || "Physics";
  if (!name || !school || !year) return;
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("edu_classes")
    .insert({ name, course_id: courseId || null })
    .select("id")
    .single();
  if (error || !created?.id) return;
  const key = [school, year, section, subject].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  await addClassToRegistry({ id: created.id as string, key, school, year, section, subject, name });
  await supabase.from("edu_audit_logs").insert({
    action: "class.create",
    entity: "edu_classes",
    entity_id: created.id,
    details: { name, school, year, section, subject },
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
  const [{ data: programmes }, { data: courses }, { data: classes, error }, registry] = await Promise.all([
    supabase.from("edu_programmes").select("id, code, name").order("code"),
    supabase.from("edu_courses").select("id, name, edu_programmes(code)").order("name"),
    supabase
      .from("edu_classes")
      .select("id, name, active, edu_courses(name), edu_teachers(id)")
      .order("created_at", { ascending: false }),
    getRegistry(),
  ]);
  const knownSchools = registry.schools || [];
  const knownYears = [...new Set((registry.classes || []).map((c) => c.year).filter(Boolean))].sort();

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
          <input
            name="school"
            required
            list="academics-schools"
            placeholder="School"
            aria-label="School"
            className="w-44 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <datalist id="academics-schools">
            {knownSchools.map((s) => <option key={s} value={s} />)}
          </datalist>
          <input
            name="year"
            required
            list="academics-years"
            placeholder="Year (e.g. AS)"
            aria-label="Year"
            className="w-28 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <datalist id="academics-years">
            {knownYears.map((y) => <option key={y} value={y} />)}
          </datalist>
          <input
            name="section"
            placeholder="Section (optional)"
            aria-label="Section"
            className="w-32 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
          />
          <input
            name="subject"
            defaultValue="Physics"
            aria-label="Subject"
            className="w-28 rounded-lg border border-white/10 bg-abyss/60 px-3 py-2 text-xs text-ice placeholder:text-dust focus:border-cyan focus:outline-none"
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
