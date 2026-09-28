import { Platform } from 'react-native';

/**
 * Design tokens ported verbatim from the website's tailwind.config.ts and
 * globals.css. These are the SAME hex values the web portal ships, so the app
 * and the site cannot drift apart. Do not hardcode colours anywhere else.
 */

export const colors = {
  // Core neutrals — deep space, not luxury black
  space: '#070B18', // near-black deep space blue
  abyss: '#0A1024', // primary background
  void: '#0D1530', // elevated surface
  slate2: '#141C3A', // cards
  ice: '#EEF2FF', // primary text (ice white)
  fog: '#AEB8D8', // secondary text
  dust: '#6B77A0', // muted text

  // Education ecosystem — cosmic
  cyan: '#3DE1F0',
  cyanSoft: '#7CEDF7',
  cyanDeep: '#1BA9BC',
  indigo2: '#5B6CF0',
  violet2: '#8B5CF6',
  ultraviolet: '#A78BFA',

  // Enterprise ecosystem
  emerald2: '#12D48C',
  emerald2Deep: '#0A9E68',
  signal: '#FF7A2F', // signal orange
  steel: '#8895B8',

  // Technology ecosystem
  magenta: '#F03DCE',
  magentaSoft: '#F877DA',
  lime2: '#B6FF3D',
  silver: '#C7D0E8',

  // Amber is used by the web portal via Tailwind's default palette
  // (amber-300) for "preview mode" and assignment accents.
  amber300: '#FCD34D',
} as const;

/**
 * Translucent values. React Native has no `bg-white/[0.02]`, so the web's
 * alpha utilities are resolved to explicit rgba() here.
 */
export const alpha = {
  cardBg: 'rgba(255,255,255,0.02)', // .card        -> bg-white/[0.02]
  cardBorder: 'rgba(255,255,255,0.07)', // .card     -> border-white/[0.07]
  cardHoverBg: 'rgba(255,255,255,0.04)', // .card-hover
  border: 'rgba(255,255,255,0.10)', // border-white/10
  borderStrong: 'rgba(255,255,255,0.15)', // border-white/15
  divider: 'rgba(255,255,255,0.06)', // border-white/[0.06]
  cyanBorder: 'rgba(61,225,240,0.30)', // border-cyan/30
  cyanFaint: 'rgba(61,225,240,0.10)',
  emeraldBorder: 'rgba(18,212,140,0.30)',
  signalBorder: 'rgba(255,122,47,0.30)',
  signalFaint: 'rgba(255,122,47,0.05)',
  amberBorder: 'rgba(252,211,77,0.30)',
  amberFaint: 'rgba(252,211,77,0.06)',
  spaceTranslucent: 'rgba(7,11,24,0.60)', // bg-space/60
  /** Skeleton placeholder fill — one step above .card so it reads as content. */
  skeleton: 'rgba(255,255,255,0.06)',
  emeraldFaint: 'rgba(18,212,140,0.10)',
  violetBorder: 'rgba(139,92,246,0.30)', // border-violet2/30
  violetFaint: 'rgba(139,92,246,0.10)',
  magentaBorder: 'rgba(240,61,206,0.30)', // border-magenta/30
  magentaFaint: 'rgba(240,61,206,0.10)',
} as const;

/**
 * A subject's accent, by the portal's token name (subjects.ts AccentToken:
 * the website's ACCENT_CLASSES text / border / soft). An accent this app
 * doesn't know yet -- one the portal added later -- reads as cyan.
 */
const ACCENTS: Record<string, { color: string; border: string; soft: string }> = {
  cyan: { color: colors.cyan, border: alpha.cyanBorder, soft: alpha.cyanFaint },
  violet: { color: colors.violet2, border: alpha.violetBorder, soft: alpha.violetFaint },
  emerald: { color: colors.emerald2, border: alpha.emeraldBorder, soft: alpha.emeraldFaint },
  amber: { color: colors.amber300, border: alpha.amberBorder, soft: alpha.amberFaint },
  magenta: { color: colors.magenta, border: alpha.magentaBorder, soft: alpha.magentaFaint },
};

export function accentFor(token: string | null | undefined) {
  return (token && Object.prototype.hasOwnProperty.call(ACCENTS, token) ? ACCENTS[token] : null) ?? ACCENTS.cyan;
}

/** Shared motion values so loading states feel like one system, not per-screen. */
export const motion = {
  /** Half-cycle of the skeleton pulse, in ms. */
  pulseDuration: 900,
  pulseMinOpacity: 0.35,
  pulseMaxOpacity: 0.8,
} as const;

/** Tailwind's default spacing scale, in the steps the portal actually uses. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

/** Tailwind radii used by the portal: rounded-lg/xl/2xl/full. */
export const radius = {
  lg: 8,
  xl: 12,
  '2xl': 16,
  full: 9999,
} as const;

/**
 * Font families. Names must match the keys loaded by useFonts() in the root
 * layout. The web uses Space Grotesk for display/headings and Inter for body.
 */
export const fonts = {
  display: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

/** Type scale mirroring the portal's text-[11px] .. text-3xl usage. */
export const fontSize = {
  '2xs': 10,
  xs: 11,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

/** letterSpacing.widelabel = 0.2em, used by .eyebrow labels. */
export const tracking = {
  widelabel: 2,
  wider: 0.8,
  tightest: -0.5,
} as const;
