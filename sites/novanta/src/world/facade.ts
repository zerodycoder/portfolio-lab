import * as THREE from 'three';
import { canvas, colorTex, dataTex } from '../lib/canvas';
import { rng } from '../lib/rand';
import { DOOR, ROOM, WINDOW } from './room';
import { cobbles, stucco } from './textures';

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
  // Corrugated slats.
  for (let y = 0; y < h; y += 16) {
    const grad = g.createLinearGradient(0, y, 0, y + 16);
    grad.addColorStop(0, '#9aa0a3');
    grad.addColorStop(0.45, '#c9ced0');
    grad.addColorStop(0.55, '#7d8386');
    grad.addColorStop(1, '#a6acaf');
    g.fillStyle = grad;
    g.fillRect(0, y, w, 16);
  }
  // Dirt and rust streaks.
  const r = rng(8);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${90 + r() * 40},${60 + r() * 20},${40},${r() * 0.12})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 10, 20 + r() * 140);
  }
  // Hand-painted sign.
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

export function buildFacade(): Facade {
  const group = new THREE.Group();
  group.name = 'facade';
  const std = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

  // The front wall (outside face) with the shopfront and upstairs windows cut out.
  const wallTex = colorTex(stucco(512, [206, 150, 96]), [1, 1]);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  const shape = new THREE.Shape();
  shape.moveTo(-4.5, 0);
  shape.lineTo(4.5, 0);
  shape.lineTo(4.5, 7.5);
  shape.lineTo(-4.5, 7.5);
  shape.closePath();
  const shop = new THREE.Path();
  shop.moveTo(FRONT_X0, 0.001);
  shop.lineTo(FRONT_X1, 0.001);
  shop.lineTo(FRONT_X1, FRONT_TOP);
  shop.lineTo(FRONT_X0, FRONT_TOP);
  shop.closePath();
  shape.holes.push(shop);
  const upWins: [number, number][] = [
    [-2.2, 4.3],
    [-0.4, 4.3],
    [1.4, 4.3],
    [3.1, 4.3],
  ];
  upWins.forEach(([x, y]) => {
    const p = new THREE.Path();
    p.moveTo(x - 0.45, y - 0.85);
    p.lineTo(x + 0.45, y - 0.85);
    p.lineTo(x + 0.45, y + 0.85);
    p.lineTo(x - 0.45, y + 0.85);
    p.closePath();
    shape.holes.push(p);
  });
  const wallGeo = new THREE.ShapeGeometry(shape);
  const uv = wallGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  const wall = new THREE.Mesh(wallGeo, std({ map: wallTex }));
  wall.position.z = Z + 0.001;
  group.add(wall);

  // Upstairs windows: dark glass behind green persiane, one lit; a balcony with washing across the alley.
  const shutterGreen = std({ color: '#2e5a3f', roughness: 0.7 });
  upWins.forEach(([x, y], i) => {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshStandardMaterial({ color: i === 1 ? '#ffcf8a' : '#141821', emissive: i === 1 ? '#ffb45e' : '#000', emissiveIntensity: i === 1 ? 1.6 : 0, roughness: 0.3 }));
    glass.position.set(x, y, Z - 0.08);
    group.add(glass);
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 0.03), shutterGreen);
      leaf.geometry.translate((s * 0.45) / 2, 0, 0);
      leaf.position.set(x + s * 0.45, y, Z + 0.02);
      leaf.rotation.y = s * (i === 1 ? 1.9 : 1.2);
      group.add(leaf);
    }
  });
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.5), std({ color: '#cfc2ac' }));
  balcony.position.set(-0.4, 3.42, Z + 0.25);
  group.add(balcony);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.02), new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.85 }));
  rail.position.set(-0.4, 3.9, Z + 0.5);
  group.add(rail);

  // Washing on a line across the alley (sways in the night air).
  const clothes: THREE.Mesh[] = [];
  const lineY = 5.6;
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 9, 6), std({ color: '#ddd' }));
  line.rotation.z = Math.PI / 2;
  line.position.set(0, lineY, Z + 2.2);
  group.add(line);
  const colours = ['#f4f1ea', '#c8341e', '#f4f1ea', '#2b5aa8', '#f2d38a', '#f4f1ea', '#2f6b3a'];
  colours.forEach((col, i) => {
    const w = 0.45 + (i % 3) * 0.15;
    const h = 0.6 + (i % 2) * 0.35;
    const g = new THREE.PlaneGeometry(w, h, 6, 6);
    g.translate(0, -h / 2, 0);
    const cl = new THREE.Mesh(g, std({ color: col, side: THREE.DoubleSide, roughness: 0.95 }));
    cl.position.set(-3.2 + i * 1.05, lineY, Z + 2.2);
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

  // The roller shutter.
  const shutterTex = colorTex(shutterArt());
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), FRONT_TOP);
  const shutter = new THREE.Mesh(
    new THREE.PlaneGeometry(FRONT_X1 - FRONT_X0, FRONT_TOP),
    new THREE.MeshStandardMaterial({ map: shutterTex, metalness: 0.55, roughness: 0.45, clippingPlanes: [clip] }),
  );
  shutter.position.set((FRONT_X0 + FRONT_X1) / 2, FRONT_TOP / 2, Z + 0.03);
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
  const lampLight = new THREE.PointLight('#ffb767', 3.2, 9, 1.6);
  lampLight.position.copy(lantern.position).add(new THREE.Vector3(0, -0.1, 0.1));
  group.add(lampLight);
  const shrine = new THREE.Group();
  const niche = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.12), std({ color: '#f1e6cf' }));
  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.4),
    std({ map: (() => {
      const k = canvas(128, 170);
      const grad = k.g.createRadialGradient(64, 70, 5, 64, 80, 90);
      grad.addColorStop(0, '#f6e7b8');
      grad.addColorStop(1, '#2b5aa8');
      k.g.fillStyle = grad;
      k.g.fillRect(0, 0, 128, 170);
      k.g.fillStyle = '#d6a648';
      k.g.beginPath();
      k.g.arc(64, 52, 26, 0, Math.PI * 2);
      k.g.fill();
      return colorTex(k.c);
    })(), emissive: '#3a3020', emissiveIntensity: 0.6 }),
  );
  pic.position.z = 0.062;
  shrine.add(niche, pic);
  const candleMat = new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ff9a3a', emissiveIntensity: 6 });
  for (let i = 0; i < 4; i++) {
    const cnd = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), candleMat);
    cnd.position.set(-0.15 + i * 0.1, -0.3, 0.1);
    shrine.add(cnd);
  }
  shrine.position.set(FRONT_X0 - 0.75, 2.0, Z + 0.06);
  group.add(shrine);
  const shrineLight = new THREE.PointLight('#ffa860', 0.8, 2.5, 1.8);
  shrineLight.position.set(FRONT_X0 - 0.75, 1.7, Z + 0.3);
  group.add(shrineLight);

  // The street and the alley's walls running off.
  const cob = cobbles();
  const cobTex = colorTex(cob.color, [6, 4]);
  cobTex.wrapS = cobTex.wrapT = THREE.RepeatWrapping;
  const cobRough = dataTex(cob.rough, [6, 4]);
  cobRough.wrapS = cobRough.wrapT = THREE.RepeatWrapping;
  const street = new THREE.Mesh(new THREE.PlaneGeometry(9, 10), std({ map: cobTex, roughnessMap: cobRough, roughness: 1, metalness: 0.15 }));
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, 0.001, Z + 5);
  street.receiveShadow = true;
  group.add(street);
  const sideTex = colorTex(stucco(512, [178, 120, 92]), [2, 3]);
  sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.5), std({ map: sideTex }));
    side.position.set(s * 4.5, 3.75, Z + 5);
    side.rotation.y = -s * Math.PI / 2;
    group.add(side);
  }
  const moon = new THREE.DirectionalLight('#7f95c9', 0.5);
  moon.position.set(-3, 9, 12);
  moon.target.position.set(0, 0, Z);
  group.add(moon, moon.target);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ color: '#0f1830' }));
  sky.position.set(0, 9, Z - 0.5);
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
  matC.g.fillStyle = '#2a1a10';
  matC.g.font = '800 120px "Fraunces Variable", Georgia, serif';
  matC.g.textAlign = 'center';
  matC.g.textBaseline = 'middle';
  matC.g.fillText('CIAO', 256, 165);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.015, 0.5), new THREE.MeshStandardMaterial({ map: colorTex(matC.c), roughness: 1 }));
  mat.position.set(0, 0.0075, 0.1);
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
  light.shadow.mapSize.set(1024, 1024);
  group.add(light, light.target);
  group.add(new THREE.HemisphereLight('#ffe2bf', '#2a1a10', 0.35));
  return { group, spot: new THREE.Vector3(30, 0.016, 0.1) };
}
