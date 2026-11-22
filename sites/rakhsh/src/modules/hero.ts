import { gsap } from 'gsap';
import { $, $$, clamp, devMissing, finePointer } from '../lib/dom';
import { loadImage, pick, videoReady, type Media } from '../lib/media';
import { splitChars } from '../lib/split';

export type Hero = { preload(report: (f: number) => void): Promise<void>; intro(): void };

// Where the motorcycle sits inside the generated 16:9 frames (fractions of frame height): handlebars to tyres.
const FRAME_ASPECT = 16 / 9;
const FRAME_TOP = 0.1;
const FRAME_BOTTOM = 0.88;
// On portrait screens the film is shown this many viewport-widths wide and the camera travels along the bike.
const PORTRAIT_ZOOM = 2.4;

/**
 * Hero: light-sweep reveal video (or the still, or a designed light-bar fallback), a wordmark that rises
 * letter by letter on entry and pulls apart on scroll, and a horizon beam that ignites with the gate flash.
 */
export function initHero(media: Media, reduced: boolean): Hero {
  const root = $('[data-hero]');
  const stage = $('[data-hero-media]');
  const ui = $('[data-hero-ui]');
  const beam = $('[data-hero-beam]');
  const lamp = $('[data-hero-lamp]');
  const fades = $$('[data-hero-fade]');
  const chars = splitChars($('[data-hero-title]'));

  let img: HTMLImageElement | null = null;
  let video: HTMLVideoElement | null = null;

  if (media.hero) {
    img = document.createElement('img');
    img.className = 'hero__img';
    img.alt = '';
    img.decoding = 'async';
    img.fetchPriority = 'high';
    img.src = pick(media.hero.src, media.hero.srcMobile);
    stage.appendChild(img);
    root.classList.add('has-image');
  }
  if (media.reveal) {
    video = document.createElement('video');
    video.className = 'hero__video';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    video.src = pick(media.reveal.src, media.reveal.srcMobile);
    stage.appendChild(video);
    root.classList.add('has-video');
  }
  if (!img && !video) devMissing(stage, 'a-hero.png + c-reveal.mp4');

  // The generated footage is framed tight, so a full-bleed crop would cut the wheels and hide the headlight
  // under the copy. Instead the film is sized to the free space between the top copy and the horizon beam,
  // with the tyres standing on the beam. Measured with offsets so scroll transforms don't skew it.
  const films = [img, video].filter((el): el is HTMLImageElement | HTMLVideoElement => el !== null);
  const topBlock = $('.hero__top', root);
  const bottomBlock = $('.hero__bottom', root);
  let pan = 0;
  let lastGeometry = '';
  let introduced = false;
  let panTimeline: gsap.core.Timeline | null = null;

  /**
   * Portrait screens can't fit the whole bike at a size worth looking at, so the film stays big and the camera
   * travels instead: it opens on the rear, glides to the headlight as it ignites, then drifts slowly back and forth.
   */
  const startPan = (fromIntro: boolean): void => {
    panTimeline?.kill();
    gsap.set(films, { x: 0 });
    if (!pan || reduced) return;
    const tl = gsap.timeline();
    if (fromIntro) tl.fromTo(films, { x: pan }, { x: 0, duration: 8.5, ease: 'power2.inOut' });
    tl.to(films, { x: pan, duration: 16, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: fromIntro ? 2.5 : 0 });
    panTimeline = tl;
  };

  const layoutFilm = (): void => {
    if (!films.length) return;
    const vw = root.clientWidth;
    const top = topBlock.offsetTop + topBlock.offsetHeight + 16;
    const floor = bottomBlock.offsetTop + beam.offsetTop;
    const span = FRAME_BOTTOM - FRAME_TOP;
    let h = (floor - top) / span;
    let w = h * FRAME_ASPECT;
    let x = (vw - w) / 2;
    pan = 0;
    if (w > vw * 0.98) {
      if (root.clientHeight > vw) {
        w = Math.min(w, vw * PORTRAIT_ZOOM);
        h = w / FRAME_ASPECT;
        x = -w * 0.04; // front of the bike, headlight in view
        pan = vw - w * 0.96 - x; // travel to the rear wheel (negative)
      } else {
        w = vw * 0.98;
        h = w / FRAME_ASPECT;
        x = (vw - w) / 2;
      }
    }
    const y = floor - h * FRAME_BOTTOM;
    films.forEach((el) => {
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
      el.style.width = `${w.toFixed(1)}px`;
      el.style.height = `${h.toFixed(1)}px`;
    });
    root.classList.toggle('is-panning', pan !== 0);
    // Only restart the camera move when the geometry really changed; spurious resize callbacks (screenshots,
    // keyboards, toolbar jiggles) must not yank it back to the start.
    const geometry = `${w.toFixed(0)}:${pan.toFixed(0)}`;
    if (introduced && geometry !== lastGeometry) startPan(false);
    lastGeometry = geometry;
  };
  layoutFilm();
  new ResizeObserver(layoutFilm).observe(root);
  void document.fonts.ready.then(layoutFilm);

  gsap.set(chars, { yPercent: 108 });
  gsap.set(fades, { autoAlpha: 0, y: 14 });
  gsap.set(beam, { scaleX: 0 });
  gsap.set(lamp, { scaleX: 0, opacity: 0 });

  // Scroll: the wordmark pulls apart from the centre, the stage sinks and dims.
  const mid = (chars.length - 1) / 2;
  gsap
    .timeline({ scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 0.6 } })
    .to(chars, { xPercent: (i) => (i - mid) * 46, opacity: 0, ease: 'none' }, 0)
    .to(stage, { scale: 1.14, yPercent: 14, opacity: 0.25, ease: 'none' }, 0)
    .to(ui, { opacity: 0, yPercent: -30, ease: 'none' }, 0)
    .to(beam, { opacity: 0, scaleY: 0.2, ease: 'none' }, 0);

  if (!reduced) {
    const mx = gsap.quickTo(stage, 'x', { duration: 1.2, ease: 'power3.out' });
    const my = gsap.quickTo(stage, 'y', { duration: 1.2, ease: 'power3.out' });
    if (finePointer()) {
      root.addEventListener('pointermove', (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        mx(nx * -18);
        my(ny * -10);
      });
    } else {
      // Phones: the same parallax, driven by tilting the device (permission is asked at the gate on iOS).
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma === null || e.beta === null) return;
        mx((clamp(e.gamma, -25, 25) / 25) * -22);
        my((clamp(e.beta - 50, -25, 25) / 25) * -12);
      });
    }
  }

  return {
    async preload(report) {
      const jobs: Promise<unknown>[] = [];
      if (img) jobs.push(loadImage(img.src).catch(() => undefined));
      if (video) jobs.push(videoReady(video));
      let done = 0;
      await Promise.all(jobs.map((j) => j.then(() => report(++done / jobs.length))));
      report(1);
    },
    intro() {
      introduced = true;
      startPan(true);
      const tl = gsap.timeline();
      if (video) {
        video.currentTime = 0;
        void video.play().catch(() => root.classList.remove('has-video'));
      } else if (img) {
        tl.fromTo(img, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 2.4, ease: 'power2.out' }, 0);
        tl.fromTo(root, { '--sweep': -0.4 }, { '--sweep': 1.4, duration: 2.2, ease: 'power2.inOut' }, 0.1);
      } else {
        tl.to(lamp, { scaleX: 1, opacity: 1, duration: 1.6, ease: 'expo.out' }, 0.05);
      }
      tl.to(beam, { scaleX: 1, duration: 1.8, ease: 'expo.out' }, 0.1)
        .to(chars, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: { each: 0.06, from: 'center' } }, 0.3)
        .to(fades, { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }, 0.9);
    },
  };
}
