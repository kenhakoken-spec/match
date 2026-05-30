// LIFF追加フォーム(channel 2010236765 /liff/new)を入力して Add まで実行。
// 殿の許可: 入力も確定も私。Endpoint URLはVercel前なので仮値→後で更新。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
const log = (m) => console.log(m);

// フォームに居なければクリックで戻る。
const inForm = /liff\/new/.test(page.url());
if (!inForm) {
  await page.goto("https://developers.line.biz/console/", { waitUntil: "domcontentloaded" }).catch(()=>{});
  await page.waitForTimeout(2000);
  try { await page.getByText("matching-app",{exact:true}).first().click({timeout:6000}); } catch {}
  await page.waitForTimeout(2000);
  try { await page.getByText("LINE Login",{exact:false}).first().click({timeout:6000}); } catch {}
  await page.waitForTimeout(2000);
  try { await page.getByText("LIFF",{exact:true}).first().click({timeout:5000}); } catch {}
  await page.waitForTimeout(1500);
  try { await page.getByRole("button",{name:/^Add$/}).first().click({timeout:5000}); } catch {}
  await page.waitForTimeout(2000);
}

// 1) LIFF app name
try { await page.getByPlaceholder("Enter the LIFF app's name").fill("rendez"); log("name=rendez"); } catch(e){ log("name ERR "+String(e).split("\n")[0]); }
// 2) Size = Full（ラベルで特定）
try { await page.getByText("Full",{exact:true}).first().click({timeout:4000}); log("size=Full"); } catch(e){ log("size ERR "+String(e).split("\n")[0]); }
// 3) Endpoint URL（仮・Vercel後更新）
try { await page.getByPlaceholder("https://example.com").fill("https://rendez.vercel.app"); log("endpoint set"); } catch(e){ log("endpoint ERR "+String(e).split("\n")[0]); }
// 4) Scopes = openid, profile
try { await page.getByText("openid",{exact:true}).first().click({timeout:4000}); log("openid"); } catch(e){ log("openid ERR "+String(e).split("\n")[0]); }
try { await page.getByText("profile",{exact:true}).first().click({timeout:4000}); log("profile"); } catch(e){ log("profile ERR "+String(e).split("\n")[0]); }
// 5) Add friend option = On (Normal)
try { await page.getByText("On (Normal)",{exact:true}).first().click({timeout:4000}); log("friend=On(Normal)"); } catch(e){ log("friend ERR "+String(e).split("\n")[0]); }

await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/liff-before-add.png", fullPage: true });

// Add 実行
let added = "no";
try { await page.getByRole("button",{name:/^Add$/}).first().click({timeout:6000}); added="clicked"; } catch(e){ added="FAIL:"+String(e).split("\n")[0]; }
await page.waitForTimeout(4000);
await page.screenshot({ path: "/tmp/liff-after-add.png", fullPage: true });
log("ADD="+added);
log("URL="+page.url());

// LIFF ID を拾う（10桁-8hex）
const t = await page.evaluate(()=>document.body.innerText).catch(()=> "");
const liff = (t.match(/\b\d{10}-[0-9a-f]{8}\b/)||[])[0] || "";
log("LIFF_ID="+(liff||"NONE_YET"));
// env反映（LIFF IDは公開OK）
if (liff) {
  const fs = await import("node:fs");
  const ENV="/mnt/c/tools/matching-app/.env.local";
  let env = fs.existsSync(ENV)? fs.readFileSync(ENV,"utf8"):"";
  const re=/^NEXT_PUBLIC_LIFF_ID=.*$/m; const line=`NEXT_PUBLIC_LIFF_ID="${liff}"`;
  env = re.test(env)? env.replace(re,line): env+(env.endsWith("\n")?"":"\n")+line+"\n";
  fs.writeFileSync(ENV,env);
  log("ENV_LIFF_UPDATED");
}
await b.close();
