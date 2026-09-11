import { chromium } from 'playwright';
const EXEC = '/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXEC, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const ctx = await browser.newContext({ viewport:{width:1280,height:800}, deviceScaleFactor:2, ignoreHTTPSErrors:true });
const page = await ctx.newPage();
page.on('console', m => console.log('PAGE-CONSOLE', m.type(), m.text().slice(0,200)));
page.on('requestfailed', r => console.log('REQ-FAILED', r.url(), r.failure()?.errorText));
try {
  const resp = await page.goto('https://sjabrankamran.com/portal/login', { waitUntil:'domcontentloaded', timeout:45000 });
  console.log('STATUS', resp && resp.status());
  await page.waitForTimeout(6000);
  console.log('URL', page.url());
  console.log('TITLE', await page.title());
  const inputs = await page.$$eval('input', els => els.map(e => ({type:e.type, name:e.name, ph:e.placeholder})));
  console.log('INPUTS', JSON.stringify(inputs));
  const bodyLen = (await page.content()).length;
  console.log('BODYLEN', bodyLen);
  await page.screenshot({ path:'/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour/probe.png' });
} catch(e){ console.log('ERR', e.message); }
await browser.close();
console.log('PROBE-DONE');
