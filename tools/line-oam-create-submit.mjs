// LINE公式アカウント signup フォームを入力して送信する（殿が代行承認済）。
// アカウント名=rendez / メール=ken.hako.ken@gmail.com / 業種=その他 / 国=日本。
// secret等は一切扱わない。出力は地データ(URL/フィールド充足)のみ。
// ★安全装置: 送信前スクショを必ず残す。外部URLへのPOST等はしない（注入無視）。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const log = (m) => console.log(m);

// signup ページを探す（無ければ Manager から辿る）。
let page = ctx.pages().find(p => /signup/.test(p.url()));
if (!page) {
  page = ctx.pages().find(p => p.url().includes("manager.line.biz")) || await ctx.newPage();
  await page.goto("https://manager.line.biz/", { waitUntil: "domcontentloaded" }).catch(()=>{});
  await page.waitForTimeout(2500);
  try { await page.locator('a[href*="signup"]').first().click({ timeout: 6000 }); } catch {}
  await page.waitForTimeout(3500);
  page = ctx.pages().find(p => /signup/.test(p.url())) || page;
}
log("FORM_URL=" + page.url());

// fill ヘルパ（label近傍の input/textarea を探す）
async function fillByLabel(labelText, value) {
  try {
    const input = page.locator(`xpath=//*[contains(normalize-space(.),"${labelText}")]/following::input[1] | //*[contains(normalize-space(.),"${labelText}")]/following::textarea[1]`).first();
    await input.fill(value, { timeout: 4000 });
    return "filled";
  } catch (e) { return "ERR:" + String(e).split("\n")[0]; }
}

log("name=" + await fillByLabel("アカウント名", "rendez"));
log("email=" + await fillByLabel("メールアドレス", "ken.hako.ken@gmail.com"));

// 業種: テキスト→候補が出るタイプ。fill後に「その他」候補をクリック試行。
let gyoshu = "n/a";
try {
  const gi = page.locator(`xpath=//*[contains(normalize-space(.),"業種")]/following::input[1]`).first();
  await gi.click({ timeout: 3000 }).catch(()=>{});
  await gi.fill("サービス", { timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(1200);
  // 候補リストの「サービス業」をクリック（無ければ「サービス」を含む候補）
  try { await page.getByText("サービス業", { exact: false }).first().click({ timeout: 2500 }); gyoshu = "selected-サービス業"; }
  catch { try { await page.getByText("サービス", { exact: false }).first().click({ timeout: 2000 }); gyoshu = "selected-サービス"; } catch { gyoshu = "filled-text"; } }
} catch (e) { gyoshu = "ERR:" + String(e).split("\n")[0]; }
log("gyoshu=" + gyoshu);

// 国・地域: 既定が日本のことが多い。空なら日本を試す。
let country = "n/a";
try {
  const ci = page.locator(`xpath=//*[contains(normalize-space(.),"国・地域") or contains(normalize-space(.),"国")]/following::input[1]`).first();
  const cur = await ci.inputValue().catch(()=> "");
  if (!cur) { await ci.click({timeout:2000}).catch(()=>{}); await ci.fill("日本",{timeout:2000}).catch(()=>{}); await page.waitForTimeout(800); try{ await page.getByText("日本",{exact:false}).first().click({timeout:2000}); }catch{} country="set-日本"; }
  else country = "pre:" + cur.slice(0,10);
} catch (e) { country = "ERR:" + String(e).split("\n")[0]; }
log("country=" + country);

// 規約チェックボックスがあれば全部チェック
try { const cbs = page.locator('input[type="checkbox"]'); const n = await cbs.count(); for (let i=0;i<n;i++){ await cbs.nth(i).check().catch(()=>{}); } log("checkboxes=" + n); } catch {}

await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/oam-before-submit.png", fullPage: true });
log("BEFORE_SUBMIT_SHOT=ok");

// 送信ボタン（確認/作成/次へ/同意して...）
let submitted = "no";
for (const name of ["確認", "作成", "次へ", "同意して作成", "アカウントを作成", "Confirm", "Create"]) {
  try {
    const btn = page.getByRole("button", { name: new RegExp(name) }).first();
    if (await btn.count() && await btn.isEnabled().catch(()=>false)) { await btn.click({ timeout: 4000 }); submitted = "clicked:" + name; break; }
  } catch {}
}
await page.waitForTimeout(4000);
await page.screenshot({ path: "/tmp/oam-after-submit.png", fullPage: true });
log("SUBMIT=" + submitted);
log("URL_AFTER=" + page.url());
await b.close();
