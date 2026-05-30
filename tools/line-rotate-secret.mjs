// Channel secret を再発行(Issue)して .env.local に保存する。
// **secretの値は一切 console に出さない**（length と先頭2文字だけ）。
// gotoは404になるためクリックで Basic settings へ辿る。
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const ENV = "/mnt/c/tools/matching-app/.env.local";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
const log = (m) => console.log(m);

// Basic settings へクリックで辿る。
await page.goto("https://developers.line.biz/console/", { waitUntil: "domcontentloaded" }).catch(()=>{});
await page.waitForTimeout(2000);
try { await page.getByText("matching-app",{exact:true}).first().click({timeout:6000}); } catch {}
await page.waitForTimeout(2000);
try { await page.getByText("LINE Login",{exact:false}).first().click({timeout:6000}); } catch {}
await page.waitForTimeout(2000);
try { await page.getByText("Basic settings",{exact:true}).first().click({timeout:4000}); } catch {}
await page.waitForTimeout(1500);

// 旧secretを読む（比較用・値は出さない）。
const before = await page.evaluate(()=>document.body.innerText).catch(()=> "");
const oldSec = (before.match(/\b[0-9a-f]{32}\b/)||[])[0] || "";

// 「Issue」ボタン（Channel secret 行）をクリック。
let issued = "no";
try { await page.getByRole("button",{name:/^Issue$/}).first().click({timeout:5000}); issued="clicked"; }
catch(e){ issued="FAIL:"+String(e).split("\n")[0]; }
await page.waitForTimeout(1500);

// 確認ダイアログがあれば OK/Issue/はい を押す。
for (const name of ["Issue","OK","Yes","はい","Confirm"]) {
  try { await page.getByRole("button",{name:new RegExp("^"+name+"$")}).last().click({timeout:1500}); log("confirm="+name); break; } catch {}
}
await page.waitForTimeout(2500);

// 新secretを読む。
const after = await page.evaluate(()=>document.body.innerText).catch(()=> "");
const newSec = (after.match(/\b[0-9a-f]{32}\b/)||[])[0] || "";
const changed = newSec && newSec !== oldSec;

// env へ保存（値は出さない）。
let env = existsSync(ENV)? readFileSync(ENV,"utf8"):"";
if (newSec) {
  const re=/^LINE_LOGIN_CHANNEL_SECRET=.*$/m; const line=`LINE_LOGIN_CHANNEL_SECRET="${newSec}"`;
  env = re.test(env)? env.replace(re,line): env+(env.endsWith("\n")?"":"\n")+line+"\n";
  writeFileSync(ENV, env);
}
// スクショは secret が写るのでマスク領域を避け、撮らない（あえて非保存）。
log("ISSUE="+issued);
log("SECRET_CHANGED="+changed);
log("NEW_SECRET_LEN="+(newSec? newSec.length : 0));
log("ENV_SAVED="+(newSec? "yes":"no"));
await b.close();
