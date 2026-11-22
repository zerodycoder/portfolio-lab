import { gsap } from 'gsap';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { isNarrow } from '../lib/dom';
import { BLOCK_COLORS, letterTexture } from './board';
import type { Stage } from './stage';

/** Where each block floats, as fractions of the hero box, its depth (negative = further away) and size in px. */
type Spot = { ch: string; fx: number; fy: number; z: number; px: number };

const DESKTOP: Spot[] = [
  { ch: 'N', fx: 0.2, fy: 0.25, z: -2, px: 74 },
  { ch: 'I', fx: 0.33, fy: 0.65, z: -0.5, px: 56 },
  { ch: 'B', fx: 0.71, fy: 0.22, z: -3.5, px: 66 },
  { ch: 'B', fx: 0.77, fy: 0.7, z: -1, px: 82 },
  { ch: 'O', fx: 0.93, fy: 0.6, z: -2.5, px: 50 },
];
const PHONE: Spot[] = [
  { ch: 'N', fx: 0.1, fy: 0.33, z: -1.5, px: 46 },
  { ch: 'I', fx: 0.11, fy: 0.53, z: -0.5, px: 36 },
  { ch: 'B', fx: 0.89, fy: 0.36, z: -2, px: 42 },
  { ch: 'O', fx: 0.88, fy: 0.5, z: -0.8, px: 34 },
];

/**
 * Wooden letter blocks floating around the hero, at different depths so they parallax against the mouse (or the
 * phone's tilt). Each one can be clicked or tapped: it jumps, spins and knocks.
 */
export class HeroBlocks {
  readonly group = new THREE.Group();
  private blocks: { obj: THREE.Group; spot: Spot; phase: number }[] = [];
  private layoutFor: 'desktop' | 'phone' | null = null;
  private pointer = new THREE.Vector2();
  private smooth = new THREE.Vector2();
  private time = 0;
  private v = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.13);
  private faceGeo = new THREE.PlaneGeometry(0.74, 0.74);

  constructor(
    private stage: Stage,
    private onBop: () => void,
  ) {
    stage.scene.add(this.group);
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'mouse') this.pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
      },
      { passive: true },
    );
    window.addEventListener(
      'deviceorientation',
      (e) => {
        if (e.gamma !== null && e.beta !== null) this.pointer.set(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
      },
      { passive: true },
    );
    window.addEventListener('pointerdown', (e) => {
      if (!this.group.visible || (e.target as Element | null)?.closest('a, button, input, label')) return;
      this.stage.ndc(e.clientX, e.clientY, this.ndc);
      this.ray.setFromCamera(this.ndc, this.stage.camera);
      const hit = this.ray.intersectObjects(
        this.blocks.map((b) => b.obj),
        true,
      )[0];
      const block = hit && this.blocks.find((b) => b.obj === hit.object.parent);
      if (block) this.bop(block.obj);
    });
  }

  private build(spots: Spot[]): void {
    this.group.clear();
    this.blocks = spots.map((spot, i) => {
      const obj = new THREE.Group();
      const color = BLOCK_COLORS[(i * 2 + 1) % BLOCK_COLORS.length];
      obj.add(new THREE.Mesh(this.geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2 })));
      const mat = new THREE.MeshBasicMaterial({ map: letterTexture(spot.ch), transparent: true });
      // The letter on all four sides and the top, like a real wooden block.
      for (let side = 0; side < 4; side++) {
        const face = new THREE.Mesh(this.faceGeo, mat);
        face.rotation.y = (side * Math.PI) / 2;
        face.position.set(Math.sin(face.rotation.y) * 0.505, 0, Math.cos(face.rotation.y) * 0.505);
        obj.add(face);
      }
      const top = new THREE.Mesh(this.faceGeo, mat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.505;
      obj.add(top);
      obj.rotation.set(-0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.4);
      this.group.add(obj);
      return { obj, spot, phase: Math.random() * Math.PI * 2 };
    });
  }

  private bop(obj: THREE.Object3D): void {
    if (gsap.isTweening(obj.rotation)) return;
    this.onBop();
    const y0 = obj.userData.lift ?? 0;
    gsap.timeline()
      .to(obj.userData, { lift: y0 + 1.4, duration: 0.25, ease: 'power2.out' })
      .to(obj.userData, { lift: 0, duration: 0.45, ease: 'bounce.out' });
    gsap.to(obj.rotation, { x: `+=${Math.PI * 2}`, y: `+=${Math.PI}`, duration: 0.75, ease: 'power2.out' });
  }

  update(dt: number, hero: DOMRect): void {
    this.time += dt;
    const visible = hero.bottom > 0 && hero.top < innerHeight;
    this.group.visible = visible;
    if (!visible) return;
    const want = isNarrow() ? 'phone' : 'desktop';
    if (want !== this.layoutFor) {
      this.layoutFor = want;
      this.build(want === 'phone' ? PHONE : DESKTOP);
    }
    const { stage } = this;
    const top = stage.canvas.getBoundingClientRect().top;
    this.smooth.lerp(this.pointer, 1 - Math.exp(-4 * dt));
    const D = stage.camera.position.z;
    for (const b of this.blocks) {
      const { spot } = b;
      const depth = (D - spot.z) / D;
      // Nearer blocks drift further against the pointer than distant ones.
      const px = this.smooth.x * (8 - spot.z * 6);
      const py = this.smooth.y * (6 - spot.z * 4);
      stage.toWorld(hero.left + hero.width * spot.fx - px, hero.top - top + hero.height * spot.fy - py, this.v);
      const bob = Math.sin(this.time * 1.3 + b.phase) * 0.12;
      const size = spot.px * stage.wpp * depth;
      b.obj.position.set(this.v.x * depth, this.v.y * depth + (bob + (b.obj.userData.lift ?? 0)) * size, spot.z);
      b.obj.scale.setScalar(size);
      if (!gsap.isTweening(b.obj.rotation)) {
        b.obj.rotation.y += dt * 0.25 * (b.phase > Math.PI ? 1 : -1);
      }
    }
  }
}
