import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const TMP = '/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour';
const BASE = 'https://sjabrankamran.com';
const EXEC = '/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const script = JSON.parse(fs.readFileSync(TMP + '/script.json', 'utf8'));
const creds = JSON.parse(fs.readFileSync(TMP + '/.capture-login.json', 'utf8'));
const proxy = JSON.parse(fs.readFileSync(TMP + '/.proxy.json', 'utf8'));
const shotsDir = TMP + '/shots';
fs.mkdirSync(shotsDir, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const browser = await chromium.launch({
  executablePath: EXEC, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--lang=en-US'],
  proxy,
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true,
  userAgent: UA, locale: 'en-US', timezoneId: 'Asia/Karachi',
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {} };
});
const page = await ctx.newPage();

const isChallenge = t => /verifying your browser|Failed to verify|Security Checkpoint|Just a moment|Checking your browser/i.test(t || '');

// Wait for challenge to clear AND app content present. `check` = extra dom predicate.
async function waitReady(check, maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    let txt = '';
    try { txt = await page.evaluate(() => document.body ? document.body.innerText : ''); } catch {}
    if (!isChallenge(txt)) {
      let ok = false;
      try { ok = await page.evaluate(check); } catch {}
      if (ok) return true;
    }
    await page.waitForTimeout(1500);
  }
  return false;
}

async function navReady(url, check) {
  // gentle: single goto, networkidle, then poll. Retry goto max 2x on hard nav error.
  for (let a = 0; a < 3; a++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      break;
    } catch (e) {
      if (a === 2) return false;
      await page.waitForTimeout(2500);
    }
  }
  return await waitReady(check, 60000);
}

// predicate: styled portal (dark bg) + has real text
const portalReady = () => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const dark = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && bg !== 'transparent';
  const len = (document.body.innerText || '').trim().length;
  return dark && len > 40;
};
const loginReady = () => !!document.querySelector('#portal-email');

const results = [];

// warm + login
console.log('WARM landing');
await navReady(BASE + '/', portalReady);
console.log('LOGIN nav');
const okLogin = await navReady(BASE + '/portal/login', loginReady);
console.log('login form ready:', okLogin);
let loggedIn = false;
if (okLogin) {
  try {
    await page.fill('#portal-email', creds.email);
    await page.fill('#portal-password', creds.password);
    await page.locator('form button[type="submit"]').first().click();
    // wait for navigation away from /login
    await waitReady(() => !/\/portal\/login/i.test(location.pathname), 45000);
    await page.waitForTimeout(2500);
    loggedIn = !/\/portal\/login/i.test(page.url());
  } catch (e) { console.log('LOGIN ERR', e.message); }
}
console.log('LOGGED IN', loggedIn, page.url());

// capture scenes
for (const sc of script.scenes) {
  const dest = shotsDir + '/' + sc.id + '.png';
  const url = BASE + sc.route;
  const check = sc.route === '/portal/login' ? loginReady : portalReady;
  const ready = await navReady(url, check);
  const finalUrl = page.url();
  const redirected = sc.route.startsWith('/portal') && sc.route !== '/portal/login' && /\/portal\/login/i.test(finalUrl);
  // settle animations & scroll top
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
  } catch {}
  let note = ready ? '' : 'not-ready';
  if (redirected) note = (note ? note + ';' : '') + 'redirected-to-login';
  try { await page.screenshot({ path: dest, animations: 'disabled' }); }
  catch (e) { note += ' shot-err:' + e.message; }
  results.push({ id: sc.id, route: sc.route, finalUrl, ready, note });
  console.log(JSON.stringify(results[results.length - 1]));
}

fs.writeFileSync(TMP + '/capture-results3.json', JSON.stringify({ loggedIn, results }, null, 2));
await browser.close();
console.log('DONE');
