import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';
import * as THREE from 'three';
import { $, isNarrow } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director, Slot } from '../three/director';
import type { Mood } from '../three/face';
import { ROBOT_H, type Robot } from '../three/robot';
import type { Stage } from '../three/stage';
import type { Tricks } from './tricks';

const MM_PER_UNIT = 110 / ROBOT_H; // Nibbo is 11 cm tall

type Ctx = { robot: Robot; brain: Brain; sound: Sound };

/**
 * The guided tour, one part at a time. `yaw`/`pitch` turn the robot so the part faces the viewer, and `show`
 * makes the real robot demonstrate what the part is for.
 */
const PARTS: { anchor: string; tag: string; title: string; text: string; chips: string[]; yaw: number; pitch: number; dy?: number; show: (c: Ctx) => void }[] = [
  {
    anchor: 'face',
    tag: 'Face',
    title: '800-LED face',
    text: 'A 40 × 20 grid of tiny lights behind smoked glass. Its expressions are drawn live, so they blink, look around and blend into each other.',
    chips: ['40 × 20 LEDs', '15 expressions', 'Smoked glass'],
    yaw: 0,
    pitch: 4,
    show: ({ brain }) => {
      const seq: Mood[] = ['happy', 'love', 'surprised', 'starry', 'wink'];
      seq.forEach((m, i) => setTimeout(() => brain.react(m, 0.7, false), i * 600));
    },
  },
  {
    anchor: 'touch',
    tag: 'Touch pad',
    title: 'Touch-sensitive head',
    text: 'A copper pad under the shell feels every pat and poke. A pat calms Nibbo down; a poke makes it giggle.',
    chips: ['Capacitive', '3 zones'],
    yaw: 8,
    pitch: 30,
    show: ({ robot, brain, sound }) => {
      robot.demo('touch', 1.4);
      brain.react('joy', 1.2, false);
      sound.giggle();
    },
  },
  {
    anchor: 'antenna',
    tag: 'Antenna',
    title: 'Mood antenna',
    text: 'A soft spring with a light on top. It glows in the face colour and wobbles when Nibbo gets excited.',
    chips: ['Spring steel', 'RGB light'],
    yaw: 22,
    pitch: 10,
    show: ({ brain, sound }) => {
      brain.kickAntenna(9);
      sound.boop();
    },
  },
  {
    anchor: 'brain',
    tag: 'Brain',
    title: 'Pocket brain',
    text: 'Runs your programs on the robot itself. No cloud, no account and no Wi-Fi needed: the plan lives right here.',
    chips: ['Dual-core', 'Works offline', 'Bluetooth LE'],
    yaw: -34,
    pitch: 12,
    dy: -16,
    show: ({ robot, brain }) => {
      robot.demo('pcb', 2.2);
      brain.react('focus', 2, false);
    },
  },
  {
    anchor: 'imu',
    tag: 'Motion sensor',
    title: 'Motion sensor',
    text: 'Feels which way is up and every shake. That is how Nibbo knows it is being thrown, and why spinning it round makes it dizzy.',
    chips: ['6-axis', '1,000 reads a second'],
    yaw: -34,
    pitch: 16,
    dy: 18,
    show: ({ brain, sound }) => {
      brain.react('dizzy', 1.6, false);
      sound.woozy();
      brain.shiver();
    },
  },
  {
    anchor: 'servos',
    tag: 'Servos',
    title: 'Four quiet servos',
    text: 'One in each shoulder, two in the neck. They do the waving, pointing, nodding and some very small dances.',
    chips: ['4 servos', 'Metal gears', 'Whisper-quiet'],
    yaw: 30,
    pitch: 6,
    show: ({ brain }) => {
      brain.wave();
      brain.nod(2);
    },
  },
  {
    anchor: 'heart',
    tag: 'Heart dial',
    title: 'Heart dial',
    text: 'Turn it to wake Nibbo up or tuck it in. Press it to say hello. It glows in the colour of the face light.',
    chips: ['Click wheel', 'Mood light'],
    yaw: 0,
    pitch: 4,
    show: ({ robot, brain, sound }) => {
      gsap.fromTo(robot.parts.heart.rotation, { z: 0 }, { z: Math.PI * 2, duration: 1.1, ease: 'back.inOut(1.4)' });
      brain.react('love', 1.4, false);
      sound.chirp('love');
    },
  },
  {
    anchor: 'speaker',
    tag: 'Speaker',
    title: 'Speaker',
    text: 'Speaks fluent beep. Hundreds of sounds, not one word, and somehow you always know exactly what it means.',
    chips: ['28 mm driver', 'Volume capped for small ears'],
    yaw: 32,
    pitch: 6,
    show: ({ robot, sound }) => {
      robot.demo('speaker', 1.2);
      sound.chirp('happy');
    },
  },
  {
    anchor: 'battery',
    tag: 'Battery',
    title: 'Four-hour battery',
    text: 'Four hours of play, back to full in 45 minutes over USB-C. When it runs low, Nibbo starts to yawn.',
    chips: ['2,000 mAh', 'USB-C', '45 min to full'],
    yaw: -30,
    pitch: 4,
    show: ({ robot, sound }) => {
      robot.demo('cells', 1.6);
      sound.spark();
    },
  },
  {
    anchor: 'wheels',
    tag: 'Wheels',
    title: 'Gear motors and cliff sensors',
    text: 'Two tiny gear motors with grippy tyres, and infrared sensors in the bumper that stop it at the edge of the table.',
    chips: ['2 gear motors', 'Infrared cliff sensors'],
    yaw: 36,
    pitch: 4,
    show: ({ robot, sound }) => {
      robot.demo('cliff', 1.6);
      robot.wheelSpeed = 16;
      setTimeout(() => (robot.wheelSpeed = 0), 1300);
      sound.roll(0.5, 2);
    },
  },
];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const window01 = (p: number, a: number, b: number): number => Math.min(1, Math.max(0, (p - a) / (b - a)));
const TOUR_START = 0.13;
const TOUR_END = 0.91;
const STEP = (TOUR_END - TOUR_START) / PARTS.length;

/**
 * Pinned anatomy tour. Scrolling takes Nibbo apart, then visits each part in turn: the robot turns that part to
 * the viewer, the part swells and glows, the robot shows off what it does, and a card explains it. Labels ride
 * on the real 3D parts. The X-ray switch turns the section into a blueprint: wireframe robot, engineering title
 * block and live dimension lines (in millimetres) around the current part.
 */
export function initInside(o: {
  director: Director;
  robot: Robot;
  brain: Brain;
  stage: Stage;
  sound: Sound;
  lenis: Lenis;
  tricks: Tricks;
}): { update(): void } {
  const { director, robot, brain, stage, sound, lenis, tricks } = o;
  const ctx: Ctx = { robot, brain, sound };
  const section = $('.inside');
  const pin = $('.inside__pin');
  let apart = 0;
  const slot: Slot = {
    id: 'inside',
    el: $('[data-slot="inside"]'),
    mood: 'idle',
    draggable: false,
    yaw: 0,
    pitch: 0,
    // Taken apart, Nibbo is about 1.8 times as tall (head up, wheels down), so it shrinks to stay in its box.
    pose: (out, rect) => {
      director.boxPose(slot, rect, out);
      const k = 1 - 0.44 * apart;
      out.scale *= k;
      out.pos.y += 0.42 * out.scale * apart;
      return true;
    },
  };
  director.add(slot);

  const tagsEl = $('[data-tags]');
  const svg = $<SVGSVGElement>('[data-lines]');
  const list = $('[data-parts]');
  const card = $('[data-part-card]');
  const cardN = $('[data-part-n]');
  const cardTitle = $('[data-part-title]');
  const cardText = $('[data-part-text]');
  const cardChips = $('[data-part-chips]');
  const SVG = 'http://www.w3.org/2000/svg';

  const tags = PARTS.map((part, i) => {
    const li = document.createElement('li');
    li.className = 'tag';
    li.textContent = part.tag;
    li.addEventListener('click', () => goTo(i));
    tagsEl.appendChild(li);
    const g = document.createElementNS(SVG, 'g');
    const line = document.createElementNS(SVG, 'line');
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('r', '4.5');
    g.append(line, dot);
    svg.appendChild(g);
    return { li, g, line, dot };
  });

  // Dimension lines for the blueprint view.
  const dims = document.createElementNS(SVG, 'g');
  dims.setAttribute('class', 'dims');
  dims.innerHTML =
    '<line data-d="w"/><line data-d="w0"/><line data-d="w1"/><text data-d="wt"/>' + '<line data-d="h"/><line data-d="h0"/><line data-d="h1"/><text data-d="ht"/>';
  svg.appendChild(dims);
  const dim = (k: string): SVGElement => dims.querySelector(`[data-d="${k}"]`) as SVGElement;

  const items = PARTS.map((part, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="mono">${String(i + 1).padStart(2, '0')}</span>${part.tag}`;
    b.addEventListener('click', () => goTo(i));
    li.appendChild(b);
    list.appendChild(li);
    return b;
  });

  let progress = 0;
  let pinned = false;
  let active = -1;

  const trigger = ScrollTrigger.create({
    id: 'inside',
    trigger: section,
    pin,
    start: 'top top',
    end: () => `+=${window.innerHeight * 4.6}`,
    scrub: true,
    onUpdate: (self) => (progress = self.progress),
    onToggle: (self) => {
      pinned = self.isActive;
      // The blueprint belongs to this section: leaving it puts the robot's skin back on.
      if (!pinned && blueprint) setBlueprint(false);
    },
  });

  /** Scrolls to the middle of a part's stretch of the tour. */
  function goTo(i: number): void {
    const p = TOUR_START + STEP * (Math.max(0, Math.min(PARTS.length - 1, i)) + 0.5);
    lenis.scrollTo(trigger.start + (trigger.end - trigger.start) * p, { duration: 1.1, force: true });
  }
  $('[data-part-prev]').addEventListener('click', () => goTo(active - 1));
  $('[data-part-next]').addEventListener('click', () => goTo(active + 1));

  function show(i: number): void {
    if (i === active) return;
    active = i;
    robot.focus(i >= 0 ? PARTS[i].anchor : null);
    tags.forEach((t, k) => {
      t.li.classList.toggle('is-active', k === i);
      t.g.classList.toggle('is-active', k === i);
    });
    items.forEach((b, k) => b.classList.toggle('is-active', k === i));
    if (i < 0) {
      card.classList.remove('is-shown');
      return;
    }
    const p = PARTS[i];
    cardN.textContent = `${String(i + 1).padStart(2, '0')} / ${String(PARTS.length).padStart(2, '0')}`;
    cardTitle.textContent = p.title;
    cardText.textContent = p.text;
    cardChips.innerHTML = p.chips.map((c) => `<li>${c}</li>`).join('');
    card.classList.add('is-shown');
    p.show(ctx);
  }

  // X-ray / blueprint.
  const xray = $('[data-xray]');
  const stats = $('[data-xray-stats]');
  const bg = $('[data-blueprint]');
  const idleStats = stats.textContent ?? '';
  let blueprint = false;
  function setBlueprint(on: boolean): void {
    blueprint = on;
    xray.setAttribute('aria-checked', String(on));
    section.classList.toggle('is-blueprint', on);
    bg.classList.toggle('is-on', on);
    robot.setXray(on, '#d8ecff');
    if (on) {
      const s = robot.stats();
      stats.innerHTML = `${s.meshes} meshes · ${s.triangles.toLocaleString('en')} triangles<br />0 model files · 0 images`;
    } else {
      stats.textContent = idleStats;
    }
  }
  xray.addEventListener('click', () => {
    setBlueprint(!blueprint);
    if (blueprint) {
      brain.react('surprised', 1.2);
      tricks.find('xray');
    }
  });

  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const box = new THREE.Box3();
  const local = new THREE.Box3();
  const inv = new THREE.Matrix4();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let wasApart = false;

  function drawDims(i: number, top: number): void {
    const part = robot.anchors[PARTS[i].anchor].parent!;
    box.setFromObject(part);
    // Size in the robot's own space (mm), without the focus swell.
    inv.copy(robot.model.matrixWorld).invert();
    local.copy(box).applyMatrix4(inv);
    local.getSize(v).divideScalar(part.scale.x || 1);
    const wmm = Math.round(v.x * MM_PER_UNIT);
    const hmm = Math.round(v.y * MM_PER_UNIT);
    const { min, max } = box;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    corners.forEach((c, k) => {
      c.set(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & 4 ? max.z : min.z);
      stage.toScreen(c, c);
      x0 = Math.min(x0, c.x);
      x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.y + top);
      y1 = Math.max(y1, c.y + top);
    });
    const set = (k: string, a: Record<string, number>): void => Object.entries(a).forEach(([n, val]) => dim(k).setAttribute(n, val.toFixed(1)));
    const by = y1 + 16;
    const rx = x1 + 16;
    set('w', { x1: x0, y1: by, x2: x1, y2: by });
    set('w0', { x1: x0, y1: by - 6, x2: x0, y2: by + 6 });
    set('w1', { x1: x1, y1: by - 6, x2: x1, y2: by + 6 });
    set('wt', { x: (x0 + x1) / 2, y: by + 18 });
    dim('wt').textContent = `${wmm} mm`;
    set('h', { x1: rx, y1: y0, x2: rx, y2: y1 });
    set('h0', { x1: rx - 6, y1: y0, x2: rx + 6, y2: y0 });
    set('h1', { x1: rx - 6, y1: y1, x2: rx + 6, y2: y1 });
    set('ht', { x: rx + 10, y: (y0 + y1) / 2 + 4 });
    dim('ht').textContent = `${hmm} mm`;
  }

  return {
    update() {
      const here = director.current?.id === 'inside';
      const p = progress;
      const inTour = p >= TOUR_START && p < TOUR_END;
      const i = inTour ? Math.min(PARTS.length - 1, Math.floor((p - TOUR_START) / STEP)) : -1;
      apart = here ? smooth(window01(p, 0.03, TOUR_START)) * (1 - smooth(window01(p, TOUR_END + 0.01, 1))) : 0;
      robot.setExplode(apart);
      const turn = smooth(window01(p, 0.02, TOUR_START)) * (1 - smooth(window01(p, TOUR_END, 1)));
      const pose = PARTS[Math.max(0, i)];
      slot.yaw = (i >= 0 ? pose.yaw : 6) * turn;
      slot.pitch = (i >= 0 ? pose.pitch : 4) * turn;
      if (apart > 0.05 !== wasApart) {
        wasApart = apart > 0.05;
        sound.servo(wasApart);
        if (wasApart) brain.react('surprised', 0.8, false);
      }
      slot.mood = apart > 0.5 ? 'curious' : 'idle';
      if (here && !brain.busy) brain.setBaseMood(slot.mood);

      const live = pinned && here && apart > 0.85 && i >= 0;
      show(live ? i : -1);
      section.classList.toggle('is-touring', live);
      dims.style.opacity = live && blueprint ? '1' : '0';

      if (!live) {
        tags.forEach((t) => {
          t.li.classList.remove('is-shown');
          t.g.style.opacity = '0';
        });
        return;
      }

      const pinRect = pin.getBoundingClientRect();
      const canvasTop = stage.canvas.getBoundingClientRect().top;
      stage.toScreen(robot.parts.chassis.getWorldPosition(centre), centre);
      const narrow = isNarrow();
      const reach = narrow ? 18 : 46;
      tags.forEach((t, k) => {
        const anchor = robot.anchors[PARTS[k].anchor];
        stage.toScreen(anchor.getWorldPosition(v), v);
        const ax = v.x;
        const ay = v.y + canvasTop - pinRect.top;
        const side = ax < centre.x ? -1 : 1;
        const w = t.li.offsetWidth;
        const h = t.li.offsetHeight;
        let tx = ax + side * reach;
        if (side < 0) tx -= w;
        tx = Math.max(6, Math.min(pinRect.width - w - 6, tx));
        const ty = ay - h / 2 - (narrow ? 8 : 14) + (PARTS[k].dy ?? 0);
        t.li.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
        // Phones only have room for the current part's label; the others keep a dot.
        const labelled = !narrow || k === active;
        t.li.classList.toggle('is-shown', labelled);
        t.line.style.visibility = labelled ? 'visible' : 'hidden';
        const ex = side < 0 ? tx + w : tx;
        t.line.setAttribute('x1', ax.toFixed(1));
        t.line.setAttribute('y1', ay.toFixed(1));
        t.line.setAttribute('x2', ex.toFixed(1));
        t.line.setAttribute('y2', (ty + h / 2).toFixed(1));
        t.dot.setAttribute('cx', ax.toFixed(1));
        t.dot.setAttribute('cy', ay.toFixed(1));
        t.g.style.opacity = '1';
      });
      if (blueprint) drawDims(active, canvasTop - pinRect.top);
    },
  };
}
