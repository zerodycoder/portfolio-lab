import * as THREE from 'three';
import { BOARD_SPOT } from './room';
import { OVEN_SPOT } from './oven';
import type { Shot, Stage } from './stage';

/**
 * The places the camera stands. Each is a framing (a target, a direction and the radius that must fit), solved
 * against the screen and the UI around it, so the same place frames well on a phone held upright and on a wide
 * desktop. Phones get their own direction where the composition needs it.
 */

export type PlaceId = 'strada' | 'soglia' | 'sala' | 'banco' | 'forno' | 'fronte' | 'radio' | 'menu' | 'famiglia' | 'lievito' | 'casa';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const at = (pos: THREE.Vector3, target: THREE.Vector3, fov: number): Shot => ({ pos, target, dir: target.clone().sub(pos), radius: 1, fov });

export function shot(id: PlaceId, portrait: boolean): Shot {
  switch (id) {
    case 'strada':
      return portrait ? at(v(-0.35, 1.55, 10.2), v(-0.35, 2.15, 2.8), 60) : at(v(-0.1, 1.6, 8.6), v(-0.25, 2.05, 2.8), 48);
    case 'soglia':
      return at(v(1.25, 1.6, 3.6), v(0.6, 1.35, 0), portrait ? 70 : 56);
    case 'sala':
      return portrait ? at(v(1.35, 1.6, 2.15), v(-0.75, 1.2, -1.7), 72) : at(v(1.55, 1.65, 2.15), v(-0.45, 1.2, -1.8), 56);
    case 'banco':
      return { target: BOARD_SPOT.clone().add(v(0, 0.01, 0)), dir: v(0, -0.86, -0.5), radius: 0.215, fov: 38 };
    case 'forno':
      // Low, inside the vault (its near wall is culled), so the glowing ceiling, the fire and the pizza share the
      // frame. On a phone the camera stands to the right so the fire burns behind the pizza.
      return portrait
        ? { target: OVEN_SPOT.clone().add(v(-0.03, 0.02, 0)), dir: v(-0.75, -0.42, -0.5), radius: 0.17, fov: 72 }
        : { target: OVEN_SPOT.clone().add(v(-0.05, 0.03, -0.02)), dir: v(-0.2, -0.42, -0.88), radius: 0.2, fov: 56 };
    case 'fronte':
      return portrait ? at(v(-0.75, 1.45, 1.4), v(-1.55, 1.2, -1.5), 64) : at(v(-0.35, 1.5, 0.9), v(-1.65, 1.2, -1.6), 50);
    case 'radio':
      return at(v(1.9, 1.7, -0.1), v(3.15, 1.66, -0.4), portrait ? 60 : 44);
    case 'menu':
      return portrait ? at(v(0.4, 1.85, 0.2), v(0.35, 1.95, -2.45), 52) : at(v(0.55, 1.8, -0.35), v(0.6, 1.92, -2.45), 46);
    case 'famiglia':
      return portrait ? at(v(-1.05, 1.6, 0.9), v(-3.15, 1.55, 0.75), 60) : at(v(-1.45, 1.62, 0.95), v(-3.15, 1.52, 0.55), 50);
    case 'lievito':
      return portrait ? at(v(2.0, 1.75, -0.7), v(2.25, 0.98, -2.1), 58) : at(v(1.75, 1.6, -1.0), v(2.3, 1.0, -2.1), 46);
    case 'casa':
      return { target: v(30, 0.05, 0.0), dir: v(0, -0.86, -0.5), radius: 0.34, fov: 40 };
  }
}

/** Camera rig: eases between solved shots along a gentle arc, so a move reads as walking, not cutting. */
export class Rig {
  private from = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, shiftX: 0, shiftY: 0, up: new THREE.Vector3(0, 1, 0) };
  private to = { ...this.from, pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  private t = 1;
  private dur = 1;
  private lift = 0;
  current: PlaceId | null = null;
  private resolve: (() => void) | null = null;
  /** Small pointer/tilt parallax added on top of the shot (radians-ish). */
  readonly sway = new THREE.Vector2();
  private swayNow = new THREE.Vector2();
  /** Extra framing applied to the current shot (e.g. follow the pizza on the peel). */
  override: (() => Shot) | null = null;
  /** A one-off framing set by goShot (kept across re-layouts until the next place). */
  private custom: Shot | null = null;
  /** Looking around from where the camera stands: yaw, pitch (radians). Reset by every move. */
  readonly look = new THREE.Vector2();
  private lookNow = new THREE.Vector2();

  constructor(private readonly stage: Stage) {
    stage.onResize(() => this.refit());
  }

  private get portrait(): boolean {
    return this.stage.height > this.stage.width * 1.05;
  }

  solved(id: PlaceId) {
    return this.stage.solve(shot(id, this.portrait));
  }

  /** Jumps straight to a place. */
  jump(id: PlaceId): void {
    this.current = id;
    this.custom = null;
    const s = this.solved(id);
    this.copyInto(this.to, s);
    this.copyInto(this.from, s);
    this.t = 1;
    this.stage.place(s);
  }

  /** Moves to a place over `seconds`. Resolves on arrival. */
  go(id: PlaceId, seconds = 1.6, lift = 0.25): Promise<void> {
    this.current = id;
    this.custom = null;
    this.look.set(0, 0);
    this.snapshot();
    this.copyInto(this.to, this.solved(id));
    this.t = 0;
    this.dur = seconds;
    this.lift = lift;
    this.resolve?.();
    return new Promise((r) => (this.resolve = r));
  }

  /** Moves to an arbitrary shot (used while following the pizza). */
  goShot(s: Shot, seconds: number): Promise<void> {
    this.custom = s;
    this.snapshot();
    this.copyInto(this.to, this.stage.solve(s));
    this.t = 0;
    this.dur = seconds;
    this.lift = 0;
    this.resolve?.();
    return new Promise((r) => (this.resolve = r));
  }

  private snapshot(): void {
    const c = this.stage.camera;
    this.from.pos.copy(c.position);
    this.from.target.copy(this.stage.lookAt);
    this.from.fov = c.fov;
    this.from.shiftX = this.to.shiftX;
    this.from.shiftY = this.to.shiftY;
    this.from.up.copy(c.up);
  }

  private copyInto(o: typeof this.from, s: ReturnType<Stage['solve']>): void {
    o.pos.copy(s.pos);
    o.target.copy(s.target);
    o.fov = s.fov;
    o.shiftX = s.shiftX;
    o.shiftY = s.shiftY;
    o.up.copy(s.up);
  }

  refit(): void {
    if (!this.current) return;
    const s = this.override ? this.stage.solve(this.override()) : this.custom ? this.stage.solve(this.custom) : this.solved(this.current);
    this.copyInto(this.to, s);
    if (this.t >= 1) {
      this.copyInto(this.from, s);
      this.stage.place(s);
    }
  }

  get moving(): boolean {
    return this.t < 1;
  }

  update(dt: number): void {
    this.swayNow.lerp(this.sway, Math.min(1, dt * 3));
    if (this.override && this.t >= 1) this.copyInto(this.to, this.stage.solve(this.override()));
    if (this.t < 1) this.t = Math.min(1, this.t + dt / this.dur);
    const k = this.t < 1 ? easeInOut(this.t) : 1;
    const pos = this.from.pos.clone().lerp(this.to.pos, k);
    pos.y += Math.sin(k * Math.PI) * this.lift;
    let target = this.from.target.clone().lerp(this.to.target, k);
    this.lookNow.lerp(this.look, Math.min(1, dt * 6));
    if (this.lookNow.lengthSq() > 1e-7) {
      const d = target.clone().sub(pos);
      d.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lookNow.x);
      const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
      d.applyAxisAngle(right, this.lookNow.y);
      target = pos.clone().add(d);
    }
    // Parallax: orbit the camera a touch around its target.
    if (this.swayNow.lengthSq() > 1e-6) {
      const off = pos.clone().sub(target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.swayNow.x * 0.03);
      pos.copy(target).add(off);
      pos.y += this.swayNow.y * 0.02 * off.length();
    }
    this.stage.place({
      pos,
      target,
      fov: this.from.fov + (this.to.fov - this.from.fov) * k,
      shiftX: this.from.shiftX + (this.to.shiftX - this.from.shiftX) * k,
      shiftY: this.from.shiftY + (this.to.shiftY - this.from.shiftY) * k,
      up: this.from.up.clone().lerp(this.to.up, k).normalize(),
    });
    if (this.t >= 1 && this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r();
    }
  }
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

