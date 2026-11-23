import { $ } from '@portfolio-lab/kit/dom';
import { rng } from '../lib/rand';
import { store } from '../lib/store';
import type { Sound } from '../lib/sound';
import { note } from './ui';

/**
 * The ride. A paper map of a made-up corner of Naples is generated from a seed (streets on a wobbly grid, the bay,
 * a park, Vesuvius on the skyline), the route is found with Dijkstra over the street graph, and the rider follows
 * it with a real ETA, a red light, a shortcut and a message or two. The tab's title and favicon count down when
 * the visitor looks away, and the ride survives a reload: it is stored with its start time.
 */

type Node = { x: number; y: number; id: number };
type Edge = [number, number];

export type Ride = { startedAt: number; duration: number; seed: number; name: string; to: string };

const STEPS = [
  ['Sfornata', 'Baked'],
  ['Inscatolata', 'Boxed'],
  ['In viaggio', 'On the way'],
  ['Quasi lì', 'Around the corner'],
  ['Alla porta', 'At your door'],
];
const DEST: Record<string, [string, string]> = {
  desk: ['La tua scrivania', 'your desk'],
  mum: ['Da mamma', 'your mum’s'],
  moon: ['Sulla luna', 'the moon (via Naples)'],
};

function buildCity(seed: number, W: number, H: number): { nodes: Node[]; edges: Edge[]; start: number; end: number; svg: string } {
  const r = rng(seed);
  const top = 150;
  const sea = 230;
  const cols = Math.max(5, Math.round((W - 180) / 135) + 1);
  const rows = Math.max(5, Math.round((H - top - sea) / 115) + 1);
  const nodes: Node[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = 90 + (i / (cols - 1)) * (W - 180) + (r() - 0.5) * 50 + j * 5;
      const y = top + (j / (rows - 1)) * (H - top - sea) + (r() - 0.5) * 40;
      nodes.push({ x, y, id: nodes.length });
    }
  const edges: Edge[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const id = j * cols + i;
      if (i < cols - 1 && r() > 0.12) edges.push([id, id + 1]);
      if (j < rows - 1 && r() > 0.18) edges.push([id, id + cols]);
      if (i < cols - 1 && j < rows - 1 && r() > 0.9) edges.push([id, id + cols + 1]);
    }
  const mid = Math.floor(cols / 2);
  const start = (rows - 1) * cols + 1;
  const end = cols + cols - 2;
  // Via Toledo runs straight up the middle, the Lungomare along the sea, the Decumano across the top:
  // the route always exists.
  for (let j = 0; j < rows - 1; j++) edges.push([j * cols + mid, (j + 1) * cols + mid]);
  for (let i = 0; i < cols - 1; i++) edges.push([(rows - 1) * cols + i, (rows - 1) * cols + i + 1], [cols + i, cols + i + 1]);
  const n = (i: number): Node => nodes[i];
  const streetPath = edges.map(([a, b]) => `M${n(a).x.toFixed(1)} ${n(a).y.toFixed(1)}L${n(b).x.toFixed(1)} ${n(b).y.toFixed(1)}`).join('');
  let blocks = '';
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = n(j * cols + i);
      const b = n(j * cols + i + 1);
      const c = n((j + 1) * cols + i + 1);
      const d = n((j + 1) * cols + i);
      const cx = (a.x + b.x + c.x + d.x) / 4;
      const cy = (a.y + b.y + c.y + d.y) / 4;
      const pt = (p: Node): string => `${(p.x + (cx - p.x) * 0.16).toFixed(1)},${(p.y + (cy - p.y) * 0.16).toFixed(1)}`;
      const park = r() < 0.08;
      blocks += `<polygon points="${[a, b, c, d].map(pt).join(' ')}" fill="${park ? '#b9c99a' : r() > 0.5 ? '#e6d6b8' : '#ead9bc'}" stroke="#c9b48e" stroke-width="1.5"/>`;
      if (park) blocks += `<circle cx="${cx - 18}" cy="${cy - 8}" r="11" fill="#8fa86a"/><circle cx="${cx + 14}" cy="${cy + 10}" r="14" fill="#8fa86a"/><circle cx="${cx + 4}" cy="${cy - 22}" r="9" fill="#8fa86a"/>`;
      else if (r() < 0.12) blocks += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="18" opacity="0.55">⛪</text>`;
    }
  // Street names, set along their streets.
  const label = (a: Node, b: Node, text: string): string => {
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const up = ang > 90 || ang < -90 ? ang + 180 : ang;
    return `<text transform="translate(${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}) rotate(${up.toFixed(1)})" dy="-10" text-anchor="middle" font-family="Fraunces Variable, Georgia, serif" font-style="italic" font-size="17" fill="#7a6446">${text}</text>`;
  };
  const tj = Math.floor((rows - 1) / 2);
  const names =
    label(n(tj * cols + mid), n((tj + 1) * cols + mid), 'Via Toledo') +
    label(n(cols + 1), n(cols + 2), 'Via dei Tribunali') +
    label(n((rows - 1) * cols + cols - 3), n((rows - 1) * cols + cols - 2), 'Lungomare') +
    label(n(2 * cols + cols - 3), n(2 * cols + cols - 2), 'Spaccanapoli');
  const seaY = H - sea + 60;
  const svg = `
    <defs>
      <pattern id="paper" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.6" fill="rgba(120,90,50,0.08)"/></pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="#efe4cf"/>
    <rect width="${W}" height="${H}" fill="url(#paper)"/>
    <path d="M0 ${seaY} C ${W * 0.2} ${seaY - 50}, ${W * 0.42} ${seaY + 30}, ${W * 0.62} ${seaY - 20} S ${W * 0.9} ${seaY - 70}, ${W} ${seaY - 40} L ${W} ${H} L 0 ${H} Z" fill="#9fc0d2"/>
    <path d="M0 ${seaY} C ${W * 0.2} ${seaY - 50}, ${W * 0.42} ${seaY + 30}, ${W * 0.62} ${seaY - 20} S ${W * 0.9} ${seaY - 70}, ${W} ${seaY - 40}" fill="none" stroke="#7aa2b8" stroke-width="3"/>
    <text x="${W - 50}" y="${H - 50}" text-anchor="end" font-family="Fraunces Variable, Georgia, serif" font-style="italic" font-size="34" fill="#5d8aa3">Golfo di Napoli</text>
    <path d="M${W - 330} 110 L${W - 240} 52 L${W - 215} 66 L${W - 190} 48 L${W - 90} 110 Z" fill="#c9b8a0" opacity="0.85"/>
    <path d="M${W - 222} 56 q 6 -22 -4 -40 q 18 12 10 38" fill="#d9ccb8" opacity="0.7"/>
    <text x="${W - 210}" y="134" text-anchor="middle" font-family="Fraunces Variable, Georgia, serif" font-style="italic" font-size="20" fill="#8a7458">Vesuvio</text>
    ${blocks}
    <path d="${streetPath}" stroke="#fffaf0" stroke-width="13" stroke-linecap="round" fill="none"/>
    <path d="${streetPath}" stroke="#d8c7a6" stroke-width="1.5" stroke-dasharray="2 6" fill="none"/>
    ${names}`;
  return { nodes, edges, start, end, svg };
}

function route(nodes: Node[], edges: Edge[], a: number, b: number): number[] {
  const adj = new Map<number, number[]>();
  edges.forEach(([u, v]) => {
    adj.set(u, [...(adj.get(u) ?? []), v]);
    adj.set(v, [...(adj.get(v) ?? []), u]);
  });
  const dist = new Map<number, number>([[a, 0]]);
  const prev = new Map<number, number>();
  const open = new Set([a]);
  while (open.size) {
    let u = -1;
    let best = Infinity;
    open.forEach((n) => {
      const d = dist.get(n)!;
      if (d < best) {
        best = d;
        u = n;
      }
    });
    open.delete(u);
    if (u === b) break;
    for (const v of adj.get(u) ?? []) {
      const d = best + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
      if (d < (dist.get(v) ?? Infinity)) {
        dist.set(v, d);
        prev.set(v, u);
        open.add(v);
      }
    }
  }
  const path = [b];
  while (path[0] !== a && prev.has(path[0])) path.unshift(prev.get(path[0])!);
  return path;
}

export class Delivery {
  private raf = 0;
  private title = document.title;
  private favicon = document.querySelector<HTMLLinkElement>('[data-favicon]');
  private faviconHref = this.favicon?.href ?? '';
  onArrive: (() => void) | null = null;
  /** The visitor wants to go back to the shop while the ride carries on. */
  onLeave: (() => void) | null = null;

  constructor(private readonly sound: Sound) {}

  static saved(): Ride | null {
    return store.get<Ride | null>('ride', null);
  }

  start(name: string, to: string, duration = 16000): Ride {
    const ride: Ride = { startedAt: Date.now(), duration, seed: Math.floor(Math.random() * 1e6), name, to };
    store.set('ride', ride);
    return ride;
  }

  clear(): void {
    store.remove('ride');
  }

  /** Shows the map and runs the ride (resumes if already under way). */
  show(ride: Ride): void {
    const el = $('[data-map]');
    // The paper is cut to the screen: the map area is the viewport minus the header and the tracker.
    const aspect = innerWidth / Math.max(200, innerHeight - (innerWidth <= 760 ? 260 : 190));
    const W = aspect >= 1 ? Math.round(1000 * aspect) : 1000;
    const H = aspect >= 1 ? 1000 : Math.round(1000 / aspect);
    const city = buildCity(ride.seed, W, H);
    const path = route(city.nodes, city.edges, city.start, city.end).map((i) => city.nodes[i]);
    const seg = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
    const total = seg.reduce((a, b) => a + b, 0);
    const d = path.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
    const [destIt, destEn] = DEST[ride.to] ?? DEST.desk;
    const s = path[0];
    const e = path[path.length - 1];
    el.innerHTML = `
      <header class="map__head">
        <div><button type="button" class="map__back" data-map-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>Torna in pizzeria</button><h2><span class="it">In viaggio</span> to ${destEn}</h2><p>${ride.name ? `For ${ride.name}. ` : ''}Your rider is Enzo, on a scooter older than he is.</p></div>
        <div class="map__eta"><b data-eta>0:16</b><span>ETA</span></div>
      </header>
      <svg class="map__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-label="Map of the route">
        ${city.svg}
        <path d="${d}" fill="none" stroke="#c8341e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 12" opacity="0.6"/>
        <path data-done d="${d}" fill="none" stroke="#c8341e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${total} ${total}" stroke-dashoffset="${total}"/>
        <g transform="translate(${s.x} ${s.y})"><circle r="20" fill="#2f6b3a"/><text y="6" text-anchor="middle" font-size="18" fill="#fff" font-family="Fraunces Variable, Georgia, serif" font-weight="800">N</text></g>
        <text x="${s.x}" y="${s.y + 44}" text-anchor="middle" font-family="Fraunces Variable, Georgia, serif" font-weight="800" font-size="22" fill="#2f6b3a">NOVANTA</text>
        <g transform="translate(${e.x} ${e.y})"><path d="M0 -34 C 18 -34 22 -14 0 8 C -22 -14 -18 -34 0 -34 Z" fill="#c8341e"/><circle cy="-21" r="7" fill="#fff"/></g>
        <text x="${e.x}" y="${e.y + 34}" text-anchor="middle" font-family="Fraunces Variable, Georgia, serif" font-style="italic" font-size="24" fill="#231c17">${destIt}</text>
        <g data-rider><circle r="22" fill="#fffaf0" stroke="#231c17" stroke-width="2"/><text y="8" text-anchor="middle" font-size="24">🛵</text></g>
        <g data-light opacity="0"><rect x="-10" y="-30" width="20" height="44" rx="6" fill="#231c17"/><circle cy="-18" r="6" fill="#ff4a2a"/><circle cy="-3" r="6" fill="#444"/></g>
      </svg>
      <footer class="map__foot">
        <p class="rider-msg" data-msg>Enzo: “Parto! Leaving now.”</p>
        <ol class="track">${STEPS.map((st, i) => `<li data-step="${i}"><span class="it">${st[0]}</span>${st[1]}</li>`).join('')}</ol>
      </footer>`;
    el.hidden = false;
    el.querySelector('[data-map-back]')?.addEventListener('click', () => this.onLeave?.());
    const rider = el.querySelector<SVGGElement>('[data-rider]')!;
    const done = el.querySelector<SVGPathElement>('[data-done]')!;
    const light = el.querySelector<SVGGElement>('[data-light]')!;
    const eta = el.querySelector<HTMLElement>('[data-eta]')!;
    const msg = el.querySelector<HTMLElement>('[data-msg]')!;
    const stepsEl = el.querySelectorAll<HTMLElement>('[data-step]');
    // Where along the path (0..1) things happen.
    const redAt = 0.33;
    const redFor = 0.09;
    const events: [number, string][] = [
      [0.12, 'Enzo: “Traffico in Via Toledo… prendo il lungomare.” Taking the seafront.'],
      [redAt, 'Enzo: “Rosso. Aspetto.” Red light. He waits (he says).'],
      [0.58, 'Enzo: “Scorciatoia dal parco!” Shortcut through the park.'],
      [0.86, 'Enzo: “Quasi lì, scendi!” Nearly there: come down!'],
    ];
    let shown = -1;
    let lastStep = -1;
    let arrived = false;
    const pointAt = (k: number): { x: number; y: number; a: number } => {
      let dist = k * total;
      for (let i = 0; i < seg.length; i++) {
        if (dist <= seg[i] || i === seg.length - 1) {
          const t = Math.min(1, dist / seg[i]);
          const a = path[i];
          const b = path[i + 1];
          return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
        }
        dist -= seg[i];
      }
      return { x: e.x, y: e.y, a: 0 };
    };
    const frame = (): void => {
      const elapsed = Date.now() - ride.startedAt;
      const time = Math.min(1, elapsed / ride.duration);
      // The red light holds the rider still for a moment: progress along the path stalls around redAt.
      const stall = redFor;
      let k = time * (1 + stall);
      if (k > redAt && k < redAt + stall) k = redAt;
      else if (k >= redAt + stall) k -= stall;
      k = Math.min(1, k);
      const p = pointAt(k);
      rider.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      done.setAttribute('stroke-dashoffset', String(total * (1 - k)));
      light.setAttribute('transform', `translate(${(p.x + 34).toFixed(1)} ${(p.y - 26).toFixed(1)})`);
      light.setAttribute('opacity', time * (1 + stall) > redAt && time * (1 + stall) < redAt + stall ? '1' : '0');
      const left = Math.max(0, Math.ceil((ride.duration - elapsed) / 1000));
      eta.textContent = `0:${String(left).padStart(2, '0')}`;
      const step = time >= 1 ? 4 : k > 0.82 ? 3 : 2;
      if (step !== lastStep) {
        lastStep = step;
        stepsEl.forEach((li, i) => {
          li.classList.toggle('is-done', i < step);
          li.classList.toggle('is-now', i === step);
        });
        this.sound.ping(step);
      }
      events.forEach(([at, text], i) => {
        if (k >= at && i > shown) {
          shown = i;
          msg.textContent = text;
          if (i === 3) this.sound.beep();
        }
      });
      if (document.hidden) this.tab(left, time);
      if (time >= 1 && !arrived) {
        arrived = true;
        this.restoreTab();
        msg.textContent = 'Enzo: “Eccomi! I’m at your door.”';
        setTimeout(() => this.onArrive?.(), 900);
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(frame);
    // Hidden tabs throttle animation frames; keep the title and favicon going on a timer.
    const timer = window.setInterval(() => {
      if (arrived) return window.clearInterval(timer);
      const elapsed = Date.now() - ride.startedAt;
      if (document.hidden) this.tab(Math.max(0, Math.ceil((ride.duration - elapsed) / 1000)), Math.min(1, elapsed / ride.duration));
      if (elapsed >= ride.duration && document.hidden) {
        document.title = '🔔 Your pizza is here! · NOVANTA';
      }
    }, 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !arrived) this.restoreTab();
    });
    if (Date.now() - ride.startedAt > ride.duration + 60000) note('L’abbiamo lasciata alla porta. È ancora calda.', 'We left it at your door. Still warm.', 4000);
  }

  hide(): void {
    cancelAnimationFrame(this.raf);
    $('[data-map]').hidden = true;
    this.restoreTab();
  }

  /** While the visitor is in another tab: a countdown in the title, a progress pie as the favicon. */
  private tab(secondsLeft: number, k: number): void {
    document.title = `🛵 0:${String(secondsLeft).padStart(2, '0')} · your pizza`;
    if (!this.favicon) return;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e0a458';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c8341e';
    g.beginPath();
    g.moveTo(32, 32);
    g.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    g.closePath();
    g.fill();
    this.favicon.href = c.toDataURL('image/png');
  }

  private restoreTab(): void {
    document.title = this.title;
    if (this.favicon) this.favicon.href = this.faviconHref;
  }
}
