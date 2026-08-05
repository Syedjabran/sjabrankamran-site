import { redirect } from "next/navigation";
import { Users, CalendarDays, Trophy, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser } from "@/lib/edu/auth";

export const metadata = { title: "My Children" };

export default async function FamilyPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!user.roles.includes("parent")) redirect("/portal");

  const supabase = await createClient();

  const { data: guardian } = await supabase
    .from("edu_guardians")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: links } = guardian
    ? await supabase
        .from("edu_student_guardians")
        .select("student_id, relationship, edu_students(id, student_no, edu_profiles:profile_id(full_name))")
        .eq("guardian_id", guardian.id)
    : { data: [] as never[] };

  if (!guardian || !links?.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-space/60 p-8 text-center">
        <h1 className="text-xl font-semibold text-ice">No linked students yet</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fog">
          Your parent account isn&apos;t linked to a student yet. An administrator links parents to
          students during admission — please get in touch if this seems wrong.
        </p>
      </div>
    );
  }

  const children = await Promise.all(
    links.map(async (link) => {
      const s = link.edu_students as unknown as {
        id: string;
        student_no: string | null;
        edu_profiles: { full_name: string } | null;
      } | null;
      if (!s) return null;

      const [{ data: attendance }, { data: results }, { data: invoices }, { data: enrolments }] =
        await Promise.all([
          supabase.from("edu_attendance").select("status").eq("student_id", s.id),
          supabase
            .from("edu_results")
            .select("id, score, grade, edu_assessments(title, total_marks)")
            .eq("student_id", s.id)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("edu_invoices")
            .select("id, invoice_no, amount, currency, due_on, status")
            .eq("student_id", s.id)
            .in("status", ["sent", "partially_paid", "overdue"])
            .order("due_on"),
          supabase
            .from("edu_enrolments")
            .select("edu_classes(name)")
            .eq("student_id", s.id)
            .eq("status", "active"),
        ]);

      const att = attendance ?? [];
      const attPct = att.length
        ? Math.round((att.filter((a) => ["present", "late"].includes(a.status)).length / att.length) * 100)
        : null;

      return { s, relationship: link.relationship, attPct, results: results ?? [], invoices: invoices ?? [], enrolments: enrolments ?? [] };
    })
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Users size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">My children</h1>
      </div>

      {children.filter(Boolean).map((child) => {
        if (!child) return null;
        const { s, attPct, results, invoices, enrolments } = child;
        return (
          <section key={s.id} className="rounded-2xl border border-white/10 bg-space/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-ice">
                  {s.edu_profiles?.full_name || "(unnamed)"}
                </h2>
                <p className="text-xs text-dust">
                  <span className="font-mono">{s.student_no ?? ""}</span>
                  {enrolments.length
                    ? ` · ${enrolments
                        .map((e) => (e.edu_classes as unknown as { name: string } | null)?.name)
                        .filter(Boolean)
                        .join(", ")}`
                    : " · not enrolled yet"}
                </p>
              </div>
              {attPct !== null ? (
                <span
                  className={`rounded-full border px-3 py-1 text-xs ${
                    attPct >= 85 ? "border-emerald2/40 text-emerald2" : attPct >= 70 ? "border-cyan/40 text-cyan" : "border-signal/40 text-signal"
                  }`}
                >
                  <CalendarDays size={11} className="mr-1 inline" /> Attendance {attPct}%
                </span>
              ) : (
                <span className="text-xs text-dust">No attendance records yet</span>
              )}
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-dust">
                  <Trophy size={12} className="text-cyan" /> Recent results
                </h3>
                {!results.length ? (
                  <p className="text-sm text-fog">No results yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {results.map((r) => {
                      const a = r.edu_assessments as unknown as { title: string; total_marks: number | null } | null;
                      return (
                        <li key={r.id} className="flex items-center justify-between text-sm text-fog">
                          <span>{a?.title}</span>
                          <span className="text-ice">
                            {r.score != null ? Number(r.score) : "—"}
                            {a?.total_marks ? `/${Number(a.total_marks)}` : ""}
                            {r.grade ? <span className="ml-2 font-mono text-xs text-cyan">{r.grade}</span> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-dust">
                  <Receipt size={12} className="text-cyan" /> Fees due
                </h3>
                {!invoices.length ? (
                  <p className="text-sm text-fog">Nothing outstanding.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {invoices.map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between text-sm text-fog">
                        <span className="font-mono text-xs">{inv.invoice_no ?? inv.id.slice(0, 8)}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-ice">
                            {inv.currency} {Number(inv.amount).toLocaleString()}
                          </span>
                          {inv.due_on ? <span className="text-xs text-dust">due {inv.due_on}</span> : null}
                          <span className="font-mono text-[10px] uppercase text-cyan">{inv.status}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
