import type Lenis from 'lenis';
import type { AudioEngine } from './audio';
import { finePointer } from './dom';

/** iOS only delivers device orientation after a permission prompt, which must come from a user gesture. */
export function requestMotion(): void {
  if (finePointer()) return;
  const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (typeof D?.requestPermission === 'function') void D.requestPermission().catch(() => undefined);
}

export type Task = (report: (fraction: number) => void) => Promise<unknown>;

export type GateOptions = {
  /** The gate element. It must contain the `[data-enter="sound"]` and `[data-enter="mute"]` buttons. */
  root: HTMLElement;
  sound: AudioEngine;
  lenis: Lenis;
  /** Preload work. Each task reports its own progress; a failed task counts as done so it never blocks entry. */
  tasks: Task[];
  /** The bar never fills faster than this, so the gate doesn't just flicker past on a fast connection. */
  minMs?: number;
  /** After this the gate is ready whatever the network is doing. */
  maxMs?: number;
  /** Draws the smoothed progress (0..1), every frame until it reaches 1. */
  progress: (shown: number) => void;
  /** Plays the exit. Call `reveal()` when the page's intro should start; resolve when the gate can be removed. */
  leave: (withSound: boolean, reveal: () => void) => Promise<unknown> | void;
};

/**
 * Loading gate: shows real preload progress, then asks for the sound choice (audio needs a user gesture).
 * Resolves at the site's reveal moment, with whether the visitor chose sound.
 */
export function runGate(o: GateOptions): Promise<boolean> {
  const { root, sound, lenis, tasks } = o;
  const minMs = o.minMs ?? 1500;
  const maxMs = o.maxMs ?? 14000;
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

    let last = t0;
    const frame = (): void => {
      const now = performance.now();
      const elapsed = now - t0;
      // Eased by time, not by frames: on a slow device (few frames a second) the bar still lands on time.
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const real = parts.reduce((a, b) => a + b, 0) / Math.max(1, parts.length);
      const goal = elapsed > maxMs ? 1 : Math.min(real, elapsed / minMs);
      shown += (goal - shown) * Math.min(1, dt * 7);
      if (goal - shown < 0.01) shown = goal;
      o.progress(shown);
      if (shown >= 1 && !ready) {
        ready = true;
        root.classList.add('is-ready');
        root.querySelector<HTMLButtonElement>('[data-enter="sound"]')?.focus({ preventScroll: true });
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    let entered = false;
    const enter = (withSound: boolean): void => {
      if (!ready || entered) return;
      entered = true;
      requestMotion();
      sound.setEnabled(withSound);
      let revealed = false;
      const reveal = (): void => {
        if (revealed) return;
        revealed = true;
        resolve(withSound);
      };
      void Promise.resolve(o.leave(withSound, reveal)).then(() => {
        reveal();
        root.remove();
        html.classList.remove('is-locked');
        lenis.start();
      });
    };

    root.querySelectorAll<HTMLButtonElement>('[data-enter]').forEach((btn) => {
      btn.addEventListener('click', () => enter(btn.dataset.enter === 'sound'));
    });
  });
}
