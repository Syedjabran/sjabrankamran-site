import { chromium } from 'playwright';
import fs from 'fs';
const TMP='/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour';
const BASE='https://sjabrankamran.com';
const EXEC='/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const proxy=JSON.parse(fs.readFileSync(TMP+'/.proxy.json','utf8'));
const creds=JSON.parse(fs.readFileSync(TMP+'/.capture-login.json','utf8'));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const browser=await chromium.launch({executablePath:EXEC,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-blink-features=AutomationControlled'],proxy});
const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2,ignoreHTTPSErrors:true,userAgent:UA,locale:'en-US',timezoneId:'Asia/Karachi'});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined});window.chrome={runtime:{}};});
const page=await ctx.newPage();
async function settle(ms=45000){const s=Date.now();while(Date.now()-s<ms){let t='';try{t=await page.evaluate(()=>document.body?document.body.innerText:'');}catch{}if(!/verifying your browser|Failed to verify|Security Checkpoint|Just a moment/i.test(t)&&t.trim().length>30)return true;await page.waitForTimeout(1500);}return false;}
await page.goto(BASE+'/portal/login',{waitUntil:'domcontentloaded',timeout:45000});
await settle();
await page.waitForTimeout(3000);
const inputs=await page.$$eval('input',els=>els.map(e=>({type:e.type,name:e.name,id:e.id,ph:e.placeholder,ac:e.autocomplete})));
const buttons=await page.$$eval('button',els=>els.map(e=>({txt:(e.innerText||'').slice(0,30),type:e.type})));
console.log('LOGIN_INPUTS',JSON.stringify(inputs));
console.log('LOGIN_BUTTONS',JSON.stringify(buttons));
// login
try{
  await page.fill('input[type="email"], input[name="email"], input[autocomplete="username"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first().click();
  await page.waitForTimeout(6000);
  await settle();
}catch(e){console.log('LOGINERR',e.message);}
console.log('AFTER_LOGIN_URL',page.url());
// inspect portal nav links (SPA)
const links=await page.$$eval('a',els=>els.map(e=>({txt:(e.innerText||'').trim().slice(0,30),href:e.getAttribute('href')})).filter(l=>l.href&&l.href.includes('/portal')));
console.log('PORTAL_LINKS',JSON.stringify(links.slice(0,40)));
// screenshot current styled portal
await page.screenshot({path:TMP+'/shots/_probe_portal.png'});
console.log('BG', await page.evaluate(()=>getComputedStyle(document.body).backgroundColor));
console.log('SHEETS', await page.evaluate(()=>{let r=0;try{for(const s of document.styleSheets)r+=(s.cssRules?s.cssRules.length:0);}catch{}return {n:document.styleSheets.length,rules:r};}));
await browser.close();
console.log('INSPECT-DONE');
