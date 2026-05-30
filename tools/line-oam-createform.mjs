// OAM「作成」をクリックして作成フォームの入力項目を列挙（読み取りのみ・送信しない）。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
let page = ctx.pages().find(p => p.url().includes("manager.line.biz"));
if (!page) { page = await ctx.newPage(); await page.goto("https://manager.line.biz/", { waitUntil: "domcontentloaded" }).catch(()=>{}); await page.waitForTimeout(3000); }

// 左ナビ「作成」をクリック。
let clicked = "no";
try { await page.getByText("作成", { exact: true }).first().click({ timeout: 6000 }); clicked = "ok"; }
catch (e) { clicked = "FAIL:" + String(e).split("\n")[0]; }
await page.waitForTimeout(3500);
await page.screenshot({ path: "/tmp/oam-create.png", fullPage: true });

const items = await page.evaluate(() => {
  const labelOf = (el) => {
    if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.innerText.trim().slice(0,50); }
    let p = el.closest("div,section,li,fieldset,label");
    for (let i=0;i<4&&p;i++){ const t=(p.querySelector("label,legend,h3,h4,p,span")?.innerText||"").trim(); if(t&&t.length<60) return t.slice(0,50); p=p.parentElement; }
    return "";
  };
  const out = [];
  for (const el of Array.from(document.querySelectorAll("input,textarea,select,button"))) {
    const r = el.getBoundingClientRect(); if (r.width===0&&r.height===0) continue;
    out.push({ tag: el.tagName.toLowerCase(), type: el.type||"", placeholder: el.placeholder||"", required: el.required||undefined, text: el.tagName==="BUTTON"?(el.innerText||"").trim().slice(0,24):undefined, options: el.tagName==="SELECT"?Array.from(el.options).map(o=>o.text).filter(Boolean).slice(0,20):undefined, label: labelOf(el) });
  }
  return out;
});
writeFileSync("/tmp/oam-create-form.json", JSON.stringify({ clicked, url: page.url(), items }, null, 1));
console.log("CLICKED=" + clicked);
console.log("URL=" + page.url());
console.log("FIELDS=" + items.length);
await b.close();
