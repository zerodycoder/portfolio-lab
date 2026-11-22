import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Accessory } from '../lib/bot';
import { LedFace } from './face';

/**
 * Nibbo, modelled entirely in code from rounded boxes, tori, capsules and spheres. No model file is loaded.
 * Units: the robot stands on y = 0, faces +z, and is ROBOT_H tall to the tip of its antenna.
 *
 * Transform layers, outermost first:
 *   root  - placed by the director (which section it's in), carries the contact shadow
 *   phys  - drag, toss and fall physics, tilt from velocity
 *   emote - one-shot animations (hops, spins, squashes)
 *   model - the parts
 */
export const ROBOT_H = 2.52;

export type Part =
  | 'head'
  | 'antenna'
  | 'earL'
  | 'earR'
  | 'visor'
  | 'panel'
  | 'brain'
  | 'neck'
  | 'belly'
  | 'heart'
  | 'armL'
  | 'armR'
  | 'battery'
  | 'speaker'
  | 'chassis'
  | 'wheelL'
  | 'wheelR';

/** Where each part flies to in the exploded view (offset in its parent's space) and when it starts moving (0..1). */
const EXPLODE: Record<Part, { to: [number, number, number]; delay: number; spin?: [number, number, number] }> = {
  head: { to: [0, 1.05, 0], delay: 0.1 },
  antenna: { to: [0, 0.55, 0], delay: 0.3 },
  earL: { to: [-0.6, 0, 0], delay: 0.35 },
  earR: { to: [0.6, 0, 0], delay: 0.35 },
  visor: { to: [0, 0.66, 0.72], delay: 0.25 },
  panel: { to: [0, 0, 0.5], delay: 0.3 },
  brain: { to: [-0.95, 0.5, 0.1], delay: 0.45, spin: [Math.PI / 2.4, 0, 0] },
  neck: { to: [0, 0.48, 0], delay: 0.2 },
  belly: { to: [0, 0, 0.55], delay: 0.2 },
  heart: { to: [0, 0, 1.0], delay: 0.3 },
  armL: { to: [-0.62, 0.28, 0], delay: 0.15 },
  armR: { to: [0.62, 0.28, 0], delay: 0.15 },
  battery: { to: [-1.25, -0.22, 0.3], delay: 0.4 },
  speaker: { to: [1.25, -0.18, 0.3], delay: 0.45, spin: [-Math.PI / 2, 0, 0] },
  chassis: { to: [0, -0.4, 0], delay: 0.05 },
  wheelL: { to: [-0.45, -0.4, 0], delay: 0.1 },
  wheelR: { to: [0.45, -0.4, 0], delay: 0.1 },
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

function physical(color: THREE.ColorRepresentation, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.14, ...o });
}

/** A soft round shadow texture for the floor under the robot. */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,28,24,0.55)');
  grad.addColorStop(0.45, 'rgba(40,28,24,0.28)');
  grad.addColorStop(1, 'rgba(40,28,24,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A diagonal soft streak that reads as a reflection on the visor glass. */
function glintTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(80, 44);
  g.rotate(-0.5);
  g.filter = 'blur(3px)';
  const grad = g.createLinearGradient(0, -16, 0, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(-70, -12, 140, 24, 12);
  g.fill();
  g.beginPath();
  g.roundRect(-30, 22, 60, 9, 5);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Robot {
  readonly root = new THREE.Group();
  readonly phys = new THREE.Group();
  readonly emote = new THREE.Group();
  readonly model = new THREE.Group();
  readonly face: LedFace;
  readonly parts = {} as Record<Part, THREE.Object3D>;
  /** Points the anatomy callouts attach to. */
  readonly anchors: Record<string, THREE.Object3D> = {};
  /** Invisible, generous box used for picking the robot with the pointer. */
  readonly hitbox: THREE.Mesh;
  readonly shadow: THREE.Mesh;

  /** Wheel spin speed (rad/s) set by whoever is driving. */
  wheelSpeed = 0;

  private mats: {
    shell: THREE.MeshPhysicalMaterial;
    cream: THREE.MeshPhysicalMaterial;
    charcoal: THREE.MeshPhysicalMaterial;
    rubber: THREE.MeshStandardMaterial;
    visor: THREE.MeshPhysicalMaterial;
    led: THREE.MeshStandardMaterial;
  };
  private faceTex: THREE.CanvasTexture;
  private homes = new Map<THREE.Object3D, { pos: THREE.Vector3; rot: THREE.Euler }>();
  private inner: THREE.Object3D[] = [];
  private accessories = {} as Record<Exclude<Accessory, 'none'>, THREE.Group>;
  private propeller: THREE.Object3D | null = null;
  private sproutLeaves: THREE.Object3D[] = [];
  private xrayMat: THREE.MeshBasicMaterial;
  private xrayOn = false;
  private explodeAmount = 0;
  private time = 0;

  constructor(shellHex: string, ledHex: string) {
    this.root.name = 'nibbo';
    this.root.add(this.phys);
    this.phys.add(this.emote);
    this.emote.add(this.model);

    this.face = new LedFace(512, ledHex);
    this.faceTex = new THREE.CanvasTexture(this.face.canvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;

    this.mats = {
      shell: physical(shellHex),
      cream: physical('#f6efe3', { roughness: 0.42, clearcoat: 0.6 }),
      charcoal: physical('#2c2939', { roughness: 0.46, clearcoat: 0.4 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#25222e', roughness: 0.88 }),
      visor: physical('#13111b', { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
      led: new THREE.MeshStandardMaterial({ color: ledHex, emissive: ledHex, emissiveIntensity: 1.8, toneMapped: false }),
    };
    this.xrayMat = new THREE.MeshBasicMaterial({ color: '#ff6a2b', wireframe: true, transparent: true, opacity: 0.55 });

    this.buildBase();
    const body = this.buildBody();
    this.buildHead(body);
    this.buildAccessories();

    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });

    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.45, ROBOT_H, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = ROBOT_H / 2;
    this.emote.add(this.hitbox);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.5),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);

    for (const key of Object.keys(EXPLODE) as Part[]) {
      const o = this.parts[key];
      this.homes.set(o, { pos: o.position.clone(), rot: o.rotation.clone() });
    }
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private group(name: Part, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    this.parts[name] = g;
    return g;
  }

  private anchor(name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): void {
    const a = new THREE.Object3D();
    a.position.set(x, y, z);
    parent.add(a);
    this.anchors[name] = a;
  }

  private buildBase(): void {
    const { charcoal, rubber, shell, cream, led } = this.mats;
    const chassis = this.group('chassis', this.model, 0, 0.3, 0);
    this.mesh(new RoundedBoxGeometry(1.0, 0.32, 0.74, 4, 0.14), charcoal, chassis);
    // Cliff-sensor strip on the front bumper.
    this.mesh(new RoundedBoxGeometry(0.42, 0.05, 0.04, 2, 0.02), led, chassis, 0, -0.04, 0.37);

    for (const side of [-1, 1] as const) {
      const wheel = this.group(side < 0 ? 'wheelL' : 'wheelR', this.model, side * 0.54, 0.25, 0.02);
      const tyre = this.mesh(new THREE.TorusGeometry(0.165, 0.085, 16, 40), rubber, wheel);
      tyre.rotation.y = Math.PI / 2;
      const hub = this.mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 32), shell, wheel);
      hub.rotation.z = Math.PI / 2;
      const cap = this.mesh(new THREE.SphereGeometry(0.06, 20, 12), cream, wheel, side * 0.07, 0, 0);
      cap.scale.set(0.6, 1, 1);
      // Spokes so the wheel visibly turns.
      for (let i = 0; i < 3; i++) {
        const spoke = this.mesh(new THREE.BoxGeometry(0.02, 0.24, 0.035), cream, wheel, side * 0.068, 0, 0);
        spoke.rotation.x = (i / 3) * Math.PI;
      }
    }
    this.anchor('wheels', this.parts.wheelR, 0.1, 0, 0.1);
  }

  private buildBody(): THREE.Group {
    const { shell, cream, charcoal, led } = this.mats;
    const body = new THREE.Group();
    body.position.y = 0.44;
    this.model.add(body);
    this.mesh(new RoundedBoxGeometry(0.9, 0.76, 0.68, 6, 0.24), shell, body, 0, 0.38, 0);

    const belly = this.group('belly', body, 0, 0.35, 0.33);
    this.mesh(new RoundedBoxGeometry(0.6, 0.46, 0.06, 4, 0.12), cream, belly);
    [
      ['#ff6a2b', -0.1],
      ['#ffc531', 0],
      ['#34cf9b', 0.1],
    ].forEach(([c, x]) => {
      this.mesh(new THREE.SphereGeometry(0.03, 16, 10), physical(c as string), belly, x as number, -0.14, 0.03);
    });

    const heart = this.group('heart', body, 0, 0.41, 0.37);
    this.mesh(new THREE.TorusGeometry(0.095, 0.024, 12, 40), charcoal, heart);
    const core = this.mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 32), led, heart, 0, 0, -0.005);
    core.rotation.x = Math.PI / 2;
    this.anchor('heart', heart, 0, 0, 0.04);

    for (const side of [-1, 1] as const) {
      this.mesh(new THREE.SphereGeometry(0.09, 20, 14), charcoal, body, side * 0.46, 0.56, 0);
      const arm = this.group(side < 0 ? 'armL' : 'armR', body, side * 0.47, 0.56, 0);
      const upper = this.mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 14), shell, arm, side * 0.05, -0.16, 0);
      upper.rotation.z = side * 0.18;
      const hand = this.mesh(new THREE.SphereGeometry(0.12, 24, 16), cream, arm, side * 0.09, -0.35, 0.02);
      hand.scale.set(1, 0.95, 0.85);
      arm.rotation.z = side * 0.16;
      if (side > 0) this.anchor('arms', arm, 0.1, -0.36, 0.08);
    }

    // Parts that live inside the shell and only show in the exploded view.
    const battery = this.group('battery', body, 0, 0.32, -0.02);
    this.mesh(new RoundedBoxGeometry(0.44, 0.24, 0.26, 3, 0.05), physical('#34cf9b', { clearcoat: 0.3 }), battery);
    this.mesh(new RoundedBoxGeometry(0.3, 0.245, 0.265, 2, 0.02), charcoal, battery, 0.02, 0, 0);
    this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 16), cream, battery, 0.25, 0, 0).rotation.z = Math.PI / 2;
    this.anchor('battery', battery, -0.1, 0.13, 0.12);

    const speaker = this.group('speaker', body, 0, 0.5, -0.16);
    this.mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 32), charcoal, speaker);
    this.mesh(new THREE.ConeGeometry(0.12, 0.07, 32, 1, true), physical('#4a4660', { side: THREE.DoubleSide }), speaker, 0, 0.06, 0).rotation.x = Math.PI;
    this.mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 40), physical('#d8dbe3', { metalness: 1, roughness: 0.25 }), speaker, 0, 0.035, 0).rotation.x = Math.PI / 2;
    this.anchor('speaker', speaker, 0, 0.08, 0);

    const neck = this.group('neck', body, 0, 0.8, 0);
    this.mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 28), charcoal, neck);

    this.inner.push(battery, speaker);
    return body;
  }

  private buildHead(body: THREE.Group): void {
    const { shell, cream, charcoal, visor, led } = this.mats;
    const head = this.group('head', body, 0, 0.85, 0);
    this.mesh(new RoundedBoxGeometry(1.16, 0.84, 0.84, 6, 0.28), shell, head, 0, 0.43, 0);

    const visorG = this.group('visor', head, 0, 0.44, 0.405);
    this.mesh(new RoundedBoxGeometry(0.98, 0.62, 0.07, 4, 0.17), visor, visorG);

    // The LED matrix sits in front of the glass so its light reads clearly; the panel backing only shows exploded.
    const panel = this.group('panel', head, 0, 0.44, 0.446);
    const backing = this.mesh(new RoundedBoxGeometry(0.88, 0.46, 0.03, 2, 0.04), physical('#1b3a2e', { clearcoat: 0.2 }), panel, 0, 0, -0.02);
    backing.visible = false;
    this.inner.push(backing);
    const ledPlane = this.mesh(
      new THREE.PlaneGeometry(0.84, 0.42),
      new THREE.MeshBasicMaterial({
        map: this.faceTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      panel,
    );
    ledPlane.renderOrder = 2;
    ledPlane.userData.keepMaterial = true;
    this.anchor('face', panel, 0.3, 0.12, 0.02);

    const glint = this.mesh(
      new THREE.PlaneGeometry(0.42, 0.21),
      new THREE.MeshBasicMaterial({ map: glintTexture(), transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false }),
      visorG,
      -0.22,
      0.1,
      0.04,
    );
    glint.renderOrder = 3;
    glint.userData.keepMaterial = true;

    for (const side of [-1, 1] as const) {
      const ear = this.group(side < 0 ? 'earL' : 'earR', head, side * 0.59, 0.42, 0);
      this.mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 32), charcoal, ear).rotation.z = Math.PI / 2;
      const ring = this.mesh(new THREE.TorusGeometry(0.12, 0.03, 12, 36), shell, ear, side * 0.045, 0, 0);
      ring.rotation.y = Math.PI / 2;
      this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 28), cream, ear, side * 0.05, 0, 0).rotation.z = Math.PI / 2;
    }

    const antenna = this.group('antenna', head, 0.2, 0.84, -0.06);
    this.mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.3, 12), charcoal, antenna, 0, 0.15, 0);
    this.mesh(new THREE.SphereGeometry(0.075, 24, 16), led, antenna, 0, 0.34, 0);
    this.anchor('antenna', antenna, 0.05, 0.36, 0);

    const brain = this.group('brain', head, 0, 0.42, -0.06);
    this.mesh(new RoundedBoxGeometry(0.62, 0.035, 0.42, 2, 0.012), physical('#1f8a5b', { clearcoat: 0.5, roughness: 0.5 }), brain);
    this.mesh(new RoundedBoxGeometry(0.18, 0.04, 0.18, 2, 0.01), charcoal, brain, -0.06, 0.03, 0);
    this.mesh(new RoundedBoxGeometry(0.1, 0.03, 0.07, 2, 0.008), charcoal, brain, 0.17, 0.025, 0.1);
    this.mesh(new RoundedBoxGeometry(0.1, 0.03, 0.07, 2, 0.008), charcoal, brain, 0.17, 0.025, -0.08);
    const gold = physical('#d9b45c', { metalness: 1, roughness: 0.3, clearcoat: 0 });
    for (let i = 0; i < 6; i++) this.mesh(new THREE.BoxGeometry(0.015, 0.012, 0.04), gold, brain, -0.15 + i * 0.035, 0.022, 0.12);
    this.anchor('brain', brain, 0, 0.04, 0.1);
    this.inner.push(brain);
    brain.visible = false;
    this.inner.forEach((o) => (o.visible = false));

    void cream;
  }

  private buildAccessories(): void {
    const head = this.parts.head;
    const { charcoal, cream } = this.mats;

    const propeller = new THREE.Group();
    propeller.position.set(-0.2, 0.84, 0.02);
    propeller.rotation.z = 0.16;
    const dome = this.mesh(new THREE.SphereGeometry(0.34, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), physical('#4a8bff'), propeller);
    dome.scale.set(1, 0.55, 1);
    const brim = this.mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 32, 1, false, -0.9, 1.8), physical('#ffc531'), propeller, 0, 0.0, 0.2);
    brim.rotation.y = 0;
    this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 10), charcoal, propeller, 0, 0.24, 0);
    const blades = new THREE.Group();
    blades.position.y = 0.31;
    propeller.add(blades);
    ['#ff6a2b', '#ffc531'].forEach((c, i) => {
      const b = this.mesh(new RoundedBoxGeometry(0.34, 0.015, 0.08, 2, 0.007), physical(c), blades, 0, 0, 0);
      b.rotation.y = i * Math.PI;
      b.position.x = i === 0 ? 0.17 : -0.17;
      b.rotation.x = i === 0 ? 0.25 : -0.25;
    });
    this.mesh(new THREE.SphereGeometry(0.035, 12, 8), physical('#ff6a2b'), blades);
    this.propeller = blades;
    this.accessories.propeller = propeller;

    const phones = new THREE.Group();
    phones.position.set(0, 0.42, 0);
    const band = this.mesh(new THREE.TorusGeometry(0.68, 0.045, 12, 48, Math.PI), charcoal, phones);
    band.scale.set(1, 0.78, 1);
    band.rotation.x = -0.32;
    for (const side of [-1, 1] as const) {
      const cup = this.mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 32), physical('#ff77b0'), phones, side * 0.66, 0, 0);
      cup.rotation.z = Math.PI / 2;
      const pad = this.mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 28), cream, phones, side * 0.73, 0, 0);
      pad.rotation.z = Math.PI / 2;
    }
    this.accessories.phones = phones;

    const sprout = new THREE.Group();
    sprout.position.set(-0.16, 0.84, 0.05);
    const stemCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, 0.14, 0), new THREE.Vector3(-0.02, 0.26, 0));
    this.mesh(new THREE.TubeGeometry(stemCurve, 12, 0.018, 8), physical('#3fae5a'), sprout);
    for (const side of [-1, 1] as const) {
      const leafPivot = new THREE.Group();
      leafPivot.position.set(-0.02, 0.26, 0);
      sprout.add(leafPivot);
      const leaf = this.mesh(new THREE.SphereGeometry(0.1, 20, 12), physical('#5cd16f'), leafPivot, side * 0.09, 0.03, 0);
      leaf.scale.set(1, 0.42, 0.62);
      leaf.rotation.z = side * 0.4;
      this.sproutLeaves.push(leafPivot);
    }
    this.accessories.sprout = sprout;

    for (const g of Object.values(this.accessories)) {
      g.visible = false;
      head.add(g);
    }
  }

  setShell(hex: string): void {
    this.mats.shell.color.set(hex);
  }

  setLed(hex: string): void {
    this.mats.led.color.set(hex);
    this.mats.led.emissive.set(hex);
    this.face.setColor(hex);
  }

  setAccessory(a: Accessory): void {
    for (const [k, g] of Object.entries(this.accessories)) g.visible = k === a;
  }

  /** 0 = assembled, 1 = fully exploded. Each part moves in its own window so the robot comes apart in sequence. */
  setExplode(amount: number): void {
    this.explodeAmount = amount;
    const showInner = amount > 0.02;
    this.inner.forEach((o) => (o.visible = showInner));
    for (const key of Object.keys(EXPLODE) as Part[]) {
      const spec = EXPLODE[key];
      const o = this.parts[key];
      const home = this.homes.get(o);
      if (!home) continue;
      const t = smooth(Math.min(1, Math.max(0, (amount - spec.delay * 0.5) / 0.6)));
      o.position.set(home.pos.x + spec.to[0] * t, home.pos.y + spec.to[1] * t, home.pos.z + spec.to[2] * t);
      if (spec.spin) o.rotation.set(home.rot.x + spec.spin[0] * t, home.rot.y + spec.spin[1] * t, home.rot.z + spec.spin[2] * t);
    }
  }

  get exploded(): number {
    return this.explodeAmount;
  }

  /** Swaps every surface for a wireframe: shows that the robot is nothing but generated geometry. */
  setXray(on: boolean, color?: string): void {
    if (color) this.xrayMat.color.set(color);
    if (on === this.xrayOn) return;
    this.xrayOn = on;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.keepMaterial) return;
      if (on) {
        m.userData.material = m.material;
        m.material = this.xrayMat;
      } else if (m.userData.material) {
        m.material = m.userData.material as THREE.Material;
      }
    });
  }

  /** Triangle and mesh counts, shown next to the X-ray switch. */
  stats(): { meshes: number; triangles: number } {
    let meshes = 0;
    let triangles = 0;
    this.model.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const g = m.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    return { meshes, triangles: Math.round(triangles) };
  }

  update(dt: number): void {
    this.time += dt;
    this.face.update(dt);
    if (this.face.dirty) {
      this.faceTex.needsUpdate = true;
      this.face.dirty = false;
    }
    this.parts.wheelL.rotation.x += this.wheelSpeed * dt;
    this.parts.wheelR.rotation.x += this.wheelSpeed * dt;
    if (this.propeller && this.accessories.propeller.visible) this.propeller.rotation.y += dt * (6 + Math.abs(this.wheelSpeed) * 2);
    this.sproutLeaves.forEach((l, i) => (l.rotation.z = Math.sin(this.time * 2.2 + i) * 0.12));
    // The heart dial and antenna bulb breathe gently.
    this.mats.led.emissiveIntensity = 1.5 + Math.sin(this.time * 2.4) * 0.35;
  }
}
