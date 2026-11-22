import type * as RAPIER_NS from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

type R = typeof RAPIER_NS;

/**
 * Rapier (Rust, compiled to WebAssembly) drops the toppings: every piece is a rigid body with the convex hull of its
 * own shape, landing on a triangle mesh of the actual dough. The world runs in pizza space scaled by 10 (decimetres),
 * which keeps centimetre-sized pieces numerically stable, and only steps while something is still moving.
 */

export const PHYS = 10;

let rapier: Promise<R> | null = null;
export function loadRapier(): Promise<R> {
  if (!rapier) {
    rapier = import('@dimforge/rapier3d-compat').then(async (m) => {
      const lib = (m as unknown as { default?: R }).default ?? (m as unknown as R);
      await lib.init();
      return lib;
    });
  }
  return rapier;
}

export type Body = { mesh: THREE.Object3D; body: RAPIER_NS.RigidBody; born: number };

export class Physics {
  private world: RAPIER_NS.World;
  private bodies: Body[] = [];
  private dough: RAPIER_NS.Collider | null = null;
  private acc = 0;
  private quietFor = 0;
  /** Called with a body's mesh and impact speed (m/s) the first time it lands. */
  onLand: ((mesh: THREE.Object3D, speed: number) => void) | null = null;
  private landed = new WeakSet<THREE.Object3D>();

  constructor(private readonly R: R) {
    this.world = new R.World({ x: 0, y: -9.81 * PHYS, z: 0 });
    this.world.timestep = 1 / 60;
    // The bench under the pizza.
    this.world.createCollider(R.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0).setFriction(0.9));
  }

  get active(): boolean {
    return this.bodies.length > 0 && this.quietFor < 0.6;
  }

  /** Replaces the dough's collider with the current mesh (pizza space, metres). */
  setDough(geometry: THREE.BufferGeometry): void {
    if (this.dough) this.world.removeCollider(this.dough, false);
    const p = geometry.getAttribute('position') as THREE.BufferAttribute;
    const verts = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count * 3; i++) verts[i] = (p.array as Float32Array)[i] * PHYS;
    const idx = geometry.getIndex();
    if (!idx) return;
    const indices = new Uint32Array(idx.array as ArrayLike<number>);
    this.dough = this.world.createCollider(this.R.ColliderDesc.trimesh(verts, indices).setFriction(1.1).setRestitution(0.02));
  }

  /** Drops a piece from its mesh's current transform (pizza space) with a little spin. */
  add(mesh: THREE.Object3D, hull: Float32Array, scale: number, velocity: THREE.Vector3, spin: THREE.Vector3): void {
    const pts = new Float32Array(hull.length);
    for (let i = 0; i < hull.length; i++) pts[i] = hull[i] * scale * PHYS;
    const desc = this.R.ColliderDesc.convexHull(pts) ?? this.R.ColliderDesc.ball(0.1 * scale);
    desc.setFriction(0.95).setRestitution(0.08).setDensity(1);
    const q = mesh.quaternion;
    const bd = this.R.RigidBodyDesc.dynamic()
      .setTranslation(mesh.position.x * PHYS, mesh.position.y * PHYS, mesh.position.z * PHYS)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinvel(velocity.x * PHYS, velocity.y * PHYS, velocity.z * PHYS)
      .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
      .setLinearDamping(0.35)
      .setAngularDamping(1.2)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bd);
    this.world.createCollider(desc, body);
    this.bodies.push({ mesh, body, born: performance.now() });
    this.quietFor = 0;
  }

  remove(mesh: THREE.Object3D): void {
    const i = this.bodies.findIndex((b) => b.mesh === mesh);
    if (i < 0) return;
    this.world.removeRigidBody(this.bodies[i].body);
    this.bodies.splice(i, 1);
  }

  step(dt: number): void {
    if (!this.bodies.length) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= this.world.timestep) {
      this.world.step();
      this.acc -= this.world.timestep;
    }
    let moving = false;
    for (const b of this.bodies) {
      const t = b.body.translation();
      const r = b.body.rotation();
      b.mesh.position.set(t.x / PHYS, t.y / PHYS, t.z / PHYS);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const v = b.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z) / PHYS;
      if (speed > 0.02) moving = true;
      if (!this.landed.has(b.mesh) && b.mesh.position.y < 0.05 && v.y / PHYS > -0.05 && performance.now() - b.born > 120) {
        this.landed.add(b.mesh);
        this.onLand?.(b.mesh, Math.max(0.2, speed + 0.6));
      }
    }
    this.quietFor = moving ? 0 : this.quietFor + dt;
  }

  /** Removes every body (the pieces keep their last pose): the toppings are set. */
  freeze(): void {
    this.bodies.forEach((b) => this.world.removeRigidBody(b.body));
    this.bodies = [];
  }

  get count(): number {
    return this.bodies.length;
  }
}
