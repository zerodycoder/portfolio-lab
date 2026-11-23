import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, colorTex } from '../lib/canvas';
import { fbm2, rng, type Rng } from '../lib/rand';

/**
 * The architecture of the street around the shop: dressed windows (stone surrounds, sills, painted frames, green
 * persiane), a weathered skin over the plaster (damp, streaks, fallen patches showing the yellow tuff, cracks), the
 * grey stone plinth and the band between the floors, and the neighbouring houses that carry the street on past the
 * shop on both sides.
 */

export type WinKind = 'dark' | 'lit' | 'tv' | 'shut' | 'glow';
export type WinSpec = { x: number; y: number; w: number; h: number; kind: WinKind };
export type Tick = (dt: number, t: number) => void;

const STONE = '#e3d2b2';

const std = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

/** Green louvred shutters. The lit variant is an emissive map: light only in the gaps between the slats. */
function louvreArt(lit: boolean): HTMLCanvasElement {
  const { c, g } = canvas(128, 480);
  g.fillStyle = lit ? '#000' : '#2f5d43';
  g.fillRect(0, 0, 128, 480);
  const slat = (fn: (y: number) => void): void => {
    for (let y = 16; y < 462; y += 12) if (y < 226 || y > 248) fn(y);
  };
  if (lit) {
    slat((y) => {
      g.fillStyle = 'rgba(255,186,104,0.95)';
      g.fillRect(13, y + 9, 102, 2);
    });
    return c;
  }
  g.fillStyle = '#23472f';
  g.fillRect(0, 0, 128, 14);
  g.fillRect(0, 466, 128, 14);
  g.fillRect(0, 0, 12, 480);
  g.fillRect(116, 0, 12, 480);
  g.fillRect(0, 232, 128, 12);
  slat((y) => {
    g.fillStyle = 'rgba(210,235,215,0.16)';
    g.fillRect(12, y, 104, 2);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(12, y + 8, 104, 4);
  });
  // Sun-bleached, chipped paint.
  for (let i = 0; i < 160; i++) {
    g.fillStyle = Math.random() < 0.6 ? `rgba(0,0,0,${Math.random() * 0.12})` : `rgba(190,215,180,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 128, Math.random() * 480, 2 + Math.random() * 12, 1 + Math.random() * 3);
  }
  return c;
}

/** What the glass shows: a dark room behind lace, a lit room behind a warm curtain, or a room lit by a television. */
function paneArt(kind: WinKind): HTMLCanvasElement {
  const { c, g } = canvas(128, 256);
  if (kind === 'lit') {
    const grad = g.createRadialGradient(64, 96, 8, 64, 128, 170);
    grad.addColorStop(0, '#ffd59a');
    grad.addColorStop(1, '#8a4a20');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(255,245,225,0.32)';
    for (let x = 0; x < 128; x += 9) g.fillRect(x, 0, 4, 256);
    g.fillStyle = 'rgba(60,30,15,0.55)';
    g.fillRect(0, 0, 128, 14);
    return c;
  }
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1d2638');
  grad.addColorStop(1, '#07090e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Lace curtains, drawn to the sides.
  for (let x = 0; x < 128; x += 5) {
    const side = x < 40 || x > 88;
    g.fillStyle = `rgba(220,225,235,${side ? 0.1 + Math.random() * 0.05 : 0.03})`;
    g.fillRect(x, 0, 2, 256);
  }
  // The street lamp's reflection: a soft diagonal sheen.
  g.save();
  g.translate(64, 128);
  g.rotate(-0.5);
  const sheen = g.createLinearGradient(-30, 0, 30, 0);
  sheen.addColorStop(0, 'rgba(255,220,170,0)');
  sheen.addColorStop(0.5, 'rgba(255,220,170,0.1)');
  sheen.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = sheen;
  g.fillRect(-30, -200, 60, 400);
  g.restore();
  return c;
}

/** The blue, flickering glow of a television somewhere inside the room (an emissive map). */
function tvGlow(): HTMLCanvasElement {
  const { c, g } = canvas(128, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  const grad = g.createRadialGradient(40, 190, 4, 40, 190, 120);
  grad.addColorStop(0, 'rgba(150,185,255,0.9)');
  grad.addColorStop(1, 'rgba(150,185,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  return c;
}

export type WindowMats = { stone: THREE.Material; frame: THREE.Material; reveal: THREE.Material; louvre: THREE.Material; louvreLit: THREE.Material };

export function windowMats(): WindowMats {
  const louvre = colorTex(louvreArt(false));
  return {
    stone: std({ color: STONE, roughness: 0.9 }),
    frame: std({ color: '#ece3d1', roughness: 0.6 }),
    reveal: std({ color: '#6d4a2e', roughness: 0.95 }),
    louvre: std({ map: louvre, roughness: 0.7 }),
    louvreLit: std({ map: louvre, roughness: 0.7, emissive: '#ffffff', emissiveMap: colorTex(louvreArt(true)), emissiveIntensity: 1.3 }),
  };
}

/**
 * One window on a wall whose outside face is at z = Z: recessed glass, reveals, a painted frame with glazing bars,
 * a stone surround with a sill, and a pair of persiane hinged outside the surround.
 */
export function dressWindow(s: WinSpec, Z: number, m: WindowMats, r: Rng): { group: THREE.Group; tick?: Tick } {
  const g = new THREE.Group();
  const { x, y, w, h, kind } = s;
  const glassZ = Z - 0.08;
  const pane = paneArt(kind);
  const lit = kind === 'lit';
  const tv = kind === 'tv';
  const glassMat = new THREE.MeshStandardMaterial({
    map: colorTex(pane),
    roughness: lit ? 0.6 : 0.12,
    emissive: lit ? '#ffffff' : tv ? '#9fbcff' : '#000000',
    emissiveMap: lit ? colorTex(pane) : tv ? colorTex(tvGlow()) : null,
    emissiveIntensity: lit ? 0.9 : tv ? 0.8 : 0,
    envMapIntensity: 1.4,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
  glass.position.set(x, y, glassZ);
  g.add(glass);

  // Reveals: the thickness of the wall around the opening.
  const d = Z - glassZ;
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(d, h), m.reveal);
    side.rotation.y = sx * Math.PI / 2 * -1;
    side.position.set(x + (sx * w) / 2, y, glassZ + d / 2);
    g.add(side);
  }
  const head = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m.reveal);
  head.rotation.x = Math.PI / 2;
  head.position.set(x, y + h / 2, glassZ + d / 2);
  g.add(head);

  // Painted frame and glazing bars (two casements, three panes each).
  const bar = (bw: number, bh: number, bx: number, by: number): void => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), m.frame);
    b.position.set(bx, by, glassZ + 0.015);
    g.add(b);
  };
  const t = 0.05;
  bar(w, t, x, y + h / 2 - t / 2);
  bar(w, t, x, y - h / 2 + t / 2);
  bar(t, h, x - w / 2 + t / 2, y);
  bar(t, h, x + w / 2 - t / 2, y);
  bar(0.04, h, x, y);
  for (const k of [1 / 3, 2 / 3]) bar(w, 0.022, x, y - h / 2 + h * k);

  // Stone surround: jambs, lintel with a small cornice, and a projecting sill on two brackets.
  const stone = (bw: number, bh: number, bd: number, bx: number, by: number, bz: number): void => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m.stone);
    b.position.set(bx, by, bz);
    b.castShadow = true;
    g.add(b);
  };
  stone(0.1, h + 0.12, 0.04, x - w / 2 - 0.05, y, Z + 0.02);
  stone(0.1, h + 0.12, 0.04, x + w / 2 + 0.05, y, Z + 0.02);
  stone(w + 0.2, 0.12, 0.05, x, y + h / 2 + 0.06, Z + 0.025);
  stone(w + 0.32, 0.035, 0.11, x, y + h / 2 + 0.135, Z + 0.055);
  stone(w + 0.26, 0.05, 0.17, x, y - h / 2 - 0.025, Z + 0.065);
  for (const sx of [-1, 1]) stone(0.05, 0.08, 0.1, x + sx * (w / 2 - 0.05), y - h / 2 - 0.09, Z + 0.05);

  // Persiane, hinged outside the surround. Open ones stand out from the wall at an angle; shut ones cover it.
  const leafW = w / 2 + 0.1;
  const shut = kind === 'shut' || kind === 'glow';
  for (const sx of [-1, 1]) {
    const geo = new THREE.BoxGeometry(leafW, h + 0.08, 0.025);
    geo.translate((sx * leafW) / 2, 0, 0);
    const leaf = new THREE.Mesh(geo, kind === 'glow' ? m.louvreLit : m.louvre);
    leaf.position.set(x + sx * (w / 2 + 0.1), y, Z + 0.05);
    // Positive y-rotation swings +x towards -z (into the wall), so an outward swing is -sx.
    leaf.rotation.y = shut ? -sx * (Math.PI - 0.03) : -sx * (0.8 + r() * 0.45);
    leaf.castShadow = true;
    g.add(leaf);
  }

  let tick: Tick | undefined;
  if (tv) {
    let next = 0;
    let target = 0.8;
    tick = (_dt, time) => {
      if (time > next) {
        next = time + 0.08 + Math.random() * 0.5;
        target = 0.45 + Math.random() * 0.8;
      }
      glassMat.emissiveIntensity += (target - glassMat.emissiveIntensity) * 0.35;
    };
  }
  return { group: g, tick };
}

/**
 * Merges every plain mesh under `root` that shares a material into one mesh, so a street of dressed windows (a few
 * dozen boxes each) costs a handful of draw calls. Only for groups made of plain single-material meshes.
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    geo.clearGroups();
    const list = buckets.get(m.material) ?? [];
    list.push(geo);
    buckets.set(m.material, list);
  });
  const out = new THREE.Group();
  out.position.copy(root.position);
  out.quaternion.copy(root.quaternion);
  out.scale.copy(root.scale);
  buckets.forEach((geos, mat) => {
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    out.add(mesh);
  });
  return out;
}

/** Stone plinth along the foot of a wall (with gaps, e.g. the shopfront) and a moulded band between the floors. */
export function plinthAndBand(x0: number, x1: number, Z: number, gaps: [number, number][], plinth: THREE.Material, bandY: number | null): THREE.Group {
  const g = new THREE.Group();
  const H = 0.9;
  const segs: [number, number][] = [];
  let a = x0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > a) segs.push([a, g0]);
    a = Math.max(a, g1);
  }
  if (a < x1) segs.push([a, x1]);
  for (const [s0, s1] of segs) {
    const geo = new THREE.BoxGeometry(s1 - s0, H, 0.05);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (s1 - s0)) / 1.3, (uv.getY(i) * H) / 1.3);
    const b = new THREE.Mesh(geo, plinth);
    b.position.set((s0 + s1) / 2, H / 2, Z + 0.025);
    b.receiveShadow = true;
    g.add(b);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, 0.04, 0.07), std({ color: '#7c7873', roughness: 0.8 }));
    cap.position.set((s0 + s1) / 2, H + 0.02, Z + 0.035);
    g.add(cap);
  }
  if (bandY !== null) {
    const stoneMat = std({ color: STONE, roughness: 0.9 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, 0.06), stoneMat);
    band.position.set((x0 + x1) / 2, bandY, Z + 0.03);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.03, 0.1), stoneMat);
    lip.position.set((x0 + x1) / 2, bandY + 0.065, Z + 0.05);
    band.castShadow = lip.castShadow = true;
    g.add(band, lip);
  }
  return g;
}

export type Patch = [x: number, y: number, r: number];

/**
 * The plaster's age, as a transparent skin over a wall of width x0..x1 and height h (same holes as the wall):
 * blotches, damp rising above the plinth, rain streaks under the sills, fallen patches that show the yellow tuff
 * blocks beneath, and hairline cracks.
 */
export function wallSkin(shape: THREE.Shape, x0: number, x1: number, h: number, Z: number, seed: number, patches: Patch[], sills: [x: number, y: number][]): THREE.Mesh {
  const PPM = 150;
  const W = Math.round((x1 - x0) * PPM);
  const H = Math.round(h * PPM);
  const { c, g } = canvas(W, H);
  const r = rng(seed);
  const px = (x: number): number => (x - x0) * PPM;
  const py = (y: number): number => (h - y) * PPM;

  // Blotches: a small fbm field scaled up (soft), darker and lighter.
  const sw = Math.ceil(W / 10);
  const sh = Math.ceil(H / 10);
  const small = canvas(sw, sh);
  const img = small.g.createImageData(sw, sh);
  for (let j = 0; j < sh; j++)
    for (let i = 0; i < sw; i++) {
      const n = fbm2(i / 18, j / 18, 4, seed);
      const k = (j * sw + i) * 4;
      if (n < 0.5) {
        img.data[k] = 60;
        img.data[k + 1] = 34;
        img.data[k + 2] = 16;
        img.data[k + 3] = Math.min(255, (0.5 - n) * 520);
      } else {
        img.data[k] = 255;
        img.data[k + 1] = 236;
        img.data[k + 2] = 200;
        img.data[k + 3] = Math.min(255, (n - 0.5) * 300);
      }
    }
  small.g.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small.c, 0, 0, W, H);

  // Damp rising above the plinth, with a ragged tide line.
  for (let i = 0; i < W; i += 3) {
    const top = 1.0 + fbm2(i / 90, 3.1, 3, seed + 5) * 0.7;
    const grad = g.createLinearGradient(0, py(0.9), 0, py(top));
    grad.addColorStop(0, 'rgba(40,24,12,0.42)');
    grad.addColorStop(0.85, 'rgba(40,24,12,0.18)');
    grad.addColorStop(1, 'rgba(40,24,12,0)');
    g.fillStyle = grad;
    g.fillRect(i, py(top), 3, py(0.9) - py(top));
  }

  // Rain streaks under each sill.
  for (const [sx, sy] of sills) {
    for (let k = 0; k < 26; k++) {
      const x = px(sx + (r() - 0.5) * 0.85);
      const len = (0.4 + r() * 1.3) * PPM;
      const grad = g.createLinearGradient(0, py(sy), 0, py(sy) + len);
      grad.addColorStop(0, `rgba(35,22,12,${0.12 + r() * 0.2})`);
      grad.addColorStop(1, 'rgba(35,22,12,0)');
      g.fillStyle = grad;
      g.fillRect(x, py(sy), 1 + r() * 3, len);
    }
  }

  // Fallen plaster: yellow tuff blocks in mortar, with the broken plaster's edge.
  for (const [cx, cy, rad] of patches) {
    const pts: [number, number][] = [];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const rr = rad * (0.55 + fbm2(Math.cos(a) * 2 + cx, Math.sin(a) * 2 + cy, 3, seed) * 0.9) * (0.88 + r() * 0.24);
      pts.push([px(cx + Math.cos(a) * rr * 1.25), py(cy + Math.sin(a) * rr)]);
    }
    const path = (): void => {
      g.beginPath();
      pts.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b)));
      g.closePath();
    };
    g.save();
    path();
    g.clip();
    g.fillStyle = '#8a7556';
    g.fillRect(px(cx - rad * 2), py(cy + rad * 2), rad * 4 * PPM, rad * 4 * PPM);
    const bw = 0.3 * PPM;
    const bh = 0.2 * PPM;
    for (let j = -8; j < 8; j++)
      for (let i = -8; i < 8; i++) {
        const bx = px(cx) + i * bw + (j % 2 ? bw / 2 : 0);
        const by = py(cy) + j * bh;
        const tone = 0.9 + r() * 0.18;
        g.fillStyle = `rgb(${Math.round(222 * tone)},${Math.round(196 * tone)},${Math.round(138 * tone)})`;
        g.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
        g.fillStyle = 'rgba(70,50,25,0.22)';
        for (let p = 0; p < 10; p++) g.fillRect(bx + r() * bw, by + r() * bh, 2, 2);
      }
    // The plaster's broken edge throws a shadow onto the stone inside it.
    path();
    g.strokeStyle = 'rgba(30,18,8,0.3)';
    g.lineWidth = 8;
    g.stroke();
    g.restore();
    path();
    g.strokeStyle = 'rgba(245,220,180,0.22)';
    g.lineWidth = 1.5;
    g.stroke();
  }

  // Hairline cracks.
  g.strokeStyle = 'rgba(30,18,10,0.45)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 10; k++) {
    let x = r() * W;
    let y = r() * H;
    let a = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 40; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 5;
      y += Math.sin(a) * 5 + 2;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - x0) / (x1 - x0), pos.getY(i) / h);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: colorTex(c), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.position.z = Z + 0.002;
  mesh.receiveShadow = true;
  return mesh;
}

/** A rectangle-with-holes wall shape (windows and doors as [x, y, w, h], y at the bottom; arches as 'arch'). */
export function wallShape(x0: number, x1: number, h: number, holes: { x: number; y: number; w: number; h: number; arch?: boolean }[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, h);
  s.lineTo(x0, h);
  s.closePath();
  for (const o of holes) {
    const p = new THREE.Path();
    const l = o.x - o.w / 2;
    const rr = o.x + o.w / 2;
    p.moveTo(l, o.y + 0.001);
    p.lineTo(rr, o.y + 0.001);
    if (o.arch) {
      const spring = o.y + o.h - o.w / 2;
      p.lineTo(rr, spring);
      p.absarc(o.x, spring, o.w / 2, 0, Math.PI, false);
    } else {
      p.lineTo(rr, o.y + o.h);
      p.lineTo(l, o.y + o.h);
    }
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

export type NeighbourOpts = {
  side: -1 | 1;
  /** Inner edge (where it meets the shop's building) and outer edge. */
  x0: number;
  x1: number;
  Z: number;
  /** How far its face stands forward of the shop's (> 0), so the step between the houses shows. */
  forward: number;
  height: number;
  plaster: THREE.Material;
  plinth: THREE.Material;
  windows: WinSpec[];
  /** A doorway: a wooden portone, or an archway into a courtyard (dark, with a lamp deep inside). */
  door: { x: number; w: number; h: number; kind: 'portone' | 'androne' };
  seed: number;
  mats: WindowMats;
};

/** A neighbouring house: plaster wall with dressed windows, a doorway, the plinth, a weathered skin and the step. */
export function buildNeighbour(o: NeighbourOpts): { group: THREE.Group; ticks: Tick[] } {
  const g = new THREE.Group();
  const ticks: Tick[] = [];
  const a = Math.min(o.x0, o.x1);
  const b = Math.max(o.x0, o.x1);
  const Zf = o.Z + o.forward;
  const holes = [...o.windows.map((w) => ({ x: w.x, y: w.y - w.h / 2, w: w.w, h: w.h })), { x: o.door.x, y: 0, w: o.door.w, h: o.door.h, arch: true }];
  const shape = wallShape(a, b, o.height, holes);
  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
  const wall = new THREE.Mesh(geo, o.plaster);
  wall.position.z = Zf;
  wall.receiveShadow = true;
  g.add(wall);
  // The step between the two houses: a strip of the neighbour's side wall, facing the shop.
  const ret = new THREE.Mesh(new THREE.PlaneGeometry(o.forward, o.height), o.plaster);
  ret.rotation.y = (-o.side * Math.PI) / 2;
  ret.position.set(o.x0, o.height / 2, o.Z + o.forward / 2);
  g.add(ret);
  // A drainpipe down the joint.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, o.height, 12), std({ color: '#5d5a55', metalness: 0.5, roughness: 0.5 }));
  pipe.position.set(o.x0 - o.side * 0.09, o.height / 2, o.Z + 0.07);
  g.add(pipe);

  const r = rng(o.seed);
  const wins = new THREE.Group();
  for (const w of o.windows) {
    const d = dressWindow(w, Zf, o.mats, r);
    wins.add(d.group);
    if (d.tick) ticks.push(d.tick);
  }
  g.add(mergeByMaterial(wins));
  const doorSpring = o.door.h - o.door.w / 2;
  if (o.door.kind === 'portone') {
    const { c, g: dg } = canvas(256, 512);
    dg.fillStyle = '#3b2416';
    dg.fillRect(0, 0, 256, 512);
    dg.strokeStyle = 'rgba(0,0,0,0.5)';
    dg.lineWidth = 6;
    for (const [x, y, w, h] of [[20, 140, 100, 150], [136, 140, 100, 150], [20, 310, 100, 180], [136, 310, 100, 180]] as const) dg.strokeRect(x, y, w, h);
    dg.fillStyle = 'rgba(255,220,170,0.05)';
    for (let i = 0; i < 60; i++) dg.fillRect(Math.random() * 256, Math.random() * 512, 1, 30 + Math.random() * 80);
    const doorGeo = new THREE.ShapeGeometry(archFill(o.door.w, o.door.h), 20);
    const duv = doorGeo.getAttribute('uv') as THREE.BufferAttribute;
    const dpos = doorGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < duv.count; i++) duv.setXY(i, dpos.getX(i) / o.door.w + 0.5, dpos.getY(i) / o.door.h);
    const door = new THREE.Mesh(doorGeo, std({ map: colorTex(c), roughness: 0.6 }));
    door.position.set(o.door.x, 0, Zf - 0.12);
    g.add(door);
  } else {
    // An archway into a courtyard: dark sides, a lamp glowing at the far end.
    const depth = 3.2;
    const dark = std({ color: '#2a1d14', roughness: 1, side: THREE.BackSide });
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(o.door.w, o.door.h, depth), dark);
    tunnel.position.set(o.door.x, o.door.h / 2, Zf - depth / 2);
    g.add(tunnel);
    const glowC = canvas(128);
    const grad = glowC.g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,200,130,1)');
    grad.addColorStop(1, 'rgba(255,200,130,0)');
    glowC.g.fillStyle = grad;
    glowC.g.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: colorTex(glowC.c), transparent: true, depthWrite: false }));
    glow.scale.set(1.2, 1.2, 1);
    glow.position.set(o.door.x, doorSpring * 0.8, Zf - depth + 0.2);
    g.add(glow);
    const lamp = new THREE.PointLight('#ffbd7a', 1.2, 4, 1.8);
    lamp.position.set(o.door.x, doorSpring * 0.8, Zf - depth + 0.5);
    g.add(lamp);
  }
  // Stone arch round the doorway.
  const archRing = new THREE.Shape();
  const R = o.door.w / 2 + 0.14;
  archRing.moveTo(-R, 0);
  archRing.lineTo(-R, doorSpring);
  archRing.absarc(0, doorSpring, R, Math.PI, 0, true);
  archRing.lineTo(R, 0);
  archRing.lineTo(o.door.w / 2, 0);
  archRing.lineTo(o.door.w / 2, doorSpring);
  archRing.absarc(0, doorSpring, o.door.w / 2, 0, Math.PI, false);
  archRing.lineTo(-o.door.w / 2, 0);
  archRing.closePath();
  const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(archRing, { depth: 0.05, bevelEnabled: false, curveSegments: 20 }), std({ color: '#8e8a84', roughness: 0.85 }));
  ring.position.set(o.door.x, 0, Zf);
  g.add(ring);

  g.add(plinthAndBand(a, b, Zf, [[o.door.x - o.door.w / 2 - 0.14, o.door.x + o.door.w / 2 + 0.14]], o.plinth, 3.32));
  g.add(
    wallSkin(
      shape,
      a,
      b,
      o.height,
      Zf,
      o.seed,
      [[(a + b) / 2 + o.side * 1.2, 2.2, 0.3]],
      o.windows.map((w) => [w.x, w.y - w.h / 2 - 0.05] as [number, number]),
    ),
  );
  return { group: g, ticks };
}

/** The filled outline of an arched opening (for a door leaf), centred on x = 0 with its foot at y = 0. */
function archFill(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  const spring = h - w / 2;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, spring);
  s.absarc(0, spring, w / 2, 0, Math.PI, false);
  s.closePath();
  return s;
}
