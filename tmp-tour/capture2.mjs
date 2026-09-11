import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TMP = '/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour';
const BASE = 'https://sjabrankamran.com';
const EXEC = '/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const script = JSON.parse(fs.readFileSync(path.join(TMP, 'script.json'), 'utf8'));
const creds = JSON.parse(fs.readFileSync(path.join(TMP, '.capture-login.json'), 'utf8'));
const proxy = JSON.parse(fs.readFileSync(path.join(TMP, '.proxy.json'), 'utf8'));
const shotsDir = path.join(TMP, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const browser = await chromium.launch({
  executablePath: EXEC,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--lang=en-US',
  ],
  proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
  userAgent: UA,
  locale: 'en-US',
  timezoneId: 'Asia/Karachi',
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
});
// strip webdriver traces
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  window.chrome = { runtime: {} };
});
const page = await ctx.newPage();

function isChallenge(txt) {
  return /verifying your browser|Failed to verify|Security Checkpoint|Just a moment|Checking your browser/i.test(txt || '');
}

// Wait until page is NOT a challenge and appears styled. Returns {ok, reason}
async function waitStyledAndReal(maxMs = 45000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < maxMs) {
    let bodyText = '';
    try { bodyText = await page.evaluate(() => document.body ? document.body.innerText : ''); } catch {}
    last = bodyText;
    if (!isChallenge(bodyText)) {
      // check styling: does the body have a dark/non-default background, or are stylesheets loaded?
      let styled = false;
      try {
        styled = await page.evaluate(() => {
          const sheets = document.styleSheets ? document.styleSheets.length : 0;
          let rules = 0;
          try { for (const s of document.styleSheets) { rules += (s.cssRules ? s.cssRules.length : 0); } } catch {}
          const bg = getComputedStyle(document.body).backgroundColor;
          const dark = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && bg !== 'transparent';
          return (sheets > 0 && rules > 3) || dark;
        });
      } catch {}
      if (bodyText.trim().length > 30 && styled) return { ok: true, reason: 'styled' };
    }
    // if it's a challenge, try to let it auto-solve; occasionally reload
    if (isChallenge(bodyText) && (Date.now() - start) > 12000) {
      try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
    }
    await page.waitForTimeout(1500);
  }
  return { ok: false, reason: isChallenge(last) ? 'challenge' : 'unstyled_or_empty' };
}

async function gotoRoute(route) {
  const url = BASE + route;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (e) {
      await page.waitForTimeout(2000);
      continue;
    }
    const r = await waitStyledAndReal(40000);
    if (r.ok) { await page.waitForTimeout(1500); return r; }
    // retry: full reload
    await page.waitForTimeout(1500);
  }
  return { ok: false, reason: 'exhausted' };
}

const results = [];

// --- pass Vercel checkpoint on landing first (warms cookie) ---
console.log('WARMUP landing');
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
console.log('warmup', JSON.stringify(await waitStyledAndReal(45000)));

// --- LOGIN ---
console.log('LOGIN');
await page.goto(BASE + '/portal/login', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await waitStyledAndReal(45000);
let loggedIn = false;
try {
  const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="username"], input[name="username"]';
  const passSel = 'input[type="password"], input[name="password"]';
  await page.waitForSelector(emailSel, { timeout: 20000 });
  await page.fill(emailSel, creds.email);
  await page.fill(passSel, creds.password);
  const btn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first();
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(5000);
  await waitStyledAndReal(30000);
  loggedIn = !/\/login/i.test(page.url());
} catch (e) { console.log('LOGIN ERR', e.message); }
console.log('LOGGED IN', loggedIn, page.url());

// --- CAPTURE ---
for (const sc of script.scenes) {
  const dest = path.join(shotsDir, sc.id + '.png');
  const r = await gotoRoute(sc.route);
  let note = r.ok ? '' : r.reason;
  try {
    await page.screenshot({ path: dest, animations: 'disabled' });
  } catch (e) { note += ' shot-err:' + e.message; }
  results.push({ id: sc.id, route: sc.route, finalUrl: page.url(), ok: r.ok, note });
  console.log(JSON.stringify(results[results.length - 1]));
}

fs.writeFileSync(path.join(TMP, 'capture-results2.json'), JSON.stringify({ loggedIn, results }, null, 2));
await browser.close();
console.log('DONE');
