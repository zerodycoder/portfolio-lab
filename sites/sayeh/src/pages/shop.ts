import { gsap } from 'gsap';
import { $, $$, finePointer } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { bagImage } from '../art/label';
import { COFFEES, familyOf, noteColor, type Coffee } from '../lib/catalog';
import { longDate, money, nextRoast } from '../lib/format';
import { flyToCart } from '../ui/fly';

const FILTERS: { id: string; label: string; test: (c: Coffee) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'bright', label: 'Bright & fruity', test: (c) => c.roast === 'light' },
  { id: 'choc', label: 'Chocolatey', test: (c) => c.notes.some((n) => familyOf(n) === 'Cocoa & nut') },
  { id: 'espresso', label: 'For espresso', test: (c) => /espresso/i.test(c.best) || c.roast === 'espresso' },
  { id: 'decaf', label: 'Decaf', test: (c) => c.kind === 'decaf' },
];

export const cardHtml = (c: Coffee, i: number): string => `
<li class="shop-card" data-slug="${c.slug}" style="--i:${i}">
  <a class="shop-card__bag" href="/shop/${c.slug}" aria-label="${c.name}">
    <img src="${bagImage(c, 300)}" alt="" width="300" height="408" style="view-transition-name: bag-${c.slug}" />
  </a>
  <div class="shop-card__body">
    <p class="mono shop-card__origin">${c.kind === 'blend' ? 'House blend' : c.kind === 'decaf' ? 'Decaf' : c.country} · ${c.roast === 'espresso' ? 'espresso roast' : `${c.roast} roast`}</p>
    <a class="shop-card__name" href="/shop/${c.slug}">${c.name}</a>
    <p class="shop-card__line">${c.line}</p>
    <ul class="notes">${c.notes.map((n) => `<li><i style="background:${noteColor(n)}"></i>${n}</li>`).join('')}</ul>
    <div class="shop-card__buy">
      <span class="mono">${money(c.price[0])} · 250 g</span>
      <button class="btn btn--small btn--solid" type="button" data-quick="${c.slug}">Add to bag</button>
    </div>
  </div>
</li>`;

const shop: PageFactory = (app, _params, query) => {
  const roast = nextRoast();
  const initial = FILTERS.find((f) => f.id === query.get('filter'))?.id ?? 'all';
  return {
    title: 'Shop — SAYEH',
    html: `
<section class="page-head shop-head">
  <p class="eyebrow mono">Shop · next roast ${longDate(roast)}</p>
  <h1 class="h1">Six coffees,<br />all grown in <em>shade.</em></h1>
  <p class="lede">Every bag is roasted to order on Monday or Thursday and ships the same afternoon. Every label is drawn by code from the coffee itself: its farm’s terrain, its altitude, its tasting notes, its harvest.</p>
</section>
<section class="wrap shop" id="grid">
  <div class="filters" role="tablist" aria-label="Filter coffees">
    ${FILTERS.map((f) => `<button type="button" role="tab" class="filter${f.id === initial ? ' is-on' : ''}" aria-selected="${f.id === initial}" data-filter="${f.id}">${f.label}<b class="mono">${COFFEES.filter(f.test).length}</b></button>`).join('')}
  </div>
  <ul class="shop-grid" data-grid>${COFFEES.map(cardHtml).join('')}</ul>
  <aside class="subscribe" id="subscribe">
    <div>
      <p class="eyebrow mono">Subscribe &amp; save</p>
      <p class="h3">Fresh beans every two or four weeks, <em>12% off.</em></p>
      <p>Pick “Every 2 weeks” or “Every 4 weeks” on any coffee. Skip, swap or stop whenever you like.</p>
    </div>
    <ol class="subscribe__steps">
      <li><b>1</b>Choose a coffee and grind</li>
      <li><b>2</b>We roast it Monday or Thursday</li>
      <li><b>3</b>It’s at your door two days later</li>
    </ol>
  </aside>
</section>`,

    mount(root) {
      const grid = $('[data-grid]', root);
      const cards = $$<HTMLElement>('.shop-card', grid);
      const apply = (id: string, animate: boolean): void => {
        const f = FILTERS.find((x) => x.id === id)!;
        $$<HTMLButtonElement>('[data-filter]', root).forEach((b) => {
          b.classList.toggle('is-on', b.dataset.filter === id);
          b.setAttribute('aria-selected', String(b.dataset.filter === id));
        });
        const shown = cards.filter((c) => f.test(COFFEES.find((x) => x.slug === c.dataset.slug)!));
        cards.forEach((c) => c.classList.toggle('is-hidden', !shown.includes(c)));
        if (animate && !app.reduced) gsap.fromTo(shown, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power2.out' });
        const url = new URL(location.href);
        if (id === 'all') url.searchParams.delete('filter');
        else url.searchParams.set('filter', id);
        history.replaceState(history.state, '', url.pathname + url.search);
      };
      apply(initial, false);
      $$<HTMLButtonElement>('[data-filter]', root).forEach((b) =>
        b.addEventListener('click', () => {
          apply(b.dataset.filter!, true);
          app.sound.press();
        }),
      );
      grid.addEventListener('click', (e) => {
        const btn = (e.target as Element).closest<HTMLButtonElement>('[data-quick]');
        if (!btn) return;
        const slug = btn.dataset.quick!;
        const c = COFFEES.find((x) => x.slug === slug)!;
        app.cart.add(slug, '250', c.roast === 'espresso' ? 'Espresso' : 'Whole bean', 'once');
        app.sound.bag();
        flyToCart(btn.closest('.shop-card')!.querySelector('img')!);
        app.toast(`${c.name} is in your bag.`);
      });

      // Bags lean toward the pointer.
      if (finePointer())
        cards.forEach((card) => {
          const img = $('img', card);
          const a = $('.shop-card__bag', card);
          a.addEventListener('pointermove', (e) => {
            const r = a.getBoundingClientRect();
            gsap.to(img, { rotateY: ((e.clientX - r.left) / r.width - 0.5) * 16, rotateX: -((e.clientY - r.top) / r.height - 0.5) * 10, duration: 0.4 });
          });
          a.addEventListener('pointerleave', () => gsap.to(img, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' }));
        });
    },
  };
};

export default shop;
