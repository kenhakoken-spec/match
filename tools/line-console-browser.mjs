// 殿のデスクトップに「操作用ブラウザ」を出して開発将軍が駆動するためのランチャ。
// WSLg(DISPLAY=:0) 経由で headed Chromium を起動し、CDP(9222) を開けたまま常駐する。
//   1) background 起動 → デスクトップに窓が出る
//   2) 殿が その窓で LINE にログイン（＝認証は殿だけが可能）
//   3) 開発将軍は connectOverCDP('http://127.0.0.1:9222') でフォーム入力を代行
//   4) 最後の Create/発行 ボタンは殿が押す（最終承認）
// 永続プロファイル(/tmp/line-profile)でログイン状態はターンをまたいで保持。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

let ctx;
try {
  ctx = await chromium.launchPersistentContext("/tmp/line-profile", {
    headless: false,
    viewport: { width: 1280, height: 860 },
    locale: "ja-JP",
    args: [
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
} catch (e) {
  writeFileSync("/tmp/cdp-ready.txt", "ERROR: " + String(e).split("\n")[0]);
  console.log("LAUNCH_ERROR " + String(e).split("\n")[0]);
  throw e;
}

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page
  .goto("https://developers.line.biz/console/", { waitUntil: "domcontentloaded" })
  .catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/line-live.png" }).catch(() => {});
writeFileSync("/tmp/cdp-ready.txt", "READY url=" + page.url());
console.log("BROWSER_READY cdp=http://127.0.0.1:9222 url=" + page.url());

await new Promise(() => {}); // 常駐
