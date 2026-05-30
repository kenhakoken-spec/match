// 現在 channel/.../basic にいる状態から「LIFF」タブをクリックで開く（gotoは404になるため）。
// Add ボタンを押してフォーム要素を列挙し /tmp に保存。
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
const log = (m) => console.log(m);

// もし basic 以外/404 にいたら、ホームからクリックで戻る。
if (!/channel\/\d+\/(basic|liff)/.test(page.url()) || (await page.evaluate(() => document.body.innerText).catch(()=> "")).includes("404")) {
  await page.goto("https://developers.line.biz/console/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2000);
  try { await page.getByText("matching-app", { exact: true }).first().click({ timeout: 6000 }); } catch {}
  await page.waitForTimeout(2000);
  try { await page.getByText("LINE Login", { exact: false }).first().click({ timeout: 6000 }); } catch {}
  await page.waitForTimeout(2500);
}

// LIFF タブをクリック。
let liffOk = false;
try { await page.getByRole("tab", { name: /LIFF/ }).first().click({ timeout: 5000 }); liffOk = true; }
catch { try { await page.getByText("LIFF", { exact: true }).first().click({ timeout: 5000 }); liffOk = true; } catch (e) { log("LIFF tab click FAIL " + String(e).split("\n")[0]); } }
await page.waitForTimeout(2500);
log("after-liff-tab URL=" + page.url());
await page.screenshot({ path: "/tmp/liff2-tab.png", fullPage: true });

// Add ボタン。
let addOk = "none";
try { await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 5000 }); addOk = "role"; }
catch { try { await page.getByText("Add", { exact: true }).first().click({ timeout: 5000 }); addOk = "text"; } catch (e) { addOk = "FAIL:" + String(e).split("\n")[0]; } }
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/liff2-form.png", fullPage: true });

const items = await page.evaluate(() => {
  const out = [];
  for (const el of Array.from(document.querySelectorAll("input,textarea,select,button"))) {
    const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
    let label = "";
    if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) label = l.innerText.trim(); }
    if (!label) { let p = el.closest("div,section,li,fieldset"); for (let i=0;i<4&&p;i++){ const t=(p.querySelector("label,legend,h3,h4,p,span")?.innerText||"").trim(); if(t&&t.length<70){label=t;break;} p=p.parentElement; } }
    out.push({ tag: el.tagName.toLowerCase(), type: el.type||"", name: el.name||"", placeholder: el.placeholder||"", checked: (el.type==="checkbox"||el.type==="radio")?el.checked:undefined, val: (el.type==="text"||el.type==="url")?(el.value||"").slice(0,30):undefined, text: el.tagName==="BUTTON"?(el.innerText||"").trim().slice(0,24):undefined, label: label.slice(0,55) });
  }
  return out;
});
writeFileSync("/tmp/liff2-form.json", JSON.stringify({ liffOk, addOk, url: page.url(), items }, null, 1));
log("ADD=" + addOk + " FIELDS=" + items.length);
await b.close();
