// matching-app プロバイダーで「新規チャネル作成」に進み、種別選択画面を撮る。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

// プロバイダー画面でなければ移動
if (!/provider\/2008329420/.test(page.url())) {
  await page.goto("https://developers.line.biz/console/provider/2008329420", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1500);
}

// 「Create a LINE Login channel」を優先、無ければ「Create a new channel」。
let clicked = "";
const tryClick = async (name) => {
  try { await page.getByText(name, { exact: false }).first().click({ timeout: 5000 }); clicked = name; return true; }
  catch { return false; }
};
if (!(await tryClick("Create a LINE Login channel"))) {
  await tryClick("Create a new channel");
}
console.log("CLICKED=" + (clicked || "none"));
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/line-newch.png", fullPage: true });
console.log("URL=" + page.url());
console.log("TITLE=" + (await page.title()));
const t = await page.evaluate(() => document.body.innerText).catch(() => "");
for (const h of ["LINE Login","Messaging API","LINE MINI","Channel name","Channel type","Region","App types","Web app","Email","Provider"])
  if (t.includes(h)) console.log("HAS: " + h);
await b.close();
