import { chromium } from 'playwright';
import fs from 'fs';
const TMP='/home/admin/.openclaw/workspace/sjabrankamran-site/tmp-tour';
const BASE='https://sjabrankamran.com';
const EXEC='/home/admin/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const proxy=JSON.parse(fs.readFileSync(TMP+'/.proxy.json','utf8'));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const browser=await chromium.launch({executablePath:EXEC,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-blink-features=AutomationControlled'],proxy});
const ctx=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2,ignoreHTTPSErrors:true,userAgent:UA,locale:'en-US',timezoneId:'Asia/Karachi'});
await ctx.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>undefined});window.chrome={runtime:{}};});
const page=await ctx.newPage();
await page.goto(BASE+'/portal/login',{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('nav',e.message));
// poll for inputs up to 40s
for(let i=0;i<20;i++){
  const n=await page.$$eval('input',e=>e.length).catch(()=>0);
  const bt=await page.evaluate(()=>document.body?document.body.innerText.slice(0,60):'').catch(()=>'');
  console.log(`t=${i*2}s inputs=${n} txt="${bt.replace(/\n/g,' ')}"`);
  if(n>0)break;
  await page.waitForTimeout(2000);
}
const inputs=await page.$$eval('input',els=>els.map(e=>({type:e.type,name:e.name,id:e.id,ph:e.placeholder,ac:e.autocomplete,cls:e.className.slice(0,40)})));
console.log('INPUTS',JSON.stringify(inputs));
// grab the form region HTML
const html=await page.evaluate(()=>{const f=document.querySelector('form');return f?f.outerHTML.slice(0,1200):'NO-FORM '+document.body.innerHTML.slice(0,1500);});
console.log('FORMHTML', html);
await browser.close();
console.log('DONE2');
