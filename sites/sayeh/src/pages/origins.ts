import { gsap } from 'gsap';
import { $, $$, isNarrow } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { bagImage } from '../art/label';
import { bySlug, COFFEES, LISBON, ORIGINS, type OriginId } from '../lib/catalog';
import { MONTH_LETTERS, money } from '../lib/format';
import { renderWheel } from '../map/wheel';
import { WorldMap } from '../map/worldmap';

/** The farm's valley as a silhouette, the farm marked at its altitude. */
function terrainSvg(o: (typeof ORIGINS)[number]): string {
  const w = 320;
  const h = 120;
  const lo = 1000;
  const hi = 3200;
  const x = (i: number): number => (i / (o.terrain.length - 1)) * w;
  const y = (m: number): number => h - ((m - lo) / (hi - lo)) * h;
  let d = `M0 ${h}`;
  o.terrain.forEach((m, i) => (d += ` L${x(i).toFixed(1)} ${y(m).toFixed(1)}`));
  d += ` L${w} ${h} Z`;
  // The farm sits where the terrain crosses its altitude on the way up.
  let fi = o.terrain.findIndex((m) => m >= o.altitude);
  if (fi < 0) fi = Math.floor(o.terrain.length / 2);
  const fx = x(fi);
  const fy = y(o.altitude);
  return `<svg class="terrain" viewBox="0 -14 ${w} ${h + 14}" aria-hidden="true">
    <path class="terrain__land" d="${d}" />
    <line class="terrain__alt" x1="0" x2="${w}" y1="${fy}" y2="${fy}" />
    <text class="terrain__label" x="4" y="${fy - 6}">${o.altitude.toLocaleString('en-US')} m</text>
    <circle class="terrain__farm" cx="${fx}" cy="${fy}" r="5" />
  </svg>`;
}

const origins: PageFactory = (app, _params, query) => {
  const first = (ORIGINS.find((o) => o.id === query.get('farm'))?.id ?? null) as OriginId | null;
  return {
    title: 'Origins — SAYEH',
    html: `
<section class="page-head">
  <p class="eyebrow mono">Origins</p>
  <h1 class="h1">Four farms,<br />all in the <em>shade.</em></h1>
  <p class="lede">Coffee only grows in the belt between the tropics (the highlighted band). Ours comes from four high farms that kept their forest, and travels to one roaster in Lisbon.</p>
</section>
<section class="atlas wrap" id="atlas">
  <div class="atlas__map">
    <canvas data-map aria-hidden="true"></canvas>
    <svg class="atlas__overlay" data-overlay aria-label="Map of our four farms and the roastery in Lisbon"></svg>
    <p class="atlas__legend mono"><i class="belt-key"></i>The coffee belt, 23.5° either side of the equator</p>
    <button class="btn btn--small btn--ghost atlas__world" type="button" data-world hidden>Whole world</button>
  </div>
  <div class="farm-tabs" role="tablist" aria-label="Farms">
    ${ORIGINS.map((o) => `<button type="button" role="tab" class="farm-tab" data-farm="${o.id}" aria-selected="false"><b>${o.country}</b><small class="mono">${o.region} · ${o.altitude.toLocaleString('en-US')} m</small></button>`).join('')}
  </div>
  <article class="farm-card" id="farm" data-card aria-live="polite"></article>
</section>
<section class="wrap flavours" id="flavours">
  <div class="flavours__text">
    <p class="eyebrow mono">The flavour wheel</p>
    <h2 class="h2">What does it <em>taste</em> like?</h2>
    <p>Tasters describe coffee with a shared wheel of flavours, from families in the middle to precise notes at the edge. ${isNarrow() ? 'Tap' : 'Pick'} a note to see which of our coffees carry it.</p>
    <div class="flavours__pick" data-pick><p class="mono">No note picked yet.</p></div>
  </div>
  <svg class="wheel" data-wheel role="group" aria-label="Flavour wheel"></svg>
</section>`,

    mount(root) {
      const pins = [
        ...ORIGINS.map((o) => ({ id: o.id, lon: o.lon, lat: o.lat, label: o.country, kind: 'farm' as const })),
        { id: 'lisbon', lon: LISBON.lon, lat: LISBON.lat, label: 'Roastery · Lisbon', kind: 'home' as const },
      ];
      const card = $('[data-card]', root);
      const worldBtn = $<HTMLButtonElement>('[data-world]', root);
      let userPicked = false;
      const map = new WorldMap($<HTMLCanvasElement>('[data-map]', root), $<SVGSVGElement>('[data-overlay]', root), pins, (id) => {
        userPicked = true;
        select(id as OriginId);
      });
      const colors = (): void => {
        const cs = getComputedStyle(document.documentElement);
        // Land in the secondary-text tone (a hairline colour made the continents vanish on the light theme).
        map.setColors({ land: cs.getPropertyValue('--muted').trim(), belt: cs.getPropertyValue('--accent').trim(), pin: cs.getPropertyValue('--ink').trim() });
      };
      colors();
      const offDay = app.day.subscribe(() => requestAnimationFrame(colors));
      const ro = new ResizeObserver(() => map.resize());
      ro.observe($('[data-map]', root));

      const glide = (k: number, lon: number, lat: number): void => {
        gsap.to(map.view, { k, lon, lat, duration: app.reduced ? 0 : 1.4, ease: 'power3.inOut', onUpdate: () => map.draw() });
      };

      const wheel = renderWheel($<SVGSVGElement>('[data-wheel]', root), (note) => pick(note));
      const pickEl = $('[data-pick]', root);
      function pick(note: string): void {
        const has = COFFEES.filter((c) => c.notes.includes(note));
        wheel.highlight(has.flatMap((c) => c.notes), note);
        pickEl.innerHTML = `<p class="mono">${note}</p>${
          has.length
            ? `<ul class="pick-list">${has.map((c) => `<li><a href="/shop/${c.slug}"><img src="${bagImage(c, 120)}" alt="" width="40" height="54" /><span><b>${c.name}</b><small>${c.notes.join(' · ')}</small></span><em class="mono">${money(c.price[0])}</em></a></li>`).join('')}</ul>`
            : '<p>None of this season’s coffees, but it’s on the wheel for a reason: we’ll find one.</p>'
        }`;
        app.stamps.give('wheel');
        app.sound.press();
      }

      function select(id: OriginId | null): void {
        map.selected = id;
        $$<HTMLButtonElement>('[data-farm]', root).forEach((b) => {
          b.classList.toggle('is-on', b.dataset.farm === id);
          b.setAttribute('aria-selected', String(b.dataset.farm === id));
        });
        worldBtn.hidden = !id;
        const url = new URL(location.href);
        if (id) url.searchParams.set('farm', id);
        else url.searchParams.delete('farm');
        history.replaceState(history.state, '', url.pathname + url.search);
        if (!id) {
          glide(1, 10, 9);
          card.innerHTML = `<p class="farm-card__empty">Pick a farm on the map, or below.</p>`;
          wheel.highlight([]);
          return;
        }
        const o = ORIGINS.find((x) => x.id === id)!;
        const c = bySlug(o.coffee)!;
        const photo = app.media.origins?.[id];
        glide(isNarrow() ? 2.2 : 2.4, o.lon, o.lat);
        card.innerHTML = `
          <figure class="farm-card__photo ${photo ? '' : 'is-drawn'}">${photo ? `<img src="${photo}" alt="Shade-grown coffee in ${o.region}, ${o.country}" />` : ''}</figure>
          <div class="farm-card__body">
            <p class="eyebrow mono">${o.region}, ${o.country}</p>
            <h2 class="h2">${c.farm}</h2>
            <p>${o.fact} ${c.shade}</p>
            ${terrainSvg(o)}
            <dl class="facts facts--tight">
              <div><dt class="mono">Process</dt><dd>${c.process}</dd></div>
              <div><dt class="mono">Varietal</dt><dd>${c.varietal}</dd></div>
              <div><dt class="mono">Harvest</dt><dd><span class="months">${MONTH_LETTERS.map((m, i) => `<i class="${c.harvest.includes(i + 1) ? 'is-on' : ''}">${m}</i>`).join('')}</span></dd></div>
            </dl>
            <a class="farm-card__coffee" href="/shop/${c.slug}"><img src="${bagImage(c, 120)}" alt="" width="48" height="65" style="view-transition-name: bag-${c.slug}" /><span><small class="mono">The coffee</small><b>${c.name}</b><em>${c.notes.join(' · ')}</em></span><span class="link-arrow">Buy</span></a>
          </div>`;
        if (!app.reduced) gsap.from(card.children, { autoAlpha: 0, y: 16, duration: 0.5, stagger: 0.08, ease: 'power2.out' });
        wheel.highlight(c.notes);
        if (userPicked) {
          app.stamps.give('farm');
          app.sound.paper();
        }
      }

      $$<HTMLButtonElement>('[data-farm]', root).forEach((b) =>
        b.addEventListener('click', () => {
          userPicked = true;
          select(b.dataset.farm as OriginId);
        }),
      );
      worldBtn.addEventListener('click', () => select(null));
      select(first);
      if (!first) app.coach.hint('farm', `${isNarrow() ? 'Tap' : 'Click'} a farm on the map to fly there.`, 5000, () => !userPicked);

      return () => {
        ro.disconnect();
        offDay();
        gsap.killTweensOf(map.view);
      };
    },
  };
};

export default origins;
