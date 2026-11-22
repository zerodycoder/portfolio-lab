import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { colorTex } from '../lib/canvas';
import { cementine, majolica, marble, oakBoard, photoOr, plaster } from './textures';

/**
 * The pizzeria's interior, in metres: the floor is y = 0, the street wall z = +2.5, the back wall z = -2.5,
 * side walls x = ±3.2, ceiling 3.1. The oven stands at the back on the left, the marble counter along the back
 * wall to its right with the work board (spianatoia) on it, the shelves above it.
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

function mat(tex: THREE.Texture | null, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
  if (tex) m.map = tex;
  return m;
}

/** A wall rectangle with UVs in metres (so repeating textures keep their real scale). */
function wallPiece(w: number, h: number, m: THREE.Material, metresPerRepeat: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / metresPerRepeat, (uv.getY(i) * h) / metresPerRepeat);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

export async function buildRoom(base: string): Promise<Room> {
  const group = new THREE.Group();
  group.name = 'room';
  const hot: Record<string, THREE.Object3D> = {};

  const plasterTex = colorTex(plaster(), [1, 1]);
  plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
  const tileTex = colorTex(majolica(), [1, 1]);
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  const floorTex = colorTex(cementine(), [1, 1]);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;

  const plasterMat = mat(plasterTex, { roughness: 0.95 });
  const tileMat = mat(tileTex, { roughness: 0.22, metalness: 0 });
  const floorMat = mat(floorTex, { roughness: 0.6 });

  // Floor
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;
  const floor = wallPiece(W, D, floorMat, 0.8);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
  group.add(floor);

  // Ceiling with chestnut beams
  const ceil = wallPiece(W, D, mat(plasterTex, { color: '#cdbfa8', roughness: 1 }), 2);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.h, 0);
  group.add(ceil);
  const beamMat = mat(null, { color: '#4a3020', roughness: 0.8 });
  for (let z = ROOM.z0 + 0.45; z < ROOM.z1; z += 0.85) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, 0.14), beamMat);
    beam.position.set(0, ROOM.h - 0.08, z);
    group.add(beam);
  }

  // Walls: plaster above, majolica wainscot below.
  const TILE_H = 1.35;
  const addWall = (w: number, pos: THREE.Vector3, rotY: number, tileH = TILE_H): void => {
    const p = wallPiece(w, ROOM.h, plasterMat, 2);
    p.position.copy(pos).setY(ROOM.h / 2);
    p.rotation.y = rotY;
    group.add(p);
    const t = wallPiece(w, tileH, tileMat, 0.6);
    t.position.copy(pos).setY(tileH / 2);
    t.rotation.y = rotY;
    t.translateZ(0.004);
    group.add(t);
    // A glazed cobalt border on top of the tiles.
    const border = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.02), mat(null, { color: '#1f4fa3', roughness: 0.25 }));
    border.position.copy(pos).setY(tileH + 0.025);
    border.rotation.y = rotY;
    border.translateZ(0.01);
    group.add(border);
  };
  addWall(W, new THREE.Vector3(0, 0, ROOM.z0), 0, 1.6);
  addWall(D, new THREE.Vector3(ROOM.x0, 0, 0), Math.PI / 2);
  addWall(D, new THREE.Vector3(ROOM.x1, 0, 0), -Math.PI / 2);
  buildStreetWall(group, plasterMat, tileMat);

  // The marble counter along the back wall
  const marbleTex = await photoOr(base, 't-marble', () => marble());
  const benchLen = BENCH.x1 - BENCH.x0;
  const benchDepth = BENCH.z1 - BENCH.z0;
  const top = new THREE.Mesh(new RoundedBoxGeometry(benchLen, 0.045, benchDepth, 2, 0.008), mat(marbleTex, { roughness: 0.25 }));
  top.position.set((BENCH.x0 + BENCH.x1) / 2, BENCH.top - 0.0225, (BENCH.z0 + BENCH.z1) / 2);
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);
  const front = wallPiece(benchLen, BENCH.top - 0.045, tileMat, 0.6);
  front.position.set((BENCH.x0 + BENCH.x1) / 2, (BENCH.top - 0.045) / 2, BENCH.z1 - 0.03);
  group.add(front);
  const sides = new THREE.Mesh(new THREE.BoxGeometry(benchLen - 0.02, BENCH.top - 0.045, benchDepth - 0.06), mat(null, { color: '#d8cfc0' }));
  sides.position.set(top.position.x, (BENCH.top - 0.045) / 2, top.position.z - 0.02);
  group.add(sides);

  // The spianatoia (oak work board) where the pizza is made
  const boardTex = await photoOr(base, 't-bench', () => oakBoard());
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.028, 0.62, 3, 0.006), mat(boardTex, { roughness: 0.78 }));
  board.position.set(BOARD_SPOT.x, BENCH.top + 0.014, BOARD_SPOT.z);
  board.receiveShadow = true;
  board.castShadow = true;
  board.name = 'board';
  group.add(board);

  // Lights: low warm fill, three bulbs, the street outside the window.
  const hemi = new THREE.HemisphereLight('#ffe2bf', '#3a2618', 0.32);
  group.add(hemi);
  const street = new THREE.DirectionalLight('#8fa6d8', 0.35);
  street.position.set(-1, 3, 8);
  group.add(street);
  const bulbs: THREE.PointLight[] = [];
  const cordMat = mat(null, { color: '#111', roughness: 0.6 });
  const shadeMat = mat(null, { color: '#1d3a2c', roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf8a', emissiveIntensity: 6 });
  const pendant = (x: number, z: number, drop: number): THREE.Vector3 => {
    const y = ROOM.h - drop;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, drop, 6), cordMat);
    cord.position.set(x, ROOM.h - drop / 2, z);
    group.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.14, 28, 1, true), shadeMat);
    shade.position.set(x, y - 0.04, z);
    group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), bulbMat);
    bulb.position.set(x, y - 0.1, z);
    group.add(bulb);
    return new THREE.Vector3(x, y - 0.12, z);
  };
  const benchLampPos = pendant(BOARD_SPOT.x, BOARD_SPOT.z + 0.1, 1.15);
  const pendantSpot = new THREE.SpotLight('#ffd9a8', 3.4, 4, 0.9, 0.6, 1.6);
  pendantSpot.position.copy(benchLampPos);
  pendantSpot.target.position.set(BOARD_SPOT.x, BENCH.top, BOARD_SPOT.z);
  pendantSpot.castShadow = true;
  pendantSpot.shadow.mapSize.set(2048, 2048);
  pendantSpot.shadow.bias = -0.0004;
  pendantSpot.shadow.normalBias = 0.002;
  pendantSpot.shadow.camera.near = 0.3;
  pendantSpot.shadow.camera.far = 3;
  pendantSpot.shadow.radius = 3;
  group.add(pendantSpot, pendantSpot.target);
  for (const [x, z] of [
    [-0.9, 0.6],
    [1.9, 0.9],
  ]) {
    const p = pendant(x, z, 0.75);
    const l = new THREE.PointLight('#ffcf96', 2.6, 7, 1.6);
    l.position.copy(p);
    group.add(l);
    bulbs.push(l);
  }

  return { group, board, pendantSpot, lights: { bulbs, hemi, street }, hot };
}

/** The street wall, with the shop door and the big window cut out of it. */
function buildStreetWall(group: THREE.Group, plasterMat: THREE.Material, tileMat: THREE.Material): void {
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
  // UVs in metres for the plaster.
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  const wall = new THREE.Mesh(geo, plasterMat);
  wall.position.z = z;
  wall.receiveShadow = true;
  wall.name = 'street-wall';
  group.add(wall);
  void tileMat;
}
