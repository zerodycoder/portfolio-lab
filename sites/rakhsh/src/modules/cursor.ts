import { gsap } from 'gsap';
import { $, finePointer } from '../lib/dom';
import type { Sound } from '../lib/sound';

/** Dot + trailing ring cursor for mouse users. The ring grows over interactive elements and can carry a label. */
export function initCursor(sound: Sound): void {
  if (!finePointer()) return;
  const root = $('.cursor');
  const dot = $('.cursor__dot', root);
  const ring = $('.cursor__ring', root);
  const label = $('.cursor__label', root);
  document.documentElement.classList.add('has-cursor');

  let x = -100;
  let y = -100;
  let rx = x;
  let ry = y;
  let seen = false;
  let current: Element | null = null;

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        seen = true;
        rx = x;
        ry = y;
        root.classList.add('is-visible');
      }
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => root.classList.remove('is-visible'));
  document.documentElement.addEventListener('pointerenter', () => seen && root.classList.add('is-visible'));
  window.addEventListener('pointerdown', () => root.classList.add('is-down'));
  window.addEventListener('pointerup', () => root.classList.remove('is-down'));

  document.addEventListener('pointerover', (e) => {
    const target = (e.target as Element | null)?.closest('a, button, [data-cursor], label, input') ?? null;
    if (target === current) return;
    current = target;
    const text = (target as HTMLElement | null)?.dataset?.cursor ?? '';
    label.textContent = text;
    root.classList.toggle('is-hover', !!target);
    root.classList.toggle('has-label', !!text);
    root.classList.toggle('is-text', !!target?.matches('input'));
    if (target?.matches('a, button')) sound.tick(0.6);
  });

  gsap.ticker.add(() => {
    rx += (x - rx) * 0.2;
    ry += (y - ry) * 0.2;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
  });
}
