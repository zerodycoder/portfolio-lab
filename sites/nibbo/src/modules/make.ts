import { gsap } from 'gsap';
import * as THREE from 'three';
import { ACCESSORIES, bot, LEDS, SHELLS, type Accessory, type Bot, type Led, type Shell } from '../lib/bot';
import { $ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import type { Robot } from '../three/robot';
import type { Tricks } from './tricks';

/** The turntable Nibbo stands on in the configurator: cream top, a ring in the shell colour, ticks round the rim. */
function turntable(): { group: THREE.Group; ring: THREE.MeshPhysicalMaterial } {
  const group = new THREE.Group();
  const cream = new THREE.MeshPhysicalMaterial({ color: '#fffaf1', roughness: 0.4, clearcoat: 0.6 });
  const ring = new THREE.MeshPhysicalMaterial({ color: '#ff6a2b', roughness: 0.35, clearcoat: 1 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.1, 64), cream);
  top.position.y = -0.05;
  group.add(top);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.2, 0.14, 64), ring);
  band.position.y = -0.16;
  group.add(band);
  const tick = new THREE.BoxGeometry(0.03, 0.012, 0.12);
  const ink = new THREE.MeshBasicMaterial({ color: '#1e1b2e' });
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(tick, ink);
    const a = (i / 24) * Math.PI * 2;
    m.position.set(Math.sin(a) * 1.02, 0.002, Math.cos(a) * 1.02);
    m.rotation.y = a;
    group.add(m);
  }
  group.scale.setScalar(0.001);
  group.visible = false;
  return { group, ring };
}

/**
 * Configurator: shell colour, face light and something for its head, all applied live to the 3D robot (which
 * reacts to each change). Dragging sideways across the stage spins Nibbo, with a little inertia.
 */
export function initMake(o: { director: Director; brain: Brain; robot: Robot; sound: Sound; tricks: Tricks; reduced: boolean }): { update(dt: number): void } {
  const { director, brain, robot, sound, tricks, reduced } = o;
  const table = turntable();
  robot.root.add(table.group);
  director.add({
    id: 'make',
    el: $('[data-slot="make"]'),
    mood: 'happy',
    draggable: false,
    yaw: -18,
  });

  // The turntable rises under Nibbo once it has landed in the configurator (not mid-flight, where on a phone it
  // would pop up at the screen edge over the text), and sinks away when it leaves.
  let tableUp = false;
  const setTable = (up: boolean): void => {
    if (up === tableUp) return;
    tableUp = up;
    if (up) {
      table.group.visible = true;
      gsap.to(table.group.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: 'back.out(1.6)', overwrite: true });
    } else {
      gsap.to(table.group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in', overwrite: true, onComplete: () => void (table.group.visible = false) });
    }
  };

  function radios<K extends string>(container: HTMLElement, entries: [K, { name: string }][], key: keyof Bot, build: (btn: HTMLButtonElement, k: K) => void): (v: string) => void {
    const buttons = entries.map(([k, v]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', v.name);
      build(btn, k);
      btn.addEventListener('click', () => {
        bot.set(key, k as never);
        tricks.find('makeover');
      });
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

  // Surprise me: a random robot that differs from the current one in every option.
  $('[data-surprise]').addEventListener('click', () => {
    const pick = <T extends string>(all: T[], now: T): T => {
      const rest = all.filter((x) => x !== now);
      return rest[Math.floor(Math.random() * rest.length)];
    };
    const cur = bot.get();
    bot.set('shell', pick(Object.keys(SHELLS) as Shell[], cur.shell));
    bot.set('led', pick(Object.keys(LEDS) as Led[], cur.led));
    bot.set('accessory', pick(Object.keys(ACCESSORIES) as Accessory[], cur.accessory));
    velocity = 14;
    brain.react('starry', 1.4, false);
    sound.jingle();
    tricks.find('makeover');
  });

  bot.subscribe((b, changed) => {
    table.ring.color.set(SHELLS[b.shell].hex);
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
      setTable(here && director.nearness > 0.75);
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
