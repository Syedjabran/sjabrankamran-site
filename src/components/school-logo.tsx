import Image from "next/image";

/**
 * SchoolLogo — renders an institution's OFFICIAL logo, unmodified, on a
 * uniform light chip so every logo is legible and consistent on the dark
 * site (school logos are designed for light backgrounds and vary in colour
 * and transparency). Logos are never recreated. When no reliable official
 * logo exists, a typographic monogram is shown instead.
 *
 * Logos are third-party trademarks shown solely to describe teaching
 * history; their use does not imply endorsement.
 */
export function SchoolLogo({
  logo,
  monogram,
  name,
  size = 52,
}: {
  logo?: string;
  monogram?: string;
  name: string;
  size?: number;
}) {
  if (logo) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5"
        style={{ width: size, height: size }}
      >
        <Image
          src={logo}
          alt={`${name} logo`}
          width={size * 2}
          height={size * 2}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl border border-cyan/25 bg-cyan/[0.06] font-display text-sm font-bold text-cyan"
      style={{ width: size, height: size }}
      aria-label={`${name} monogram`}
    >
      {monogram || name.slice(0, 2).toUpperCase()}
    </span>
  );
}
