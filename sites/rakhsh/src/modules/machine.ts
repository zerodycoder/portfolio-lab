import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, createLoop, devMissing, fitCanvas, onVisible } from '../lib/dom';
import { finishStore } from '../lib/finish';
import { pick, type Media } from '../lib/media';

const SWEEP_DEG = 120;

export type Machine = { preload(report: (f: number) => void): Promise<void> };

/**
 * The machine: a pinned, scroll-scrubbed image sequence (the orbit video, extracted to frames) drawn to a canvas.
 * Every 4th frame is loaded behind the gate; the rest stream in afterwards and the nearest loaded frame is drawn meanwhile.
 */
export function initMachine(media: Media): Machine {
  const root = $('[data-machine]');
  const canvas = $<HTMLCanvasElement>('[data-machine-canvas]', root);
  const ctx = canvas.getContext('2d');
  const deg = $('[data-machine-deg]', root);
  const fill = $('[data-machine-fill]', root);
  const idx = $('[data-machine-idx]', root);
  const notes = $$('[data-note]', root);

  const orbit = media.orbit;
  const n = orbit?.frames ?? 0;
  const frames: (HTMLImageElement | null)[] = new Array(n).fill(null);
  const pattern = orbit ? pick(orbit.pattern, orbit.patternMobile) : '';
  const url = (i: number): string => pattern.replace('{i}', String(i + 1).padStart(3, '0'));
  if (!n) devMissing(root, 'b-orbit.mp4');

  let progress = 0;
  let cur = 0;
  let lastDrawn = -1;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let activeNote = 0;

  const load = (i: number): Promise<void> => {
    if (frames[i]) return Promise.resolve();
    const im = new Image();
    im.decoding = 'async';
    im.src = url(i);
    return im
      .decode()
      .then(() => {
        frames[i] = im;
        if (Math.abs(i - cur) < 3) lastDrawn = -1;
      })
      .catch(() => undefined);
  };

  const nearest = (i: number): HTMLImageElement | null => {
    if (frames[i]) return frames[i];
    for (let d = 1; d < n; d++) {
      if (i - d >= 0 && frames[i - d]) return frames[i - d];
      if (i + d < n && frames[i + d]) return frames[i + d];
    }
    return null;
  };

  const drawFrame = (im: HTMLImageElement): void => {
    if (!ctx) return;
    const iw = im.naturalWidth;
    const ih = im.naturalHeight;
    let s: number;
    let cx: number;
    let cy: number;
    if (h > w) {
      // Portrait: full width (slightly over-scaled), between the heading and the notes.
      s = (w / iw) * 1.32;
      cx = w / 2;
      cy = h * 0.5 + ih * s * 0.04;
    } else {
      // Landscape: right of centre, clear of the heading (top left) and the notes (bottom left).
      s = Math.min((w * 0.74) / iw, (h * 0.8) / ih);
      cx = Math.min(w * 0.6, w - (iw * s) / 2);
      cy = h * 0.54;
    }
    const dw = iw * s;
    const dh = ih * s;
    const dx = cx - dw / 2;
    const dy = cy - dh / 2;
    ctx.drawImage(im, dx, dy, dw, dh);
    feather(dx, dy, dw, dh);
  };

  /** Fades the frame's edges into the canvas black so the generated floor never shows a hard rectangle. */
  const feather = (dx: number, dy: number, dw: number, dh: number): void => {
    if (!ctx) return;
    const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0, 0, 0, 1)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    const fx = dw * 0.1;
    edge(dx, 0, dx + fx, 0, dx, dy, fx, dh);
    edge(dx + dw, 0, dx + dw - fx, 0, dx + dw - fx, dy, fx, dh);
    edge(0, dy, 0, dy + dh * 0.08, dx, dy, dw, dh * 0.08);
    edge(0, dy + dh, 0, dy + dh * 0.82, dx, dy + dh * 0.82, dw, dh * 0.18);
  };

  /** Without footage: an abstract turntable whose ring of marks and light bar both answer to the scroll angle. */
  const drawFallback = (): void => {
    if (!ctx) return;
    const [r, g, b] = finishStore.rgb();
    const cx = w / 2;
    const floorY = h * 0.66;
    const R = Math.min(w * 0.36, 520);
    const ang = ((30 + progress * SWEEP_DEG) * Math.PI) / 180;

    const glow = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, R * 1.3);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.16)`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2 + ang;
      const front = (Math.sin(a) + 1) / 2;
      const x = cx + Math.cos(a) * R;
      const y = floorY + Math.sin(a) * R * 0.2;
      const major = k % 6 === 0;
      ctx.fillStyle = `rgba(236, 230, 220, ${(0.08 + front * (major ? 0.6 : 0.3)).toFixed(3)})`;
      ctx.fillRect(x - 1, y - (major ? 6 : 2), 2, major ? 12 : 4);
    }

    const barW = Math.max(6, Math.abs(Math.cos(ang)) * R * 0.9);
    const barY = h * 0.47;
    ctx.globalCompositeOperation = 'lighter';
    [
      [26, 0.06],
      [10, 0.16],
      [3, 0.9],
    ].forEach(([lw, a]) => {
      ctx.strokeStyle = lw > 3 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgba(255, 248, 240, ${a})`;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - barW / 2, barY);
      ctx.lineTo(cx + barW / 2, barY);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
  };

  const draw = (force = false): void => {
    if (!ctx) return;
    const i = Math.round(cur);
    if (!force && n && i === lastDrawn) return;
    lastDrawn = i;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (n) {
      const im = nearest(i);
      if (im) drawFrame(im);
    } else drawFallback();
  };

  const resize = (): void => {
    ({ w, h, dpr } = fitCanvas(canvas));
    draw(true);
  };
  new ResizeObserver(resize).observe(canvas);

  const ui = (): void => {
    deg.textContent = String(Math.round(progress * SWEEP_DEG)).padStart(3, '0');
    fill.style.transform = `scaleX(${progress.toFixed(4)})`;
    const k = Math.min(notes.length - 1, Math.floor(progress * notes.length));
    if (k !== activeNote) {
      notes[activeNote].classList.remove('is-active');
      notes[k].classList.add('is-active');
      activeNote = k;
      idx.textContent = `${String(k + 1).padStart(2, '0')} / ${String(notes.length).padStart(2, '0')}`;
    }
  };

  ScrollTrigger.create({
    id: 'machine',
    trigger: root,
    start: 'top top',
    end: '+=260%',
    pin: true,
    scrub: true,
    onUpdate: (self) => {
      progress = self.progress;
      ui();
    },
  });

  const loop = createLoop(() => {
    const target = progress * Math.max(0, n - 1);
    cur += (target - cur) * 0.22;
    if (Math.abs(target - cur) < 0.01) cur = target;
    draw(!n);
  });
  onVisible(root, (vis) => (vis ? loop.start() : loop.stop()), '10% 0px');

  const loadRest = async (): Promise<void> => {
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (!frames[i]) rest.push(i);
    for (let k = 0; k < rest.length; k += 8) await Promise.all(rest.slice(k, k + 8).map(load));
  };

  return {
    async preload(report) {
      if (!n) return report(1);
      const first: number[] = [];
      for (let i = 0; i < n; i += 4) first.push(i);
      if (first[first.length - 1] !== n - 1) first.push(n - 1);
      let done = 0;
      await Promise.all(first.map((i) => load(i).then(() => report(++done / first.length))));
      draw(true);
      void loadRest();
    },
  };
}
