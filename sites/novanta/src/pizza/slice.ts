import * as THREE from 'three';
import { Layers, LAYER } from './layers';
import type { Pizza, Piece } from './pizza';

/**
 * Cutting and the cheese pull. Cuts run through the centre, as a pizza wheel does; each one is an angle the
 * surface shader draws as a groove. Pulling a slice lifts a copy of that wedge (the shader removes it from the
 * pizza and keeps it in the copy, so toppings that straddle a cut are cut too), and strands of melted cheese,
 * each a small Verlet rope, stretch between the two edges, thin out as they lengthen and snap one by one.
 */

type Strand = {
  a: THREE.Vector3;
  b0: THREE.Vector3;
  pts: THREE.Vector3[];
  prev: THREE.Vector3[];
  max: number;
  broken: boolean;
  fade: number;
  mesh: THREE.Mesh;
};

const SEGS = 10;
const TAU = Math.PI * 2;

export class Slicer {
  cuts: number[] = [];
  private lift: {
    start: number;
    span: number;
    group: THREE.Group;
    pieces: Piece[];
    dir: THREE.Vector3;
    dist: number;
    target: number;
    strands: Strand[];
    snapped: number;
    releasing: boolean;
  } | null = null;
  private mat = new THREE.MeshStandardMaterial({ color: '#f8ecd0', roughness: 0.3, emissive: '#3a2c14', emissiveIntensity: 0.35 });
  onSnap: (() => void) | null = null;
  onStretch: ((amount: number) => void) | null = null;

  constructor(private readonly pizza: Pizza) {}

  reset(): void {
    this.cuts = [];
    this.syncCuts();
  }

  /** Adds a cut through the centre at `angle` (any direction; stored mod π). */
  addCut(angle: number): boolean {
    const a = ((angle % Math.PI) + Math.PI) % Math.PI;
    if (this.cuts.some((c) => Math.abs(c - a) < 0.18 || Math.abs(c - a) > Math.PI - 0.18)) return false;
    if (this.cuts.length >= 8) return false;
    this.cuts.push(a);
    this.syncCuts();
    return true;
  }

  private syncCuts(): void {
    const u = this.pizza.surface;
    u.uCutCount.value = this.cuts.length;
    u.uCuts.value = [...this.cuts, ...new Array(8 - this.cuts.length).fill(0)];
  }

  /** Slice boundaries, ascending in [0, 2π). */
  get bounds(): number[] {
    return this.cuts.flatMap((c) => [c, c + Math.PI]).sort((a, b) => a - b);
  }

  get slices(): number {
    return this.cuts.length * 2;
  }

  /** The wedge containing angle θ: [start, span]. */
  wedgeAt(th: number): [number, number] | null {
    const b = this.bounds;
    if (b.length < 2) return null;
    const t = ((th % TAU) + TAU) % TAU;
    for (let i = 0; i < b.length; i++) {
      const s = b[i];
      const e = i + 1 < b.length ? b[i + 1] : b[0] + TAU;
      const tt = t < s ? t + TAU : t;
      if (tt >= s && tt < e) return [s, e - s];
    }
    return null;
  }

  get lifting(): boolean {
    return !!this.lift;
  }

  /** Starts pulling the slice at angle θ. */
  begin(th: number, parent: THREE.Object3D): boolean {
    if (this.lift) return false;
    const w = this.wedgeAt(th);
    if (!w) return false;
    const [start, span] = w;
    const clone = this.pizza.cloneForSlice(start, span);
    this.pizza.setWedge(start, span, -1);
    parent.add(clone.group);
    const mid = start + span / 2;
    const dir = new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid));
    // Cheese strands along both cut edges, wherever there is melted cheese.
    const strands: Strand[] = [];
    const data = this.pizza.layers.melt.g.getImageData(0, 0, LAYER, LAYER).data;
    const top = this.pizza.shape.base * (1 + 0.25 * this.pizza.shape.puff) + 0.003;
    for (const edge of [start, start + span]) {
      const R = this.pizza.outlineAt(edge) - 0.03;
      const spots: number[] = [];
      // Cheese within a centimetre either side of the cut counts: it gets dragged across.
      const nx = -Math.sin(edge);
      const nz = Math.cos(edge);
      for (let r = 0.015; r < R; r += 0.008) {
        let best = 0;
        for (const off of [-0.01, -0.005, 0, 0.005, 0.01]) {
          const [px, py] = Layers.px(Math.cos(edge) * r + nx * off, Math.sin(edge) * r + nz * off, LAYER);
          best = Math.max(best, data[(Math.floor(py) * LAYER + Math.floor(px)) * 4]);
        }
        if (best > 55) spots.push(r);
      }
      spots
        .sort(() => Math.random() - 0.5)
        .slice(0, 9)
        .forEach((r) => {
          const p = new THREE.Vector3(Math.cos(edge) * r, top + Math.random() * 0.002, Math.sin(edge) * r);
          const pts = Array.from({ length: SEGS + 1 }, () => p.clone());
          const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
          parent.add(mesh);
          strands.push({ a: p.clone(), b0: p.clone(), pts, prev: pts.map((q) => q.clone()), max: 0.04 + Math.random() * 0.12, broken: false, fade: 1, mesh });
        });
    }
    this.lift = { start, span, group: clone.group, pieces: clone.pieces, dir, dist: 0, target: 0, strands, snapped: 0, releasing: false };
    return true;
  }

  get hasCheese(): boolean {
    return !!this.lift && this.lift.strands.length > 0;
  }

  /** How far out the slice should be, in metres. */
  pull(dist: number): void {
    if (this.lift && !this.lift.releasing) this.lift.target = Math.max(0, Math.min(0.24, dist));
  }

  /** Lets go: the slice drops back into place. Resolves when it has. */
  release(): Promise<number> {
    const l = this.lift;
    if (!l) return Promise.resolve(0);
    l.releasing = true;
    l.target = 0;
    return new Promise((resolve) => {
      const check = (): void => {
        if (!this.lift) return resolve(l.snapped);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  update(dt: number): void {
    const l = this.lift;
    if (!l) return;
    l.dist += (l.target - l.dist) * Math.min(1, dt * (l.releasing ? 9 : 14));
    const lift = Math.min(0.05, l.dist * 0.45);
    l.group.position.copy(l.dir).multiplyScalar(l.dist).setY(lift);
    // The crust end rises a little more than the tip: tilt about the slice's tangent.
    const tangent = new THREE.Vector3(-l.dir.z, 0, l.dir.x);
    l.group.quaternion.setFromAxisAngle(tangent, -Math.min(0.18, l.dist * 0.9));
    l.group.updateMatrix();
    const g = new THREE.Vector3(0, -9.8 * dt * dt, 0);
    for (const s of l.strands) {
      const b = s.b0.clone().applyMatrix4(l.group.matrix);
      const len = s.a.distanceTo(b);
      if (!s.broken && len > s.max) {
        s.broken = true;
        l.snapped++;
        this.onSnap?.();
      }
      if (!s.broken) this.onStretch?.(Math.min(1, len / s.max));
      // Verlet integration with the two ends pinned (until it snaps: then only the pizza end).
      for (let i = 1; i < SEGS + (s.broken ? 1 : 0); i++) {
        const p = s.pts[i];
        const v = p.clone().sub(s.prev[i]).multiplyScalar(0.96);
        s.prev[i].copy(p);
        p.add(v).add(g);
        p.y = Math.max(p.y, 0.004);
      }
      s.pts[0].copy(s.a);
      if (!s.broken) s.pts[SEGS].copy(b);
      const rest = s.broken ? 0.002 : (len / SEGS) * 0.97;
      for (let k = 0; k < 6; k++)
        for (let i = 0; i < SEGS; i++) {
          const p = s.pts[i];
          const q = s.pts[i + 1];
          const d = q.clone().sub(p);
          const dl = d.length() || 1e-6;
          const diff = (dl - rest) / dl;
          if (i === 0) q.addScaledVector(d, -diff);
          else if (i + 1 === SEGS && !s.broken) p.addScaledVector(d, diff);
          else {
            p.addScaledVector(d, diff * 0.5);
            q.addScaledVector(d, -diff * 0.5);
          }
        }
      if (s.broken) s.fade = Math.max(0, s.fade - dt * 1.6);
      // Cheese keeps its volume: the longer the strand, the thinner it gets.
      const radius = (0.0034 / Math.sqrt(1 + (len / 0.02) * 0.7)) * s.fade;
      s.mesh.geometry.dispose();
      s.mesh.visible = radius > 0.00015 && len > 0.003;
      if (s.mesh.visible) s.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s.pts), 14, radius, 5, false);
    }
    if (l.releasing && l.dist < 0.002) this.finish();
  }

  private finish(): void {
    const l = this.lift;
    if (!l) return;
    l.group.removeFromParent();
    l.pieces.forEach((p) => (p.mesh.material as THREE.Material).dispose());
    l.strands.forEach((s) => {
      s.mesh.geometry.dispose();
      s.mesh.removeFromParent();
    });
    this.pizza.setWedge(0, 0, 0);
    this.lift = null;
  }
}
