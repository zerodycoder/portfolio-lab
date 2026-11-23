// Renders NOVANTA's social preview image (1200×630) from the live page: the street at night with the shutter down,
// the scooter, the shrine and the lemon tree, the gate's controls hidden. No mock-up.
// Usage: node tools/og-novanta.mjs [url]   (default http://localhost:5177/) → sites/novanta/public/og.png
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5177/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-gate].is-ready', { timeout: 90000 });
await page.addStyleTag({ content: '[data-gate] { visibility: hidden !important; }' });
// Let the lamps, the candles and the television settle into a nice frame.
await page.waitForTimeout(2500);
await page.screenshot({ path: 'sites/novanta/public/og.png' });
await browser.close();
console.log('wrote sites/novanta/public/og.png');
