import { gsap } from 'gsap';
import type Lenis from 'lenis';
import { $, $$, createLoop, devMissing, fitCanvas, onVisible } from '../lib/dom';
import { finishStore } from '../lib/finish';
import { pick, type Media } from '../lib/media';

type Streak = { x: number; y: number; len: number; speed: number; a: number; warm: boolean };

/**
 * Ride: the night-ride film full bleed, two rows of type sliding against each other, light streaks,
 * and a HUD whose speed reading is your actual scroll velocity.
 */
export function initRide(media: Media, lenis: Lenis, reduced: boolean): void {
  const root = $('[data-ride]');
  const stage = $('[data-ride-media]', root);
  const canvas = $<HTMLCanvasElement>('[data-ride-lines]', root);
  const hud = $('[data-hud-speed]', root);
  const rows = $$('[data-row]', root);

  let video: HTMLVideoElement | null = null;
  if (media.ride) {
    const v = document.createElement('video');
    v.muted = v.loop = v.playsInline = true;
    v.preload = 'none';
    if (media.ride.poster) v.poster = media.ride.poster;
    stage.appendChild(v);
    root.classList.add('has-video');
    video = v;
    const src = pick(media.ride.src, media.ride.srcMobile);
    // Observer callbacks can arrive in either order on a fast jump, so "visible" also guarantees the source.
    const ensureSrc = (): void => {
      if (v.getAttribute('src')) return;
      v.preload = 'auto';
      v.src = src;
    };
    onVisible(root, (near) => near && ensureSrc(), '100% 0px');
    onVisible(root, (vis) => {
      if (!vis) return v.pause();
      ensureSrc();
      void v.play().catch(() => undefined);
    });
  } else devMissing(stage, 'e-ride.mp4');

  const tl = gsap.timeline({
    scrollTrigger: { id: 'ride', trigger: root, start: 'top top', end: '+=130%', pin: true, scrub: 0.5 },
  });
  tl.fromTo(rows[0], { xPercent: 0 }, { xPercent: -38, ease: 'none' }, 0).fromTo(rows[1], { xPercent: -38 }, { xPercent: 0, ease: 'none' }, 0);
  if (video) tl.fromTo(stage, { scale: 1.12 }, { scale: 1, ease: 'none' }, 0);

  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  const streaks: Streak[] = [];
  const make = (anywhere: boolean): Streak => ({
    x: anywhere ? Math.random() * w : w + Math.random() * w * 0.3,
    y: h * (0.18 + Math.pow(Math.random(), 1.4) * 0.72),
    len: 40 + Math.random() * 260,
    speed: 0.5 + Math.random() * 1.5,
    a: 0.05 + Math.random() * 0.3,
    warm: Math.random() < 0.28,
  });
  const resize = (): void => {
    ({ w, h, dpr } = fitCanvas(canvas, 1.5));
    const target = Math.round(w / 14);
    while (streaks.length < target) streaks.push(make(true));
    streaks.length = target;
  };
  new ResizeObserver(resize).observe(canvas);

  let shown = 0;
  let last = '';
  const loop = createLoop((_t, dtMs) => {
    const dt = Math.min(dtMs, 50) / 1000;
    const target = Math.min(210, Math.abs(lenis.velocity) * 5.5);
    shown += (target - shown) * (target > shown ? 0.12 : 0.04);
    const text = String(Math.round(shown)).padStart(3, '0');
    if (text !== last) {
      hud.textContent = text;
      last = text;
    }
    if (!ctx || reduced) return;
    const [r, g, b] = finishStore.rgb();
    const pace = 260 + shown * 22;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      s.x -= pace * s.speed * dt;
      if (s.x + s.len * (1 + shown / 60) < 0) {
        streaks[i] = make(false);
        continue;
      }
      const len = s.len * (1 + shown / 60);
      const grad = ctx.createLinearGradient(s.x, 0, s.x + len, 0);
      const col = s.warm ? `${r}, ${g}, ${b}` : '236, 230, 220';
      grad.addColorStop(0, `rgba(${col}, ${(s.a * (0.5 + shown / 210)).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${col}, 0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.warm ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + len, s.y);
      ctx.stroke();
    }
  });
  onVisible(root, (vis) => (vis ? loop.start() : loop.stop()));
}
