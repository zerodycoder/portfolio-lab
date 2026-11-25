import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { colorTex, dataTex } from '../lib/canvas';
import { pbr } from './pbr';
import { majolica, marble, oakBoard, photoOr, plainTiles, tileRelief } from './textures';
import { LITE } from '../lib/quality';

/**
 * The pizzeria's interior, in metres: the floor is y = 0, the street wall z = +2.5, the back wall z = -2.5,
 * side walls x = ±3.2, ceiling 3.1. The oven stands at the back on the left, the marble counter along the back
 * wall to its right with the work board (spianatoia) on it, the shelves above it.
 *
 * Surfaces are photo-scanned PBR materials (terracotta floor, lime stucco, oak planks and beams; see pbr.ts); the
 * glazed tiles are drawn in code but carry their own relief and a clear-coat glaze, so they catch the lamps.
 */

export const ROOM = { x0: -3.2, x1: 3.2, z0: -2.5, z1: 2.5, h: 3.1 };
export const BENCH = { x0: -0.45, x1: 2.65, z0: -2.5, z1: -1.72, top: 0.92 };
/** Where the pizza sits on the work board (pizza space origin). */
export const BOARD_SPOT = new THREE.Vector3(0.62, BENCH.top + 0.028, -2.06);
export const DOOR = { x: 1.25, w: 1.0, h: 2.3 };
export const WINDOW = { x: -1.35, w: 1.9, y0: 0.75, y1: 2.45 };

export type Room = {
  group: THREE.Group;
  board: THREE.Mesh;
  pendantSpot: THREE.SpotLight;
  lights: { bulbs: THREE.PointLight[]; hemi: THREE.HemisphereLight; street: THREE.DirectionalLight };
  /** Things a visitor can tap (name → object). */
  hot: Record<string, THREE.Object3D>;
};

/** A plane whose UVs count repeats of `metres` (so a scanned texture keeps its real scale). */
function plane(w: number, h: number, m: THREE.Material, metres: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / metres, (uv.getY(i) * h) / metres);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

/** Glazed tiles: the drawn pattern, a relief normal map and a clear-coat glaze. */
function glazed(pattern: HTMLCanvasElement, relief: { normal: HTMLCanvasElement; rough: HTMLCanvasElement }): THREE.MeshPhysicalMaterial {
  const map = colorTex(pattern, [1, 1]);
  const normalMap = dataTex(relief.normal, [1, 1]);
  const roughnessMap = dataTex(relief.rough, [1, 1]);
  [map, normalMap, roughnessMap].forEach((t) => (t.wrapS = t.wrapT = THREE.RepeatWrapping));
  return new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap,
    roughness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    clearcoatNormalMap: normalMap,
    clearcoatNormalScale: new THREE.Vector2(0.5, 0.5),
  });
}

export async function buildRoom(base: string): Promise<Room> {
  const group = new THREE.Group();
  group.name = 'room';
  const hot: Record<string, THREE.Object3D> = {};
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;

  const [floorMat, stuccoMat, ceilingMat, beamMat] = await Promise.all([
    pbr(base, 'floor', { color: '#f4dfcf' }),
    pbr(base, 'stucco', { color: '#f2e4cc', normal: 0.8 }),
    pbr(base, 'ceiling', { color: '#c9a888' }),
    pbr(base, 'beam', { color: '#8a5a3c' }),
  ]);
  const relief = tileRelief();
  const majolicaMat = glazed(majolica(), relief);
  const greenMat = glazed(plainTiles([46, 92, 70]), relief);

  // Floor: old terracotta tiles.
  const floor = plane(W, D, floorMat, 1.4);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
  group.add(floor);

  // Ceiling: oak boards across chestnut beams.
  const ceil = plane(W, D, ceilingMat, 1.6);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.h, 0);
  group.add(ceil);
  for (let z = ROOM.z0 + 0.45; z < ROOM.z1; z += 0.85) {
    const g = new THREE.BoxGeometry(W, 0.18, 0.15);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 1.2), uv.getY(i) * 0.15);
    const beam = new THREE.Mesh(g, beamMat);
    beam.position.set(0, ROOM.h - 0.09, z);
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);
  }

  // Walls: lime stucco. A skirting of dark green glazed tiles on the side walls, majolica behind the counter.
  const SKIRT = 1.12;
  const wall = (w: number, pos: THREE.Vector3, rotY: number, skirt: boolean): void => {
    const p = plane(w, ROOM.h, stuccoMat, 1.5);
    p.position.copy(pos).setY(ROOM.h / 2);
    p.rotation.y = rotY;
    group.add(p);
    if (!skirt) return;
    const t = plane(w, SKIRT, greenMat, 0.6);
    t.position.copy(pos).setY(SKIRT / 2);
    t.rotation.y = rotY;
    t.translateZ(0.006);
    group.add(t);
    // A rounded ceramic cap along the top of the tiles.
    const holder = new THREE.Group();
    holder.position.copy(pos).setY(SKIRT + 0.008);
    holder.rotation.y = rotY;
    const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, w, 12, 1), greenMat);
    c2.rotation.z = Math.PI / 2;
    c2.position.z = 0.012;
    holder.add(c2);
    group.add(holder);
  };
  wall(W, new THREE.Vector3(0, 0, ROOM.z0), 0, false);
  wall(D, new THREE.Vector3(ROOM.x0, 0, 0), Math.PI / 2, true);
  wall(D, new THREE.Vector3(ROOM.x1, 0, 0), -Math.PI / 2, true);
  buildStreetWall(group, stuccoMat);
  // The majolica backsplash behind the counter.
  const benchLen = BENCH.x1 - BENCH.x0;
  const splashH = 0.82;
  const splash = plane(benchLen, splashH, majolicaMat, 0.6);
  splash.position.set((BENCH.x0 + BENCH.x1) / 2, BENCH.top + splashH / 2, ROOM.z0 + 0.006);
  group.add(splash);

  // The marble counter along the back wall, majolica on its front.
  const marbleTex = await photoOr(base, 't-marble', () => marble());
  const benchDepth = BENCH.z1 - BENCH.z0;
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(benchLen, 0.045, benchDepth, 2, 0.008),
    new THREE.MeshPhysicalMaterial({ map: marbleTex, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.18 }),
  );
  top.position.set((BENCH.x0 + BENCH.x1) / 2, BENCH.top - 0.0225, (BENCH.z0 + BENCH.z1) / 2);
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);
  const front = plane(benchLen, BENCH.top - 0.045, majolicaMat, 0.6);
  front.position.set((BENCH.x0 + BENCH.x1) / 2, (BENCH.top - 0.045) / 2, BENCH.z1 - 0.03);
  group.add(front);
  const sides = new THREE.Mesh(new THREE.BoxGeometry(benchLen - 0.02, BENCH.top - 0.045, benchDepth - 0.06), new THREE.MeshStandardMaterial({ color: '#d8cfc0' }));
  sides.position.set(top.position.x, (BENCH.top - 0.045) / 2, top.position.z - 0.02);
  group.add(sides);
  // A dark plinth at the foot of the counter.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(benchLen, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.6 }));
  plinth.position.set(top.position.x, 0.04, BENCH.z1 - 0.02);
  group.add(plinth);

  // The spianatoia (oak work board) where the pizza is made.
  const boardTex = await photoOr(base, 't-bench', () => oakBoard());
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.028, 0.62, 3, 0.006), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.78 }));
  board.position.set(BOARD_SPOT.x, BENCH.top + 0.014, BOARD_SPOT.z);
  board.receiveShadow = true;
  board.castShadow = true;
  board.name = 'board';
  group.add(board);

  // Light: a low warm fill, enamel pendants over the counter and the tables, the street's blue outside.
  // Lite drops the accent lights; a little more fill makes up for them.
  const hemi = new THREE.HemisphereLight('#ffe2bf', '#3a2618', LITE ? 0.26 : 0.16);
  group.add(hemi);
  const street = new THREE.DirectionalLight('#8fa6d8', 0.3);
  street.position.set(-1, 3, 8);
  if (!LITE) group.add(street);
  const bulbs: THREE.PointLight[] = [];
  const cordMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 });
  const enamelOut = new THREE.MeshPhysicalMaterial({ color: '#2f5a43', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const enamelIn = new THREE.MeshStandardMaterial({ color: '#f6f0e2', roughness: 0.35, side: THREE.BackSide, emissive: '#ffd9a0', emissiveIntensity: 0.25 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b8902e', metalness: 0.9, roughness: 0.3 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf8a', emissiveIntensity: 8 });
  const shadeGeo = new THREE.LatheGeometry(
    Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return new THREE.Vector2(0.03 + Math.pow(t, 1.6) * 0.16, -t * 0.12);
    }),
    40,
  );
  const pendant = (x: number, z: number, drop: number): THREE.Vector3 => {
    const y = ROOM.h - drop;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 6), cordMat);
    cord.position.set(x, ROOM.h - drop / 2, z);
    group.add(cord);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.04, 16), brass);
    cap.position.set(x, y + 0.01, z);
    group.add(cap);
    const shade = new THREE.Mesh(shadeGeo, enamelOut);
    shade.position.set(x, y, z);
    shade.castShadow = true;
    group.add(shade);
    const inner = new THREE.Mesh(shadeGeo, enamelIn);
    inner.position.set(x, y - 0.001, z);
    inner.scale.setScalar(0.985);
    group.add(inner);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), bulbMat);
    bulb.position.set(x, y - 0.07, z);
    group.add(bulb);
    return new THREE.Vector3(x, y - 0.09, z);
  };
  const benchLampPos = pendant(BOARD_SPOT.x, BOARD_SPOT.z + 0.1, 1.15);
  const pendantSpot = new THREE.SpotLight('#ffd9a8', 4.2, 4, 0.95, 0.65, 1.6);
  pendantSpot.position.copy(benchLampPos);
  pendantSpot.target.position.set(BOARD_SPOT.x, BENCH.top, BOARD_SPOT.z);
  pendantSpot.castShadow = true;
  pendantSpot.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
  pendantSpot.shadow.bias = -0.0004;
  pendantSpot.shadow.normalBias = 0.002;
  pendantSpot.shadow.camera.near = 0.3;
  pendantSpot.shadow.camera.far = 3;
  pendantSpot.shadow.radius = 3;
  group.add(pendantSpot, pendantSpot.target);
  pendant(1.75, BOARD_SPOT.z + 0.1, 1.15);
  // Over the two tables and the till (all clear of the dining-room view).
  for (const [x, z] of [
    [-1.9, 1.4],
    [-0.4, 1.6],
    [2.45, 1.45],
  ]) {
    const p = pendant(x, z, 1.25);
    const l = new THREE.PointLight('#ffc98a', 2.4, 5, 1.9);
    l.position.copy(p);
    group.add(l);
    bulbs.push(l);
  }
  // The second counter lamp lights the shelves and the dough boxes.
  const shelfLight = new THREE.SpotLight('#ffd2a0', 3, 4, 1.0, 0.7, 1.7);
  shelfLight.position.set(1.75, ROOM.h - 1.25, BOARD_SPOT.z + 0.1);
  shelfLight.target.position.set(2.0, BENCH.top, -2.3);
  if (!LITE) group.add(shelfLight, shelfLight.target);

  return { group, board, pendantSpot, lights: { bulbs, hemi, street }, hot };
}

/** The street wall, with the shop door and the big window cut out of it. */
function buildStreetWall(group: THREE.Group, mat: THREE.Material): void {
  const z = ROOM.z1;
  const shape = new THREE.Shape();
  shape.moveTo(ROOM.x0, 0);
  shape.lineTo(ROOM.x1, 0);
  shape.lineTo(ROOM.x1, ROOM.h);
  shape.lineTo(ROOM.x0, ROOM.h);
  shape.closePath();
  const door = new THREE.Path();
  door.moveTo(DOOR.x - DOOR.w / 2, 0.001);
  door.lineTo(DOOR.x + DOOR.w / 2, 0.001);
  door.lineTo(DOOR.x + DOOR.w / 2, DOOR.h);
  door.lineTo(DOOR.x - DOOR.w / 2, DOOR.h);
  door.closePath();
  const win = new THREE.Path();
  win.moveTo(WINDOW.x - WINDOW.w / 2, WINDOW.y0);
  win.lineTo(WINDOW.x + WINDOW.w / 2, WINDOW.y0);
  win.lineTo(WINDOW.x + WINDOW.w / 2, WINDOW.y1);
  win.lineTo(WINDOW.x - WINDOW.w / 2, WINDOW.y1);
  win.closePath();
  shape.holes.push(door, win);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.5, uv.getY(i) / 1.5);
  const wall = new THREE.Mesh(geo, mat);
  wall.position.z = z;
  wall.receiveShadow = true;
  wall.name = 'street-wall';
  group.add(wall);
}
