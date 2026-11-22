import { gsap } from 'gsap';
import { $, createLoop, fitCanvas, flash, onVisible, vibrate } from '../lib/dom';
import { finishStore } from '../lib/finish';
import type { Sound } from '../lib/sound';

const TOP_SPEED = 210;
// Exponential approach to top speed, tuned so 0→100 km/h takes exactly 2.9 s: 2.9 / -ln(1 - 100/210).
const TAU_UP = 2.9 / -Math.log(1 - 100 / TOP_SPEED);
const R = 170;
const CIRC = 2 * Math.PI * R;
const ARC = CIRC * 0.75;
const HOLD_CIRC = 2 * Math.PI * 46;
const NS = 'http://www.w3.org/2000/svg';

/**
 * Ignite: press and hold (pointer or space bar) to accelerate. Speed follows the bike's real 0–100 curve,
 * the gauge fills, lightning arcs off the dial, the motor whine rises, and a timed run is scored on crossing 100.
 * Releasing regenerates: speed bleeds off and the power readout goes negative.
 */
export function initIgnite(sound: Sound, reduced: boolean): void {
  const root = $('[data-ignite]');
  const stage = $('[data-ignite-stage]', root);
  const fill = $<SVGCircleElement>('[data-gauge-fill]', root);
  const glow = $<SVGCircleElement>('[data-gauge-glow]', root);
  const speedEl = $('[data-speed]', root);
  const powerEl = $('[data-r-power]', root);
  const timeEl = $('[data-r-time]', root);
  const bestEl = $('[data-r-best]', root);
  const stamp = $('[data-stamp]', root);
  const hold = $<HTMLButtonElement>('[data-hold]', root);
  const holdFill = $<SVGCircleElement>('[data-hold-fill]', root);
  const bolts = createBolts($<HTMLCanvasElement>('[data-bolts]', root), stage);

  buildTicks($<SVGGElement>('[data-gauge-ticks]', root));
  const setArc = (el: SVGCircleElement, f: number): void => {
    el.style.strokeDasharray = `${(ARC * f).toFixed(2)} ${CIRC.toFixed(2)}`;
  };
  setArc(fill, 0);
  setArc(glow, 0);
  $<SVGCircleElement>('.gauge__track', root).style.strokeDasharray = `${ARC.toFixed(2)} ${CIRC.toFixed(2)}`;
  holdFill.style.strokeDasharray = `0 ${HOLD_CIRC}`;

  let holding = false;
  let v = 0;
  let t0 = 0;
  let timed = false;
  let crossed = false;
  let best = Infinity;
  let inView = false;
  let lastBuzz = 0;
  let lastText = '';

  const start = (): void => {
    if (holding) return;
    holding = true;
    root.classList.add('is-holding');
    if (v < 1) {
      t0 = performance.now();
      timed = true;
      crossed = false;
      timeEl.classList.remove('is-hit');
      timeEl.textContent = '0.00 s';
    } else timed = false;
    sound.click();
    loop.start();
  };
  const stop = (): void => {
    if (!holding) return;
    holding = false;
    root.classList.remove('is-holding');
    if (timed && !crossed) timeEl.textContent = 'Hold longer';
  };

  hold.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hold.setPointerCapture(e.pointerId);
    start();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => hold.addEventListener(type, stop));
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  hold.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat) start();
  });
  hold.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') stop();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !inView) return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
    e.preventDefault();
    if (!e.repeat) start();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') stop();
  });
  window.addEventListener('blur', stop);
  onVisible(root, (vis) => (inView = vis), '0px', 0.35);

  const score = (seconds: number): void => {
    crossed = true;
    best = Math.min(best, seconds);
    timeEl.textContent = `${seconds.toFixed(2)} s`;
    bestEl.textContent = `${best.toFixed(2)} s`;
    [timeEl, bestEl].forEach((el) => {
      el.classList.remove('is-hit');
      void el.offsetWidth;
      el.classList.add('is-hit');
    });
    stamp.textContent = `0–100 km/h · ${seconds.toFixed(2)} s`;
    gsap.fromTo(stamp, { opacity: 0, y: 10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(2)' });
    gsap.to(stamp, { opacity: 0, duration: 0.6, delay: 2.2 });
    flash(0.35, 0.7);
    bolts.burst();
    sound.crack(1);
    vibrate([40, 30, 90]);
  };

  const loop = createLoop((time, dtMs) => {
    const dt = Math.min(dtMs, 50) / 1000;
    if (holding) v = TOP_SPEED - (TOP_SPEED - v) * Math.exp(-dt / TAU_UP);
    else v = Math.max(0, v - (v / 1.1 + 8) * dt);
    const s = v / TOP_SPEED;

    if (holding && timed && !crossed) {
      const elapsed = (performance.now() - t0) / 1000;
      if (v >= 100) score(elapsed);
      else timeEl.textContent = `${elapsed.toFixed(2)} s`;
    }

    const text = String(Math.round(v)).padStart(3, '0');
    if (text !== lastText) {
      speedEl.textContent = text;
      lastText = text;
    }
    setArc(fill, s);
    setArc(glow, s);
    holdFill.style.strokeDasharray = `${(HOLD_CIRC * (holding ? s : 0)).toFixed(2)} ${HOLD_CIRC}`;
    powerEl.textContent = holding ? `${Math.round(62 * (1 - s * 0.45))} kW` : v > 1 ? `−${Math.round(Math.min(38, v * 0.4))} kW regen` : '0 kW';
    root.style.setProperty('--heat', s.toFixed(3));

    if (!reduced) {
      const amp = Math.pow(s, 2.2) * (holding ? 5 : 1.5);
      stage.style.transform = amp > 0.05 ? `translate3d(${((Math.random() - 0.5) * amp).toFixed(2)}px, ${((Math.random() - 0.5) * amp).toFixed(2)}px, 0)` : '';
    }
    bolts.step(dt, s, holding);
    sound.motor(s, holding);

    if (holding && s > 0.12 && time - lastBuzz > 0.14) {
      vibrate(Math.round(6 + s * 14));
      lastBuzz = time;
    }
    if (!holding && v === 0 && bolts.idle()) {
      sound.motor(0, false);
      stage.style.transform = '';
      loop.stop();
    }
  });
}

function buildTicks(group: SVGGElement): void {
  for (let km = 0; km <= TOP_SPEED; km += 10) {
    const a = ((135 + (km / TOP_SPEED) * 270) * Math.PI) / 180;
    const major = km % 30 === 0;
    const r1 = 156;
    const r2 = major ? 142 : 149;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', (200 + Math.cos(a) * r1).toFixed(2));
    line.setAttribute('y1', (200 + Math.sin(a) * r1).toFixed(2));
    line.setAttribute('x2', (200 + Math.cos(a) * r2).toFixed(2));
    line.setAttribute('y2', (200 + Math.sin(a) * r2).toFixed(2));
    line.setAttribute('class', major ? 'major' : 'minor');
    group.appendChild(line);
    if (major) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', (200 + Math.cos(a) * 126).toFixed(2));
      t.setAttribute('y', (200 + Math.sin(a) * 126).toFixed(2));
      t.textContent = String(km);
      group.appendChild(t);
    }
  }
}

type Bolt = { pts: number[]; life: number; max: number; width: number };

/** Procedural lightning (midpoint displacement with branches) arcing off the gauge ring. */
function createBolts(canvas: HTMLCanvasElement, stage: HTMLElement): { step(dt: number, s: number, holding: boolean): void; burst(): void; idle(): boolean } {
  const ctx = canvas.getContext('2d');
  const list: Bolt[] = [];
  let w = 0;
  let h = 0;
  let dpr = 1;
  const resize = (): void => {
    ({ w, h, dpr } = fitCanvas(canvas));
  };
  new ResizeObserver(resize).observe(canvas);

  const ringPx = (): number => stage.clientWidth * (R / 400);

  const displace = (x1: number, y1: number, x2: number, y2: number, amt: number, depth: number, out: number[]): void => {
    if (depth === 0) {
      out.push(x2, y2);
      return;
    }
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * amt;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * amt;
    displace(x1, y1, mx, my, amt / 2, depth - 1, out);
    displace(mx, my, x2, y2, amt / 2, depth - 1, out);
  };

  const spawn = (s: number, power = 1): void => {
    const cx = w / 2;
    const cy = h / 2;
    const rr = ringPx();
    const a = ((135 + Math.random() * 270 * Math.max(0.15, s)) * Math.PI) / 180;
    const len = rr * (0.12 + Math.random() * (0.25 + 0.45 * s)) * power;
    const a2 = a + (Math.random() - 0.5) * 0.5;
    const x1 = cx + Math.cos(a) * rr;
    const y1 = cy + Math.sin(a) * rr;
    const x2 = cx + Math.cos(a2) * (rr + len);
    const y2 = cy + Math.sin(a2) * (rr + len);
    const pts = [x1, y1];
    displace(x1, y1, x2, y2, len * 0.5, 5, pts);
    const max = 0.06 + Math.random() * 0.12;
    list.push({ pts, life: 0, max, width: 0.8 + Math.random() * 1.4 * power });
    if (Math.random() < 0.35 && pts.length > 12) {
      const k = 2 * (2 + Math.floor(Math.random() * (pts.length / 2 - 4)));
      const bx = pts[k];
      const by = pts[k + 1];
      const ba = a2 + (Math.random() - 0.5) * 1.4;
      const bl = len * 0.4;
      const branch = [bx, by];
      displace(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, bl * 0.5, 4, branch);
      list.push({ pts: branch, life: 0, max: max * 0.8, width: 0.6 });
    }
  };

  const stroke = (b: Bolt, lw: number, style: string): void => {
    if (!ctx) return;
    ctx.lineWidth = lw;
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(b.pts[0], b.pts[1]);
    for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
    ctx.stroke();
  };

  return {
    step(dt, s, holding) {
      if (!ctx) return;
      const rate = holding ? 2 + 46 * Math.pow(s, 1.6) : 10 * s * s;
      let expected = rate * dt;
      while (expected > 0) {
        if (Math.random() < Math.min(1, expected)) spawn(s);
        expected -= 1;
      }
      const [r, g, b] = finishStore.rgb();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = list.length - 1; i >= 0; i--) {
        const bolt = list[i];
        bolt.life += dt;
        if (bolt.life > bolt.max) {
          list.splice(i, 1);
          continue;
        }
        const a = 1 - bolt.life / bolt.max;
        stroke(bolt, bolt.width * 9, `rgba(${r}, ${g}, ${b}, ${(a * 0.12).toFixed(3)})`);
        stroke(bolt, bolt.width * 3.5, `rgba(${r}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, ${(a * 0.4).toFixed(3)})`);
        stroke(bolt, bolt.width, `rgba(255, 250, 244, ${(a * 0.95).toFixed(3)})`);
      }
    },
    burst() {
      for (let i = 0; i < 14; i++) spawn(1, 1.6);
    },
    idle: () => list.length === 0,
  };
}
