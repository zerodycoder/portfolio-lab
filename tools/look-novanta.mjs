// Dev helper: renders NOVANTA at a place, optionally runs a script against window.__novanta, and screenshots it.
// node tools/look-novanta.mjs <outPrefix> <place> [--mobile] [--script=file.js] [--wait=ms]   (VW=… VH=… set the desktop viewport)
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const out = pos[0];
const place = pos[1] ?? 'banco';
const mobile = args.includes('--mobile');
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 900) } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`${flag("url") ?? "http://localhost:5177/"}${flag("q") ?? ""}#${place}`, { waitUntil: 'networkidle' });
if (await page.$('[data-gate]')) {
  await page.waitForSelector('[data-gate].is-ready', { timeout: 60000 });
  await page.waitForTimeout(800);
  if (args.includes('--gate')) {
    await page.screenshot({ path: `${out}-gate.png` });
  }
  await page.click(args.includes('--sound') ? '[data-enter="sound"]' : '[data-enter="mute"]');
}
await page.waitForFunction(() => !!window.__novanta, null, { timeout: 60000 });
await page.waitForTimeout(800);
const script = flag('script');
if (script) {
  const code = await fs.readFile(script, 'utf8');
  try {
    const res = await page.evaluate(`(async () => { const N = window.__novanta; ${code} })()`);
    if (res !== undefined) console.log('script:', JSON.stringify(res));
  } catch (e) {
    console.log('script error:', e.message.split(String.fromCharCode(10))[0]);
  }
}
await page.waitForTimeout(Number(flag('wait') ?? 600));
await page.screenshot({ path: `${out}.png` });
const info = await page.evaluate(() => { const r = window.__novanta.stage.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, programs: r.programs?.length }; });
console.log(JSON.stringify({ info, logs: logs.slice(0, 20) }));
await browser.close();
