import { createLoop, finePointer, onVisible } from '@portfolio-lab/kit/dom';
import { Latte, type LatteEvent, type Preset, type Tool } from '../fluid/latte';
import type { Daylight } from '../lib/daylight';
import type { Media } from '../lib/media';
import type { Sound } from '../lib/sound';

const PITCHER = `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#8d9196"/><stop offset=".35" stop-color="#eef0f2"/><stop offset=".6" stop-color="#b9bdc2"/><stop offset="1" stop-color="#6f7378"/></linearGradient></defs><path d="M30 34h50l-2 58a10 10 0 0 1-10 9H42a10 10 0 0 1-10-9L30 34Z" fill="url(#steel)"/><path d="M28 30h56l-4 7H30l-2-7Z" fill="#d9dce0"/><path d="M28 30 14 22l3 9 13 3" fill="url(#steel)"/><path d="M80 44c14 0 16 30 0 32" fill="none" stroke="#9a9ea3" stroke-width="7" stroke-linecap="round"/></svg>`;
const PEN = `<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M30 100 92 18" stroke="#c9ccd1" stroke-width="6" stroke-linecap="round"/><path d="M30 100 26 106" stroke="#7d8186" stroke-width="3" stroke-linecap="round"/><path d="M78 36 92 18" stroke="#2a1d15" stroke-width="8" stroke-linecap="round"/></svg>`;

type Geom = { w: number; h: number; cx: number; cy: number; r: number };

/**
 * The cup on the hero: the table photo (or, until it arrives, a table and cup drawn in code), the fluid surface laid
 * exactly over the liquid, and every way of touching it: hold to pour or etch, circle the saucer to swirl, tilt or
 * turn a phone to slosh. It lives for the whole visit and moves into the hero whenever the home page mounts, so
 * your latte is still there when you come back.
 */
export class CupHost {
  latte: Latte | null = null;
  readonly canvas = document.createElement('canvas');
  private table = document.createElement('canvas');
  private photo: HTMLImageElement | null = null;
  private fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private stream = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  private axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  private pitcher = document.createElement('div');
  private hit = document.createElement('div');
  private scene: HTMLElement | null = null;
  private geom: Geom = { w: 1, h: 1, cx: 0.5, cy: 0.5, r: 1 };
  private visible = false;
  private loop = createLoop((_t, ms) => this.frame(Math.min(1 / 30, ms / 1000)));
  private drag: { id: number; mode: 'pour' | 'swirl'; angle: number; t: number } | null = null;
  private pointer = { x: 0, y: 0, over: false };
  private axisTimer = 0;
  private wasBusy = false;
  private ro = new ResizeObserver(() => this.layout());
  private io: IntersectionObserver | null = null;
  private listeners = new Set<(e: LatteEvent) => void>();
  private motion = { gamma: NaN, beta: NaN };
  private detachers: (() => void)[] = [];
  readonly supported: boolean;

  constructor(
    private sound: Sound,
    day: Daylight,
    private media: Media,
  ) {
    this.canvas.className = 'cup-scene__liquid';
    this.table.className = 'cup-scene__table';
    this.fx.setAttribute('class', 'cup-scene__fx');
    this.fx.setAttribute('aria-hidden', 'true');
    this.stream.setAttribute('class', 'cup-stream');
    this.axis.setAttribute('class', 'cup-axis');
    this.fx.append(this.stream, this.axis);
    this.pitcher.className = 'pitcher';
    this.pitcher.innerHTML = PITCHER;
    this.hit.className = 'cup-scene__hit';
    this.hit.setAttribute('aria-hidden', 'true');
    let latte: Latte | null = null;
    try {
      latte = new Latte(this.canvas, sound, finePointer() ? 'high' : 'low');
    } catch {
      latte = null;
    }
    this.latte = latte;
    this.supported = !!latte;
    latte?.on((e) => {
      if (e.type === 'score') this.showAxis(e.score.axis);
      this.listeners.forEach((fn) => fn(e));
    });
    day.subscribe(() => {
      if (!this.latte) return;
      // The hour's colour is laid over the whole scene in CSS (photo, coffee and all); only the sheen changes here.
      this.latte.light = { ...day.coffeeLight(), tint: [1, 1, 1] };
      this.latte.invalidate();
      this.wake();
    });
    if (media.cup) {
      const img = new Image();
      img.className = 'cup-scene__photo';
      img.alt = '';
      img.decoding = 'async';
      img.src = media.cup.src;
      this.photo = img;
      // The simulation pours onto the photo's own crema.
      if (latte && media.cup.crema) {
        const crema = new Image();
        crema.decoding = 'async';
        crema.onload = () => {
          latte.fluid.setCrema(crema);
          latte.invalidate();
          this.wake();
        };
        crema.src = media.cup.crema;
      }
    }
  }

  on(fn: (e: LatteEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Moves the cup into a hero's scene element. */
  attach(scene: HTMLElement): void {
    this.scene = scene;
    scene.style.setProperty('--table', this.media.cup?.bg ?? '#2a1a10');
    scene.append(this.photo ?? this.table, this.canvas, this.fx, this.hit, this.pitcher);
    if (!this.latte) scene.classList.add('is-static');
    this.ro.observe(scene);
    this.io = onVisible(scene, (v) => {
      this.visible = v;
      if (v) this.wake();
      else {
        this.loop.stop();
        this.sound.hush();
      }
    });
    this.layout();
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void => {
      el.addEventListener(type, fn as EventListener, opts);
      this.detachers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(this.hit, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(window, 'pointermove', (e: PointerEvent) => this.move(e), { passive: true });
    on(window, 'pointerup', (e: PointerEvent) => this.up(e));
    on(window, 'pointercancel', (e: PointerEvent) => this.up(e));
    on(scene, 'pointerleave', () => {
      this.pointer.over = false;
      this.updatePitcher();
    });
    on(window, 'deviceorientation', (e: DeviceOrientationEvent) => this.tilt(e));
    on(window, 'devicemotion', (e: DeviceMotionEvent) => this.turn(e));
    this.wake();
  }

  detach(): void {
    this.detachers.forEach((fn) => fn());
    this.detachers = [];
    this.ro.disconnect();
    this.io?.disconnect();
    this.loop.stop();
    this.sound.hush();
    this.drag = null;
    this.latte?.release();
    this.scene = null;
    this.visible = false;
  }

  get tool(): Tool {
    return this.latte?.tool ?? 'pour';
  }

  setTool(tool: Tool): void {
    this.latte?.setTool(tool);
    this.pitcher.innerHTML = tool === 'pour' ? PITCHER : PEN;
    this.pitcher.classList.toggle('is-pen', tool === 'etch');
  }

  play(p: Preset): void {
    this.latte?.play(p);
    this.wake();
  }

  newCup(): void {
    this.latte?.newCup();
    this.hideAxis();
    this.wake();
  }

  /** Keeps the frame loop running while the cup is on screen and something is moving. */
  private wake(): void {
    if (this.latte && this.visible && this.scene) this.loop.start();
  }

  /** The liquid's centre and radius in the scene, and where the photo (or drawn table) goes. */
  layout(): void {
    const scene = this.scene;
    if (!scene) return;
    const w = scene.clientWidth;
    const h = scene.clientHeight;
    const narrow = w < 760;
    // On phones the whole saucer (1.8× the liquid) stays on screen.
    const r = narrow ? Math.min(w * 0.245, h * 0.13) : Math.min(h * 0.205, w * 0.15);
    const cx = narrow ? w * 0.5 : w * 0.6;
    const cy = narrow ? h * 0.44 : h * 0.53;
    this.geom = { w, h, cx, cy, r };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const box = (el: HTMLElement | SVGElement, x: number, y: number, bw: number, bh: number): void => {
      Object.assign((el as HTMLElement).style, { left: `${x}px`, top: `${y}px`, width: `${bw}px`, height: `${bh}px` });
    };
    box(this.canvas, cx - r, cy - r, 2 * r, 2 * r);
    this.latte?.fluid.resize(2 * r, dpr);
    this.latte?.invalidate();
    // With a mouse the saucer is a handle to swirl the cup; on a touch screen only the coffee is touchable (so a
    // swipe beside it still scrolls the page) and a two-finger twist does the swirling.
    const hitR = finePointer() ? r * 2.05 : r * 1.02;
    box(this.hit, cx - hitR, cy - hitR, 2 * hitR, 2 * hitR);
    this.fx.setAttribute('viewBox', `0 0 ${w} ${h}`);
    box(this.fx, 0, 0, w, h);

    const c = this.media.cup;
    if (c && this.photo) {
      // Scale the photo so its liquid matches r, put its cup on (cx, cy), then nudge it to cover the scene if it can.
      const s = r / c.r;
      const pw = c.w * s;
      const ph = c.h * s;
      let x = cx - c.cx * s;
      let y = cy - c.cy * s;
      if (pw >= w) x = Math.min(0, Math.max(w - pw, x));
      if (ph >= h) y = Math.min(0, Math.max(h - ph, y));
      box(this.photo, x, y, pw, ph);
      // Exact placement of the liquid follows the photo after any nudge.
      const ncx = x + c.cx * s;
      const ncy = y + c.cy * s;
      this.geom.cx = ncx;
      this.geom.cy = ncy;
      box(this.canvas, ncx - r, ncy - r, 2 * r, 2 * r);
      box(this.hit, ncx - hitR, ncy - hitR, 2 * hitR, 2 * hitR);
      scene.classList.toggle('is-uncovered', pw < w || ph < h);
    } else {
      this.table.width = Math.round(w * dpr);
      this.table.height = Math.round(h * dpr);
      box(this.table, 0, 0, w, h);
      drawTable(this.table.getContext('2d')!, w, h, cx, cy, r, dpr);
    }
    scene.style.setProperty('--cup-x', `${this.geom.cx}px`);
    scene.style.setProperty('--cup-y', `${this.geom.cy}px`);
    scene.style.setProperty('--cup-r', `${r}px`);
  }

  /** Where the liquid is on screen (for the gate's hand-over and the hints). */
  liquidRect(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  private uv(clientX: number, clientY: number): { x: number; y: number; d: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1 - (clientY - rect.top) / rect.height;
    return { x, y, d: Math.hypot(x - 0.5, y - 0.5) * 2 };
  }

  /** Touches currently on the coffee, for the two-finger twist. */
  private touches = new Map<number, { x: number; y: number }>();
  private twist: { angle: number; t: number } | null = null;

  private twistAngle(): number {
    const [a, b] = [...this.touches.values()];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  private down(e: PointerEvent): void {
    if (!this.latte) return;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.hit.setPointerCapture(e.pointerId);
      e.preventDefault();
      if (this.touches.size === 2) {
        // A second finger turns the pour into a twist of the cup.
        this.drag = null;
        this.latte.release();
        this.pitcher.classList.remove('is-pouring', 'is-shown');
        this.twist = { angle: this.twistAngle(), t: performance.now() };
        this.scene?.classList.add('is-swirling');
        this.wake();
        return;
      }
    }
    if (this.drag || this.twist) return;
    const p = this.uv(e.clientX, e.clientY);
    if (p.d < 0.97) {
      if (this.latte.busy) return;
      e.preventDefault();
      this.hit.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, mode: 'pour', angle: 0, t: performance.now() };
      this.latte.press(p.x, p.y);
      this.pitcher.classList.add('is-pouring');
    } else {
      e.preventDefault();
      this.hit.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, mode: 'swirl', angle: Math.atan2(p.y - 0.5, p.x - 0.5), t: performance.now() };
      this.scene?.classList.add('is-swirling');
    }
    this.pointer = { x: e.clientX, y: e.clientY, over: true };
    this.updatePitcher();
    this.wake();
  }

  private move(e: PointerEvent): void {
    if (!this.scene || !this.latte) return;
    const sr = this.scene.getBoundingClientRect();
    const inside = e.clientX >= sr.left && e.clientX <= sr.right && e.clientY >= sr.top && e.clientY <= sr.bottom;
    this.pointer = { x: e.clientX, y: e.clientY, over: inside && (e.pointerType === 'mouse' || !!this.drag) };
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.twist && this.touches.size >= 2) {
      const a = this.twistAngle();
      let da = a - this.twist.angle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const now = performance.now();
      const dt = Math.max(8, now - this.twist.t) / 1000;
      // Screen angles grow clockwise (y down); the cup's uv space has y up.
      this.latte.stir(Math.max(-14, Math.min(14, (-da / dt) * 0.5)));
      this.twist = { angle: a, t: now };
      this.wake();
      return;
    }
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      const p = this.uv(e.clientX, e.clientY);
      if (d.mode === 'pour') {
        const k = p.d > 0.94 ? 0.94 / p.d : 1;
        this.latte.move(0.5 + (p.x - 0.5) * k, 0.5 + (p.y - 0.5) * k);
      } else {
        const a = Math.atan2(p.y - 0.5, p.x - 0.5);
        let da = a - d.angle;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        const now = performance.now();
        const dt = Math.max(8, now - d.t) / 1000;
        // The liquid lags the cup: it picks up a share of the turning speed.
        this.latte.stir(Math.max(-14, Math.min(14, (da / dt) * 0.45)));
        d.angle = a;
        d.t = now;
      }
      this.wake();
    }
    this.updatePitcher();
  }

  private up(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.twist) {
      if (this.touches.size < 2) {
        this.twist = null;
        this.scene?.classList.remove('is-swirling');
      }
      return;
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    this.drag = null;
    this.latte?.release();
    this.pitcher.classList.remove('is-pouring');
    this.scene?.classList.remove('is-swirling');
    if (e.pointerType !== 'mouse') this.pointer.over = false;
    this.updatePitcher();
  }

  /** Phone tilt sloshes the coffee (the change in tilt, not the tilt itself). */
  private tilt(e: DeviceOrientationEvent): void {
    if (!this.latte || !this.visible || e.gamma === null || e.beta === null) return;
    const m = this.motion;
    if (!Number.isNaN(m.gamma)) {
      const dg = e.gamma - m.gamma;
      const db = e.beta - m.beta;
      if (Math.abs(dg) + Math.abs(db) > 0.6) {
        this.latte.stir(0, Math.max(-0.5, Math.min(0.5, dg * 0.03)), Math.max(-0.5, Math.min(0.5, -db * 0.03)));
        this.wake();
      }
    }
    m.gamma = e.gamma;
    m.beta = e.beta;
  }

  /** Turning the phone flat on its face (like turning a saucer) swirls it. */
  private turn(e: DeviceMotionEvent): void {
    const rate = e.rotationRate?.alpha;
    if (!this.latte || !this.visible || rate === null || rate === undefined || Math.abs(rate) < 25) return;
    this.latte.stir(Math.max(-10, Math.min(10, (rate * Math.PI) / 180) * 0.35));
    this.wake();
  }

  /** The pitcher (or etching pen) follows the pointer over the cup; a milk stream runs from its spout. */
  private updatePitcher(): void {
    const scene = this.scene;
    if (!scene || !this.latte) return;
    const sr = scene.getBoundingClientRect();
    const show = this.pointer.over || !!this.drag || this.latte.busy;
    this.pitcher.classList.toggle('is-shown', show);
    if (!show) {
      this.stream.setAttribute('d', '');
      return;
    }
    const x = this.pointer.x - sr.left;
    const y = this.pointer.y - sr.top;
    this.pitcher.style.transform = `translate(${x}px, ${y}px)`;
  }

  private frame(dt: number): void {
    const latte = this.latte!;
    latte.update(dt);
    // During a preset the pitcher follows the choreography.
    const scene = this.scene;
    if (scene && latte.busy) {
      const p = latte.spout;
      const { cx, cy, r } = this.geom;
      const x = cx + (p.x - 0.5) * 2 * r;
      const y = cy - (p.y - 0.5) * 2 * r;
      this.pitcher.style.transform = `translate(${x}px, ${y}px)`;
      this.pitcher.classList.add('is-shown');
      this.pitcher.classList.toggle('is-pouring', latte.pouring > 0.05);
      this.wasBusy = true;
    } else if (scene && this.wasBusy) {
      // The preset is over: the pitcher goes back to the pointer (or away).
      this.wasBusy = false;
      this.pitcher.classList.remove('is-pouring');
      this.updatePitcher();
    } else if (scene && !this.drag && !this.pointer.over) {
      this.pitcher.classList.remove('is-shown', 'is-pouring');
    }
    // The milk stream: from the spout down to the surface, thick as the flow.
    const f = latte.pouring;
    if (scene && f > 0.03 && this.pitcher.classList.contains('is-shown')) {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(this.pitcher.style.transform);
      if (m) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        // The spout sits up and to the right of the pour point (see .pitcher in the CSS).
        const sx = x + 24;
        const sy = y - 64;
        this.stream.setAttribute('d', `M${sx} ${sy} C ${sx - 2} ${sy + 20}, ${x + 3} ${y - 22}, ${x} ${y}`);
        this.stream.style.strokeWidth = `${1.2 + f * 4.2}`;
      }
    } else this.stream.setAttribute('d', '');
    if (!latte.active && !this.drag && !this.twist) {
      this.loop.stop();
      this.sound.hush();
    }
  }

  private showAxis(angle: number): void {
    const { cx, cy, r } = this.geom;
    const dx = Math.cos(angle) * r * 1.08;
    const dy = -Math.sin(angle) * r * 1.08;
    this.axis.setAttribute('x1', String(cx - dx));
    this.axis.setAttribute('y1', String(cy - dy));
    this.axis.setAttribute('x2', String(cx + dx));
    this.axis.setAttribute('y2', String(cy + dy));
    this.axis.classList.add('is-shown');
    window.clearTimeout(this.axisTimer);
    this.axisTimer = window.setTimeout(() => this.hideAxis(), 2600);
  }

  private hideAxis(): void {
    this.axis.classList.remove('is-shown');
  }
}

/**
 * The table and cup drawn in code (used until the photo exists, and wherever it fails to load): walnut with grain
 * and window light, a saucer, the cup's rim and inner wall, the handle, and soft contact shadows.
 */
export function drawTable(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, r: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const wood = ctx.createLinearGradient(0, 0, w, h);
  wood.addColorStop(0, '#4a2e1c');
  wood.addColorStop(0.5, '#38221a');
  wood.addColorStop(1, '#22140c');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, w, h);
  // Grain: long wavy strokes, tilted, light and dark.
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.18);
  const span = Math.hypot(w, h);
  for (let i = 0; i < 160; i++) {
    const y0 = -span / 2 + (i / 160) * span + rnd() * 6;
    ctx.beginPath();
    const amp = 2 + rnd() * 6;
    const freq = 0.002 + rnd() * 0.004;
    const ph = rnd() * 10;
    for (let x = -span / 2; x <= span / 2; x += 18) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
      if (x === -span / 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rnd() > 0.5 ? `rgba(255,214,170,${0.02 + rnd() * 0.035})` : `rgba(10,4,0,${0.05 + rnd() * 0.08})`;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.stroke();
  }
  ctx.restore();
  // Window light from the top left.
  const light = ctx.createRadialGradient(w * 0.18, h * 0.05, 0, w * 0.18, h * 0.05, Math.max(w, h) * 0.75);
  light.addColorStop(0, 'rgba(255,226,186,0.26)');
  light.addColorStop(1, 'rgba(255,226,186,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const circle = (x: number, y: number, rad: number): void => {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
  };
  const soft = (blur: number, off: [number, number], color: string, draw: () => void): void => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * dpr;
    ctx.shadowOffsetX = (off[0] + 10000) * dpr;
    ctx.shadowOffsetY = off[1] * dpr;
    ctx.translate(-10000, 0);
    ctx.fillStyle = '#000';
    draw();
    ctx.fill();
    ctx.restore();
  };

  const saucer = r * 1.8;
  const outer = r * 1.2;
  const ha = Math.PI * 0.2; // handle direction: down-right
  const hx = Math.cos(ha);
  const hy = Math.sin(ha);

  // Shadows on the table, cast away from the window.
  soft(r * 0.5, [r * 0.16, r * 0.22], 'rgba(0,0,0,0.55)', () => circle(cx, cy, saucer));
  // Saucer.
  const sg = ctx.createRadialGradient(cx - saucer * 0.35, cy - saucer * 0.4, saucer * 0.1, cx, cy, saucer);
  sg.addColorStop(0, '#fbf8f2');
  sg.addColorStop(0.65, '#ebe5da');
  sg.addColorStop(1, '#cfc6b7');
  circle(cx, cy, saucer);
  ctx.fillStyle = sg;
  ctx.fill();
  circle(cx, cy, saucer - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  circle(cx, cy, saucer * 0.78);
  ctx.strokeStyle = 'rgba(120,100,80,0.18)';
  ctx.lineWidth = r * 0.04;
  ctx.stroke();

  // Handle (under the cup's shadow): a rounded bar from the cup's wall.
  const h0 = outer * 0.9;
  const h1 = outer * 1.55;
  soft(r * 0.18, [r * 0.08, r * 0.1], 'rgba(40,25,10,0.45)', () => {
    ctx.moveTo(cx + hx * h0, cy + hy * h0);
    ctx.lineTo(cx + hx * h1, cy + hy * h1);
    ctx.lineWidth = r * 0.26;
  });
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.28;
  const hg = ctx.createLinearGradient(cx + hx * h0 - hy * r * 0.14, cy + hy * h0 + hx * r * 0.14, cx + hx * h0 + hy * r * 0.14, cy + hy * h0 - hx * r * 0.14);
  hg.addColorStop(0, '#d9d1c3');
  hg.addColorStop(0.45, '#fbf8f2');
  hg.addColorStop(1, '#cbc1b1');
  ctx.strokeStyle = hg;
  ctx.beginPath();
  ctx.moveTo(cx + hx * h0, cy + hy * h0);
  ctx.lineTo(cx + hx * h1, cy + hy * h1);
  ctx.stroke();
  ctx.restore();

  // Cup: contact shadow on the saucer, then the body seen from above.
  soft(r * 0.3, [r * 0.1, r * 0.14], 'rgba(60,40,20,0.45)', () => circle(cx, cy, outer));
  const cg = ctx.createRadialGradient(cx - outer * 0.4, cy - outer * 0.45, outer * 0.1, cx, cy, outer);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.7, '#f1ece3');
  cg.addColorStop(1, '#d6cdbf');
  circle(cx, cy, outer);
  ctx.fillStyle = cg;
  ctx.fill();
  // Rim: a bright lip.
  circle(cx, cy, r * 1.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = r * 0.035;
  ctx.stroke();
  // Inner wall: shaded on the window side (the wall faces away from the light there).
  const ig = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ig.addColorStop(0, '#b9ae9e');
  ig.addColorStop(1, '#efe8dc');
  circle(cx, cy, r * 1.075);
  ctx.fillStyle = ig;
  ctx.fill();
  // The coffee itself (covered by the fluid canvas when WebGL runs).
  const crema = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
  crema.addColorStop(0, '#b77a3e');
  crema.addColorStop(0.7, '#7a4520');
  crema.addColorStop(1, '#4a2612');
  circle(cx, cy, r);
  ctx.fillStyle = crema;
  ctx.fill();
}
