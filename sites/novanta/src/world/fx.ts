import * as THREE from 'three';

/** Soft round sprite used by flour puffs and steam. */
function softSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

type P = { pos: THREE.Vector3; vel: THREE.Vector3; life: number; max: number; size: number };

/**
 * A small particle system of soft sprites: flour puffs when the dough is pressed, steam rising off a fresh pizza.
 * Each particle is a billboarded quad in one instanced mesh, so a puff costs one draw call.
 */
export class Puffs {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private dummy = new THREE.Object3D();
  private cam: THREE.Camera;

  constructor(cam: THREE.Camera, color: string, opacity: number, max = 120) {
    this.cam = cam;
    const mat = new THREE.MeshBasicMaterial({ map: softSprite(), color, transparent: true, opacity, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  burst(at: THREE.Vector3, n: number, spread: number, up: number, size: number, life: number): void {
    for (let i = 0; i < n && this.ps.length < this.mesh.instanceMatrix.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      this.ps.push({
        pos: at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.004, Math.sin(a) * r)),
        vel: new THREE.Vector3(Math.cos(a) * spread * (0.6 + Math.random()), up * (0.5 + Math.random()), Math.sin(a) * spread * (0.6 + Math.random())),
        life: 0,
        max: life * (0.7 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
      });
    }
  }

  update(dt: number): void {
    this.ps = this.ps.filter((p) => (p.life += dt) < p.max);
    this.mesh.count = this.ps.length;
    this.ps.forEach((p, i) => {
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 1.6);
      p.vel.y += dt * 0.02;
      const k = p.life / p.max;
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.copy(this.cam.quaternion);
      this.dummy.scale.setScalar(p.size * (0.6 + k * 1.4) * Math.sin(Math.min(1, k * 1.3) * Math.PI) + 1e-4);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The sauce ladle (a flat-bottomed mestolo) and the pizza wheel. */
export function buildLadle(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#d5d8da', metalness: 0.9, roughness: 0.28 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.022, 32, 1, true), steel);
  cup.position.y = 0.012;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.04, 32), steel);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.001;
  const sauce = new THREE.Mesh(new THREE.CircleGeometry(0.039, 32), new THREE.MeshStandardMaterial({ color: '#a8261a', roughness: 0.35 }));
  sauce.rotation.x = -Math.PI / 2;
  sauce.position.y = 0.015;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.34, 10), steel);
  handle.rotation.z = Math.PI / 2 - 0.35;
  handle.position.set(0.19, 0.08, 0);
  g.add(cup, bottom, sauce, handle);
  g.traverse((o) => (o.castShadow = true));
  g.userData.sauce = sauce;
  return g;
}

export function buildWheel(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#dfe2e4', metalness: 0.95, roughness: 0.22 });
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.6 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.003, 40), steel);
  disc.rotation.z = Math.PI / 2;
  disc.position.y = 0.05;
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.01), steel);
  fork.position.set(0, 0.085, 0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.13, 12), wood);
  handle.rotation.x = -0.9;
  handle.position.set(0, 0.13, 0.05);
  g.add(disc, fork, handle);
  g.traverse((o) => (o.castShadow = true));
  g.userData.disc = disc;
  return g;
}

/** Promise-based tween on requestAnimationFrame. */
export function tween(seconds: number, fn: (k: number) => void, ease: (t: number) => number = easeInOut): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (): void => {
      const t = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      fn(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeIn = (t: number): number => t * t * t;
