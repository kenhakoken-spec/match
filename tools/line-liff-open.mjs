// LIFF タブで Add を押してフォームを開き、入力要素を列挙して /tmp に保存。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

await page.goto("https://developers.line.biz/console/channel/2008094350/liff", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);

let clicked = "none";
try { await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 5000 }); clicked = "Add(role)"; }
catch { try { await page.getByText("Add", { exact: true }).first().click({ timeout: 5000 }); clicked = "Add(text)"; } catch (e) { clicked = "FAIL:" + String(e).split("\n")[0]; } }
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/liff-form.png", fullPage: true });

const data = await page.evaluate(() => {
  const out = [];
  for (const el of Array.from(document.querySelectorAll("input,textarea,select,button"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    let label = "";
    if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) label = l.innerText.trim(); }
    if (!label) { let p = el.closest("div,section,li,fieldset"); for (let i=0;i<3&&p;i++){ const t=(p.querySelector("label,legend,h3,h4,p,span")?.innerText||"").trim(); if(t&&t.length<70){label=t;break;} p=p.parentElement; } }
    out.push({ tag: el.tagName.toLowerCase(), type: el.type||"", name: el.name||"", placeholder: el.placeholder||"", value: (el.type==="text"||el.type==="url"||el.tagName==="SELECT")?(el.value||"").slice(0,30):undefined, checked: el.type==="checkbox"||el.type==="radio"?el.checked:undefined, text: el.tagName==="BUTTON"?(el.innerText||"").trim().slice(0,24):undefined, label: label.slice(0,50), options: el.tagName==="SELECT"?Array.from(el.options).map(o=>o.text).slice(0,8):undefined });
  }
  return { clickedField: out.length, items: out };
});
const fs = await import("node:fs");
fs.writeFileSync("/tmp/liff-form.json", JSON.stringify({ clicked, url: page.url(), data }, null, 1));
console.log("CLICKED=" + clicked);
console.log("URL=" + page.url());
console.log("FIELDS=" + data.items.length);
await b.close();
