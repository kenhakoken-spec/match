// =============================================================================
// S1+S2 Lv4 E2E runner (plain ESM, uses bare `playwright` package).
// Mobile portrait 375x812. BASE_URL defaults to http://localhost:3300.
//
// Self-discovering: on any step failure it dumps rendered HTML + screenshot so
// the run artifacts are ground truth (PW-DATA-001: empty screen/data = FAIL).
//
// Usage: BASE_URL=http://localhost:3300 node scripts/run-lv4.mjs
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3300";
const ROOT = process.cwd();
const ART = join(ROOT, "e2e", "_artifacts");
const SHOTS = join(ROOT, "screenshots", "s2", "e2e");
mkdirSync(ART, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const results = [];
const log = (...a) => console.log(...a);

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 44);

async function shot(page, name) {
  const p = join(SHOTS, `${name}.png`);
  try {
    await page.screenshot({ path: p, fullPage: true });
    return p;
  } catch {
    return "";
  }
}
async function dumpHtml(page, name) {
  const p = join(ART, `${name}.html`);
  try {
    writeFileSync(p, await page.content());
    return p;
  } catch {
    return "";
  }
}

async function record(page, id, name, fn) {
  log(`\n[${id}] ${name} ...`);
  try {
    const detail = await fn();
    const s = await shot(page, `${id}-${slug(name)}`);
    results.push({ id, name, pass: true, detail, shot: s });
    log(`[${id}] PASS — ${detail}`);
    if (s) log(`[${id}] shot=${s}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const s = await shot(page, `${id}-${slug(name)}-FAIL`);
    const h = await dumpHtml(page, `${id}-${slug(name)}-FAIL`);
    results.push({ id, name, pass: false, detail: msg, url: page.url(), shot: s, html: h });
    log(`[${id}] FAIL — ${msg}`);
    log(`[${id}] url=${page.url()}`);
    if (s) log(`[${id}] shot=${s}`);
    if (h) log(`[${id}] html=${h}`);
    return false;
  }
}

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function firstCount(loc) {
  try {
    return await loc.count();
  } catch {
    return 0;
  }
}

// Wait for a Next.js client-side (soft) navigation to settle. `waitForURL` keys
// off real navigation events and is flaky for router.push, especially on a cold
// dev server where the target route compiles on first hit. Poll the URL instead.
async function waitForPath(page, re, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (re.test(page.url())) return true;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for URL ${re} (still at ${page.url()})`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  let hardFail = false;
  let slotCardCount = 0;
  try {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E5212 Safari/604.1",
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => log(`  [pageerror] ${e.message}`));
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error") log(`  [browser:error] ${m.text()}`);
    });

    // STEP 1 — U-00 login-button -> onboarding
    if (
      !(await record(page, "S1", "U-00 login-button -> onboarding", async () => {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
        const btn = page.getByTestId("login-button");
        await btn.waitFor({ state: "visible" });
        // Click fires devLogin() (POST, compiles on cold server ~1.5s) then
        // router.push("/onboarding") — a soft nav. Poll the URL rather than
        // racing waitForURL against the push.
        await btn.click();
        await waitForPath(page, /\/onboarding/);
        // confirm onboarding actually rendered (first slide has 次へ)
        await page.getByRole("button", { name: /^次へ$/ }).first().waitFor({ state: "visible" });
        return `navigated to ${page.url()}`;
      }))
    )
      hardFail = true;

    // STEP 2 — onboarding consent + next -> identity
    // Onboarding is a 3-slide carousel; the consent checkbox + onboarding-next
    // button only render on the LAST slide. Advance via 次へ until consent shows.
    if (!hardFail)
      if (
        !(await record(page, "S2", "onboarding consent + next -> identity", async () => {
          // advance slides until the consent control appears (max 5 guards infinite)
          let advanced = 0;
          for (let i = 0; i < 5; i++) {
            if (await firstCount(page.getByTestId("consent"))) break;
            const nextSlide = page.getByRole("button", { name: /^次へ$/ });
            if (!(await firstCount(nextSlide))) break;
            await nextSlide.first().click();
            advanced++;
            await page.waitForTimeout(250);
          }
          const consent = page.getByTestId("consent");
          if (!(await firstCount(consent)))
            throw new Error(`consent control never appeared after advancing ${advanced} slides`);
          await consent.first().click();

          const next = page.getByTestId("onboarding-next");
          if (!(await firstCount(next)))
            throw new Error("onboarding-next not found on last slide");
          // button is disabled until consent is checked; verify it became enabled
          if (await next.first().isDisabled().catch(() => false))
            throw new Error("onboarding-next still disabled after checking consent");
          await next.first().click();
          await waitForPath(page, /\/identity/);
          // confirm identity page rendered (doc-type radiogroup present)
          await page.getByTestId("doc-type").first().waitFor({ state: "visible" });
          return `advanced ${advanced} slides, consent checked, navigated to ${page.url()}`;
        }))
      )
        hardFail = true;

    // STEP 3 — U-12 identity submit -> pending
    if (!hardFail)
      if (
        !(await record(page, "S3", "U-12 identity submit -> pending", async () => {
          // doc-type options are ChoiceChip <button>s inside the radiogroup
          // (no radio role, no per-option testid) — click the first button.
          const group = page.getByTestId("doc-type");
          await group.waitFor({ state: "visible" });
          await group.locator("button").first().click();

          // mock front image (canSubmit needs docType + front file).
          const fileInput = page.locator('input[type="file"]').first();
          if (!(await firstCount(fileInput)))
            throw new Error("no file input on identity page");
          await fileInput.setInputFiles({ name: "id.png", mimeType: "image/png", buffer: PNG_1x1 });

          const submit = page.getByTestId("identity-submit");
          // wait until the disabled gate clears (docType + file set)
          await submit.waitFor({ state: "visible" });
          for (let i = 0; i < 40; i++) {
            if (!(await submit.isDisabled().catch(() => true))) break;
            await page.waitForTimeout(150);
          }
          if (await submit.isDisabled().catch(() => true))
            throw new Error("identity-submit stayed disabled (upload mock failed?)");
          await submit.click();
          // submit uploads then POST /api/identity then router.push to status.
          await waitForPath(page, /\/identity\/status/);
          // status page shows a LoadingState first, then renders the pending
          // block AFTER getIdentity() resolves — wait for the text to appear.
          const pendingByText = page.getByText(/確認中|審査中|pending/i).first();
          await pendingByText.waitFor({ state: "visible", timeout: 15000 });
          const txt = await pendingByText.innerText().catch(() => "");
          return `pending shown ("${txt.trim().slice(0, 24)}", url=${page.url()})`;
        }))
      )
        hardFail = true;

    // STEP 4 — admin approve identity (separate context, dev-login role=admin)
    if (!hardFail)
      if (
        !(await record(page, "S4", "admin approve identity", async () => {
          const meResp = await page.request.get(BASE + "/api/me");
          const meJson = await meResp.json().catch(() => ({}));
          const myId = meJson?.user?.id ?? meJson?.id ?? meJson?.data?.user?.id ?? null;

          const adminCtx = await browser.newContext();
          try {
            const login = await adminCtx.request.post(BASE + "/api/auth/dev-login", {
              data: { lineUserId: "Uadmin-e2e", role: "admin" },
            });
            if (!login.ok()) throw new Error(`admin dev-login failed: ${login.status()}`);

            const list = await adminCtx.request.get(BASE + "/api/admin/identity");
            if (!list.ok()) throw new Error(`GET /api/admin/identity failed: ${list.status()}`);
            const lj = await list.json().catch(() => ({}));
            const items = lj?.items ?? lj?.identities ?? lj?.data ?? [];
            let target =
              items.find((it) => (it.userId ?? it.user?.id) === myId) ??
              items.find((it) => String(it.status ?? "").toLowerCase() === "pending") ??
              items[0];
            const targetId = target?.id ?? target?.identityId ?? target?.userId;
            if (!targetId)
              throw new Error(
                `no pending identity to approve (items=${JSON.stringify(items).slice(0, 400)})`
              );
            const approve = await adminCtx.request.post(
              BASE + `/api/admin/identity/${targetId}/approve`,
              { data: {} }
            );
            if (!approve.ok()) {
              const t = await approve.text().catch(() => "");
              throw new Error(`approve failed: ${approve.status()} ${t.slice(0, 200)}`);
            }
            return `approved myId=${myId} identityId=${targetId}`;
          } finally {
            await adminCtx.close();
          }
        }))
      )
        hardFail = true;

    // STEP 5 — profile submit (18+)
    if (!hardFail)
      if (
        !(await record(page, "S5", "profile-submit (18+)", async () => {
          await page.goto(BASE + "/profile/new", { waitUntil: "domcontentloaded" });
          const submit = page.getByTestId("profile-submit");
          await submit.waitFor({ state: "visible" });

          // ProfileForm has NO field testids; match the real DOM:
          // photo (required) = hidden <input type=file> behind PhotoPicker.
          const photoInput = page.locator('input[type="file"]').first();
          if (!(await firstCount(photoInput)))
            throw new Error("no photo file input on profile form");
          await photoInput.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1x1 });

          // displayName: TextField renders id=name="displayName".
          await page.locator("#displayName").fill("テスト太郎");

          // gender: SegmentedChoice radios with text 女性/男性; pick 男性.
          await page.getByRole("radio", { name: "男性" }).click();

          // birthdate: three native <select> with aria-label 年/月/日. 18+ → 1996.
          await page.getByLabel("年", { exact: true }).selectOption("1996");
          await page.getByLabel("月", { exact: true }).selectOption("1");
          await page.getByLabel("日", { exact: true }).selectOption("1");

          // area: ChoiceChip (role=checkbox, multi) with label 恵比寿.
          await page.getByRole("checkbox", { name: "恵比寿" }).click();

          // submit gate clears once photo+name+gender+birthdate+area set.
          for (let i = 0; i < 40; i++) {
            if (!(await submit.isDisabled().catch(() => true))) break;
            await page.waitForTimeout(150);
          }
          if (await submit.isDisabled().catch(() => true))
            throw new Error("profile-submit stayed disabled (a required field unfilled)");
          await submit.click();
          // create-mode success → router.push("/mypage") (soft nav).
          await waitForPath(page, /\/mypage/);
          // confirm mypage rendered its content (data-testid=mypage on <main>).
          await page.getByTestId("mypage").waitFor({ state: "visible" });
          return `profile saved, now at ${page.url()}`;
        }))
      )
        hardFail = true;

    // STEP 6 — U-04 browse slot-list non-empty
    if (!hardFail)
      if (
        !(await record(page, "S6", "U-04 browse slot-list non-empty", async () => {
          // domcontentloaded (not networkidle): the page keeps fetching/polling
          // and networkidle can hang past timeout on a cold-compiled route.
          await page.goto(BASE + "/browse", { waitUntil: "domcontentloaded" });
          const list = page.getByTestId("slot-list");
          const empty = page.getByTestId("empty");
          await Promise.race([
            list.first().waitFor({ state: "visible", timeout: 15000 }),
            empty.first().waitFor({ state: "visible", timeout: 15000 }),
          ]).catch(() => {});
          if (await firstCount(empty))
            throw new Error("browse EMPTY state (no seeded slots) — PW-DATA-001 FAIL");
          await list.first().waitFor({ state: "visible" });
          let cards = page.getByTestId("slot-card");
          slotCardCount = await firstCount(cards);
          if (slotCardCount < 1) slotCardCount = await firstCount(page.getByTestId("slot-card-link"));
          if (slotCardCount < 1)
            throw new Error("slot-list visible but ZERO slot-card — empty data FAIL");
          return `slot-card count = ${slotCardCount} (non-empty)`;
        }))
      )
        hardFail = true;

    // STEP 7 — U-05 slot detail, apply-button enabled.
    // The seed has conditioned slots (20s-only / badge-only) that our test user
    // may be ineligible for. Iterate cards from /browse until one detail page
    // shows an ENABLED apply-button. eligibleSlotUrl is reused by Step 8.
    let eligibleSlotUrl = "";
    let blockedSeen = [];
    if (!hardFail)
      if (
        !(await record(page, "S7", "U-05 slot detail apply-button enabled", async () => {
          // reuse the browse list already shown in S6 (still current page).
          if (!/\/browse/.test(page.url())) {
            await page.goto(BASE + "/browse", { waitUntil: "domcontentloaded" });
          }
          await page.getByTestId("slot-list").first().waitFor({ state: "visible" });
          // collect distinct slot detail hrefs from the cards
          const hrefs = await page.getByTestId("slot-card-link").evaluateAll((els) =>
            els.map((e) => e.getAttribute("href")).filter(Boolean)
          );
          if (hrefs.length === 0) throw new Error("no slot-card-link hrefs on browse");
          for (const href of hrefs) {
            // domcontentloaded + explicit control wait (networkidle hangs cold).
            await page.goto(BASE + href, { waitUntil: "domcontentloaded" });
            const apply = page.getByTestId("apply-button");
            const blocked = page.getByTestId("apply-blocked");
            await Promise.race([
              apply.first().waitFor({ state: "visible", timeout: 20000 }),
              blocked.first().waitFor({ state: "visible", timeout: 20000 }),
            ]).catch(() => {});
            if ((await firstCount(apply)) && !(await apply.first().isDisabled().catch(() => true))) {
              eligibleSlotUrl = page.url();
              return `apply-button enabled at ${eligibleSlotUrl} (checked ${blockedSeen.length} blocked first)`;
            }
            const txt = (await firstCount(blocked))
              ? await blocked.first().innerText().catch(() => "")
              : "no apply control";
            blockedSeen.push(`${href}:${txt.slice(0, 30)}`);
          }
          throw new Error(
            `no slot had an enabled apply-button. blocked=${JSON.stringify(blockedSeen)}`
          );
        }))
      )
        hardFail = true;

    // STEP 8 — apply -> confirm sheet -> check boxes -> submit.
    // apply-confirm is disabled until the confirmation checkboxes (当日参加 /
    // 会場は後日) are checked. Check every checkbox inside the dialog first.
    if (!hardFail)
      if (
        !(await record(page, "S8", "apply -> confirm sheet -> submit", async () => {
          if (eligibleSlotUrl && page.url() !== eligibleSlotUrl) {
            await page.goto(eligibleSlotUrl, { waitUntil: "domcontentloaded" });
            await page.getByTestId("apply-button").first().waitFor({ state: "visible" });
          }
          await page.getByTestId("apply-button").first().click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor({ state: "visible", timeout: 15000 });
          // tick all checkboxes within the sheet (attend + venue; fee not needed)
          const boxes = dialog.getByRole("checkbox");
          const nb = await firstCount(boxes);
          for (let i = 0; i < nb; i++) await boxes.nth(i).check().catch(() => {});
          const confirm = page.getByTestId("apply-confirm");
          await confirm.first().waitFor({ state: "visible", timeout: 15000 });
          if (await confirm.first().isDisabled().catch(() => false))
            throw new Error(`apply-confirm still disabled after checking ${nb} boxes`);
          await confirm.first().click();
          // The apply POST compiles on first hit (cold) and the button shows
          // "応募しています…" meanwhile. Wait for a DEFINITIVE outcome rather than a
          // fixed sleep: either the dialog closes (success) or an in-sheet error
          // (通信に失敗 / a reason) appears (real failure → distinguish bug vs test).
          const successToast = page.getByText("応募しました").first();
          const successLink = page.getByText("応募状況を見る").first();
          const sheetError = page.getByText(/通信に失敗|応募できません|年齢|本人認証|満員|バッジ/).first();
          const deadline = Date.now() + 30000;
          let outcome = "pending";
          while (Date.now() < deadline) {
            if ((await firstCount(page.getByRole("dialog"))) === 0) { outcome = "dialog-closed"; break; }
            if (await firstCount(successToast)) { outcome = "success-toast"; break; }
            if (await firstCount(successLink)) { outcome = "success-link"; break; }
            if (await firstCount(sheetError)) {
              const t = await sheetError.innerText().catch(() => "");
              throw new Error(`apply returned an error in-sheet: "${t.slice(0, 120)}" (PRODUCT issue if persisted)`);
            }
            await page.waitForTimeout(250);
          }
          if (outcome === "pending")
            throw new Error("apply never resolved in 30s (button stuck on 応募しています… — POST hung?)");
          return `apply confirmed (boxes=${nb}, outcome=${outcome}, url=${page.url()})`;
        }))
      )
        hardFail = true;

    // STEP 9 — /applications shows application-row (real data)
    if (!hardFail)
      if (
        !(await record(page, "S9", "/applications shows application-row", async () => {
          // The list fetches on mount (LoadingState first). Poll for the row to
          // appear; the empty-state marker means the apply did not persist.
          let n = 0;
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline) {
            await page.goto(BASE + "/applications", { waitUntil: "domcontentloaded" });
            const rows = page.getByTestId("application-row");
            const empty = page.getByTestId("empty");
            await Promise.race([
              rows.first().waitFor({ state: "visible", timeout: 8000 }),
              empty.first().waitFor({ state: "visible", timeout: 8000 }),
            ]).catch(() => {});
            n = await firstCount(rows);
            if (n >= 1) break;
            if (await firstCount(empty)) {
              // confirmed empty — give one more reload in case of read lag, else fail
              if (Date.now() + 4000 >= deadline)
                throw new Error("applications EMPTY — apply did not persist (PW-DATA-001 FAIL)");
            }
            await page.waitForTimeout(1500);
          }
          if (n < 1) throw new Error("no application-row after applying (timed out)");
          const first = await page.getByTestId("application-row").first().innerText().catch(() => "");
          return `application-row count = ${n} (apply reflected; first row: "${first.replace(/\s+/g, " ").trim().slice(0, 50)}")`;
        }))
      )
        hardFail = true;

    await ctx.close();
  } finally {
    await browser.close();
    log("\nbrowser closed (finally).");
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  log("\n================ LV4 SUMMARY ================");
  for (const r of results) {
    log(`${r.pass ? "PASS" : "FAIL"}  [${r.id}] ${r.name}`);
    log(`        ${r.detail}`);
    if (r.shot) log(`        shot: ${r.shot}`);
    if (!r.pass && r.html) log(`        html: ${r.html}`);
  }
  log("--------------------------------------------");
  log(`TOTAL=${results.length}  PASS=${pass}  FAIL=${fail}  SLOT_CARDS=${slotCardCount}`);
  log(`VERDICT=${fail === 0 ? "ALL_PASS" : "HAS_FAIL"}`);
  log("============================================");
  writeFileSync(join(ART, "summary.json"), JSON.stringify({ results, pass, fail, slotCardCount }, null, 2));
  // Explicit, deterministic exit so the runner's status is unambiguous and any
  // lingering keep-alive handle (e.g. an open request socket) cannot leak a
  // non-zero code after a clean pass.
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  log("FATAL", e && e.stack ? e.stack : e);
  process.exit(2);
});
