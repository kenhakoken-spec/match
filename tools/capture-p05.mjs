// P-05 公開枠詳細だけを確実に撮り直す。cookie無し context で /explore を開き、
// 一覧の最初の枠リンクをUIクリックして詳細へ遷移（API/pubId 依存を避ける）。
// 参加予定メンバーの匿名サマリ（h2「参加予定のメンバー」）まで待ってから fullPage。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = process.env.PORT || "3700";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/mnt/c/tools/matching-app/docs/screens";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log("P05 " + m);
const T = 25000;

const browser = await chromium.launch({ headless: true });
try {
  const pub = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    baseURL: BASE,
  });
  pub.setDefaultTimeout(T);

  // まず API で id を取得（取れれば直接遷移が最も確実）。
  let pubId = "";
  try {
    const ps = await pub.request.get("/api/public/slots", { timeout: T });
    log("api status=" + ps.status());
    if (ps.ok()) {
      const j = await ps.json();
      const arr = Array.isArray(j) ? j : j.slots;
      log("api slots=" + (arr ? arr.length : "?"));
      if (arr && arr[0]) pubId = arr[0].id;
    }
  } catch (e) {
    log("api ERR " + String(e).split("\n")[0]);
  }
  log("pubId=" + (pubId || "EMPTY"));

  const page = await pub.newPage();
  let reached = false;
  if (pubId) {
    await page.goto(`/explore/${pubId}`, { waitUntil: "networkidle", timeout: T }).catch(() => {});
    reached = await page.locator("h1").first().isVisible().catch(() => false);
    log("direct goto reached=" + reached + " url=" + page.url());
  }
  if (!reached) {
    // UIクリックで遷移（API非依存のフォールバック）。
    await page.goto("/explore", { waitUntil: "networkidle", timeout: T }).catch(() => {});
    await page.locator("[data-testid=public-slot-list]").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    const link = page.locator("[data-testid=public-slot-list] a").first();
    const n = await link.count();
    log("list links=" + n);
    if (n) {
      await Promise.all([
        page.waitForURL(/\/explore\/.+/, { timeout: T }).catch(() => {}),
        link.click().catch(() => {}),
      ]);
      reached = await page.locator("h1").first().isVisible().catch(() => false);
      log("click reached=" + reached + " url=" + page.url());
    }
  }

  // メンバーの匿名サマリ見出しまで待つ（描画完了確認）。
  await page.getByText("参加予定のメンバー").first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/P-05_explore_detail.png`, fullPage: true });
  log("shot P-05_explore_detail url=" + page.url());

  await page.close();
  await pub.close();
} finally {
  await browser.close();
}
log("DONE");
