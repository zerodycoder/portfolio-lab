import { gsap } from 'gsap';
import type Lenis from 'lenis';
import * as THREE from 'three';
import { runGate as runKitGate, type Task } from '@portfolio-lab/kit/gate';
import { bot, LEDS } from '../lib/bot';
import { $ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import { LedFace } from '../three/face';
import type { Robot } from '../three/robot';
import type { Stage } from '../three/stage';

/** Boot log lines, printed as the real preload progress passes each threshold. */
const LOG: [number, string, string][] = [
  [0.06, 'servos', 'ok'],
  [0.22, 'wheels', 'ok'],
  [0.4, 'face', '800 leds ok'],
  [0.58, 'feelings', 'mostly ok'],
  [0.76, 'curiosity', '100%'],
  [0.92, 'jokes', 'loading…'],
];

/**
 * Entry gate. Nibbo sleeps on a charging battery while fonts load and the 3D scene compiles (real progress), then
 * asks to be woken. On wake its LED visor flies out of the gate and lands exactly on the 3D robot's face: the
 * returned promise resolves on landing so the hero's wake-up animation picks up from there.
 */
export function runGate(o: { sound: Sound; lenis: Lenis; tasks: Task[]; stage: Stage; robot: Robot }): Promise<boolean> {
  const { sound, lenis, tasks, stage, robot } = o;
  const gate = $('[data-gate]');
  const visor = $('[data-gate-visor]', gate);
  const fill = $('[data-gate-fill]', gate);
  const count = $('[data-gate-count]', gate);
  const log = $('[data-gate-log]', gate);
  const title = $('[data-gate-title]', gate);

  const b = bot.get();
  const face = new LedFace(512, LEDS[b.led].hex);
  face.canvas.setAttribute('aria-hidden', 'true');
  visor.replaceChildren(face.canvas);
  face.set('asleep');
  if (bot.shared) title.textContent = `Someone sent you ${b.name}`;

  let alive = true;
  let last = performance.now();
  const loop = (now: number): void => {
    if (!alive) return;
    face.update(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  let logged = 0;
  return runKitGate({
    root: gate,
    sound,
    lenis,
    tasks,
    minMs: 1900,
    progress: (p) => {
      fill.style.setProperty('--p', p.toFixed(4));
      count.textContent = String(Math.round(p * 100)).padStart(3, '0');
      while (logged < LOG.length && p >= LOG[logged][0]) {
        const [, k, v] = LOG[logged++];
        const li = document.createElement('li');
        li.innerHTML = `${k.padEnd(10, '.').replace(/ /g, '&nbsp;')}.... <b>${v}</b>`;
        log.appendChild(li);
      }
      if (p >= 1 && face.mood === 'asleep') {
        face.set('sleepy');
        if (!bot.shared) title.textContent = 'Fully charged';
      }
    },
    leave: (_withSound, reveal) => {
      sound.wake();
      face.set('surprised');
      robot.face.set('surprised');
      gate.classList.add('is-leaving');

      // Where the robot's visor is on screen right now.
      const visorPart = robot.parts.visor;
      visorPart.updateWorldMatrix(true, false);
      const centre = stage.toScreen(visorPart.getWorldPosition(new THREE.Vector3()));
      const scale = robot.root.scale.x;
      const toPx = 1 / stage.wpp;
      const w = 0.98 * scale * toPx;
      const h = 0.62 * scale * toPx;
      const from = visor.getBoundingClientRect();
      const canvasTop = stage.canvas.getBoundingClientRect().top;

      // Lift the visor out of the gate so it can fly over everything while the gate fades (a placeholder keeps
      // the rest of the gate from jumping).
      const placeholder = document.createElement('div');
      placeholder.style.cssText = `width:${from.width}px;height:${from.height}px;flex:none`;
      visor.replaceWith(placeholder);
      document.body.appendChild(visor);
      Object.assign(visor.style, {
        position: 'fixed',
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        margin: '0',
        zIndex: '60',
      });

      const tl = gsap.timeline();
      tl.to(gate.querySelectorAll('.gate__inner > :not([data-gate-visor]), .gate__stack'), { autoAlpha: 0, y: 10, duration: 0.3, stagger: 0.02, ease: 'power2.in' })
        .to(gate, { backgroundColor: 'rgba(245,239,228,0)', duration: 0.7, ease: 'power2.inOut' }, 0.25)
        .to(
          visor,
          {
            left: centre.x - w / 2,
            top: centre.y + canvasTop - h / 2,
            width: w,
            boxShadow: 'inset 0 0 0 0px #2c2939, 0 0px 0px 0px rgba(30,27,46,0)',
            duration: 0.85,
            ease: 'power3.inOut',
          },
          0.3,
        )
        .add(() => reveal())
        .to(visor, { autoAlpha: 0, duration: 0.25, ease: 'power1.out' })
        .add(() => {
          alive = false;
          visor.remove();
        });
      return tl.then(() => undefined);
    },
  });
}
