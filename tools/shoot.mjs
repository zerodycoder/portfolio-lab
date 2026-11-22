// Renders a site in a real browser and screenshots each section on desktop and mobile.
// Usage: node tools/shoot.mjs <url> <outDir> [--site=rakhsh] [--browser=msedge] [--sound] [--only=desktop|mobile]
//        A section spec is id[@fraction][:action][~seconds]: the fraction is through a pinned section's scroll, or
//        through the section's own height otherwise.
//                                            [--sections=a,b@0.5,c:action,d~6]
// The site's scenario (tools/scenarios/<site>.mjs) supplies the default sections, its actions and which elements may
// overflow. The report covers console errors, page errors, failed requests, video playback, the audio engine state,
// horizontal overflow and anything the scenario's probe() returns.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const url = positional[0] ?? 'http://localhost:4173/';
const outDir = positional[1] ?? 'tools/out/shots';
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const site = flag('site') ?? 'rakhsh';
const scenario = (await import(`./scenarios/${site}.mjs`)).default;
const only = flag('only');
const sections = (flag('sections') ?? scenario.sections).split(',');
const withSound = args.includes('--sound');

const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => !only || v.name === only);

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  channel: flag('browser'),
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const report = { site, url };

for (const vp of viewports) {
  const { name, ...opts } = vp;
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const issues = [];
  const media = {};
  const probes = {};
  page.on('console', (m) => m.type() === 'error' && issues.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => issues.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.status() >= 400 && issues.push(`http ${r.status()}: ${r.url()}`));

  let n = 0;
  const file = (label) => path.join(outDir, `${name}-${String(n++).padStart(2, '0')}-${label}.png`);

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: file('gate-loading') });
  await page.waitForSelector(scenario.gateReady ?? '[data-gate].is-ready', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: file('gate-ready') });
  // --sound enters with sound and records whether the Web Audio engine actually reached "running".
  await page.click(withSound ? '[data-enter="sound"]' : '[data-enter="mute"]');
  await page.waitForTimeout(scenario.afterEnterMs ?? 3200);
  const audio = await page.evaluate(() => ({ enabled: window.__sound?.enabled ?? null, state: window.__sound?.state ?? null }));

  for (const rawSpec of sections) {
    // "section~6" waits 6 extra seconds before the screenshot (e.g. to catch a later moment of an animation).
    const [spec, extraWait] = rawSpec.split('~');
    const [target, action] = spec.split(':');
    // "id^0.5" puts the section's top half a screen below the top: the moment between two sections.
    const [idFrac, edge] = target.split('^');
    const [id, frac] = idFrac.split('@');
    await page.evaluate(
      ({ id, frac, edge }) => {
        const lenis = window.__lenis;
        const st = window.__st;
        const el = id === 'footer' ? document.querySelector('footer') : document.getElementById(id);
        if (!el) return;
        const trig = st.getById(id);
        let y;
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (frac !== undefined && trig) y = trig.start + (trig.end - trig.start) * Number(frac);
        else if (frac !== undefined) y = top + (el.offsetHeight - window.innerHeight) * Number(frac);
        else y = top;
        if (id === 'footer') y = document.documentElement.scrollHeight;
        if (edge !== undefined) y = top - Number(edge) * window.innerHeight;
        lenis.scrollTo(y, { immediate: true, force: true });
      },
      { id, frac, edge },
    );
    await page.waitForTimeout(1400 + Number(extraWait ?? 0) * 1000);

    if (action) {
      const run = scenario.actions?.[action];
      if (!run) throw new Error(`Unknown action "${action}" for site ${site}`);
      const done = await run({ page, name, id, shot: (suffix) => page.screenshot({ path: file(`${id}-${suffix}`) }) });
      if (done === true) continue;
    }

    const videos = await page.evaluate(() =>
      [...document.querySelectorAll('video')]
        .filter((v) => v.getBoundingClientRect().bottom > 0 && v.getBoundingClientRect().top < innerHeight)
        .map((v) => ({ src: v.currentSrc.split('/').pop(), ready: v.readyState, t: Number(v.currentTime.toFixed(2)), paused: v.paused, error: v.error?.code ?? null })),
    );
    if (videos.length) media[spec] = videos;
    if (scenario.probe) probes[spec] = await page.evaluate(scenario.probe);
    const label = `${id}${frac ? `@${frac}` : ''}${edge ? `^${edge}` : ''}${action ? `-${action}` : ''}${extraWait ? `-t${extraWait}` : ''}`.replace(/[@.^]/g, '_');
    await page.screenshot({ path: file(label) });
  }

  const overflow = await page.evaluate((ignore) => {
    const W = document.documentElement.clientWidth;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: W,
      wide: [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !(ignore && el.closest(ignore));
        })
        .slice(0, 8)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
    };
  }, scenario.overflowIgnore ?? '');
  report[name] = { issues, audio, media, probes, overflow };
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
