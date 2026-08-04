"use client";

/**
 * PhysicsField — a lightweight scientific backdrop.
 * SVG orbital paths + drifting particles + meaningful physics formulae.
 * No WebGL; respects prefers-reduced-motion via CSS.
 */

const FORMULAE = [
  { t: "F = G m₁m₂ / r²", x: "8%", y: "22%" },
  { t: "E = mc²", x: "78%", y: "16%" },
  { t: "v = fλ", x: "70%", y: "70%" },
  { t: "∮ E·dA = Q/ε₀", x: "12%", y: "74%" },
  { t: "s = ut + ½at²", x: "44%", y: "10%" },
  { t: "λ = h / p", x: "86%", y: "48%" },
];

export function PhysicsField({ dense = false }: { dense?: boolean }) {
  const stars = Array.from({ length: dense ? 60 : 38 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* orbital system */}
      <svg
        className="absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 opacity-[0.5]"
        viewBox="0 0 800 800"
        fill="none"
      >
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3DE1F0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5B6CF0" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="400" cy="400" r="70" fill="url(#core)" />
        {[140, 210, 290, 370].map((r, i) => (
          <ellipse
            key={r}
            cx="400"
            cy="400"
            rx={r}
            ry={r * 0.42}
            stroke="rgba(125,150,240,0.22)"
            strokeWidth="1"
            transform={`rotate(${i * 32} 400 400)`}
          />
        ))}
        {/* orbiting nodes */}
        <g className="origin-center animate-orbit-slow" style={{ transformBox: "fill-box" }}>
          <circle cx="540" cy="400" r="4" fill="#3DE1F0" />
        </g>
        <g className="origin-center animate-orbit-med" style={{ transformBox: "fill-box" }}>
          <circle cx="400" cy="190" r="3" fill="#A78BFA" />
        </g>
      </svg>

      {/* stars */}
      {stars.map((_, i) => {
        const size = Math.random() * 2 + 0.5;
        return (
          <span
            key={i}
            className="absolute rounded-full bg-white animate-pulse-soft"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: size,
              height: size,
              opacity: Math.random() * 0.6 + 0.2,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        );
      })}

      {/* formulae */}
      {FORMULAE.map((f) => (
        <span
          key={f.t}
          className="absolute select-none font-mono text-[11px] text-cyan/25 md:text-sm"
          style={{ left: f.x, top: f.y }}
        >
          {f.t}
        </span>
      ))}
    </div>
  );
}
