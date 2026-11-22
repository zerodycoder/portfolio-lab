import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvas, colorTex, loadImage } from '../lib/canvas';
import { rng } from '../lib/rand';
import { CLASSICS } from '../pizza/catalog';
import { BENCH, DOOR, ROOM, WINDOW } from './room';
import { chalkboard } from './textures';

/**
 * Everything that makes the room a Neapolitan pizzeria: the chalkboard menu, shelves of San Marzano tins and
 * olive oil, the dough boxes (whose balls rise with the real clock), straw-covered fiaschi, a ristra of red horns
 * for luck, the family photos, the radio, the till, tables with checked cloths, and the alley outside the window.
 * Each place a visitor can tap carries a named anchor for its hotspot.
 */

export type Props = {
  group: THREE.Group;
  anchors: Record<string, THREE.Vector3>;
  doughBalls: THREE.Mesh[];
  radio: THREE.Object3D;
  photos: THREE.Mesh[];
};

const std = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });

function label(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const { c, g } = canvas(w, h);
  draw(g);
  return colorTex(c);
}

function tin(): THREE.Group {
  const g = new THREE.Group();
  const tex = label(256, 128, (x) => {
    x.fillStyle = '#c8341e';
    x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#f4d35e';
    x.fillRect(0, 18, 256, 10);
    x.fillRect(0, 100, 256, 10);
    x.fillStyle = '#fff6e0';
    x.font = '700 30px "Fraunces Variable", Georgia, serif';
    x.textAlign = 'center';
    x.fillText('POMODORO', 128, 62);
    x.font = 'italic 20px "Fraunces Variable", Georgia, serif';
    x.fillText('San Marzano DOP', 128, 88);
    x.fillStyle = '#3f8a35';
    x.beginPath();
    x.ellipse(40, 64, 12, 6, 0.4, 0, Math.PI * 2);
    x.fill();
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 24, 1, true), std({ map: tex, roughness: 0.5 }));
  body.position.y = 0.065;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), std({ color: '#b9bec2', metalness: 0.8, roughness: 0.35 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.13;
  g.add(body, top);
  return g;
}

function oilTin(): THREE.Group {
  const g = new THREE.Group();
  const tex = label(256, 256, (x) => {
    x.fillStyle = '#2f6b3a';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#e9c34f';
    x.lineWidth = 8;
    x.strokeRect(14, 14, 228, 228);
    x.fillStyle = '#f2e6c8';
    x.font = 'italic 700 34px "Fraunces Variable", Georgia, serif';
    x.textAlign = 'center';
    x.fillText('Olio', 128, 110);
    x.font = '600 20px "Fraunces Variable", Georgia, serif';
    x.fillText('EXTRAVERGINE', 128, 146);
    x.fillText('DI OLIVA', 128, 172);
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.08), std({ map: tex, roughness: 0.45, metalness: 0.2 }));
  box.position.y = 0.1;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), std({ color: '#e9c34f', metalness: 0.7, roughness: 0.3 }));
  cap.position.set(0.03, 0.21, 0);
  g.add(box, cap);
  return g;
}

/** A fiasco: round-bellied Chianti-style bottle in a straw jacket. */
function fiasco(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * 0.3;
    const r = t < 0.55 ? 0.085 * Math.sin(Math.min(1, (t + 0.05) / 0.55) * Math.PI * 0.62 + 0.4) : 0.017 + (1 - t) * 0.03;
    pts.push(new THREE.Vector2(Math.max(0.012, r), y));
  }
  const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), std({ color: '#2d4a24', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.88 }));
  const straw = new THREE.Mesh(
    new THREE.LatheGeometry(pts.slice(0, 11).map((p) => new THREE.Vector2(p.x + 0.003, p.y)), 24),
    std({ map: label(128, 128, (x) => {
      x.fillStyle = '#c9a25e';
      x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 128; i += 3) {
        x.fillStyle = i % 6 ? '#b88d48' : '#ddb978';
        x.fillRect(i, 0, 2, 128);
      }
    }), roughness: 0.95 }),
  );
  g.add(glass, straw);
  return g;
}

/** Dough boxes: stacked wooden proofing trays, the top one open with its balls (they rise with the clock). */
function doughBoxes(): { group: THREE.Group; balls: THREE.Mesh[] } {
  const group = new THREE.Group();
  const wood = std({ color: '#b98a55', roughness: 0.75 });
  const balls: THREE.Mesh[] = [];
  const doughMat = std({ color: '#efe3cc', roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const tray = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.4), wood);
    tray.add(base);
    for (const [x, z, w, d] of [
      [0, 0.194, 0.6, 0.012],
      [0, -0.194, 0.6, 0.012],
      [0.294, 0, 0.012, 0.4],
      [-0.294, 0, 0.012, 0.4],
    ]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), wood);
      side.position.set(x, 0.04, z);
      tray.add(side);
    }
    tray.position.y = i * 0.085;
    group.add(tray);
    if (i === 2) {
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), doughMat);
          b.scale.set(1, 0.62, 1);
          b.position.set(-0.18 + c * 0.18, 0.012 + 0.028, -0.09 + r * 0.18);
          b.castShadow = true;
          tray.add(b);
          balls.push(b);
        }
    }
  }
  group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
  return { group, balls };
}

function radio(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.19, 0.13, 3, 0.025), std({ color: '#8d2b20', roughness: 0.4 }));
  body.position.y = 0.095;
  const grille = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.13),
    std({ map: label(128, 128, (x) => {
      x.fillStyle = '#e9dcc0';
      x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#6b5a48';
      for (let i = 6; i < 128; i += 10) for (let j = 6; j < 128; j += 10) x.fillRect(i, j, 4, 4);
    }), roughness: 0.8 }),
  );
  grille.position.set(-0.06, 0.1, 0.066);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24), std({ color: '#f2e6c8', roughness: 0.3 }));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.085, 0.11, 0.068);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), std({ color: '#2a1a12', roughness: 0.4 }));
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0.085, 0.045, 0.07);
  g.add(body, grille, dial, knob);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A string of red horns (cornicelli) for good luck, and garlic. */
function ristra(len: number): THREE.Group {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 6), std({ color: '#6b4a2a' }));
  cord.position.y = -len / 2;
  g.add(cord);
  const red = std({ color: '#c3271a', roughness: 0.35 });
  const r = rng(5);
  for (let i = 0; i < 9; i++) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 10), red);
    horn.position.set((r() - 0.5) * 0.04, -0.06 - i * (len / 10), (r() - 0.5) * 0.04);
    horn.rotation.set(Math.PI + (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
    g.add(horn);
  }
  return g;
}

function table(): THREE.Group {
  const g = new THREE.Group();
  const cloth = label(256, 256, (x) => {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        x.fillStyle = (i + j) % 2 ? '#f4eee3' : '#c8341e';
        x.fillRect(i * 32, j * 32, 32, 32);
      }
    x.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) {
      x.fillStyle = '#f4eee3';
      x.fillRect(i * 32 + 14, 0, 4, 256);
      x.fillRect(0, i * 32 + 14, 256, 4);
    }
  });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 40), std({ map: cloth, roughness: 0.95 }));
  top.position.y = 0.76;
  const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.46, 0.2, 40, 1, true), std({ map: cloth, roughness: 0.95, side: THREE.DoubleSide }));
  drape.position.y = 0.66;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.74, 12), std({ color: '#2a2420', metalness: 0.6, roughness: 0.4 }));
  leg.position.y = 0.37;
  g.add(top, drape, leg);
  for (let i = 0; i < 2; i++) {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), std({ color: '#6b3f22', roughness: 0.7 }));
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.03), std({ color: '#6b3f22', roughness: 0.7 }));
    back.position.set(0, 0.68, -0.17);
    chair.add(seat, back);
    for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 8), std({ color: '#4a2c18' }));
      l.position.set(x, 0.225, z);
      chair.add(l);
    }
    chair.position.set(i ? 0.55 : -0.55, 0, 0);
    chair.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
    g.add(chair);
  }
  const f = fiasco();
  f.scale.setScalar(0.8);
  f.position.set(0.1, 0.775, 0.05);
  g.add(f);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
  return g;
}

function frame(w: number, h: number, sepia: number): THREE.Mesh {
  const tex = label(400, Math.round((400 * h) / w), (x) => {
    // Placeholder "old photo" until the generated one loads: a faded vignette.
    x.fillStyle = `rgb(${200 - sepia * 20},${185 - sepia * 25},${160 - sepia * 30})`;
    x.fillRect(0, 0, 400, 400);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.55 }));
  const border = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.02), std({ color: '#3a2416', roughness: 0.6 }));
  border.position.z = -0.011;
  m.add(border);
  return m;
}

export async function buildProps(base: string): Promise<Props> {
  const group = new THREE.Group();
  group.name = 'props';
  const anchors: Record<string, THREE.Vector3> = {};

  // Chalkboard menu above the counter's left half.
  const W = 1.3;
  const H = 0.95;
  const board = chalkboard(1040, 760, (g) => {
    g.fillStyle = '#f3efe6';
    g.textAlign = 'center';
    g.font = '700 74px "Caveat Variable", cursive';
    g.fillText('Le Pizze', 520, 96);
    g.font = '400 30px "Caveat Variable", cursive';
    g.fillText('impasto 48 ore · forno a legna · 485 °C', 520, 140);
    g.textAlign = 'left';
    CLASSICS.forEach((c, i) => {
      const y = 210 + i * 86;
      g.font = '700 48px "Caveat Variable", cursive';
      g.fillStyle = '#f3efe6';
      g.fillText(c.name, 70, y);
      g.font = '400 27px "Caveat Variable", cursive';
      g.fillStyle = 'rgba(243,239,230,0.7)';
      g.fillText(c.en, 70, y + 32);
      g.textAlign = 'right';
      g.font = '700 44px "Caveat Variable", cursive';
      g.fillStyle = '#f3c96b';
      g.fillText(`€ ${c.price}`, 970, y);
      g.textAlign = 'left';
    });
  });
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std({ map: colorTex(board), roughness: 0.95 }));
  chalk.position.set(0.35, 1.98, ROOM.z0 + 0.02);
  const chalkFrame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, H + 0.08, 0.025), std({ color: '#5a3820', roughness: 0.6 }));
  chalkFrame.position.set(0.35, 1.98, ROOM.z0 + 0.008);
  group.add(chalkFrame, chalk);
  anchors.menu = new THREE.Vector3(0.35, 2.3, ROOM.z0 + 0.1);

  // Shelves on the back wall, right of the menu.
  const shelfMat = std({ color: '#6b4426', roughness: 0.7 });
  for (const y of [1.62, 2.05]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.24), shelfMat);
    shelf.position.set(1.9, y, ROOM.z0 + 0.12);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    group.add(shelf);
  }
  for (let i = 0; i < 6; i++) {
    const t = tin();
    t.position.set(1.42 + i * 0.12 + (i > 2 ? 0.08 : 0), 1.635, ROOM.z0 + 0.12);
    t.rotation.y = i * 0.7;
    group.add(t);
  }
  for (let i = 0; i < 3; i++) {
    const o = oilTin();
    o.position.set(1.5 + i * 0.16, 2.065, ROOM.z0 + 0.12);
    o.rotation.y = (i - 1) * 0.15;
    group.add(o);
  }
  for (let i = 0; i < 3; i++) {
    const f = fiasco();
    f.position.set(2.05 + i * 0.16, 2.065, ROOM.z0 + 0.12);
    f.rotation.z = i === 2 ? 0.05 : 0;
    group.add(f);
  }

  // Dough boxes at the right end of the counter.
  const boxes = doughBoxes();
  boxes.group.position.set(2.25, BENCH.top, -2.12);
  boxes.group.rotation.y = -0.08;
  group.add(boxes.group);
  anchors.lievito = new THREE.Vector3(2.25, BENCH.top + 0.35, -2.05);

  // A ristra of horns and the radio on a small shelf on the right wall.
  const r1 = ristra(0.7);
  r1.position.set(-0.32, ROOM.h - 0.05, ROOM.z0 + 0.18);
  group.add(r1);
  const r2 = ristra(0.55);
  r2.position.set(ROOM.x1 - 0.12, ROOM.h - 0.05, -1.2);
  group.add(r2);
  const radioShelf = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.5), shelfMat);
  radioShelf.position.set(ROOM.x1 - 0.13, 1.55, -0.4);
  group.add(radioShelf);
  const rad = radio();
  rad.position.set(ROOM.x1 - 0.12, 1.565, -0.4);
  rad.rotation.y = -Math.PI / 2;
  group.add(rad);
  anchors.radio = new THREE.Vector3(ROOM.x1 - 0.15, 1.9, -0.4);

  // The family photo wall (left wall).
  const photos: THREE.Mesh[] = [];
  const layout: [number, number, number, number, string][] = [
    [0.15, 1.75, 0.62, 0.42, 'p-1958'],
    [0.95, 1.6, 0.5, 0.34, 'p-street'],
    [0.6, 1.1, 0.46, 0.32, 'p-family'],
  ];
  layout.forEach(([z, y, w, h, name], i) => {
    const f = frame(w, h, i);
    f.position.set(ROOM.x0 + 0.03, y, z);
    f.rotation.y = Math.PI / 2;
    f.userData.photo = name;
    group.add(f);
    photos.push(f);
  });
  await Promise.all(
    photos.map(async (f) => {
      const img = await loadImage(`${base}media/photos/${f.userData.photo as string}.webp`);
      if (!img) return;
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      (f.material as THREE.MeshStandardMaterial).map = t;
      (f.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }),
  );
  anchors.famiglia = new THREE.Vector3(ROOM.x0 + 0.1, 2.08, 0.6);

  // Tables by the window.
  const t1 = table();
  t1.position.set(-1.9, 0, 1.4);
  group.add(t1);
  const t2 = table();
  t2.position.set(-0.4, 0, 1.6);
  t2.rotation.y = 0.6;
  group.add(t2);

  // The till counter by the door.
  const till = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.0, 0.55, 2, 0.02), std({ color: '#8d2b20', roughness: 0.55 }));
  till.position.set(2.45, 0.5, 1.2);
  till.castShadow = true;
  till.receiveShadow = true;
  group.add(till);
  const tillTop = new THREE.Mesh(new RoundedBoxGeometry(1.16, 0.04, 0.6, 2, 0.01), std({ color: '#ede6da', roughness: 0.3 }));
  tillTop.position.set(2.45, 1.02, 1.2);
  group.add(tillTop);
  for (let i = 0; i < 5; i++) {
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.4), std({ color: '#cfa978', roughness: 0.9 }));
    pb.position.set(2.65, 1.06 + i * 0.047, 1.2);
    pb.rotation.y = (i % 2 ? 0.05 : -0.04);
    group.add(pb);
  }

  // The alley outside the window and the door.
  const alleyImg = await loadImage(`${base}media/scenes/s-alley.webp`);
  const alleyTex = alleyImg ? Object.assign(new THREE.Texture(alleyImg), { colorSpace: THREE.SRGBColorSpace, needsUpdate: true }) : null;
  const alley = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 5.06),
    new THREE.MeshBasicMaterial({ map: alleyTex ?? undefined, color: alleyTex ? '#9a9aa6' : '#1b2238', toneMapped: false }),
  );
  alley.position.set(-0.2, 1.7, ROOM.z1 + 3.6);
  alley.rotation.y = Math.PI;
  group.add(alley);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW.w, WINDOW.y1 - WINDOW.y0),
    new THREE.MeshStandardMaterial({ color: '#9fb4c8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12 }),
  );
  glass.position.set(WINDOW.x, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.z1 + 0.15);
  group.add(glass);
  // Window frame bars.
  const barMat = std({ color: '#2f4f3a', roughness: 0.5 });
  for (const x of [-WINDOW.w / 2, 0, WINDOW.w / 2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, WINDOW.y1 - WINDOW.y0, 0.06), barMat);
    bar.position.set(WINDOW.x + x, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.z1 + 0.15);
    group.add(bar);
  }
  for (const y of [WINDOW.y0, WINDOW.y1, (WINDOW.y0 + WINDOW.y1) / 2 + 0.2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(WINDOW.w + 0.05, 0.05, 0.06), barMat);
    bar.position.set(WINDOW.x, y, ROOM.z1 + 0.15);
    group.add(bar);
  }
  // The open door: a green door swung inwards.
  const door = new THREE.Mesh(new THREE.BoxGeometry(DOOR.w * 0.98, DOOR.h * 0.98, 0.05), std({ color: '#2f5a43', roughness: 0.55 }));
  door.geometry.translate(DOOR.w / 2, DOOR.h / 2, 0);
  door.position.set(DOOR.x - DOOR.w / 2, 0, ROOM.z1 - 0.02);
  door.rotation.y = -1.9;
  group.add(door);

  anchors.banco = new THREE.Vector3(0.62, BENCH.top + 0.32, -2.0);
  anchors.forno = new THREE.Vector3(-1.55, 1.9, -1.4);
  return { group, anchors, doughBalls: boxes.balls, radio: rad, photos };
}
