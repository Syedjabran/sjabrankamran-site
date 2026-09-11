import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { getPortalUser, canAccessGlobalStaffData } from "@/lib/edu/auth";
import { getRegistry } from "@/lib/portal/institutions";
import { getTemplates, listMail, mailConfigured } from "@/lib/portal/mail";
import { MailComposer } from "./mail-composer";

export const metadata = { title: "Email — Physics portal", robots: { index: false } };

export default async function MailPage() {
  const user = await getPortalUser();
  if (!user) redirect("/portal/login");
  if (!canAccessGlobalStaffData(user.roles)) redirect("/portal");

  const [reg, templates, log] = await Promise.all([getRegistry(), getTemplates(), listMail(200)]);
  const classes = reg.classes.map((c) => ({ id: c.id, label: `${c.school} — ${c.year}${c.section ? " · " + c.section : ""}` }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan"><Mail size={18} /></span>
        <div>
          <h1 className="font-display text-2xl text-ice">Email</h1>
          <p className="text-sm text-dust">Message students & parents · sent as physics@sjabrankamran.com</p>
        </div>
      </div>

      {!mailConfigured() && (
        <div className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-4 py-3 text-xs text-amber-200/90">
          <b>Sending is not yet connected.</b> Messages you send are safely <b>queued</b> and logged, and will go out once the
          Gmail relay (Apps Script for physics@sjabrankamran.com) is connected. See the setup guide JB was given.
        </div>
      )}

      <MailComposer classes={classes} templates={templates} initialLog={log} />
    </div>
  );
}
