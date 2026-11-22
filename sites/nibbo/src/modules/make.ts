import { gsap } from 'gsap';
import { ACCESSORIES, bot, LEDS, SHELLS, type Accessory, type Bot, type Led, type Shell } from '../lib/bot';
import { $ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';

/**
 * Configurator: shell colour, face light and something for its head, all applied live to the 3D robot (which
 * reacts to each change). Dragging sideways across the stage spins Nibbo, with a little inertia.
 */
export function initMake(o: { director: Director; brain: Brain; sound: Sound; reduced: boolean }): { update(dt: number): void } {
  const { director, brain, sound, reduced } = o;
  director.add({ id: 'make', el: $('[data-slot="make"]'), mood: 'happy', draggable: false, yaw: -18 });

  function radios<K extends string>(container: HTMLElement, entries: [K, { name: string }][], key: keyof Bot, build: (btn: HTMLButtonElement, k: K) => void): (v: string) => void {
    const buttons = entries.map(([k, v]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', v.name);
      build(btn, k);
      btn.addEventListener('click', () => bot.set(key, k as never));
      container.appendChild(btn);
      return { k, btn };
    });
    container.setAttribute('role', 'radiogroup');
    return (value) => buttons.forEach(({ k, btn }) => btn.setAttribute('aria-checked', String(k === value)));
  }

  const syncShell = radios($('[data-shells]'), Object.entries(SHELLS) as [Shell, { name: string; hex: string }][], 'shell', (btn, k) => {
    btn.className = 'swatch';
    btn.style.setProperty('--c', SHELLS[k].hex);
  });
  const syncLed = radios($('[data-leds]'), Object.entries(LEDS) as [Led, { name: string; hex: string }][], 'led', (btn, k) => {
    btn.className = 'swatch swatch--led';
    btn.style.setProperty('--c', LEDS[k].hex);
  });
  const syncAcc = radios($('[data-accs]'), Object.entries(ACCESSORIES) as [Accessory, { name: string; price: number }][], 'accessory', (btn, k) => {
    btn.className = 'choice';
    const a = ACCESSORIES[k];
    btn.innerHTML = `${a.name}${a.price ? `<small>+$${a.price}</small>` : ''}`;
    btn.removeAttribute('aria-label');
  });

  const shellName = $('[data-shell-name]');
  const ledName = $('[data-led-name]');
  const accName = $('[data-acc-name]');

  bot.subscribe((b, changed) => {
    syncShell(b.shell);
    syncLed(b.led);
    syncAcc(b.accessory);
    shellName.textContent = SHELLS[b.shell].name;
    ledName.textContent = LEDS[b.led].name;
    accName.textContent = ACCESSORIES[b.accessory].name;
    if (!changed || director.current?.id !== 'make') return;
    // Nibbo reacts to its makeover.
    if (changed === 'shell') {
      brain.react('starry', 1.2, false);
      sound.chirp('happy');
      brain.spin();
    } else if (changed === 'led') {
      robotBlink();
      brain.react('surprised', 0.8, false);
      sound.boop();
    } else if (changed === 'accessory') {
      brain.react(b.accessory === 'none' ? 'idle' : 'love', 1.4, false);
      sound.chirp(b.accessory === 'none' ? 'question' : 'love');
      brain.hop(0.3);
    }
  });

  function robotBlink(): void {
    gsap.to(brain.pose, { headNod: 0.12, duration: 0.1, yoyo: true, repeat: 1 });
  }

  // Drag to spin, on the stage area. Vertical drags still scroll (touch-action: pan-y).
  const stage = $('.make__stage');
  let spin = 0;
  let velocity = 0;
  let dragging: { id: number; x: number; t: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    dragging = { id: e.pointerId, x: e.clientX, t: performance.now() };
    velocity = 0;
    brain.input();
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const now = performance.now();
    const dx = e.clientX - dragging.x;
    const dt = Math.max(1, now - dragging.t) / 1000;
    spin += dx * 0.012;
    velocity = (dx * 0.012) / dt;
    dragging.x = e.clientX;
    dragging.t = now;
    if (Math.abs(dx) > 2) brain.input();
  });
  const release = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragging.id) return;
    dragging = null;
    if (Math.abs(velocity) > 9) {
      brain.react('dizzy', 1.2, false);
      sound.whee();
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  return {
    update(dt) {
      const here = director.current?.id === 'make';
      if (!dragging) {
        spin += velocity * dt;
        velocity *= Math.exp(-3 * dt);
        if (!here && !reduced) {
          // Out of the section: unwind the spin to the nearest full turn.
          const home = Math.round(spin / (Math.PI * 2)) * Math.PI * 2;
          spin += (home - spin) * (1 - Math.exp(-4 * dt));
        }
      }
      director.extraYaw = spin;
    },
  };
}
