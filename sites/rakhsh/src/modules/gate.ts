import { gsap } from 'gsap';
import type Lenis from 'lenis';
import { $, finePointer } from '../lib/dom';
import type { Sound } from '../lib/sound';

/** iOS only delivers device orientation after a permission prompt, which must come from a user gesture. */
function requestMotion(): void {
  if (finePointer()) return;
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (typeof D?.requestPermission === 'function') void D.requestPermission().catch(() => undefined);
}

export type Task = (report: (fraction: number) => void) => Promise<unknown>;

const MIN_MS = 1500;
const MAX_MS = 14000;

/**
 * Loading gate: shows real preload progress on a light bar, then asks for the sound choice.
 * Resolves at the moment of the "ignition" flash so the hero intro starts in sync with it.
 */
export function runGate(opts: { sound: Sound; lenis: Lenis; tasks: Task[] }): Promise<void> {
  const { sound, lenis, tasks } = opts;
  const gate = $('[data-gate]');
  const barFill = $('.gate__bar span', gate);
  const count = $('[data-gate-count]', gate);
  const html = document.documentElement;
  html.classList.add('is-locked');
  lenis.stop();

  const parts = tasks.map(() => 0);
  tasks.forEach((task, i) => {
    task((f) => {
      parts[i] = Math.max(parts[i], Math.min(1, f));
    })
      .catch(() => undefined)
      .finally(() => {
        parts[i] = 1;
      });
  });

  return new Promise((resolve) => {
    const t0 = performance.now();
    let shown = 0;
    let ready = false;

    const frame = (): void => {
      const elapsed = performance.now() - t0;
      const real = parts.reduce((a, b) => a + b, 0) / Math.max(1, parts.length);
      const goal = elapsed > MAX_MS ? 1 : Math.min(real, elapsed / MIN_MS);
      shown += (goal - shown) * 0.1;
      if (goal - shown < 0.003) shown = goal;
      barFill.style.setProperty('--p', shown.toFixed(4));
      count.textContent = String(Math.round(shown * 100)).padStart(3, '0');
      if (shown >= 1 && !ready) {
        ready = true;
        gate.classList.add('is-ready');
        gate.querySelector<HTMLButtonElement>('[data-enter="sound"]')?.focus({ preventScroll: true });
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    const enter = (withSound: boolean): void => {
      if (!ready) return;
      requestMotion();
      sound.setEnabled(withSound);
      sound.crack(0.9);
      gate.classList.add('is-leaving');
      const tl = gsap.timeline();
      tl.to(barFill, { scaleY: 7, duration: 0.09, ease: 'power2.in' })
        .add(() => {
          gsap.fromTo('.flash', { opacity: 0.9 }, { opacity: 0, duration: 1.1, ease: 'power2.out' });
          resolve();
        })
        .to(gate, { autoAlpha: 0, duration: 0.55, ease: 'power2.out' })
        .add(() => {
          gate.remove();
          html.classList.remove('is-locked');
          lenis.start();
        });
    };

    gate.querySelectorAll<HTMLButtonElement>('[data-enter]').forEach((btn) => {
      btn.addEventListener('click', () => enter(btn.dataset.enter === 'sound'), { once: true });
    });
  });
}
