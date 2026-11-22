import { gsap } from 'gsap';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el as T;
};

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll(sel)) as T[];

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = (): boolean => matchMedia('(pointer: fine)').matches;
export const isNarrow = (): boolean => matchMedia('(max-width: 760px)').matches;

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/** Calls back whenever the element enters or leaves the viewport (optionally expanded by rootMargin). */
export function onVisible(el: Element, cb: (visible: boolean) => void, rootMargin = '0px', threshold = 0): IntersectionObserver {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), { rootMargin, threshold });
  io.observe(el);
  return io;
}

/** Sizes a canvas backing store to its CSS box at a capped device pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): { w: number; h: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  return { w, h, dpr };
}

/** A frame loop on GSAP's ticker (shared with Lenis), started and stopped on demand. */
export function createLoop(fn: (time: number, dtMs: number) => void): { start(): void; stop(): void; readonly running: boolean } {
  let on = false;
  const tick = (time: number, deltaTime: number): void => fn(time, deltaTime);
  return {
    start() {
      if (on) return;
      on = true;
      gsap.ticker.add(tick);
    },
    stop() {
      if (!on) return;
      on = false;
      gsap.ticker.remove(tick);
    },
    get running() {
      return on;
    },
  };
}

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
