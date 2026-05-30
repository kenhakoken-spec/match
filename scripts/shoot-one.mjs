// Single-shot helper: capture one path at mobile portrait, with a generous
// settle so client fetch->fallback fully renders. BROWSER-CLEANUP-001: close in
// finally. Usage: node scripts/shoot-one.mjs <baseUrl> <path> <outName> [settleMs]

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2];
const PATH = process.argv[3];
const NAME = process.argv[4];
const SETTLE = Number(process.argv[5] || 1500);
const OUT = "screenshots";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-zygote"],
});
try {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(SETTLE);
  const textLen = (await page.locator("body").innerText()).trim().length;
  await page.screenshot({ path: `${OUT}/${NAME}.png`, fullPage: true });
  console.log(`OK ${NAME} textChars=${textLen} -> ${OUT}/${NAME}.png`);
} finally {
  await browser.close();
  console.log("browser.close() called");
}
