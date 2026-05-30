// Lv4 E2E — core loop, mobile 375x812, real-data assertions + screenshots.
// Runs against PORT=3300. Real selectors only: testids slot-card / app-card /
// apply-confirm, plus visible-text + URL navigation. Cleanup in finally.
//
// IMPORTANT (cookie-split fix): visiting "/" runs the login page's devLogin()
// which POSTs /api/auth/dev-login with an EMPTY body, creating/switching the
// session to "Udev-default-user" and overwriting any prior cookie. So we do the
// onboarding-screen screenshots in a THROWAWAY context, and run the data-driven
// apply loop in a SEPARATE context where we dev-login an eligible user LAST and
// navigate DIRECTLY to /browse,/slots,/applications (never through "/").
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3300";
const SHOTS = "/mnt/c/tools/matching-app/screenshots/s2/e2e";
fs.mkdirSync(SHOTS, { recursive: true });
const VP = { width: 375, height: 812 };
const results = [];
const LU = `Uqae2e-${Date.now()}`;
function step(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"} :: ${name} :: ${detail || ""}`);
}
const png = (n) => `${SHOTS}/${n}.png`;
const tmpImg = "/tmp/e2e-id.png";
fs.writeFileSync(
  tmpImg,
  Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082",
    "hex",
  ),
);

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  // ============ PART A: onboarding-screen visual walk (throwaway context) ============
  const octx = await browser.newContext({ viewport: VP });
  const op = await octx.newPage();
  await op.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await op.screenshot({ path: png("E-00_login") });
  await op.getByText("LINEではじめる").click();
  await op.waitForURL("**/onboarding", { timeout: 15000 });
  step("U-00 login -> /onboarding", true, "navigated");

  await op.screenshot({ path: png("E-01_onboarding_s1") });
  await op.getByRole("button", { name: "次へ" }).click();
  await op.getByRole("button", { name: "次へ" }).click();
  await op.getByRole("checkbox").click({ timeout: 5000 }).catch(async () => {
    await op.getByText("に同意します").click({ timeout: 5000 }).catch(() => {});
  });
  await op.screenshot({ path: png("E-01_onboarding_consent") });
  await op.getByRole("button", { name: "本人確認へ" }).click();
  await op.waitForURL("**/identity", { timeout: 15000 });
  step("U-01 onboarding consent -> /identity", true, "navigated");

  await op.screenshot({ path: png("E-12_identity_form") });
  await op.getByText("パスポート").click({ timeout: 8000 }).catch(() => {});
  await op.locator('input[type="file"]').first().setInputFiles(tmpImg, { timeout: 10000 });
  await op.getByRole("button", { name: "提出する" }).click();
  await op.waitForURL("**/identity/status", { timeout: 15000 });
  await op.screenshot({ path: png("E-12_identity_status") });
  step("U-12 identity submit -> /identity/status", true, "navigated");
  await octx.close();

  // ============ PART B: data-driven apply loop (clean context, eligible user) ============
  const ctx = await browser.newContext({ viewport: VP });
  const page = await ctx.newPage();

  // dev-login THIS user (sets cookie on ctx), submit identity + profile via request.
  const login = await page.request.post(`${BASE}/api/auth/dev-login`, { data: { lineUserId: LU, role: "user" } });
  const myUserId = (await login.json()).user.id;
  const up = await page.request.post(`${BASE}/api/identity/upload`, {
    multipart: { file: { name: "id.png", mimeType: "image/png", buffer: fs.readFileSync(tmpImg) } },
  });
  const blobRef = (await up.json()).blobRef;
  await page.request.post(`${BASE}/api/identity`, { data: { docType: "passport", blobRef } });
  const putResp = await page.request.put(`${BASE}/api/profile`, {
    data: { displayName: "E2Eユーザー", gender: "male", birthdate: "1995-01-01", areaPref: ["ebisu"], bio: "e2e" },
  });
  step("profile set (PUT /api/profile)", putResp.ok(), `PUT status=${putResp.status()}`);

  // ADMIN approves MY identity by exact userId (separate context).
  const actx = await browser.newContext({ viewport: VP });
  const ap = await actx.newPage();
  await ap.request.post(`${BASE}/api/auth/dev-login`, { data: { lineUserId: "Uadmin0000000000000000000000seed" } });
  const q = await (await ap.request.get(`${BASE}/api/admin/identity?status=pending`)).json();
  const mine = (q.items || []).find((it) => it.userId === myUserId);
  let approveOk = false, blobNull = false;
  if (mine) {
    approveOk = (await ap.request.post(`${BASE}/api/admin/identity/${mine.id}/approve`)).ok();
    const q2 = await (await ap.request.get(`${BASE}/api/admin/identity?status=approved`)).json();
    blobNull = (q2.items || []).some((it) => it.id === mine.id && it.blobRef === null);
  }
  await actx.close();
  step("ADMIN approve MY identity (by userId)", approveOk, mine ? `id=${mine.id}` : "my pending item not found");
  step("PII: approved identity blobRef=null", blobNull, "image deleted on approve");

  // gate must now be open for THIS ctx cookie (no "/" visit to pollute it).
  const me = await (await page.request.get(`${BASE}/api/me`)).json();
  step("U-02 gate canApply:true after approve+profile", me.canApply === true, `canApply=${me.canApply} reason=${me.canApplyReason}`);

  // U-04 browse: real slot cards (navigate DIRECTLY, not via "/").
  await page.goto(`${BASE}/browse`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="slot-card"]', { timeout: 15000 });
  const cards = await page.locator('[data-testid="slot-card"]').count();
  await page.screenshot({ path: png("E-04_browse") });
  step("U-04 browse shows slot cards (real data)", cards > 0, `cards=${cards}`);
  const hasEbisu = await page.getByText("恵比寿エリア").first().isVisible().catch(() => false);
  step("U-04 real seed slot text visible", hasEbisu, "恵比寿エリア present");

  // U-05 detail (normal slot) -> apply -> confirm -> 応募しました
  await page.goto(`${BASE}/slots/seed-slot-normal`, { waitUntil: "networkidle" });
  await page.getByText("募集状況").first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: png("E-05_slot_detail") });
  const applyBtn = page.getByRole("button", { name: "この枠に応募する" });
  const applyVisible = await applyBtn.isVisible().catch(() => false);
  step("U-05 detail apply button active (eligible)", applyVisible, applyVisible ? "応募する shown" : "not active");

  let applied = false;
  if (applyVisible) {
    await applyBtn.click();
    await page.waitForSelector('[data-testid="apply-confirm"]', { timeout: 8000 });
    await page.screenshot({ path: png("E-06_apply_confirm") });
    await page.locator('[data-testid="apply-confirm"]').click();
    applied = await page.getByText("応募しました").first().isVisible({ timeout: 8000 }).catch(() => false);
  }
  step("U-06 apply confirmed (応募しました shown)", applied, applied ? "confirmation visible" : "no confirmation");

  // U-07 applications: reflects new application
  await page.goto(`${BASE}/applications`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="app-card"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  const appsCount = await page.locator('[data-testid="app-card"]').count();
  await page.screenshot({ path: png("E-07_applications") });
  step("U-07 applications shows my application (real data)", appsCount > 0, `app cards=${appsCount}`);

  await ctx.close();
} catch (e) {
  step("E2E fatal error", false, String(e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e));
} finally {
  if (browser) await browser.close();
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log("======================================");
  console.log(`E2E SUMMARY: PASS=${pass} FAIL=${fail} TOTAL=${results.length}`);
  console.log("SHOTS_DIR=" + SHOTS);
}
