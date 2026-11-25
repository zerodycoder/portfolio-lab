import * as THREE from 'three';
import { canvas, colorTex, shrink } from '../lib/canvas';
import { fbm2, hash2 } from '../lib/rand';
import { paint } from '../lib/canvas';
import { LITE } from '../lib/quality';

/**
 * The pizza box: kraft board, printed in tomato red. The walls are hinged on the base, the lid on the back wall,
 * the front flap on the lid; `fold` (0 flat … 1 walls up) and `lid` (0 closed … 1 open) drive it. A sticker on the
 * lid carries the order ticket.
 */

const S = 0.4;
const H = 0.045;

function kraft(w: number, h: number, seed: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const k = canvas(w, h);
  paint(k.g, w, h, (x, y) => {
    const n = fbm2(x / 40 + seed, y / 40, 3, seed);
    const fib = hash2(x, y, seed) > 0.985 ? -18 : 0;
    const v = (n - 0.5) * 18 + fib;
    return [204 + v, 168 + v, 122 + v * 0.9];
  });
  return k;
}

function lidArt(): HTMLCanvasElement {
  const { c, g } = kraft(1024, 1024, 3);
  g.fillStyle = '#b8301c';
  g.strokeStyle = '#b8301c';
  // Border
  g.lineWidth = 10;
  g.strokeRect(40, 40, 944, 944);
  g.lineWidth = 3;
  g.strokeRect(62, 62, 900, 900);
  // The oven: a dome with a flame
  g.lineWidth = 9;
  g.beginPath();
  g.arc(512, 470, 170, Math.PI, 0);
  g.lineTo(682, 520);
  g.lineTo(342, 520);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.moveTo(452, 520);
  g.lineTo(452, 440);
  g.quadraticCurveTo(512, 380, 572, 440);
  g.lineTo(572, 520);
  g.stroke();
  g.beginPath();
  g.moveTo(512, 505);
  g.bezierCurveTo(470, 470, 520, 450, 505, 410);
  g.bezierCurveTo(560, 450, 545, 485, 512, 505);
  g.fill();
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc(512 + Math.cos(Math.PI + (i / 8) * Math.PI) * 150, 470 + Math.sin(Math.PI + (i / 8) * Math.PI) * 150, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = 'center';
  g.font = '800 132px "Fraunces Variable", Georgia, serif';
  g.fillText('NOVANTA', 512, 680);
  g.font = 'italic 500 44px "Fraunces Variable", Georgia, serif';
  g.fillText('Pizzeria napoletana · dal 1958', 512, 745);
  g.font = '400 30px "Courier Prime", monospace';
  g.fillText('48 ORE DI LIEVITO · 90 SECONDI DI FUOCO', 512, 830);
  g.font = 'italic 600 40px "Caveat Variable", cursive';
  g.fillText('Mangiala subito!', 512, 905);
  // Worn print
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  g.globalCompositeOperation = 'destination-over';
  const k = kraft(1024, 1024, 3);
  g.drawImage(k.c, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function sideArt(): HTMLCanvasElement {
  const { c, g } = kraft(1024, 128, 9);
  g.fillStyle = '#b8301c';
  g.font = '700 54px "Fraunces Variable", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NOVANTA · PIZZA NAPOLETANA', 512, 66);
  return c;
}

export type TicketInfo = { name: string; pizza: string; lines: string[]; seconds: number; grade: string; order: number };

function ticketArt(t: TicketInfo): HTMLCanvasElement {
  const { c, g } = canvas(360, 520);
  g.fillStyle = '#fffdf6';
  g.fillRect(0, 0, 360, 520);
  g.fillStyle = '#2b2521';
  g.textAlign = 'center';
  g.font = '700 30px "Courier Prime", monospace';
  g.fillText('NOVANTA', 180, 48);
  g.font = '400 17px "Courier Prime", monospace';
  g.fillText(`ORDINE N° ${String(t.order).padStart(4, '0')}`, 180, 76);
  g.fillText('- - - - - - - - - - - - - -', 180, 98);
  g.font = 'italic 700 24px "Fraunces Variable", Georgia, serif';
  g.fillText(t.pizza, 180, 134);
  g.textAlign = 'left';
  g.font = '400 16px "Courier Prime", monospace';
  t.lines.slice(0, 8).forEach((line, i) => g.fillText(line, 24, 172 + i * 24));
  g.textAlign = 'center';
  g.fillText('- - - - - - - - - - - - - -', 180, 380);
  g.font = '700 19px "Courier Prime", monospace';
  g.fillText(t.name ? `PER: ${t.name.toUpperCase()}` : 'PER: TE', 180, 410);
  // The bake stamp
  g.save();
  g.translate(180, 465);
  g.rotate(-0.12);
  g.strokeStyle = '#b8301c';
  g.fillStyle = '#b8301c';
  g.lineWidth = 3;
  g.strokeRect(-130, -32, 260, 64);
  g.font = '700 18px "Courier Prime", monospace';
  g.fillText(`COTTA IN ${t.seconds} SEC`, 0, -6);
  g.font = '400 15px "Courier Prime", monospace';
  g.fillText(`485 °C · ${t.grade.toUpperCase()}`, 0, 18);
  g.restore();
  return c;
}

export class PizzaBox {
  readonly group = new THREE.Group();
  /** The pizza sits here (box floor). */
  readonly floor = new THREE.Group();
  private walls: THREE.Group[] = [];
  private lidHinge = new THREE.Group();
  private flapHinge = new THREE.Group();
  private sticker: THREE.Mesh;
  fold = 1;
  lid = 1;

  constructor() {
    const lidTex = colorTex(shrink(lidArt(), LITE ? 0.5 : 1));
    const sideTex = colorTex(sideArt());
    const plainTex = colorTex(kraft(256, 256, 5).c);
    const inside = new THREE.MeshStandardMaterial({ map: plainTex, color: '#e8d2ae', roughness: 0.95, side: THREE.DoubleSide });
    const outside = new THREE.MeshStandardMaterial({ map: plainTex, roughness: 0.92 });
    const printed = new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.85 });
    const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9 });
    const T = 0.003;

    const base = new THREE.Mesh(new THREE.BoxGeometry(S, T, S), [outside, outside, inside, outside, outside, outside]);
    base.position.y = -T / 2;
    base.receiveShadow = true;
    this.group.add(base, this.floor);

    // Four walls hinged on the base edges: front (+z), back (-z), left, right.
    const wallDefs: [number, number, number][] = [
      [0, S / 2, 0],
      [Math.PI, -S / 2, 0],
      [Math.PI / 2, 0, 0],
      [-Math.PI / 2, 0, 0],
    ];
    wallDefs.forEach(([ry], i) => {
      const hinge = new THREE.Group();
      hinge.rotation.y = ry;
      const pivot = new THREE.Group();
      pivot.position.z = S / 2;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(S, H, T), [side, side, side, side, side, inside]);
      wall.position.y = H / 2;
      wall.castShadow = true;
      pivot.add(wall);
      hinge.add(pivot);
      this.group.add(hinge);
      this.walls.push(pivot);
      void i;
    });

    // Lid hinged at the top of the back wall.
    this.lidHinge.position.set(0, H, -S / 2);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(S, T, S), [outside, outside, printed, inside, outside, outside]);
    lidMesh.position.set(0, T / 2, S / 2);
    lidMesh.castShadow = true;
    this.lidHinge.add(lidMesh);
    this.flapHinge.position.set(0, 0, S);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(S, 0.035, T), outside);
    flap.position.y = -0.0175;
    this.flapHinge.add(flap);
    this.lidHinge.add(this.flapHinge);
    this.sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.13), new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true }));
    this.sticker.rotation.x = -Math.PI / 2;
    this.sticker.position.set(0.12, T + 0.0006, S * 0.78);
    this.sticker.visible = false;
    this.lidHinge.add(this.sticker);
    this.group.add(this.lidHinge);
    this.apply();
  }

  setTicket(t: TicketInfo): void {
    const m = this.sticker.material as THREE.MeshStandardMaterial;
    m.map = colorTex(ticketArt(t));
    m.needsUpdate = true;
    this.sticker.rotation.z = -0.18;
    this.sticker.visible = true;
  }

  apply(): void {
    // Walls: fold 0 → lying flat outwards, 1 → upright.
    this.walls.forEach((p) => (p.rotation.x = (1 - this.fold) * (Math.PI / 2)));
    // Lid: 0 closed (flat on top), 1 open (leaning back past vertical).
    this.lidHinge.rotation.x = -this.lid * (Math.PI * 0.62);
    this.flapHinge.rotation.x = Math.PI / 2 - this.lid * (Math.PI / 2) * 0.9;
    this.lidHinge.visible = this.fold > 0.6;
  }
}
