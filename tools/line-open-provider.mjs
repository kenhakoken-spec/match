// matching-app プロバイダーを開き、既存チャネル一覧を撮る。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

// 左ナビ or 一覧の "matching-app" リンクをクリック。
try {
  await page.getByRole("link", { name: "matching-app", exact: true }).first().click({ timeout: 8000 });
} catch {
  try { await page.getByText("matching-app", { exact: true }).first().click({ timeout: 8000 }); }
  catch (e) { console.log("CLICK_WARN " + String(e).split("\n")[0]); }
}
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/line-provider.png", fullPage: true });
console.log("URL=" + page.url());
console.log("TITLE=" + (await page.title()));
// チャネル種別の手がかりを拾う
const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
const hints = ["LINE Login", "Messaging API", "LIFF", "MINI", "Create a new channel", "Create a LINE Login", "Channels", "Settings"];
for (const h of hints) if (bodyText.includes(h)) console.log("HAS: " + h);
await b.close();
