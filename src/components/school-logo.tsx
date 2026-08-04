/* eslint-disable @next/next/no-img-element */

/**
 * SchoolLogo — official institution logos, unmodified.
 *
 * Two render modes based on the logo's artwork:
 *  - "dark"  : logo art is white/light → placed DIRECTLY on the dark site
 *              (transparent background, no chip), as large as fits.
 *  - "chip"  : logo art is dark/coloured → placed on a light rectangular
 *              chip so it stays legible on the dark background.
 *
 * Wide logos get a rectangular frame (never crushed into squares).
 * Plain <img> is used to avoid raster re-processing of gray+alpha PNGs.
 * When no reliable official logo exists, a typographic monogram is shown.
 *
 * Logos are third-party trademarks shown solely to describe teaching
 * history; their use does not imply endorsement.
 */
export function SchoolLogo({
  logo,
  onDark = false,
  monogram,
  name,
  height = 44,
}: {
  logo?: string;
  onDark?: boolean; // true → white-art logo rendered directly on dark background
  monogram?: string;
  name: string;
  height?: number;
}) {
  if (logo) {
    if (onDark) {
      return (
        <span className="flex shrink-0 items-center" style={{ height }}>
          <img
            src={logo}
            alt={`${name} logo`}
            style={{ height: "100%", width: "auto", maxWidth: height * 2.6, objectFit: "contain" }}
            loading="lazy"
          />
        </span>
      );
    }
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-black/5"
        style={{ height, minWidth: height, maxWidth: height * 2.6 }}
      >
        <img
          src={logo}
          alt={`${name} logo`}
          style={{ height: "100%", width: "auto", maxWidth: height * 2.3, objectFit: "contain" }}
          loading="lazy"
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg border border-cyan/25 bg-cyan/[0.06] px-3 font-display text-sm font-bold text-cyan"
      style={{ height, minWidth: height }}
      aria-label={`${name} monogram`}
    >
      {monogram || name.slice(0, 2).toUpperCase()}
    </span>
  );
}
