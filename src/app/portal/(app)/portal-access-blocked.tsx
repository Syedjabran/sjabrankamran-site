import { Ban, Clock3, LogOut, ShieldAlert } from "lucide-react";
import type { AccessRestriction } from "@/lib/portal/access-shared";

function formatEnd(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

export function PortalAccessBlocked({ restriction }: { restriction: AccessRestriction }) {
  const suspended = restriction.mode === "suspended";
  const end = formatEnd(restriction.endsAt);

  return (
    <main className="container-x grid min-h-[72dvh] place-items-center py-12">
      <section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-signal/30 bg-space/80 shadow-2xl shadow-black/30">
        <div className="border-b border-signal/20 bg-signal/[0.07] px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-signal/35 bg-signal/10 text-signal">
              {suspended ? <Clock3 size={22} /> : <Ban size={22} />}
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal">Portal access control</p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-ice">
                Access {suspended ? "temporarily suspended" : "locked"}
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-7 sm:px-8">
          <div className="rounded-2xl border border-white/10 bg-abyss/55 p-5">
            <p className="whitespace-pre-wrap text-sm leading-7 text-fog">{restriction.message}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 px-3 py-1 text-dust">
              Applies to: <b className="font-medium text-fog">{restriction.scopeLabel}</b>
            </span>
            {end ? (
              <span className="rounded-full border border-amber-300/25 px-3 py-1 text-amber-200">
                Scheduled until {end} PKT
              </span>
            ) : null}
          </div>

          <p className="flex items-start gap-2 text-xs leading-5 text-dust">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-cyan" />
            Your account is still signed in, but portal pages and activities are unavailable while this restriction is active.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
            <p className="text-xs text-dust">For help, contact physics@sjabrankamran.com.</p>
            <form action="/portal/auth/signout" method="post">
              <button type="submit" className="btn-ghost !px-4 !py-2 text-xs">
                <LogOut size={13} /> Sign out
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
