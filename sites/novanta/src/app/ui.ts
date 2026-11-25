import { $ } from '@portfolio-lab/kit/dom';

/** Small DOM helpers shared by every part of the site. */

export const euro = (n: number): string => `€ ${n.toFixed(2).replace('.', ',')}`;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (html) el.innerHTML = html;
  return el;
}

export function setPlace(it: string, en: string): void {
  $('[data-place-it]').textContent = it;
  $('[data-place-en]').textContent = en;
  document.title = `${it} · NOVANTA`;
}

let noteTimer = 0;
let noteQueue: [string, string, number][] = [];
let noteBusy = false;

/** A handwritten note from the pizzaiolo: Italian first, the English underneath. */
export function note(it: string, en: string, ms = 4200): void {
  noteQueue.push([it, en, ms]);
  if (!noteBusy) nextNote();
}

function nextNote(): void {
  const el = $('[data-note]');
  const n = noteQueue.shift();
  if (!n) {
    noteBusy = false;
    return;
  }
  noteBusy = true;
  $('[data-note-it]').textContent = n[0];
  $('[data-note-en]').textContent = n[1];
  el.hidden = false;
  el.classList.remove('is-leaving');
  // Restart the entrance animation.
  void el.offsetWidth;
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    el.classList.add('is-leaving');
    noteTimer = window.setTimeout(() => {
      el.hidden = true;
      nextNote();
    }, 400);
  }, n[2]);
}

export function clearNotes(): void {
  noteQueue = [];
  window.clearTimeout(noteTimer);
  $('[data-note]').hidden = true;
  noteBusy = false;
}

export function announce(text: string): void {
  $('[data-announce]').textContent = text;
}

/**
 * Opens a sheet (side panel on desktop, bottom sheet on phones). Returns its body: the element that holds the
 * content and scrolls it, inside the sheet's rounded frame.
 */
export function sheet(html: string, opts: { chalk?: boolean; onClose?: () => void } = {}): HTMLElement {
  const el = $('[data-sheet]');
  el.className = `sheet${opts.chalk ? ' sheet--chalk' : ''}`;
  el.innerHTML = `<div class="sheet__body">${opts.onClose ? '<button type="button" class="sheet__close" data-sheet-close aria-label="Close">×</button>' : ''}${html}</div>`;
  el.hidden = false;
  const close = el.querySelector<HTMLButtonElement>('[data-sheet-close]');
  if (close && opts.onClose) close.addEventListener('click', opts.onClose);
  return el.querySelector<HTMLElement>('.sheet__body')!;
}

export function closeSheet(): void {
  const el = $('[data-sheet]');
  el.hidden = true;
  el.innerHTML = '';
}

export function isPhone(): boolean {
  return matchMedia('(max-width: 760px)').matches;
}

/** Renders a topping's first sprite into a small canvas (for chips). */
export function spriteChip(image: CanvasImageSource, cell: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 92;
  const g = c.getContext('2d')!;
  g.drawImage(image, cell.x, cell.y, cell.w, cell.h, 0, 0, 92, 92);
  return c;
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
