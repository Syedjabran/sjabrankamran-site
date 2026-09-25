/**
 * Small request-validation guards shared by route handlers and the login form.
 * Isomorphic (no Node-only imports) so client components can use them too.
 */

// ASCII control characters. The WHATWG URL parser silently strips tab/CR/LF,
// so "/\t/evil.com" would otherwise become the protocol-relative "//evil.com".
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * A same-site relative path to redirect to after sign-in, or `fallback`.
 * Accepts only "/..." — never "//host" or "/\host", which browsers treat as
 * protocol-relative URLs to another site.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/portal"): string {
  if (!raw || CONTROL_CHARS.test(raw) || !/^\/(?![/\\])/.test(raw)) return fallback;
  return raw;
}

/**
 * A storage object key that cannot escape its folder. storage-js interpolates
 * keys into the request URL without encoding them, so ".." / "." segments,
 * backslashes, empty segments and URL metacharacters would resolve elsewhere.
 */
export function isSafeStorageKey(key: string): boolean {
  if (!key || key.startsWith("/") || CONTROL_CHARS.test(key)) return false;
  if (/[\\?#%]/.test(key) || key.includes("//") || key.includes("..")) return false;
  return !key.split("/").some((seg) => seg === ".");
}

let cronSecretWarned = false;

/** String equality whose timing never depends on where the inputs differ. */
function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Cron-route gate. With CRON_SECRET set, Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` and that exact bearer is required.
 * Without it, fall back to the legacy (spoofable) Vercel cron headers.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return constantTimeEqual(req.headers.get("authorization") || "", `Bearer ${secret}`);
  if (!cronSecretWarned) {
    cronSecretWarned = true;
    console.warn("CRON_SECRET is not set: cron routes fall back to the spoofable x-vercel-cron / User-Agent check.");
  }
  return req.headers.get("x-vercel-cron") === "1" || (req.headers.get("user-agent") || "").startsWith("vercel-cron/");
}
