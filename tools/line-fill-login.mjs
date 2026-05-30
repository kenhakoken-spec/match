// LINE Login チャネル作成フォームに入力する（Create は押さない）。
import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

const log = (m) => console.log(m);

// 1. Region (1番目の select) = Japan
const selects = page.locator("select");
try { await selects.nth(0).selectOption({ label: "Japan" }); log("region=Japan"); } catch (e) { log("region ERR " + String(e).split("\n")[0]); }

// 2. Channel name
try { await page.getByPlaceholder("Enter a channel name").fill("rendez"); log("name=rendez"); } catch (e) { log("name ERR " + String(e).split("\n")[0]); }

// 3. Channel description
try { await page.getByPlaceholder("Enter a channel description").fill("東京エリアの合コン（グループ）マッチングアプリ"); log("desc ok"); } catch (e) { log("desc ERR " + String(e).split("\n")[0]); }

// 4. Country (2番目の select) = Japan
try { await selects.nth(1).selectOption({ label: "Japan" }); log("country=Japan"); } catch (e) { log("country ERR " + String(e).split("\n")[0]); }

// 5. App types: Web app チェックボックス（checkbox 群の nth(0)）
const cbs = page.locator('input[type="checkbox"]');
try { await cbs.nth(0).check(); log("webapp checked"); } catch (e) { log("webapp ERR " + String(e).split("\n")[0]); }

// 6. Email（空なら殿の連絡先を入れる）
try {
  const email = page.getByPlaceholder("Enter an email address");
  const cur = await email.inputValue().catch(() => "");
  if (!cur) { await email.fill("ken.hako.ken@gmail.com"); log("email filled"); }
  else log("email pre-filled: " + cur);
} catch (e) { log("email ERR " + String(e).split("\n")[0]); }

// 7. 規約同意（最後の checkbox = "I have read and agreed"）
try {
  const n = await cbs.count();
  await cbs.nth(n - 1).check();
  log("agreement checked (idx " + (n - 1) + ")");
} catch (e) { log("agree ERR " + String(e).split("\n")[0]); }

await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/line-filled.png", fullPage: true });
log("URL=" + page.url());
await b.close();
