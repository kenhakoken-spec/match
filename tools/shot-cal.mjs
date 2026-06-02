import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://match-nomi.vercel.app/browse", { waitUntil:"networkidle", timeout:30000 }).catch(()=>{});
  await page.waitForTimeout(2000);
  // カレンダートグルをクリック
  const cal = page.locator('[data-testid=view-toggle-calendar]');
  console.log("toggle count=" + await cal.count());
  await cal.click().catch(e=>console.log("click err "+e));
  await page.waitForTimeout(1500);
  await page.screenshot({ path:"/tmp/cal.png", fullPage:true });
  const txt = await page.evaluate(()=>document.body.innerText.slice(0,300)).catch(()=> "");
  console.log("text: " + txt.replace(/\n/g,' / '));
  await page.close();
} catch(e){ console.log("ERR "+String(e).split("\n")[0]); }
finally { await browser.close(); }
