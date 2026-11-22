import { gsap } from 'gsap';
import type Lenis from 'lenis';
import { runGate as runKitGate, type Task } from '@portfolio-lab/kit/gate';
import { $ } from '../lib/dom';
import type { Sound } from '../lib/sound';

/**
 * Loading gate: real preload progress on a light bar, then the sound choice. The exit is an "ignition": the bar
 * flares, the screen flashes, and the returned promise resolves at that flash so the hero intro starts in sync.
 */
export function runGate(opts: { sound: Sound; lenis: Lenis; tasks: Task[] }): Promise<boolean> {
  const { sound, lenis, tasks } = opts;
  const gate = $('[data-gate]');
  const barFill = $('.gate__bar span', gate);
  const count = $('[data-gate-count]', gate);

  return runKitGate({
    root: gate,
    sound,
    lenis,
    tasks,
    progress: (shown) => {
      barFill.style.setProperty('--p', shown.toFixed(4));
      count.textContent = String(Math.round(shown * 100)).padStart(3, '0');
    },
    leave: (_withSound, reveal) => {
      sound.powerUp();
      gate.classList.add('is-leaving');
      return gsap
        .timeline()
        .to(barFill, { scaleY: 7, duration: 0.09, ease: 'power2.in' })
        .add(() => {
          gsap.fromTo('.flash', { opacity: 0.9 }, { opacity: 0, duration: 1.1, ease: 'power2.out' });
          reveal();
        })
        .to(gate, { autoAlpha: 0, duration: 0.55, ease: 'power2.out' })
        .then(() => undefined);
    },
  });
}
