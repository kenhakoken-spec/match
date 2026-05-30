// 既存 LINE Login チャネル(2008094350)の Channel ID / secret を取得し、
// LIFF タブの LIFF ID 有無を確認して、.env.local に直接反映する。
// **secret はコンソールに出さない**（長さ・有無だけ報告）。env は git管理外。
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CHANNEL = "2008094350";
const ENV = "/mnt/c/tools/matching-app/.env.local";

const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

// --- Basic settings ---
await page.goto(`https://developers.line.biz/console/channel/${CHANNEL}/basic`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2500);
const basicText = await page.evaluate(() => document.body.innerText).catch(() => "");

// Channel ID（10桁）。既知だが念のため確認。
const idMatch = basicText.match(/\b\d{10}\b/);
const channelId = idMatch ? idMatch[0] : CHANNEL;

// Channel secret（32桁hex）。
const secMatch = basicText.match(/\b[0-9a-f]{32}\b/);
const channelSecret = secMatch ? secMatch[0] : "";

// --- LIFF タブ ---
await page.goto(`https://developers.line.biz/console/channel/${CHANNEL}/liff`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/line-liff-tab.png", fullPage: true });
const liffText = await page.evaluate(() => document.body.innerText).catch(() => "");
// LIFF ID 形式: 10桁-8hex
const liffMatch = liffText.match(/\b\d{10}-[0-9a-f]{8}\b/);
const liffId = liffMatch ? liffMatch[0] : "";
const hasAddBtn = /Add/.test(liffText);

// --- .env.local 反映（該当キーを置換 or 追記。他キーは保持） ---
let env = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
function upsert(key, val) {
  if (!val) return;
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${val}"`;
  if (re.test(env)) env = env.replace(re, line);
  else env += (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n";
}
upsert("LINE_LOGIN_CHANNEL_ID", channelId);
upsert("LINE_LOGIN_CHANNEL_SECRET", channelSecret);
if (liffId) upsert("NEXT_PUBLIC_LIFF_ID", liffId);
writeFileSync(ENV, env);

// --- 報告（secret は伏せる）---
console.log("CHANNEL_ID=" + channelId);
console.log("SECRET_FOUND=" + (channelSecret ? "yes(len=" + channelSecret.length + ")" : "NO"));
console.log("LIFF_ID=" + (liffId || "NONE"));
console.log("LIFF_HAS_ADD_BUTTON=" + hasAddBtn);
console.log("ENV_UPDATED=" + ENV);
await b.close();
