import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import 'lenis/dist/lenis.css';
import './styles/main.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from './lib/dom';
import { loadMedia } from './lib/media';
import { Sound } from './lib/sound';
import { initConfig } from './modules/config';
import { initCursor } from './modules/cursor';
import { initDetails } from './modules/details';
import { runGate } from './modules/gate';
import { initGrain } from './modules/grain';
import { initHero } from './modules/hero';
import { initIgnite } from './modules/ignite';
import { initLegend } from './modules/legend';
import { initMachine } from './modules/machine';
import { initNav } from './modules/nav';
import { initReserve } from './modules/reserve';
import { initRide } from './modules/ride';
import { initSmooth } from './modules/smooth';
import { initSpecs } from './modules/specs';

gsap.registerPlugin(ScrollTrigger);
// Mobile address bars resize the viewport while scrolling; don't re-measure every pin when that happens.
ScrollTrigger.config({ ignoreMobileResize: true });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

async function boot(): Promise<void> {
  const reduced = reducedMotion();
  const media = await loadMedia();
  const sound = new Sound();
  // Exposed for tools/shoot.mjs, which checks the audio engine really starts after the entry tap.
  (window as unknown as { __sound: Sound }).__sound = sound;
  const lenis = initSmooth(reduced);

  initGrain();
  initCursor(sound);

  // Sections are initialised in page order: each pinned section's spacing must exist before the next measures itself.
  const hero = initHero(media, reduced);
  initLegend(media, reduced);
  const machine = initMachine(media);
  initIgnite(sound, reduced);
  initDetails(media);
  initSpecs(reduced);
  initRide(media, lenis, reduced);
  initConfig(media, sound);
  initReserve(sound);
  initNav(lenis, sound);

  await runGate({
    sound,
    lenis,
    tasks: [() => document.fonts.ready, (report) => hero.preload(report), (report) => machine.preload(report)],
  });
  ScrollTrigger.refresh();
  hero.intro();
}

void boot();
