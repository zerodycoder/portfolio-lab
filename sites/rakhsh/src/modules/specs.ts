import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $$ } from '../lib/dom';

/** Spec counters count up once when they scroll into view; each cell's rule draws in alongside. */
export function initSpecs(reduced: boolean): void {
  $$('[data-count]').forEach((el) => {
    const to = parseFloat(el.dataset.count ?? '0');
    const dec = Number(el.dataset.dec ?? 0);
    const cell = el.closest('.spec');
    const state = { v: 0 };
    const render = (): void => {
      el.textContent = state.v.toFixed(dec);
    };
    if (reduced) {
      state.v = to;
      render();
      cell?.classList.add('is-in');
      return;
    }
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        cell?.classList.add('is-in');
        gsap.to(state, { v: to, duration: 1.9, ease: 'power3.out', onUpdate: render });
      },
    });
  });
}
