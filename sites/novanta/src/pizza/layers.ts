import * as THREE from 'three';
import { canvas, colorTex, dataTex, loadImage, paint, type Ctx } from '../lib/canvas';
import { fbmTile, hash2 } from '../lib/rand';
import { TEX_HALF } from './dough';
import { LITE, mediaUrl } from '../lib/quality';

/**
 * The pizza's painted layers, all in pizza space ([-0.2 m, 0.2 m]² → the whole canvas):
 * - layer: R = tomato sauce, G = olive oil (pizza bianca)
 * - melt: R = melted cheese, G = melted ’nduja, B = orange oil spilled by salami and ’nduja
 * - drizzle: R = hot honey, G = olive oil after the oven, B = soft contact shadows under the toppings
 * - spots: R = charred leopard spots, G = golden blisters
 * - heat: the oven's accumulated heat (0..2 stored as 0..1)
 *
 * Every canvas starts opaque black and is painted additively, so each channel accumulates independently.
 */

export const LAYER = 512;
export const SPOTS = LITE ? 512 : 1024;
export const HEAT = 96;

type Channel = 0 | 1 | 2;
const CH = ['255,0,0', '0,255,0', '0,0,255'];

function blank(size: number): { c: HTMLCanvasElement; g: Ctx } {
  const k = canvas(size);
  k.g.fillStyle = '#000';
  k.g.fillRect(0, 0, size, size);
  return k;
}

export class Layers {
  readonly layer = blank(LAYER);
  readonly melt = blank(LAYER);
  readonly drizzle = blank(LAYER);
  readonly spots = blank(SPOTS);
  readonly heat = new Float32Array(HEAT * HEAT);
  private heatBytes = new Uint8Array(HEAT * HEAT * 4);
  readonly tex: { layer: THREE.CanvasTexture; melt: THREE.CanvasTexture; drizzle: THREE.CanvasTexture; spots: THREE.CanvasTexture; heat: THREE.DataTexture };

  constructor() {
    this.tex = {
      layer: dataTex(this.layer.c),
      melt: dataTex(this.melt.c),
      drizzle: dataTex(this.drizzle.c),
      spots: dataTex(this.spots.c),
      heat: new THREE.DataTexture(this.heatBytes, HEAT, HEAT, THREE.RGBAFormat),
    };
    this.tex.heat.magFilter = THREE.LinearFilter;
    this.tex.heat.minFilter = THREE.LinearFilter;
    this.tex.heat.flipY = true;
    this.tex.heat.needsUpdate = true;
    Object.values(this.tex).forEach((t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    });
  }

  /** Pizza space (x, z) → canvas pixels for a canvas of `size`. */
  static px(x: number, z: number, size: number): [number, number] {
    return [(x / (2 * TEX_HALF) + 0.5) * size, (z / (2 * TEX_HALF) + 0.5) * size];
  }

  static m2px(m: number, size: number): number {
    return (m / (2 * TEX_HALF)) * size;
  }

  /** A soft round dab of `strength` (0..1) into one channel of a layer. */
  dab(target: 'layer' | 'melt' | 'drizzle' | 'spots', ch: Channel, x: number, z: number, radius: number, strength: number, hard = 0.35): void {
    const k = this[target];
    const size = k.c.width;
    const [px, py] = Layers.px(x, z, size);
    const r = Math.max(1, Layers.m2px(radius, size));
    const g = k.g;
    g.globalCompositeOperation = 'lighter';
    const grad = g.createRadialGradient(px, py, r * hard, px, py, r);
    grad.addColorStop(0, `rgba(${CH[ch]},${strength})`);
    grad.addColorStop(1, `rgba(${CH[ch]},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    this.tex[target].needsUpdate = true;
  }

  /** A stroke of dabs between two points (drizzles, sauce strokes). */
  stroke(target: 'layer' | 'melt' | 'drizzle', ch: Channel, a: [number, number], b: [number, number], radius: number, strength: number, hard = 0.35): void {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / (radius * 0.35)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.dab(target, ch, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, radius, strength, hard);
    }
  }

  /** Average channel value over the points inside `inside(x, z)`, sampled on a grid (0..1). */
  coverage(target: 'layer' | 'melt', ch: Channel, inside: (x: number, z: number) => boolean, threshold = 0.45): number {
    const k = this[target];
    const size = k.c.width;
    const data = k.g.getImageData(0, 0, size, size).data;
    let hit = 0;
    let total = 0;
    const step = 0.006;
    for (let z = -TEX_HALF; z <= TEX_HALF; z += step) {
      for (let x = -TEX_HALF; x <= TEX_HALF; x += step) {
        if (!inside(x, z)) continue;
        total++;
        const [px, py] = Layers.px(x, z, size);
        const v = data[(Math.floor(py) * size + Math.floor(px)) * 4 + ch] / 255;
        if (v > threshold) hit++;
      }
    }
    return total ? hit / total : 0;
  }

  heatAt(x: number, z: number): number {
    const u = Math.min(HEAT - 1, Math.max(0, Math.floor((x / (2 * TEX_HALF) + 0.5) * HEAT)));
    const v = Math.min(HEAT - 1, Math.max(0, Math.floor((z / (2 * TEX_HALF) + 0.5) * HEAT)));
    return this.heat[v * HEAT + u];
  }

  /** Uploads the heat field (row 0 = z = -0.2 m, matching the canvases). */
  pushHeat(): void {
    for (let i = 0; i < HEAT * HEAT; i++) {
      const b = Math.min(255, Math.max(0, Math.round((this.heat[i] / 2) * 255)));
      this.heatBytes[i * 4] = b;
      this.heatBytes[i * 4 + 1] = b;
      this.heatBytes[i * 4 + 2] = b;
      this.heatBytes[i * 4 + 3] = 255;
    }
    this.tex.heat.needsUpdate = true;
  }

  clear(which: ('layer' | 'melt' | 'drizzle' | 'spots')[] = ['layer', 'melt', 'drizzle', 'spots']): void {
    which.forEach((w) => {
      const k = this[w];
      k.g.globalCompositeOperation = 'source-over';
      k.g.fillStyle = '#000';
      k.g.fillRect(0, 0, k.c.width, k.c.height);
      this.tex[w].needsUpdate = true;
    });
  }

  clearHeat(): void {
    this.heat.fill(0);
    this.pushHeat();
  }

  /** Snapshot for saving (the delivery survives a reload). */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    (['layer', 'melt', 'drizzle', 'spots'] as const).forEach((w) => (out[w] = this[w].c.toDataURL('image/png')));
    out.heat = btoa(String.fromCharCode(...Array.from(this.heat, (h) => Math.min(255, Math.round((h / 2) * 255)))));
    return out;
  }

  async restore(snap: Record<string, string>): Promise<void> {
    for (const w of ['layer', 'melt', 'drizzle', 'spots'] as const) {
      if (!snap[w]) continue;
      const img = await loadImage(snap[w]);
      if (!img) continue;
      this[w].g.globalCompositeOperation = 'source-over';
      this[w].g.drawImage(img, 0, 0, this[w].c.width, this[w].c.height);
      this.tex[w].needsUpdate = true;
    }
    if (snap.heat) {
      const bin = atob(snap.heat);
      for (let i = 0; i < Math.min(bin.length, this.heat.length); i++) this.heat[i] = (bin.charCodeAt(i) / 255) * 2;
      this.pushHeat();
    }
  }
}

/** Detail tiles (seamless) for the dough, the sauce and the cheese: the processed photo, or drawn here. */
export async function detailTiles(base: string): Promise<{ dough: THREE.Texture; sauce: THREE.Texture; cheese: THREE.Texture }> {
  const load = async (name: string, draw: () => HTMLCanvasElement): Promise<THREE.Texture> => {
    const img = await loadImage(mediaUrl(base, `textures/${name}.webp`));
    const tex = img ? new THREE.Texture(img) : colorTex(draw());
    tex.colorSpace = THREE.SRGBColorSpace;
    // Photos aren't seamless: mirror them (the shader also blends two rotated samples to hide the repeat).
    tex.wrapS = tex.wrapT = img ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  };
  const [dough, sauce, cheese] = await Promise.all([load('t-dough', doughTile), load('t-sauce', sauceTile), load('t-cheese', cheeseTile)]);
  return { dough, sauce, cheese };
}

const T = 512;

function doughTile(): HTMLCanvasElement {
  const { c, g } = canvas(T);
  paint(g, T, T, (x, y) => {
    const n = fbmTile(x / 64, y / 64, 8, 4, 3);
    const m = fbmTile(x / 16, y / 16, 32, 3, 9);
    const s = hash2(x, y, 5) > 0.9985 ? -26 : 0;
    const v = (n - 0.5) * 22 + (m - 0.5) * 10 + s;
    return [240 + v, 225 + v, 196 + v * 0.9];
  });
  // A few gas bubbles under the skin: lighter domes with a faint ring.
  for (let i = 0; i < 26; i++) {
    const x = hash2(i, 1, 2) * T;
    const y = hash2(i, 2, 2) * T;
    const r = 3 + hash2(i, 3, 2) * 9;
    for (const [ox, oy] of [[0, 0], [T, 0], [-T, 0], [0, T], [0, -T]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, 'rgba(255,250,238,0.5)');
      grad.addColorStop(0.8, 'rgba(255,250,238,0.15)');
      grad.addColorStop(1, 'rgba(190,170,140,0.25)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

function sauceTile(): HTMLCanvasElement {
  const { c, g } = canvas(T);
  paint(g, T, T, (x, y) => {
    const n = fbmTile(x / 64, y / 64, 8, 4, 21);
    const m = fbmTile(x / 16, y / 16, 32, 3, 4);
    const bits = hash2(Math.floor(x / 3), Math.floor(y / 3), 8) > 0.985 ? 1 : 0;
    const k = (n - 0.5) * 2;
    let r = 176 + k * 34 + (m - 0.5) * 18;
    let gg = 36 + k * 16 + (m - 0.5) * 8;
    let b = 22 + k * 8;
    if (bits) {
      r += 35;
      gg += 40;
      b += 25;
    }
    return [r, gg, b];
  });
  return c;
}

function cheeseTile(): HTMLCanvasElement {
  const { c, g } = canvas(T);
  paint(g, T, T, (x, y) => {
    const n = fbmTile(x / 64, y / 64, 8, 4, 31);
    const st = fbmTile(x / 32, y / 32, 16, 3, 12);
    const v = (n - 0.5) * 26 + (st - 0.5) * 14;
    return [246 + v * 0.6, 238 + v * 0.8, 214 + v];
  });
  return c;
}
