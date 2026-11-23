import { gsap } from 'gsap';
import { $, $$, isNarrow } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { bySlug } from '../lib/catalog';
import { brew, defaults, method, METHODS, steps, type MethodId, type Recipe, type Result } from '../lab/model';
import { mountShot, shotHud } from '../ui/shot';

const STORE = 'sayeh.lab.v1';

/** Chart geometry (SVG units). */
const CW = 440;
const CH = 360;
const M = { l: 52, r: 16, t: 18, b: 44 };
const EY = [14, 26] as const;

const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function grindName(id: MethodId, g: number): string {
  if (g < 250) return 'Espresso fine';
  if (g < 450) return id === 'espresso' ? 'Coarse for espresso' : 'Fine';
  if (g < 700) return 'Medium-fine';
  if (g < 900) return 'Medium';
  if (g < 1150) return 'Medium-coarse';
  return 'Coarse';
}

function load(): Recipe | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Recipe | null;
    return raw && METHODS.some((m) => m.id === raw.method) ? raw : null;
  } catch {
    return null;
  }
}

const lab: PageFactory = (app, _params, query) => {
  const coffee = bySlug(query.get('coffee') ?? '');
  const fromCoffee: MethodId | null = coffee ? (/espresso/i.test(coffee.best) && !/press/i.test(coffee.best) ? 'espresso' : /press/i.test(coffee.best) ? 'press' : 'pourover') : null;
  let recipe: Recipe = fromCoffee ? defaults(fromCoffee) : (load() ?? defaults('pourover'));
  const film = app.media.espresso;
  const slider = (key: string, label: string): string => `
    <label class="slider" data-slider="${key}">
      <span class="slider__top"><span>${label}</span><b class="mono" data-val="${key}"></b></span>
      <input type="range" data-input="${key}" />
      ${key === 'grind' ? '<span class="grind-scale" data-grind-scale aria-hidden="true"></span>' : ''}
    </label>`;

  return {
    title: 'Brew Lab — SAYEH',
    html: `
<section class="page-head lab-head" id="lab-head">
  <div>
    <p class="eyebrow mono">Brew Lab</p>
    <h1 class="h1">Your kitchen<br />is a <em>lab.</em></h1>
    <p class="lede">Baristas judge a brew by two numbers: how much of the coffee dissolved (extraction) and how strong the cup is (TDS). Move the dials and watch your brew travel across the chart they use, toward the sweet spot.</p>
    ${coffee ? `<p class="lab-coffee"><span class="tag">Brewing ${coffee.name}</span> <a class="mono" href="/shop/${coffee.slug}">back to the bag</a></p>` : ''}
  </div>
  <figure class="lab-film ${film ? '' : 'is-drawn'}" data-shot>
    ${film ? `<video data-shot-video muted playsinline preload="none" poster="${film.poster ?? ''}"><source src="${isNarrow() && film.mp4Small ? film.mp4Small : film.mp4}" type="video/mp4" /></video>${shotHud(true)}` : '<i class="lab-film__drip" aria-hidden="true"></i>'}
    <figcaption class="mono"><span>Espresso: 18 g in · 36 g out · 28 s</span>${film ? '<button type="button" class="link-btn" data-shot-again>Pull another</button>' : ''}</figcaption>
  </figure>
</section>

<section class="wrap lab" id="lab" data-lab>
  <div class="methods" role="tablist" aria-label="Brew method">
    ${METHODS.map((m) => `<button type="button" role="tab" class="method" data-method="${m.id}" aria-selected="false">${m.name}</button>`).join('')}
  </div>
  <div class="lab__grid">
    <div class="card lab__controls">
      ${slider('dose', 'Coffee')}
      ${slider('ratio', 'Ratio')}
      ${slider('grind', 'Grind')}
      <label class="slider" data-slider="temp">
        <span class="slider__top"><span>Water</span><b class="temp-num" data-temp-num></b></span>
        <input type="range" data-input="temp" />
      </label>
      ${slider('time', 'Steep')}
      <dl class="derived mono" data-derived></dl>
      <p class="lab__note" data-note></p>
      <button type="button" class="link-btn mono" data-reset>Reset this method</button>
    </div>
    <div class="card lab__chart">
      <p class="card__label mono">Brewing control chart</p>
      <svg viewBox="0 0 ${CW} ${CH}" data-chart role="img" aria-label="Brewing control chart: extraction yield across, strength up"></svg>
      <p class="chart-readout" aria-live="polite"><b data-readout-title></b><span class="mono" data-readout></span></p>
    </div>
    <div class="card lab__result">
      <div class="result__top">
        <div class="cup-preview" data-cup aria-hidden="true"><i></i></div>
        <div class="result__nums">
          <p><small class="mono">Extraction</small><b data-ey></b></p>
          <p><small class="mono">Strength (TDS)</small><b data-tds></b></p>
        </div>
      </div>
      <p class="result__title h3" data-title></p>
      <p class="result__advice" data-advice></p>
      <svg class="radar" viewBox="0 0 220 200" data-radar aria-label="Taste profile"></svg>
    </div>
  </div>

  <div class="card timer" id="timer" data-timer>
    <div class="timer__dial">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="timer__track" cx="60" cy="60" r="52" /><circle class="timer__prog" data-ring cx="60" cy="60" r="52" /></svg>
      <b class="mono" data-clock>0:00</b>
    </div>
    <div class="timer__body">
      <p class="eyebrow mono">Brew along</p>
      <ol class="timer__steps" data-steps></ol>
      <div class="timer__btns">
        <button type="button" class="btn btn--solid" data-start>Start the timer</button>
        <button type="button" class="btn btn--ghost" data-stop>Reset</button>
      </div>
    </div>
  </div>

  <aside class="lab__cta">
    <p class="h3" data-cta-text></p>
    <a class="btn btn--solid" href="/shop" data-cta>Shop coffee</a>
  </aside>
</section>`,

    mount(root) {
      const lab = $('[data-lab]', root);
      const chart = $<SVGSVGElement>('[data-chart]', root);
      const radar = $<SVGSVGElement>('[data-radar]', root);
      const trail: [number, number][] = [];
      let touched = false;
      let res: Result = brew(recipe);

      const inputs = (key: string): HTMLInputElement => $<HTMLInputElement>(`[data-input="${key}"]`, root);

      // ---- chart scaffolding per method ----
      let X = (ey: number): number => ey;
      let Y = (tds: number): number => tds;
      const drawChart = (): void => {
        const m = method(recipe.method);
        X = (ey) => M.l + ((ey - EY[0]) / (EY[1] - EY[0])) * (CW - M.l - M.r);
        Y = (tds) => CH - M.b - ((tds - m.tds.lo) / (m.tds.hi - m.tds.lo)) * (CH - M.t - M.b);
        const xs = [14, 16, 18, 20, 22, 24, 26];
        const step = recipe.method === 'espresso' ? 2 : 0.2;
        const ys: number[] = [];
        for (let v = m.tds.lo; v <= m.tds.hi + 1e-6; v += step) ys.push(Math.round(v * 100) / 100);
        const [i0, i1] = m.tds.ideal;
        chart.innerHTML = `
          ${xs.map((x) => `<line class="cc-grid" x1="${X(x)}" x2="${X(x)}" y1="${M.t}" y2="${CH - M.b}" /><text class="cc-axis" x="${X(x)}" y="${CH - M.b + 18}" text-anchor="middle">${x}%</text>`).join('')}
          ${ys.map((y) => `<line class="cc-grid" x1="${M.l}" x2="${CW - M.r}" y1="${Y(y)}" y2="${Y(y)}" /><text class="cc-axis" x="${M.l - 8}" y="${Y(y) + 4}" text-anchor="end">${recipe.method === 'espresso' ? y : y.toFixed(1)}%</text>`).join('')}
          <rect class="cc-band" x="${X(18)}" y="${M.t}" width="${X(22) - X(18)}" height="${CH - M.t - M.b}" />
          <rect class="cc-band" x="${M.l}" y="${Y(i1)}" width="${CW - M.l - M.r}" height="${Y(i0) - Y(i1)}" />
          <rect class="cc-ideal" x="${X(18)}" y="${Y(i1)}" width="${X(22) - X(18)}" height="${Y(i0) - Y(i1)}" rx="4" />
          <text class="cc-ideal-label" x="${(X(18) + X(22)) / 2}" y="${Y(i1) - 7}" text-anchor="middle">Sweet spot</text>
          <text class="cc-zone" x="${M.l + 8}" y="${M.t + 16}">Strong · sour</text>
          <text class="cc-zone" x="${CW - M.r - 8}" y="${M.t + 16}" text-anchor="end">Strong · bitter</text>
          <text class="cc-zone" x="${M.l + 8}" y="${CH - M.b - 10}">Weak · sour</text>
          <text class="cc-zone" x="${CW - M.r - 8}" y="${CH - M.b - 10}" text-anchor="end">Weak · bitter</text>
          <text class="cc-title" x="${(M.l + CW - M.r) / 2}" y="${CH - 6}" text-anchor="middle">Extraction yield →</text>
          <text class="cc-title" transform="translate(14 ${(M.t + CH - M.b) / 2}) rotate(-90)" text-anchor="middle">Strength (TDS) →</text>
          <polyline class="cc-trail" data-trail points="" />
          <circle class="cc-dot" data-dot r="9" cx="0" cy="0" />`;
        trail.length = 0;
      };

      // ---- radar ----
      const AXES: [keyof Result['taste'], string][] = [
        ['acidity', 'Acidity'],
        ['sweetness', 'Sweetness'],
        ['body', 'Body'],
        ['bitterness', 'Bitterness'],
        ['clarity', 'Clarity'],
      ];
      const RC = { x: 110, y: 104, r: 70 };
      const pt = (i: number, v: number): [number, number] => {
        const a = -Math.PI / 2 + (i / AXES.length) * Math.PI * 2;
        return [RC.x + Math.cos(a) * RC.r * v, RC.y + Math.sin(a) * RC.r * v];
      };
      radar.innerHTML = `${[0.33, 0.66, 1].map((k) => `<polygon class="rd-ring" points="${AXES.map((_, i) => pt(i, k).join(',')).join(' ')}" />`).join('')}
        ${AXES.map((_, i) => `<line class="rd-axis" x1="${RC.x}" y1="${RC.y}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" />`).join('')}
        ${AXES.map(([, label], i) => {
          const [x, y] = pt(i, 1.2);
          return `<text class="rd-label" x="${x}" y="${y + 4}" text-anchor="middle">${label}</text>`;
        }).join('')}
        <polygon class="rd-shape" data-shape points="" />`;
      const shape = $<SVGPolygonElement>('[data-shape]', radar);
      const shapeState = { v: AXES.map(() => 0.5) };

      // ---- controls ----
      const setupSliders = (): void => {
        const m = method(recipe.method);
        const cfg: Record<string, { min: number; max: number; step: number }> = { dose: m.dose, ratio: m.ratio, grind: m.grind, temp: m.temp };
        if (m.time) cfg.time = m.time;
        $$('[data-slider="time"]', root)[0].hidden = !m.time;
        $$('[data-slider="ratio"] .slider__top span', root)[0].textContent = recipe.method === 'espresso' ? 'Ratio (out : in)' : 'Ratio (water : coffee)';
        for (const [k, c] of Object.entries(cfg)) {
          const el = inputs(k);
          el.min = String(c.min);
          el.max = String(c.max);
          el.step = String(c.step);
          el.value = String(recipe[k as keyof Recipe]);
        }
        $('[data-note]', root).textContent = m.note;
        $$<HTMLButtonElement>('[data-method]', root).forEach((b) => {
          b.classList.toggle('is-on', b.dataset.method === recipe.method);
          b.setAttribute('aria-selected', String(b.dataset.method === recipe.method));
        });
        drawChart();
      };

      const render = (animate: boolean): void => {
        const m = method(recipe.method);
        res = brew(recipe);
        const val = (k: string, text: string): void => {
          $(`[data-val="${k}"]`, root).textContent = text;
        };
        val('dose', `${recipe.dose} g`);
        val('ratio', recipe.method === 'espresso' ? `1 : ${recipe.ratio.toFixed(2)}` : `1 : ${recipe.ratio.toFixed(1)}`);
        val('grind', `${recipe.grind} µm · ${grindName(recipe.method, recipe.grind)}`);
        if (m.time) val('time', fmtTime(recipe.time));
        // Hotter water, bolder and sharper numerals; cooler, lighter and softer (Fraunces' weight and SOFT axes).
        const t = (recipe.temp - 75) / 25;
        const temp = $('[data-temp-num]', root);
        temp.textContent = `${recipe.temp}°C`;
        temp.style.fontVariationSettings = `'wght' ${Math.round(300 + t * 600)}, 'SOFT' ${Math.round(100 - t * 100)}, 'opsz' 48`;
        temp.style.color = `color-mix(in srgb, #c0462a ${Math.round(t * 100)}%, #4a7aa8)`;
        // Particle size: dots sized like the grounds.
        const scale = $('[data-grind-scale]', root);
        const n = Math.round(14 - ((recipe.grind - m.grind.min) / (m.grind.max - m.grind.min)) * 8);
        scale.innerHTML = Array.from({ length: n }, () => `<i style="width:${(2 + recipe.grind / 160).toFixed(1)}px;height:${(2 + recipe.grind / 160).toFixed(1)}px"></i>`).join('');

        const derived = $('[data-derived]', root);
        const water = Math.round(res.water);
        derived.innerHTML =
          recipe.method === 'espresso'
            ? `<div><dt>Shot out</dt><dd>${water} g</dd></div><div><dt>Shot time</dt><dd>${res.time.toFixed(0)} s</dd></div>`
            : `<div><dt>Water</dt><dd>${water} g</dd></div><div><dt>${m.time ? 'Steep' : 'Brew time'}</dt><dd>${fmtTime(res.time)}</dd></div><div><dt>In the cup</dt><dd>${Math.round(res.beverage)} g</dd></div>`;

        $('[data-ey]', root).textContent = `${res.ey.toFixed(1)}%`;
        $('[data-tds]', root).textContent = `${res.tds.toFixed(recipe.method === 'espresso' ? 1 : 2)}%`;
        $('[data-title]', root).textContent = res.title;
        $('[data-readout-title]', root).textContent = res.title;
        $('[data-readout]', root).textContent = `EY ${res.ey.toFixed(1)}% · TDS ${res.tds.toFixed(recipe.method === 'espresso' ? 1 : 2)}%`;
        $('[data-advice]', root).textContent = res.advice;
        lab.classList.toggle('is-ideal', res.ideal);

        // The cup darkens with strength.
        const strength = (res.tds - m.tds.lo) / (m.tds.hi - m.tds.lo);
        const cup = $('[data-cup] i', root);
        cup.style.background =
          recipe.method === 'espresso'
            ? `radial-gradient(circle at 40% 38%, #c98a4b, #6a3a18 ${60 + strength * 20}%, #2a1408)`
            : `radial-gradient(circle at 40% 38%, color-mix(in srgb, #b7743a ${Math.round(100 - strength * 60)}%, #2a1206), color-mix(in srgb, #6a3412 ${Math.round(100 - strength * 50)}%, #120804))`;

        // Chart dot and trail.
        const cx = Math.max(M.l, Math.min(CW - M.r, X(res.ey)));
        const cy = Math.max(M.t, Math.min(CH - M.b, Y(res.tds)));
        trail.push([cx, cy]);
        if (trail.length > 14) trail.shift();
        $('[data-trail]', chart).setAttribute('points', trail.map((p) => p.join(',')).join(' '));
        const dot = $('[data-dot]', chart);
        if (animate) gsap.to(dot, { attr: { cx, cy }, duration: 0.35, ease: 'power2.out' });
        else gsap.set(dot, { attr: { cx, cy } });
        dot.classList.toggle('is-ideal', res.ideal);

        // Radar.
        const target = AXES.map(([k]) => 0.12 + res.taste[k] * 0.88);
        gsap.to(shapeState.v, {
          ...Object.fromEntries(target.map((v, i) => [i, v])),
          duration: animate ? 0.4 : 0,
          onUpdate: () => shape.setAttribute('points', shapeState.v.map((v, i) => pt(i, v).join(',')).join(' ')),
        });

        // Shop the right grind.
        const grind = recipe.method === 'espresso' ? 'Espresso' : recipe.method === 'press' ? 'French press' : 'Filter';
        $('[data-cta-text]', root).innerHTML = `Brewing ${m.name.toLowerCase()}? Order any coffee ground for <em>${grind.toLowerCase()}</em>, or whole bean.`;
        $<HTMLAnchorElement>('[data-cta]', root).href = coffee ? `/shop/${coffee.slug}` : recipe.method === 'espresso' ? '/shop?filter=espresso' : '/shop?filter=bright';

        renderSteps();
        try {
          localStorage.setItem(STORE, JSON.stringify(recipe));
        } catch {
          /* private mode */
        }
        if (touched && res.ideal) app.stamps.give('sweet');
      };

      $$<HTMLInputElement>('[data-input]', root).forEach((el) =>
        el.addEventListener('input', () => {
          const k = el.dataset.input as keyof Recipe;
          (recipe as Record<string, unknown>)[k] = Number(el.value);
          touched = true;
          const m = method(recipe.method);
          const range = m[k as 'dose'] ?? m.time!;
          app.sound.detent((Number(el.value) - range.min) / (range.max - range.min));
          render(true);
        }),
      );
      $$<HTMLButtonElement>('[data-method]', root).forEach((b) =>
        b.addEventListener('click', () => {
          if (b.dataset.method === recipe.method) return;
          recipe = defaults(b.dataset.method as MethodId);
          stopTimer();
          setupSliders();
          render(false);
          app.sound.press();
        }),
      );
      $('[data-reset]', root).addEventListener('click', () => {
        recipe = defaults(recipe.method);
        setupSliders();
        render(false);
        app.sound.press();
      });

      // ---- brew-along timer ----
      const ring = $<SVGCircleElement>('[data-ring]', root);
      const clockEl = $('[data-clock]', root);
      const stepsEl = $('[data-steps]', root);
      const startBtn = $<HTMLButtonElement>('[data-start]', root);
      const C = 2 * Math.PI * 52;
      ring.style.strokeDasharray = `${C}`;
      ring.style.strokeDashoffset = `${C}`;
      let timer = 0;
      let t0 = 0;
      let elapsed = 0;
      let rung = -1;
      let running = false;
      const list = (): { at: number; text: string }[] => steps(recipe, res);
      function renderSteps(): void {
        if (running) return;
        stepsEl.innerHTML = list()
          .map((s) => `<li><span class="mono">${fmtTime(s.at)}</span>${s.text}</li>`)
          .join('');
      }
      const tick = (): void => {
        elapsed = (performance.now() - t0) / 1000;
        const all = list();
        const total = all[all.length - 1].at;
        clockEl.textContent = fmtTime(Math.min(elapsed, total));
        ring.style.strokeDashoffset = `${C * (1 - Math.min(1, elapsed / total))}`;
        let current = -1;
        all.forEach((s, i) => {
          if (elapsed >= s.at) current = i;
        });
        if (current !== rung) {
          rung = current;
          $$('li', stepsEl).forEach((li, i) => {
            li.classList.toggle('is-now', i === current);
            li.classList.toggle('is-done', i < current);
          });
          app.sound.chime(current);
        }
        if (elapsed >= total) {
          running = false;
          window.clearInterval(timer);
          startBtn.textContent = 'Brew again';
          app.toast('Done. Pour it and taste.');
          return;
        }
      };
      function stopTimer(): void {
        running = false;
        window.clearInterval(timer);
        rung = -1;
        clockEl.textContent = '0:00';
        ring.style.strokeDashoffset = `${C}`;
        startBtn.textContent = 'Start the timer';
        renderSteps();
      }
      startBtn.addEventListener('click', () => {
        stopTimer();
        running = true;
        t0 = performance.now();
        startBtn.textContent = 'Brewing…';
        app.stamps.give('timer');
        timer = window.setInterval(tick, 200);
        tick();
      });
      $('[data-stop]', root).addEventListener('click', () => {
        stopTimer();
        app.sound.press();
      });

      setupSliders();
      render(false);
      app.coach.hint('sweet', 'Drag a dial and watch your brew move on the chart. <b>Aim for the green box.</b>', 7000, () => !touched);

      // The espresso film pulls its shot once the visitor is in and it's on screen.
      const shotEl = root.querySelector<HTMLElement>('[data-shot]');
      const offShot = shotEl ? mountShot(shotEl, app) : () => undefined;

      return () => {
        window.clearInterval(timer);
        offShot();
      };
    },
  };
};

export default lab;
