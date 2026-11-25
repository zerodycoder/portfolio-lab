import * as THREE from 'three';
import { canvas, colorTex, shrink } from '../lib/canvas';
import { rng } from '../lib/rand';
import { DOOR, ROOM, WINDOW } from './room';
import { pbr } from './pbr';
import { buildNeighbour, dressWindow, mergeByMaterial, plinthAndBand, wallShape, wallSkin, windowMats, type Tick, type WinSpec } from './buildings';
import { Garden, PALETTES, buildScooter, buildShrine, wallLantern, wallPapers } from './street';
import { LITE } from '../lib/quality';

/**
 * The street at night: the shop's front in weathered ochre stucco, a painted sign, a wall lantern, a little
 * street shrine with candles, green shutters and a line of washing across the alley upstairs, wet cobbles.
 * The roller shutter (serranda) covers the shopfront until the visitor drags it up.
 */

export type Facade = {
  group: THREE.Group;
  shutter: THREE.Mesh;
  /** 0 closed … 1 rolled up. */
  setOpen(k: number): void;
  update(dt: number, t: number): void;
};

const Z = ROOM.z1 + 0.3;
const FRONT_X0 = WINDOW.x - WINDOW.w / 2 - 0.12;
const FRONT_X1 = DOOR.x + DOOR.w / 2 + 0.12;
const FRONT_TOP = 2.56;

function shutterArt(): HTMLCanvasElement {
  const w = 1024;
  const h = 640;
  const { c, g } = canvas(w, h);
  // Hand-painted sign (transparent around it: the metal shows through).
  void rng;
  g.fillStyle = 'rgba(176,40,24,0.92)';
  g.font = '800 150px "Fraunces Variable", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NOVANTA', w / 2, 250);
  g.fillStyle = 'rgba(245,238,225,0.9)';
  g.font = 'italic 600 54px "Fraunces Variable", Georgia, serif';
  g.fillText('Pizzeria napoletana', w / 2, 360);
  g.font = '700 34px "Courier Prime", monospace';
  g.fillText('DAL 1958 · FORNO A LEGNA', w / 2, 430);
  g.strokeStyle = 'rgba(176,40,24,0.9)';
  g.lineWidth = 6;
  g.strokeRect(150, 150, w - 300, 320);
  // Worn paint: the ribs of the shutter scuff it in horizontal lines.
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < h; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + 11, w, 3);
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1 + Math.random() * 3);
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

function signArt(): HTMLCanvasElement {
  const { c, g } = canvas(1024, 200);
  g.fillStyle = '#1e3b2c';
  g.fillRect(0, 0, 1024, 200);
  g.strokeStyle = '#d6a648';
  g.lineWidth = 8;
  g.strokeRect(14, 14, 996, 172);
  g.fillStyle = '#f2d38a';
  g.font = '800 104px "Fraunces Variable", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N O V A N T A', 512, 92);
  g.font = 'italic 500 34px "Fraunces Variable", Georgia, serif';
  g.fillText('pizzeria · forno a legna', 512, 160);
  return c;
}

export async function buildFacade(base: string): Promise<Facade> {
  const group = new THREE.Group();
  group.name = 'facade';
  const std = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

  // Scanned surfaces: Neapolitan ochre plaster, an older weathered plaster for the neighbours, basalt paving,
  // a steel roller shutter.
  // (The weathered plaster scan, tinted ochre, reads as Naples; the cracked "ochre" scan has panel seams that
  // read as boards at this scale.)
  const [ochre, oldPlaster, basalt, metal] = await Promise.all([
    pbr(base, 'oldplaster', { color: '#f6c98c' }),
    pbr(base, 'stucco', { color: '#d9a58a' }),
    pbr(base, 'basalt', { color: '#9a9aa2', normal: 1.2 }),
    pbr(base, 'shutter', { color: '#c8ccd0' }),
  ]);
  // The front wall (outside face) with the shopfront and the windows of two upper floors cut out. Each window has
  // its own life: a dark room behind lace, the lit balcony door, a television's blue flicker, shutters closed with
  // lamplight in the slats.
  const WALL_H = 7.5;
  const upWins: WinSpec[] = [
    { x: -2.2, y: 4.3, w: 0.9, h: 1.7, kind: 'dark' },
    { x: -0.4, y: 4.3, w: 0.9, h: 1.7, kind: 'lit' },
    { x: 1.4, y: 4.3, w: 0.9, h: 1.7, kind: 'tv' },
    { x: 3.1, y: 4.3, w: 0.9, h: 1.7, kind: 'glow' },
    { x: -2.2, y: 6.45, w: 0.9, h: 1.4, kind: 'shut' },
    { x: -0.4, y: 6.45, w: 0.9, h: 1.4, kind: 'dark' },
    { x: 1.4, y: 6.45, w: 0.9, h: 1.4, kind: 'glow' },
    { x: 3.1, y: 6.45, w: 0.9, h: 1.4, kind: 'dark' },
  ];
  const shape = wallShape(-4.5, 4.5, WALL_H, [
    { x: (FRONT_X0 + FRONT_X1) / 2, y: 0, w: FRONT_X1 - FRONT_X0, h: FRONT_TOP },
    ...upWins.map((w) => ({ x: w.x, y: w.y - w.h / 2, w: w.w, h: w.h })),
  ]);
  const wallGeo = new THREE.ShapeGeometry(shape);
  const uv = wallGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
  const wall = new THREE.Mesh(wallGeo, ochre);
  wall.receiveShadow = true;
  wall.position.z = Z + 0.001;
  group.add(wall);

  // The windows, dressed (stone surround, sill, painted frame, persiane) and merged into a few draw calls.
  const ticks: Tick[] = [];
  const wMats = windowMats();
  const wr = rng(58);
  const wins = new THREE.Group();
  upWins.forEach((w) => {
    const d = dressWindow(w, Z, wMats, wr);
    wins.add(d.group);
    if (d.tick) ticks.push(d.tick);
  });
  group.add(mergeByMaterial(wins));
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), std({ color: '#cfc2ac' }));
  balcony.position.set(-0.4, 3.42, Z + 0.25);
  group.add(balcony);
  // Wrought-iron railing: a top bar and thin uprights.
  const iron = new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.6, roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.03), iron);
  top.position.set(-0.4, 4.32, Z + 0.48);
  group.add(top);
  for (let k = 0; k <= 14; k++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.86, 0.012), iron);
    bar.position.set(-1.1 + k * 0.1, 3.88, Z + 0.48);
    group.add(bar);
  }

  // Washing on a line strung between two iron arms off the wall, between the floors (sways in the night air).
  const clothes: THREE.Mesh[] = [];
  const lineY = 5.5;
  const lineZ = Z + 0.7;
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 6.4, 6), std({ color: '#ddd' }));
  line.rotation.z = Math.PI / 2;
  line.position.set(0.3, lineY, lineZ);
  group.add(line);
  const ironArm = std({ color: '#1b1b1b', metalness: 0.6, roughness: 0.5 });
  for (const ax of [-2.9, 3.5]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.74), ironArm);
    arm.position.set(ax, lineY + 0.01, Z + 0.36);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.62), ironArm);
    brace.position.set(ax, lineY - 0.2, Z + 0.28);
    brace.rotation.x = 0.62;
    group.add(arm, brace);
  }
  // Small things (shirts, tea towels, a vest) with gaps between them, so the windows behind still show.
  const colours = ['#f4f1ea', '#c8341e', '#f4f1ea', '#2b5aa8', '#f2d38a', '#f4f1ea', '#2f6b3a', '#e7b7c4', '#f4f1ea'];
  colours.forEach((col, i) => {
    const w = 0.26 + (i % 3) * 0.08;
    const h = 0.32 + ((i * 7) % 3) * 0.13;
    const g = new THREE.PlaneGeometry(w, h, 6, 6);
    g.translate(0, -h / 2, 0);
    const cl = new THREE.Mesh(g, std({ color: col, side: THREE.DoubleSide, roughness: 0.95 }));
    cl.position.set(-2.62 + i * 0.73 + ((i * 13) % 5) * 0.03, lineY, lineZ);
    cl.userData.base = (g.getAttribute('position') as THREE.BufferAttribute).array.slice();
    group.add(cl);
    clothes.push(cl);
  });

  // The sign over the shopfront.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(FRONT_X1 - FRONT_X0 + 0.3, 0.5, 0.06), [
    std({ color: '#1e3b2c' }),
    std({ color: '#1e3b2c' }),
    std({ color: '#1e3b2c' }),
    std({ color: '#1e3b2c' }),
    std({ map: colorTex(signArt()), roughness: 0.6 }),
    std({ color: '#1e3b2c' }),
  ]);
  sign.position.set((FRONT_X0 + FRONT_X1) / 2, FRONT_TOP + 0.42, Z + 0.05);
  group.add(sign);
  // Two gooseneck lamps over the sign wash the shutter in warm light, as on every shopfront in the old town.
  const goose = new THREE.MeshStandardMaterial({ color: '#1e2a22', metalness: 0.6, roughness: 0.45 });
  const lampBulb = new THREE.MeshStandardMaterial({ color: '#fff0d0', emissive: '#ffd08a', emissiveIntensity: 6 });
  for (const fx of [0.22, 0.78]) {
    const x = FRONT_X0 + (FRONT_X1 - FRONT_X0) * fx;
    const neck = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.22, 0.05), new THREE.Vector3(0, 0.12, 0.38)), 16, 0.012, 8),
      goose,
    );
    neck.position.set(x, FRONT_TOP + 0.67, Z + 0.06);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.08, 20, 1, true), goose);
    shade.position.set(x, FRONT_TOP + 0.77, Z + 0.44);
    shade.rotation.x = -0.5;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), lampBulb);
    bulb.position.set(x, FRONT_TOP + 0.74, Z + 0.46);
    group.add(neck, shade, bulb);
    const wash = new THREE.SpotLight('#ffcf90', 6, 5, 0.75, 0.8, 1.4);
    wash.position.set(x, FRONT_TOP + 0.72, Z + 0.5);
    wash.target.position.set(x, 0.9, Z);
    if (!LITE) group.add(wash, wash.target);
  }

  // The roller shutter.
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), FRONT_TOP);
  const shutterGeo = new THREE.PlaneGeometry(FRONT_X1 - FRONT_X0, FRONT_TOP);
  const suv = shutterGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < suv.count; i++) suv.setXY(i, (suv.getX(i) * (FRONT_X1 - FRONT_X0)) / 1.2, (suv.getY(i) * FRONT_TOP) / 1.2);
  const shutterMat = metal.clone();
  shutterMat.clippingPlanes = [clip];
  const shutter = new THREE.Mesh(shutterGeo, shutterMat);
  shutter.position.set((FRONT_X0 + FRONT_X1) / 2, FRONT_TOP / 2, Z + 0.03);
  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(FRONT_X1 - FRONT_X0, FRONT_TOP),
    new THREE.MeshStandardMaterial({ map: colorTex(shrink(shutterArt(), LITE ? 0.5 : 1)), transparent: true, roughness: 0.6, clippingPlanes: [clip], polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  paint.position.z = 0.002;
  shutter.add(paint);
  group.add(shutter);
  const rollBox = new THREE.Mesh(new THREE.BoxGeometry(FRONT_X1 - FRONT_X0 + 0.1, 0.2, 0.2), std({ color: '#7d8386', metalness: 0.6, roughness: 0.4 }));
  rollBox.position.set((FRONT_X0 + FRONT_X1) / 2, FRONT_TOP + 0.08, Z + 0.1);
  group.add(rollBox);

  // The lantern and the shrine.
  const lantern = new THREE.Group();
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45e', emissiveIntensity: 5 }));
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.7, roughness: 0.5, wireframe: true }));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.4), std({ color: '#1b1b1b', metalness: 0.7 }));
  arm.position.z = -0.2;
  lantern.add(glow, cage, arm);
  lantern.position.set(FRONT_X1 + 0.55, 3.05, Z + 0.42);
  group.add(lantern);
  // In lite the lantern also stands in for the sign's wash lights.
  const lampLight = new THREE.PointLight('#ffb767', LITE ? 4.6 : 3.2, 9, 1.6);
  lampLight.position.copy(lantern.position).add(new THREE.Vector3(0, -0.1, 0.1));
  group.add(lampLight);
  // Plants are collected as instances across the whole street, then built at the end.
  const garden = new Garden(17);
  const shrine = buildShrine(garden, new THREE.Vector3(FRONT_X0 - 0.75, 1.62, Z + 0.01));
  group.add(shrine.group);
  ticks.push(shrine.tick);
  const shrineLight = new THREE.PointLight('#ffa860', 0.9, 2.5, 1.8);
  shrineLight.position.set(FRONT_X0 - 0.75, 1.75, Z + 0.35);
  if (!LITE) group.add(shrineLight);
  // A second lantern on the left, over the shrine.
  const lanternL = wallLantern(FRONT_X0 - 0.55, 3.05, Z, 2.6);
  group.add(lanternL.group);
  ticks.push(lanternL.tick);

  // The wall's age, its stone plinth and the band between the floors.
  const plinthMat = basalt.clone();
  plinthMat.color.set('#8a8681');
  plinthMat.roughness = 0.75;
  group.add(plinthAndBand(-4.5, 4.5, Z, [[FRONT_X0, FRONT_X1]], plinthMat, 3.31));
  group.add(
    wallSkin(
      shape,
      -4.5,
      4.5,
      WALL_H,
      Z,
      31,
      [
        [-3.9, 4.5, 0.22],
        [-1.3, 5.45, 0.16],
        [3.95, 5.7, 0.24],
        [-4.05, 2.6, 0.13],
      ],
      [...upWins.map((w) => [w.x, w.y - w.h / 2 - 0.05] as [number, number]), [-0.4, 3.39]],
    ),
  );
  // Posters, the street's marble plate, and the shop's number (90: novanta) on a majolica tile by the door.
  group.add(
    wallPapers(Z, [
      { kind: 'festa', x: -3.72, y: 1.33, w: 0.42, rot: 0.03 },
      { kind: 'affittasi', x: -4.18, y: 1.12, w: 0.28, rot: -0.05 },
      { kind: 'concerto', x: 3.55, y: 1.36, w: 0.4, rot: -0.04 },
      { kind: 'plaque', x: 4.0, y: 2.45, w: 0.56 },
      { kind: 'tile', x: 2.05, y: 2.25, w: 0.17 },
    ]),
  );

  // Flowers: geraniums in the window boxes (set forward where the persiane are shut), pots on the balcony with
  // ivy over its edge, pots under the shrine, a lemon tree by the door.
  const { REDS, PINKS, CORAL, WHITES } = PALETTES;
  const boxes: [number, string[]][] = [[0, REDS], [2, CORAL], [3, PINKS], [4, REDS], [5, WHITES], [6, PINKS]];
  for (const [i, pal] of boxes) {
    const w = upWins[i];
    const shut = w.kind === 'shut' || w.kind === 'glow';
    garden.trough(w.x, w.y - w.h / 2, Z + (shut ? 0.16 : 0.07), 0.78, pal);
  }
  garden.potOfGeraniums(-0.98, 3.45, Z + 0.3, 0.09, 0.17, PINKS);
  garden.potOfGeraniums(0.18, 3.45, Z + 0.3, 0.09, 0.17, REDS);
  garden.ivy(-1.05, 0.25, 3.4, Z + 0.5, 9, 0.08, 0.26);
  garden.potOfGeraniums(-3.68, 0, Z + 0.3, 0.14, 0.28, REDS);
  garden.potOfGeraniums(-3.27, 0, Z + 0.24, 0.1, 0.22, WHITES);
  garden.potOfGeraniums(-4.08, 0, Z + 0.3, 0.12, 0.34, PINKS);
  garden.lemonTree(2.38, Z + 0.45);
  garden.potOfGeraniums(2.92, 0, Z + 0.28, 0.12, 0.26, CORAL);

  // A scooter parked in front of the shop window, clear of the way in to the door. On a wide screen it stands left
  // of the gate's buttons, nose to the left so its legshield and lamp face the street; an upright phone sees a
  // narrower strip, so there it parks nearer the middle, nose towards the door.
  const scooter = buildScooter();
  group.add(scooter);
  let scooterUpright: boolean | null = null;
  const placeScooter = (): void => {
    const upright = innerHeight > innerWidth;
    if (upright === scooterUpright) return;
    scooterUpright = upright;
    if (upright) {
      scooter.position.set(-1.25, 0, Z + 1.0);
      scooter.rotation.y = -0.42;
    } else {
      scooter.position.set(-2.35, 0, Z + 0.95);
      scooter.rotation.y = Math.PI + 0.95;
    }
  };
  placeScooter();

  // The street runs on past the shop both ways: neighbouring houses in other plasters, a step forward from ours.
  const pale = ochre.clone();
  pale.color.set('#f1d9a0');
  const left = buildNeighbour({
    side: -1,
    x0: -4.5,
    x1: -13,
    Z,
    forward: 0.45,
    height: 8.6,
    plaster: oldPlaster,
    plinth: plinthMat,
    windows: [-5.5, -7.4, -9.3].flatMap((x, k) => [
      { x, y: 4.3, w: 0.9, h: 1.7, kind: (['lit', 'dark', 'shut'] as const)[k] },
      { x, y: 6.45, w: 0.9, h: 1.4, kind: (['dark', 'glow', 'dark'] as const)[k] },
    ]),
    door: { x: -8.35, w: 1.5, h: 3.0, kind: 'portone' },
    seed: 11,
    mats: wMats,
  });
  const right = buildNeighbour({
    side: 1,
    x0: 4.5,
    x1: 13,
    Z,
    forward: 0.25,
    height: 7.0,
    plaster: pale,
    plinth: plinthMat,
    windows: [5.45, 7.25, 9.05].flatMap((x, k) => [
      { x, y: 4.1, w: 0.85, h: 1.6, kind: (['dark', 'tv', 'dark'] as const)[k] },
      { x, y: 6.0, w: 0.85, h: 1.3, kind: (['glow', 'dark', 'shut'] as const)[k] },
    ]),
    door: { x: 6.35, w: 1.7, h: 3.1, kind: 'androne' },
    seed: 23,
    mats: wMats,
  });
  group.add(left.group, right.group);
  ticks.push(...left.ticks, ...right.ticks);
  garden.trough(-5.5, 4.3 - 0.85, Z + 0.45 + 0.07, 0.78, REDS);
  garden.trough(-7.4, 6.45 - 0.7, Z + 0.45 + 0.16, 0.78, PINKS);
  garden.trough(5.45, 4.1 - 0.8, Z + 0.25 + 0.07, 0.74, CORAL);
  group.add(garden.build());

  // The street: wet basalt from house to house.
  const streetGeo = new THREE.PlaneGeometry(30, 12);
  const tuv = streetGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, (tuv.getX(i) * 30) / 1.4, (tuv.getY(i) * 12) / 1.4);
  // Wet after the evening rain: the basalt keeps its colour but reflects the lamps.
  const wet = basalt.clone();
  wet.roughness = 0.55;
  wet.envMapIntensity = 1.6;
  const street = new THREE.Mesh(streetGeo, wet);
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, 0.001, Z + 6);
  street.receiveShadow = true;
  group.add(street);
  const moon = new THREE.DirectionalLight('#7f95c9', 0.5);
  moon.position.set(-3, 9, 12);
  moon.target.position.set(0, 0, Z);
  group.add(moon, moon.target);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ color: '#0f1830' }));
  sky.position.set(0, 10, Z - 0.5);
  group.add(sky);

  const setOpen = (k: number): void => {
    const lift = k * (FRONT_TOP + 0.05);
    shutter.position.y = FRONT_TOP / 2 + lift;
  };
  const update = (_dt: number, t: number): void => {
    clothes.forEach((cl, i) => {
      const base = cl.userData.base as Float32Array;
      const pos = cl.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const y = base[v * 3 + 1];
        pos.setZ(v, Math.sin(t * 1.3 + i + base[v * 3] * 3) * 0.06 * -y);
      }
      pos.needsUpdate = true;
    });
    lampLight.intensity = 3.2 * (0.96 + 0.04 * Math.sin(t * 9.0));
    ticks.forEach((f) => f(_dt, t));
    placeScooter();
  };
  return { group, shutter, setOpen, update };
}

/** The doorstep where the pizza arrives: tiles, a doormat, a door, a warm hall light. Placed far from the shop. */
export function buildDoorstep(): { group: THREE.Group; spot: THREE.Vector3 } {
  const group = new THREE.Group();
  group.position.set(30, 0, 0);
  const tileC = canvas(512);
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      tileC.g.fillStyle = (i + j) % 2 ? '#b65a3c' : '#c76a48';
      tileC.g.fillRect(i * 64, j * 64, 64, 64);
      tileC.g.strokeStyle = 'rgba(60,30,20,0.6)';
      tileC.g.strokeRect(i * 64, j * 64, 64, 64);
    }
  const floorTex = colorTex(tileC.c, [3, 3]);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const matC = canvas(512, 320);
  matC.g.fillStyle = '#6b4a2a';
  matC.g.fillRect(0, 0, 512, 320);
  for (let i = 0; i < 2000; i++) {
    matC.g.fillStyle = `rgba(${120 + Math.random() * 40},${80 + Math.random() * 30},${40},0.5)`;
    matC.g.fillRect(Math.random() * 512, Math.random() * 320, 2, 6);
  }
  matC.g.fillStyle = 'rgba(42,26,16,0.85)';
  matC.g.font = 'italic 700 54px "Fraunces Variable", Georgia, serif';
  matC.g.textAlign = 'center';
  matC.g.textBaseline = 'middle';
  matC.g.fillText('Benvenuti', 256, 282);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.015, 0.5), new THREE.MeshStandardMaterial({ map: colorTex(matC.c), roughness: 1 }));
  mat.position.set(0, 0.0075, 0.05);
  mat.receiveShadow = true;
  group.add(mat);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), new THREE.MeshStandardMaterial({ color: '#4a2c1c', roughness: 0.55 }));
  door.position.set(0, 1.1, -0.45);
  group.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: '#d6a648', metalness: 0.9, roughness: 0.25 }));
  knob.position.set(0.38, 1.05, -0.41);
  group.add(knob);
  const light = new THREE.SpotLight('#ffd2a0', 6, 5, 0.7, 0.6, 1.5);
  light.position.set(0.2, 2.4, 0.6);
  light.target.position.set(0, 0, 0.1);
  light.castShadow = true;
  light.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024);
  group.add(light, light.target);
  if (!LITE) group.add(new THREE.HemisphereLight('#ffe2bf', '#2a1a10', 0.35));
  return { group, spot: new THREE.Vector3(30, 0.016, 0.1) };
}
