# Portal mobile app — design

**Date:** 2026-09-02
**Status:** Approved, Phase 1 implemented

## Goal

An Android React Native (Expo) client for the student/educator portal at
`sjabrankamran.com/portal`, matching the website's design and functionality.
Phase 1 targets an Expo Go development build that runs from a scanned QR code,
not a store binary.

## What already existed

The website is Next.js 16 + Supabase: 27 portal routes, 11 roles, ~11.5k lines
of portal UI, and 55 JSON API routes under `/api/portal/*` and `/api/exam-lab/*`.
It is live in production.

Findings that shaped the design:

1. **The API is already there.** Most portal surfaces have a JSON endpoint, so
   the app consumes the real backend rather than reimplementing business logic.
2. **Auth is cookie-based.** Every route resolves the caller through
   `getPortalUser()` → `createClient()` → `next/headers` cookies. A native
   client holds a token, not a cookie.
3. **The design system is explicit tokens.** `tailwind.config.ts` and
   `globals.css` define exact hex values, fonts and radii, so the theme ports
   precisely instead of being eyeballed.
4. **Exam Lab's proctor is browser-only.** It loads MediaPipe FaceLandmarker
   and ObjectDetector as WebAssembly from a CDN and reads a webcam. There is no
   React Native equivalent without rebuilding it on vision-camera + TFLite.
5. **Some pages have no API.** Dashboard, Progress, Teach, Family and several
   admin pages are React Server Components reading Supabase directly.

## Decisions

### Hybrid rendering

Screens with a JSON API are native React Native. Screens that are browser-only
or have no API render the real portal page in an authenticated WebView. This
gives a genuine app for the surfaces used daily, and exact fidelity for the rest
on day one, with nothing dropped from the navigation.

Rejected alternatives:

- *Full native port*, including rebuilding proctoring — multi-week, and
  proctoring behaviour would diverge from the web until tuned.
- *WebView wrapper only* — perfect fidelity but not a React Native app.

### Authentication

The app signs in against Supabase GoTrue with the public anon key (the same key
the website ships to browsers; RLS is the boundary). The session lives in
`expo-secure-store` and refreshes on expiry.

Each API call sends the session **both** ways:

- the `sb-<ref>-auth-token` cookie, `base64-` + base64url(JSON), chunked at 3180
  bytes to match `@supabase/ssr`'s `MAX_CHUNK_SIZE`; and
- an `Authorization: Bearer` header.

The cookie works against production today. The bearer header is what site
PR #1 adds. Sending both means no flag day: the app upgrades automatically when
that PR merges.

**Security constraint:** the session is attached only for the portal's own
origin. Resource `href` values are absolute URLs pointing at Supabase Storage or
Google Drive; sending the session there would hand a third party the user's
credentials.

### Navigation

`navFor()` is ported directly from the website's portal layout — same sections,
labels, order and role gates. Bottom tabs carry four role-appropriate
destinations; **More** renders the complete nav. Staff tabs take precedence for
dual-role users, mirroring the website putting Administration above Learning.

### Theme

`src/theme/tokens.ts` carries the site's values verbatim. Tailwind's alpha
utilities (`bg-white/[0.02]`) are resolved to explicit `rgba()`. No colour is
written anywhere else in the app.

NativeWind was rejected: for a first Expo Go build, the reliability of a plain
typed theme outweighs Tailwind-like syntax.

## Verification performed

- Hand-rolled base64url encoder (Hermes has no `btoa`) matches Node's
  `base64url` across ASCII, multibyte UTF-8, emoji surrogate pairs, every
  padding remainder, and a 4KB payload.
- The app's shipped `sessionCookieHeader()` authenticates **8/8** production
  endpoints for a real signed-in user.
- `tsc --noEmit` clean; Metro bundles 3381 modules for Android with no errors.
- The site PR typechecks clean.

## Out of scope for Phase 1

iOS, push notifications, offline support, and a standalone APK/AAB via EAS.

## Follow-ups

- Merge site PR #1 to retire the cookie-format dependency.
- Optionally add JSON endpoints for Dashboard activity and Progress, which would
  let those screens become native.
