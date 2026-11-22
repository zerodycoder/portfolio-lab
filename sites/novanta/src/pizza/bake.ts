import * as THREE from 'three';
import { rng, smoothstep } from '../lib/rand';
import { TEX_HALF } from './dough';
import { HEAT, Layers, SPOTS } from './layers';
import type { Pizza } from './pizza';

/**
 * The oven model. A Neapolitan oven bakes from three sides at once: the stone floor, the dome's radiant heat and the
 * flame itself, which burns on one side. Every cell of a 96 × 96 heat field in pizza space accumulates the heat it
 * receives where it currently is in the oven, so a pizza that is never turned bakes pale on one side and burns on
 * the other, exactly as in a real wood-fired oven. 90 oven seconds play in about 22 real seconds.
 *
 * As heat builds, the rim puffs (oven spring), cheese melts into the sauce, salami cups and sweats orange oil, and
 * leopard spots blister and char on the cornicione, each spot at its own threshold.
 */

export const OVEN_SPEED = 4;
/** Fire position in oven space (relative to the pizza's centre on the floor), metres. */
const FIRE = new THREE.Vector2(-0.26, -0.06);
const SIGMA2 = 0.22 * 0.22;
const BASE = 0.56 / 80;
const FLAME = 1.3 / 80;

type Spot = { x: number; z: number; r: number; thr: number; t: number; rim: boolean };

export type BakeReport = {
  seconds: number;
  spots: number;
  char: number;
  evenness: number;
  doneness: number;
  grade: 'Maestro' | 'Pizzaiolo' | 'Apprendista';
  verdict: [string, string];
  turns: number;
};

export class Bake {
  time = 0;
  angle = 0;
  turns = 0;
  boost = 1;
  boostTarget = 1;
  running = false;
  private spots: Spot[] = [];
  private growing: Spot[] = [];
  private pushTimer = 0;
  shown = 0;

  constructor(private readonly pizza: Pizza) {
    this.seedSpots();
  }

  private seedSpots(): void {
    const r = rng(this.pizza.seed ^ 0x5bd1e995);
    this.spots = [];
    for (let i = 0; i < 300; i++) {
      const th = r() * Math.PI * 2;
      const R = this.pizza.outlineAt(th);
      const rim = r() < 0.78;
      // Rim spots sit on the cornicione's crown and outer slope; the rest freckle the dough.
      const d = rim ? R - this.pizza.shape.rimWidth * (0.25 + r() * 0.65) : Math.sqrt(r()) * (R - 0.02);
      this.spots.push({
        x: Math.cos(th) * d,
        z: Math.sin(th) * d,
        r: rim ? 0.0018 + Math.pow(r(), 2.2) * 0.0052 : 0.0012 + r() * 0.0024,
        thr: 0.78 + r() * 0.7,
        t: -1,
        rim,
      });
    }
  }

  reset(): void {
    this.time = 0;
    this.angle = 0;
    this.turns = 0;
    this.boost = 1;
    this.shown = 0;
    this.pizza.layers.clearHeat();
    this.pizza.layers.clear(['spots', 'melt']);
    this.pizza.setPuff(0);
    this.pizza.pieces.forEach((p) => {
      p.cook = 0;
      p.melt = 0;
      p.mesh.visible = true;
      this.applyPiece(p, 0);
    });
    this.seedSpots();
  }

  /** Rotates the pizza in the oven (radians); counts deliberate turns. */
  turn(delta: number): void {
    this.angle += delta;
    if (Math.abs(delta) > 0.6) this.turns++;
  }

  addTurnAmount(total: number): void {
    // A drag that adds up to a quarter turn counts as a turn.
    this.turnAcc += Math.abs(total);
    while (this.turnAcc > Math.PI / 2.2) {
      this.turnAcc -= Math.PI / 2.2;
      this.turns++;
    }
  }
  private turnAcc = 0;

  step(dtReal: number): void {
    if (!this.running) return;
    const dt = dtReal * OVEN_SPEED;
    this.time += dt;
    this.boost += (this.boostTarget - this.boost) * Math.min(1, dtReal * 3);
    const L = this.pizza.layers;
    const H = L.heat;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const flame = FLAME * this.boost;
    // The group's yaw rotates pizza space into oven space: x' = c·x + s·z, z' = -s·x + c·z (three.js Y rotation).
    for (let v = 0; v < HEAT; v++) {
      const z = ((v + 0.5) / HEAT - 0.5) * 2 * TEX_HALF;
      for (let u = 0; u < HEAT; u++) {
        const x = ((u + 0.5) / HEAT - 0.5) * 2 * TEX_HALF;
        const wx = c * x + s * z - FIRE.x;
        const wz = -s * x + c * z - FIRE.y;
        const q = BASE + flame * Math.exp(-(wx * wx + wz * wz) / SIGMA2);
        H[v * HEAT + u] += q * dt;
      }
    }
    this.pushTimer -= dtReal;
    if (this.pushTimer <= 0) {
      L.pushHeat();
      this.pushTimer = 1 / 20;
    }
    this.pizza.setPuff(smoothstep(3, 34, this.time));
    this.pizza.surface.uBubbling.value = smoothstep(18, 42, this.time) * (1 - smoothstep(130, 160, this.time));
    this.updateSpots(dtReal);
    this.pizza.pieces.forEach((p) => this.cookPiece(p));
  }

  private updateSpots(dt: number): void {
    const L = this.pizza.layers;
    for (const sp of this.spots) {
      if (sp.t >= 0) continue;
      if (L.heatAt(sp.x, sp.z) * (sp.rim ? 1.18 : 1) > sp.thr) {
        sp.t = 0;
        this.growing.push(sp);
        if (sp.rim) this.shown++;
      }
    }
    const g = L.spots.g;
    g.globalCompositeOperation = 'lighten';
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const sp = this.growing[i];
      sp.t = Math.min(1, sp.t + dt * 2.2);
      const [px, py] = Layers.px(sp.x, sp.z, SPOTS);
      const r = Layers.m2px(sp.r, SPOTS) * (0.3 + 0.7 * sp.t);
      // Golden blister halo first, then the charred heart.
      const halo = g.createRadialGradient(px, py, 0, px, py, r * 2.2);
      halo.addColorStop(0, `rgba(0,${Math.round(220 * sp.t)},0,1)`);
      halo.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = halo;
      g.beginPath();
      g.arc(px, py, r * 2.2, 0, Math.PI * 2);
      g.fill();
      const core = g.createRadialGradient(px, py, 0, px, py, r);
      core.addColorStop(0, `rgba(${Math.round(255 * sp.t)},0,0,1)`);
      core.addColorStop(0.6, `rgba(${Math.round(200 * sp.t)},0,0,1)`);
      core.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = core;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      if (sp.t >= 1) this.growing.splice(i, 1);
    }
    g.globalCompositeOperation = 'source-over';
    L.tex.spots.needsUpdate = true;
  }

  private cookPiece(p: Pizza['pieces'][number]): void {
    const { x, z } = p.mesh.position;
    // Leaves sit on top and catch the dome's heat first; chunky pieces lag behind.
    const exposure = p.kind.profile === 'leaf' ? 1.25 : p.kind.profile === 'pillow' ? 0.85 : 1;
    const h = this.pizza.layers.heatAt(x, z) * exposure;
    p.cook = h;
    const melt = p.kind.cook.melt;
    if (melt) {
      const m = smoothstep(0.22, 0.8, h);
      if (m > p.melt + 0.01) {
        const d = m - p.melt;
        p.melt = m;
        const rad = 0.014 * p.scale * (p.kind.id === 'bufala' ? 1.15 : 1) * (1 + 0.8 * m);
        // A pool is a cluster of overlapping blobs that drift as it spreads, never a circle.
        const r = rng((p.mesh.id * 7919) ^ 0x9e37);
        for (let b = 0; b < 4; b++) {
          const a = r() * Math.PI * 2;
          const o = (0.25 + r() * 0.45) * rad * m;
          this.pizza.layers.dab('melt', melt === 'cheese' ? 0 : 1, x + Math.cos(a) * o, z + Math.sin(a) * o, rad * (0.6 + r() * 0.4), Math.min(1, d * 2.2), 0.3);
        }
        if (melt === 'nduja') this.pizza.layers.dab('melt', 2, x, z, rad * 1.6, d * 0.7, 0.1);
      }
    } else if (p.kind.id === 'salame' && h > 0.45 && p.melt < 1) {
      const m = smoothstep(0.45, 1.1, h);
      if (m > p.melt + 0.02) {
        this.pizza.layers.dab('melt', 2, x, z, 0.03 * p.scale, (m - p.melt) * 0.6, 0.2);
        p.melt = m;
      }
    }
    this.applyPiece(p, h);
  }

  /** Shape and shader state of a piece at heat h. */
  applyPiece(p: Pizza['pieces'][number], h: number): void {
    const k = p.kind.cook;
    p.uniforms.uCook.value = h;
    p.uniforms.uCurl.value = (k.curl ?? 0) * 0.0045 * smoothstep(0.3, 0.95, h);
    const shrink = 1 + ((k.shrink ?? 1) - 1) * smoothstep(0.3, 1, h);
    if (k.melt) {
      const m = p.melt;
      p.mesh.scale.set(p.scale * (1 + 0.45 * m), p.scale * (1 - 0.75 * m), p.scale * (1 + 0.45 * m));
      p.uniforms.uDissolve.value = smoothstep(0.3, 0.92, m);
      p.mesh.visible = m < 0.97;
    } else {
      p.mesh.scale.setScalar(p.scale * shrink);
    }
  }

  /** Re-applies the saved cook state (restoring a pizza). */
  applyAll(): void {
    this.pizza.pieces.forEach((p) => this.applyPiece(p, p.cook));
  }

  report(): BakeReport {
    const L = this.pizza.layers;
    const vals: number[] = [];
    for (let i = 0; i < 96; i++) {
      const th = (i / 96) * Math.PI * 2;
      const R = this.pizza.outlineAt(th) - this.pizza.shape.rimWidth * 0.5;
      vals.push(L.heatAt(Math.cos(th) * R, Math.sin(th) * R) * 1.18);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    const evenness = Math.max(0, Math.min(1, 1 - sd / Math.max(mean, 0.1) / 0.5));
    const char = vals.filter((v) => v > 1.5).length / vals.length;
    const doneness = mean;
    let grade: BakeReport['grade'] = 'Apprendista';
    if (evenness > 0.82 && doneness > 0.85 && doneness < 1.35 && char < 0.12) grade = 'Maestro';
    else if (evenness > 0.6 && doneness > 0.7 && char < 0.3) grade = 'Pizzaiolo';
    let verdict: [string, string];
    if (doneness < 0.7) verdict = ['Un po’ pallida.', 'A little pale. It wanted more fire.'];
    else if (char > 0.35) verdict = ['Ben cotta… troppo ben cotta.', 'Well done. Too well done.'];
    else if (evenness < 0.6) verdict = ['Girala di più, la prossima volta!', 'One side saw the fire, the other didn’t. Turn it more.'];
    else if (grade === 'Maestro') verdict = ['Perfetta. Sei nato a Napoli?', 'Perfect. Were you born in Naples?'];
    else verdict = ['Bella! Quasi perfetta.', 'Beautiful. Nearly perfect.'];
    return { seconds: Math.round(this.time), spots: this.shown, char, evenness, doneness, grade, verdict, turns: this.turns };
  }

  /** Is the pizza in its ready window? */
  get ready(): boolean {
    const r = this.report();
    return r.doneness > 0.85;
  }
}
