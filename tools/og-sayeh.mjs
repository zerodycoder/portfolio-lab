// Renders SAYEH's social preview image (1200×630) from the live page: the real photo with a barista's rosetta poured
// by the fluid simulation, in morning light. No mock-up.
// Usage: node tools/og-sayeh.mjs [url]   (default http://localhost:4176/) → sites/sayeh/public/og.png
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4176/';
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// Skip the automatic first pour (a heart) so the rosetta can be poured on a fresh cup.
await page.addInitScript(() => sessionStorage.setItem('sayeh.demo', '1'));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-gate].is-ready', { timeout: 30000 });
await page.click('[data-enter="mute"]');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const app = window.__sayeh;
  app.day.set(9 * 60 + 30);
  app.coach.cancel();
  app.cup.newCup();
});
await page.waitForTimeout(900);
await page.evaluate(() => window.__sayeh.cup.play('rosetta'));
await page.waitForTimeout(6500);
await page.addStyleTag({ content: '.nav, .hero__tools, .hero__score, .coach, .stamp-toast, .pitcher, .cup-axis, .hero__lede { visibility: hidden !important; }' });
await page.mouse.move(5, 600);
await page.waitForTimeout(400);
await page.screenshot({ path: 'sites/sayeh/public/og.png' });
await browser.close();
console.log('wrote sites/sayeh/public/og.png');
