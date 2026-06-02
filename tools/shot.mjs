import { chromium } from "playwright";
const url = process.argv[2];
const out = process.argv[3];
const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out, fullPage: true });
  const txt = await page.evaluate(()=>document.body.innerText.slice(0,400)).catch(()=> "");
  console.log("OK " + out + " | " + txt.replace(/\n/g,' / ').slice(0,200));
  await page.close();
} catch (e) { console.log("ERR " + String(e).split("\n")[0]); }
finally { await browser.close(); }
