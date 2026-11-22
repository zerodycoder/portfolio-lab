import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/martian-mono/standard.css';
import 'lenis/dist/lenis.css';
import './styles/main.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initSmooth } from '@portfolio-lab/kit/smooth';
import { bot, LEDS, SHELLS } from './lib/bot';
import { $, reducedMotion } from './lib/dom';
import { Sound } from './lib/sound';
import { initAdopt } from './modules/adopt';
import { initChat } from './modules/chat';
import { initCoach } from './modules/coach';
import { initControls } from './modules/controls';
import { initFeelings } from './modules/feelings';
import { runGate } from './modules/gate';
import { initHero } from './modules/hero';
import { initInside } from './modules/inside';
import { initMake } from './modules/make';
import { initNav } from './modules/nav';
import { initPlay } from './modules/play';
import { initSpecs } from './modules/specs';
import { Speech } from './modules/speech';
import { renderStack } from './modules/stack';
import { Tricks } from './modules/tricks';
import { HeroBlocks } from './three/blocks';
import { Board } from './three/board';
import { ShipBox } from './three/box';
import { Brain } from './three/brain';
import { Director } from './three/director';
import { Robot } from './three/robot';
import { Stage } from './three/stage';

gsap.registerPlugin(ScrollTrigger);
// Mobile address bars resize the viewport while scrolling; don't re-measure every pin when that happens.
ScrollTrigger.config({ ignoreMobileResize: true });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

function toaster(): (msg: string) => void {
  const el = $('[data-toast]');
  let timer = 0;
  return (msg) => {
    el.textContent = msg;
    el.classList.add('is-shown');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.remove('is-shown'), 2400);
  };
}

/** The footer's night sky: a scatter of twinkling stars, each on its own beat. */
function scatterStars(sky: HTMLElement): void {
  for (let i = 0; i < 46; i++) {
    const star = document.createElement('i');
    const big = Math.random() < 0.18;
    star.style.cssText = `left:${(1 + Math.random() * 96).toFixed(2)}%;top:${(Math.random() * 70).toFixed(2)}%;animation-delay:${(Math.random() * -3).toFixed(2)}s;animation-duration:${(2 + Math.random() * 3).toFixed(2)}s;${big ? 'width:4px;height:4px;' : ''}`;
    sky.appendChild(star);
  }
}

async function boot(): Promise<void> {
  renderStack();
  const reduced = reducedMotion();
  const sound = new Sound();
  const lenis = initSmooth(reduced);

  let stage: Stage;
  try {
    stage = new Stage($<HTMLCanvasElement>('[data-stage]'));
  } catch {
    // No WebGL (very old device, or it's switched off): say so on the gate instead of showing a broken page.
    $('[data-gate-title]').textContent = 'Nibbo needs WebGL to wake up';
    $('.gate__battery').remove();
    $('.gate__count').textContent = 'Try a recent browser, or switch hardware acceleration on.';
    return;
  }
  const start = bot.get();
  const robot = new Robot(SHELLS[start.shell].hex, LEDS[start.led].hex);
  robot.setAccessory(start.accessory);
  stage.scene.add(robot.root);
  const brain = new Brain(robot, sound, reduced);
  const director = new Director(stage, robot, brain, reduced);
  const board = new Board(stage);
  const box = new ShipBox(stage);

  const tricks = new Tricks(sound);
  const speech = new Speech(stage, robot);
  const blocks = new HeroBlocks(stage, () => {
    sound.tok();
    tricks.find('bop');
  });
  const heroEl = $('.hero');

  // Sections register their slots in page order.
  const hero = initHero({ director, brain, robot, sound, speech, reduced });
  const chat = initChat({ director, brain, sound, ledHex: LEDS[start.led].hex });
  const inside = initInside({ director, robot, brain, stage, sound, lenis, tricks });
  const feelings = initFeelings({ director, brain, sound, tricks, ledHex: LEDS[start.led].hex });
  const play = initPlay({ director, board, brain, robot, sound, lenis, tricks });
  const make = initMake({ director, brain, robot, sound, tricks, reduced });
  initSpecs({ director, reduced });
  const adopt = initAdopt({ director, brain, robot, sound, box, tricks, toast: toaster() });
  director.add({ id: 'footer', el: $('[data-slot="footer"]'), mood: 'asleep', draggable: true, yaw: 0 });
  initNav(sound);
  initControls(stage, robot, brain, director);
  const coach = initCoach({ director, brain, tricks, speech, name: () => bot.get().name });
  scatterStars($('[data-sky]'));

  // One store drives the robot, the page accent and every price on the page.
  const root = document.documentElement;
  bot.subscribe((b, changed) => {
    const shell = SHELLS[b.shell];
    robot.setShell(shell.hex);
    robot.setLed(LEDS[b.led].hex);
    robot.setAccessory(b.accessory);
    root.style.setProperty('--accent', shell.hex);
    root.style.setProperty('--accent-ink', shell.ink);
    document.querySelectorAll('[data-price]').forEach((n) => (n.textContent = `$${bot.price()}`));
    if (changed === 'led') {
      feelings.recolor(LEDS[b.led].hex);
      chat.recolor(LEDS[b.led].hex);
    }
  });

  // Exposed for tools/shoot.mjs (state probes) and for poking around in the console.
  Object.assign(window, { __sound: sound, __nibbo: { robot, brain, director, board, box, stage, bot, tricks, speech } });

  // One frame loop for everything 3D, on GSAP's ticker (shared with Lenis and ScrollTrigger).
  gsap.ticker.add((_time, deltaMs) => {
    const dt = Math.min(0.05, deltaMs / 1000);
    play.update();
    adopt.update();
    make.update(dt);
    director.update(dt);
    brain.update(dt);
    robot.update(dt);
    board.update(dt);
    blocks.update(dt, heroEl.getBoundingClientRect());
    stage.scene.updateMatrixWorld();
    inside.update();
    speech.update();
    coach.update(dt);
    stage.render();
  });

  const entered = runGate({
    sound,
    lenis,
    stage,
    robot,
    tasks: [
      () => document.fonts.ready,
      async (report) => {
        // Compile every shader up front (including the board and the box, briefly made visible) so nothing
        // stutters the first time it appears.
        board.group.visible = true;
        box.group.visible = true;
        robot.setExplode(0.5);
        report(0.2);
        await stage.renderer.compileAsync(stage.scene, stage.camera);
        report(0.8);
        stage.render();
        robot.setExplode(0);
        board.group.visible = false;
        box.group.visible = false;
      },
    ],
  });
  robot.face.set('asleep');
  brain.react('asleep', 999, false);
  await entered;
  brain.react('surprised', 0.6, false);
  ScrollTrigger.refresh();
  hero.intro();
}

void boot();
