import { chromium } from 'playwright';
import fs from 'fs';
const TMP = '/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour';
const BASE = 'https://sjabrankamran.com';
const EXEC = '/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const script = JSON.parse(fs.readFileSync(TMP + '/script.json', 'utf8'));
const creds = JSON.parse(fs.readFileSync(TMP + '/.capture-login.json', 'utf8'));
const proxy = JSON.parse(fs.readFileSync(TMP + '/.proxy.json', 'utf8'));
const shotsDir = TMP + '/shots';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const only = (process.argv[2] || '').split(',').filter(Boolean); // e.g. 05_examlab,06_review
const scenes = script.scenes.filter(s => only.includes(s.id));

const browser = await chromium.launch({
  executablePath: EXEC, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--lang=en-US', '--js-flags=--max-old-space-size=512'],
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
async function waitReady(check, maxMs = 55000) {
  const s = Date.now();
  while (Date.now() - s < maxMs) {
    let t = ''; try { t = await page.evaluate(() => document.body ? document.body.innerText : ''); } catch {}
    if (!isChallenge(t)) { let ok = false; try { ok = await page.evaluate(check); } catch {} if (ok) return true; }
    await page.waitForTimeout(1500);
  }
  return false;
}
async function navReady(url, check) {
  for (let a = 0; a < 3; a++) {
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 55000 }); break; }
    catch (e) { if (a === 2) return false; await page.waitForTimeout(2500); }
  }
  return await waitReady(check, 55000);
}
const portalReady = () => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const dark = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && bg !== 'transparent';
  return dark && (document.body.innerText || '').trim().length > 40;
};
const loginReady = () => !!document.querySelector('#portal-email');

console.log('warm', await navReady(BASE + '/', portalReady));
const okLogin = await navReady(BASE + '/portal/login', loginReady);
let loggedIn = false;
if (okLogin) {
  try {
    await page.fill('#portal-email', creds.email);
    await page.fill('#portal-password', creds.password);
    await page.locator('form button[type="submit"]').first().click();
    await waitReady(() => !/\/portal\/login/i.test(location.pathname), 45000);
    await page.waitForTimeout(2500);
    loggedIn = !/\/portal\/login/i.test(page.url());
  } catch (e) { console.log('LOGIN ERR', e.message); }
}
console.log('LOGGED IN', loggedIn, page.url());

const out = [];
for (const sc of scenes) {
  const dest = shotsDir + '/' + sc.id + '.png';
  const ready = await navReady(BASE + sc.route, sc.route === '/portal/login' ? loginReady : portalReady);
  try { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1200); } catch {}
  const finalUrl = page.url();
  const redirected = /\/portal\/login/i.test(finalUrl) && sc.route !== '/portal/login';
  let note = ready ? '' : 'not-ready'; if (redirected) note += ';redirected-to-login';
  try { await page.screenshot({ path: dest, animations: 'disabled' }); } catch (e) { note += ' shot-err'; }
  out.push({ id: sc.id, ready, finalUrl, note });
  console.log(JSON.stringify(out[out.length - 1]));
}
await browser.close();
console.log('SUBSET-DONE');
