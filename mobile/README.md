# Learning Portal — Android app (Expo)

A React Native (Expo) client for the Learning Portal at
[sjabrankamran.com/portal](https://sjabrankamran.com/portal).

It talks to the **live production site** — the same API, the same Supabase
project, the same data. There is no separate backend and no mock layer.

> The app reads its menus from the portal's `GET /api/portal/navigation`
> (added on the `portal-v2` branch). Until that branch is merged and deployed,
> the production site answers 404 there and the app shows a single
> **Open the portal** button instead of your subjects. To try the new menus
> before the deploy, point the app at a local portal (see Configuration).

---

## Running it

```bash
npm ci          # exact versions from package-lock.json (npm install also works)
npx tsc --noEmit
npm test        # the link-safety tests (plain Node, no phone needed)
npx expo start
```

Then scan the QR code with **Expo Go** on Android (same Wi-Fi as this machine).

If the phone cannot reach the dev server (different network, or a firewall in
the way), use a tunnel instead:

```bash
npx expo start --tunnel
```

`START-HERE.md` walks through all of this for someone who has never run an
Expo project.

---

## How it is put together

```
app/                     expo-router routes
  _layout.tsx            fonts, providers, auth gate
  login.tsx              email + password, forgot-password
  (app)/
    _layout.tsx          bottom tabs: Home, up to three of the screens below, More
    index.tsx            Home: your subjects, Administration, General (+ glance tiles)
    subject/[id].tsx     one subject's modules (any subject the portal lists)
    learn.tsx            My Learning (personal tasks)
    leaderboard.tsx      Leaderboard + contribution board
    resources.tsx        Physics Resources
    library.tsx          Resource Library
    users.tsx            Users & activity (staff)
    rankings.tsx         Rankings & analytics (staff)
    notifications.tsx    Notifications
    settings.tsx         Profile & settings
    more.tsx             Every page you have, grouped as the portal groups them
    web.tsx              The signed-in in-app browser (portal pages only)

src/
  theme/tokens.ts        design tokens ported from the site's tailwind.config.ts
  config.ts              Supabase + portal origin (override with EXPO_PUBLIC_*)
  auth/session.ts        sign-in, refresh, secure storage, session cookie
  auth/context.tsx       AuthProvider + session refresh
  api/client.ts          authenticated fetch against /api/portal/*
  api/hooks.ts           react-query hooks (usePortalNavigation: the menus)
  api/types.ts           response types, verified against the live API
  nav/nav.ts             reads the portal's navigation; which screen opens what
  nav/open.ts            opening a place or a link (native, WebView or browser)
  nav/roles.ts           EduRole, ROLE_LABELS, isStaff, isAdmin
  web/portal-url.ts      the exact-origin check for every link
  web/session-script.ts  how the WebView gets the session (portal origin only)
  components/            shared UI (Card, Button, PortalIcon, NavPlaces…)
scripts/
  test-web-target.mjs    `npm test`: link-safety tests
```

### Subject-first, from one source

The portal is arranged by subject: pick a subject (Physics, Digital SAT…) and
see its modules; Practical Lab sits inside Physics for students who have it;
General holds the pages every subject shares; staff also get Administration.
The app follows the same structure, and it does not keep its own list of
pages: after sign-in it fetches **`GET /api/portal/navigation`**, which the
portal builds from its subject registry (`src/lib/portal/subjects.ts` on the
website) with the same rule its own home page uses. So:

- the app shows exactly the subjects and modules the portal shows that user
  (admin switches, class enrolment, roles and desk roles all apply);
- a subject or module added to the portal's registry appears in the app with
  **no app release**: Home gets a card for it, its space lists its modules, and
  a module the app has no native screen for opens its portal page in the app;
- an icon is named by the portal (any lucide icon) and an accent by its token.

Each place in the reply has an id, name, icon, portal route, one-line purpose
and `native` — the name of the app's native screen for it, or null. The portal
decides which places have native screens (`APP_NATIVE_SCREENS` in the website's
`src/lib/portal/app-nav.ts`); the app opens a screen only when it knows the
name (`NATIVE_ROUTES` in `src/nav/nav.ts`), so an older app simply opens the
portal page instead. The website's `npm run test:portal` checks the two lists
agree and that the reply matches the portal's navigation for every role and
subject combination.

### Native screens vs. the in-app browser

Screens backed by a JSON API are **native React Native** (My Learning,
Leaderboard, Resources, Library, Notifications, Users, Rankings, Settings, and
Home and each subject's screen). Everything else — Exam Lab and its proctor,
the SAT Lab with its coach, tutor, practice and settings, Practical Lab, the
staff consoles, and any page the portal adds later — is the **real portal
page** inside the signed-in WebView, so it is identical and fully working. The
portal hides its own top bar there (the `portal_client=app` cookie), because
the app supplies the title bar and menus. Pages that open this way are marked
with a globe.

### Links and the session

The WebView carries the user's session, so the app is strict about where it
goes (`src/web/portal-url.ts`):

- Only the portal's **exact origin** — same scheme, host and port as
  `EXPO_PUBLIC_SITE_URL` — opens in the WebView with the session. The check
  parses the URL; it never compares string prefixes, refuses userinfo
  (`user@host`), whitespace and backslashes, and normalises paths.
- **Another website** (a resource on Supabase Storage or Google Drive, a link
  inside a page) opens in the phone's browser, without the session. A deep link
  to another website asks first.
- Anything else (`javascript:`, `intent:`, a malformed link) is refused.
- The session cookie written into the WebView is host-only (no `Domain`), so it
  is never sent to another subdomain, and the script that writes it checks the
  page's origin first.
- Deep links (`sjkportal://web?path=…`) go through exactly the same check.

### Authentication

The app signs in against Supabase directly (`token?grant_type=password`) with
the public anon key — the same key the website ships to every browser, with
row-level security behind it. The session is kept in `expo-secure-store` and
refreshed automatically.

Every API call presents the session two ways: as the `sb-<ref>-auth-token`
cookie and as an `Authorization: Bearer` header. The portal accepts either
(`src/lib/supabase/bearer.ts`; a session cookie wins when both arrive), and its
access locks apply to both.

---

## Configuration

Nothing is required to run. To point the app at a different environment, create
a `.env` file:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SITE_URL=https://sjabrankamran.com
```

`EXPO_PUBLIC_SITE_URL` must be the address the site serves from, with no path —
`https://sjabrankamran.com`, not `https://www.sjabrankamran.com` (the site
redirects www to it, and the app sends the session to one exact origin only).

**Trying the new menus against a local portal** (before `portal-v2` is
deployed): run the website's `npm run dev` on the same Wi-Fi, set
`EXPO_PUBLIC_SITE_URL=http://<this computer's LAN IP>:3000` in `mobile/.env`
and restart with `npx expo start --clear`. Next.js only serves its dev scripts
to other hosts it is told about, so for that session also add
`allowedDevOrigins: ["<LAN IP>"]` to the website's `next.config.mjs` (don't
commit it). That portal still uses the production Supabase project, so sign in
with your own account.

---

## Not included yet

- **iOS.** The code is cross-platform, but only Android has been set up and
  checked.
- **Push notifications.** The in-app notification list works; device push does
  not exist yet.
- **Offline mode.** Every screen needs a connection.
- **A standalone APK/AAB.** This is the Expo Go development build. Producing an
  installable binary is an EAS build and a separate step.
