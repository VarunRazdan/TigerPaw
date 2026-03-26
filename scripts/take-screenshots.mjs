#!/usr/bin/env node
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:5174";
const OUT = join(__dirname, "..", ".github", "screenshots");

mkdirSync(OUT, { recursive: true });

// Hash router — all paths need /#/ prefix
const pages = [
  { path: "/#/", name: "dashboard", wait: 1500 },
  { path: "/#/trading", name: "trading-hub", wait: 1500 },
  { path: "/#/trading/settings", name: "trading-settings", wait: 1500 },
  { path: "/#/trading/alpaca", name: "alpaca", wait: 1500 },
  { path: "/#/trading/polymarket", name: "polymarket", wait: 1500 },
  { path: "/#/channels", name: "channels", wait: 1500 },
  { path: "/#/security", name: "security", wait: 1500 },
  { path: "/#/config", name: "config", wait: 1500 },
];

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

for (const p of pages) {
  const page = await context.newPage();
  console.log(`Capturing ${p.name}...`);
  try {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 10000 });
  } catch {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "load", timeout: 10000 });
  }
  await page.waitForTimeout(p.wait);
  await page.screenshot({ path: join(OUT, `${p.name}.png`), fullPage: false });
  await page.close();
  console.log(`  -> ${p.name}.png`);
}

await browser.close();
console.log(`\nDone — ${pages.length} screenshots saved to .github/screenshots/`);
