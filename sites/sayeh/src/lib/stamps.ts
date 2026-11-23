import { gsap } from 'gsap';
import { $, finePointer } from '@portfolio-lab/kit/dom';
import type { Sound } from './sound';

export type StampId = 'pour' | 'etch' | 'grade' | 'swirl' | 'crack' | 'sweet' | 'timer' | 'farm' | 'wheel' | 'light';

/** Everything to discover, with how to do it on this device and where. */
export const STAMPS: { id: StampId; title: string; fine: string; touch?: string; where: string; href: string }[] = [
  { id: 'pour', title: 'First pour', fine: 'Hold the mouse on the coffee to pour milk.', touch: 'Hold your finger on the coffee to pour.', where: 'Home', href: '/' },
  { id: 'etch', title: 'Etcher', fine: 'Switch to Etch and drag through the foam.', touch: 'Switch to Etch and drag through the foam.', where: 'Home', href: '/' },
  { id: 'grade', title: 'Barista', fine: 'Pour something that scores an A.', where: 'Home', href: '/' },
  { id: 'swirl', title: 'Swirl', fine: 'Drag circles on the saucer around the cup.', touch: 'Twist two fingers on the coffee, or tilt your phone.', where: 'Home', href: '/' },
  { id: 'crack', title: 'First crack', fine: 'Scroll the roast until the beans crack.', where: 'Home', href: '/#roast' },
  { id: 'sweet', title: 'Sweet spot', fine: 'Dial a brew into the ideal box.', where: 'Brew Lab', href: '/lab' },
  { id: 'timer', title: 'Brew along', fine: 'Start the brew timer.', where: 'Brew Lab', href: '/lab' },
  { id: 'farm', title: 'Field trip', fine: 'Open a farm on the map.', where: 'Origins', href: '/origins' },
  { id: 'wheel', title: 'Taster', fine: 'Pick a flavour on the wheel.', touch: 'Tap a flavour on the wheel.', where: 'Origins', href: '/origins' },
  { id: 'light', title: 'Sun chaser', fine: 'Drag the sun to a different hour.', where: 'Anywhere: the sun button', href: '' },
];

const STORE = 'sayeh.stamps.v1';

function load(): Set<StampId> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]') as string[];
    return new Set(raw.filter((id): id is StampId => STAMPS.some((s) => s.id === id)));
  } catch {
    return new Set();
  }
}

/** The stamp's ink: a ring with the leaf and the stamp's number, rotated a little as if pressed by hand. */
function stampSvg(n: number): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="2 2.6"/><circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M22 41c0-10 6-16 19-17 0 10-6 17-19 17Z" fill="currentColor"/><path d="M22 41 34 29" stroke="var(--card)" stroke-width="1.4" stroke-linecap="round"/><text x="32" y="15.5" text-anchor="middle" font-size="7" fill="currentColor" font-family="Geist Mono Variable, monospace">${String(n).padStart(2, '0')}</text></svg>`;
}

/**
 * The loyalty card: ten things to find on the site, one stamp each. Stamps are saved locally; a full card unlocks
 * 15% off the bag. Finding one shows a toast and presses the stamp in the nav.
 */
export class Stamps {
  private done = load();
  private listeners = new Set<(id: StampId, count: number) => void>();
  private btn = $<HTMLButtonElement>('[data-stamps-btn]');
  private count = $('[data-stamp-count]');
  private dots = $('[data-stamp-dots]');
  private panel = $('[data-stamps]');
  private grid = $('[data-stamp-grid]');
  private reward = $('[data-stamp-reward]');
  private toastEl = $('[data-stamp-toast]');
  private toastTimer = 0;

  constructor(private sound: Sound) {
    this.render();
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    $('[data-stamps-close]').addEventListener('click', () => this.toggle(false));
    document.addEventListener('click', (e) => {
      if (this.isOpen && !(e.target as Element).closest('[data-stamps]')) this.toggle(false);
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && this.toggle(false));
    this.grid.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a')) this.toggle(false);
    });
  }

  get total(): number {
    return STAMPS.length;
  }

  get found(): number {
    return this.done.size;
  }

  get complete(): boolean {
    return this.done.size === STAMPS.length;
  }

  has(id: StampId): boolean {
    return this.done.has(id);
  }

  onStamp(fn: (id: StampId, count: number) => void): void {
    this.listeners.add(fn);
  }

  /** Stamps the card (once per stamp). */
  give(id: StampId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.done]));
    } catch {
      /* private mode */
    }
    this.render();
    const i = STAMPS.findIndex((s) => s.id === id);
    const s = STAMPS[i];
    const full = this.complete;
    this.toastEl.innerHTML = `<span class="stamp-toast__ink">${stampSvg(i + 1)}</span><span><b>${full ? 'Card full: 15% off your bag' : `Stamp: ${s.title}`}</b><small>${this.done.size} of ${STAMPS.length}${full ? ' · applied automatically' : ''}</small></span>`;
    this.toastEl.classList.remove('is-shown');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('is-shown');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-shown'), full ? 4200 : 2800);
    gsap.fromTo(this.btn, { scale: 1.22 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1.1, 0.45)' });
    this.sound.stamp();
    this.listeners.forEach((fn) => fn(id, this.done.size));
  }

  private get isOpen(): boolean {
    return this.panel.classList.contains('is-open');
  }

  toggle(open = !this.isOpen): void {
    this.panel.classList.toggle('is-open', open);
    this.btn.setAttribute('aria-expanded', String(open));
    if (open) {
      this.render();
      this.sound.paper();
    }
  }

  private render(): void {
    const n = this.done.size;
    this.count.textContent = `${n}/${STAMPS.length}`;
    this.dots.innerHTML = STAMPS.map((s) => `<i class="${this.done.has(s.id) ? 'is-on' : ''}"></i>`).join('');
    const fine = finePointer();
    this.grid.innerHTML = STAMPS.map((s, i) => {
      const got = this.done.has(s.id);
      const how = fine ? s.fine : (s.touch ?? s.fine);
      const tilt = ((i * 37) % 21) - 10;
      const where = s.href ? `<a href="${s.href}">${s.where}</a>` : s.where;
      return `<li class="slot${got ? ' is-stamped' : ''}"><span class="slot__ink" style="--tilt:${tilt}deg">${got ? stampSvg(i + 1) : `<i>${String(i + 1).padStart(2, '0')}</i>`}</span><span class="slot__text"><b>${s.title}</b><small>${got ? 'Stamped' : how}</small><em class="mono">${where}</em></span></li>`;
    }).join('');
    this.reward.innerHTML = this.complete
      ? `<b>Card full.</b> 15% off is applied to your bag (code <span class="mono">SHADE15</span>).`
      : `${STAMPS.length - n} to go. A full card takes 15% off your bag.`;
  }
}
