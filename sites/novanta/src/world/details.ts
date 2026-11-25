import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, colorTex, loadImage } from '../lib/canvas';
import { rng } from '../lib/rand';
import { BENCH, ROOM } from './room';
import { mediaUrl } from '../lib/quality';

/**
 * The small things that make the room lived in: the row of steel topping containers at the back of the counter
 * (filled from the same photographed toppings as the pizza), a tub of San Marzano with its ladle, a sack of flour,
 * a pot of basil, plates and glasses on the tables, a slow ceiling fan, and dust drifting in the lamplight.
 */

type Cell = { x: number; y: number; w: number; h: number };

/** A container's contents: many pieces of one topping, drawn from its photo sheet, packed and overlapping. */
async function fillTexture(base: string, id: string, w = 256, h = 384): Promise<THREE.Texture | null> {
  const meta = await fetch(mediaUrl(base, `toppings/${id}.json`))
    .then((r) => (r.ok ? (r.json() as Promise<{ cells: Cell[] }>) : null))
    .catch(() => null);
  const img = meta ? await loadImage(mediaUrl(base, `toppings/${id}.webp`)) : null;
  if (!meta || !img) return null;
  const { c, g } = canvas(w, h);
  g.fillStyle = '#2a2420';
  g.fillRect(0, 0, w, h);
  const r = rng(id.length * 31);
  const n = 70;
  for (let i = 0; i < n; i++) {
    const cell = meta.cells[Math.floor(r() * meta.cells.length)];
    const s = (0.32 + r() * 0.18) * w;
    g.save();
    g.translate(r() * w, r() * h);
    g.rotate(r() * Math.PI * 2);
    // Pieces lower in the pile are darker (shadowed by the ones above).
    g.filter = `brightness(${0.55 + (i / n) * 0.5})`;
    g.drawImage(img, cell.x, cell.y, cell.w, cell.h, -s / 2, -s / 2, s, s);
    g.restore();
  }
  g.filter = 'none';
  return colorTex(c);
}

function steel(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#c9cdd0', metalness: 0.95, roughness: 0.28 });
}

/** A gastronorm container: four thin walls, a rim, and its contents just under the rim. */
function container(w: number, d: number, h: number, fill: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const m = steel();
  const t = 0.004;
  for (const [x, z, sw, sd] of [
    [0, d / 2, w, t],
    [0, -d / 2, w, t],
    [w / 2, 0, t, d],
    [-w / 2, 0, t, d],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), m);
    wall.position.set(x, -h / 2, z);
    g.add(wall);
  }
  const rim = new THREE.Mesh(new RoundedBoxGeometry(w + 0.02, 0.006, d + 0.02, 2, 0.002), m);
  rim.position.y = 0.001;
  // The rim is a frame: hide its middle with the contents.
  g.add(rim);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w - t, d - t), fill);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0045;
  g.add(top);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.receiveShadow = true) : 0));
  return g;
}

function flourSack(): THREE.Group {
  const g = new THREE.Group();
  const { c, g: x } = canvas(512, 512);
  x.fillStyle = '#e9dfca';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i += 4) {
    x.fillStyle = `rgba(150,130,100,${0.05 + Math.random() * 0.05})`;
    x.fillRect(i, 0, 1, 512);
    x.fillRect(0, i, 512, 1);
  }
  x.fillStyle = '#1f4fa3';
  x.textAlign = 'center';
  x.font = '800 90px "Fraunces Variable", Georgia, serif';
  x.fillText('FARINA', 256, 230);
  x.font = '800 150px "Fraunces Variable", Georgia, serif';
  x.fillStyle = '#c8341e';
  x.fillText('00', 256, 380);
  x.font = 'italic 34px "Fraunces Variable", Georgia, serif';
  x.fillStyle = '#1f4fa3';
  x.fillText('Molino di Napoli · 25 kg', 256, 440);
  const mat = new THREE.MeshStandardMaterial({ map: colorTex(c), roughness: 0.95 });
  // A sack: a squashed rounded box, slumped.
  const geo = new RoundedBoxGeometry(0.42, 0.62, 0.24, 6, 0.09);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + (0.31 - Math.abs(y)) * 0.25;
    pos.setX(i, pos.getX(i) * (y < 0 ? 1.08 : k));
    pos.setZ(i, pos.getZ(i) * (y < 0 ? 1.15 : 1));
  }
  geo.computeVertexNormals();
  const sack = new THREE.Mesh(geo, mat);
  sack.position.y = 0.31;
  sack.rotation.z = 0.06;
  sack.castShadow = true;
  sack.receiveShadow = true;
  g.add(sack);
  return g;
}

async function basilPot(base: string): Promise<THREE.Group> {
  const g = new THREE.Group();
  const pts = Array.from({ length: 8 }, (_, i) => new THREE.Vector2(0.075 + i * 0.005, i * 0.02));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: '#b5603c', roughness: 0.85 }));
  pot.castShadow = true;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), new THREE.MeshStandardMaterial({ color: '#2a1c12', roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.135;
  g.add(soil);
  const meta = await fetch(mediaUrl(base, 'toppings/basilico.json'))
    .then((r) => (r.ok ? (r.json() as Promise<{ cells: Cell[] }>) : null))
    .catch(() => null);
  const img = meta ? await loadImage(mediaUrl(base, 'toppings/basilico.webp')) : null;
  if (!meta || !img) return g;
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const r = rng(9);
  // Leaves on short stems, fanned out in a loose dome.
  for (let i = 0; i < 34; i++) {
    const cell = meta.cells[i % meta.cells.length];
    const geo = new THREE.PlaneGeometry(0.06, 0.06);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (cell.x + uv.getX(k) * cell.w) / W, 1 - (cell.y + (1 - uv.getY(k)) * cell.h) / H);
    const leaf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 }));
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * 0.1;
    const y = 0.16 + r() * 0.17 - rad * 0.6;
    leaf.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    leaf.rotation.set(-Math.PI / 2 + 0.5 + r() * 0.7, a + Math.PI / 2, (r() - 0.5) * 0.8);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

function tableSetting(): THREE.Group {
  const g = new THREE.Group();
  const china = new THREE.MeshPhysicalMaterial({ color: '#f6f2ea', roughness: 0.25, clearcoat: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.9, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.5 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.018, 40), china);
  plate.position.y = 0.009;
  plate.receiveShadow = true;
  g.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.006, 8, 48), new THREE.MeshStandardMaterial({ color: '#1f4fa3', roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.018;
  g.add(rim);
  const tumbler = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 24, 1, true), glass);
  tumbler.position.set(0.2, 0.05, -0.08);
  g.add(tumbler);
  const napkin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.18), new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.95 }));
  napkin.position.set(-0.2, 0.002, 0);
  g.add(napkin);
  return g;
}

export type Details = { group: THREE.Group; update(dt: number, t: number): void };

export async function buildDetails(base: string, tables: THREE.Vector3[]): Promise<Details> {
  const group = new THREE.Group();
  group.name = 'details';

  // The topping row: six gastronorm containers set into the counter at the back, behind the board.
  const fills = ['fiordilatte', 'salame', 'basilico', 'funghi', 'olive', 'pomodorini'];
  const textures = await Promise.all(fills.map((id) => fillTexture(base, id)));
  const cw = 0.14;
  const cd = 0.2;
  fills.forEach((id, i) => {
    const tex = textures[i];
    const fill = tex ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }) : new THREE.MeshStandardMaterial({ color: '#888' });
    const c = container(cw, cd, 0.12, fill);
    c.position.set(1.16 + i * (cw + 0.012), BENCH.top + 0.003, ROOM.z0 + 0.16);
    group.add(c);
    void id;
  });
  // The sauce tub with its ladle, left of the board.
  const sauceTop = new THREE.MeshPhysicalMaterial({ color: '#a8261a', roughness: 0.3, clearcoat: 0.6 });
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.16, 36, 1, true), steel());
  tub.position.set(-0.22, BENCH.top + 0.08, -2.18);
  const sauce = new THREE.Mesh(new THREE.CircleGeometry(0.105, 36), sauceTop);
  sauce.rotation.x = -Math.PI / 2;
  sauce.position.set(-0.22, BENCH.top + 0.14, -2.18);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.36, 10), steel());
  handle.position.set(-0.2, BENCH.top + 0.25, -2.17);
  handle.rotation.z = -0.5;
  group.add(tub, sauce, handle);

  // Flour sack on the floor by the counter's end; a pot of basil on the counter.
  const sack = flourSack();
  sack.position.set(2.85, 0, -1.55);
  sack.rotation.y = -0.6;
  group.add(sack);
  const basil = await basilPot(base);
  basil.position.set(-0.3, BENCH.top, -2.36);
  group.add(basil);

  // Places laid on the tables.
  tables.forEach((p, i) => {
    for (const a of [0.4, Math.PI + 0.4]) {
      const s = tableSetting();
      s.position.set(p.x + Math.cos(a + i) * 0.2, 0.775, p.z + Math.sin(a + i) * 0.2);
      s.rotation.y = -(a + i);
      group.add(s);
    }
  });

  // A ceiling fan over the tables, turning slowly.
  const fan = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#b8902e', metalness: 0.85, roughness: 0.32 });
  const fanWood = new THREE.MeshStandardMaterial({ color: '#6b4426', roughness: 0.6 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 10), brass);
  rod.position.y = -0.175;
  fan.add(rod);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.1, 24), brass);
  hub.position.y = -0.38;
  fan.add(hub);
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.012, 0.13, 2, 0.005), fanWood);
    blade.position.set(0.36, 0, 0);
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * Math.PI * 2;
    blade.rotation.x = 0.12;
    arm.add(blade);
    blades.add(arm);
  }
  blades.position.y = -0.4;
  fan.add(blades);
  fan.position.set(-1.1, ROOM.h - 0.18, 1.5);
  group.add(fan);

  // Dust drifting in the lamplight: tiny motes near the counter lamps and the oven.
  const N = 140;
  const motes = new Float32Array(N * 3);
  const seeds = new Float32Array(N * 3);
  const r = rng(77);
  for (let i = 0; i < N; i++) {
    const near = i % 2 ? [0.62, BENCH.top + 0.6, -1.95] : [1.75, BENCH.top + 0.6, -1.95];
    seeds[i * 3] = near[0] + (r() - 0.5) * 0.9;
    seeds[i * 3 + 1] = near[1] + (r() - 0.5) * 1.0;
    seeds[i * 3 + 2] = near[2] + (r() - 0.5) * 0.6;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  const dot = canvas(32, 32);
  const grad = dot.g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,215,1)');
  grad.addColorStop(1, 'rgba(255,240,215,0)');
  dot.g.fillStyle = grad;
  dot.g.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({ size: 0.006, map: new THREE.CanvasTexture(dot.c), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  dust.frustumCulled = false;
  group.add(dust);

  const update = (dt: number, t: number): void => {
    blades.rotation.y += dt * 1.1;
    for (let i = 0; i < N; i++) {
      const k = i * 0.37;
      motes[i * 3] = seeds[i * 3] + Math.sin(t * 0.13 + k) * 0.06;
      motes[i * 3 + 1] = seeds[i * 3 + 1] + Math.sin(t * 0.09 + k * 1.7) * 0.08 + ((t * 0.01 + k) % 0.2) - 0.1;
      motes[i * 3 + 2] = seeds[i * 3 + 2] + Math.cos(t * 0.11 + k * 0.6) * 0.05;
    }
    (moteGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };
  return { group, update };
}
