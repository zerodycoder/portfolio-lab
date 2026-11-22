import { gsap } from 'gsap';
import { $, finePointer } from '../lib/dom';
import type { Sound } from '../lib/sound';

export type TrickId =
  | 'poke'
  | 'pickup'
  | 'toss'
  | 'dizzy'
  | 'grumpy'
  | 'sleep'
  | 'bop'
  | 'xray'
  | 'mood'
  | 'solve'
  | 'makeover'
  | 'name'
  | 'pack';

/** Everything you can do with Nibbo. `fine` is the mouse wording, `touch` the phone wording. */
export const TRICKS: { id: TrickId; title: string; fine: string; touch?: string }[] = [
  { id: 'poke', title: 'Boop', fine: 'Click Nibbo.', touch: 'Tap Nibbo.' },
  { id: 'pickup', title: 'Up you go', fine: 'Drag Nibbo around.', touch: 'Press and hold Nibbo, then drag.' },
  { id: 'toss', title: 'Wheee', fine: 'Drag fast and let go: it bounces.', touch: 'Hold, then fling it and let go.' },
  { id: 'dizzy', title: 'Dizzy', fine: 'Circle your mouse really fast.', touch: 'Give your phone a good shake.' },
  { id: 'grumpy', title: 'Grumpy', fine: 'Poke it five times in a row.' },
  { id: 'sleep', title: 'Nap time', fine: 'Leave Nibbo alone for half a minute.' },
  { id: 'bop', title: 'Block party', fine: 'Click a letter block at the top.', touch: 'Tap a letter block at the top.' },
  { id: 'xray', title: 'X-ray eyes', fine: 'Flip the X-ray switch inside Nibbo.' },
  { id: 'mood', title: 'Mood swing', fine: 'Pick a feeling for it.' },
  { id: 'solve', title: 'Home sweet home', fine: 'Solve a level in Play.' },
  { id: 'makeover', title: 'Makeover', fine: 'Change its shell, face light or hat.' },
  { id: 'name', title: 'Name it', fine: 'Type a name, then listen.' },
  { id: 'pack', title: 'Boxed', fine: 'Adopt it and watch it pack itself.' },
];

const STORE = 'nibbo.tricks.v1';

function load(): Set<TrickId> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]') as string[];
    return new Set(raw.filter((id): id is TrickId => TRICKS.some((t) => t.id === id)));
  } catch {
    return new Set();
  }
}

/**
 * The trick list: a counter in the nav that opens a checklist of everything Nibbo can do, with how to do it on
 * this device. Finding one (by doing it) ticks it off with a toast; progress survives reloads.
 */
export class Tricks {
  private done = load();
  private listeners = new Set<(id: TrickId, count: number) => void>();
  private btn = $<HTMLButtonElement>('[data-tricks]');
  private count = $('[data-tricks-count]');
  private panel = $('[data-tricks-panel]');
  private list = $('[data-tricks-list]');
  private toastEl = $('[data-trick-toast]');
  private toastTimer = 0;

  constructor(private sound: Sound) {
    this.render();
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    $('[data-tricks-close]').addEventListener('click', () => this.toggle(false));
    document.addEventListener('click', (e) => {
      if (this.isOpen && !(e.target as Element).closest('[data-tricks-panel]')) this.toggle(false);
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && this.toggle(false));
  }

  get total(): number {
    return TRICKS.length;
  }

  get found(): number {
    return this.done.size;
  }

  has(id: TrickId): boolean {
    return this.done.has(id);
  }

  onFound(fn: (id: TrickId, count: number) => void): void {
    this.listeners.add(fn);
  }

  /** Ticks a trick off (once). */
  find(id: TrickId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.done]));
    } catch {
      /* private mode */
    }
    this.render();
    const trick = TRICKS.find((t) => t.id === id)!;
    this.toastEl.innerHTML = `<span class="trick-toast__star" aria-hidden="true">★</span><span><b>Trick found: ${trick.title}</b><small>${this.done.size} of ${TRICKS.length}</small></span>`;
    this.toastEl.classList.add('is-shown');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-shown'), 2600);
    gsap.fromTo(this.btn, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.4)' });
    this.sound.spark();
    this.listeners.forEach((fn) => fn(id, this.done.size));
  }

  private get isOpen(): boolean {
    return this.panel.classList.contains('is-open');
  }

  private toggle(open = !this.isOpen): void {
    this.panel.classList.toggle('is-open', open);
    this.btn.setAttribute('aria-expanded', String(open));
    if (open) {
      this.render();
      this.sound.pop(true);
    }
  }

  private render(): void {
    const n = this.done.size;
    this.count.textContent = `${n}/${TRICKS.length}`;
    this.btn.style.setProperty('--progress', String(n / TRICKS.length));
    const fine = finePointer();
    this.list.innerHTML = TRICKS.map((t) => {
      const got = this.done.has(t.id);
      const how = fine ? t.fine : (t.touch ?? t.fine);
      return `<li class="trick${got ? ' is-done' : ''}"><span class="trick__check" aria-hidden="true">${got ? '★' : ''}</span><span><b>${t.title}</b><small>${got ? 'Found' : how}</small></span></li>`;
    }).join('');
  }
}
