/**
 * Nibbo's face: a 40 × 20 LED dot matrix. Expressions are parametric eye shapes drawn into a small supersampled
 * mask; each LED then takes the brightness of its cell, so shapes animate smoothly (blinks, gaze, lids) while the
 * output always reads as real LEDs. The same canvas is used on the 3D robot (as a texture) and on the entry gate.
 */

export const GRID_W = 40;
export const GRID_H = 20;
const SS = 4; // mask supersampling per LED

export type Shape = 'eye' | 'heart' | 'spiral' | 'x' | 'arc' | 'closed' | 'star';
export type Mouth = 'none' | 'o' | 'smile' | 'flat' | 'wave';

export type EyeSpec = {
  shape: Shape;
  /** Size in LEDs. */
  w: number;
  h: number;
  /** Corner roundness, 0 (square) to 1 (fully round). */
  round: number;
  /** Fraction of the eye hidden by the top lid. */
  lidTop: number;
  /** Top lid slope: positive tips the inner corner down (cross), negative the outer corner (sad). */
  tilt: number;
  /** Cheek pushing up from below: makes smiling eyes. */
  lidBottom: number;
  /** Vertical offset in LEDs. */
  dy: number;
};

export type Expression = { l: EyeSpec; r: EyeSpec; mouth: Mouth; zzz?: boolean };

const eye = (o: Partial<EyeSpec> = {}): EyeSpec => ({
  shape: 'eye',
  w: 7.5,
  h: 10,
  round: 0.85,
  lidTop: 0,
  tilt: 0,
  lidBottom: 0,
  dy: 0,
  ...o,
});
const both = (o: Partial<EyeSpec>, mouth: Mouth = 'none', zzz = false): Expression => ({ l: eye(o), r: eye(o), mouth, zzz });

export const EXPRESSIONS = {
  idle: both({}),
  happy: both({ w: 9, h: 9, round: 1, lidBottom: 0.62 }),
  joy: both({ shape: 'arc', w: 8, h: 6 }, 'smile'),
  curious: { l: eye({ h: 11, w: 9 }), r: eye({ h: 7, lidTop: 0.2, tilt: -0.25 }), mouth: 'none' },
  sleepy: both({ lidTop: 0.62, dy: 1.5, h: 9 }),
  asleep: both({ shape: 'closed', w: 8, h: 4, dy: 1.5 }, 'none', true),
  grumpy: both({ lidTop: 0.42, tilt: 0.55, h: 9 }, 'flat'),
  sad: both({ lidTop: 0.3, tilt: -0.5, dy: 1, h: 9 }),
  love: both({ shape: 'heart', w: 11, h: 10 }),
  dizzy: both({ shape: 'spiral', w: 9, h: 9 }, 'wave'),
  surprised: both({ w: 9, h: 12, round: 1 }, 'o'),
  focus: both({ lidTop: 0.3, lidBottom: 0.2, h: 9, w: 8.5 }),
  oops: both({ shape: 'x', w: 7, h: 7 }, 'wave'),
  starry: both({ shape: 'star', w: 11, h: 11 }, 'smile'),
  wink: { l: eye({ w: 9, h: 9, round: 1, lidBottom: 0.62 }), r: eye({ shape: 'arc', w: 8, h: 6 }), mouth: 'smile' },
} satisfies Record<string, Expression>;

export type Mood = keyof typeof EXPRESSIONS;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const NUM_KEYS = ['w', 'h', 'round', 'lidTop', 'tilt', 'lidBottom', 'dy'] as const;

/** One dot of light, pre-rendered once per colour: a bright core with a soft halo. */
function dotSprite(hex: string, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.16, hex);
  grad.addColorStop(0.34, hex);
  grad.addColorStop(0.5, `${hex}55`);
  grad.addColorStop(1, `${hex}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export class LedFace {
  readonly canvas: HTMLCanvasElement;
  /** Set whenever the canvas was redrawn; the 3D side clears it after uploading the texture. */
  dirty = true;

  private ctx: CanvasRenderingContext2D;
  private mask: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private levels = new Float32Array(GRID_W * GRID_H);
  private shown = new Float32Array(GRID_W * GRID_H);
  private sprite: HTMLCanvasElement;
  private pitch: number;

  private cur: Expression = structuredClone(EXPRESSIONS.idle);
  private target: Expression = EXPRESSIONS.idle;
  private pendingShape: Expression | null = null;
  private blink = 0; // 0 open … 1 closed
  private blinkUntil = 0;
  private nextBlink = 2;
  private gx = 0;
  private gy = 0;
  private gazeX = 0;
  private gazeY = 0;
  private text: string | null = null;
  private textX = 0;
  private textSpeed = 14;
  private time = 0;

  constructor(width = 512, private color = '#7cf3ff') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = width / 2;
    this.ctx = this.canvas.getContext('2d')!;
    this.mask = document.createElement('canvas');
    this.mask.width = GRID_W * SS;
    this.mask.height = GRID_H * SS;
    this.mctx = this.mask.getContext('2d', { willReadFrequently: true })!;
    this.pitch = width / GRID_W;
    this.sprite = dotSprite(color, Math.round(this.pitch * 2.2));
  }

  setColor(hex: string): void {
    if (hex === this.color) return;
    this.color = hex;
    this.sprite = dotSprite(hex, Math.round(this.pitch * 2.2));
    this.shown.fill(-1); // force a full redraw
  }

  /** Changes expression. A change of eye shape (say, round eyes to hearts) hides the swap inside a quick blink. */
  set(mood: Mood): void {
    const next = EXPRESSIONS[mood];
    if (next === this.target) return;
    const shapeChange = next.l.shape !== this.cur.l.shape || next.r.shape !== this.cur.r.shape;
    this.target = next;
    if (shapeChange) {
      this.pendingShape = next;
      this.blinkUntil = this.time + 0.09;
    }
  }

  /** Jumps straight to an expression with no transition (for static previews). */
  snap(mood: Mood): void {
    this.target = EXPRESSIONS[mood];
    this.cur = structuredClone(EXPRESSIONS[mood]);
    this.pendingShape = null;
    this.nextBlink = Infinity;
  }

  get mood(): Mood {
    return (Object.keys(EXPRESSIONS) as Mood[]).find((k) => EXPRESSIONS[k] === this.target) ?? 'idle';
  }

  /** Where the eyes look, each axis -1..1. */
  look(x: number, y: number): void {
    this.gx = Math.max(-1, Math.min(1, x));
    this.gy = Math.max(-1, Math.min(1, y));
  }

  blinkNow(): void {
    this.blinkUntil = this.time + 0.1;
  }

  /** Scrolls text across the matrix (or stops with null). */
  marquee(text: string | null, speed = 14): void {
    if (text === this.text) return;
    this.text = text;
    this.textSpeed = speed;
    this.textX = GRID_W * SS;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;

    // Blinking: automatic every 2–6 s, never while the eyes are already closed shapes.
    if (t > this.nextBlink) {
      this.blinkUntil = t + 0.11;
      this.nextBlink = t + 2 + Math.random() * 4 + (Math.random() < 0.15 ? -1.7 : 0); // sometimes a double blink
    }
    const closing = t < this.blinkUntil;
    this.blink += ((closing ? 1 : 0) - this.blink) * Math.min(1, dt * (closing ? 40 : 22));
    if (this.pendingShape && this.blink > 0.85) {
      this.cur.l.shape = this.pendingShape.l.shape;
      this.cur.r.shape = this.pendingShape.r.shape;
      this.pendingShape = null;
    }
    if (!this.pendingShape) {
      this.cur.l.shape = this.target.l.shape;
      this.cur.r.shape = this.target.r.shape;
    }
    const k = Math.min(1, dt * 12);
    for (const side of ['l', 'r'] as const) {
      for (const key of NUM_KEYS) this.cur[side][key] = lerp(this.cur[side][key], this.target[side][key], k);
    }
    this.cur.mouth = this.target.mouth;
    this.cur.zzz = this.target.zzz;
    this.gazeX = lerp(this.gazeX, this.gx, Math.min(1, dt * 14));
    this.gazeY = lerp(this.gazeY, this.gy, Math.min(1, dt * 14));
    if (this.text) this.textX -= this.textSpeed * SS * dt;

    this.drawMask();
    this.sample();
  }

  private drawMask(): void {
    const g = this.mctx;
    const W = this.mask.width;
    const H = this.mask.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';

    if (this.text) {
      g.font = `700 ${11.5 * SS}px "Martian Mono Variable", ui-monospace, monospace`;
      g.textBaseline = 'middle';
      const width = g.measureText(this.text).width;
      if (this.textX < -width) this.textX = W;
      g.fillText(this.text, this.textX, H / 2 + SS * 0.6);
      return;
    }

    const gx = this.gazeX * 3.2;
    const gy = this.gazeY * 2.2;
    this.drawEye(this.cur.l, 13 + gx, 9 + gy, -1);
    this.drawEye(this.cur.r, 27 + gx, 9 + gy, 1);
    this.drawMouth(this.cur.mouth, 20 + gx * 0.6, 17 + gy * 0.4);
    if (this.cur.zzz) this.drawZzz();
  }

  private drawEye(e: EyeSpec, cxCells: number, cyCells: number, side: -1 | 1): void {
    const g = this.mctx;
    const cx = cxCells * SS;
    const cy = (cyCells + e.dy) * SS;
    const w = e.w * SS;
    const open = 1 - this.blink * 0.92;
    const h = e.h * SS;
    g.save();
    // Keep each eye's lids from touching the other eye.
    g.beginPath();
    g.rect(cx - 9.5 * SS, 0, 19 * SS, this.mask.height);
    g.clip();
    g.translate(cx, cy);
    g.lineWidth = 2.2 * SS;

    switch (e.shape) {
      case 'eye': {
        const hh = Math.max(SS * 0.9, h * open);
        const r = (Math.min(w, hh) / 2) * e.round;
        g.beginPath();
        g.roundRect(-w / 2, -hh / 2, w, hh, r);
        g.fill();
        g.globalCompositeOperation = 'destination-out';
        if (e.lidTop > 0.01) {
          g.save();
          g.rotate(e.tilt * -side);
          g.fillRect(-w * 1.2, -hh / 2 - h * 2, w * 2.4, h * 2 + hh * e.lidTop);
          g.restore();
        }
        if (e.lidBottom > 0.01) {
          // Cheeks push up from below with a wide arc: a lot of it leaves a smiling crescent.
          g.beginPath();
          g.ellipse(0, hh * 0.68, w * 0.72, hh * e.lidBottom, 0, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'arc': {
        // ^ : eyes squeezed shut with joy.
        const hh = h * (0.6 + 0.4 * open);
        g.beginPath();
        g.moveTo(-w / 2, hh / 2);
        g.quadraticCurveTo(0, -hh * 1.1, w / 2, hh / 2);
        g.stroke();
        break;
      }
      case 'closed': {
        // ‿ : peacefully asleep.
        g.beginPath();
        g.moveTo(-w / 2, -h * 0.15);
        g.bezierCurveTo(-w / 4, h * 0.45, w / 4, h * 0.45, w / 2, -h * 0.15);
        g.stroke();
        break;
      }
      case 'heart': {
        const s = 1 + Math.sin(this.time * 7) * 0.07;
        const hw = (w / 2) * s;
        const hh = (h / 2) * s * Math.max(0.15, open);
        g.beginPath();
        g.moveTo(0, hh);
        g.bezierCurveTo(-hw * 1.5, -hh * 0.1, -hw * 0.75, -hh * 1.35, 0, -hh * 0.45);
        g.bezierCurveTo(hw * 0.75, -hh * 1.35, hw * 1.5, -hh * 0.1, 0, hh);
        g.fill();
        break;
      }
      case 'spiral': {
        g.rotate(this.time * 6 * side);
        g.beginPath();
        const turns = 2.3;
        const maxR = Math.min(w, h) / 2;
        for (let a = 0; a <= turns * Math.PI * 2; a += 0.2) {
          const r = (a / (turns * Math.PI * 2)) * maxR;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r * open;
          if (a === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.lineWidth = 1.5 * SS;
        g.stroke();
        break;
      }
      case 'x': {
        const d = w / 2;
        g.beginPath();
        g.moveTo(-d, -d * open);
        g.lineTo(d, d * open);
        g.moveTo(d, -d * open);
        g.lineTo(-d, d * open);
        g.stroke();
        break;
      }
      case 'star': {
        const s = 1 + Math.sin(this.time * 9) * 0.1;
        const R = (Math.min(w, h) / 2) * s;
        g.rotate(Math.sin(this.time * 2) * 0.2);
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? R : R * 0.36;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r * Math.max(0.15, open));
        }
        g.closePath();
        g.fill();
        break;
      }
    }
    g.restore();
  }

  private drawMouth(m: Mouth, cxCells: number, cyCells: number): void {
    if (m === 'none') return;
    const g = this.mctx;
    g.save();
    g.translate(cxCells * SS, cyCells * SS);
    g.lineWidth = 1.6 * SS;
    g.beginPath();
    if (m === 'o') g.ellipse(0, 0, 1.6 * SS, 1.4 * SS, 0, 0, Math.PI * 2);
    if (m === 'smile') {
      g.moveTo(-3 * SS, -0.8 * SS);
      g.quadraticCurveTo(0, 2.2 * SS, 3 * SS, -0.8 * SS);
    }
    if (m === 'flat') {
      g.moveTo(-2.5 * SS, 0);
      g.lineTo(2.5 * SS, 0);
    }
    if (m === 'wave') {
      for (let x = -4; x <= 4; x += 0.5) {
        const y = Math.sin(x * 1.6 + this.time * 8) * 0.8;
        if (x === -4) g.moveTo(x * SS, y * SS);
        else g.lineTo(x * SS, y * SS);
      }
    }
    g.stroke();
    g.restore();
  }

  private drawZzz(): void {
    const g = this.mctx;
    g.font = `700 ${4.5 * SS}px "Martian Mono Variable", ui-monospace, monospace`;
    for (let i = 0; i < 2; i++) {
      const p = (this.time * 0.35 + i * 0.5) % 1;
      g.globalAlpha = Math.sin(p * Math.PI);
      g.fillText('z', (33 + p * 4) * SS, (11 - p * 9) * SS);
    }
    g.globalAlpha = 1;
  }

  /** Mask → LED levels → dots. Only redraws the output when some LED actually changed. */
  private sample(): void {
    const data = this.mctx.getImageData(0, 0, this.mask.width, this.mask.height).data;
    const rowStride = this.mask.width * 4;
    let changed = false;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        let sum = 0;
        for (let y = 1; y < SS; y += 2) {
          const row = (gy * SS + y) * rowStride;
          for (let x = 1; x < SS; x += 2) sum += data[row + (gx * SS + x) * 4 + 3];
        }
        const v = Math.min(1, sum / (4 * 255) / 0.7);
        const i = gy * GRID_W + gx;
        this.levels[i] = v;
        if (Math.abs(v - this.shown[i]) > 0.02) changed = true;
      }
    }
    if (!changed) return;
    this.shown.set(this.levels);
    this.paint();
  }

  private paint(): void {
    const g = this.ctx;
    const p = this.pitch;
    const s = this.sprite.width;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Unlit LEDs stay faintly visible, like a real matrix behind tinted glass.
    g.fillStyle = this.color;
    g.globalAlpha = 0.09;
    g.beginPath();
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const x = (gx + 0.5) * p;
        const y = (gy + 0.5) * p;
        g.moveTo(x + p * 0.3, y);
        g.arc(x, y, p * 0.3, 0, Math.PI * 2);
      }
    }
    g.fill();
    for (let i = 0; i < this.levels.length; i++) {
      const v = this.levels[i];
      if (v < 0.04) continue;
      const x = ((i % GRID_W) + 0.5) * p;
      const y = (Math.floor(i / GRID_W) + 0.5) * p;
      g.globalAlpha = v;
      g.drawImage(this.sprite, x - s / 2, y - s / 2);
    }
    g.globalAlpha = 1;
    this.dirty = true;
  }
}
