import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, colorTex } from '../lib/canvas';
import { rng, type Rng } from '../lib/rand';
import type { Tick } from './buildings';
import { LITE } from '../lib/quality';

/**
 * The life of the street in front of the shop: a vintage scooter parked by the shutter with two boxes on its rack,
 * geraniums in the window boxes and on the balcony, ivy trailing over the edges, a lemon tree in a big pot, the
 * neighbourhood's shrine with its candles and flowers, posters on the wall, the street's marble name plate and the
 * shop's number on a majolica tile.
 */

const std = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

// ————— Contact shadows —————

let blobTex: THREE.Texture | null = null;

/** A soft dark ellipse on the ground that seats an object on the cobbles. */
export function blob(w: number, d: number, strength = 0.65): THREE.Mesh {
  if (!blobTex) {
    const { c, g } = canvas(128);
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    blobTex = colorTex(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: strength, depthWrite: false, color: '#000' }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

// ————— The scooter —————

function boxTop(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  g.fillStyle = '#f2ebde';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#b02818';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(128, 128, 92, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#b02818';
  g.font = '800 40px "Fraunces Variable", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NOVANTA', 128, 122);
  g.font = 'italic 500 20px "Fraunces Variable", Georgia, serif';
  g.fillText('pizza napoletana', 128, 158);
  return c;
}

/** A vintage Italian scooter (no badges), mint with a clear coat, parked on its stand. Length along +x, ~1.7 m. */
export function buildScooter(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'scooter';
  const paint = new THREE.MeshPhysicalMaterial({ color: '#8fcfbd', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  const paintTwo = paint.clone();
  paintTwo.side = THREE.DoubleSide;
  const chrome = std({ color: '#e4e7ea', metalness: 1, roughness: 0.16 });
  const rimMat = std({ color: '#c3c7cb', metalness: 0.7, roughness: 0.3 });
  const rubber = std({ color: '#141414', roughness: 0.9 });
  const leather = std({ color: '#4b2e1d', roughness: 0.5 });
  const dark = std({ color: '#2c2f33', metalness: 0.6, roughness: 0.45 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const ell = (rx: number, ry: number, rz: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = add(new THREE.SphereGeometry(1, 40, 24), mat, x, y, z);
    m.scale.set(rx, ry, rz);
    return m;
  };

  // Small fat-tyred wheels on split rims.
  for (const x of [0.66, -0.52]) {
    add(new THREE.TorusGeometry(0.16, 0.048, 14, 40), rubber, x, 0.205, 0);
    add(new THREE.CylinderGeometry(0.118, 0.118, 0.075, 28), rimMat, x, 0.205, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16), chrome, x, 0.205, 0, Math.PI / 2);
  }
  // Front mudguard: a shell over the top of the front wheel.
  add(new THREE.CylinderGeometry(0.235, 0.235, 0.13, 32, 1, true, Math.PI / 2 - 0.35, 2.55), paintTwo, 0.66, 0.205, 0, Math.PI / 2);
  // Single-sided front link up to the steering.
  add(new THREE.CylinderGeometry(0.022, 0.026, 0.45, 10), dark, 0.58, 0.41, 0.075, 0, 0, 0.37);
  // Legshield: a curved panel 2 cm thick that wraps round the rider's legs, leaning back. Drawn in plan (x forward,
  // y across) as a band of an arc, extruded upwards.
  const shield = new THREE.Shape();
  shield.absarc(0, 0, 0.3, -0.78, 0.78, false);
  shield.absarc(0, 0, 0.28, 0.78, -0.78, true);
  shield.closePath();
  const shieldGeo = new THREE.ExtrudeGeometry(shield, { depth: 0.74, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 32 });
  shieldGeo.rotateX(-Math.PI / 2);
  shieldGeo.translate(0, -0.37, 0);
  add(shieldGeo, paint, 0.1, 0.6, 0, 0, 0, 0.2);
  add(new THREE.BoxGeometry(0.02, 0.13, 0.07), chrome, 0.37, 0.72, 0, 0, 0, 0.2);
  // Floorboard with rubber runners.
  add(new THREE.BoxGeometry(0.56, 0.04, 0.3), paint, 0.11, 0.22, 0);
  for (const z of [-0.1, -0.035, 0.035, 0.1]) add(new THREE.BoxGeometry(0.5, 0.008, 0.022), rubber, 0.11, 0.244, z);
  // The rear body from its side profile: the spine rising from the floorboard to the saddle, the tail sweeping
  // down, extruded with a deep round bevel. Two swelling side cowls are the same idea, smaller.
  const body = new THREE.Shape();
  body.moveTo(-0.02, 0.24);
  body.bezierCurveTo(-0.02, 0.5, -0.08, 0.72, -0.16, 0.79);
  body.lineTo(-0.6, 0.8);
  body.bezierCurveTo(-0.78, 0.8, -0.87, 0.7, -0.87, 0.56);
  body.bezierCurveTo(-0.87, 0.42, -0.8, 0.34, -0.68, 0.33);
  body.lineTo(-0.3, 0.33);
  body.bezierCurveTo(-0.15, 0.33, -0.08, 0.28, -0.02, 0.24);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.05, bevelSegments: 6, curveSegments: 24 });
  bodyGeo.translate(0, 0, -0.1);
  add(bodyGeo, paint, 0, 0, 0);
  const cowl = new THREE.Shape();
  cowl.moveTo(-0.17, 0.38);
  cowl.bezierCurveTo(-0.2, 0.6, -0.34, 0.67, -0.52, 0.67);
  cowl.bezierCurveTo(-0.7, 0.67, -0.84, 0.6, -0.85, 0.47);
  cowl.bezierCurveTo(-0.85, 0.38, -0.78, 0.35, -0.66, 0.35);
  cowl.lineTo(-0.3, 0.35);
  cowl.bezierCurveTo(-0.22, 0.35, -0.18, 0.36, -0.17, 0.38);
  for (const side of [-1, 1]) {
    const cg = new THREE.ExtrudeGeometry(cowl, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 6, curveSegments: 20 });
    cg.translate(0, 0, side > 0 ? 0.12 : -0.14);
    add(cg, paint, 0, 0, 0);
  }
  add(new THREE.BoxGeometry(0.34, 0.14, 0.14), dark, -0.4, 0.3, -0.06);
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.28, 12), chrome, -0.66, 0.27, -0.15, 0, 0, Math.PI / 2);
  // Saddle and rear rack, with two boxes strapped on.
  add(new RoundedBoxGeometry(0.6, 0.09, 0.27, 3, 0.04), leather, -0.34, 0.85, 0);
  for (const z of [-0.12, 0.12]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8), chrome, -0.78, 0.905, z, 0, 0, Math.PI / 2);
  for (const x of [-0.63, -0.93]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8), chrome, x, 0.905, 0, Math.PI / 2);
  const kraft = std({ color: '#c9a777', roughness: 0.9 });
  const top = std({ map: colorTex(boxTop()), roughness: 0.8 });
  const boxMats = [kraft, kraft, top, kraft, kraft, kraft];
  add(new THREE.BoxGeometry(0.34, 0.045, 0.34), boxMats as unknown as THREE.Material, -0.8, 0.935, 0);
  add(new THREE.BoxGeometry(0.34, 0.045, 0.34), boxMats as unknown as THREE.Material, -0.79, 0.98, 0.006, 0, 0.07, 0);
  add(new THREE.BoxGeometry(0.025, 0.1, 0.36), rubber, -0.8, 0.96, 0);
  add(new THREE.BoxGeometry(0.03, 0.04, 0.07), std({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 0.6 }), -0.86, 0.64, 0);
  // Steering column, headset with its round headlamp, handlebar, grips, levers, a mirror.
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12), dark, 0.265, 0.81, 0, 0, 0, 0.07);
  ell(0.11, 0.065, 0.12, paint, 0.27, 1.04, 0);
  add(new THREE.CylinderGeometry(0.066, 0.066, 0.07, 24), paint, 0.33, 1.04, 0, 0, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(0.062, 0.012, 10, 28), chrome, 0.366, 1.04, 0, 0, Math.PI / 2, 0);
  add(new THREE.CircleGeometry(0.058, 24), std({ color: '#f7f1e1', emissive: '#ffe2b0', emissiveIntensity: 0.15, roughness: 0.08, metalness: 0.2 }), 0.368, 1.04, 0, 0, Math.PI / 2, 0);
  add(new THREE.CylinderGeometry(0.019, 0.019, 0.6, 12), chrome, 0.25, 1.045, 0, Math.PI / 2);
  for (const z of [-0.28, 0.28]) {
    add(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 12), rubber, 0.25, 1.045, z, Math.PI / 2);
    add(new THREE.BoxGeometry(0.12, 0.01, 0.016), chrome, 0.31, 1.035, z * 0.86, 0, z > 0 ? 0.25 : -0.25, 0);
  }
  add(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 8), chrome, 0.24, 1.15, 0.25, 0.15, 0, 0);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 20), chrome, 0.24, 1.27, 0.27, 0, 0, Math.PI / 2);
  // Centre stand.
  for (const z of [-0.09, 0.09]) add(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 8), dark, -0.16, 0.1, z, 0, 0, 0.35);

  const shadow = blob(1.9, 0.75, 0.7);
  g.add(shadow);
  return g;
}

// ————— Plants —————

type LeafKind = 'geranium' | 'ivy' | 'lemon';

function leafArt(kind: LeafKind): HTMLCanvasElement {
  const { c, g } = canvas(128);
  g.clearRect(0, 0, 128, 128);
  if (kind === 'geranium') {
    g.beginPath();
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      const rr = 50 * (1 + 0.07 * Math.sin(a * 9));
      const x = 64 + Math.cos(a) * rr;
      const y = 72 + Math.sin(a) * rr;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    const grad = g.createRadialGradient(64, 72, 4, 64, 72, 52);
    grad.addColorStop(0, '#6aa64e');
    grad.addColorStop(1, '#376a2b');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(90,55,25,0.38)';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 72, 27, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(190,225,160,0.35)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      g.beginPath();
      g.moveTo(64, 72);
      g.lineTo(64 + Math.cos(a) * 44, 72 + Math.sin(a) * 44);
      g.stroke();
    }
  } else if (kind === 'ivy') {
    const pts = [[64, 8], [96, 38], [122, 60], [96, 90], [80, 120], [64, 108], [48, 120], [32, 90], [6, 60], [32, 38]];
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#3f7434');
    grad.addColorStop(1, '#27501f');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(170,205,140,0.6)';
    g.lineWidth = 2;
    for (const [x, y] of [[64, 10], [120, 60], [8, 60], [94, 92], [34, 92]]) {
      g.beginPath();
      g.moveTo(64, 110);
      g.lineTo(x, y);
      g.stroke();
    }
  } else {
    g.beginPath();
    g.moveTo(64, 4);
    g.quadraticCurveTo(114, 60, 64, 124);
    g.quadraticCurveTo(14, 60, 64, 4);
    const grad = g.createLinearGradient(30, 0, 98, 0);
    grad.addColorStop(0, '#2c5e24');
    grad.addColorStop(0.5, '#4a8a38');
    grad.addColorStop(1, '#2c5e24');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(190,220,150,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(64, 10);
    g.lineTo(64, 122);
    g.stroke();
  }
  return c;
}

const REDS = ['#d42a2a', '#c21f2f', '#e0373a', '#b51b26'];
const PINKS = ['#e85a8c', '#d94a7f', '#f07aa5', '#c93a6c'];
const CORAL = ['#f05a3c', '#e8492f', '#ff6f4f'];
const WHITES = ['#f4f0ea', '#ece6dc', '#fff8ee'];

/** Collects leaves, flowers and fruit as instance matrices, then builds a handful of instanced meshes. */
export class Garden {
  readonly group = new THREE.Group();
  private leaves: Record<LeafKind, { m: THREE.Matrix4; c: THREE.Color }[]> = { geranium: [], ivy: [], lemon: [] };
  private florets: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private lemons: THREE.Matrix4[] = [];
  private terracotta = std({ color: '#b4623e', roughness: 0.9 });
  private soil = std({ color: '#2a1c12', roughness: 1 });
  private r: Rng;

  constructor(seed: number) {
    this.r = rng(seed);
    this.group.name = 'garden';
  }

  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  private leaf(kind: LeafKind, p: THREE.Vector3, pitch: number, yaw: number, roll: number, s: number, tint: number): void {
    this.e.set(pitch, yaw, roll, 'YXZ');
    this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(p, this.q.clone(), new THREE.Vector3(s, s, s));
    this.leaves[kind].push({ m, c: new THREE.Color().setScalar(tint) });
  }

  private floret(p: THREE.Vector3, s: number, col: string): void {
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    const c = new THREE.Color(col).multiplyScalar(0.85 + this.r() * 0.3);
    this.florets.push({ m, c });
  }

  /** A mound of geraniums over a bed (centre cx, cz; length L along x, depth D along z; soil at topY). */
  geraniums(cx: number, topY: number, cz: number, L: number, D: number, palette: string[], density = 1): void {
    const r = this.r;
    const nLeaves = Math.round(L * 70 * density);
    for (let i = 0; i < nLeaves; i++) {
      const p = new THREE.Vector3(cx + (r() - 0.5) * L, topY + r() * 0.13, cz + (r() - 0.5) * D);
      this.leaf('geranium', p, -(0.7 + r() * 0.7), r() * Math.PI * 2, (r() - 0.5) * 0.5, 0.07 + r() * 0.05, 0.75 + r() * 0.4);
    }
    const nClusters = Math.max(2, Math.round(L * 12 * density));
    for (let k = 0; k < nClusters; k++) {
      const c = new THREE.Vector3(cx + (r() - 0.5) * L * 0.95, topY + 0.15 + r() * 0.12, cz + (r() - 0.3) * D);
      const col = palette[Math.floor(r() * palette.length)];
      const n = 10 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const up = r() * 0.9;
        const rad = 0.022 + r() * 0.03;
        this.floret(c.clone().add(new THREE.Vector3(Math.cos(a) * rad * Math.cos(up), Math.sin(up) * rad, Math.sin(a) * rad * Math.cos(up))), 0.011 + r() * 0.006, col);
      }
    }
  }

  /** Ivy hanging in strands from an edge between x0 and x1 at height y, just in front of z. */
  ivy(x0: number, x1: number, y: number, z: number, count: number, lenMin: number, lenMax: number, flowers: string[] | null = null): void {
    const r = this.r;
    for (let s = 0; s < count; s++) {
      const x = x0 + r() * (x1 - x0);
      const len = lenMin + r() * (lenMax - lenMin);
      let px = x;
      let pz = z;
      for (let d = 0; d < len; d += 0.04 + r() * 0.02) {
        px += (r() - 0.5) * 0.03;
        pz += 0.004;
        this.leaf('ivy', new THREE.Vector3(px, y - d, pz), (r() - 0.5) * 0.6, (r() - 0.5) * 0.9, Math.PI + (r() - 0.5) * 1.2, 0.045 + r() * 0.03, 0.7 + r() * 0.45);
        if (flowers && r() < 0.12) this.floret(new THREE.Vector3(px + 0.02, y - d, pz + 0.03), 0.014, flowers[Math.floor(r() * flowers.length)]);
      }
    }
  }

  /** A terracotta trough on a sill (its bottom at y), planted with geraniums trailing at the front. */
  trough(x: number, y: number, z: number, L: number, palette: string[]): void {
    const H = 0.15;
    const D = 0.16;
    const box = new THREE.Mesh(new RoundedBoxGeometry(L, H, D, 2, 0.015), this.terracotta);
    box.position.set(x, y + H / 2, z);
    box.castShadow = true;
    this.group.add(box);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.03, D - 0.03), this.soil);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, y + H - 0.02, z);
    this.group.add(s);
    this.geraniums(x, y + H - 0.02, z, L - 0.04, D - 0.02, palette);
    this.ivy(x - L / 2, x + L / 2, y + H - 0.01, z + D / 2, Math.round(L * 7), 0.1, 0.38, palette);
  }

  /** A terracotta pot standing at (x, y, z); returns the soil height. */
  pot(x: number, y: number, z: number, rad: number, h: number): number {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(rad * 0.72, 0), new THREE.Vector2(rad, h * 0.86), new THREE.Vector2(rad * 1.1, h * 0.88), new THREE.Vector2(rad * 1.1, h), new THREE.Vector2(rad * 0.98, h)];
    const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), this.terracotta);
    pot.position.set(x, y, z);
    pot.castShadow = true;
    this.group.add(pot);
    const s = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.97, 24), this.soil);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, y + h * 0.93, z);
    this.group.add(s);
    if (y < 0.01) {
      const b = blob(rad * 3.2, rad * 2.6, 0.55);
      b.position.set(x, 0.004, z);
      this.group.add(b);
    }
    return y + h * 0.93;
  }

  potOfGeraniums(x: number, y: number, z: number, rad: number, h: number, palette: string[]): void {
    const top = this.pot(x, y, z, rad, h);
    this.geraniums(x, top, z, rad * 1.8, rad * 1.8, palette, 1.4);
  }

  /** A lemon tree in a big pot: a short trunk and a round crown of glossy leaves hung with lemons. */
  lemonTree(x: number, z: number): void {
    const r = this.r;
    const top = this.pot(x, 0, z, 0.26, 0.5);
    const trunk = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, top, z), new THREE.Vector3(x + 0.03, top + 0.4, z), new THREE.Vector3(x - 0.02, top + 0.8, z + 0.02)]), 12, 0.03, 8),
      std({ color: '#5a4330', roughness: 0.95 }),
    );
    trunk.castShadow = true;
    this.group.add(trunk);
    const cy = top + 1.0;
    for (let i = 0; i < 520; i++) {
      const u = r() * Math.PI * 2;
      const v = Math.acos(2 * r() - 1);
      const k = Math.pow(r(), 0.35);
      const p = new THREE.Vector3(x + Math.sin(v) * Math.cos(u) * 0.46 * k, cy + Math.cos(v) * 0.38 * k, z + Math.sin(v) * Math.sin(u) * 0.4 * k);
      this.leaf('lemon', p, r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2, 0.075 + r() * 0.035, 0.7 + r() * 0.45);
    }
    for (let i = 0; i < 16; i++) {
      const u = r() * Math.PI * 2;
      const v = 0.5 + r() * 1.9;
      const p = new THREE.Vector3(x + Math.sin(v) * Math.cos(u) * 0.44, cy + Math.cos(v) * 0.36, z + Math.sin(v) * Math.sin(u) * 0.38);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
      this.lemons.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(0.034, 0.044, 0.034)));
    }
  }

  build(): THREE.Group {
    (['geranium', 'ivy', 'lemon'] as LeafKind[]).forEach((kind) => {
      const list = this.leaves[kind];
      if (!list.length) return;
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ map: colorTex(leafArt(kind)), alphaTest: 0.5, side: THREE.DoubleSide, roughness: kind === 'lemon' ? 0.35 : 0.6 });
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((l, i) => {
        mesh.setMatrixAt(i, l.m);
        mesh.setColorAt(i, l.c);
      });
      mesh.castShadow = true;
      this.group.add(mesh);
    });
    if (this.florets.length) {
      const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std({ roughness: 0.55 }), this.florets.length);
      this.florets.forEach((f, i) => {
        fl.setMatrixAt(i, f.m);
        fl.setColorAt(i, f.c);
      });
      this.group.add(fl);
    }
    if (this.lemons.length) {
      const le = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), std({ color: '#f0c23a', roughness: 0.4 }), this.lemons.length);
      this.lemons.forEach((m, i) => le.setMatrixAt(i, m));
      le.castShadow = true;
      this.group.add(le);
    }
    return this.group;
  }
}

export const PALETTES = { REDS, PINKS, CORAL, WHITES };

// ————— The shrine —————

/** The painted Madonna: blue mantle, white veil, red robe, a gold halo, stars, a crescent moon at her feet. */
function madonnaArt(): HTMLCanvasElement {
  const W = 256;
  const H = 360;
  const { c, g } = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d3b7a');
  sky.addColorStop(1, '#5f86c9');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,236,170,0.9)';
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.7;
    g.beginPath();
    g.arc(x, y, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
    g.fill();
  }
  const cx = W / 2;
  // Halo with rays.
  g.strokeStyle = 'rgba(244,205,96,0.8)';
  g.lineWidth = 2;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 40, 96 + Math.sin(a) * 40);
    g.lineTo(cx + Math.cos(a) * 62, 96 + Math.sin(a) * 62);
    g.stroke();
  }
  g.fillStyle = '#f0c75a';
  g.beginPath();
  g.arc(cx, 96, 40, 0, Math.PI * 2);
  g.fill();
  // Red robe, then the blue mantle over it, then the white veil and the face.
  g.fillStyle = '#b3342a';
  g.beginPath();
  g.moveTo(cx - 34, 150);
  g.lineTo(cx + 34, 150);
  g.lineTo(cx + 46, 318);
  g.lineTo(cx - 46, 318);
  g.closePath();
  g.fill();
  g.fillStyle = '#2c55b0';
  g.beginPath();
  g.moveTo(cx, 78);
  g.bezierCurveTo(cx - 60, 90, cx - 70, 250, cx - 84, 322);
  g.lineTo(cx - 30, 322);
  g.bezierCurveTo(cx - 34, 230, cx - 26, 170, cx, 150);
  g.bezierCurveTo(cx + 26, 170, cx + 34, 230, cx + 30, 322);
  g.lineTo(cx + 84, 322);
  g.bezierCurveTo(cx + 70, 250, cx + 60, 90, cx, 78);
  g.fill();
  g.strokeStyle = '#e8c25a';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#f4efe4';
  g.beginPath();
  g.ellipse(cx, 104, 30, 38, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e7c29c';
  g.beginPath();
  g.ellipse(cx, 108, 19, 25, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(80,45,30,0.6)';
  g.fillRect(cx - 9, 104, 6, 2);
  g.fillRect(cx + 3, 104, 6, 2);
  // Hands joined in prayer.
  g.fillStyle = '#e7c29c';
  g.beginPath();
  g.moveTo(cx, 168);
  g.lineTo(cx - 9, 200);
  g.lineTo(cx + 9, 200);
  g.closePath();
  g.fill();
  // Crescent moon at her feet.
  g.fillStyle = '#f0c75a';
  g.beginPath();
  g.arc(cx, 330, 42, 0.15 * Math.PI, 0.85 * Math.PI);
  g.arc(cx, 316, 40, 0.8 * Math.PI, 0.2 * Math.PI, true);
  g.fill();
  return c;
}

function archShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const spring = h - w / 2;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.absarc(0, spring, w / 2, 0, Math.PI, false);
  s.closePath();
  return s;
}

/** An edicola votiva: an arched marble niche, the painted Madonna in a gilt frame, a little roof, a shelf of red
 * votive candles that flicker, and two small vases of fresh flowers. Origin at the foot of the niche. */
export function buildShrine(garden: Garden, at: THREE.Vector3): { group: THREE.Group; tick: Tick } {
  const g = new THREE.Group();
  g.position.copy(at);
  const marble = std({ color: '#efe7d6', roughness: 0.45 });
  const gold = std({ color: '#c9a24a', metalness: 0.85, roughness: 0.3 });
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(0.62, 0.86), { depth: 0.06, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 24 }), marble);
  g.add(back);
  const frameRing = archShape(0.5, 0.72);
  frameRing.holes.push(new THREE.Path(archShape(0.44, 0.66).getPoints(40)));
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameRing, { depth: 0.025, bevelEnabled: false, curveSegments: 24 }), gold);
  frame.position.set(0, 0.06, 0.07);
  g.add(frame);
  const picGeo = new THREE.ShapeGeometry(archShape(0.44, 0.66), 24);
  const uv = picGeo.getAttribute('uv') as THREE.BufferAttribute;
  const pos = picGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.44 + 0.5, pos.getY(i) / 0.66);
  const pic = new THREE.Mesh(picGeo, std({ map: colorTex(madonnaArt()), roughness: 0.5, emissive: '#ffffff', emissiveMap: colorTex(madonnaArt()), emissiveIntensity: 0.18 }));
  pic.position.set(0, 0.09, 0.072);
  g.add(pic);
  // A small tiled roof over it.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.035, 0.22), std({ color: '#9b3d22', roughness: 0.8 }));
  roof.position.set(0, 0.93, 0.1);
  roof.rotation.x = 0.25;
  g.add(roof);
  // The shelf with candles in red glasses, and two vases.
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.035, 0.2), marble);
  shelf.position.set(0, -0.02, 0.1);
  g.add(shelf);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#b8141c', emissive: '#ff3a1a', emissiveIntensity: 1.2, transparent: true, opacity: 0.88, roughness: 0.2 });
  const flameMat = new THREE.MeshStandardMaterial({ color: '#fff0c0', emissive: '#ffb347', emissiveIntensity: 7 });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const x = -0.16 + i * 0.08;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.07, 14), glassMat);
    cup.position.set(x, 0.033, 0.12 + (i % 2) * 0.03);
    g.add(cup);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 8), flameMat);
    f.position.set(x, 0.083, cup.position.z);
    g.add(f);
    flames.push(f);
  }
  const vaseMat = std({ color: '#f2f0ea', roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const vase = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 0), new THREE.Vector2(0.038, 0.05), new THREE.Vector2(0.02, 0.1), new THREE.Vector2(0.03, 0.12)], 16), vaseMat);
    vase.position.set(sx * 0.29, 0, 0.12);
    g.add(vase);
    garden.geraniums(at.x + sx * 0.29, at.y + 0.1, at.z + 0.12, 0.08, 0.06, sx < 0 ? REDS : WHITES, 3);
  }
  const tick: Tick = (_dt, t) => {
    flames.forEach((f, i) => {
      const k = 0.85 + 0.25 * Math.sin(t * 11 + i * 1.7) * Math.sin(t * 4.3 + i);
      f.scale.set(1, k, 1);
    });
    glassMat.emissiveIntensity = 1.1 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 3.7);
  };
  return { group: g, tick };
}

// ————— Paper and signs on the wall —————

/** Torn edges: bites taken out along the borders of a poster canvas. */
function tear(g: CanvasRenderingContext2D, w: number, h: number, r: Rng, heavy: boolean): void {
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  const n = heavy ? 26 : 12;
  for (let k = 0; k < n; k++) {
    const edge = Math.floor(r() * 4);
    const t = r();
    const x = edge === 0 ? t * w : edge === 1 ? w : edge === 2 ? t * w : 0;
    const y = edge === 0 ? 0 : edge === 1 ? t * h : edge === 2 ? h : t * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) g.lineTo(x + (r() - 0.5) * (heavy ? 90 : 40), y + (r() - 0.5) * (heavy ? 90 : 40));
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

function posterArt(kind: 'festa' | 'concerto' | 'affittasi', r: Rng): HTMLCanvasElement {
  const W = 300;
  const H = kind === 'affittasi' ? 260 : 420;
  const { c, g } = canvas(W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'festa') {
    g.fillStyle = '#c8281c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#f6d24a';
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(W / 2, 120);
      g.lineTo(W / 2 + Math.cos(a) * 200, 120 + Math.sin(a) * 200);
      g.lineTo(W / 2 + Math.cos(a + 0.12) * 200, 120 + Math.sin(a + 0.12) * 200);
      g.fill();
    }
    g.fillStyle = '#c8281c';
    g.fillRect(0, 200, W, H - 200);
    g.fillStyle = '#fff4dc';
    g.font = '800 54px "Fraunces Variable", Georgia, serif';
    g.fillText('GRANDE', W / 2, 245);
    g.fillText('FESTA', W / 2, 300);
    g.font = 'italic 600 26px "Fraunces Variable", Georgia, serif';
    g.fillText('del Vico dei Fornai', W / 2, 346);
    g.font = '700 20px "Courier Prime", monospace';
    g.fillText('musica · fuochi · pizza', W / 2, 384);
  } else if (kind === 'concerto') {
    g.fillStyle = '#20365f';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f2e2b8';
    g.lineWidth = 4;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.fillStyle = '#f2e2b8';
    g.font = 'italic 600 30px "Fraunces Variable", Georgia, serif';
    g.fillText('Serata di', W / 2, 90);
    g.font = '800 46px "Fraunces Variable", Georgia, serif';
    g.fillText('MANDOLINI', W / 2, 140);
    // A mandolin: round body, neck, sound hole.
    g.fillStyle = '#c98a3c';
    g.beginPath();
    g.ellipse(W / 2, 260, 52, 66, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(W / 2 - 8, 160, 16, 50);
    g.fillStyle = '#20365f';
    g.beginPath();
    g.arc(W / 2, 250, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2e2b8';
    g.font = '700 20px "Courier Prime", monospace';
    g.fillText('SABATO · ORE 21', W / 2, 362);
  } else {
    g.fillStyle = '#f4f0e2';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d1d1d';
    g.font = '800 44px "Courier Prime", monospace';
    g.fillText('AFFITTASI', W / 2, 52);
    g.font = '600 22px "Courier Prime", monospace';
    g.fillText('monolocale, 2° piano', W / 2, 98);
    g.fillText('luminoso, vista vicolo', W / 2, 126);
    // Tear-off tabs with the number, some already taken.
    for (let i = 0; i < 8; i++) {
      const x = 10 + i * 35;
      if (r() < 0.35) continue;
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.strokeRect(x, 160, 32, 96);
      g.save();
      g.translate(x + 16, 208);
      g.rotate(-Math.PI / 2);
      g.font = '600 15px "Courier Prime", monospace';
      g.fillText('081 555 90', 0, 0);
      g.restore();
    }
  }
  // Glue stains and sun fade.
  g.fillStyle = 'rgba(255,240,210,0.12)';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(80,60,30,${r() * 0.15})`;
    g.fillRect(r() * W, r() * H, 6 + r() * 30, 2 + r() * 10);
  }
  tear(g, W, H, r, kind === 'festa');
  return c;
}

function plaqueArt(): HTMLCanvasElement {
  const { c, g } = canvas(512, 200);
  g.fillStyle = '#ece8df';
  g.fillRect(0, 0, 512, 200);
  g.strokeStyle = 'rgba(120,115,105,0.25)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(0, Math.random() * 200);
    g.bezierCurveTo(170, Math.random() * 200, 340, Math.random() * 200, 512, Math.random() * 200);
    g.stroke();
  }
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 4;
  g.strokeRect(14, 14, 484, 172);
  g.fillStyle = '#1e1e1e';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 46px "Fraunces Variable", Georgia, serif';
  g.fillText('VICO DEI FORNAI', 256, 88);
  g.font = '600 24px "Fraunces Variable", Georgia, serif';
  g.fillText('QUARTIERE SAN LORENZO', 256, 142);
  return c;
}

function tileArt(): HTMLCanvasElement {
  const { c, g } = canvas(256);
  g.fillStyle = '#f6f1e4';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1f4f9c';
  g.lineWidth = 12;
  g.strokeRect(14, 14, 228, 228);
  g.fillStyle = '#e0a62a';
  for (const [x, y] of [[34, 34], [222, 34], [34, 222], [222, 222]]) {
    g.beginPath();
    g.arc(x, y, 12, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#1f4f9c';
  g.font = '800 128px "Fraunces Variable", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('90', 128, 136);
  return c;
}

/** Posters, the street's marble plate and the shop's number, flat on a wall whose face is at z = Z. */
export function wallPapers(Z: number, items: { kind: 'festa' | 'concerto' | 'affittasi' | 'plaque' | 'tile'; x: number; y: number; w: number; rot?: number }[]): THREE.Group {
  const g = new THREE.Group();
  const r = rng(90);
  items.forEach((it, i) => {
    const art = it.kind === 'plaque' ? plaqueArt() : it.kind === 'tile' ? tileArt() : posterArt(it.kind, r);
    const h = (it.w * art.height) / art.width;
    const paper = it.kind !== 'plaque' && it.kind !== 'tile';
    const geo = paper ? new THREE.PlaneGeometry(it.w, h) : new THREE.BoxGeometry(it.w, h, it.kind === 'plaque' ? 0.03 : 0.012);
    const mat = std({ map: colorTex(art), transparent: paper, alphaTest: paper ? 0.4 : 0, roughness: paper ? 0.9 : it.kind === 'tile' ? 0.2 : 0.5 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(it.x, it.y, Z + (paper ? 0.004 + i * 0.0015 : 0.015));
    m.rotation.z = it.rot ?? 0;
    g.add(m);
  });
  return g;
}

/** A wall lantern on an iron arm: a glowing globe in a hexagonal cage, with its warm light. */
export function wallLantern(x: number, y: number, Z: number, intensity = 3.2): { group: THREE.Group; tick: Tick } {
  const g = new THREE.Group();
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45e', emissiveIntensity: 5 }));
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.7, roughness: 0.5, wireframe: true }));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.1, 6), std({ color: '#1b1b1b', metalness: 0.7, roughness: 0.5 }));
  cap.position.y = 0.2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.4), std({ color: '#1b1b1b', metalness: 0.7 }));
  arm.position.set(0, 0.2, -0.2);
  g.add(glow, cage, cap, arm);
  g.position.set(x, y, Z + 0.42);
  const light = new THREE.PointLight('#ffb767', intensity, 9, 1.6);
  light.position.set(0, -0.1, 0.1);
  if (!LITE) g.add(light);
  return { group: g, tick: (_dt, t) => (light.intensity = intensity * (0.96 + 0.04 * Math.sin(t * 8.3 + 1.3))) };
}
