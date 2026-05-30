// 直URL遷移はSPAで404になるため、コンソールホームから「クリックのみ」で辿る。
// matching-app プロバイダ → LINE Login チャネルカード → Basic settings を読む。
// secretはチャットに出さず .env.local に直書き。LIFFタブのAdd有無も見る。
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const ENV = "/mnt/c/tools/matching-app/.env.local";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
const log = (m) => console.log(m);

// 1. コンソールホームへ（ここは直URLでも生きる入口）。
await page.goto("https://developers.line.biz/console/", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2500);

// 2. 左ナビ/一覧の matching-app をクリック。
async function clickText(t, timeout = 7000) {
  try { await page.getByText(t, { exact: true }).first().click({ timeout }); return true; }
  catch { try { await page.getByText(t, { exact: false }).first().click({ timeout: 3000 }); return true; } catch { return false; } }
}
await clickText("matching-app");
await page.waitForTimeout(2500);
log("after-provider URL=" + page.url());

// 3. チャネルカード（"matching-app" の見出し or "LINE Login"）をクリック。
//    プロバイダ名と同名カードなので、カード内の "LINE Login" を狙う。
let opened = false;
try { await page.getByText("LINE Login", { exact: false }).first().click({ timeout: 6000 }); opened = true; } catch {}
if (!opened) {
  // カード見出し（2つ目の matching-app）を試す
  const cards = page.getByText("matching-app", { exact: true });
  const n = await cards.count();
  if (n > 1) { try { await cards.nth(n - 1).click({ timeout: 6000 }); opened = true; } catch {} }
}
await page.waitForTimeout(3000);
log("after-channel URL=" + page.url());
await page.screenshot({ path: "/tmp/ch-basic.png", fullPage: true });

const basicText = await page.evaluate(() => document.body.innerText).catch(() => "");
const is404 = basicText.includes("404");
log("is404=" + is404);

// Basic settings タブをクリック（既定でBasicのことが多いが念のため）。
if (!is404) {
  await clickText("Basic settings", 4000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/ch-basic.png", fullPage: true });
}
const txt = await page.evaluate(() => document.body.innerText).catch(() => "");
const channelId = (txt.match(/Channel ID[\s\S]{0,40}?(\d{10})/) || [])[1] || (txt.match(/\b\d{10}\b/) || [])[0] || "";
const channelSecret = (txt.match(/\b[0-9a-f]{32}\b/) || [])[0] || "";

// env upsert
let env = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
const upsert = (k, v) => { if (!v) return; const re = new RegExp(`^${k}=.*$`, "m"); const line = `${k}="${v}"`; env = re.test(env) ? env.replace(re, line) : env + (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n"; };
upsert("LINE_LOGIN_CHANNEL_ID", channelId);
upsert("LINE_LOGIN_CHANNEL_SECRET", channelSecret);
writeFileSync(ENV, env);

log("CHANNEL_ID=" + (channelId || "NONE"));
log("SECRET=" + (channelSecret ? "found(len=" + channelSecret.length + ")" : "NONE"));
log("URL_FINAL=" + page.url());
await b.close();
