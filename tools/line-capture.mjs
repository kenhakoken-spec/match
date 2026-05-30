// LINE Developers の「今の本物の画面」を取得するキャプチャスクリプト。
// 公開ページ（ログイン画面・公式ドキュメントの手順）を撮る。ログインの先は殿の操作。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/line-shots";
mkdirSync(OUT, { recursive: true });

const targets = [
  { name: "01_console_login", url: "https://developers.line.biz/console/", full: false },
  { name: "02_login_getstarted", url: "https://developers.line.biz/en/docs/line-login/getting-started/", full: true },
  { name: "03_messaging_getstarted", url: "https://developers.line.biz/en/docs/messaging-api/getting-started/", full: true },
  { name: "04_liff_register", url: "https://developers.line.biz/en/docs/liff/registering-liff-apps/", full: true },
  { name: "05_oa_manager_top", url: "https://manager.line.biz/", full: false },
  { name: "06_business_signup", url: "https://account.line.biz/signup", full: false },
];

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "ja-JP",
  });
  const page = await ctx.newPage();
  for (const t of targets) {
    try {
      await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: t.full });
      console.log(`OK  ${t.name}  <- ${page.url()}`);
    } catch (e) {
      console.log(`ERR ${t.name}  ${String(e).split("\n")[0]}`);
    }
  }
  await ctx.close();
} finally {
  await browser.close();
}
console.log("DONE");
