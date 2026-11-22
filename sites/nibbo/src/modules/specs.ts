import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$ } from '../lib/dom';
import type { Director } from '../three/director';

/** Spec cards count up as they arrive; Nibbo perches next to the heading. */
export function initSpecs(o: { director: Director; reduced: boolean }): void {
  o.director.add({ id: 'specs', el: $('[data-slot="specs"]'), mood: 'idle', draggable: true, yaw: -24 });
  $$('[data-count-to]').forEach((el) => {
    const to = Number(el.dataset.countTo);
    if (o.reduced) return;
    const n = { v: 0 };
    el.textContent = '0';
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () =>
        gsap.to(n, {
          v: to,
          duration: to > 100 ? 1.6 : 1,
          ease: 'power3.out',
          onUpdate: () => void (el.textContent = Math.round(n.v).toLocaleString('en')),
        }),
    });
  });
  gsap.from('.spec', { y: 40, autoAlpha: 0, duration: 0.7, stagger: 0.07, ease: 'back.out(1.4)', scrollTrigger: { trigger: '.spec-grid', start: 'top 85%', once: true } });
}
