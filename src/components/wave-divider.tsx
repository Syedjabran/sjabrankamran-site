/**
 * WaveDivider — a subtle animated transverse wave, rendered as SVG with a
 * CSS dash animation. Decorative only (aria-hidden); halted automatically
 * under prefers-reduced-motion by the global CSS rule.
 */
export function WaveDivider() {
  const path =
    "M0 40 C 40 0, 80 0, 120 40 S 200 80, 240 40 S 320 0, 360 40 S 440 80, 480 40 S 560 0, 600 40 S 680 80, 720 40 S 800 0, 840 40 S 920 80, 960 40 S 1040 0, 1080 40 S 1160 80, 1200 40";
  return (
    <div className="pointer-events-none relative mx-auto my-2 h-16 max-w-4xl overflow-hidden opacity-60" aria-hidden="true">
      <svg viewBox="0 0 1200 80" fill="none" className="h-full w-full" preserveAspectRatio="none">
        <path d={path} stroke="rgba(61,225,240,0.35)" strokeWidth="1.5" className="wave-flow" />
        <path d={path} stroke="rgba(91,108,240,0.25)" strokeWidth="1.5" className="wave-flow-slow" transform="translate(60 0)" />
        <line x1="0" y1="40" x2="1200" y2="40" stroke="rgba(125,150,240,0.12)" strokeWidth="1" strokeDasharray="4 6" />
      </svg>
    </div>
  );
}
