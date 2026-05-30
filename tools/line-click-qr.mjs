// CDP接続→「LINEアカウント」ボタンを押し、QRログイン画面を撮る。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

// すでにログイン画面でなければ、ログインURLへ。
if (!/account\.line\.biz\/login|access\.line\.me/.test(page.url())) {
  await page.goto("https://account.line.biz/login?redirectUri=https%3A%2F%2Fdevelopers.line.biz%2Fconsole%2F", { waitUntil: "domcontentloaded" }).catch(() => {});
}

// 「LINEアカウント」ボタンをクリック（テキストで特定）。
try {
  const btn = page.getByText("LINEアカウント", { exact: false }).first();
  await btn.click({ timeout: 8000 });
} catch (e) {
  console.log("CLICK_WARN " + String(e).split("\n")[0]);
}

// 遷移待ち（access.line.me のQR/メール画面へ）。
await page.waitForTimeout(3500);
await page.screenshot({ path: "/tmp/line-qr.png", fullPage: false });
console.log("URL=" + page.url());
console.log("TITLE=" + (await page.title()));
// QR要素やメール入力の有無を軽くレポート
const hasQrImg = await page.locator("img[alt*='QR'], canvas, img[src*='qr']").count().catch(() => 0);
const hasEmail = await page.locator("input[type='email'], input[name='tid'], input[autocomplete='username']").count().catch(() => 0);
console.log("QR_LIKE=" + hasQrImg + " EMAIL_INPUT=" + hasEmail);
await b.close();
