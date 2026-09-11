import { chromium } from 'playwright';
import fs from 'fs';
const TMP='/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour';
const BASE='https://sjabrankamran.com';
const EXEC='/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const proxy=JSON.parse(fs.readFileSync(TMP+'/.proxy.json','utf8'));
const creds=JSON.parse(fs.readFileSync(TMP+'/.capture-login.json','utf8'));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const browser=await chromium.launch({executablePath:EXEC,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-blink-features=AutomationControlled','--lang=en-US'],proxy});
const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2,ignoreHTTPSErrors:true,userAgent:UA,locale:'en-US',timezoneId:'Asia/Karachi'});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined});window.chrome={runtime:{}};});
const page=await ctx.newPage();
const isCh=t=>/verifying your browser|Failed to verify|Security Checkpoint|Just a moment/i.test(t||'');
async function waitReady(check,maxMs=55000){const s=Date.now();while(Date.now()-s<maxMs){let t='';try{t=await page.evaluate(()=>document.body?document.body.innerText:'');}catch{}if(!isCh(t)){let ok=false;try{ok=await page.evaluate(check);}catch{}if(ok)return true;}await page.waitForTimeout(1500);}return false;}
// warm to clear challenge, then login page fresh (not authenticated)
await page.goto(BASE+'/',{waitUntil:'networkidle',timeout:55000}).catch(()=>{});
await waitReady(()=>{const b=getComputedStyle(document.body).backgroundColor;return b&&b!=='rgb(255, 255, 255)'&&(document.body.innerText||'').length>40;});
await page.goto(BASE+'/portal/login',{waitUntil:'networkidle',timeout:55000}).catch(()=>{});
const ok=await waitReady(()=>!!document.querySelector('#portal-email'));
console.log('login form ready',ok);
// Fill email + tick "remember" checkbox to visually reinforce narration; do NOT submit.
try{
  await page.fill('#portal-email', creds.email);
  const cb=page.locator('input[type="checkbox"]').first();
  if(await cb.count()) await cb.check({timeout:3000}).catch(()=>{});
}catch(e){console.log('fill',e.message);}
await page.evaluate(()=>window.scrollTo(0,0));
await page.waitForTimeout(1000);
await page.screenshot({path:TMP+'/shots/02_install.png',animations:'disabled'});
console.log('captured 02 login', page.url());
await browser.close();
console.log('LOGIN-SHOT-DONE');
