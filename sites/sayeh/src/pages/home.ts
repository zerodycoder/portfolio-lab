import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, clamp, finePointer, isNarrow } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { bagImage } from '../art/label';
import type { Preset, Tool } from '../fluid/latte';
import { COFFEES } from '../lib/catalog';
import { cafeStatus } from '../lib/cafe';
import { longDate, money, nextRoast } from '../lib/format';

const ROAST_MIN = 11;
const CRACK = 8.67;
const TP = 1; // turning point (minutes)

/**
 * The roast profile. After charging at 200 °C the probe falls to the turning point (94 °C at 1:00); from there the
 * rate of rise starts gently, peaks, and decays exponentially toward a floor, the classic declining-RoR curve.
 * The decay's size is solved so the beans reach first crack (196 °C) at 8:40; they drop at about 209 °C at 11:00.
 */
const RATE = (() => {
  const tau = 2.8;
  const floor = 4;
  const shape = (t: number): number => (t <= TP ? 0 : Math.min(1, (t - TP) / 0.5) ** 2 * (3 - 2 * Math.min(1, (t - TP) / 0.5)));
  const integrate = (a: number, until: number): number => {
    let v = 94;
    for (let t = TP; t < until; t += 0.005) v += (a * Math.exp(-(t - TP) / tau) + floor) * shape(t) * 0.005;
    return v;
  };
  const one = integrate(1, CRACK) - integrate(0, CRACK);
  const a = (196 - integrate(0, CRACK)) / one;
  return { ror: (t: number): number => (a * Math.exp(-(t - TP) / tau) + floor) * shape(t), table: (() => {
    const out: number[] = [];
    let v = 94;
    for (let i = 0; i <= ROAST_MIN * 100; i++) {
      const t = i / 100;
      if (t <= TP) out.push(94 + 106 * (1 - t / TP) ** 2.2);
      else {
        v += (a * Math.exp(-(t - TP) / tau) + floor) * shape(t) * 0.01;
        out.push(v);
      }
    }
    return out;
  })() };
})();

/** Bean temperature (°C) at t minutes. */
function bt(t: number): number {
  const i = clamp(t, 0, ROAST_MIN) * 100;
  const i0 = Math.floor(i);
  const i1 = Math.min(RATE.table.length - 1, i0 + 1);
  return RATE.table[i0] + (RATE.table[i1] - RATE.table[i0]) * (i - i0);
}

/** Bean colour through the roast: green, yellow, cinnamon, brown, and our light-medium finish. */
const BEAN: [number, [number, number, number]][] = [
  [0, [138, 160, 100]],
  [3.5, [196, 186, 120]],
  [5, [214, 178, 100]],
  [6.5, [176, 122, 69]],
  [8.67, [128, 78, 42]],
  [11, [92, 54, 30]],
];
function beanColor(t: number): string {
  let i = 0;
  while (i < BEAN.length - 2 && t > BEAN[i + 1][0]) i++;
  const [t0, c0] = BEAN[i];
  const [t1, c1] = BEAN[i + 1];
  const k = clamp((t - t0) / (t1 - t0), 0, 1);
  return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(' ')})`;
}

const PHASES = [
  { until: 4.5, name: 'Drying', text: 'The beans give up their water. Grassy steam, no colour yet. We go gently: rush this and the inside never catches up.' },
  { until: CRACK, name: 'Maillard', text: 'Sugars and amino acids start to brown. Bread, then caramel, fills the room. This is where sweetness is made.' },
  { until: 99, name: 'Development', text: 'First crack: the beans pop like popcorn as steam breaks out. From here, every second trades fruit for body. We drop at 209 °C.' },
];

const fmt = (min: number): string => `${Math.floor(min)}:${String(Math.floor((min % 1) * 60)).padStart(2, '0')}`;

const home: PageFactory = (app) => {
  const featured = ['under-the-cedar', 'hambela-shade', 'los-guamos'].map((s) => COFFEES.find((c) => c.slug === s)!);
  const roast = nextRoast();
  const fine = finePointer();
  const hasRoastVideo = !!app.media.roast;
  const hasHands = !!app.media.hands;
  const cafe = app.media.cafe?.day;

  // The roast chart's axes (11 min × 80–220 °C) in a 600×340 box.
  const X = (t: number): number => 40 + (t / ROAST_MIN) * 540;
  const Y = (c: number): number => 310 - ((c - 80) / 140) * 280;
  let path = '';
  for (let t = 0; t <= ROAST_MIN + 1e-6; t += 0.05) path += `${t === 0 ? 'M' : 'L'}${X(t).toFixed(1)} ${Y(bt(t)).toFixed(1)}`;
  let ror = '';
  for (let t = TP; t <= ROAST_MIN + 1e-6; t += 0.1) ror += `${t === TP ? 'M' : 'L'}${X(t).toFixed(1)} ${(310 - (RATE.ror(t) / 40) * 140).toFixed(1)}`;

  return {
    title: 'SAYEH — Shade-grown coffee, Lisbon',
    html: `
<section class="hero" id="pour" aria-label="Pour a latte">
  <div class="cup-scene" data-scene></div>
  <div class="hero__copy">
    <p class="eyebrow mono">Shade-grown coffee · roasted in Lisbon</p>
    <h1 class="hero__title">Pour <br /><em>one.</em></h1>
    <p class="hero__lede">That’s real fluid physics in the cup. ${fine ? 'Hold the mouse' : 'Hold your finger'} on the coffee to pour steamed milk, move while you pour to draw, and watch it spread like the real thing.</p>
  </div>
  <div class="hero__tools" role="toolbar" aria-label="Latte tools">
    <div class="seg" role="radiogroup" aria-label="Tool">
      <button type="button" role="radio" aria-checked="true" data-tool="pour"><i class="ic ic--jug" aria-hidden="true"></i>Pour</button>
      <button type="button" role="radio" aria-checked="false" data-tool="etch"><i class="ic ic--pen" aria-hidden="true"></i>Etch</button>
    </div>
    <div class="presets">
      <span class="mono presets__label">Watch a barista</span>
      <button type="button" class="chip-btn" data-preset="heart">Heart</button>
      <button type="button" class="chip-btn" data-preset="rosetta">Rosetta</button>
      <button type="button" class="chip-btn" data-preset="tulip">Tulip</button>
    </div>
    <div class="hero__cupctl">
      <div class="jug" data-jug role="meter" aria-label="Milk left in the jug" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span class="jug__fill"></span></div>
      <button type="button" class="chip-btn chip-btn--solid" data-newcup>New cup</button>
    </div>
  </div>
  <div class="hero__score" data-score aria-live="polite"></div>
  <p class="hero__nogl" data-nogl hidden>This browser can’t run the milk simulation, so the cup stays black. Try a recent Chrome, Safari or Firefox.</p>
</section>

<section class="story" id="shade">
  <div class="story__text">
    <p class="eyebrow mono">Sayeh: Persian for shade</p>
    <h2 class="h2">Coffee was born<br />in the <em>shade.</em></h2>
    <p>Wild Arabica grew under the forest canopy of southwest Ethiopia long before anyone planted it in rows. Shade slows the cherry down: it ripens later, makes more sugar, and the forest above keeps the soil alive and the birds in it.</p>
    <p>Most of the world’s coffee is now grown in full sun because it yields more. We only buy from farms that kept their trees. Four of them, on three continents.</p>
    <a class="link-arrow" href="/origins">Meet the four farms</a>
  </div>
  <figure class="story__media ${hasHands ? '' : 'is-drawn'}" data-parallax>
    ${hasHands ? `<img src="${app.media.hands}" alt="Hands holding freshly picked red and yellow coffee cherries" loading="lazy" />` : '<div class="cherries" aria-hidden="true">' + Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('') + '</div>'}
    <figcaption class="mono">Ripe cherries, picked one by one</figcaption>
  </figure>
  <ul class="stats">
    <li><b class="stat" data-count="4">0</b><span>farms, every one shade-grown</span></li>
    <li><b class="stat" data-count="2250" data-unit=" m">0</b><span>our highest coffee grows at</span></li>
    <li><b class="stat" data-count="2">0</b><span>roast days a week, Monday and Thursday</span></li>
  </ul>
</section>

<section class="roast" id="roast" aria-label="How we roast">
  <div class="roast__pin">
    <div class="roast__media">
      ${hasRoastVideo ? ` <video data-roast-video muted playsinline loop preload="none" ${app.media.roast!.poster ? `poster="${app.media.roast!.poster}"` : ''}><source src="${isNarrow() && app.media.roast!.mp4Small ? app.media.roast!.mp4Small : app.media.roast!.mp4}" type="video/mp4" /></video>` : '<canvas class="roast__beans" data-beans aria-hidden="true"></canvas>'}
    </div>
    <div class="roast__panel">
      <p class="eyebrow mono">Roasted slowly, by ear</p>
      <h2 class="h2 roast__title">Eleven minutes,<br /><em>one crack.</em></h2>
      <div class="roast__readouts mono">
        <span><small>Time</small><b data-r-time>0:00</b></span>
        <span><small>Bean temp</small><b data-r-temp>200 °C</b></span>
        <span><small>Rate of rise</small><b data-r-ror>—</b></span>
        <span class="roast__bean"><small>Colour</small><i data-r-bean></i></span>
      </div>
      <svg class="roast__chart" viewBox="0 0 600 340" role="img" aria-label="Bean temperature rising through an eleven-minute roast, with first crack at 8 minutes 40 seconds">
        <rect class="band band--dry" x="${X(0)}" y="30" width="${X(4.5) - X(0)}" height="280" />
        <rect class="band band--mai" x="${X(4.5)}" y="30" width="${X(CRACK) - X(4.5)}" height="280" />
        <rect class="band band--dev" x="${X(CRACK)}" y="30" width="${X(ROAST_MIN) - X(CRACK)}" height="280" />
        <text class="band__label" x="${X(0) + 8}" y="48">Drying</text>
        <text class="band__label" x="${X(4.5) + 8}" y="48">Maillard</text>
        <text class="band__label" x="${X(CRACK) + 8}" y="48">Dev.</text>
        ${[100, 140, 180, 220].map((c) => `<line class="grid" x1="40" x2="580" y1="${Y(c)}" y2="${Y(c)}" /><text class="axis" x="34" y="${Y(c) + 4}" text-anchor="end">${c}°</text>`).join('')}
        ${[0, 2, 4, 6, 8, 10].map((m) => `<text class="axis" x="${X(m)}" y="330" text-anchor="middle">${m}:00</text>`).join('')}
        <path class="ror ror--ghost" d="${ror}" />
        <clipPath id="roast-clip"><rect data-r-clip x="0" y="0" width="40" height="340" /></clipPath>
        <path class="curve curve--ghost" d="${path}" />
        <path class="ror ror--live" d="${ror}" clip-path="url(#roast-clip)" />
        <path class="curve" d="${path}" clip-path="url(#roast-clip)" />
        <line class="crack" x1="${X(CRACK)}" x2="${X(CRACK)}" y1="30" y2="310" />
        <text class="crack__label" x="${X(CRACK) - 6}" y="${Y(196) - 16}" text-anchor="end" data-r-cracklabel>First crack · 196°</text>
        <circle class="dot" data-r-dot r="6" cx="${X(0)}" cy="${Y(200)}" />
      </svg>
      <p class="roast__legend mono"><i class="k-bt"></i>Bean temperature <i class="k-ror"></i>Rate of rise, °C per minute</p>
      <div class="roast__phase" data-r-phase>
        <p class="mono" data-r-phasename>Drying</p>
        <p data-r-phasetext>${PHASES[0].text}</p>
      </div>
    </div>
  </div>
</section>

<section class="featured" id="coffees">
  <div class="section-head">
    <p class="eyebrow mono">On the shelf this week</p>
    <h2 class="h2">Roasted on <em>${longDate(roast)}.</em></h2>
    <p class="section-head__aside">Order before noon on a roast day and it ships that afternoon.</p>
  </div>
  <ul class="bag-row">
    ${featured
      .map(
        (c) => `<li><a class="bag-card" href="/shop/${c.slug}" data-tilt>
        <img class="bag-card__img" src="${bagImage(c, 300)}" alt="${c.name} coffee bag" width="300" height="408" style="view-transition-name: bag-${c.slug}" />
        <span class="bag-card__body"><b>${c.name}</b><small>${c.line}</small><span class="mono">${c.notes.join(' · ')}</span><em class="mono">from ${money(c.price[0])}</em></span>
      </a></li>`,
      )
      .join('')}
  </ul>
  <a class="btn btn--ghost" href="/shop">All six coffees</a>
</section>

<section class="teasers">
  <a class="teaser teaser--lab" href="/lab">
    <svg class="mini-chart" viewBox="0 0 220 160" aria-hidden="true">
      <rect class="mini-chart__ideal" x="80" y="40" width="60" height="44" />
      ${[0, 1, 2, 3].map((i) => `<line x1="20" x2="200" y1="${20 + i * 40}" y2="${20 + i * 40}" />`).join('')}
      <path class="mini-chart__trail" d="M40 130 C 70 120, 85 100, 110 64" />
      <circle class="mini-chart__dot" cx="110" cy="64" r="7" />
    </svg>
    <span><p class="eyebrow mono">Brew Lab</p><b class="h3">Your kitchen is a lab.</b><span>Grind, dose, water and time in, extraction and strength out, plotted on the barista’s control chart.</span><em class="link-arrow">Dial in a brew</em></span>
  </a>
  <a class="teaser teaser--visit" href="/visit">
    <span class="teaser__photo ${cafe ? '' : 'is-drawn'}">${cafe ? `<img src="${cafe}" alt="Inside the SAYEH café in Lisbon" loading="lazy" />` : '<i class="window" aria-hidden="true"></i>'}</span>
    <span><p class="eyebrow mono">Visit</p><b class="h3">Under the cedar, Príncipe Real.</b><span class="status" data-status></span><em class="link-arrow">Hours, menu, directions</em></span>
  </a>
</section>`,

    mount(root) {
      const cup = app.cup;
      const scene = $('[data-scene]', root);
      cup.attach(scene);
      if (!cup.supported) $('[data-nogl]', root).hidden = false;
      const ctx = gsap.context(() => undefined, root);
      const offs: (() => void)[] = [];

      // Tools.
      const toolBtns = $$<HTMLButtonElement>('[data-tool]', root);
      const setTool = (t: Tool): void => {
        cup.setTool(t);
        toolBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === t)));
        root.querySelector('.hero')?.setAttribute('data-tool', t);
      };
      toolBtns.forEach((b) =>
        b.addEventListener('click', () => {
          setTool(b.dataset.tool as Tool);
          app.sound.press();
        }),
      );
      setTool(cup.tool);
      $$<HTMLButtonElement>('[data-preset]', root).forEach((b) =>
        b.addEventListener('click', () => {
          setTool('pour');
          cup.newCup();
          window.setTimeout(() => cup.play(b.dataset.preset as Preset), 450);
          scoreEl.classList.remove('is-shown');
        }),
      );
      $('[data-newcup]', root).addEventListener('click', () => {
        cup.newCup();
        scoreEl.classList.remove('is-shown');
        jug.classList.remove('is-empty');
      });

      const jug = $('[data-jug]', root);
      const scoreEl = $('[data-score]', root);
      const presetBtns = $$<HTMLButtonElement>('[data-preset], [data-newcup]', root);
      let userPoured = false;
      offs.push(
        cup.on((e) => {
          switch (e.type) {
            case 'milk':
              jug.style.setProperty('--p', e.left.toFixed(3));
              jug.setAttribute('aria-valuenow', String(Math.round(e.left * 100)));
              break;
            case 'empty':
              jug.classList.add('is-empty');
              app.coach.say('The jug is empty. Press <b>New cup</b> for another.');
              break;
            case 'busy':
              presetBtns.forEach((b) => (b.disabled = e.busy));
              break;
            case 'pour':
              if (e.hand) {
                userPoured = true;
                app.coach.done('pour');
                app.stamps.give('pour');
              }
              break;
            case 'etch':
              app.stamps.give('etch');
              app.coach.done('etch');
              break;
            case 'swirl':
              app.stamps.give('swirl');
              app.coach.done('swirl');
              break;
            case 'score': {
              const s = e.score;
              const good = s.grade.startsWith('A');
              scoreEl.innerHTML = `<p class="score__grade"><span class="mono">${e.hand ? 'Your pour' : 'Barista pour'}</span><b>${s.grade}</b></p>
                <dl class="score__bars mono">
                  <div><dt>Symmetry</dt><dd><i style="--v:${s.symmetry.toFixed(3)}"></i>${Math.round(s.symmetry * 100)}</dd></div>
                  <div><dt>Contrast</dt><dd><i style="--v:${s.contrast.toFixed(3)}"></i>${Math.round(s.contrast * 100)}</dd></div>
                  <div><dt>Foam</dt><dd><i style="--v:${s.coverage.toFixed(3)}"></i>${Math.round(s.coverage * 100)}%</dd></div>
                </dl>
                <p class="score__verdict">${e.hand ? s.verdict : 'Now you try. The dashed line is the mirror axis it found.'}</p>`;
              scoreEl.classList.add('is-shown');
              if (e.hand && good) {
                app.stamps.give('grade');
                app.sound.bright();
              }
              if (e.hand) {
                app.coach.hint('etch', 'Try <b>Etch</b>: drag through the foam to draw a line.', 3500, () => !app.stamps.has('etch'));
                app.coach.hint('swirl', fine ? 'Drag circles on the saucer to <b>swirl</b> the cup.' : '<b>Twist two fingers</b> on the coffee to swirl it, or tilt your phone.', 9000, () => !app.stamps.has('swirl'));
              }
              break;
            }
          }
        }),
      );

      // After the gate (or straight away when arriving from another page): a barista pours a heart, then it's yours.
      let alive = true;
      void app.entered.then(() => {
        if (!alive || !cup.supported) return;
        if (!cup.latte!.fluid.coverage && !userPoured && !sessionStorage.getItem('sayeh.demo')) {
          try {
            sessionStorage.setItem('sayeh.demo', '1');
          } catch {
            /* private mode */
          }
          window.setTimeout(() => alive && cup.play('heart'), 500);
          app.coach.hint('pour', fine ? 'Your turn: <b>hold the mouse on the coffee</b> to pour.' : 'Your turn: <b>hold your finger on the coffee</b> to pour.', 6200, () => !userPoured);
        } else app.coach.hint('pour', fine ? '<b>Hold the mouse on the coffee</b> to pour milk.' : '<b>Hold your finger on the coffee</b> to pour milk.', 4000, () => !userPoured);
      });

      ctx.add(() => {
        // Story: parallax and counters.
        const media = root.querySelector('[data-parallax]');
        if (media && !app.reduced) gsap.fromTo(media, { yPercent: 8 }, { yPercent: -8, ease: 'none', scrollTrigger: { trigger: media, start: 'top bottom', end: 'bottom top', scrub: true } });
        $$('[data-count]', root).forEach((el) => {
          const to = Number(el.dataset.count);
          const unit = el.dataset.unit ?? '';
          ScrollTrigger.create({
            trigger: el,
            start: 'top 85%',
            once: true,
            onEnter: () => {
              const o = { v: 0 };
              gsap.to(o, { v: to, duration: app.reduced ? 0 : 1.4, ease: 'power2.out', onUpdate: () => (el.textContent = `${Math.round(o.v).toLocaleString('en-US')}${unit}`) });
            },
          });
        });

        // The roast: a pinned section whose scroll is the roast clock.
        const pin = $('.roast__pin', root);
        const clip = $<SVGRectElement>('[data-r-clip]', root);
        const dot = $<SVGCircleElement>('[data-r-dot]', root);
        const timeEl = $('[data-r-time]', root);
        const tempEl = $('[data-r-temp]', root);
        const rorEl = $('[data-r-ror]', root);
        const bean = $('[data-r-bean]', root);
        const phaseName = $('[data-r-phasename]', root);
        const phaseText = $('[data-r-phasetext]', root);
        const section = $('.roast', root);
        const video = root.querySelector<HTMLVideoElement>('[data-roast-video]');
        const beans = root.querySelector<HTMLCanvasElement>('[data-beans]');
        const drawBeans = beans ? beanTumbler(beans) : null;
        let phase = 0;
        let cracked = false;
        const show = (p: number): void => {
          const t = p * ROAST_MIN;
          const temp = bt(t);
          const x = X(t);
          const y = Y(temp);
          dot.setAttribute('cx', x.toFixed(1));
          dot.setAttribute('cy', y.toFixed(1));
          clip.setAttribute('width', x.toFixed(1));
          timeEl.textContent = fmt(t);
          tempEl.textContent = `${Math.round(temp)} °C`;
          rorEl.textContent = t > TP + 0.1 ? `${RATE.ror(t).toFixed(1)} °/min` : '—';
          const c = beanColor(t);
          bean.style.background = c;
          section.style.setProperty('--bean', c);
          drawBeans?.(t / ROAST_MIN, c);
          const ph = PHASES.findIndex((q) => t < q.until);
          if (ph !== phase) {
            phase = ph;
            phaseName.textContent = PHASES[ph].name;
            phaseText.textContent = PHASES[ph].text;
            gsap.fromTo('[data-r-phase]', { autoAlpha: 0.2, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4 });
          }
          const over = t >= CRACK;
          section.classList.toggle('is-cracked', over);
          if (over && !cracked) {
            cracked = true;
            app.sound.crack(1);
            app.stamps.give('crack');
            gsap.fromTo('[data-r-cracklabel]', { scale: 1.3, transformOrigin: 'right center' }, { scale: 1, duration: 0.6, ease: 'back.out(3)' });
          }
          if (!over) cracked = false;
        };
        show(0);
        ScrollTrigger.create({
          id: 'roast',
          trigger: section,
          start: 'top top',
          end: () => `+=${window.innerHeight * 2.2}`,
          pin,
          scrub: 0.6,
          onUpdate: (st) => show(st.progress),
          onToggle: (st) => {
            if (!video) return;
            if (st.isActive) void video.play().catch(() => undefined);
            else video.pause();
          },
        });

        // Bags tilt toward the pointer.
        if (fine)
          $$('[data-tilt]', root).forEach((card) => {
            const img = $('img', card);
            card.addEventListener('pointermove', (e) => {
              const r = card.getBoundingClientRect();
              const x = (e.clientX - r.left) / r.width - 0.5;
              const y = (e.clientY - r.top) / r.height - 0.5;
              gsap.to(img, { rotateY: x * 14, rotateX: -y * 10, duration: 0.4, ease: 'power2.out' });
            });
            card.addEventListener('pointerleave', () => gsap.to(img, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' }));
          });
      });

      // The visit teaser's live status.
      const status = $('[data-status]', root);
      const tick = (): void => {
        const s = cafeStatus();
        status.innerHTML = `<i class="dot ${s.open ? 'is-open' : ''}"></i>${s.line}`;
      };
      tick();
      const statusTimer = window.setInterval(tick, 30_000);

      return () => {
        alive = false;
        window.clearInterval(statusTimer);
        offs.forEach((f) => f());
        ctx.revert();
        cup.detach();
        app.coach.cancel();
      };
    },
  };
};

/**
 * Without the roastery film: a drum of beans drawn in code, tumbling, their colour following the roast clock.
 */
function beanTumbler(canvas: HTMLCanvasElement): (p: number, color: string) => void {
  const ctx = canvas.getContext('2d')!;
  const beans = Array.from({ length: 70 }, (_, i) => ({ a: (i / 70) * Math.PI * 2 + Math.random() * 0.3, r: 0.3 + Math.random() * 0.62, rot: Math.random() * Math.PI, s: 0.8 + Math.random() * 0.5 }));
  return (p, color) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.3);
    glow.addColorStop(0, `rgba(255,150,60,${0.18 + p * 0.2})`);
    glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,220,180,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    const spin = p * Math.PI * 9;
    beans.forEach((b) => {
      const a = b.a + spin * (0.6 + b.r * 0.4);
      // Beans pile toward the bottom of the turning drum.
      const x = cx + Math.cos(a) * R * b.r;
      const y = cy + Math.abs(Math.sin(a)) * R * b.r * 0.9 + R * 0.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(b.rot + a);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 * b.s, 10 * b.s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -8 * b.s);
      ctx.quadraticCurveTo(3 * b.s, 0, 0, 8 * b.s);
      ctx.stroke();
      ctx.restore();
    });
  };
}

export default home;
