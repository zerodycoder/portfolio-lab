import { gsap } from 'gsap';
import { $, $$, finePointer } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { bagImage, drawContours } from '../art/label';
import { bySlug, COFFEES, GRINDS, noteColor, ORIGINS, PLANS, type Grind, type PlanId } from '../lib/catalog';
import { Cart, type Size } from '../lib/cart';
import { addDays, delivered, longDate, money, MONTH_LETTERS, nextRoast, shortDate } from '../lib/format';
import { flyToCart } from '../ui/fly';
import notFound from './notfound';

/** The grind the Brew Lab suggests, from the last method used there. */
function labGrind(): { grind: Grind; method: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem('sayeh.lab.v1') ?? 'null') as { method?: string } | null;
    const map: Record<string, [Grind, string]> = {
      pourover: ['Filter', 'pour-over'],
      espresso: ['Espresso', 'espresso'],
      press: ['French press', 'French press'],
      aeropress: ['Filter', 'AeroPress'],
    };
    const hit = raw?.method ? map[raw.method] : undefined;
    return hit ? { grind: hit[0], method: hit[1] } : null;
  } catch {
    return null;
  }
}

const product: PageFactory = (app, params, query) => {
  const c = bySlug(params.slug);
  if (!c) return notFound(app, params, query);
  const origin = ORIGINS.find((o) => o.id === c.origin)!;
  const photo = app.media.origins?.[c.origin];
  const lab = labGrind();
  const startGrind: Grind = lab?.grind ?? (c.roast === 'espresso' ? 'Espresso' : 'Whole bean');
  const roast = nextRoast();
  const others = COFFEES.filter((x) => x.slug !== c.slug)
    .sort((a, b) => Math.abs(a.roastLevel - c.roastLevel) - Math.abs(b.roastLevel - c.roastLevel))
    .slice(0, 2);

  return {
    title: `${c.name} — SAYEH`,
    html: `
<section class="product wrap" id="buy">
  <a class="back mono" href="/shop">← All coffees</a>
  <div class="product__grid">
    <div class="product__stage" data-stage>
      <img class="product__bag" data-bag src="${bagImage(c, 420)}" alt="${c.name} coffee bag" width="420" height="571" style="view-transition-name: bag-${c.slug}" />
      <i class="product__glare" data-glare aria-hidden="true"></i>
      <p class="product__hint mono">${finePointer() ? 'Move over the bag to tilt it' : 'Tilt your phone to turn the bag'}</p>
    </div>
    <div class="product__info">
      <p class="eyebrow mono">${c.country} · ${c.region}</p>
      <h1 class="h1 product__name">${c.name}</h1>
      <p class="lede">${c.line}</p>
      <ul class="notes notes--big">${c.notes.map((n) => `<li><i style="background:${noteColor(n)}"></i>${n}</li>`).join('')}</ul>
      <form class="buy" data-buy>
        <fieldset class="opt">
          <legend class="mono">Size</legend>
          <div class="opt__row">
            <label class="pill"><input type="radio" name="size" value="250" checked /><span>250 g<small>${money(c.price[0])}</small></span></label>
            <label class="pill"><input type="radio" name="size" value="1000" /><span>1 kg<small>${money(c.price[1])}</small></span></label>
          </div>
        </fieldset>
        <fieldset class="opt">
          <legend class="mono">Grind ${lab ? `<span class="tag">Brew Lab: ${lab.method} → ${lab.grind}</span>` : ''}</legend>
          <div class="opt__row opt__row--wrap">
            ${GRINDS.map((g) => `<label class="pill"><input type="radio" name="grind" value="${g}" ${g === startGrind ? 'checked' : ''} /><span>${g}</span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="opt">
          <legend class="mono">How often</legend>
          <div class="opt__row opt__row--wrap">
            ${PLANS.map((p, i) => `<label class="pill"><input type="radio" name="plan" value="${p.id}" ${i === 0 ? 'checked' : ''} /><span>${p.label}${p.off ? `<small>−${Math.round(p.off * 100)}%</small>` : ''}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="buy__row">
          <div class="qty" aria-label="Quantity"><button type="button" data-q="-1" aria-label="One less">−</button><output class="mono" data-qty>1</output><button type="button" data-q="1" aria-label="One more">+</button></div>
          <button class="btn btn--solid btn--big buy__add" type="submit"><span>Add to bag</span><b class="mono" data-price>${money(c.price[0])}</b></button>
        </div>
        <p class="buy__ship mono" data-ship-line></p>
      </form>
    </div>
  </div>
</section>

<section class="farm-band" id="farm">
  <div class="wrap farm-band__grid">
    <figure class="farm-band__photo ${photo ? '' : 'is-drawn'}">
      ${photo ? `<img src="${photo}" alt="Coffee growing in the shade in ${origin.region}, ${origin.country}" loading="lazy" />` : ''}
      <figcaption class="mono">${origin.region}, ${origin.country}</figcaption>
    </figure>
    <div class="farm-band__text">
      <p class="eyebrow mono">From the farm</p>
      <h2 class="h2">${c.farm}</h2>
      <p>${c.story}</p>
      <dl class="facts">
        <div><dt class="mono">Producer</dt><dd>${c.producer}</dd></div>
        <div><dt class="mono">Altitude</dt><dd>${c.altitude[0].toLocaleString('en-US')}–${c.altitude[1].toLocaleString('en-US')} m</dd></div>
        <div><dt class="mono">Process</dt><dd>${c.process}</dd></div>
        <div><dt class="mono">Varietal</dt><dd>${c.varietal}</dd></div>
        <div><dt class="mono">Shade</dt><dd>${c.shade}</dd></div>
        <div><dt class="mono">Harvest</dt><dd><span class="months">${MONTH_LETTERS.map((m, i) => `<i class="${c.harvest.includes(i + 1) ? 'is-on' : ''}" title="${m}">${m}</i>`).join('')}</span></dd></div>
      </dl>
      <a class="link-arrow" href="/origins?farm=${c.origin}">See it on the map</a>
    </div>
  </div>
</section>

<section class="wrap label-story" id="label">
  <div class="label-story__text">
    <p class="eyebrow mono">Why the label looks like this</p>
    <h2 class="h2">Drawn by the <em>coffee itself.</em></h2>
    <p>No designer touched this label. Code reads the coffee and draws it, so no two are alike and every one is honest.</p>
    <ul class="legend">
      <li><i class="legend__lines"></i><span><b>Contour lines</b> are the farm’s terrain, more lines the higher it grows (${c.altitude[1].toLocaleString('en-US')} m here).</span></li>
      <li><i class="legend__notes">${c.notes.map((n) => `<b style="background:${noteColor(n)}"></b>`).join('')}</i><span><b>Colours</b> run through its tasting notes, from the valley floor to the summit.</span></li>
      <li><i class="legend__peak">▲</i><span><b>The triangle</b> marks the farm on its hill.</span></li>
      <li><i class="legend__months"></i><span><b>The squares</b> along the bottom are the harvest months; the <b>beans</b> are the roast level.</span></li>
    </ul>
  </div>
  <canvas class="label-story__art" data-art aria-label="The contour drawing from this coffee’s label, enlarged"></canvas>
</section>

<section class="wrap brew-tip">
  <div>
    <p class="eyebrow mono">How we brew it</p>
    <p class="h3">${c.best}. <a class="link-arrow" href="/lab?coffee=${c.slug}">Dial it in in the Brew Lab</a></p>
  </div>
</section>

<section class="wrap pairs" id="pairs">
  <p class="eyebrow mono">If you like this</p>
  <ul class="pairs__list">
    ${others
      .map(
        (o) => `<li><a class="pair" href="/shop/${o.slug}"><img src="${bagImage(o, 160)}" alt="" width="80" height="109" style="view-transition-name: bag-${o.slug}" /><span><b>${o.name}</b><small>${o.line}</small><em class="mono">${money(o.price[0])}</em></span></a></li>`,
      )
      .join('')}
  </ul>
</section>`,

    mount(root) {
      const form = $<HTMLFormElement>('[data-buy]', root);
      const priceEl = $('[data-price]', root);
      const qtyEl = $('[data-qty]', root);
      const shipLine = $('[data-ship-line]', root);
      let qty = 1;
      const state = (): { size: Size; grind: Grind; plan: PlanId } => {
        const fd = new FormData(form);
        return { size: fd.get('size') as Size, grind: fd.get('grind') as Grind, plan: fd.get('plan') as PlanId };
      };
      const update = (): void => {
        const s = state();
        priceEl.textContent = money(Cart.unit(c.slug, s.size, s.plan) * qty);
        qtyEl.textContent = String(qty);
        const arrive = delivered(roast, 2);
        shipLine.textContent =
          s.plan === 'once'
            ? `Roasted ${longDate(roast)} · ships that afternoon · arrives by ${shortDate(arrive)}`
            : `First bag roasted ${longDate(roast)} · then every ${s.plan === '2w' ? 'two' : 'four'} weeks (next ${shortDate(addDays(roast, s.plan === '2w' ? 14 : 28))})`;
      };
      form.addEventListener('change', () => {
        update();
        app.sound.detent(0.6);
      });
      $$<HTMLButtonElement>('[data-q]', root).forEach((b) =>
        b.addEventListener('click', () => {
          qty = Math.max(1, Math.min(9, qty + Number(b.dataset.q)));
          update();
          app.sound.press();
        }),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const s = state();
        app.cart.add(c.slug, s.size, s.grind, s.plan, qty);
        app.sound.bag();
        flyToCart($<HTMLImageElement>('[data-bag]', root));
        app.toast(`${qty} × ${c.name} (${s.size === '250' ? '250 g' : '1 kg'}, ${s.grind.toLowerCase()}) added.`);
      });
      update();

      // The bag tilts toward the pointer (or with the phone), a glare sliding across it.
      const stage = $('[data-stage]', root);
      const bag = $('[data-bag]', root);
      const glare = $('[data-glare]', root);
      const tilt = (x: number, y: number): void => {
        gsap.to(bag, { rotateY: x * 18, rotateX: -y * 12, duration: 0.5, ease: 'power2.out' });
        gsap.to(glare, { '--gx': `${50 + x * 70}%`, '--gy': `${30 + y * 60}%`, opacity: 0.55 + Math.abs(x) * 0.4, duration: 0.5 });
      };
      const onMove = (e: PointerEvent): void => {
        const r = stage.getBoundingClientRect();
        tilt((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
      };
      const onLeave = (): void => tilt(0, 0);
      const onOrient = (e: DeviceOrientationEvent): void => {
        if (e.gamma === null || e.beta === null) return;
        tilt(Math.max(-0.5, Math.min(0.5, e.gamma / 50)), Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 60)));
      };
      if (finePointer()) {
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerleave', onLeave);
      } else window.addEventListener('deviceorientation', onOrient);

      // The label's art, large: the same drawing the bag carries.
      const art = $<HTMLCanvasElement>('[data-art]', root);
      const draw = (): void => {
        const w = art.clientWidth;
        const h = art.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        art.width = Math.round(w * dpr);
        art.height = Math.round(h * dpr);
        const ctx = art.getContext('2d')!;
        ctx.scale(dpr, dpr);
        drawContours(ctx, c, 0, 0, w, h, Math.max(1.2, w / 300), '#f7f1e6');
      };
      draw();
      const ro = new ResizeObserver(draw);
      ro.observe(art);
      return () => {
        ro.disconnect();
        window.removeEventListener('deviceorientation', onOrient);
      };
    },
  };
};

export default product;
