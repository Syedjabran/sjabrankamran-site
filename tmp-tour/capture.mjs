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

const results = [];

const browser = await chromium.launch({
  executablePath: EXEC,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

async function safeGoto(url, waitMs = 2500) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e2) {}
  }
  await page.waitForTimeout(waitMs);
}

// --- LOGIN ---
console.log('LOGIN: opening', BASE + '/portal/login');
await safeGoto(BASE + '/portal/login', 2000);
// screenshot the login page raw first for scene 02 (before filling)
try {
  await page.screenshot({ path: path.join(shotsDir, '_login_raw.png') });
} catch {}

let loggedIn = false;
try {
  // find email + password inputs
  const emailSel = 'input[type="email"], input[name="email"], input[autocomplete="username"], input[name="username"]';
  const passSel = 'input[type="password"], input[name="password"]';
  await page.waitForSelector(emailSel, { timeout: 15000 });
  await page.fill(emailSel, creds.email);
  await page.fill(passSel, creds.password);
  // submit
  const btn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign In")').first();
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}),
    btn.click({ timeout: 10000 }),
  ]);
  await page.waitForTimeout(4000);
  const url = page.url();
  console.log('POST-LOGIN url:', url);
  loggedIn = !/\/login/i.test(url);
  if (!loggedIn) {
    // maybe redirect took a moment
    await page.waitForTimeout(3000);
    loggedIn = !/\/login/i.test(page.url());
  }
} catch (e) {
  console.log('LOGIN ERROR:', e.message);
}
console.log('LOGGED IN:', loggedIn, 'final url', page.url());

// --- CAPTURE SCENES ---
for (const sc of script.scenes) {
  const dest = path.join(shotsDir, sc.id + '.png');
  const url = BASE + sc.route;
  let captured = false, note = '', usedRoute = sc.route;
  try {
    await safeGoto(url, 3000);
    // dismiss any install / cookie banners if present
    // try to hide obvious modals overlaying content is risky; leave as-is
    const cur = page.url();
    if (/\/login/i.test(cur) && sc.route !== '/portal/login') {
      note = 'redirected-to-login';
    }
    await page.screenshot({ path: dest, animations: 'disabled' });
    captured = true;
  } catch (e) {
    note = 'error:' + e.message;
  }
  results.push({ id: sc.id, route: usedRoute, finalUrl: page.url(), captured, note });
  console.log(JSON.stringify(results[results.length-1]));
}

fs.writeFileSync(path.join(TMP, 'capture-results.json'), JSON.stringify({ loggedIn, results }, null, 2));
await browser.close();
console.log('DONE');
