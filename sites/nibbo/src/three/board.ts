import { gsap } from 'gsap';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Level, Pos } from '../game/engine';
import type { Pose } from './director';
import { ROBOT_H } from './robot';
import type { Stage } from './stage';

/**
 * The game board, built from code for each level: floor tiles, wooden letter blocks (they spell NIBBO across the
 * levels), floating sparks and a charging pad. It is laid out from its HTML slot like the robot, tilted towards
 * the viewer, and hands the director the robot's pose for any (fractional) cell and heading.
 */

const TILT = 0.6;
const ROBOT_CELLS = 1.62; // robot height in cells
const BLOCK_COLORS = ['#ff6a2b', '#4a8bff', '#ffc531', '#34cf9b', '#ff77b0', '#a98bff'];
const LETTERS = 'NIBBO';

const letterTextures = new Map<string, THREE.CanvasTexture>();
function letterTexture(ch: string): THREE.CanvasTexture {
  const hit = letterTextures.get(ch);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffaf1';
  g.beginPath();
  g.roundRect(10, 10, 108, 108, 22);
  g.fill();
  g.fillStyle = '#1e1b2e';
  g.font = '800 84px "Bricolage Grotesque Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  letterTextures.set(ch, t);
  return t;
}

function boltShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.04, 0.2);
  s.lineTo(-0.1, -0.01);
  s.lineTo(-0.005, -0.01);
  s.lineTo(-0.04, -0.2);
  s.lineTo(0.1, 0.03);
  s.lineTo(0.005, 0.03);
  s.closePath();
  return s;
}

type Particle = { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number };

export class Board {
  readonly group = new THREE.Group();
  /** Fractional robot position and heading on the board, animated by the game. */
  readonly bot = { c: 0, r: 0, yaw: 0, hop: 0, lift: 0 };
  level: Level | null = null;

  private content = new THREE.Group();
  private sparks: THREE.Object3D[] = [];
  private walls = new Map<string, THREE.Object3D>();
  private homeRing: THREE.Mesh | null = null;
  private homeMat = new THREE.MeshStandardMaterial({ color: '#8a8597', emissive: '#8a8597', emissiveIntensity: 0.3, toneMapped: false });
  private particles: Particle[] = [];
  private shown = 0;
  private time = 0;
  private scale = 1;
  private euler = new THREE.Euler();
  private yawQuat = new THREE.Quaternion();
  private v = new THREE.Vector3();

  private tileGeo = new RoundedBoxGeometry(0.94, 0.24, 0.94, 3, 0.07);
  private tileMats = [
    new THREE.MeshPhysicalMaterial({ color: '#fffaf1', roughness: 0.5, clearcoat: 0.4 }),
    new THREE.MeshPhysicalMaterial({ color: '#efe2cc', roughness: 0.5, clearcoat: 0.4 }),
  ];
  private wallGeo = new RoundedBoxGeometry(0.82, 0.82, 0.82, 4, 0.1);
  private sparkGeo = new THREE.OctahedronGeometry(0.17, 0);
  private confettiGeo = new THREE.PlaneGeometry(0.09, 0.14);
  private sparkMat = new THREE.MeshStandardMaterial({ color: '#ffc531', emissive: '#ffb21e', emissiveIntensity: 1.4, roughness: 0.3, toneMapped: false });

  constructor(private stage: Stage) {
    this.group.add(this.content);
    this.group.visible = false;
    stage.scene.add(this.group);
  }

  /** Cell centre in board space (tile top). */
  private cell(c: number, r: number, out = new THREE.Vector3()): THREE.Vector3 {
    const L = this.level!;
    return out.set(c - (L.w - 1) / 2, 0, r - (L.h - 1) / 2);
  }

  build(level: Level, animate = true): void {
    this.level = level;
    this.content.clear();
    this.sparks = [];
    this.walls.clear();
    let letter = 0;
    const drops: THREE.Object3D[] = [];

    for (let r = 0; r < level.h; r++) {
      for (let c = 0; c < level.w; c++) {
        const t = level.tiles[r][c];
        if (t === 'void') continue;
        const p = this.cell(c, r);
        const tile = new THREE.Mesh(this.tileGeo, this.tileMats[(c + r) % 2]);
        tile.position.set(p.x, -0.12, p.z);
        this.content.add(tile);
        drops.push(tile);
        if (t === 'wall') {
          const block = new THREE.Group();
          block.position.set(p.x, 0.41, p.z);
          const color = BLOCK_COLORS[(c * 3 + r * 5) % BLOCK_COLORS.length];
          block.add(new THREE.Mesh(this.wallGeo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.6 })));
          const tex = letterTexture(LETTERS[letter++ % LETTERS.length]);
          const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
          face.position.z = 0.415;
          block.add(face);
          const top = face.clone();
          top.rotation.x = -Math.PI / 2;
          top.position.set(0, 0.415, 0);
          block.add(top);
          block.rotation.y = ((c + r) % 3 - 1) * 0.08;
          this.content.add(block);
          this.walls.set(`${c},${r}`, block);
          drops.push(block);
        }
      }
    }

    level.sparks.forEach((s) => {
      const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      const p = this.cell(s.c, s.r);
      spark.position.set(p.x, 0.5, p.z);
      spark.userData.baseY = 0.5;
      this.content.add(spark);
      this.sparks.push(spark);
      drops.push(spark);
    });

    const home = new THREE.Group();
    const hp = this.cell(level.home.c, level.home.r);
    home.position.set(hp.x, 0.01, hp.z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.43, 0.06, 40), new THREE.MeshPhysicalMaterial({ color: '#2c2939', roughness: 0.4, clearcoat: 0.6 }));
    pad.position.y = 0.03;
    home.add(pad);
    this.homeRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 10, 48), this.homeMat);
    this.homeRing.rotation.x = Math.PI / 2;
    this.homeRing.position.y = 0.065;
    home.add(this.homeRing);
    const bolt = new THREE.Mesh(new THREE.ShapeGeometry(boltShape()), this.homeMat);
    bolt.rotation.x = -Math.PI / 2;
    bolt.position.y = 0.064;
    home.add(bolt);
    this.content.add(home);
    drops.push(home);
    this.setHomeActive(level.sparks.length === 0);

    this.resetBot();
    if (animate) {
      drops.forEach((o, i) => {
        const y = o.position.y;
        gsap.fromTo(o.position, { y: y + 2.2 }, { y, duration: 0.7, delay: 0.015 * i, ease: 'bounce.out' });
      });
    }
  }

  resetBot(): void {
    const L = this.level;
    if (!L) return;
    gsap.killTweensOf(this.bot);
    this.bot.c = L.start.c;
    this.bot.r = L.start.r;
    this.bot.yaw = this.yawFor(L.facing);
    this.bot.hop = 0;
    this.bot.lift = 0;
    this.sparks.forEach((s) => {
      gsap.killTweensOf(s.scale);
      s.visible = true;
      s.scale.setScalar(1);
    });
    this.setHomeActive(L.sparks.length === 0);
  }

  /** Heading → robot yaw. The robot model faces +z (south, towards the viewer). */
  yawFor(dir: number): number {
    return [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir];
  }

  setHomeActive(on: boolean): void {
    const c = on ? '#34cf9b' : '#8a8597';
    this.homeMat.color.set(c);
    this.homeMat.emissive.set(c);
    this.homeMat.emissiveIntensity = on ? 1.6 : 0.25;
  }

  collect(index: number): void {
    const s = this.sparks[index];
    if (!s) return;
    gsap.timeline()
      .to(s.scale, { x: 1.8, y: 1.8, z: 1.8, duration: 0.12, ease: 'power2.out' })
      .to(s.scale, { x: 0, y: 0, z: 0, duration: 0.2, ease: 'back.in(2)' })
      .add(() => void (s.visible = false));
    this.burst(s.position, 14, 0.6);
  }

  /** A toy block wobbles when Nibbo bumps into it. */
  wobble(at: Pos): void {
    const w = this.walls.get(`${at.c},${at.r}`);
    if (!w) return;
    gsap.fromTo(w.rotation, { z: 0.14 }, { z: 0, duration: 0.9, ease: 'elastic.out(1.4, 0.3)' });
  }

  celebrate(): void {
    const L = this.level;
    if (!L) return;
    this.burst(this.cell(L.home.c, L.home.r).setY(0.6), 70, 1.4);
  }

  private burst(origin: THREE.Vector3, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: BLOCK_COLORS[i % BLOCK_COLORS.length], side: THREE.DoubleSide, transparent: true });
      const m = new THREE.Mesh(this.confettiGeo, mat);
      m.position.copy(origin);
      const a = Math.random() * Math.PI * 2;
      const up = 2.5 + Math.random() * 3;
      const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 1.6), up, Math.sin(a) * (1 + Math.random() * 1.6)).multiplyScalar(power);
      this.content.add(m);
      this.particles.push({ mesh: m, v, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), life: 1.6 + Math.random() * 0.8 });
    }
  }

  /** Places the board in its slot's box: centred, tilted towards the viewer, as big as fits. */
  layout(rect: DOMRect): void {
    const L = this.level;
    if (!L) return;
    const { stage } = this;
    const canvasTop = stage.canvas.getBoundingClientRect().top;
    const wW = rect.width * stage.wpp;
    const wH = rect.height * stage.wpp;
    const spanW = L.w + 0.5;
    const spanH = L.h * Math.cos(TILT) * 0.85 + ROBOT_CELLS * Math.sin(TILT + 0.6) + 0.6;
    this.scale = Math.min(wW / spanW, wH / spanH);
    stage.toWorld(rect.left + rect.width / 2, rect.top - canvasTop + rect.height * 0.56, this.group.position);
    this.group.rotation.set(TILT, 0, 0);
    this.group.scale.setScalar(this.scale * (0.001 + 0.999 * this.shown));
  }

  /** Robot pose on the board for the current fractional cell and heading. */
  robotPose(out: Pose): void {
    const b = this.bot;
    this.cell(b.c, b.r, this.v);
    this.v.y = b.hop + b.lift;
    this.group.updateMatrixWorld();
    out.pos.copy(this.group.localToWorld(this.v));
    this.euler.set(0, b.yaw, 0);
    this.yawQuat.setFromEuler(this.euler);
    out.quat.copy(this.group.quaternion).multiply(this.yawQuat);
    out.scale = (this.scale * ROBOT_CELLS) / ROBOT_H;
  }

  /** Shows the board while its section is near the middle of the screen. */
  setShown(on: boolean): void {
    const target = on ? 1 : 0;
    if (Math.abs(this.shown - target) < 0.001 && this.group.visible === on) return;
    gsap.to(this, {
      shown: target,
      duration: on ? 0.8 : 0.45,
      ease: on ? 'back.out(1.3)' : 'power2.in',
      overwrite: true,
      onStart: () => void (this.group.visible = true),
      onComplete: () => void (this.group.visible = on),
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.sparks.forEach((s, i) => {
      s.rotation.y += dt * 2;
      s.position.y = (s.userData.baseY as number) + Math.sin(this.time * 3 + i) * 0.06;
    });
    if (this.homeRing) this.homeRing.scale.setScalar(1 + Math.sin(this.time * 4) * 0.04);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.v.y -= 9 * dt;
      p.v.multiplyScalar(1 - dt * 0.8);
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 2);
      if (p.life <= 0) {
        this.content.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
