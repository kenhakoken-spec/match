// S8 追加画面を本番ビルド(next start)に対して撮影する。
// - 公開プレビュー(P-04/P-05/C-00)は **cookie無しの context** で撮る＝未認証で見えることの実証。
// - admin 会場候補(A-06)は admin cookie + UI操作(枠選択→候補生成)で撮る。
// - 多軸評価(U-15′)は pending があれば詳細を、無ければ一覧を撮る(データ状態はログに出す)。
// 出力 → docs/screens/。各 shot は try/catch で隔離し、1枚失敗しても続行。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PORT = process.env.PORT || "3700";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/mnt/c/tools/matching-app/docs/screens";
mkdirSync(OUT, { recursive: true });
const log = (m) => console.log("CAPS8 " + m);
const T = 25000;

const browser = await chromium.launch({ headless: true });

const shoot = async (ctx, name, path, waitSel) => {
  const page = await ctx.newPage();
  try {
    await page.goto(path, { waitUntil: "networkidle", timeout: T }).catch(() => {});
    if (waitSel) {
      await page.locator(waitSel).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    log("shot " + name + " <- " + path);
  } catch (e) {
    log("ERR " + name + " " + String(e).split("\n")[0]);
  } finally {
    await page.close();
  }
};

try {
  // ========== 1) 公開プレビュー: cookie 無し context（未認証で見える実証） ==========
  const pub = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    baseURL: BASE,
  });
  pub.setDefaultTimeout(T);

  // 公開APIから実データの枠IDを取る（無ければ FALLBACK 表示でも撮れる）。
  let pubId = "";
  try {
    const ps = await pub.request.get("/api/public/slots", { timeout: T });
    if (ps.ok()) {
      const j = await ps.json();
      const arr = Array.isArray(j) ? j : j.slots;
      log("public slots count=" + (arr ? arr.length : "?"));
      if (arr && arr[0]) pubId = arr[0].id;
    } else {
      log("public slots http=" + ps.status());
    }
  } catch (e) {
    log("public slots ERR " + String(e).split("\n")[0]);
  }
  log("public slot id=" + (pubId || "none"));

  await shoot(pub, "P-04_explore_list", "/explore", "[data-testid=public-slot-list]");
  if (pubId) await shoot(pub, "P-05_explore_detail", `/explore/${pubId}`, "h1");
  await shoot(pub, "C-00_coming_soon", "/coming-soon", null);
  await pub.close();

  // ========== 2) admin 会場候補: admin cookie + UI操作 ==========
  const adminCtx = await browser.newContext({ baseURL: BASE });
  adminCtx.setDefaultTimeout(T);
  await adminCtx.request
    .post("/api/auth/dev-login", { data: { lineUserId: "caps8-admin", role: "admin" }, timeout: T })
    .catch(() => {});

  const vpage = await adminCtx.newPage();
  try {
    await vpage.goto("/admin/venues", { waitUntil: "networkidle", timeout: T }).catch(() => {});
    // 枠を1つ選択 → 候補生成 → 候補一覧を待つ
    const firstSlot = vpage.locator("[data-testid=venue-slot-option]").first();
    if (await firstSlot.count()) {
      await firstSlot.click().catch(() => {});
      await vpage.waitForTimeout(800);
      const suggest = vpage.locator("[data-testid=venue-suggest]").first();
      if (await suggest.count()) {
        await suggest.click().catch(() => {});
        await vpage.locator("[data-testid=venue-candidate-list]").first()
          .waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      }
      log("venues: selected first slot + suggested");
    } else {
      log("venues: no slot option found");
    }
    await vpage.waitForTimeout(1200);
    await vpage.screenshot({ path: `${OUT}/A-06_admin_venues.png`, fullPage: true });
    log("shot A-06_admin_venues");
  } catch (e) {
    log("ERR A-06 " + String(e).split("\n")[0]);
  } finally {
    await vpage.close();
  }

  // ========== 3) 多軸評価: pending を探して詳細、無ければ一覧 ==========
  // 既存の成立データを admin で探す（done なら参加者に pending 評価が出る）。
  let ratingSlotId = "";
  let ratingUserLine = "";
  try {
    const ms = await adminCtx.request.get("/api/admin/matches", { timeout: T });
    if (ms.ok()) {
      const j = await ms.json();
      const items = j.items || j || [];
      log("admin matches count=" + (Array.isArray(items) ? items.length : "?"));
    }
  } catch (e) {
    log("admin matches ERR " + String(e).split("\n")[0]);
  }

  // 評価者候補: seed 参加者の lineUserId を総当りで試し、pending がある人を使う。
  const userCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    baseURL: BASE,
  });
  userCtx.setDefaultTimeout(T);
  const candidates = [
    "seed-user-male-1", "seed-user-male-2", "seed-user-male-3",
    "seed-user-female-1", "seed-user-female-2", "seed-user-female-3",
    "u-male-1", "u-female-1", "cap-user-male",
  ];
  for (const line of candidates) {
    try {
      await userCtx.request.post("/api/auth/dev-login", { data: { lineUserId: line }, timeout: T });
      const pr = await userCtx.request.get("/api/ratings/pending", { timeout: T });
      if (pr.ok()) {
        const arr = await pr.json();
        const list = Array.isArray(arr) ? arr : arr.items || [];
        if (list.length && list[0].slotId) {
          ratingSlotId = list[0].slotId;
          ratingUserLine = line;
          break;
        }
      }
    } catch {
      /* try next */
    }
  }
  log("rating pending user=" + (ratingUserLine || "none") + " slotId=" + (ratingSlotId || "none"));

  if (ratingSlotId) {
    await shoot(userCtx, "U-15s_rating_multiaxis", `/ratings/${ratingSlotId}`, "[data-testid^=rating-axis]");
  } else {
    // pending が無くても、評価一覧画面は撮っておく（実装の実在を示す）。
    await shoot(userCtx, "U-15s_ratings_list", "/ratings", null);
  }
  await userCtx.close();
  await adminCtx.close();
} finally {
  await browser.close();
}
log("DONE");
