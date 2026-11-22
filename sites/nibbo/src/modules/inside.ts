import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import { $, isNarrow } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director, Slot } from '../three/director';
import type { Robot } from '../three/robot';
import type { Stage } from '../three/stage';

const PARTS: { anchor: string; tag: string; title: string; text: string }[] = [
  { anchor: 'face', tag: 'Face', title: '800-LED face', text: 'A matrix of tiny lights behind smoked glass. Fifteen expressions so far, and it picks its own.' },
  { anchor: 'antenna', tag: 'Antenna', title: 'Mood antenna', text: 'Glows in the colour of its face light, and wobbles on a spring when it gets excited.' },
  { anchor: 'brain', tag: 'Brain', title: 'Pocket brain', text: 'Runs your programs right on the robot. No cloud, no account, no Wi-Fi required.' },
  { anchor: 'heart', tag: 'Heart dial', title: 'Heart dial', text: 'Turn it to wake Nibbo up or tuck it in. Press it to say hello.' },
  { anchor: 'arms', tag: 'Arms', title: 'Two servo arms', text: 'For waving, pointing, stretching and some very small dances.' },
  { anchor: 'battery', tag: 'Battery', title: 'Four-hour battery', text: 'Four hours of play, back to full in 45 minutes over USB-C.' },
  { anchor: 'speaker', tag: 'Speaker', title: 'Speaker', text: 'Speaks fluent beep. Hundreds of sounds, zero words, and it still gets its point across.' },
  { anchor: 'wheels', tag: 'Wheels', title: 'Grippy wheels', text: 'Rubber tyres and cliff sensors in the bumper, so it never rolls off the table.' },
];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const window01 = (p: number, a: number, b: number): number => Math.min(1, Math.max(0, (p - a) / (b - a)));

/**
 * Pinned anatomy. Scrolling turns Nibbo three-quarters and takes it apart; labels ride on the real 3D parts
 * (projected every frame), and a card explains each part in turn. The X-ray switch swaps every surface for its
 * wireframe and counts the generated geometry.
 */
export function initInside(o: { director: Director; robot: Robot; brain: Brain; stage: Stage; sound: Sound }): { update(): void } {
  const { director, robot, brain, stage, sound } = o;
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
  const card = $('[data-part-card]');
  const cardN = $('[data-part-n]');
  const cardTitle = $('[data-part-title]');
  const cardText = $('[data-part-text]');

  const tags = PARTS.map((part, i) => {
    const li = document.createElement('li');
    li.className = 'tag';
    li.textContent = part.tag;
    li.addEventListener('click', () => showCard(i, true));
    tagsEl.appendChild(li);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '4.5');
    g.append(line, dot);
    svg.appendChild(g);
    return { li, g, line, dot };
  });

  let progress = 0;
  let active = -1;
  let pinnedActive = false;
  let manual = -1;

  function showCard(i: number, byHand = false): void {
    if (byHand) manual = i;
    if (i === active) return;
    active = i;
    tags.forEach((t, k) => {
      t.li.classList.toggle('is-active', k === i);
      t.g.classList.toggle('is-active', k === i);
    });
    if (i < 0) {
      card.classList.remove('is-shown');
      return;
    }
    cardN.textContent = `${String(i + 1).padStart(2, '0')} / ${String(PARTS.length).padStart(2, '0')}`;
    cardTitle.textContent = PARTS[i].title;
    cardText.textContent = PARTS[i].text;
    card.classList.add('is-shown');
    sound.tick();
  }

  ScrollTrigger.create({
    id: 'inside',
    trigger: '.inside',
    pin,
    start: 'top top',
    end: () => `+=${window.innerHeight * 3.2}`,
    scrub: true,
    onUpdate: (self) => {
      progress = self.progress;
      manual = -1;
    },
    onToggle: (self) => (pinnedActive = self.isActive),
  });

  // X-ray switch.
  const xray = $('[data-xray]');
  const stats = $('[data-xray-stats]');
  const idleStats = stats.textContent ?? '';
  xray.addEventListener('click', () => {
    const on = xray.getAttribute('aria-checked') !== 'true';
    xray.setAttribute('aria-checked', String(on));
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6a2b';
    robot.setXray(on, accent);
    if (on) {
      const s = robot.stats();
      stats.innerHTML = `${s.meshes} meshes · ${s.triangles.toLocaleString('en')} triangles<br />0 model files · 0 images`;
      brain.react('surprised', 1.2);
    } else {
      stats.textContent = idleStats;
    }
  });

  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  let wasExploding = false;

  return {
    update() {
      const here = director.current?.id === 'inside';
      // Turn to three-quarters, come apart, hold while the parts are explained, then reassemble.
      const turn = smooth(window01(progress, 0.02, 0.16));
      apart = here ? smooth(window01(progress, 0.12, 0.42)) * (1 - smooth(window01(progress, 0.9, 1))) : 0;
      slot.yaw = 32 * turn * (1 - smooth(window01(progress, 0.92, 1)));
      slot.pitch = 6 * turn;
      robot.setExplode(apart);
      if (apart > 0.05 !== wasExploding) {
        wasExploding = apart > 0.05;
        if (wasExploding) {
          brain.react('surprised', 0.8, false);
          sound.servo(true);
        } else sound.servo(false);
      }
      slot.mood = apart > 0.5 ? 'curious' : 'idle';
      if (here) brain.setBaseMood(slot.mood);

      const showTags = pinnedActive && apart > 0.75;
      const auto = showTags ? Math.min(PARTS.length - 1, Math.floor(window01(progress, 0.44, 0.9) * PARTS.length)) : -1;
      showCard(showTags ? (manual >= 0 ? manual : auto) : -1);

      if (!showTags) {
        tags.forEach((t) => {
          t.li.classList.remove('is-shown');
          t.g.style.opacity = '0';
        });
        return;
      }

      const pinRect = pin.getBoundingClientRect();
      const canvasTop = stage.canvas.getBoundingClientRect().top;
      robot.root.updateMatrixWorld(true);
      stage.toScreen(robot.parts.chassis.getWorldPosition(centre), centre);
      const narrow = isNarrow();
      const reach = narrow ? 18 : 46;
      tags.forEach((t, i) => {
        const anchor = robot.anchors[PARTS[i].anchor];
        stage.toScreen(anchor.getWorldPosition(v), v);
        const ax = v.x;
        const ay = v.y + canvasTop - pinRect.top;
        const side = ax < centre.x ? -1 : 1;
        const w = t.li.offsetWidth;
        const h = t.li.offsetHeight;
        let tx = ax + side * reach;
        if (side < 0) tx -= w;
        tx = Math.max(6, Math.min(pinRect.width - w - 6, tx));
        const ty = ay - h / 2 - (narrow ? 8 : 14);
        t.li.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
        // Phones only have room for the label of the part being explained; the rest keep just their dot.
        const labelled = !narrow || i === active;
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
    },
  };
}
