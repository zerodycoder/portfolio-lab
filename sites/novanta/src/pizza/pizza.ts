import * as THREE from 'three';
import { range, rng, type Rng } from '../lib/rand';
import { KIND, MAX_TOPPING_KINDS, SIZES, type DrizzleId, type Kind, type SauceId, KINDS, DRIZZLES, SAUCES } from './catalog';
import { DoughGeometry, DoughRing, SEG, defaultShape, type DoughShape } from './dough';
import { Layers, detailTiles } from './layers';
import { loadKind, pieceDepth, pieceMaterial, type KindAssets, type PieceUniforms } from './pieces';
import type { Physics } from './physics';
import { createSurface, surfaceDepth, type SurfaceMaps, type SurfaceUniforms } from './surface';

export type Piece = {
  kind: Kind;
  variant: number;
  mesh: THREE.Mesh;
  uniforms: PieceUniforms;
  scale: number;
  /** Cook level (driven by the bake). */
  cook: number;
  /** Melted fraction for cheese and ’nduja (0..1). */
  melt: number;
  /** Fell off onto the bench. */
  lost?: boolean;
};

export type SavedPiece = { k: string; v: number; p: number[]; q: number[]; s: number; c: number; m: number };

export type DoughPhase = 'ball' | 'press' | 'stretch' | 'done';

/**
 * One pizza: the dough, its painted layers, the toppings and its recipe. It lives in its own space (pizza space:
 * metres, the bottom of the dough on y = 0, the centre at the origin) and is carried from the bench to the oven,
 * the cutting board, the box and the doorstep.
 */
export class Pizza {
  readonly group = new THREE.Group();
  readonly toppings = new THREE.Group();
  readonly shape: DoughShape = defaultShape(11);
  readonly ring = new DoughRing(0.045);
  readonly layers: Layers;
  readonly dough: THREE.Mesh;
  readonly doughGeo = new DoughGeometry();
  surface!: SurfaceUniforms;
  readonly pieces: Piece[] = [];
  readonly kinds = new Map<string, KindAssets>();
  phase: DoughPhase = 'ball';
  press = 0;
  sauce: SauceId | null = null;
  cheese: string | null = null;
  drizzles = new Set<DrizzleId>();
  name = '';
  seed = Math.floor(Math.random() * 1e9);
  private dirty = true;
  private r: Rng;
  private readonly base: string;
  /** Set while the ring is being worked (stretched). */
  working = false;

  readonly maps: SurfaceMaps;

  private constructor(base: string, layers: Layers, maps: SurfaceMaps, material: THREE.Material, surface: SurfaceUniforms) {
    this.base = base;
    this.layers = layers;
    this.maps = maps;
    this.r = rng(this.seed);
    this.surface = surface;
    this.dough = new THREE.Mesh(this.doughGeo.geometry, material);
    this.dough.customDepthMaterial = surfaceDepth(surface);
    this.dough.castShadow = true;
    this.dough.receiveShadow = true;
    this.dough.name = 'dough';
    this.group.add(this.dough, this.toppings);
    this.update(0);
  }

  static async create(base: string): Promise<Pizza> {
    const layers = new Layers();
    const tiles = await detailTiles(base);
    const maps = { ...tiles, ...layers.tex };
    const { material, uniforms } = createSurface(maps);
    return new Pizza(base, layers, maps, material, uniforms);
  }

  /** Preloads the assets of every topping (sprites → geometry) so a handful drops without a hitch. */
  private loading: Promise<void> | null = null;

  /** Builds every topping's pieces (sprites → geometry). Once; later calls wait for the same work. */
  preload(): Promise<void> {
    this.loading ??= (async () => {
      // Variants are built in quiet moments (lib/idle.ts); a step that needs them wraps this in hurry().
      for (const k of KINDS) this.kinds.set(k.id, await loadKind(k, this.base));
    })();
    return this.loading;
  }

  // ————— Dough —————

  setPress(p: number): void {
    this.press = Math.min(1, Math.max(0, p));
    const e = this.press;
    const R = 0.045 + (0.1 - 0.045) * e;
    this.ring.reset(R);
    this.shape.dome = Math.pow(1 - e, 1.6);
    this.shape.base = 0.006 + 0.001 * e;
    this.shape.rim = 0.008 * e;
    this.phase = e >= 1 ? 'stretch' : e > 0 ? 'press' : 'ball';
    this.dirty = true;
  }

  get radius(): number {
    return this.ring.mean;
  }

  get sizeIndex(): number {
    const m = this.ring.mean;
    if (m < (SIZES[0].radius + SIZES[1].radius) / 2) return 0;
    if (m < (SIZES[1].radius + SIZES[2].radius) / 2) return 1;
    return 2;
  }

  get size(): (typeof SIZES)[number] {
    return SIZES[this.sizeIndex];
  }

  /** Is (x, z) inside the dough's outline, with an optional inset (m)? */
  inside(x: number, z: number, inset = 0): boolean {
    const r = Math.hypot(x, z);
    const th = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    const j = Math.round((th / (Math.PI * 2)) * SEG) % SEG;
    return r < this.shape.radii[j] - inset;
  }

  outlineAt(th: number): number {
    const j = Math.round((((th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2)) * SEG) % SEG;
    return this.shape.radii[j];
  }

  topAt(x: number, z: number): number {
    return this.doughGeo.topAt(this.shape, x, z);
  }

  /** Thickness follows the stretch (the dough keeps its volume) and the air moves out into the rim. */
  private shapeFromRing(): void {
    this.shape.radii.set(this.ring.r);
    if (this.phase === 'stretch' || this.phase === 'done') {
      const m = this.ring.mean;
      this.shape.base = Math.max(0.0028, 0.007 * Math.pow(0.1 / m, 2));
      const t = Math.min(1, Math.max(0, (m - 0.1) / 0.06));
      this.shape.rim = 0.008 + 0.006 * t * t * (3 - 2 * t);
      this.shape.dome = 0;
    }
  }

  setPuff(p: number): void {
    if (Math.abs(this.shape.puff - p) < 1e-4) return;
    this.shape.puff = p;
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    // While the dough is being worked the soft body runs, and the mesh is rebuilt only while it actually moves.
    if ((this.working || this.phase === 'stretch') && this.ring.step(Math.min(dt, 1 / 30))) this.dirty = true;
    if (this.dirty) {
      this.shapeFromRing();
      this.doughGeo.update(this.shape);
      this.dirty = false;
    }
  }

  // ————— Sauce —————

  paintSauce(x: number, z: number, radius: number, strength: number): void {
    if (!this.sauce) return;
    this.layers.dab('layer', this.sauce === 'rossa' ? 0 : 1, x, z, radius, strength, 0.25);
  }

  sauceCoverage(): number {
    if (!this.sauce) return 0;
    return this.layers.coverage('layer', this.sauce === 'rossa' ? 0 : 1, (x, z) => this.inside(x, z, 0.026), 0.42);
  }

  /** Sauce that spilled onto the rim (a pizzaiolo would never). */
  rimSauce(): number {
    if (!this.sauce) return 0;
    return this.layers.coverage('layer', this.sauce === 'rossa' ? 0 : 1, (x, z) => this.inside(x, z, 0) && !this.inside(x, z, 0.012), 0.5);
  }

  // ————— Toppings —————

  get kindsOn(): string[] {
    const ids = new Set<string>();
    this.pieces.forEach((p) => !p.lost && p.kind.stage !== 'cheese' && ids.add(p.kind.id));
    return [...ids];
  }

  canAdd(kind: Kind): boolean {
    if (kind.stage === 'cheese') return true;
    const on = this.kindsOn;
    return on.includes(kind.id) || on.length < MAX_TOPPING_KINDS;
  }

  /** Makes a piece mesh (not yet added). */
  makePiece(kind: Kind, variant?: number, scale?: number): Piece | null {
    const a = this.kinds.get(kind.id);
    if (!a || !a.variants.length) return null;
    const v = variant ?? Math.floor(this.r() * a.variants.length);
    const vv = a.variants[v % a.variants.length];
    const { material, uniforms } = pieceMaterial(a, vv);
    const mesh = new THREE.Mesh(vv.geometry, material);
    mesh.customDepthMaterial = pieceDepth(uniforms);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const s = scale ?? range(this.r, 0.86, 1.14);
    mesh.scale.setScalar(s);
    mesh.userData.piece = true;
    const piece: Piece = { kind, variant: v % a.variants.length, mesh, uniforms, scale: s, cook: 0, melt: 0 };
    mesh.userData.ref = piece;
    return piece;
  }

  /** Drops a handful from above with physics. Returns the pieces. */
  handful(kind: Kind, physics: Physics, at?: { x: number; z: number; spread: number }): Piece[] {
    const out: Piece[] = [];
    const n = kind.handful;
    const R = this.radius - 0.03;
    for (let i = 0; i < n; i++) {
      const p = this.makePiece(kind);
      if (!p) break;
      let x: number;
      let z: number;
      if (at) {
        const a = this.r() * Math.PI * 2;
        const d = Math.sqrt(this.r()) * at.spread;
        x = at.x + Math.cos(a) * d;
        z = at.z + Math.sin(a) * d;
      } else {
        // Spread evenly-ish: stratified angle, random radius.
        const a = ((i + this.r() * 0.8) / n) * Math.PI * 2 + this.r() * 0.4;
        const d = Math.sqrt(0.08 + this.r() * 0.92) * R * 0.9;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
      }
      p.mesh.position.set(x, 0.06 + i * 0.012 + this.r() * 0.05, z);
      p.mesh.quaternion.setFromEuler(new THREE.Euler(range(this.r, -0.5, 0.5), this.r() * Math.PI * 2, range(this.r, -0.5, 0.5)));
      this.toppings.add(p.mesh);
      this.pieces.push(p);
      physics.add(
        p.mesh,
        this.kinds.get(kind.id)!.variants[p.variant].hull,
        p.scale,
        new THREE.Vector3(range(this.r, -0.05, 0.05), -0.25 - this.r() * 0.2, range(this.r, -0.05, 0.05)),
        new THREE.Vector3(range(this.r, -3, 3), range(this.r, -2, 2), range(this.r, -3, 3)),
      );
      out.push(p);
    }
    return out;
  }

  /** Places a piece flat at (x, z) without physics (post-oven toppings, restoring a saved pizza). */
  placeFlat(p: Piece, x: number, z: number, yaw: number, lift = 0): void {
    p.mesh.position.set(x, this.topAt(x, z) + 0.0015 + lift, z);
    p.mesh.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
    if (!p.mesh.parent) this.toppings.add(p.mesh);
    if (!this.pieces.includes(p)) this.pieces.push(p);
  }

  removePiece(p: Piece): void {
    this.toppings.remove(p.mesh);
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    (p.mesh.material as THREE.Material).dispose();
  }

  clearStage(stage: Kind['stage']): void {
    [...this.pieces].filter((p) => p.kind.stage === stage).forEach((p) => this.removePiece(p));
  }

  /** Pieces that ended up off the dough. */
  markLost(): Piece[] {
    const lost: Piece[] = [];
    this.pieces.forEach((p) => {
      if (p.lost) return;
      const { x, z } = p.mesh.position;
      if (!this.inside(x, z, -0.004)) {
        p.lost = true;
        lost.push(p);
      }
    });
    return lost;
  }

  /** Keeps each piece's pizza-space matrix in its shader (for slices). */
  syncPieceMatrices(): void {
    this.pieces.forEach((p) => {
      p.mesh.updateMatrix();
      p.uniforms.uPiece.value.copy(p.mesh.matrix);
    });
  }

  /** Scales the toppings and the painted layers about the centre (the dough was stretched or squeezed after). */
  rescaleDressing(k: number, dy: number): void {
    this.pieces.forEach((p) => {
      p.mesh.position.x *= k;
      p.mesh.position.z *= k;
      p.mesh.position.y += dy;
    });
    this.syncPieceMatrices();
    (['layer', 'melt', 'drizzle', 'spots'] as const).forEach((w) => {
      const { c, g } = this.layers[w];
      const copy = document.createElement('canvas');
      copy.width = c.width;
      copy.height = c.height;
      copy.getContext('2d')!.drawImage(c, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      const s = c.width * k;
      g.drawImage(copy, (c.width - s) / 2, (c.height - s) / 2, s, s);
      this.layers.tex[w].needsUpdate = true;
    });
  }

  /** Paints a soft contact shadow under every piece (call once they have settled). */
  groundPieces(only?: Piece[]): void {
    (only ?? this.pieces).forEach((p) => {
      if (p.lost || !p.mesh.visible) return;
      const a = this.kinds.get(p.kind.id)?.variants[p.variant];
      const r = (a?.radius ?? 0.015) * p.scale;
      this.layers.dab('drizzle', 2, p.mesh.position.x, p.mesh.position.z, r * 1.15, p.kind.thick > 0.006 ? 0.55 : 0.35, 0.5);
    });
  }

  /** Keeps (mode 1) or removes (mode -1) an angular sector of the dough and every topping; 0 shows all. */
  setWedge(start: number, span: number, mode: number): void {
    this.surface.uWedge.value.set(start, span, mode);
    this.pieces.forEach((p) => p.uniforms.uWedge.value.set(start, span, mode));
  }

  /** A copy of the dough and the toppings (sharing geometry and textures), for a slice lifted off the pizza. */
  cloneForSlice(start: number, span: number): { group: THREE.Group; surface: SurfaceUniforms; pieces: Piece[] } {
    const group = new THREE.Group();
    const { material, uniforms } = createSurface(this.maps);
    uniforms.uWedge.value.set(start, span, 1);
    uniforms.uCutCount.value = this.surface.uCutCount.value;
    uniforms.uCuts.value = [...this.surface.uCuts.value];
    uniforms.uFlour.value = this.surface.uFlour.value;
    const dough = new THREE.Mesh(this.dough.geometry, material);
    dough.customDepthMaterial = surfaceDepth(uniforms);
    dough.castShadow = true;
    group.add(dough);
    const pieces: Piece[] = [];
    this.pieces.forEach((p) => {
      if (!p.mesh.visible) return;
      const c = this.makePiece(p.kind, p.variant, p.scale);
      if (!c) return;
      c.mesh.position.copy(p.mesh.position);
      c.mesh.quaternion.copy(p.mesh.quaternion);
      c.mesh.scale.copy(p.mesh.scale);
      c.mesh.updateMatrix();
      c.uniforms.uPiece.value.copy(c.mesh.matrix);
      c.uniforms.uCook.value = p.uniforms.uCook.value;
      c.uniforms.uCurl.value = p.uniforms.uCurl.value;
      c.uniforms.uDissolve.value = p.uniforms.uDissolve.value;
      c.uniforms.uWedge.value.set(start, span, 1);
      group.add(c.mesh);
      pieces.push(c);
    });
    return { group, surface: uniforms, pieces };
  }

  // ————— Recipe —————

  get price(): number {
    let total = this.size.price;
    if (this.cheese) total += KIND[this.cheese].price;
    this.kindsOn.forEach((id) => (total += KIND[id].price));
    this.drizzles.forEach((d) => (total += DRIZZLES.find((x) => x.id === d)?.price ?? 0));
    return total;
  }

  /** Lines for the ticket: [Italian, English, price]. */
  get lines(): [string, string, number][] {
    const out: [string, string, number][] = [];
    const s = this.size;
    out.push([`Pizza ${s.it} ${s.cm} cm`, `${s.cm} cm, 48-hour dough`, s.price]);
    if (this.sauce) {
      const sc = SAUCES.find((x) => x.id === this.sauce)!;
      out.push([sc.it, sc.en, sc.price]);
    }
    if (this.cheese) out.push([KIND[this.cheese].it, KIND[this.cheese].en, KIND[this.cheese].price]);
    this.kindsOn.forEach((id) => out.push([KIND[id].it, KIND[id].en, KIND[id].price]));
    this.drizzles.forEach((d) => {
      const x = DRIZZLES.find((y) => y.id === d)!;
      out.push([x.it, x.en, x.price]);
    });
    return out;
  }

  /** A name made from what is on it, in the way Neapolitan menus name their pizzas. */
  suggestName(): string {
    const on = this.kindsOn;
    const day = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][new Date().getDay()];
    if (!on.length && this.sauce === 'rossa' && this.cheese) return 'Margherita della casa';
    if (!on.length && this.sauce === 'rossa') return 'Marinara del vicolo';
    if (on.includes('ananas')) return 'La Scandalosa';
    if (on.includes('nduja') || on.includes('salame')) return `La Piccante del ${day}`;
    if (on.includes('friarielli')) return 'La Napoletana verace';
    if (on.includes('acciughe')) return 'La Marinara di Cetara';
    if (on.length >= 4) return 'La Ricca';
    if (on.every((id) => ['funghi', 'carciofi', 'cipolla', 'olive', 'pomodorini', 'basilico', 'friarielli'].includes(id))) return 'L’Ortolana';
    return `La Pizza del ${day}`;
  }

  // ————— Save / restore —————

  save(): object {
    return {
      seed: this.seed,
      radii: Array.from(this.shape.radii, (r) => Math.round(r * 10000)),
      base: this.shape.base,
      rim: this.shape.rim,
      puff: this.shape.puff,
      sauce: this.sauce,
      cheese: this.cheese,
      drizzles: [...this.drizzles],
      name: this.name,
      cuts: this.surface.uCuts.value.slice(0, this.surface.uCutCount.value),
      pieces: this.pieces
        .filter((p) => !p.lost)
        .map<SavedPiece>((p) => ({
          k: p.kind.id,
          v: p.variant,
          p: p.mesh.position.toArray().map((n) => Math.round(n * 10000) / 10000),
          q: p.mesh.quaternion.toArray().map((n) => Math.round(n * 1000) / 1000),
          s: Math.round(p.scale * 1000) / 1000,
          c: Math.round(p.cook * 100) / 100,
          m: Math.round(p.melt * 100) / 100,
        })),
      layers: this.layers.snapshot(),
    };
  }

  async restore(o: Record<string, unknown>): Promise<void> {
    const radii = o.radii as number[];
    this.phase = 'done';
    this.ring.r.set(radii.map((r) => r / 10000));
    this.ring.rest.set(this.ring.r);
    this.shape.radii.set(this.ring.r);
    this.shape.base = o.base as number;
    this.shape.rim = o.rim as number;
    this.shape.puff = o.puff as number;
    this.shape.dome = 0;
    this.sauce = o.sauce as SauceId | null;
    this.cheese = o.cheese as string | null;
    this.drizzles = new Set(o.drizzles as DrizzleId[]);
    this.name = (o.name as string) ?? '';
    const cuts = (o.cuts as number[] | undefined) ?? [];
    this.surface.uCutCount.value = cuts.length;
    this.surface.uCuts.value = [...cuts, ...new Array(8 - cuts.length).fill(0)];
    await this.layers.restore(o.layers as Record<string, string>);
    (o.pieces as SavedPiece[]).forEach((sp) => {
      const kind = KIND[sp.k];
      if (!kind) return;
      const p = this.makePiece(kind, sp.v, sp.s);
      if (!p) return;
      p.mesh.position.fromArray(sp.p);
      p.mesh.quaternion.fromArray(sp.q);
      p.cook = sp.c;
      p.melt = sp.m;
      this.toppings.add(p.mesh);
      this.pieces.push(p);
    });
    this.doughGeo.update(this.shape);
  }
}
