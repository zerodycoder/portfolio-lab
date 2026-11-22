import { canvas, loadImage, type Ctx } from '../lib/canvas';
import { range, rng, type Rng } from '../lib/rand';

/**
 * Sprite sheets for the toppings. Each sheet is a grid of square cells, one piece per cell on transparent
 * background. A sheet comes from the processed photo (public/media/toppings/<id>.webp + .json, cut out of the
 * generated flat lays by tools/process-novanta.mjs) or, when that is missing, is drawn here in code.
 */

export type Cell = { x: number; y: number; w: number; h: number; scale?: number };
export type Sheet = { image: HTMLCanvasElement | HTMLImageElement; cells: Cell[]; photo: boolean };

const S = 256;

function blob(g: Ctx, cx: number, cy: number, rx: number, ry: number, r: Rng, jag: number, n = 22, rot = 0): void {
  const pts: [number, number][] = [];
  const phase = r() * 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (Math.sin(a * 3 + phase) * 0.5 + (r() - 0.5)) * jag;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(p[0], p[1], mx, my);
  }
  g.closePath();
}

function radial(g: Ctx, cx: number, cy: number, r0: number, stops: [number, string][]): CanvasGradient {
  const grad = g.createRadialGradient(cx - r0 * 0.25, cy - r0 * 0.3, r0 * 0.05, cx, cy, r0);
  stops.forEach(([o, c]) => grad.addColorStop(o, c));
  return grad;
}

function specks(g: Ctx, cx: number, cy: number, rad: number, r: Rng, count: number, size: [number, number], color: () => string): void {
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * rad;
    g.fillStyle = color();
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, range(r, size[0], size[1]), range(r, size[0], size[1]) * range(r, 0.5, 1), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

function gloss(g: Ctx, cx: number, cy: number, rx: number, ry: number, a: number): void {
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
  grad.addColorStop(0, `rgba(255,255,255,${a})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, -0.5, 0, Math.PI * 2);
  g.fill();
}

/** A leaf outline from base (bottom) to tip (top), with optional lobes. */
function leaf(g: Ctx, cx: number, cy: number, len: number, wid: number, bend: number, lobes = 0, r?: Rng): void {
  const n = 18;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = cy + len / 2 - t * len;
    const xc = cx + Math.sin(t * Math.PI) * bend;
    let w = Math.sin(Math.pow(t, 0.8) * Math.PI) * wid * (1 - t * 0.25);
    if (lobes && r) w *= 0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * lobes + (r() - 0.5) * 0.4));
    left.push([xc - w, y]);
    right.push([xc + w, y]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  left.forEach((p) => g.lineTo(p[0], p[1]));
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
}

type Draw = (g: Ctx, r: Rng, v: number) => void;

const C = S / 2;

const DRAW: Record<string, Draw> = {
  fiordilatte(g, r) {
    blob(g, C, C, S * 0.36, S * 0.32, r, 0.32, 26, r() * 3);
    g.fillStyle = radial(g, C, C, S * 0.4, [[0, '#fffdf7'], [0.7, '#f1ebdd'], [1, '#ddd3bf']]);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(210,198,175,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const a = r() * Math.PI * 2;
      g.arc(C + Math.cos(a) * S * 0.2, C + Math.sin(a) * S * 0.2, range(r, 10, 30), a, a + 1.4);
      g.stroke();
    }
    g.restore();
    gloss(g, C - S * 0.08, C - S * 0.1, S * 0.16, S * 0.09, 0.35);
  },
  bufala(g, r) {
    blob(g, C, C, S * 0.38, S * 0.33, r, 0.36, 26, r() * 3);
    g.fillStyle = radial(g, C, C, S * 0.42, [[0, '#ffffff'], [0.6, '#f4f0e6'], [1, '#e2dacb']]);
    g.fill();
    gloss(g, C - S * 0.06, C - S * 0.12, S * 0.2, S * 0.1, 0.65);
    gloss(g, C + S * 0.1, C + S * 0.08, S * 0.08, S * 0.05, 0.4);
  },
  salame(g, r) {
    const rad = S * range(r, 0.38, 0.44);
    blob(g, C, C, rad, rad, r, 0.04, 30);
    g.fillStyle = radial(g, C, C, rad, [[0, '#bf4436'], [0.8, '#9c2c24'], [1, '#6e1b17']]);
    g.fill();
    g.save();
    g.clip();
    specks(g, C, C, rad * 0.9, r, 46, [2.5, 7], () => (r() < 0.8 ? 'rgba(245,214,204,0.9)' : 'rgba(250,236,228,0.95)'));
    specks(g, C, C, rad * 0.9, r, 30, [1, 2.2], () => 'rgba(40,10,8,0.7)');
    g.restore();
    g.lineWidth = S * 0.025;
    g.strokeStyle = 'rgba(80,18,14,0.9)';
    g.stroke();
    gloss(g, C - rad * 0.3, C - rad * 0.35, rad * 0.5, rad * 0.25, 0.18);
  },
  nduja(g, r) {
    blob(g, C, C, S * 0.33, S * 0.3, r, 0.42, 22, r() * 3);
    g.fillStyle = radial(g, C, C, S * 0.36, [[0, '#e0582b'], [0.7, '#c03a1c'], [1, '#8c2412']]);
    g.fill();
    g.save();
    g.clip();
    specks(g, C, C, S * 0.3, r, 26, [3, 9], () => 'rgba(130,30,12,0.5)');
    specks(g, C, C, S * 0.3, r, 14, [2, 5], () => 'rgba(255,170,90,0.45)');
    g.restore();
    gloss(g, C - S * 0.07, C - S * 0.08, S * 0.14, S * 0.08, 0.5);
  },
  funghi(g, r) {
    const w = S * range(r, 0.36, 0.42);
    const capH = S * range(r, 0.24, 0.3);
    const stemW = w * range(r, 0.26, 0.34);
    const stemH = S * range(r, 0.22, 0.3);
    const top = C - (capH + stemH) / 2 + capH;
    g.beginPath();
    g.moveTo(C - w, top);
    g.bezierCurveTo(C - w, top - capH * 1.35, C + w, top - capH * 1.35, C + w, top);
    g.quadraticCurveTo(C + w * 0.7, top + capH * 0.12, C + stemW, top + capH * 0.1);
    g.lineTo(C + stemW * 0.9, top + stemH);
    g.quadraticCurveTo(C, top + stemH * 1.12, C - stemW * 0.9, top + stemH);
    g.lineTo(C - stemW, top + capH * 0.1);
    g.quadraticCurveTo(C - w * 0.7, top + capH * 0.12, C - w, top);
    g.closePath();
    g.fillStyle = radial(g, C, top, w * 1.1, [[0, '#f6eee0'], [0.75, '#e8dcc6'], [1, '#cdb894']]);
    g.fill();
    g.lineWidth = S * 0.02;
    g.strokeStyle = '#8c6c4c';
    g.stroke();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(160,130,95,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const x = C - w * 0.8 + (i / 13) * w * 1.6;
      g.beginPath();
      g.moveTo(x, top - capH * 0.15);
      g.lineTo(C + (x - C) * 0.4, top + capH * 0.05);
      g.stroke();
    }
    g.restore();
  },
  olive(g, r, v) {
    const halved = v % 3 === 2;
    const rx = S * (halved ? 0.38 : 0.34);
    const ry = S * (halved ? 0.25 : 0.34);
    const rot = r() * 3;
    g.save();
    g.translate(C, C);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.ellipse(0, 0, rx * 0.36, ry * 0.36, 0, 0, Math.PI * 2);
    g.fillStyle = radial(g, 0, 0, rx, [[0, '#4a3940'], [0.6, '#2b2026'], [1, '#17111a']]);
    g.fill('evenodd');
    g.restore();
    gloss(g, C - rx * 0.4, C - ry * 0.45, rx * 0.4, ry * 0.2, 0.5);
  },
  cipolla(g, r) {
    const rad = S * range(r, 0.3, 0.4);
    const span = r() < 0.4 ? Math.PI * 2 : range(r, Math.PI * 0.9, Math.PI * 1.5);
    const a0 = r() * Math.PI * 2;
    g.lineCap = 'round';
    g.lineWidth = S * 0.075;
    g.strokeStyle = '#efdbe6';
    g.beginPath();
    g.arc(C, C, rad, a0, a0 + span);
    g.stroke();
    g.lineWidth = S * 0.028;
    g.strokeStyle = '#8b2a68';
    g.beginPath();
    g.arc(C, C, rad + S * 0.03, a0, a0 + span);
    g.stroke();
    g.lineWidth = S * 0.012;
    g.strokeStyle = 'rgba(190,120,170,0.7)';
    g.beginPath();
    g.arc(C, C, rad - S * 0.02, a0, a0 + span);
    g.stroke();
  },
  carciofi(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const k = 1 - i * 0.18;
      g.beginPath();
      g.moveTo(0, S * 0.36 * k);
      g.bezierCurveTo(-S * 0.42 * k, S * 0.1 * k, -S * 0.3 * k, -S * 0.38 * k, 0, -S * 0.42 * k);
      g.bezierCurveTo(S * 0.3 * k, -S * 0.38 * k, S * 0.42 * k, S * 0.1 * k, 0, S * 0.36 * k);
      g.closePath();
      const t = i / layers;
      g.fillStyle = `rgb(${190 - t * 30 + i * 12},${186 - t * 20 + i * 10},${120 + i * 18})`;
      g.fill();
      g.strokeStyle = 'rgba(90,80,40,0.45)';
      g.lineWidth = 2;
      g.stroke();
    }
    g.fillStyle = 'rgba(120,80,110,0.35)';
    g.beginPath();
    g.ellipse(0, -S * 0.34, S * 0.08, S * 0.05, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  },
  acciughe(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const len = S * 0.9;
    const wid = S * range(r, 0.07, 0.09);
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = -len / 2 + t * len;
      const y = Math.sin(t * Math.PI * 1.3) * S * 0.05 - Math.sin(t * Math.PI) * wid;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let i = 20; i >= 0; i--) {
      const t = i / 20;
      const x = -len / 2 + t * len;
      const y = Math.sin(t * Math.PI * 1.3) * S * 0.05 + Math.sin(t * Math.PI) * wid * (t > 0.92 ? 1.6 : 1);
      g.lineTo(x, y);
    }
    g.closePath();
    const grad = g.createLinearGradient(0, -wid, 0, wid);
    grad.addColorStop(0, '#9a7158');
    grad.addColorStop(0.5, '#6e4b3a');
    grad.addColorStop(1, '#4c3226');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(200,195,185,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 1; i < 19; i++) {
      const t = i / 20;
      const x = -len / 2 + t * len;
      const y = Math.sin(t * Math.PI * 1.3) * S * 0.05;
      if (i === 1) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
  },
  pomodorini(g, r) {
    const rad = S * range(r, 0.36, 0.42);
    const rot = r() * 6.28;
    g.save();
    g.translate(C, C);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, rad, rad * 0.92, 0, 0, Math.PI * 2);
    g.fillStyle = '#b8231b';
    g.fill();
    g.beginPath();
    g.ellipse(0, 0, rad * 0.86, rad * 0.79, 0, 0, Math.PI * 2);
    g.fillStyle = radial(g, 0, 0, rad, [[0, '#f0705a'], [1, '#d63c2c']]);
    g.fill();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      g.beginPath();
      g.ellipse(Math.cos(a) * rad * 0.42, Math.sin(a) * rad * 0.42, rad * 0.26, rad * 0.18, a, 0, Math.PI * 2);
      g.fillStyle = 'rgba(250,170,140,0.85)';
      g.fill();
      for (let s = 0; s < 4; s++) {
        g.beginPath();
        g.ellipse(Math.cos(a) * rad * 0.42 + range(r, -6, 6), Math.sin(a) * rad * 0.42 + range(r, -5, 5), 3.5, 2.2, r() * 3, 0, Math.PI * 2);
        g.fillStyle = 'rgba(225,210,120,0.95)';
        g.fill();
      }
    }
    g.restore();
    gloss(g, C - rad * 0.3, C - rad * 0.35, rad * 0.45, rad * 0.22, 0.5);
  },
  friarielli(g, r) {
    const n = 4 + Math.floor(r() * 3);
    g.strokeStyle = '#6f8a48';
    g.lineWidth = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      const d = S * range(r, 0.12, 0.2);
      const x = C + Math.cos(a) * d;
      const y = C + Math.sin(a) * d;
      g.beginPath();
      g.moveTo(C, C);
      g.lineTo(x, y);
      g.stroke();
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2);
      leaf(g, 0, 0, S * range(r, 0.24, 0.32), S * 0.07, range(r, -6, 6), 3, r);
      g.fillStyle = r() < 0.5 ? '#2f4f22' : '#3c5e2a';
      g.fill();
      g.restore();
    }
  },
  basilico(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const len = S * range(r, 0.68, 0.82);
    const wid = len * range(r, 0.3, 0.36);
    leaf(g, 0, 0, len, wid, range(r, -10, 10));
    const grad = g.createLinearGradient(-wid, 0, wid, 0);
    grad.addColorStop(0, '#2f7a2b');
    grad.addColorStop(0.5, '#4fa043');
    grad.addColorStop(1, '#2c6e28');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(190,230,160,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, len / 2);
    g.lineTo(0, -len / 2 + 6);
    g.stroke();
    g.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = len / 2 - (i / 6) * len;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(-wid * 0.7, y - len * 0.1);
      g.moveTo(0, y);
      g.lineTo(wid * 0.7, y - len * 0.1);
      g.stroke();
    }
    g.restore();
    gloss(g, C - 10, C - 14, S * 0.14, S * 0.06, 0.25);
  },
  ananas(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const w = S * range(r, 0.3, 0.36);
    const h = S * range(r, 0.26, 0.32);
    g.beginPath();
    g.moveTo(-w, -h * 0.8);
    g.quadraticCurveTo(0, -h * 1.1, w, -h);
    g.quadraticCurveTo(w * 1.1, 0, w * 0.75, h);
    g.quadraticCurveTo(0, h * 1.15, -w * 0.8, h * 0.9);
    g.quadraticCurveTo(-w * 1.15, 0, -w, -h * 0.8);
    g.closePath();
    const grad = g.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, '#f6dc6e');
    grad.addColorStop(1, '#d8a33a');
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(170,120,30,0.35)';
    g.lineWidth = 1.5;
    for (let i = -8; i <= 8; i++) {
      g.beginPath();
      g.moveTo(i * w * 0.14, -h * 1.2);
      g.lineTo(i * w * 0.14 + 8, h * 1.2);
      g.stroke();
    }
    g.restore();
    g.restore();
  },
  crudo(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const len = S * 0.86;
    const wid = S * range(r, 0.16, 0.2);
    const amp = S * range(r, 0.06, 0.1);
    const freq = range(r, 1.4, 2.2);
    const mid = (t: number): number => Math.sin(t * Math.PI * freq) * amp;
    const w = (t: number): number => wid * (0.7 + 0.3 * Math.sin(t * Math.PI));
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = -len / 2 + t * len;
      if (i === 0) g.moveTo(x, mid(t) - w(t));
      else g.lineTo(x, mid(t) - w(t) + Math.sin(t * 40) * 1.5);
    }
    for (let i = 30; i >= 0; i--) {
      const t = i / 30;
      g.lineTo(-len / 2 + t * len, mid(t) + w(t));
    }
    g.closePath();
    const grad = g.createLinearGradient(0, -wid, 0, wid);
    grad.addColorStop(0, '#f4dcd6');
    grad.addColorStop(0.22, '#dc8a86');
    grad.addColorStop(0.6, '#c45f5c');
    grad.addColorStop(1, '#a84846');
    g.fillStyle = grad;
    g.globalAlpha = 0.97;
    g.fill();
    g.globalAlpha = 1;
    g.restore();
  },
  rucola(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const len = S * range(r, 0.72, 0.86);
    leaf(g, 0, 0, len, len * 0.2, range(r, -12, 12), 4, r);
    const grad = g.createLinearGradient(0, -len / 2, 0, len / 2);
    grad.addColorStop(0, '#3d6a26');
    grad.addColorStop(1, '#5b8a3a');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(200,225,170,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, len / 2);
    g.lineTo(0, -len / 2 + 8);
    g.stroke();
    g.restore();
  },
  burrata(g, r, v) {
    if (v === 0) {
      const rad = S * 0.42;
      g.beginPath();
      g.arc(C, C, rad, 0, Math.PI * 2);
      g.fillStyle = radial(g, C, C, rad, [[0, '#ffffff'], [0.7, '#f3efe5'], [1, '#dcd4c3']]);
      g.fill();
      blob(g, C + rad * 0.15, C - rad * 0.1, rad * 0.3, rad * 0.22, r, 0.3, 16);
      g.fillStyle = 'rgba(248,240,220,0.95)';
      g.fill();
      gloss(g, C - rad * 0.35, C - rad * 0.4, rad * 0.4, rad * 0.2, 0.7);
      return;
    }
    blob(g, C, C, S * 0.38, S * 0.32, r, 0.4, 24, r() * 3);
    g.fillStyle = radial(g, C, C, S * 0.4, [[0, '#fbf3df'], [0.5, '#f3e8cf'], [1, '#e8dfcd']]);
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255,255,250,0.85)';
    g.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      const x = C + range(r, -S * 0.3, S * 0.3);
      const y = C + range(r, -S * 0.25, S * 0.25);
      g.moveTo(x, y);
      g.bezierCurveTo(x + 12, y - 8, x + 20, y + 10, x + range(r, 20, 40), y + range(r, -10, 10));
      g.stroke();
    }
    g.restore();
    gloss(g, C - 14, C - 18, S * 0.18, S * 0.08, 0.5);
  },
  parmigiano(g, r) {
    g.save();
    g.translate(C, C);
    g.rotate(r() * 6.28);
    const w = S * range(r, 0.36, 0.44);
    const h = S * range(r, 0.16, 0.24);
    g.beginPath();
    g.moveTo(-w, 0);
    g.quadraticCurveTo(-w * 0.3, -h * 1.3, w, -h * 0.4);
    g.quadraticCurveTo(w * 0.6, h * 0.8, -w * 0.2, h);
    g.quadraticCurveTo(-w * 0.8, h * 0.6, -w, 0);
    g.closePath();
    g.fillStyle = '#f0e2b4';
    g.globalAlpha = 0.95;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 3;
    g.strokeStyle = '#d4bd84';
    g.stroke();
    g.restore();
  },
};

/** Draws a sheet in code: `count` variants of one topping. */
function drawSheet(id: string, count: number): Sheet {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const { c, g } = canvas(cols * S, rows * S);
  const cells: Cell[] = [];
  const draw = DRAW[id];
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * S;
    const y = Math.floor(i / cols) * S;
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    draw(g, rng(id.length * 977 + i * 131), i);
    g.restore();
    cells.push({ x, y, w: S, h: S });
  }
  return { image: c, cells, photo: false };
}

const cache = new Map<string, Promise<Sheet>>();

/** The sprite sheet for a topping: the processed photo if the site has one, otherwise drawn in code. */
export function sheet(id: string, base: string): Promise<Sheet> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const meta = await fetch(`${base}media/toppings/${id}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<{ cells: Cell[] }>) : null))
        .catch(() => null);
      if (meta?.cells?.length) {
        const img = await loadImage(`${base}media/toppings/${id}.webp`);
        if (img) return { image: img, cells: meta.cells, photo: true };
      }
      return drawSheet(id, id === 'burrata' ? 4 : 6);
    })();
    cache.set(id, p);
  }
  return p;
}
