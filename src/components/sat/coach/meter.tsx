// A thin horizontal bar: `fraction` (0..1) filled in the accent on a lighter
// track of the same hue; `marker` (0..1) draws a reference tick. Decorative
// -- callers always write the value next to it. Shared by the Progress page
// and the home's weekly goals.
export function Meter({ fraction, marker }: { fraction: number; marker?: number }) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x)) * 100;
  return (
    <div aria-hidden className="relative h-2 w-full rounded-full bg-cyan/15">
      <div className="h-full rounded-full bg-cyan" style={{ width: `${clamp(fraction)}%` }} />
      {marker !== undefined ? <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-ice" style={{ left: `calc(${clamp(marker)}% - 1px)` }} /> : null}
    </div>
  );
}
