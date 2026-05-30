// =============================================================================
// S1+S2 Lv4 E2E — core loop front half, with REAL DATA assertions.
// Viewport: mobile portrait 375x812. Server: PORT=3300, MOCK_DB/AUTH/NOTIFY=1.
//
// This spec is written defensively: where testids were uncertain in the
// briefing, it falls back to role/text locators and, on failure, dumps the
// rendered page HTML + a screenshot to e2e/_artifacts so the run itself is the
// ground truth (PW-DATA-001: empty screen / empty data = FAIL).
//
// Run via scripts/run-lv4.mjs (NOT @playwright/test — only the bare `playwright`
// package is installed, so this uses chromium.launch + manual step harness).
// =============================================================================

import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3300";
const ART = join(process.cwd(), "e2e", "_artifacts");
const SHOTS = join(process.cwd(), "screenshots", "s2", "e2e");
mkdirSync(ART, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

type StepResult = {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
  shot?: string;
};
const results: StepResult[] = [];

function log(...a: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(...a);
}

async function shot(page: Page, name: string): Promise<string> {
  const p = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function dumpHtml(page: Page, name: string): Promise<string> {
  const p = join(ART, `${name}.html`);
  const html = await page.content().catch(() => "<no content>");
  writeFileSync(p, html);
  return p;
}

async function record(
  page: Page,
  id: string,
  name: string,
  fn: () => Promise<string>
): Promise<boolean> {
  log(`\n[${id}] ${name} ...`);
  try {
    const detail = await fn();
    const s = await shot(page, `${id}-${slug(name)}`);
    results.push({ id, name, pass: true, detail, shot: s });
    log(`[${id}] PASS — ${detail}`);
    log(`[${id}] shot=${s}`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const s = await shot(page, `${id}-${slug(name)}-FAIL`).catch(() => "");
    const h = await dumpHtml(page, `${id}-${slug(name)}-FAIL`).catch(() => "");
    results.push({
      id,
      name,
      pass: false,
      detail: `${msg} | url=${page.url()} | html=${h}`,
      shot: s,
    });
    log(`[${id}] FAIL — ${msg}`);
    log(`[${id}] url=${page.url()}`);
    if (s) log(`[${id}] shot=${s}`);
    if (h) log(`[${id}] html=${h}`);
    return false;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// 1x1 transparent PNG (for mock identity image upload).
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function run() {
  const browser: Browser = await chromium.launch({ headless: true });
  let stepFailedHard = false;
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

    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") log(`  [browser:${t}] ${m.text()}`);
    });
    page.on("pageerror", (e) => log(`  [pageerror] ${e.message}`));

    // ---------------------------------------------------------------------
    // STEP 1 — U-00 splash: login-button -> onboarding
    // ---------------------------------------------------------------------
    const s1 = await record(page, "S1", "U-00 login-button -> onboarding", async () => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const btn = page.getByTestId("login-button");
      await btn.waitFor({ state: "visible" });
      await Promise.all([
        page.waitForURL(/\/onboarding/, { timeout: 15000 }),
        btn.click(),
      ]);
      return `navigated to ${page.url()}`;
    });
    if (!s1) stepFailedHard = true;

    // ---------------------------------------------------------------------
    // STEP 2 — onboarding: consent -> next -> identity
    // ---------------------------------------------------------------------
    if (!stepFailedHard) {
      const s2 = await record(page, "S2", "onboarding consent + next -> identity", async () => {
        // consent may be a checkbox/toggle with testid=consent, else any checkbox.
        const consent = page.getByTestId("consent");
        if (await consent.count()) {
          await consent.first().click();
        } else {
          const cb = page.getByRole("checkbox");
          const n = await cb.count();
          for (let i = 0; i < n; i++) await cb.nth(i).check().catch(() => {});
        }
        const next = page.getByTestId("onboarding-next");
        const nextLoc = (await next.count())
          ? next
          : page.getByRole("button", { name: /次へ|つぎへ|進む|はじめる|同意/ });
        await nextLoc.first().click();
        // expect to land on identity (route /identity)
        await page.waitForURL(/\/identity/, { timeout: 15000 });
        return `navigated to ${page.url()}`;
      });
      if (!s2) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 3 — U-12 identity: doc-type + mock image -> submit -> pending
    // ---------------------------------------------------------------------
    if (!stepFailedHard) {
      const s3 = await record(page, "S3", "U-12 identity submit -> pending", async () => {
        // doc-type is a radiogroup wrapper (testid=doc-type); choose first option
        // by role/text since individual options have no testid.
        const group = page.getByTestId("doc-type");
        if (await group.count()) {
          // try radio role inside, else any clickable choice chip text
          const radios = group.getByRole("radio");
          if (await radios.count()) {
            await radios.first().click();
          } else {
            // ChoiceChip rendered as button/label — click first interactive child
            const opt = group.locator("button, [role='button'], label").first();
            await opt.click();
          }
        } else {
          // fallback: pick a known doc label
          await page
            .getByText(/運転免許|パスポート|マイナンバー|免許証/)
            .first()
            .click();
        }

        // mock image upload: set a file on the first file input if present.
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count()) {
          await fileInput.setInputFiles({
            name: "id.png",
            mimeType: "image/png",
            buffer: PNG_1x1,
          });
          // give any preview/upload mock a tick
          await page.waitForTimeout(500);
        }

        const submit = page.getByTestId("identity-submit");
        const submitLoc = (await submit.count())
          ? submit
          : page.getByRole("button", { name: /提出|申請|送信|完了/ });
        // submit may be disabled until file chosen; wait until enabled
        await submitLoc.first().waitFor({ state: "visible" });
        await submitLoc.first().click({ trial: false });

        // pending: expect status text or navigation to /identity/status
        await page.waitForTimeout(800);
        const pendingByText = page.getByText(/審査中|確認中|pending|申請を受け付け|提出済/i);
        const onStatusRoute = /\/identity\/status/.test(page.url());
        if (!(onStatusRoute || (await pendingByText.count()))) {
          throw new Error(
            "no pending indicator (neither /identity/status route nor 審査中/pending text)"
          );
        }
        return `pending shown (url=${page.url()})`;
      });
      if (!s3) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 4 — approve identity (admin). Strategy: open a SECOND browser
    // context, dev-login as admin (role=admin on fresh user), find the
    // pending identity for our user via GET /api/admin/identity, POST approve.
    // We capture our user id from /api/me of the main session.
    // ---------------------------------------------------------------------
    let approvedVia = "";
    if (!stepFailedHard) {
      const s4 = await record(page, "S4", "admin approve identity", async () => {
        // who am I (main session)
        const meResp = await page.request.get(BASE + "/api/me");
        const meJson = await meResp.json().catch(() => ({}));
        const myId =
          meJson?.user?.id ?? meJson?.id ?? meJson?.data?.user?.id ?? null;

        // admin session in a separate context (fresh user => role applied)
        const adminCtx = await browser.newContext();
        try {
          const login = await adminCtx.request.post(BASE + "/api/auth/dev-login", {
            data: { lineUserId: "Uadmin-e2e", role: "admin" },
          });
          if (!login.ok()) {
            throw new Error(`admin dev-login failed: ${login.status()}`);
          }
          // list pending identities
          const list = await adminCtx.request.get(BASE + "/api/admin/identity");
          if (!list.ok()) {
            throw new Error(`GET /api/admin/identity failed: ${list.status()}`);
          }
          const listJson = await list.json().catch(() => ({}));
          const items: any[] =
            listJson?.items ?? listJson?.identities ?? listJson?.data ?? [];
          // find the identity belonging to my user (or the only pending one)
          let target =
            items.find((it) => (it.userId ?? it.user?.id) === myId) ??
            items.find((it) => (it.status ?? "").toLowerCase() === "pending") ??
            items[0];
          // identity record id (the approve route is /api/admin/identity/[id]/approve)
          const targetId = target?.id ?? target?.identityId ?? target?.userId;
          if (!targetId) {
            throw new Error(
              `no pending identity found to approve (items=${JSON.stringify(items).slice(0, 400)})`
            );
          }
          const approve = await adminCtx.request.post(
            BASE + `/api/admin/identity/${targetId}/approve`,
            { data: {} }
          );
          if (!approve.ok()) {
            const t = await approve.text().catch(() => "");
            throw new Error(
              `approve failed: ${approve.status()} ${t.slice(0, 200)}`
            );
          }
          approvedVia = `admin approve id=${targetId}`;
          return `approved (myId=${myId}) via ${approvedVia}`;
        } finally {
          await adminCtx.close();
        }
      });
      if (!s4) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 5 — profile: submit with 18+ birthdate
    // ---------------------------------------------------------------------
    if (!stepFailedHard) {
      const s5 = await record(page, "S5", "profile-submit (18+)", async () => {
        await page.goto(BASE + "/profile/new", { waitUntil: "networkidle" });
        // displayName
        const name = page.getByLabel(/表示名|ニックネーム|名前/).or(
          page.locator('input[name="displayName"], input[type="text"]').first()
        );
        await name.first().fill("テスト太郎").catch(async () => {
          await page.locator("input").first().fill("テスト太郎");
        });

        // gender choice (male/female) — choose first available
        const genderChoice = page.getByText(/男性|女性|その他/).first();
        if (await genderChoice.count()) await genderChoice.click().catch(() => {});

        // birthdate: prefer a date input; else 3 selects/inputs.
        const dateInput = page.locator('input[type="date"]').first();
        if (await dateInput.count()) {
          await dateInput.fill("1996-01-01");
        } else {
          // try name=birthdate text input
          const bd = page.locator('input[name="birthdate"]').first();
          if (await bd.count()) await bd.fill("1996-01-01");
        }

        // area preference — pick first area chip
        const area = page.getByText(/恵比寿|池袋|銀座/).first();
        if (await area.count()) await area.click().catch(() => {});

        const submit = page.getByTestId("profile-submit");
        const submitLoc = (await submit.count())
          ? submit
          : page.getByRole("button", { name: /保存|登録|完了|次へ|始める/ });
        await submitLoc.first().click();
        await page.waitForTimeout(800);
        // success = navigation away from /profile/new (to /browse or /mypage)
        if (/\/profile\/new/.test(page.url())) {
          // maybe an error toast: dump and fail
          throw new Error("still on /profile/new after submit (validation error?)");
        }
        return `profile saved, now at ${page.url()}`;
      });
      if (!s5) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 6 — U-04 browse: slot-list + slot-card visible (NON-EMPTY)
    // ---------------------------------------------------------------------
    let slotCardCount = 0;
    if (!stepFailedHard) {
      const s6 = await record(page, "S6", "U-04 browse slot-list non-empty", async () => {
        await page.goto(BASE + "/browse", { waitUntil: "networkidle" });
        // wait for either list or empty marker
        const list = page.getByTestId("slot-list");
        const empty = page.getByTestId("empty");
        await Promise.race([
          list.first().waitFor({ state: "visible", timeout: 15000 }),
          empty.first().waitFor({ state: "visible", timeout: 15000 }),
        ]).catch(() => {});

        if (await empty.count()) {
          throw new Error("browse shows EMPTY state (no seeded slots) — PW-DATA-001 FAIL");
        }
        await list.first().waitFor({ state: "visible" });

        const cards = page.getByTestId("slot-card");
        slotCardCount = await cards.count();
        if (slotCardCount < 1) {
          // also try the link testid as fallback count
          const links = page.getByTestId("slot-card-link");
          slotCardCount = await links.count();
        }
        if (slotCardCount < 1) {
          throw new Error("slot-list visible but ZERO slot-card — empty data FAIL");
        }
        return `slot-card count = ${slotCardCount} (non-empty)`;
      });
      if (!s6) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 7 — slot-card-link -> U-05 detail, apply-button enabled
    // ---------------------------------------------------------------------
    if (!stepFailedHard) {
      const s7 = await record(page, "S7", "U-05 slot detail, apply-button enabled", async () => {
        const link = page.getByTestId("slot-card-link").first();
        const linkLoc = (await link.count())
          ? link
          : page.getByTestId("slot-card").first();
        await Promise.all([
          page.waitForURL(/\/slots\//, { timeout: 15000 }),
          linkLoc.click(),
        ]);
        const apply = page.getByTestId("apply-button");
        const blocked = page.getByTestId("apply-blocked");
        await Promise.race([
          apply.first().waitFor({ state: "visible", timeout: 15000 }),
          blocked.first().waitFor({ state: "visible", timeout: 15000 }),
        ]).catch(() => {});
        if (await blocked.count()) {
          const txt = await blocked.first().innerText().catch(() => "");
          throw new Error(`apply-blocked shown: "${txt.slice(0, 120)}" (not eligible)`);
        }
        await apply.first().waitFor({ state: "visible" });
        const disabled = await apply.first().isDisabled().catch(() => false);
        if (disabled) throw new Error("apply-button present but DISABLED");
        return `apply-button enabled at ${page.url()}`;
      });
      if (!s7) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 8 — apply-button -> apply-confirm sheet -> confirm
    // ---------------------------------------------------------------------
    if (!stepFailedHard) {
      const s8 = await record(page, "S8", "apply -> confirm sheet -> submit", async () => {
        await page.getByTestId("apply-button").first().click();
        // sheet opens; apply-confirm appears only after sheet open
        const confirm = page.getByTestId("apply-confirm");
        await confirm.first().waitFor({ state: "visible", timeout: 15000 });
        await confirm.first().click();
        await page.waitForTimeout(1000);
        return `apply confirmed (url=${page.url()})`;
      });
      if (!s8) stepFailedHard = true;
    }

    // ---------------------------------------------------------------------
    // STEP 9 — /applications: application-row reflects the apply (REAL DATA)
    // ---------------------------------------------------------------------
    if (!stepFailedHard) {
      const s9 = await record(page, "S9", "/applications shows application-row", async () => {
        await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
        const rows = page.getByTestId("application-row");
        const empty = page.getByTestId("empty");
        await Promise.race([
          rows.first().waitFor({ state: "visible", timeout: 15000 }),
          empty.first().waitFor({ state: "visible", timeout: 15000 }),
        ]).catch(() => {});
        if (await empty.count()) {
          throw new Error("applications EMPTY — apply did not persist (PW-DATA-001 FAIL)");
        }
        const n = await rows.count();
        if (n < 1) throw new Error("no application-row found after applying");
        return `application-row count = ${n} (apply reflected)`;
      });
      if (!s9) stepFailedHard = true;
    }

    await ctx.close();
  } finally {
    await browser.close();
    log("\nbrowser closed (finally).");
  }

  // ---- summary ----
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  log("\n================ LV4 SUMMARY ================");
  for (const r of results) {
    log(`${r.pass ? "PASS" : "FAIL"}  [${r.id}] ${r.name}`);
    log(`        ${r.detail}`);
    if (r.shot) log(`        shot: ${r.shot}`);
  }
  log("--------------------------------------------");
  log(`TOTAL=${results.length}  PASS=${pass}  FAIL=${fail}`);
  log("============================================");
  writeFileSync(join(ART, "summary.json"), JSON.stringify({ results, pass, fail }, null, 2));

  // non-zero exit if any fail, so the runner log makes status obvious
  if (fail > 0) process.exitCode = 1;
}

run().catch((e) => {
  log("FATAL", e);
  process.exitCode = 2;
});
