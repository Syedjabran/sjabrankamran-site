"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Dashboard quick-search → jumps to the Users console pre-filtered. */
export function AdminUserSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); router.push(`/portal/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}
      className="flex items-center gap-2 rounded-xl border border-white/15 bg-abyss/60 px-3 py-2 backdrop-blur-sm focus-within:border-cyan/50"
    >
      <Search size={15} className="text-dust" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a student or user…"
        className="w-full bg-transparent text-sm text-ice placeholder:text-dust focus:outline-none"
        aria-label="Find a user"
      />
      <button type="submit" className="rounded-lg border border-cyan/30 px-2.5 py-1 text-[11px] text-cyan transition hover:bg-cyan/10">Go</button>
    </form>
  );
}
