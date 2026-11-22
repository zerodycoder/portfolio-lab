// Renders NIBBO's social preview image (1200×630) from the live page: the real 3D robot in the hero, no mock-up.
// Usage: node tools/og-nibbo.mjs [url]   (default http://localhost:4175/) → sites/nibbo/public/og.png
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4175/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-gate].is-ready', { timeout: 30000 });
await page.click('[data-enter="mute"]');
// Let the wake-up intro finish, then settle on a happy face looking at the viewer.
await page.waitForTimeout(4500);
await page.addStyleTag({ content: '.nav, .hero__hint, .scroll-cue, .hero__foot, .hero__eyebrow { visibility: hidden !important; }' });
await page.mouse.move(600, 330);
await page.evaluate(() => window.__nibbo.brain.react('happy', 10, false));
await page.waitForTimeout(900);
await page.screenshot({ path: 'sites/nibbo/public/og.png' });
await browser.close();
console.log('wrote sites/nibbo/public/og.png');
