import { $ } from '@portfolio-lab/kit/dom';
import { store } from '../lib/store';

/**
 * Il diploma: a pizzaiolo's diploma that hangs on the shop's wall, with ten places for a wax seal. It is the site's
 * discovery layer: each seal is something to find or do (worded for mouse and touch alike), and pressing one
 * updates both the diploma in the 3D room and its close-up panel. The diploma is a canvas, drawn here, used as
 * the texture of the frame on the wall and shown as-is in the panel.
 */

export type StampId = 'stretch' | 'sauce' | 'leopard' | 'even' | 'fire' | 'pull' | 'pineapple' | 'classic' | 'door' | 'family';

const LIST: { id: StampId; it: string; en: string }[] = [
  { id: 'stretch', it: 'Mano d’oro', en: 'Stretch a round, even 30 cm base' },
  { id: 'sauce', it: 'Neanche un buco', en: 'Sauce it edge to edge, rim kept clean' },
  { id: 'leopard', it: 'Leopardata', en: 'Bake 30+ leopard spots into the crust' },
  { id: 'even', it: 'Girata giusta', en: 'Turn it enough for an even bake' },
  { id: 'fire', it: 'Soffia sul fuoco', en: 'Fan the fire in the oven' },
  { id: 'pull', it: 'Filo d’oro', en: 'Pull a slice until the cheese snaps' },
  { id: 'pineapple', it: 'La confessione', en: 'Put pineapple on it. We saw.' },
  { id: 'classic', it: 'Un classico', en: 'Bake a classic from the chalkboard' },
  { id: 'door', it: 'Alla porta', en: 'Follow the rider to your door' },
  { id: 'family', it: 'La famiglia', en: 'Meet the family on the photo wall' },
];

export const DIPLOMA_W = 900;
export const DIPLOMA_H = 1200;

export class Stamps {
  private got = new Set<StampId>(store.get<StampId[]>('stamps', []));
  readonly canvas = document.createElement('canvas');
  name = store.get<string>('name', '');
  onStamp: ((id: StampId) => void) | null = null;
  /** Called whenever the diploma canvas has been redrawn (the 3D texture listens). */
  onDraw: (() => void) | null = null;

  constructor() {
    this.canvas.width = DIPLOMA_W;
    this.canvas.height = DIPLOMA_H;
    this.canvas.className = 'diploma__canvas';
    this.canvas.setAttribute('role', 'img');
    this.render();
    $('[data-tessera]').addEventListener('click', () => this.open());
    $('[data-tessera-close]').addEventListener('click', () => this.close());
    $('[data-tessera-panel]').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
    // Fonts arrive after the first draw.
    void document.fonts.ready.then(() => this.render());
  }

  has(id: StampId): boolean {
    return this.got.has(id);
  }

  get count(): number {
    return this.got.size;
  }

  setName(name: string): void {
    if (!name || name === this.name) return;
    this.name = name;
    store.set('name', name);
    this.render();
  }

  give(id: StampId): void {
    if (this.got.has(id)) return;
    this.got.add(id);
    store.set('stamps', [...this.got]);
    this.render();
    const s = LIST.find((x) => x.id === id)!;
    const toast = $('[data-stamp-toast]');
    toast.innerHTML = `<i aria-hidden="true">N</i><span>${s.it}<small>Sigillo ${this.got.size}/${LIST.length} on your diploma</small></span>`;
    toast.classList.remove('is-on');
    void toast.offsetWidth;
    toast.classList.add('is-on');
    const btn = $('[data-tessera]');
    btn.classList.remove('is-bump');
    void btn.offsetWidth;
    btn.classList.add('is-bump');
    this.onStamp?.(id);
  }

  private render(): void {
    $('[data-tessera-count]').textContent = `${this.got.size}/${LIST.length}`;
    $('[data-tessera-grid]').innerHTML = LIST.map(
      (s) => `<li class="${this.got.has(s.id) ? 'is-got' : ''}"><i aria-hidden="true">${this.got.has(s.id) ? 'N' : ''}</i><span><b>${s.it}</b>${s.en}</span></li>`,
    ).join('');
    this.draw();
    this.onDraw?.();
  }

  /** The diploma itself: parchment, a double border, the title, the name, ten seal places and a signature. */
  private draw(): void {
    const g = this.canvas.getContext('2d')!;
    const W = DIPLOMA_W;
    const H = DIPLOMA_H;
    const grad = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.8);
    grad.addColorStop(0, '#f8eed6');
    grad.addColorStop(1, '#e4cfa2');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Fibres and foxing.
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(150,110,60,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    g.strokeStyle = '#8c2a1c';
    g.lineWidth = 6;
    g.strokeRect(34, 34, W - 68, H - 68);
    g.strokeStyle = '#b8902e';
    g.lineWidth = 2;
    g.strokeRect(50, 50, W - 100, H - 100);
    g.textAlign = 'center';
    g.fillStyle = '#5a3a20';
    g.font = '600 24px "Courier Prime", monospace';
    g.fillText('PIZZERIA NOVANTA · VICO NOVANTA, 90 · NAPOLI', W / 2, 112);
    g.fillStyle = '#8c2a1c';
    g.font = 'italic 700 78px "Fraunces Variable", Georgia, serif';
    g.fillText('Diploma', W / 2, 210);
    g.font = 'italic 500 40px "Fraunces Variable", Georgia, serif';
    g.fillText('di Pizzaiolo Napoletano', W / 2, 262);
    g.fillStyle = '#5a3a20';
    g.font = 'italic 400 26px "Fraunces Variable", Georgia, serif';
    g.fillText('si conferisce a · awarded to', W / 2, 322);
    g.font = '600 52px "Caveat Variable", cursive';
    g.fillStyle = '#2a1a10';
    g.fillText(this.name || '. . . . . . . . . . . .', W / 2, 384);
    g.strokeStyle = 'rgba(90,58,32,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(220, 398);
    g.lineTo(W - 220, 398);
    g.stroke();
    // Ten seal places, two columns.
    LIST.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col ? W / 2 + 40 : 110;
      const y = 470 + row * 120;
      const got = this.got.has(s.id);
      const cx = x + 46;
      const cy = y + 40;
      if (got) {
        // A wax seal: irregular red blob, a raised ring, the N.
        g.save();
        g.translate(cx, cy);
        g.rotate((i * 0.7) % 1);
        g.fillStyle = '#9e2216';
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const r = 42 + Math.sin(a * 5 + i) * 3 + Math.cos(a * 3) * 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.fill();
        const wax = g.createRadialGradient(-10, -12, 4, 0, 0, 40);
        wax.addColorStop(0, 'rgba(255,140,120,0.5)');
        wax.addColorStop(1, 'rgba(80,10,5,0.2)');
        g.fillStyle = wax;
        g.fill();
        g.strokeStyle = 'rgba(60,8,4,0.6)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 29, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(60,8,4,0.75)';
        g.font = 'italic 800 34px "Fraunces Variable", Georgia, serif';
        g.textBaseline = 'middle';
        g.fillText('N', 0, 2);
        g.textBaseline = 'alphabetic';
        g.restore();
      } else {
        g.strokeStyle = 'rgba(90,58,32,0.35)';
        g.setLineDash([6, 6]);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, 38, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      g.textAlign = 'left';
      g.fillStyle = got ? '#2a1a10' : 'rgba(90,58,32,0.55)';
      g.font = 'italic 600 28px "Fraunces Variable", Georgia, serif';
      g.fillText(s.it, x + 104, y + 34);
      g.font = '400 18px "Instrument Sans Variable", system-ui, sans-serif';
      wrap(g, s.en, x + 104, y + 60, 250, 22);
      g.textAlign = 'center';
    });
    g.fillStyle = '#2a1a10';
    g.font = '600 54px "Caveat Variable", cursive';
    g.fillText('Gennaro', W - 230, H - 118);
    g.strokeStyle = 'rgba(90,58,32,0.5)';
    g.beginPath();
    g.moveTo(W - 360, H - 100);
    g.lineTo(W - 100, H - 100);
    g.stroke();
    g.font = 'italic 400 20px "Fraunces Variable", Georgia, serif';
    g.fillStyle = '#5a3a20';
    g.fillText('il maestro pizzaiolo', W - 230, H - 72);
    g.textAlign = 'left';
    g.fillText(`Napoli, ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`, 100, H - 82);
    g.textAlign = 'center';
    g.fillStyle = '#8c2a1c';
    g.font = '700 26px "Courier Prime", monospace';
    g.fillText(`${this.got.size} / ${LIST.length}`, W / 2, H - 140);
  }

  open(): void {
    const panel = $('[data-tessera-panel]');
    const holder = panel.querySelector('[data-diploma]');
    if (holder && !holder.contains(this.canvas)) holder.appendChild(this.canvas);
    panel.hidden = false;
  }

  close(): void {
    $('[data-tessera-panel]').hidden = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number): void {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) {
      g.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = test;
  }
  g.fillText(line, x, yy);
}
