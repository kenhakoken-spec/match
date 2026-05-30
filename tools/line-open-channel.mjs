// 正しいプロバイダー(2005202077)の matching-app LINE Login チャネルを開き、
// Basic settings を撮って Channel ID 等の手がかりを拾う（変更はしない）。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

// プロバイダー一覧へ（正しいID）。
await page.goto("https://developers.line.biz/console/provider/2005202077", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);

// チャネルカード "matching-app" をクリック（LINE Login）。
let opened = false;
try {
  await page.getByText("matching-app", { exact: true }).first().click({ timeout: 6000 });
  opened = true;
} catch {
  // カードのLINE Loginテキスト経由
  try { await page.getByText("LINE Login", { exact: false }).first().click({ timeout: 6000 }); opened = true; } catch {}
}
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/line-channel.png", fullPage: true });
console.log("OPENED=" + opened);
console.log("URL=" + page.url());
console.log("TITLE=" + (await page.title()));
const t = await page.evaluate(() => document.body.innerText).catch(() => "");
for (const h of ["Basic settings","Channel ID","Channel secret","LIFF","Web app","Developing","Roles","Channel name"])
  if (t.includes(h)) console.log("HAS: " + h);
await b.close();
