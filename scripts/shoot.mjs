// Screenshot harness for S1 UI proof (frontend-worker).
// Captures mobile-portrait (375x812) shots of the S1 screens against a running
// `next dev` server. Browser is closed in finally (BROWSER-CLEANUP-001).
//
// WSL chromium can drop the renderer after heavy fullPage captures; to stay
// robust we (a) use a fresh context+page per shot, (b) relaunch the browser if
// it dies, and (c) fall back from fullPage to a viewport-clipped shot.
//
// Usage: node scripts/shoot.mjs [baseUrl] [outDir]

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] || "http://127.0.0.1:3100";
const OUT = process.argv[3] || "screenshots";
const VIEWPORT = { width: 375, height: 812 }; // mobile portrait

const LAUNCH = {
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-zygote",
    "--disable-extensions",
  ],
};

const SHOTS = [
  { name: "U-00_login", path: "/" },
  { name: "U-01_onboarding_slide1", path: "/onboarding" },
  { name: "U-12_identity_upload", path: "/identity" },
  { name: "U-13_identity_pending", path: "/identity/status?demo=pending" },
  { name: "U-13_identity_rejected", path: "/identity/status?demo=rejected" },
  { name: "U-13_identity_approved", path: "/identity/status?demo=approved" },
  { name: "U-02_profile_new", path: "/profile/new" },
  { name: "U-02b_photo_guide", path: "/profile/photo-guide" },
  { name: "U-10_mypage", path: "/mypage" },
  { name: "U-04_browse", path: "/browse" },
  { name: "U-07_applications", path: "/applications" },
];

mkdirSync(OUT, { recursive: true });

let browser = await chromium.launch(LAUNCH);

async function ensureBrowser() {
  if (!browser || !browser.isConnected()) {
    try {
      if (browser) await browser.close();
    } catch {}
    browser = await chromium.launch(LAUNCH);
  }
  return browser;
}

async function shoot(shot) {
  await ensureBrowser();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(700); // let client fetch->fallback settle
    const file = `${OUT}/${shot.name}.png`;
    const textLen = (await page.locator("body").innerText()).trim().length;
    try {
      await page.screenshot({ path: file, fullPage: true });
    } catch {
      // Fallback: viewport-clipped shot if fullPage capture fails.
      await page.screenshot({ path: file });
    }
    return { name: shot.name, file, textLen };
  } finally {
    await context.close().catch(() => {});
  }
}

let ok = 0;
const results = [];
try {
  for (const shot of SHOTS) {
    let attempt = 0;
    // Retry once on a renderer/browser drop.
    while (attempt < 2) {
      attempt += 1;
      try {
        const r = await shoot(shot);
        results.push(r);
        ok += 1;
        console.log(`OK  ${shot.name}  textChars=${r.textLen}  -> ${r.file}`);
        break;
      } catch (err) {
        const msg = String(err?.message || err);
        if (attempt >= 2) {
          results.push({ name: shot.name, error: msg });
          console.log(`ERR ${shot.name}  ${msg}`);
        } else {
          console.log(`retry ${shot.name} (${msg.split("\n")[0]})`);
          await ensureBrowser();
          await sleep(300);
        }
      }
    }
  }
} finally {
  try {
    if (browser) await browser.close();
  } catch {}
  console.log("browser.close() called");
}

console.log(`\nSHOT_SUMMARY ok=${ok}/${SHOTS.length}`);
const empties = results.filter((r) => r.textLen !== undefined && r.textLen < 20);
if (empties.length) {
  console.log("WARNING blank-ish:", empties.map((e) => e.name).join(", "));
}
process.exit(ok === SHOTS.length ? 0 : 1);
