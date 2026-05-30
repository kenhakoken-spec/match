// Playwright screenshot capture for S3 UI (mobile 375x812).
// CommonJS so `require("playwright")` resolves from the project node_modules.
// The browser is always closed in finally; the wrapper script owns the dev server.
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:3408";
const OUT = process.env.OUT || "/tmp/s3-shots";
const VP = { width: 375, height: 812 };

const shots = [
  { name: "u08-notified", url: `${BASE}/matches/m_notified`, waitFor: '[data-testid="venue-info"]' },
  { name: "u08-pending", url: `${BASE}/matches/pending_venue`, waitFor: '[data-testid="match-detail"]' },
  { name: "admin-list", url: `${BASE}/admin/matches`, waitFor: "text=成立確認" },
  { name: "admin-detail", url: `${BASE}/admin/matches/m_pending`, waitFor: '[data-testid="venue-form"]' },
  { name: "my-applications", url: `${BASE}/applications`, waitFor: '[data-testid="application-row"]' },
];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    for (const s of shots) {
      await page.goto(s.url, { waitUntil: "networkidle", timeout: 45000 });
      try {
        await page.waitForSelector(s.waitFor, { timeout: 15000 });
      } catch {
        // capture anyway
      }
      await page.waitForTimeout(500);
      const path = `${OUT}/${s.name}.png`;
      await page.screenshot({ path, fullPage: true });
      results.push({ name: s.name, path });
    }

    // Drive admin venue-save + notify to capture the result state (A-05 final).
    const page2 = await ctx.newPage();
    await page2.goto(`${BASE}/admin/matches/m_pending`, { waitUntil: "networkidle", timeout: 45000 });
    await page2.waitForSelector('[data-testid="venue-form"]', { timeout: 15000 });
    await page2.fill("#venueName", "個室イタリアン トラットリア恵比寿");
    await page2.fill("#venueUrl", "https://example.com/r/ebisu");
    await page2.fill("#reservationName", "田中");
    await page2.fill("#meetingPlace", "恵比寿駅 西口 18:55 集合");
    await page2.click('[data-testid="venue-save"]');
    await page2.waitForTimeout(700);
    await page2.click('[data-testid="notify-send"]');
    await page2.waitForTimeout(900);
    await page2.screenshot({ path: `${OUT}/admin-detail-notified.png`, fullPage: true });
    results.push({ name: "admin-detail-notified", path: `${OUT}/admin-detail-notified.png` });

    console.log("SHOTS_OK " + JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("SHOTS_FAIL", e && e.message ? e.message : e);
  process.exit(1);
});
