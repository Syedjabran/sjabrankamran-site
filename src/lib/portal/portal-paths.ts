/**
 * Which paths are the signed-in portal (the `(app)` pages under /portal) as
 * opposed to the public site and the portal's sign-in pages. Pure: the site
 * header reads it to step aside inside the portal, whose own top bar carries
 * the brand and the way back to the main website.
 */

/** The /portal pages that are not the signed-in portal: sign-in, password
 *  reset and the auth callbacks (the middleware lets these through signed out). */
export const PORTAL_PUBLIC_PREFIXES: readonly string[] = ["/portal/login", "/portal/reset", "/portal/auth"];

/** True for a signed-in portal page ("/portal", "/portal/exam-lab", …). */
export function isPortalAppPath(pathname: string | null | undefined): boolean {
  const path = (pathname || "").split(/[?#]/)[0].toLowerCase();
  if (path !== "/portal" && !path.startsWith("/portal/")) return false;
  return !PORTAL_PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
