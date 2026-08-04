import Image from "next/image";

/**
 * SchoolLogo — renders an institution's official logo on a clean white chip
 * (neutralises transparent/white/coloured logo backgrounds on the dark site),
 * or a typographic monogram chip when no reliable logo is available.
 *
 * Logos are third-party trademarks shown solely to describe teaching history;
 * their use does not imply endorsement.
 */
export function SchoolLogo({
  logo,
  monogram,
  name,
  size = 44,
}: {
  logo?: string;
  monogram?: string;
  name: string;
  size?: number;
}) {
  if (logo) {
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
