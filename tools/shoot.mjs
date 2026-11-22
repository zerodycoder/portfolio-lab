// Renders a site in real Chromium and screenshots each section on desktop and mobile.
// Usage: node tools/shoot.mjs <url> <outDir> [--only=desktop|mobile] [--sections=a,b,c]
// Also reports console errors, page errors, failed requests and horizontal overflow.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4173/';
const outDir = args.filter((a) => !a.startsWith('--'))[1] ?? 'tools/out/shots';
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const only = flag('only');
const sections = (flag('sections') ?? 'top,legend@0.6,machine@0.1,machine@0.7,ignite,ignite:hold,details@0.5,specs,ride@0.4,finish,finish:ember,reserve,reserve:submit,footer').split(',');

const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !only || v.name === only);

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: flag('browser'), args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--autoplay-policy=no-user-gesture-required'] });
const report = {};

for (const vp of viewports) {
  const { name, ...opts } = vp;
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const issues = [];
  const media = {};
  page.on('console', (m) => m.type() === 'error' && issues.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => issues.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && issues.push(`http ${r.status()}: ${r.url()}`));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${name}-00-gate-loading.png`) });
  await page.waitForSelector('[data-gate].is-ready', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, `${name}-01-gate-ready.png`) });
  // --sound enters with sound and records whether the Web Audio engine actually reached "running".
  const withSound = args.includes('--sound');
  await page.click(withSound ? '[data-enter="sound"]' : '[data-enter="mute"]');
  await page.waitForTimeout(3200);
  const audio = await page.evaluate(() => ({ enabled: window.__sound?.enabled ?? null, state: window.__sound?.state ?? null }));

  let n = 2;
  for (const rawSpec of sections) {
    // "section~6" waits 6 extra seconds before the screenshot (e.g. to catch a later moment of an animation).
    const [spec, extraWait] = rawSpec.split('~');
    const [target, action] = spec.split(':');
    const [id, frac] = target.split('@');
    await page.evaluate(
      ({ id, frac }) => {
        const lenis = window.__lenis;
        const st = window.__st;
        const el = id === 'footer' ? document.querySelector('footer') : document.getElementById(id);
        if (!el) return;
        const trig = st.getById(id);
        let y;
        if (frac !== undefined && trig) y = trig.start + (trig.end - trig.start) * Number(frac);
        else y = el.getBoundingClientRect().top + window.scrollY;
        if (id === 'footer') y = document.documentElement.scrollHeight;
        lenis.scrollTo(y, { immediate: true, force: true });
      },
      { id, frac },
    );
    await page.waitForTimeout(1400 + Number(extraWait ?? 0) * 1000);

    if (action === 'hold') {
      await page.evaluate(() => {
        const btn = document.querySelector('[data-hold]');
        const y = btn.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.62;
        window.__lenis.scrollTo(y, { immediate: true, force: true });
      });
      await page.waitForTimeout(600);
      const box = await page.locator('[data-hold]').boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(3300);
        await page.screenshot({ path: path.join(outDir, `${name}-${String(n++).padStart(2, '0')}-${id}-holding.png`) });
        await page.mouse.up();
        continue;
      }
    }
    if (action === 'ember') {
      await page.click('[data-finish="ember"]');
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, `${name}-${String(n++).padStart(2, '0')}-${id}-wipe.png`) });
      await page.waitForTimeout(1200);
    }
    if (action === 'submit') {
      await page.fill('#f-name', 'Ada Lovelace');
      await page.fill('#f-email', 'ada@example.com');
      await page.fill('#f-city', 'London');
      await page.click('.form button[type="submit"]');
      await page.waitForTimeout(2800);
      await page.evaluate(() => {
        const slot = document.querySelector('[data-slot]');
        slot?.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(600);
    }
    const videos = await page.evaluate(() =>
      [...document.querySelectorAll('video')]
        .filter((v) => v.getBoundingClientRect().bottom > 0 && v.getBoundingClientRect().top < innerHeight)
        .map((v) => ({ src: v.currentSrc.split('/').pop(), ready: v.readyState, t: Number(v.currentTime.toFixed(2)), paused: v.paused, error: v.error?.code ?? null })),
    );
    if (videos.length) (media[spec] = videos);
    const label = `${id}${frac ? `@${frac}` : ''}${action ? `-${action}` : ''}${extraWait ? `-t${extraWait}` : ''}`.replace(/[@.]/g, '_');
    await page.screenshot({ path: path.join(outDir, `${name}-${String(n++).padStart(2, '0')}-${label}.png`) });
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    wide: [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const pos = getComputedStyle(el).position;
        return r.right > document.documentElement.clientWidth + 1 && pos !== 'fixed' && !el.closest('.details__track, .ride__rows, .hero__title, .footer__mark, .pin-spacer .details__track');
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
  }));
  report[name] = { issues, audio, media, overflow };
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
