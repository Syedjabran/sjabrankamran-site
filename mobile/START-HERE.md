# Run the portal app on your phone — start here

**Give this file to Claude Code and say: "follow START-HERE.md".**

It assumes you have never run a React Native or Expo project before. You do not
need Android Studio, an emulator, a Mac, or any API keys.

You will end up with the app running on your own Android phone in about
10 minutes, most of which is waiting for an install.

---

## Instructions for the AI assistant

You are setting up an Expo (React Native) app for someone who has not done this
before. Work through the numbered phases in order. Rules:

- **Run the commands yourself** rather than telling the user to. The only things
  they must do by hand are on their phone (installing Expo Go, scanning a QR).
- **Stop and tell them what you see** if a command fails. Do not silently retry
  with different flags, and do not "fix" it by deleting `node_modules` and
  `package-lock.json` unless the error specifically calls for it.
- `npx expo start` **does not exit** — it is a long-running server. Start it in
  the background, or tell the user to run it in their own terminal. Do not wait
  for it to finish; it never will.
- Do not commit anything unless asked. This setup is read-only on the repo.
- The app needs **no `.env` file and no API keys**. If you find yourself looking
  for secrets, you have gone wrong — re-read Phase 3.

---

## Phase 0 — Check the tools

```bash
node --version
git --version
```

**Node must be v20 or newer** (v22 LTS is ideal). Expo SDK 57 will not run on
Node 18.

If Node is missing or too old, install the LTS from <https://nodejs.org> and
open a new terminal afterwards so the new version is picked up.

---

## Phase 1 — Get the code

The app lives in the `mobile/` folder of the website repo, on the branch
`feat/mobile-app`.

**If you do not have the repo yet:**

```bash
git clone https://github.com/Syedjabran/sjabrankamran-site.git
cd sjabrankamran-site
git checkout feat/mobile-app
```

**If you already have the repo:**

```bash
cd sjabrankamran-site
git fetch origin
git checkout feat/mobile-app
git pull origin feat/mobile-app
```

The repo is **private**. If the clone asks for credentials and fails, the user
needs to be added as a collaborator, or authenticate with
`gh auth login` (GitHub CLI). Tell them — do not try to work around it.

Then move into the app:

```bash
cd mobile
```

Everything from here runs inside `mobile/`, **not** the repo root. The repo root
is the Next.js website; running `npm install` there installs the wrong thing.

---

## Phase 2 — Install

```bash
npm install
```

This takes 2–4 minutes and downloads roughly 600 packages. It is normal to see
deprecation warnings and a vulnerability count — ignore both.

There is an `.npmrc` in this folder setting `legacy-peer-deps=true`. That is
deliberate: Expo pins `react@19.2.3` while a transitive `react-dom` asks for
`^19.2.8`. React Native never loads `react-dom`, so the conflict is harmless.
**Do not delete `.npmrc`** — without it `npm install` fails with `ERESOLVE`.

Then confirm the code compiles:

```bash
npx tsc --noEmit
```

No output means success.

---

## Phase 3 — About configuration (read, don't act)

There is nothing to configure. The app points at the **live production portal**
at `https://www.sjabrankamran.com` and signs in against the same Supabase
project the website uses.

The Supabase URL and anon key are already in `src/config.ts`. These are **public
values** — the identical pair is in the website's own JavaScript bundle, served
to every visitor. Every table behind them is protected by row-level security, so
they grant nothing on their own. They are not secrets and there is no `.env` to
obtain.

You only need a `.env` if you want to point the app at a different environment;
`.env.example` shows the three variables.

---

## Phase 4 — Start the server

```bash
npx expo start
```

This prints a **QR code** and a URL like `exp://192.168.1.42:8081`, then keeps
running. Leave it running.

Assistant: start this in the background and report the `exp://` URL, or ask the
user to run it in their own terminal so they can see the QR directly. The first
bundle takes about 45 seconds when the phone connects — that is expected.

---

## Phase 5 — On the phone (the user does this)

1. On the Android phone, install **Expo Go** from the Play Store.
   Get the current version — the app targets Expo SDK 57, and an old Expo Go
   will refuse to open it.
2. Connect the phone to **the same Wi-Fi network as the computer**. This is the
   single most common thing that goes wrong.
3. Open Expo Go and either:
   - scan the QR code from the terminal, or
   - tap **Enter URL manually** and type the `exp://…` address.
4. Wait for "Bundling" to finish the first time.
5. Sign in with the portal email and password. Use your own portal account — if
   you do not have one, ask the repo owner to create it. Do not ask for someone
   else's password.

---

## Phase 6 — What you should see

After signing in, the tab bar at the bottom depends on your role.

- **Staff/admin:** Dashboard · Users · Rankings · Resources · More
- **Student:** Dashboard · Learning · Leaderboard · Resources · More

**More** contains the complete portal menu — the same sections, labels and order
as the website's sidebar, gated by the same roles.

Some screens are native React Native; others open the real portal page inside
the app, already signed in. Those are marked with a **globe** icon in the More
menu. That is deliberate, not unfinished work: Exam Lab's proctor runs MediaPipe
face and object detection in a browser engine, which has no React Native
equivalent, and several admin pages are server-rendered with no JSON API. Showing
the genuine page keeps them pixel-identical and fully working.

---

## Troubleshooting

**"Something went wrong" / the QR scans but nothing loads**

This is the most common failure, and there are two separate causes.

*Cause 1 — different networks.* The phone is on mobile data, or the computer is
on a guest/VPN network. Put both on the same Wi-Fi.

*Cause 2 — a firewall is blocking Metro.* Diagnose it like this:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/status
curl -s -o /dev/null -w "%{http_code}\n" http://<YOUR-LAN-IP>:8081/status
```

If the first prints `200` and the second prints `000`, the server is healthy but
the firewall is blocking it — the phone will never reach it either. This
happened on the machine this app was built on, so expect it.

**The fix for both causes is tunnel mode:**

```bash
npx expo start --tunnel
```

It routes through a public relay instead of your network, so it works on any
Wi-Fi, on mobile data, and through firewalls. `@expo/ngrok` is already a
dependency, so there is no install prompt.

Tunnel mode prints a different URL, like
`exp://xxxxxxx-anonymous-8081.exp.direct`. **That URL changes every time you
restart the server**, so re-scan the new QR after each restart.

If the terminal is not showing the tunnel URL (for example the assistant started
the server in the background), read it from the local ngrok API:

```bash
curl -s http://localhost:4040/api/tunnels
```

Take `public_url`, swap `http://` for `exp://`, and that is what Expo Go wants.

**Windows: allowing Metro through the firewall instead**
If you would rather fix the firewall than use a tunnel, allow Node.js on
**private** networks. Note that a previously dismissed prompt leaves a Block
rule behind that silently wins over later Allow rules, so check for one:

```bash
netsh advfirewall firewall show rule name=all | grep -iB2 -A6 node.exe
```

Tunnel mode is less trouble.

**`ERESOLVE could not resolve` during `npm install`**
`.npmrc` is missing or was deleted. Restore it (`git checkout .npmrc`) and
re-run. See Phase 2.

**"Project is incompatible with this version of Expo Go"**
Update Expo Go from the Play Store.

**Metro cache weirdness after pulling new commits**

```bash
npx expo start --clear
```

**`npm install` fails at the repo root**
You are in the wrong folder. `cd mobile` first.

---

## Making changes

Edit files and save — the phone reloads automatically. No rebuild, no re-scan.

Useful map:

| Where | What |
|---|---|
| `app/` | Screens (expo-router: the file path is the route) |
| `src/theme/tokens.ts` | Colours, fonts, spacing — ported from the website's Tailwind config |
| `src/api/hooks.ts` | Data fetching |
| `src/nav/nav.ts` | The role-aware menu, ported from the website's `navFor()` |
| `src/auth/` | Sign-in, session storage, token refresh |

Colours are only ever defined in `src/theme/tokens.ts` so the app cannot drift
from the website. Do not hardcode a hex value in a screen.

Before pushing anything:

```bash
npx tsc --noEmit
```

Full architecture notes are in `README.md` and
`docs/superpowers/specs/2026-09-02-portal-mobile-app-design.md`.
