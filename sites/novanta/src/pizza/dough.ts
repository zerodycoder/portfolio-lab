import * as THREE from 'three';
import { noise2 } from '../lib/rand';

/**
 * The dough as one closed surface: a flat middle, the cornicione (the puffy rim) and the underside. Its outline is a
 * ring of radii, one per angle, so the stretch can be uneven; the cross-section is rebuilt from a handful of
 * parameters every frame the dough is being worked.
 *
 * Texture coordinates are planar: the square [-0.2 m, 0.2 m]² of pizza space maps onto every pizza texture and mask,
 * so the sauce someone paints lands exactly where it was painted whatever shape the dough takes.
 */

export const SEG = 128;
export const TEX_HALF = 0.2;

const N_IN = 12;
const N_ARC = 20;
const N_BOT = 7;
const K = N_IN + N_ARC + N_BOT;

export type DoughShape = {
  /** Outline radius per angle (SEG values), metres. */
  radii: Float32Array;
  /** Thickness of the middle, metres. */
  base: number;
  /** Height of the rim above the base, metres. */
  rim: number;
  /** Width of the rim, metres. */
  rimWidth: number;
  /** 0 = a flat disc, 1 = a round dough ball. */
  dome: number;
  /** Height of the dome at full dome. */
  domeH: number;
  /** Oven spring, 0 raw … 1 fully puffed. */
  puff: number;
  /** Seed for the rim's unevenness. */
  seed: number;
};

export function defaultShape(seed = 7): DoughShape {
  const radii = new Float32Array(SEG).fill(0.045);
  return { radii, base: 0.004, rim: 0, rimWidth: 0.026, dome: 1, domeH: 0.042, puff: 0, seed };
}

export class DoughGeometry {
  readonly geometry = new THREE.BufferGeometry();
  private pos: Float32Array;
  private uv: Float32Array;
  private zone: Float32Array;
  /** Height of the top surface (pizza space) at a radius fraction and angle, kept for placing toppings. */
  private topCache = new Float32Array(SEG * N_IN);

  constructor() {
    const count = SEG * K;
    this.pos = new Float32Array(count * 3);
    this.uv = new Float32Array(count * 2);
    this.zone = new Float32Array(count * 2);
    const index: number[] = [];
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      for (let k = 0; k < K - 1; k++) {
        const a = j * K + k;
        const b = j1 * K + k;
        const c = j1 * K + k + 1;
        const d = j * K + k + 1;
        // Counter-clockwise seen from outside: the top faces up, the underside down.
        index.push(a, b, d, b, c, d);
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geometry.setAttribute('aZone', new THREE.BufferAttribute(this.zone, 2));
  }

  /** Rebuilds every vertex from the shape. */
  update(s: DoughShape): void {
    const { pos, uv, zone } = this;
    const puffRim = s.rim * (1 + 0.55 * s.puff);
    const base = s.base * (1 + 0.25 * s.puff);
    for (let j = 0; j < SEG; j++) {
      const th = (j / SEG) * Math.PI * 2;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const R = s.radii[j];
      // The cornicione is never perfectly even: some stretches puff more than others.
      const wob = 1 + 0.22 * (noise2(Math.cos(th) * 2.2 + 5, Math.sin(th) * 2.2 + 5, s.seed) - 0.5) * 2 * (0.4 + s.puff);
      const hr = puffRim * wob;
      const W = Math.min(s.rimWidth * (1 + 0.15 * s.puff), R * 0.45);
      const yTop = base + hr;
      const cx = R - W / 2;
      const a = W / 2;
      const b = Math.max(yTop / 2, 0.0005);
      const yc = yTop / 2;
      const domeTop = (r: number): number => {
        const q = Math.min(1, r / Math.max(R, 1e-4));
        return s.domeH * s.dome * Math.sqrt(Math.max(0, 1 - q * q));
      };
      // Where the rim's ellipse meets the flat middle.
      const t0 = Math.max(-1, Math.min(1, (base - yc) / b));
      const phi0 = Math.PI - Math.asin(t0);
      const rIn = cx + a * Math.cos(phi0);
      let k = 0;
      const put = (r: number, y: number, rimness: number, bottom: number): void => {
        const i = j * K + k;
        pos[i * 3] = cs * r;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = sn * r;
        uv[i * 2] = 0.5 + (cs * r) / (2 * TEX_HALF);
        uv[i * 2 + 1] = 0.5 - (sn * r) / (2 * TEX_HALF);
        zone[i * 2] = rimness;
        zone[i * 2 + 1] = bottom;
        k++;
      };
      for (let n = 0; n < N_IN; n++) {
        const r = (rIn * n) / N_IN;
        const y = base + domeTop(r);
        this.topCache[j * N_IN + n] = y;
        put(r, y, 0, 0);
      }
      for (let n = 0; n < N_ARC; n++) {
        const t = n / (N_ARC - 1);
        const phi = phi0 + (-Math.PI / 2 - phi0) * t;
        const r = cx + a * Math.cos(phi);
        const y = yc + b * Math.sin(phi) + domeTop(r) * (1 - t);
        put(r, Math.max(0, y), Math.min(1, t * 3), t > 0.75 ? (t - 0.75) * 4 : 0);
      }
      for (let n = 1; n <= N_BOT; n++) {
        const r = cx * (1 - n / N_BOT);
        put(r, 0, 0, 1);
      }
    }
    const p = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.needsUpdate = true;
    (this.geometry.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aZone') as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  /** The middle's surface height at a point (pizza space), for dropping toppings onto it. */
  topAt(s: DoughShape, x: number, z: number): number {
    const r = Math.hypot(x, z);
    const th = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    const j = Math.round((th / (Math.PI * 2)) * SEG) % SEG;
    const R = s.radii[j];
    if (r > R) return 0;
    const q = Math.min(1, r / R);
    return s.base * (1 + 0.25 * s.puff) + s.domeH * s.dome * Math.sqrt(Math.max(0, 1 - q * q));
  }
}

/**
 * The stretch, as a soft body: every outline point is a damped spring pulled towards its rest radius, smoothed
 * against its neighbours. Pulling past the yield point moves the rest radius out (the dough stays stretched) but
 * a part of every pull springs back, the way gluten does.
 */
export class DoughRing {
  readonly r = new Float32Array(SEG);
  private v = new Float32Array(SEG);
  readonly rest = new Float32Array(SEG);
  /** External targets while a pointer pulls: weight and target radius per point. */
  private pullW = new Float32Array(SEG);
  private pullR = new Float32Array(SEG);
  readonly max = 0.19;

  constructor(start: number) {
    this.r.fill(start);
    this.rest.fill(start);
  }

  reset(radius: number): void {
    this.r.fill(radius);
    this.rest.fill(radius);
    this.v.fill(0);
    this.pullW.fill(0);
  }

  get mean(): number {
    let s = 0;
    for (let i = 0; i < SEG; i++) s += this.r[i];
    return s / SEG;
  }

  /** 1 = perfectly round. */
  get roundness(): number {
    const m = this.mean;
    let s = 0;
    for (let i = 0; i < SEG; i++) s += (this.r[i] - m) ** 2;
    return Math.max(0, 1 - Math.sqrt(s / SEG) / (m * 0.08));
  }

  /** A local pull at angle `th` out to radius `to` (spread over about a quarter turn). */
  pull(th: number, to: number): void {
    this.pullW.fill(0);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      let d = Math.abs(a - th) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const w = Math.exp(-(d * d) / 0.32);
      this.pullW[i] = w;
      this.pullR[i] = Math.min(this.max, Math.max(this.r[i], to * (0.75 + 0.25 * w)));
    }
  }

  /** An even pull all round (pinch, or the "stretch for me" button). */
  pullAll(to: number): void {
    for (let i = 0; i < SEG; i++) {
      this.pullW[i] = 1;
      this.pullR[i] = Math.min(this.max, to);
    }
  }

  release(): void {
    this.pullW.fill(0);
  }

  step(dt: number): void {
    const k = 220;
    const damp = 2 * Math.sqrt(k) * 0.85;
    const yieldGap = 0.004;
    const creep = 0.6;
    for (let i = 0; i < SEG; i++) {
      const w = this.pullW[i];
      const target = w > 0.02 ? this.rest[i] + (this.pullR[i] - this.rest[i]) * w : this.rest[i];
      const prev = this.r[(i + SEG - 1) % SEG];
      const next = this.r[(i + 1) % SEG];
      const lap = (prev + next) / 2 - this.r[i];
      const f = k * (target - this.r[i]) + 900 * lap - damp * this.v[i];
      this.v[i] += f * dt;
      // Plastic part: beyond the yield gap, the rest shape follows the stretch.
      const over = this.r[i] - this.rest[i] - yieldGap;
      if (over > 0) this.rest[i] += over * creep * dt * 6;
    }
    for (let i = 0; i < SEG; i++) this.r[i] = Math.min(this.max, Math.max(0.03, this.r[i] + this.v[i] * dt));
    // Rest shape relaxes towards its own neighbours so a hard local pull rounds off a little over time.
    for (let i = 0; i < SEG; i++) {
      const prev = this.rest[(i + SEG - 1) % SEG];
      const next = this.rest[(i + 1) % SEG];
      this.rest[i] += ((prev + next) / 2 - this.rest[i]) * Math.min(1, dt * 1.5);
    }
  }
}
