import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sessionBearer } from "@/lib/supabase/bearer";

/**
 * Reads a native client's `Authorization: Bearer <access_token>` header.
 *
 * The website authenticates with cookies, which browsers attach automatically.
 * The React Native portal app holds the same Supabase session as a token
 * instead, so it presents that token here. The bearer counts only when the
 * request carries no Supabase session cookie (see sessionBearer), which is the
 * same rule the middleware's access-lock gate uses.
 */
export async function bearerToken(): Promise<string | null> {
  try {
    const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
    return sessionBearer(
      headerStore.get("authorization"),
      cookieStore.getAll().map((c) => c.name),
    );
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
      // does for the website. Requests with a session cookie or no such
      // header are unaffected — this is purely additive.
      ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    }
  );
}
