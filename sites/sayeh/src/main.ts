import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/geist-mono/index.css';
import 'lenis/dist/lenis.css';
import './styles/main.css';
import './styles/pages.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, reducedMotion } from '@portfolio-lab/kit/dom';
import { initSmooth } from '@portfolio-lab/kit/smooth';
import type { App } from './app';
import { Cart } from './lib/cart';
import { cafeStatus } from './lib/cafe';
import { Daylight } from './lib/daylight';
import { loadMedia } from './lib/media';
import { Router } from './lib/router';
import { Sound } from './lib/sound';
import { Stamps } from './lib/stamps';
import { Coach } from './ui/coach';
import { CupHost } from './ui/cup';
import { runGate } from './ui/gate';
import { initCartDrawer, initNav, initShade, initSundial, renderStack, toaster } from './ui/shell';

gsap.registerPlugin(ScrollTrigger);
// Mobile address bars resize the viewport while scrolling; don't re-measure every pin when that happens.
ScrollTrigger.config({ ignoreMobileResize: true });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

async function boot(): Promise<void> {
  const reduced = reducedMotion();
  const sound = new Sound();
  const lenis = initSmooth(reduced);
  const day = new Daylight();
  const media = await loadMedia();
  const cart = new Cart();
  const stamps = new Stamps(sound);
  const coach = new Coach();
  const cup = new CupHost(sound, day, media);
  initShade(reduced);
  let darkBadges: boolean | null = null;
  day.subscribe((s) => {
    if (s.dark === darkBadges) return;
    darkBadges = s.dark;
    renderStack(s.dark);
  });
  initSundial(day, sound, stamps);

  let resolveEntered!: (s: boolean) => void;
  const entered = new Promise<boolean>((r) => (resolveEntered = r));
  const app = { sound, lenis, cart, stamps, day, media, coach, cup, reduced, entered, toast: toaster() } as unknown as App;
  const drawer = initCartDrawer(cart, sound, stamps);
  app.openCart = drawer.open;

  // A full stamp card takes 15% off the bag.
  cart.setRewarded(stamps.complete);
  stamps.onStamp(() => cart.setRewarded(stamps.complete));

  const router = new Router(app, $('[data-view]'));
  app.router = router;
  router
    .add('/', 'home', () => import('./pages/home'))
    .add('/origins', 'origins', () => import('./pages/origins'))
    .add('/lab', 'lab', () => import('./pages/lab'))
    .add('/shop', 'shop', () => import('./pages/shop'))
    .add('/shop/:slug', 'product', () => import('./pages/product'))
    .add('/checkout', 'checkout', () => import('./pages/checkout'))
    .add('/visit', 'visit', () => import('./pages/visit'))
    .notFound(() => import('./pages/notfound'));
  initNav(sound, (fn) => router.onChange((name) => fn(name)));
  router.onChange(() => coach.cancel());

  // Footer: the café's live status, the newsletter (a demo).
  const footerStatus = $('[data-footer-status]');
  const status = (): void => {
    const s = cafeStatus();
    footerStatus.innerHTML = `<i class="dot ${s.open ? 'is-open' : ''}"></i>${s.line}`;
  };
  status();
  window.setInterval(status, 30_000);
  $<HTMLFormElement>('[data-news]').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('#news-email');
    const note = $('[data-news-note]');
    if (!input.checkValidity()) {
      note.textContent = 'That doesn’t look like an email address.';
      input.focus();
      return;
    }
    note.textContent = 'Thanks. (It’s a demo, so no letters will come.)';
    input.value = '';
    sound.stamp();
  });

  // Exposed for tools/shoot.mjs (state probes and navigation) and the console.
  Object.assign(window, { __sound: sound, __go: (p: string) => router.go(p), __sayeh: app });

  await router.start();

  const gate = runGate({
    sound,
    lenis,
    target: () => (router.current === 'home' && cup.supported ? cup.liquidRect() : null),
    tasks: [
      () => document.fonts.ready,
      () => Promise.all(['600 20px "Fraunces Variable"', '500 12px "Geist Mono Variable"', '500 12px "Instrument Sans Variable"'].map((f) => document.fonts.load(f))),
      async (report) => {
        // Run the fluid for a few frames so every shader is compiled before the first pour.
        if (cup.latte) {
          report(0.3);
          cup.latte.update(1 / 60);
          cup.latte.fluid.read();
        }
      },
      () =>
        new Promise<void>((res) => {
          if (!media.cup) return res();
          const img = new Image();
          img.onload = img.onerror = () => res();
          img.src = media.cup.src;
        }),
    ],
  });
  const withSound = await gate;
  resolveEntered(withSound);
  ScrollTrigger.refresh();
}

void boot();
