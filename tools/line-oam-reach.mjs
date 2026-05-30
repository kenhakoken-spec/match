// OAMの公式アカウント「作成」フォームに確実に到達する。複数手段でクリックし、
// 遷移後のURL/フィールド/スクショを保存（送信はしない・到達と把握のみ）。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
let page = ctx.pages().find(p => p.url().includes("manager.line.biz"));
if (!page) { page = await ctx.newPage(); }
await page.goto("https://manager.line.biz/", { waitUntil: "domcontentloaded" }).catch(()=>{});
await page.waitForTimeout(3000);

const log = (m)=>console.log(m);
let how = "none";
// 1) href に signup/create を含むリンク
try {
  const a = page.locator('a[href*="signup"], a[href*="create"], a[href*="add"]').first();
  if (await a.count()) { await a.click({ timeout: 5000 }); how = "href-link"; }
} catch {}
// 2) 「作成」リンク（role=link）
if (how === "none") { try { await page.getByRole("link", { name: /作成|Create/ }).first().click({ timeout: 5000 }); how = "role-link"; } catch {} }
// 3) 「作成」テキスト
if (how === "none") { try { await page.getByText("作成", { exact: true }).first().click({ timeout: 5000 }); how = "text"; } catch {} }
await page.waitForTimeout(4000);

// signup が別ドメイン/別タブで開くこともあるので全ページ確認
const pages = ctx.pages();
let formPage = pages.find(p => /signup|create|entry|account.*new/.test(p.url())) || page;
await formPage.waitForTimeout(1500);
await formPage.screenshot({ path: "/tmp/oam-reach.png", fullPage: true });

const items = await formPage.evaluate(() => {
  const labelOf = (el) => {
    if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.innerText.trim().slice(0,50); }
    let p = el.closest("div,section,li,fieldset,label");
    for (let i=0;i<5&&p;i++){ const t=(p.querySelector("label,legend,h2,h3,h4,p,span")?.innerText||"").trim(); if(t&&t.length<70) return t.slice(0,60); p=p.parentElement; }
    return "";
  };
  return Array.from(document.querySelectorAll("input,textarea,select,button")).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}).map(el=>({ tag: el.tagName.toLowerCase(), type: el.type||"", placeholder: el.placeholder||"", required: el.required||undefined, text: el.tagName==="BUTTON"?(el.innerText||"").trim().slice(0,24):undefined, options: el.tagName==="SELECT"?Array.from(el.options).map(o=>o.text).filter(Boolean).slice(0,25):undefined, label: labelOf(el) }));
});
writeFileSync("/tmp/oam-reach.json", JSON.stringify({ how, url: formPage.url(), title: "", items }, null, 1));
log("HOW=" + how);
log("FORM_URL=" + formPage.url());
log("FIELDS=" + items.length);
await b.close();
