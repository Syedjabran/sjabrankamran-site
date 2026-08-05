import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortalUser, type EduRole } from "@/lib/edu/auth";

export const metadata = { title: "Fees & Finance" };

function canSeeFinance(roles: EduRole[]) {
  return roles.some((r) => ["super_admin", "admin", "finance_manager"].includes(r));
}

export default async function FinancePage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canSeeFinance(user.roles)) redirect("/portal");

  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("edu_invoices")
    .select("id, invoice_no, amount, currency, due_on, status, edu_students(student_no)")
    .order("created_at", { ascending: false })
    .limit(100);

  const open = (invoices ?? []).filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Receipt size={20} className="text-cyan" />
        <h1 className="text-2xl font-semibold text-ice">Fees &amp; finance</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-signal/30 bg-signal/5 p-5 text-sm text-fog">
          Could not load invoices — has the <code className="font-mono text-xs">edu-001</code>{" "}
          migration been applied? ({error.message})
        </div>
      ) : !invoices?.length ? (
        <div className="rounded-2xl border border-white/10 bg-space/60 p-6 text-sm leading-relaxed text-fog">
          No invoices yet. Invoicing opens up once students are enrolled — fee plans, invoices and
          manual payment records (bank transfer, cash, cheque) are all supported by the foundation
          schema, with a payment gateway planned later.
        </div>
      ) : (
        <>
          <p className="text-sm text-fog">
            {open.length} open invoice{open.length === 1 ? "" : "s"} of {invoices.length} shown.
          </p>
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-space/60 px-4 py-2.5 text-sm text-fog"
              >
                <span>
                  <span className="font-mono text-xs text-dust">{inv.invoice_no ?? inv.id.slice(0, 8)}</span>{" "}
                  · {(inv.edu_students as unknown as { student_no: string | null } | null)?.student_no ?? "—"}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-ice">
                    {inv.currency} {Number(inv.amount).toLocaleString()}
                  </span>
                  {inv.due_on ? <span className="text-xs text-dust">due {inv.due_on}</span> : null}
                  <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">{inv.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
