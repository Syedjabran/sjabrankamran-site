// A thin horizontal bar: `fraction` (0..1) filled in the accent on a lighter
// track of the same hue; `band` (0..1) continues it in a paler accent up to
// there (a score range: solid to its lower bound, pale across it); `marker`
// (0..1) draws a reference tick. Decorative -- callers always write the value
// next to it. Shared by the Progress page and the home's weekly goals.
export function Meter({ fraction, band, marker }: { fraction: number; band?: number; marker?: number }) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x)) * 100;
  return (
    <div aria-hidden className="relative h-2 w-full rounded-full bg-cyan/15">
      {band !== undefined ? <div className="absolute inset-y-0 left-0 rounded-full bg-cyan/40" style={{ width: `${clamp(band)}%` }} /> : null}
      <div className="relative h-full rounded-full bg-cyan" style={{ width: `${clamp(fraction)}%` }} />
      {marker !== undefined ? <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-ice" style={{ left: `calc(${clamp(marker)}% - 1px)` }} /> : null}
    </div>
  );
}
