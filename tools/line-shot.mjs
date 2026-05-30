// 既存CDP(127.0.0.1:9222)に接続して現在画面を撮るだけ（ブラウザ本体は閉じない）。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/line-now.png" });
console.log("URL=" + page.url());
console.log("TITLE=" + (await page.title()));
await b.close(); // CDPセッション切断のみ。launchPersistentContextのブラウザは常駐。
