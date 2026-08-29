/**
 * Instant skeleton shown during ANY portal navigation while the target server
 * component streams — makes tab-to-tab shifts feel immediate instead of
 * "hanging" on a blank screen.
 */
export default function PortalLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-white/10 bg-space/60" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-72 rounded-2xl border border-white/10 bg-space/60" />
        <div className="h-72 rounded-2xl border border-white/10 bg-space/60" />
      </div>
    </div>
  );
}
