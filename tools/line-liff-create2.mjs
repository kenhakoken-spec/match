// LIFFフォームの radio を実input直checkで埋める。name/endpoint/scopesは入力済の想定だが再設定も冪等。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
const log = (m) => console.log(m);

if (!/liff\/new/.test(page.url())) { log("NOT_ON_FORM url=" + page.url()); await b.close(); process.exit(0); }

// текстは再入力（冪等）
try { await page.getByPlaceholder("Enter the LIFF app's name").fill("rendez"); } catch {}
try { await page.getByPlaceholder("https://example.com").fill("https://rendez.vercel.app"); } catch {}

// radio/checkbox を JS で直接操作（ラベル文字で対応づけ、click()イベントも発火）。
const res = await page.evaluate(() => {
  const out = {};
  const labelOf = (el) => {
    let p = el.closest("div,section,li,fieldset,label");
    for (let i = 0; i < 4 && p; i++) { const t = (p.innerText || "").trim(); if (t) return t.slice(0, 30); p = p.parentElement; }
    return "";
  };
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  const checks = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  const clickByLabel = (els, want) => {
    for (const el of els) {
      const lab = labelOf(el);
      if (lab.includes(want)) { el.click(); return lab; }
    }
    return null;
  };
  out.size = clickByLabel(radios, "Full");
  out.friend = clickByLabel(radios, "On (Normal)") || clickByLabel(radios, "Normal");
  // scopes（未チェックなら入れる）
  out.openid = (() => { const e = checks.find(c => labelOf(c).includes("openid")); if (e && !e.checked) e.click(); return e ? e.checked : null; })();
  out.profile = (() => { const e = checks.find(c => labelOf(c).includes("profile")); if (e && !e.checked) e.click(); return e ? e.checked : null; })();
  return out;
});
log("radio/scope result=" + JSON.stringify(res));
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/liff-filled2.png", fullPage: true });

// Add ボタンが活性化したか確認して押す。
let added = "no";
try {
  const addBtn = page.getByRole("button", { name: /^Add$/ }).first();
  const disabled = await addBtn.isDisabled().catch(() => false);
  log("add disabled=" + disabled);
  await addBtn.click({ timeout: 6000 });
  added = "clicked";
} catch (e) { added = "FAIL:" + String(e).split("\n")[0]; }
await page.waitForTimeout(4500);
await page.screenshot({ path: "/tmp/liff-added.png", fullPage: true });
log("ADD=" + added);
log("URL=" + page.url());

const t = await page.evaluate(() => document.body.innerText).catch(() => "");
const liff = (t.match(/\b\d{10}-[0-9a-f]{8}\b/) || [])[0] || "";
log("LIFF_ID=" + (liff || "NONE_YET"));
if (liff) {
  const fs = await import("node:fs");
  const ENV = "/mnt/c/tools/matching-app/.env.local";
  let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
  const re = /^NEXT_PUBLIC_LIFF_ID=.*$/m; const line = `NEXT_PUBLIC_LIFF_ID="${liff}"`;
  env = re.test(env) ? env.replace(re, line) : env + (env.endsWith("\n") ? "" : "\n") + line + "\n";
  fs.writeFileSync(ENV, env);
  log("ENV_LIFF_UPDATED");
}
await b.close();
