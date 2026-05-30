// LINE公式アカウント Manager (manager.line.biz) を開いて現状を撮る。
// ログイン状態が引き継がれるか / アカウント作成導線があるかを確認（変更はしない）。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
// 新しいタブで開く（既存のDevelopersタブを残す）。
const page = await ctx.newPage();
await page.goto("https://manager.line.biz/", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(4000);
await page.screenshot({ path: "/tmp/oam.png", fullPage: false });
console.log("URL=" + page.url());
console.log("TITLE=" + (await page.title()));
const t = await page.evaluate(() => document.body.innerText).catch(() => "");
for (const h of ["ログイン","アカウントを作成","Create","作成","Messaging","公式アカウント","Official Account","ようこそ","業種","アカウント名"])
  if (t.includes(h)) console.log("HAS: " + h);
// 最初の数百字だけ（PIIに注意しつつ画面の性質を把握）
console.log("HEAD=" + t.replace(/\s+/g, " ").slice(0, 200));
await b.close();
