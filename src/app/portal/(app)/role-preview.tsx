"use client";

import { useState } from "react";
import { Eye, X, ChevronDown } from "lucide-react";

// Every previewable role (all except the admin's own super_admin view).
const ROLES: [string, string][] = [
  ["student", "Student"], ["parent", "Parent / Guardian"],
  ["teacher", "Teacher"], ["teaching_assistant", "Teaching Assistant"],
  ["facilitator", "Facilitator"], ["coordinator", "Coordinator"],
  ["counsellor", "Counsellor"], ["attendance_registrar", "Attendance Registrar"],
  ["content_manager", "Content Manager"], ["finance_manager", "Finance Manager"],
  ["admin", "Admin"],
];
const LABEL = Object.fromEntries(ROLES);

async function setRole(role: string | null) {
  await fetch("/api/portal/admin/view-as", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }),
  }).catch(() => {});
  window.location.href = "/portal";
}

/** Admin control to preview the portal as another role. Shown only to admins. */
export function RolePreviewSwitcher({ previewing }: { previewing: string | null }) {
  const [open, setOpen] = useState(false);
  if (previewing) {
    return (
      <button onClick={() => setRole(null)} title="Exit preview"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-300/20">
        <Eye size={13} /> Previewing: {LABEL[previewing] || previewing} <X size={13} />
      </button>
    );
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Preview the portal as another role"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-fog transition hover:border-cyan/40 hover:text-cyan">
        <Eye size={13} /> View as… <ChevronDown size={12} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 max-h-[70vh] w-52 overflow-y-auto rounded-xl border border-white/10 bg-abyss/95 p-1 shadow-xl backdrop-blur">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-dust">Preview interface as</p>
            {ROLES.map(([v, l]) => (
              <button key={v} onClick={() => setRole(v)}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-fog transition hover:bg-white/[0.05] hover:text-cyan">
                {l}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
