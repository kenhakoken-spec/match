// (A) 殿が再発行した新Channel secretを Basic settings から読み直して .env.local に保存（値は出さない）。
// (B) OAM「作成」フォームの項目を列挙して /tmp に保存（送信しない・読み取りのみ）。
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const ENV = "/mnt/c/tools/matching-app/.env.local";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const log = (m) => console.log(m);

// ---------- (A) secret 読み直し（Developers タブ） ----------
let dev = ctx.pages().find(p => p.url().includes("developers.line.biz"));
if (!dev) dev = await ctx.newPage();
try {
  await dev.goto("https://developers.line.biz/console/", { waitUntil: "domcontentloaded" }).catch(()=>{});
  await dev.waitForTimeout(2000);
  await dev.getByText("matching-app", { exact: true }).first().click({ timeout: 6000 }).catch(()=>{});
  await dev.waitForTimeout(2000);
  await dev.getByText("LINE Login", { exact: false }).first().click({ timeout: 6000 }).catch(()=>{});
  await dev.waitForTimeout(2000);
  await dev.getByText("Basic settings", { exact: true }).first().click({ timeout: 4000 }).catch(()=>{});
  await dev.waitForTimeout(1500);
  const t = await dev.evaluate(() => document.body.innerText).catch(()=> "");
  const sec = (t.match(/\b[0-9a-f]{32}\b/) || [])[0] || "";
  const id  = (t.match(/\b\d{10}\b/) || [])[0] || "";
  if (sec) {
    let env = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
    const re = /^LINE_LOGIN_CHANNEL_SECRET=.*$/m; const line = `LINE_LOGIN_CHANNEL_SECRET="${sec}"`;
    env = re.test(env) ? env.replace(re, line) : env + (env.endsWith("\n")?"":"\n") + line + "\n";
    writeFileSync(ENV, env);
    log("SECRET_RESAVED=yes len=" + sec.length + " head2=" + sec.slice(0,2) + "**");
  } else log("SECRET_RESAVED=NO (not found on page)");
  log("CHANNEL_ID_SEEN=" + (id || "?"));
} catch (e) { log("SECRET_STEP_ERR " + String(e).split("\n")[0]); }

// ---------- (B) OAM 作成フォーム列挙（Manager タブ） ----------
try {
  let oam = ctx.pages().find(p => p.url().includes("manager.line.biz"));
  if (!oam) { oam = await ctx.newPage(); await oam.goto("https://manager.line.biz/", { waitUntil: "domcontentloaded" }).catch(()=>{}); await oam.waitForTimeout(2500); }
  await oam.getByText("作成", { exact: true }).first().click({ timeout: 6000 }).catch(()=>{});
  await oam.waitForTimeout(3500);
  await oam.screenshot({ path: "/tmp/oam-create2.png", fullPage: true });
  const items = await oam.evaluate(() => {
    const labelOf = (el) => {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.innerText.trim().slice(0,50); }
      let p = el.closest("div,section,li,fieldset,label");
      for (let i=0;i<4&&p;i++){ const tx=(p.querySelector("label,legend,h3,h4,p,span")?.innerText||"").trim(); if(tx&&tx.length<60) return tx.slice(0,50); p=p.parentElement; }
      return "";
    };
    return Array.from(document.querySelectorAll("input,textarea,select,button")).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}).map(el=>({ tag: el.tagName.toLowerCase(), type: el.type||"", placeholder: el.placeholder||"", required: el.required||undefined, text: el.tagName==="BUTTON"?(el.innerText||"").trim().slice(0,24):undefined, options: el.tagName==="SELECT"?Array.from(el.options).map(o=>o.text).filter(Boolean).slice(0,20):undefined, label: labelOf(el) }));
  });
  writeFileSync("/tmp/oam-create-form.json", JSON.stringify({ url: oam.url(), items }, null, 1));
  log("OAM_URL=" + oam.url());
  log("OAM_FIELDS=" + items.length);
} catch (e) { log("OAM_STEP_ERR " + String(e).split("\n")[0]); }

await b.close();
