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
import { initControls } from './modules/controls';
import { initFeelings } from './modules/feelings';
import { runGate } from './modules/gate';
import { initHero } from './modules/hero';
import { initInside } from './modules/inside';
import { initMake } from './modules/make';
import { initNav } from './modules/nav';
import { initPlay } from './modules/play';
import { initSpecs } from './modules/specs';
import { renderStack } from './modules/stack';
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

  // Sections register their slots in page order.
  const hero = initHero({ director, brain, robot, sound, reduced });
  initChat({ director, brain, sound });
  const inside = initInside({ director, robot, brain, stage, sound });
  const feelings = initFeelings({ director, brain, sound, ledHex: LEDS[start.led].hex });
  const play = initPlay({ director, board, brain, robot, sound, lenis });
  const make = initMake({ director, brain, sound, reduced });
  initSpecs({ director, reduced });
  const adopt = initAdopt({ director, brain, robot, sound, box, toast: toaster() });
  director.add({ id: 'footer', el: $('[data-slot="footer"]'), mood: 'asleep', draggable: true, yaw: 0 });
  initNav(sound);
  initControls(stage, robot, brain, director);

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
    if (changed === 'led') feelings.recolor(LEDS[b.led].hex);
  });

  // Exposed for tools/shoot.mjs (state probes) and for poking around in the console.
  Object.assign(window, { __sound: sound, __nibbo: { robot, brain, director, board, box, stage, bot } });

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
    stage.scene.updateMatrixWorld();
    inside.update();
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
