import Image from "next/image";

/**
 * SchoolLogo — renders an institution's official logo.
 *
 * Original logos are used as-is (never recreated). All raster logos have
 * transparent backgrounds. Where a logo's artwork is LIGHT it is placed
 * directly on the dark site (transparent, no chip). Where the artwork is
 * DARK (and would be invisible on dark navy) it sits on a neutral light
 * chip so it stays legible. When no reliable official logo exists, a
 * typographic monogram is shown instead.
 *
 * Logos are third-party trademarks shown solely to describe teaching
 * history; their use does not imply endorsement.
 */
export function SchoolLogo({
  logo,
  monogram,
  name,
  size = 44,
  chip = true, // dark-art logos need a light chip; light-art logos pass chip={false}
}: {
  logo?: string;
  monogram?: string;
  name: string;
  size?: number;
  chip?: boolean;
}) {
  if (logo) {
    if (chip) {
      return (
        <span
          className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-1.5 ring-1 ring-black/5"
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
    // Transparent logo with light artwork — placed directly on the dark site.
    return (
      <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }}>
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
      className="grid shrink-0 place-items-center rounded-lg border border-cyan/25 bg-cyan/[0.06] font-display text-xs font-bold text-cyan"
      style={{ width: size, height: size }}
      aria-label={`${name} monogram`}
    >
      {monogram || name.slice(0, 2).toUpperCase()}
    </span>
  );
}
