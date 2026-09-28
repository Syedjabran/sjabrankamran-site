/**
 * Runtime configuration.
 *
 * The Supabase URL and anon key are PUBLIC values — they are the same
 * NEXT_PUBLIC_* pair the website ships to every browser in its JS bundle, and
 * every table behind them is protected by row-level security. They are safe to
 * embed in the app for exactly the same reason they are safe in the website.
 *
 * All three can be overridden without touching code by setting EXPO_PUBLIC_*
 * variables in a .env file at the project root.
 */
import { originString, parseOrigin, type Origin } from './web/portal-url';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://uiqugjlpkbzpujrisfgg.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcXVnamxwa2J6cHVqcmlzZmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTc4MzQsImV4cCI6MjEwMTQzMzgzNH0._pQK4zm7JFOld_WV9yV5SoES5psYsgWLy6x4xVuG_zs';

/**
 * The portal's canonical origin. All API calls and WebView screens target
 * it, and it is the ONLY origin the app ever sends the session to
 * (src/web/portal-url.ts compares scheme, host and port exactly).
 *
 * Use the address the site serves from, not one it redirects away from: the
 * site sends www.sjabrankamran.com on to sjabrankamran.com (vercel.json), and
 * a redirect to another host drops the app's session on the way.
 */
export const SITE_ORIGIN: Origin = parseOrigin(
  process.env.EXPO_PUBLIC_SITE_URL ?? 'https://sjabrankamran.com'
);

/** SITE_ORIGIN as text, e.g. "https://sjabrankamran.com" (no trailing slash). */
export const SITE_URL = originString(SITE_ORIGIN);

/**
 * The portal's name (the website's src/lib/portal/brand.ts PORTAL_NAME). The
 * signed-in app takes it from the portal's navigation; this is what it shows
 * until that arrives, and on the sign-in screen.
 */
export const PORTAL_NAME = 'Learning Portal';

/**
 * The Supabase project ref, derived from the URL. Used to build the auth
 * cookie name (`sb-<ref>-auth-token`) that @supabase/ssr expects server-side.
 */
export const PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0];

/**
 * Marker cookie telling the site a page is being rendered inside this app, so
 * it omits its own top bar — the app already provides a title bar and the
 * subject-first navigation. Must match PORTAL_CLIENT_COOKIE /
 * PORTAL_CLIENT_APP in the website's src/lib/portal/embed.ts.
 */
export const PORTAL_CLIENT_COOKIE = 'portal_client';
export const PORTAL_CLIENT_APP = 'app';
