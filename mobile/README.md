# SJ Kamran Portal — Android app (Expo)

A React Native (Expo) client for the student/educator portal at
[sjabrankamran.com/portal](https://www.sjabrankamran.com/portal).

It talks to the **live production site** — the same API, the same Supabase
project, the same data. There is no separate backend and no mock layer.

---

## Running it

```bash
npm install
npx expo start
```

Then scan the QR code with **Expo Go** on Android (same Wi-Fi as this machine).

If the phone cannot reach the dev server (different network, or a firewall in
the way), use a tunnel instead:

```bash
npx expo start --tunnel
```

---

## How it is put together

```
app/                     expo-router routes
  _layout.tsx            fonts, providers, auth gate
  login.tsx              email + password, forgot-password
  (app)/
    _layout.tsx          role-aware bottom tabs
    index.tsx            Dashboard
    learn.tsx            My Learning (personal tasks)
    leaderboard.tsx      Leaderboard + contribution board
    resources.tsx        Physics Resources
    library.tsx          Resource Library
    users.tsx            Users & activity (staff)
    rankings.tsx         Rankings & analytics (staff)
    notifications.tsx    Notifications
    settings.tsx         Profile & settings
    more.tsx             The full role-aware nav
    web.tsx              Authenticated in-app browser

src/
  theme/tokens.ts        design tokens ported from the site's tailwind.config.ts
  config.ts              Supabase + site URLs (override with EXPO_PUBLIC_*)
  auth/session.ts        sign-in, refresh, secure storage, session cookie
  auth/context.tsx       AuthProvider + session refresh
  api/client.ts          authenticated fetch against /api/portal/*
  api/hooks.ts           react-query hooks
  api/types.ts           response types, verified against the live API
  nav/nav.ts             role-aware navigation, ported from the site's navFor()
  nav/roles.ts           EduRole, ROLE_LABELS, isStaff, isAdmin
  components/            shared UI (Card, Button, StatCard, PortalHeader…)
```

### Native screens vs. the in-app browser

Screens backed by a JSON API are **native React Native**. Screens that depend on
browser-only technology are rendered as the **real portal page** inside an
authenticated WebView, so they are pixel-identical and fully functional rather
than an approximation:

- **Exam Lab and proctoring** — the proctor runs MediaPipe face and object
  detection over WebAssembly, which has no React Native equivalent.
- **The analytics console, Teach, Progress, Family, Academics, Institutions,
  Finance, Post/Tests, Attendance, Proctoring & Locks, Email, Physics Studio** —
  server-rendered pages with no JSON API today.

Every destination in the website's sidebar is reachable from **More**; entries
that open the in-app browser are marked with a globe.

### Authentication

The app signs in against Supabase directly (`token?grant_type=password`) with
the public anon key — the same key the website ships to every browser, with
row-level security behind it. The session is kept in `expo-secure-store` and
refreshed automatically.

Every API call presents the session **two ways**:

- as the `sb-<ref>-auth-token` **cookie** the deployed site reads today, and
- as an `Authorization: Bearer` header.

The cookie is what makes the app work against production right now. The bearer
header is what
[PR #1](https://github.com/Syedjabran/sjabrankamran-site/pull/1) on the site
adds; once that is merged the app upgrades to it automatically, with no app
change needed.

The session is only ever attached to the portal's own origin. Resource links
point at Supabase Storage and Google Drive, and those requests deliberately
carry no session.

---

## Configuration

Nothing is required to run. To point the app at a different environment, create
a `.env` file:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SITE_URL=https://www.sjabrankamran.com
```

---

## Not included yet

- **iOS.** The code is cross-platform, but only Android has been set up and
  checked.
- **Push notifications.** The in-app notification list works; device push does
  not exist yet.
- **Offline mode.** Every screen needs a connection.
- **A standalone APK/AAB.** This is the Expo Go development build. Producing an
  installable binary is an EAS build and a separate step.
