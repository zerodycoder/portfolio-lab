import { gsap } from 'gsap';
import { $, $$, createLoop, devMissing, fitCanvas, onVisible } from '../lib/dom';
import { finishStore } from '../lib/finish';
import type { Media } from '../lib/media';
import { splitWords } from '../lib/split';

/** The legend: a pinned story read word by word as you scroll, over a slow-zooming image and rising embers. */
export function initLegend(media: Media, reduced: boolean): void {
  const root = $('[data-legend]');
  const bg = $('[data-legend-bg]');

  if (media.legend?.video) {
    const v = document.createElement('video');
    v.muted = v.loop = v.playsInline = true;
    v.preload = 'none';
    v.src = media.legend.video;
    if (media.legend.src) v.poster = media.legend.src;
    bg.appendChild(v);
    onVisible(root, (vis) => (vis ? void v.play().catch(() => undefined) : v.pause()), '20% 0px');
  } else if (media.legend?.src) {
    bg.style.backgroundImage = `url("${media.legend.src}")`;
  } else {
    root.classList.add('no-bg');
    devMissing(bg, 'g-legend.png');
  }

  const words = $$('[data-words]', root).flatMap((p) => splitWords(p));

  if (reduced) {
    gsap.set(words, { opacity: 1 });
  } else {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: root, start: 'top top', end: '+=170%', pin: true, scrub: 0.6 },
    });
    tl.to(words, { opacity: 1, ease: 'none', stagger: 0.12, duration: 0.4 });
    tl.fromTo(bg, { scale: 1.18 }, { scale: 1, ease: 'none', duration: tl.duration() }, 0);
  }

  embers($<HTMLCanvasElement>('[data-embers]', root), root, reduced);
}

type Ember = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; seed: number };

function embers(canvas: HTMLCanvasElement, root: HTMLElement, reduced: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || reduced) return;
  let w = 0;
  let h = 0;
  let dpr = 1;
  const list: Ember[] = [];

  const spawn = (anywhere: boolean): Ember => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 10,
    vx: (Math.random() - 0.5) * 12,
    vy: -(14 + Math.random() * 46),
    r: 0.5 + Math.pow(Math.random(), 3) * 2.6,
    life: 0,
    max: 4 + Math.random() * 7,
    seed: Math.random() * 100,
  });

  const resize = (): void => {
    ({ w, h, dpr } = fitCanvas(canvas, 1.5));
    const target = Math.min(170, Math.round((w * h) / 8000));
    while (list.length < target) list.push(spawn(true));
    list.length = target;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const loop = createLoop((time, dtMs) => {
    const dt = Math.min(dtMs, 50) / 1000;
    const [r, g, b] = finishStore.rgb();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life += dt;
      p.x += (p.vx + Math.sin(time * 1.3 + p.seed) * 10) * dt;
      p.y += p.vy * dt;
      if (p.life > p.max || p.y < -20) {
        list[i] = spawn(false);
        continue;
      }
      const fade = Math.sin((p.life / p.max) * Math.PI);
      const flicker = 0.6 + 0.4 * Math.sin(time * 9 + p.seed * 3);
      const a = fade * flicker;
      ctx.fillStyle = `rgba(${r}, ${Math.min(255, g + 70)}, ${Math.min(255, b + 40)}, ${(a * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.r > 1.4) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(a * 0.12).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  onVisible(root, (vis) => (vis ? loop.start() : loop.stop()));
}
