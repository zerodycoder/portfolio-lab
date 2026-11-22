import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** Lenis smooth scrolling driven by GSAP's ticker so every scroll-linked animation shares one clock. */
export function initSmooth(reduced: boolean): Lenis {
  const lenis = new Lenis({
    duration: 1.15,
    smoothWheel: !reduced,
    wheelMultiplier: 1,
    touchMultiplier: 1.3,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href') ?? '';
    const target = id === '#top' ? 0 : document.querySelector<HTMLElement>(id);
    if (target === null) return;
    e.preventDefault();
    lenis.scrollTo(target, { duration: reduced ? 0 : 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
  });

  // Exposed for the screenshot tooling in tools/shoot.mjs.
  (window as unknown as { __lenis: Lenis; __st: typeof ScrollTrigger }).__lenis = lenis;
  (window as unknown as { __st: typeof ScrollTrigger }).__st = ScrollTrigger;
  return lenis;
}
