// 全画面を「本物の状態」で撮る。next start(本番ビルド)に対し、各ルートで
// networkidle + 既知要素待ち + settle してから fullPage 撮影 → docs/screens/。
// 認証ページ用に dev-login + admin承認 + profile を API で先に整える。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = process.env.PORT || "3600";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/mnt/c/tools/matching-app/docs/screens";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log("CAP " + m);
const T = 25000;

const browser = await chromium.launch({ headless: true });
try {
  // ---- 状態づくり: 男性ユーザーを承認済み＋プロフィール有りに ----
  const userCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, baseURL: BASE });
  userCtx.setDefaultTimeout(T);
  const ureq = userCtx.request;
  await ureq.post("/api/auth/dev-login", { data: { lineUserId: "cap-user-male" }, timeout: T }).catch(()=>{});
  await ureq.put("/api/profile", { data: { displayName: "ケン", gender: "male", birthdate: "1994-04-01", areaPref: ["ebisu"], bio: "よろしくお願いします" }, timeout: T }).catch(()=>{});
  let blobRef = "mock-blob://cap";
  const up = await ureq.post("/api/identity/upload", { multipart: { file: { name: "id.png", mimeType: "image/png", buffer: Buffer.from("x") } }, timeout: T }).catch(()=>null);
  if (up && up.ok()) { try { blobRef = (await up.json()).blobRef || blobRef; } catch {} }
  await ureq.post("/api/identity", { data: { docType: "drivers_license", blobRef }, timeout: T }).catch(()=>{});
  // admin承認
  const adminCtx = await browser.newContext({ baseURL: BASE });
  const areq = adminCtx.request;
  await areq.post("/api/auth/dev-login", { data: { lineUserId: "cap-admin", role: "admin" }, timeout: T }).catch(()=>{});
  const q = await areq.get("/api/admin/identity?status=pending", { timeout: T }).catch(()=>null);
  if (q && q.ok()) { const items=(await q.json()).items||[]; const mine=items.find(i=>i.userId)||items[0]; if (mine) await areq.post(`/api/admin/identity/${mine.id}/approve`, { timeout: T }).catch(()=>{}); }
  // seed枠IDを取得（詳細/決済の[id]用）
  let slotId = "seed-slot-normal";
  const slots = await ureq.get("/api/slots", { timeout: T }).catch(()=>null);
  if (slots && slots.ok()) { try { const j = await slots.json(); if (j.slots && j.slots[0]) slotId = j.slots[0].id; } catch {} }
  // 成立(Match)IDをadminで取得（U-08用）
  let matchId = "";
  const ms = await areq.get("/api/admin/matches", { timeout: T }).catch(()=>null);
  if (ms && ms.ok()) { try { const j = await ms.json(); if (j.items && j.items[0]) matchId = j.items[0].id; } catch {} }
  log("setup slotId=" + slotId + " matchId=" + (matchId||"none"));

  const shoot = async (ctx, name, path, waitSel) => {
    const page = await ctx.newPage();
    try {
      await page.goto(path, { waitUntil: "networkidle", timeout: T }).catch(()=>{});
      if (waitSel) { await page.locator(waitSel).first().waitFor({ state: "visible", timeout: 8000 }).catch(()=>{}); }
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      log("shot " + name + " <- " + path);
    } catch (e) { log("ERR " + name + " " + String(e).split("\n")[0]); }
    finally { await page.close(); }
  };

  // ---- ユーザー画面（承認済みユーザーのcookie付きctx） ----
  await shoot(userCtx, "U-00_login", "/", "[data-testid=login-button]");
  await shoot(userCtx, "U-01_onboarding", "/onboarding", "[data-testid=consent]");
  await shoot(userCtx, "U-12_identity", "/identity", null);
  await shoot(userCtx, "U-13_identity_status", "/identity/status", null);
  await shoot(userCtx, "U-02_profile", "/profile/new", "[data-testid=profile-submit]");
  await shoot(userCtx, "U-04_browse", "/browse", "[data-testid=slot-card]");
  await shoot(userCtx, "U-05_slot_detail", `/slots/${slotId}`, null);
  await shoot(userCtx, "U-07_applications", "/applications", null);
  await shoot(userCtx, "U-14_payment", `/payment/${slotId}`, null);
  if (matchId) await shoot(userCtx, "U-08_match_detail", `/matches/${matchId}`, null);
  await shoot(userCtx, "U-15_ratings", "/ratings", null);
  await shoot(userCtx, "U-10_mypage", "/mypage", "[data-testid=mypage]");

  // ---- admin画面（adminのcookie付きctx） ----
  const adminPageCtx = adminCtx; // already dev-login admin
  await shoot(adminPageCtx, "A-02_admin_slots", "/admin/slots", null);
  await shoot(adminPageCtx, "A-04_admin_matches", "/admin/matches", null);
  if (matchId) await shoot(adminPageCtx, "A-05_admin_match_detail", `/admin/matches/${matchId}`, null);
  await shoot(adminPageCtx, "A-10_admin_badges", "/admin/badges", null);

  await userCtx.close(); await adminCtx.close();
} finally {
  await browser.close();
}
log("DONE");
