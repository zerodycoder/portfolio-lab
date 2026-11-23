import { gsap } from 'gsap';
import type Lenis from 'lenis';
import { $ } from '@portfolio-lab/kit/dom';
import { runGate as runKitGate, type Task } from '@portfolio-lab/kit/gate';
import type { Sound } from '../lib/sound';

/** The brew log, printed as real progress passes each step. */
const LOG: [number, string, string][] = [
  [0.05, 'grind', '18 g, medium-fine'],
  [0.24, 'water', '93 °C'],
  [0.42, 'bloom', '30 s'],
  [0.6, 'pour', '250 g'],
  [0.78, 'fonts', 'set'],
  [0.94, 'shaders', 'compiled'],
];

/**
 * Entry gate: a cup seen from above fills with coffee as the page really loads (fonts, the fluid's shaders, the
 * table photo). Coming in, the gate's coffee flies to the hero cup and lands exactly on the real liquid, where the
 * first pour picks up. Resolves with whether the visitor chose sound.
 */
export function runGate(o: { sound: Sound; lenis: Lenis; tasks: Task[]; target: () => DOMRect | null }): Promise<boolean> {
  const gate = $('[data-gate]');
  const cup = $('[data-gate-cup]', gate);
  const coffee = $('[data-gate-coffee]', gate);
  const count = $('[data-gate-count]', gate);
  const log = $('[data-gate-log]', gate);
  const title = $('[data-gate-title]', gate);
  let logged = 0;
  return runKitGate({
    root: gate,
    sound: o.sound,
    lenis: o.lenis,
    tasks: o.tasks,
    minMs: 1800,
    progress: (p) => {
      coffee.style.setProperty('--p', p.toFixed(4));
      count.textContent = String(Math.round(p * 100)).padStart(3, '0');
      while (logged < LOG.length && p >= LOG[logged][0]) {
        const [, k, v] = LOG[logged++];
        const li = document.createElement('li');
        li.innerHTML = `${k.padEnd(8, '.').replace(/ /g, '&nbsp;')}... <b>${v}</b>`;
        log.appendChild(li);
      }
      if (p >= 1) title.textContent = 'Your coffee is ready';
    },
    leave: (withSound, reveal) => {
      if (withSound) o.sound.welcome();
      gate.classList.add('is-leaving');
      const target = o.target();
      const from = coffee.getBoundingClientRect();
      const tl = gsap.timeline();
      tl.to(gate.querySelectorAll('.gate__inner > :not([data-gate-cup]), .gate__stack'), { autoAlpha: 0, y: 8, duration: 0.3, stagger: 0.02, ease: 'power2.in' });
      if (target && target.width > 0) {
        // Lift the coffee disk out and fly it onto the hero's liquid.
        const disk = coffee.cloneNode(true) as HTMLElement;
        disk.classList.add('gate__flyer');
        Object.assign(disk.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, zIndex: '90', margin: '0' });
        document.body.appendChild(disk);
        tl.to(cup, { autoAlpha: 0, duration: 0.25 }, 0.1)
          .to(gate, { backgroundColor: 'rgba(0,0,0,0)', duration: 0.6, ease: 'power2.inOut' }, 0.2)
          .to(disk, { left: target.left, top: target.top, width: target.width, height: target.height, duration: 0.9, ease: 'power3.inOut' }, 0.2)
          .add(() => reveal())
          .to(disk, { autoAlpha: 0, duration: 0.35 })
          .add(() => disk.remove());
      } else {
        tl.to(gate, { autoAlpha: 0, duration: 0.6, ease: 'power2.inOut' }, 0.15).add(() => reveal());
      }
      return tl.then(() => undefined);
    },
  });
}
