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

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://uiqugjlpkbzpujrisfgg.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcXVnamxwa2J6cHVqcmlzZmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NTc4MzQsImV4cCI6MjEwMTQzMzgzNH0._pQK4zm7JFOld_WV9yV5SoES5psYsgWLy6x4xVuG_zs';

/** Origin of the live portal. All API calls and WebView screens target this. */
export const SITE_URL =
  process.env.EXPO_PUBLIC_SITE_URL ?? 'https://www.sjabrankamran.com';

/**
 * The Supabase project ref, derived from the URL. Used to build the auth
 * cookie name (`sb-<ref>-auth-token`) that @supabase/ssr expects server-side.
 */
export const PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0];
