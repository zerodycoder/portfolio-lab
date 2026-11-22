import { COFFEES, noteColor, type Coffee } from '../lib/catalog';
import { MONTH_LETTERS } from '../lib/format';

/** Seeded PRNG (mulberry32) and value-noise fbm, so every coffee always gets the same terrain. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noise2(seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const N = 256;
  const perm = new Float32Array(N * N);
  for (let i = 0; i < perm.length; i++) perm[i] = r();
  const at = (x: number, y: number): number => perm[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

/**
 * A coffee's terrain: fbm hills plus a peak where the farm sits, steeper for higher farms. Returns the grid and
 * the peak's cell.
 */
function terrain(c: Coffee, cols: number, rows: number): { h: Float32Array; peak: [number, number]; min: number; max: number } {
  const seed = hashString(c.slug);
  const n = noise2(seed);
  const r = rng(seed ^ 0x9e3779b9);
  const px = 0.3 + r() * 0.4;
  const py = 0.3 + r() * 0.35;
  const height = (c.altitude[1] - 1200) / 1100; // 0..1-ish
  const h = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  let peak: [number, number] = [0, 0];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const u = x / cols;
      const v = y / rows;
      let f = 0;
      let amp = 0.5;
      let freq = 3.2;
      for (let o = 0; o < 5; o++) {
        f += amp * n(u * freq * 8 + o * 31, v * freq * 8 + o * 17);
        amp *= 0.5;
        freq *= 2.02;
      }
      const d = Math.hypot((u - px) * 1.2, v - py);
      const val = f * 0.8 + Math.exp(-(d * d) / (0.035 + 0.05 * (1 - height))) * (0.6 + height * 0.8);
      h[y * cols + x] = val;
      if (val < min) min = val;
      if (val > max) {
        max = val;
        peak = [x, y];
      }
    }
  }
  return { h, peak, min, max };
}

/** Marching squares: line segments of the iso-line at `level` through a grid. */
function isoSegments(h: Float32Array, cols: number, rows: number, level: number): number[] {
  const out: number[] = [];
  const lerp = (a: number, b: number): number => (level - a) / (b - a);
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = h[y * cols + x];
      const b = h[y * cols + x + 1];
      const c = h[(y + 1) * cols + x + 1];
      const d = h[(y + 1) * cols + x];
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top: [number, number] = [x + lerp(a, b), y];
      const right: [number, number] = [x + 1, y + lerp(b, c)];
      const bottom: [number, number] = [x + lerp(d, c), y + 1];
      const left: [number, number] = [x, y + lerp(a, d)];
      const seg = (p: [number, number], q: [number, number]): void => {
        out.push(p[0], p[1], q[0], q[1]);
      };
      switch (code) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 5: seg(left, top); seg(bottom, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 10: seg(top, right); seg(left, bottom); break;
      }
    }
  }
  return out;
}

const mixHex = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Draws a coffee's label art into a rectangle: the farm's terrain as contour lines (more lines for a higher farm),
 * coloured from its tasting notes, low to high, with the farm marked on the summit.
 */
export function drawContours(ctx: CanvasRenderingContext2D, c: Coffee, x: number, y: number, w: number, h: number, scale: number, paper = '#f6f0e6'): void {
  const cols = 64;
  const rows = Math.round((cols * h) / w);
  const t = terrain(c, cols, rows);
  const levels = 9 + Math.round(((c.altitude[1] - 1500) / 800) * 8);
  const colors = c.notes.map(noteColor);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < levels; i++) {
    const level = t.min + ((t.max - t.min) * i) / levels;
    const k = i / levels;
    const ci = k * (colors.length - 1);
    const i0 = Math.floor(ci);
    const col = mixHex(colors[i0], colors[Math.min(colors.length - 1, i0 + 1)], ci - i0);
    const segs = isoSegments(t.h, cols, rows, level);
    ctx.beginPath();
    for (let s = 0; s < segs.length; s += 4) {
      ctx.moveTo(x + (segs[s] / (cols - 1)) * w, y + (segs[s + 1] / (rows - 1)) * h);
      ctx.lineTo(x + (segs[s + 2] / (cols - 1)) * w, y + (segs[s + 3] / (rows - 1)) * h);
    }
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.55 + 0.45 * k;
    ctx.lineWidth = (i % 4 === 0 ? 1.5 : 0.9) * scale;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // The farm on the summit.
  const fx = x + (t.peak[0] / (cols - 1)) * w;
  const fy = y + (t.peak[1] / (rows - 1)) * h;
  ctx.fillStyle = '#2a1d15';
  ctx.beginPath();
  ctx.moveTo(fx, fy - 6 * scale);
  ctx.lineTo(fx + 5 * scale, fy + 3 * scale);
  ctx.lineTo(fx - 5 * scale, fy + 3 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.font = `500 ${7.5 * scale}px "Geist Mono Variable", monospace`;
  ctx.textAlign = fx > x + w * 0.62 ? 'right' : 'left';
  const label = `${c.altitude[1].toLocaleString('en-US')} m`;
  const lx = fx + (ctx.textAlign === 'right' ? -8 : 8) * scale;
  ctx.fillStyle = paper;
  const tw = ctx.measureText(label).width;
  ctx.fillRect(ctx.textAlign === 'right' ? lx - tw - 2 * scale : lx - 2 * scale, fy - 4 * scale, tw + 4 * scale, 10 * scale);
  ctx.fillStyle = '#2a1d15';
  ctx.fillText(label, lx, fy + 4 * scale);
  ctx.restore();
}

const cache = new Map<string, string>();

/**
 * Renders a coffee bag (pouch, crimped top, valve, label) to an image URL at `width` CSS px (2x pixels). Every label
 * is generated from the coffee's data: terrain from its altitude, colours from its notes, harvest months, roast.
 */
export function bagImage(c: Coffee, width: number): string {
  const key = `${c.slug}@${width}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 2;
  const W = width;
  const H = Math.round(width * 1.36);
  const cv = document.createElement('canvas');
  cv.width = W * s;
  cv.height = H * s;
  const ctx = cv.getContext('2d')!;
  ctx.scale(s, s);
  const k = W / 300; // design units: the bag is drawn at 300 wide
  const dark = luminance(c.bag) < 0.35;

  // Pouch outline: slightly bulging sides, rounded bottom, crimped top band.
  const top = 14 * k;
  const pouch = new Path2D();
  pouch.moveTo(18 * k, top);
  pouch.lineTo(W - 18 * k, top);
  pouch.quadraticCurveTo(W - 6 * k, H * 0.5, W - 12 * k, H - 22 * k);
  pouch.quadraticCurveTo(W - 14 * k, H - 6 * k, W - 34 * k, H - 6 * k);
  pouch.lineTo(34 * k, H - 6 * k);
  pouch.quadraticCurveTo(14 * k, H - 6 * k, 12 * k, H - 22 * k);
  pouch.quadraticCurveTo(6 * k, H * 0.5, 18 * k, top);
  pouch.closePath();

  // Soft floor shadow.
  ctx.save();
  ctx.fillStyle = 'rgba(30,20,10,0.22)';
  ctx.filter = 'none';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 6 * k, W * 0.42, 6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = c.bag;
  ctx.fill(pouch);
  ctx.save();
  ctx.clip(pouch);
  // Cylindrical shading across, light from the left.
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.28)');
  shade.addColorStop(0.18, 'rgba(255,255,255,0.12)');
  shade.addColorStop(0.32, 'rgba(255,255,255,0.05)');
  shade.addColorStop(0.75, 'rgba(0,0,0,0.04)');
  shade.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  // Kraft speckle on light pouches; a matte sheen on dark ones.
  const r = rng(hashString(c.slug) + 3);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = dark ? `rgba(255,255,255,${r() * 0.03})` : `rgba(80,50,20,${r() * 0.08})`;
    ctx.fillRect(r() * W, r() * H, 0.8 + r(), 0.8 + r());
  }
  // Gusset folds near the sides.
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(60,35,15,0.14)';
  ctx.lineWidth = 1.2 * k;
  [26, W / k - 26].forEach((gx) => {
    ctx.beginPath();
    ctx.moveTo(gx * k, top + 22 * k);
    ctx.quadraticCurveTo(gx * k + (gx < 100 ? -4 : 4) * k, H * 0.55, gx * k, H - 26 * k);
    ctx.stroke();
  });
  // Bottom crease.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, H - 26 * k, W, 2 * k);
  ctx.restore();

  // Crimped seal band with a zigzag edge.
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(18 * k, top, W - 36 * k, 18 * k);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(60,35,15,0.22)';
  ctx.lineWidth = 1 * k;
  for (let x = 22 * k; x < W - 22 * k; x += 5 * k) {
    ctx.beginPath();
    ctx.moveTo(x, top + 3 * k);
    ctx.lineTo(x, top + 15 * k);
    ctx.stroke();
  }
  ctx.fillStyle = c.bag;
  ctx.beginPath();
  ctx.moveTo(18 * k, top);
  for (let x = 18 * k; x <= W - 18 * k; x += 6 * k) {
    ctx.lineTo(x + 3 * k, top - 4 * k);
    ctx.lineTo(Math.min(W - 18 * k, x + 6 * k), top);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Degassing valve.
  ctx.save();
  const vx = W - 56 * k;
  const vy = 58 * k;
  ctx.fillStyle = dark ? '#3a302a' : 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(vx, vy, 9 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(60,35,15,0.25)';
  ctx.lineWidth = 1.2 * k;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(vx, vy, 4 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Brand on the pouch above the label.
  ctx.fillStyle = dark ? '#efe6d8' : '#2a1d15';
  ctx.font = `600 ${15 * k}px "Fraunces Variable", Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${3 * k}px`;
  ctx.fillText('SAYEH', 34 * k, 64 * k);
  ctx.letterSpacing = '0px';

  // The label.
  const lx = 30 * k;
  const ly = 84 * k;
  const lw = W - 60 * k;
  const lh = H - 120 * k;
  const paper = '#f7f1e6';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 4 * k;
  ctx.shadowOffsetY = 1 * k;
  ctx.fillStyle = paper;
  ctx.fillRect(lx, ly, lw, lh);
  ctx.restore();

  const ink = '#2a1d15';
  const pad = 12 * k;
  const index = COFFEES.indexOf(c) + 1;
  ctx.fillStyle = ink;
  ctx.font = `500 ${7.5 * k}px "Geist Mono Variable", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(c.kind === 'blend' ? 'HOUSE BLEND' : c.kind === 'decaf' ? 'DECAF' : 'SINGLE ORIGIN', lx + pad, ly + 16 * k);
  ctx.textAlign = 'right';
  ctx.fillText(`Nº ${String(index).padStart(2, '0')}`, lx + lw - pad, ly + 16 * k);

  drawContours(ctx, c, lx + pad, ly + 24 * k, lw - pad * 2, lh * 0.42, k, paper);

  // Name and origin.
  let y = ly + 24 * k + lh * 0.42 + 26 * k;
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  let size = 22 * k;
  ctx.font = `600 ${size}px "Fraunces Variable", Georgia, serif`;
  while (ctx.measureText(c.name).width > lw - pad * 2 && size > 12 * k) {
    size -= 1 * k;
    ctx.font = `600 ${size}px "Fraunces Variable", Georgia, serif`;
  }
  ctx.fillText(c.name, lx + pad, y);
  y += 15 * k;
  ctx.font = `500 ${8.5 * k}px "Instrument Sans Variable", system-ui, sans-serif`;
  ctx.fillStyle = '#5a4637';
  ctx.fillText(`${c.country.toUpperCase()} · ${c.region.toUpperCase()}`, lx + pad, y);

  // Notes with their colour dots.
  y += 18 * k;
  ctx.font = `500 ${9.5 * k}px "Instrument Sans Variable", system-ui, sans-serif`;
  let nx = lx + pad;
  c.notes.forEach((note) => {
    ctx.fillStyle = noteColor(note);
    ctx.beginPath();
    ctx.arc(nx + 3.5 * k, y - 3.2 * k, 3.5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(note, nx + 10 * k, y);
    nx += ctx.measureText(note).width + 20 * k;
  });

  // Bottom row: harvest calendar, roast level, weight.
  const by = ly + lh - 14 * k;
  ctx.strokeStyle = 'rgba(42,29,21,0.18)';
  ctx.lineWidth = 0.8 * k;
  ctx.beginPath();
  ctx.moveTo(lx + pad, by - 22 * k);
  ctx.lineTo(lx + lw - pad, by - 22 * k);
  ctx.stroke();
  ctx.font = `500 ${5.6 * k}px "Geist Mono Variable", monospace`;
  ctx.textAlign = 'center';
  for (let m = 0; m < 12; m++) {
    const mx = lx + pad + m * 9 * k + 3 * k;
    const on = c.harvest.includes(m + 1);
    ctx.fillStyle = on ? noteColor(c.notes[0]) : 'rgba(42,29,21,0.15)';
    ctx.fillRect(mx - 3 * k, by - 16 * k, 6 * k, 6 * k);
    ctx.fillStyle = on ? ink : 'rgba(42,29,21,0.45)';
    ctx.fillText(MONTH_LETTERS[m], mx, by - 2 * k);
  }
  // Roast: three beans, filled up to the level.
  const beans = c.roastLevel < 0.33 ? 1 : c.roastLevel < 0.55 ? 2 : 3;
  for (let i = 0; i < 3; i++) {
    const bx = lx + lw - pad - 52 * k + i * 11 * k;
    ctx.save();
    ctx.translate(bx, by - 11 * k);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2 * k, 4.6 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = i < beans ? '#5a3325' : 'rgba(42,29,21,0.15)';
    ctx.fill();
    ctx.strokeStyle = paper;
    ctx.lineWidth = 0.9 * k;
    ctx.beginPath();
    ctx.moveTo(0, -3.8 * k);
    ctx.quadraticCurveTo(1.4 * k, 0, 0, 3.8 * k);
    ctx.stroke();
    ctx.restore();
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = ink;
  ctx.font = `600 ${8 * k}px "Geist Mono Variable", monospace`;
  ctx.fillText('250 G', lx + lw - pad, by - 1 * k);

  const url = cv.toDataURL('image/webp', 0.92);
  cache.set(key, url);
  return url;
}
