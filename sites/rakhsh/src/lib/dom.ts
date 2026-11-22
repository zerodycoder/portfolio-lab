import { gsap } from 'gsap';
import { reducedMotion } from '@portfolio-lab/kit/dom';

export * from '@portfolio-lab/kit/dom';

/** Flags an empty media slot in development so missing assets are obvious; no-op in production builds. */
export function devMissing(el: HTMLElement, name: string): void {
  if (import.meta.env.DEV) el.dataset.missing = name;
}

/** Fires the full-screen white flash used for ignition moments. */
export function flash(strength = 0.8, duration = 0.9): void {
  const el = document.querySelector<HTMLElement>('.flash');
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { opacity: strength }, { opacity: 0, duration, ease: 'power2.out', overwrite: true });
}
