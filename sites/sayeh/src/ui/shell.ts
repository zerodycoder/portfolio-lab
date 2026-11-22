import { gsap } from 'gsap';
import { siClaude, siGsap, siTypescript, siVercel, siVite, siWebgl } from 'simple-icons';
import { brandLogo, playwrightLogo, renderBadges, waveformLogo, type Badge } from '@portfolio-lab/kit/stack';
import { $, $$, clamp } from '@portfolio-lab/kit/dom';
import { bySlug } from '../lib/catalog';
import { Cart, FREE_SHIPPING } from '../lib/cart';
import { Daylight, PHASE_LINES, type Sky } from '../lib/daylight';
import { clock, money } from '../lib/format';
import type { Sound } from '../lib/sound';
import type { Stamps } from '../lib/stamps';
import { bagImage } from '../art/label';

/** The "Built with" badges, on the gate and in the footer, drawn for the current (light or dark) page. */
export function renderStack(dark = false): void {
  const page = dark ? ({ background: 'dark', ink: '#f1e7d8' } as const) : ({ background: 'light', ink: '#2a1d15' } as const);
  const badges: Badge[] = [
    { name: 'Claude Code', logo: brandLogo(siClaude, page) },
    { name: 'TypeScript', logo: brandLogo(siTypescript, page) },
    { name: 'WebGL2', logo: brandLogo(siWebgl, page) },
    { name: 'Vite', logo: brandLogo(siVite, page) },
    { name: 'GSAP', logo: brandLogo(siGsap, page) },
    { name: 'Lenis', mark: '#E30613' },
    { name: 'D3-geo', mark: '#F9A03C' },
    { name: 'View Transitions', mark: '#7b61ff' },
    { name: 'Web Audio API', logo: waveformLogo(page.ink) },
    { name: 'Playwright', logo: playwrightLogo },
    { name: 'Vercel', logo: brandLogo(siVercel, page) },
  ];
  // The gate's list is gone once the visitor is in; the footer's stays.
  document.querySelectorAll<HTMLElement>('[data-badges], [data-badges-footer]').forEach((list) => renderBadges(list, badges));
}

/** Small transient message at the bottom of the screen. */
export function toaster(): (msg: string) => void {
  const el = $('[data-toast]');
  let timer = 0;
  return (msg) => {
    el.textContent = msg;
    el.classList.add('is-shown');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.remove('is-shown'), 2600);
  };
}

/** Navigation: active page, the phone menu, the sound toggle, and the nav's look over the dark hero. */
export function initNav(sound: Sound, onRoute: (fn: (name: string) => void) => void): void {
  const nav = $('[data-nav]');
  const menu = $('[data-menu]');
  const menuBtn = $<HTMLButtonElement>('[data-menu-btn]');
  const setMenu = (open: boolean): void => {
    menu.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('menu-open', open);
  };
  menuBtn.addEventListener('click', () => {
    setMenu(!menu.classList.contains('is-open'));
    sound.press();
  });
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setMenu(false);
  });

  onRoute((name) => {
    setMenu(false);
    $$('[data-link]').forEach((a) => a.classList.toggle('is-active', a.dataset.link === name || (name === 'product' && a.dataset.link === 'shop')));
  });

  const toggle = $<HTMLButtonElement>('[data-sound-toggle]');
  toggle.addEventListener('click', () => sound.toggle());
  sound.onChange((on) => {
    toggle.setAttribute('aria-pressed', String(on));
    toggle.classList.toggle('is-on', on);
  });

  // Hover ticks on everything clickable (desktop only, rate-limited in the engine).
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = (e.target as Element).closest?.('a, button, .chip, [role="tab"]');
    if (t && !(e.relatedTarget as Element | null)?.closest?.('a, button, .chip, [role="tab"]')) sound.tick();
  });

  // The nav sits on the dark hero at the top of the home page: let it know.
  const update = (): void => {
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/** The bag drawer: lines with steppers, the free-shipping meter, totals, and the way to checkout. */
export function initCartDrawer(cart: Cart, sound: Sound, stamps: Stamps): { open(): void } {
  const drawer = $('[data-cart]');
  const scrim = $('[data-scrim]');
  const btn = $<HTMLButtonElement>('[data-cart-btn]');
  const count = $('[data-cart-count]');
  const lines = $('[data-cart-lines]');
  const foot = $('[data-cart-foot]');
  const ship = $('[data-ship]');

  const set = (open: boolean): void => {
    drawer.classList.toggle('is-open', open);
    scrim.classList.toggle('is-shown', open);
    drawer.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('drawer-open', open);
    if (open) {
      sound.paper();
      $<HTMLButtonElement>('[data-cart-close]').focus({ preventScroll: true });
    }
  };
  btn.addEventListener('click', () => set(!drawer.classList.contains('is-open')));
  $('[data-cart-close]').addEventListener('click', () => set(false));
  scrim.addEventListener('click', () => set(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && set(false));
  drawer.addEventListener('click', (e) => {
    const el = e.target as Element;
    const step = el.closest<HTMLButtonElement>('[data-step]');
    if (step) {
      const id = step.closest<HTMLElement>('[data-line]')!.dataset.line!;
      const line = cart.lines.find((l) => l.id === id);
      if (line) cart.setQty(id, line.qty + Number(step.dataset.step));
      sound.press();
    }
    if (el.closest('a')) set(false);
  });

  const render = (): void => {
    count.textContent = String(cart.count);
    btn.classList.toggle('has-items', cart.count > 0);
    const left = FREE_SHIPPING - (cart.subtotal - cart.discount);
    const p = clamp((cart.subtotal - cart.discount) / FREE_SHIPPING, 0, 1);
    ship.innerHTML = cart.lines.length
      ? `<p>${left > 0 ? `<b>${money(left)}</b> away from free shipping` : '<b>Free shipping</b> unlocked'}</p><span class="meter"><i style="--p:${p.toFixed(3)}"></i></span>`
      : '';
    if (!cart.lines.length) {
      lines.innerHTML = `<li class="drawer__empty"><p>Your bag is empty.</p><a class="btn btn--solid" href="/shop">Browse the coffees</a></li>`;
      foot.innerHTML = '';
      return;
    }
    lines.innerHTML = cart.lines
      .map((l) => {
        const c = bySlug(l.slug)!;
        const unit = Cart.unit(l.slug, l.size, l.plan);
        const plan = l.plan === 'once' ? '' : `<span class="tag">${l.plan === '2w' ? 'Every 2 weeks' : 'Every 4 weeks'}</span>`;
        return `<li class="line" data-line="${l.id}">
          <img class="line__bag" src="${bagImage(c, 120)}" alt="" width="60" height="80" />
          <div class="line__info"><a href="/shop/${c.slug}"><b>${c.name}</b></a><small>${l.size === '250' ? '250 g' : '1 kg'} · ${l.grind}</small>${plan}</div>
          <div class="line__qty"><button type="button" data-step="-1" aria-label="One less">−</button><span class="mono">${l.qty}</span><button type="button" data-step="1" aria-label="One more">+</button></div>
          <p class="line__price mono">${money(unit * l.qty)}</p>
        </li>`;
      })
      .join('');
    foot.innerHTML = `
      <dl class="totals">
        <div><dt>Subtotal</dt><dd class="mono">${money(cart.subtotal)}</dd></div>
        ${cart.discount ? `<div class="is-reward"><dt>Stamp card (15%)</dt><dd class="mono">−${money(cart.discount)}</dd></div>` : ''}
        <div><dt>Shipping</dt><dd class="mono">${cart.shipping ? money(cart.shipping) : 'Free'}</dd></div>
        <div class="totals__sum"><dt>Total</dt><dd class="mono">${money(cart.total)}</dd></div>
      </dl>
      ${cart.discount ? '' : `<p class="drawer__hint">Fill your stamp card (${stamps.found}/${stamps.total}) for 15% off.</p>`}
      <a class="btn btn--solid btn--wide" href="/checkout">Checkout</a>`;
  };
  cart.subscribe(render);
  render();
  return { open: () => set(true) };
}

/** The sun dial: an arc the sun runs along; dragging it (or the hidden range input) previews any hour. */
export function initSundial(day: Daylight, sound: Sound, stamps: Stamps): void {
  const pop = $('[data-sundial]');
  const btn = $<HTMLButtonElement>('[data-sun-btn]');
  const range = $<HTMLInputElement>('[data-dial-range]');
  const sun = $<SVGCircleElement>('[data-dial-sun]');
  const arc = $<SVGPathElement>('[data-dial-arc]');
  const timeEl = $('[data-dial-time]');
  const label = $('[data-dial-label]');
  const navTime = $('[data-sun-time]');
  const glyph = $('[data-sun-glyph]');
  const footerLight = $('[data-footer-light]');

  // The arc: elevation across the day, scaled into the dial.
  const pts: string[] = [];
  for (let m = 0; m <= 1440; m += 20) {
    const { elevation } = Daylight.sun(m);
    pts.push(`${(10 + (m / 1440) * 300).toFixed(1)} ${(120 - elevation * 1.6).toFixed(1)}`);
  }
  arc.setAttribute('d', `M${pts.join(' L')}`);

  const set = (open: boolean): void => {
    pop.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) sound.paper();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    set(!pop.classList.contains('is-open'));
  });
  $('[data-sun-open]').addEventListener('click', (e) => {
    e.stopPropagation();
    set(true);
  });
  document.addEventListener('click', (e) => {
    if (pop.classList.contains('is-open') && !(e.target as Element).closest('[data-sundial]')) set(false);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && set(false));

  let moved = 0;
  range.addEventListener('input', () => {
    day.set(Number(range.value));
    sound.detent(Number(range.value) / 1440);
    if (++moved > 3) stamps.give('light');
  });
  $('[data-dial-now]').addEventListener('click', () => {
    day.set(null);
    sound.press();
  });

  day.subscribe((s: Sky) => {
    const x = 10 + (s.minutes / 1440) * 300;
    const y = 120 - s.elevation * 1.6;
    sun.setAttribute('cx', x.toFixed(1));
    sun.setAttribute('cy', y.toFixed(1));
    sun.classList.toggle('is-moon', s.dark);
    range.value = String(Math.round(s.minutes));
    timeEl.textContent = clock(s.minutes);
    label.textContent = `${PHASE_LINES[s.phase]}${s.overridden ? '' : ' (now)'}`;
    navTime.textContent = clock(s.minutes);
    glyph.dataset.kind = s.dark ? 'moon' : s.golden > 0.4 ? 'low' : 'sun';
    btn.classList.toggle('is-override', s.overridden);
    footerLight.textContent = `${PHASE_LINES[s.phase]} ${s.overridden ? 'You picked this hour.' : 'This page is lit by your clock.'}`;
  });
}

/**
 * Leaf shadows: a branch of leaves drawn once into a canvas as soft shadows (shadowBlur works everywhere, unlike
 * canvas filters), then laid over the page. CSS rotates and stretches the layer from the sun's direction and
 * height, and a slow sway keeps it alive.
 */
export function initShade(reduced: boolean): void {
  const el = $('[data-shade]');
  const W = 1400;
  const H = 1400;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = 11;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.shadowColor = 'rgba(30,38,20,1)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 10000;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  const leaf = (x: number, y: number, a: number, len: number, wid: number): void => {
    ctx.save();
    ctx.translate(x - 10000, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fill();
    ctx.restore();
  };
  // A few branches entering from the edges, each with alternating leaves.
  for (let b = 0; b < 7; b++) {
    const side = b % 4;
    let x = side === 0 ? -40 : side === 1 ? W + 40 : rnd() * W;
    let y = side === 2 ? -40 : side === 3 ? H + 40 : rnd() * H;
    let a = Math.atan2(H / 2 - y, W / 2 - x) + (rnd() - 0.5) * 0.9;
    const steps = 9 + Math.floor(rnd() * 7);
    ctx.lineWidth = 5;
    for (let i = 0; i < steps; i++) {
      const seg = 46 + rnd() * 20;
      const nx = x + Math.cos(a) * seg;
      const ny = y + Math.sin(a) * seg;
      ctx.beginPath();
      ctx.moveTo(x - 10000, y);
      ctx.lineTo(nx - 10000, ny);
      ctx.stroke();
      const len = 80 + rnd() * 70;
      leaf(nx, ny, a + (i % 2 ? 1 : -1) * (0.7 + rnd() * 0.5), len, len * 0.22);
      if (rnd() > 0.55) leaf(nx, ny, a + (i % 2 ? -1 : 1) * (0.5 + rnd() * 0.4), len * 0.8, len * 0.2);
      x = nx;
      y = ny;
      a += (rnd() - 0.5) * 0.5;
    }
  }
  c.toBlob((blob) => {
    if (!blob) return;
    const inner = document.createElement('div');
    inner.className = 'shade__leaves';
    inner.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
    el.appendChild(inner);
    if (!reduced) gsap.to(inner, { rotate: 1.6, x: 14, y: -8, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  });
}
