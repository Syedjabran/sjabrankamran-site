import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Reads a native client's `Authorization: Bearer <access_token>` header.
 *
 * The website authenticates with cookies, which browsers attach automatically.
 * The React Native portal app holds the same Supabase session as a token
 * instead, so it presents that token here.
 */
export async function bearerToken(): Promise<string | null> {
  try {
    const auth = (await headers()).get("authorization");
    if (!auth) return null;
    const [scheme, token] = auth.split(" ");
    if (!token || scheme.toLowerCase() !== "bearer") return null;
    return token.trim() || null;
  } catch {
    // headers() is unavailable outside a request scope; fall back to cookies.
    return null;
  }
}

export async function createClient() {
  const cookieStore = await cookies();
  const token = await bearerToken();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component; safe to ignore when middleware refreshes sessions
          }
        },
      },
      // A bearer token is forwarded to PostgREST and Storage so row-level
      // security scopes queries to that user, exactly as the cookie session
      // does for the website. Requests with no such header are unaffected —
      // this is purely additive.
      ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    }
  );
}
