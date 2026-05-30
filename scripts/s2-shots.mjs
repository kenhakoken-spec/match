// scripts/s2-shots.mjs — S2 screenshot capture (mobile portrait 375x812).
// Captures: U-04 枠一覧 / U-05 詳細[応募可] / U-05 詳細[条件不足] / U-06 応募確認(男性・初回無料) /
// U-07 マイ応募状況 / A-02 admin 枠作成. Uses the dev server's FALLBACK data so every
// state renders without a live session. BROWSER-CLEANUP-001: close() in finally + report.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3210";
const OUT = "/mnt/c/tools/matching-app/screenshots/s2";
mkdirSync(OUT, { recursive: true });

const VP = { width: 375, height: 812 };

async function settle(page, ms = 900) {
  await page.waitForTimeout(ms);
}

async function run() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const results = [];
  try {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    // U-04 枠一覧
    await page.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: `${OUT}/u04-browse.png`, fullPage: true });
    results.push("u04-browse.png");

    // U-05 詳細[応募可] — 通常枠
    await page.goto(`${BASE}/slots/slot_ebisu_01`, { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: `${OUT}/u05-detail-eligible.png`, fullPage: true });
    results.push("u05-detail-eligible.png");

    // U-06 応募確認(男性・初回無料) — open the sheet from the eligible detail
    const applyBtn = page.getByRole("button", { name: "この枠に応募する" });
    if (await applyBtn.count()) {
      await applyBtn.first().click();
      await settle(page, 700);
      await page.screenshot({ path: `${OUT}/u06-apply-confirm.png`, fullPage: true });
      results.push("u06-apply-confirm.png");
    }

    // U-05 詳細[条件不足の応募不可UI] — 20代限定(年齢外) FALLBACK
    await page.goto(`${BASE}/slots/slot_ikebukuro_20s`, { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: `${OUT}/u05-detail-ineligible.png`, fullPage: true });
    results.push("u05-detail-ineligible.png");

    // U-07 マイ応募状況
    await page.goto(`${BASE}/applications`, { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: `${OUT}/u07-applications.png`, fullPage: true });
    results.push("u07-applications.png");

    // A-02 admin 枠作成
    await page.goto(`${BASE}/admin/slots`, { waitUntil: "networkidle" });
    await settle(page);
    await page.screenshot({ path: `${OUT}/a02-admin-slots.png`, fullPage: true });
    results.push("a02-admin-slots.png");

    await ctx.close();
  } finally {
    await browser.close();
  }
  return results;
}

run()
  .then((r) => {
    console.log("SHOTS_OK " + r.join(","));
    process.exit(0);
  })
  .catch((e) => {
    console.error("SHOTS_FAIL " + (e && e.message ? e.message : e));
    process.exit(1);
  });
