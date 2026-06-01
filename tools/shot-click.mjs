import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://match-nomi.vercel.app/", { waitUntil:"networkidle", timeout:30000 }).catch(()=>{});
  await page.waitForTimeout(2000);
  // 「LINEではじめる」クリック
  const btn = page.locator('[data-testid=login-button]');
  console.log("btn count=" + await btn.count());
  await btn.click().catch(e=>console.log("click err "+e));
  await page.waitForTimeout(5000);
  console.log("after-click URL=" + page.url());
  await page.screenshot({ path:"/tmp/login-click.png", fullPage:true });
  const txt = await page.evaluate(()=>document.body.innerText.slice(0,300)).catch(()=> "");
  console.log("text: " + txt.replace(/\n/g,' / '));
  await page.close();
} catch (e) { console.log("ERR " + String(e).split("\n")[0]); }
finally { await browser.close(); }
