import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/caveat';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import './styles/main.css';

import type Lenis from 'lenis';
import * as THREE from 'three';
import { siClaude, siThreedotjs, siTypescript, siVercel, siVite, siWebassembly } from 'simple-icons';
import { $ } from '@portfolio-lab/kit/dom';
import { runGate } from '@portfolio-lab/kit/gate';
import { brandLogo, playwrightLogo, renderBadges, waveformLogo } from '@portfolio-lab/kit/stack';
import { Delivery, type Ride } from './app/delivery';
import { Hub } from './app/hub';
import { Input } from './app/input';
import { Kitchen, STEPS, type SendInfo, type StepId } from './app/kitchen';
import { Stamps } from './app/stamps';
import { clearNotes, closeSheet, note, setPlace, wait } from './app/ui';
import { Sound } from './lib/sound';
import { store } from './lib/store';
import { Bake } from './pizza/bake';
import { loadRapier, Physics } from './pizza/physics';
import { Pizza } from './pizza/pizza';
import { PizzaBox } from './world/box';
import { buildDetails } from './world/details';
import { buildDoorstep, buildFacade } from './world/facade';
import { easeInOut, easeOut, Puffs, tween } from './world/fx';
import { buildOven, buildPeels } from './world/oven';
import { Rig, type PlaceId } from './world/places';
import { buildProps } from './world/props';
import { loadEnv } from './world/pbr';
import { BOARD_SPOT, buildRoom } from './world/room';
import { Stage } from './world/stage';
import { LITE, mediaUrl, preferLite, webgl2 } from './lib/quality';
import { batchStatic } from './world/batch';

const base = import.meta.env.BASE_URL;
type Route = 'strada' | 'sala' | 'menu' | 'famiglia' | 'lievito' | 'fronte' | StepId | 'viaggio' | 'casa';
const STEP_IDS = STEPS.map((s) => s.id) as string[];
const ROUTES = ['strada', 'sala', 'menu', 'famiglia', 'lievito', 'fronte', 'viaggio', 'casa', ...STEP_IDS];

type Trouble = 'unsupported' | 'crash' | 'lost' | 'slow';

const TROUBLE: Record<Trouble, [string, string, { lite: boolean; retry: boolean; wait: boolean }]> = {
  unsupported: [
    'Questo browser non accende il forno.',
    'NOVANTA is a 3D pizzeria built on WebGL 2, which this browser doesn’t support or has switched off. Open it in an up-to-date Chrome, Safari, Edge or Firefox.',
    { lite: false, retry: false, wait: false },
  ],
  crash: [
    'Il forno si è spento.',
    'Something went wrong while lighting the oven. Try again, or open the light version made for older phones.',
    { lite: true, retry: true, wait: false },
  ],
  lost: [
    'Il forno si è spento.',
    'This device ran out of graphics memory. The light version is made for exactly this: half-size textures, fewer lights.',
    { lite: true, retry: true, wait: false },
  ],
  slow: [
    'Ci vuole un po’…',
    'This is taking longer than it should: a slow connection, or an older device. The light version loads much faster.',
    { lite: true, retry: false, wait: true },
  ],
};

/** Shows the fallback card instead of an endless loader. */
function trouble(kind: Trouble, err?: unknown): void {
  const el = document.querySelector<HTMLElement>('[data-fallback]');
  if (!el) return;
  const [it, en, show] = TROUBLE[kind];
  // The picture is only fetched when the card is actually shown.
  const img = el.querySelector<HTMLImageElement>('img[data-src]');
  if (img && !img.src) img.src = img.dataset.src!;
  el.querySelector('[data-fallback-it]')!.textContent = it;
  el.querySelector('[data-fallback-en]')!.textContent = en;
  (el.querySelector('[data-fallback-lite]') as HTMLElement).hidden = !show.lite || LITE;
  (el.querySelector('[data-fallback-retry]') as HTMLElement).hidden = !show.retry;
  (el.querySelector('[data-fallback-wait]') as HTMLElement).hidden = !show.wait;
  el.querySelector('[data-fallback-retry]')!.addEventListener('click', () => location.reload());
  el.querySelector('[data-fallback-wait]')!.addEventListener('click', () => (el.hidden = true));
  el.hidden = false;
  if (kind === 'lost' || kind === 'slow') preferLite();
  if (err) console.error(err);
}

async function boot(): Promise<void> {
  if (!webgl2()) return trouble('unsupported');
  const page = { background: 'dark', ink: '#f4eee3' } as const;
  renderBadges($('[data-badges]'), [
    { name: 'Claude Code', logo: brandLogo(siClaude, page) },
    { name: 'TypeScript', logo: brandLogo(siTypescript, page) },
    { name: 'three.js', logo: brandLogo(siThreedotjs, page) },
    { name: 'Rapier (WebAssembly)', logo: brandLogo(siWebassembly, page) },
    { name: 'GLSL shaders', mark: '#ff8a3a' },
    { name: 'Web Audio API', logo: waveformLogo(page.ink) },
    { name: 'Vite', logo: brandLogo(siVite, page) },
    { name: 'Playwright', logo: playwrightLogo },
    { name: 'Vercel', logo: brandLogo(siVercel, page) },
  ]);

  const canvas = $<HTMLCanvasElement>('[data-stage]');
  // A phone out of graphics memory loses the WebGL context: say so (and offer lite) instead of a black screen.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    trouble('lost');
  });
  const stage = new Stage(canvas);
  // The bar never stalls silently: after 25 s a hint offers the light version, after 75 s the fallback card does.
  const slowHint = setTimeout(() => ($('[data-gate-slow]').hidden = LITE), 25000);
  const slowCard = setTimeout(() => !document.querySelector('[data-gate].is-ready') && trouble('slow'), 75000);
  const sound = new Sound();
  const rig = new Rig(stage);
  const input = new Input(canvas);
  const stamps = new Stamps();
  stamps.onStamp = () => sound.stamp();
  const status = $('[data-gate-status]');
  const say = (t: string): void => void (status.textContent = t);

  // ————— Loading (the gate shows real progress) —————
  let pizza!: Pizza;
  let oven!: Awaited<ReturnType<typeof buildOven>>;
  let props!: Awaited<ReturnType<typeof buildProps>>;
  let facade!: Awaited<ReturnType<typeof buildFacade>>;
  let details!: Awaited<ReturnType<typeof buildDetails>>;
  // Rapier (1.5 MB of WebAssembly) is only needed at the toppings step: it loads after the visitor is in.
  let rapier: ReturnType<typeof loadRapier> | null = null;
  const getRapier = (): ReturnType<typeof loadRapier> => (rapier ??= loadRapier());
  // Shaders are compiled once every object exists (kitchen tools, the box, the steam): see below.
  let warmDone!: () => void;
  const warmed = new Promise<void>((r) => (warmDone = r));
  // Progress the gate shows: every step of the build moves the bar, then the warm-up takes it to the end.
  let report: (f: number) => void = () => undefined;
  let reached = 0;
  const loadLog: [number, number][] = [];
  const step = (f: number): void => {
    reached = Math.max(reached, f);
    report(reached);
    loadLog.push([Math.round(f * 100), Math.round(performance.now())]);
  };
  // For the test tooling (tools/out/load-*.mjs): when each loading step finished.
  (window as unknown as { __novantaLoad: typeof loadLog }).__novantaLoad = loadLog;
  // Lets the bar redraw between heavy steps.
  const breathe = (): Promise<unknown> => new Promise((r) => requestAnimationFrame(r));
  const world = (async () => {
    await document.fonts.ready;
    step(0.04);
    say('Sweeping the floor…');
    const env = await loadEnv(stage.renderer, base);
    if (env) stage.setEnvironment(env, 0.22);
    step(0.08);
    await breathe();
    const room = await buildRoom(base);
    batchStatic(room.group);
    stage.scene.add(room.group);
    step(0.22);
    say('Lighting the oven…');
    await breathe();
    oven = await buildOven('NOVANTA', base);
    stage.scene.add(oven.group);
    step(0.34);
    await breathe();
    props = await buildProps(base, stamps.canvas);
    stamps.onDraw = () => props.syncDiploma();
    step(0.42);
    await breathe();
    details = await buildDetails(base, [new THREE.Vector3(-1.9, 0, 1.4), new THREE.Vector3(-0.4, 0, 1.6)]);
    // Hundreds of small static parts become a few dozen draws (see batch.ts).
    batchStatic(details.group);
    batchStatic(props.group);
    stage.scene.add(details.group);
    stage.scene.add(props.group);
    step(0.5);
    say('Rolling up the street…');
    await breathe();
    facade = await buildFacade(base);
    stage.scene.add(facade.group);
    stage.scene.add(buildDoorstep().group);
    step(0.6);
    say('Tearing the mozzarella…');
    await breathe();
    pizza = await Pizza.create(base);
    // The dough ball waits on the work board until someone starts a pizza.
    pizza.group.position.copy(BOARD_SPOT);
    stage.scene.add(pizza.group);
    rig.jump('strada');
  })();

  const lenisStub = { stop() {}, start() {} } as unknown as Lenis;
  let pulled = 0;
  const gateDone = runGate({
    root: $('[data-gate]'),
    sound,
    lenis: lenisStub,
    tasks: [
      (r) => {
        report = r;
        r(reached);
        return world.then(() => step(0.62)).then(() => warmed).then(() => r(1));
      },
    ],
    minMs: 1800,
    maxMs: 600000,
    progress: (k) => ($('[data-gate-fill]').style.width = `${(k * 100).toFixed(1)}%`),
    leave: async (withSound, reveal) => {
      $('[data-gate]').classList.add('is-leaving');
      if (withSound) sound.setFire(0.15);
      sound.shutter(1.1);
      await tween(1.1, (k) => facade.setOpen(pulled + (1 - pulled) * k), easeOut);
      // Walk in through the door. The room becomes interactive only once the camera has arrived, so nothing the
      // visitor taps can be overridden by the end of this move.
      const wanted = location.hash.slice(1);
      if (!wanted || wanted === 'strada' || wanted === 'sala') {
        await rig.go('soglia', 1.6, 0.05);
        await rig.go('sala', 1.8, 0.05);
      }
      reveal();
    },
  });
  await world;

  // The shutter can be dragged up by hand before entering.
  const pull = $('[data-gate-pull]');
  let y0 = 0;
  pull.addEventListener('pointerdown', (e) => {
    y0 = e.clientY;
    pull.setPointerCapture(e.pointerId);
  });
  pull.addEventListener('pointermove', (e) => {
    if (!pull.hasPointerCapture(e.pointerId)) return;
    pulled = Math.max(0, Math.min(0.9, (y0 - e.clientY) / (innerHeight * 0.5)));
    facade.setOpen(pulled);
  });
  pull.addEventListener('pointerup', (e) => {
    if (!pull.hasPointerCapture(e.pointerId)) return;
    pull.releasePointerCapture(e.pointerId);
    if (pulled > 0.25) $<HTMLButtonElement>('[data-enter="sound"]').click();
    else {
      const from = pulled;
      void tween(0.35, (k) => facade.setOpen(from * (1 - k)));
      pulled = 0;
    }
  });

  // ————— The kitchen, the corners, the ride —————
  let physics: Physics | null = null;
  const getPhysics = async (): Promise<Physics> => (physics ??= new Physics(await getRapier()));
  const delivery = new Delivery(sound);
  const arrivalBox = new PizzaBox();
  arrivalBox.group.visible = false;
  stage.scene.add(arrivalBox.group);
  const steam = new Puffs(stage.camera, '#ffffff', 0.1, 80);
  stage.scene.add(steam.mesh);
  let steaming = false;

  const kitchen = new Kitchen({
    stage,
    rig,
    input,
    oven,
    peels: buildPeels(),
    pizza,
    physics: getPhysics,
    sound,
    stamps,
    onSend: (info) => void send(info),
    onExit: () => go('sala'),
  });
  const hub = new Hub({
    stage,
    input,
    rig,
    props,
    sound,
    stamps,
    makePizza: () => {
      if (!kitchen.started || route === 'casa' || route === 'viaggio') kitchen.fresh();
      go((kitchen.step ?? 'impasto') as Route);
    },
    bakeClassic: (cl) => {
      closeSheet();
      leaveCurrent('impasto');
      route = 'impasto';
      stage.shadowsLive = true;
      void kitchen.bakeClassic(cl);
    },
    go: (p) => go(p as Route),
  });

  stage.tick((dt, t) => {
    pizza.update(dt);
    oven.update(dt, t);
    facade.update(dt, t);
    details.update(dt, t);
    pizza.surface.uTime.value = t;
    rig.update(dt);
    steam.update(dt);
    if (steaming && Math.random() < dt * 8) {
      const p = pizza.group.getWorldPosition(new THREE.Vector3());
      const a = Math.random() * Math.PI * 2;
      steam.burst(p.add(new THREE.Vector3(Math.cos(a) * 0.08, 0.01, Math.sin(a) * 0.08)), 1, 0.004, 0.05, 0.035, 2.2);
    }
  });

  // Every shader the site will use is compiled now, in the background and for the buffer the scene really renders
  // into; only then does the first frame draw (otherwise that frame compiles them all at once and freezes the tab).
  say('Warming up the oven…');
  await stage.warm((f) => step(0.62 + f * 0.37));
  stage.start();
  warmDone();

  // Pointer parallax in the dining room.
  addEventListener('pointermove', (e) => {
    if (route !== 'sala' && route !== 'strada') return rig.sway.set(0, 0);
    rig.sway.set((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
  });

  // Sound toggle = the radio's power.
  const radioBtn = $('[data-radio]');
  sound.onRadio((on) => {
    radioBtn.setAttribute('aria-pressed', String(on));
    $('[data-radio-label]').textContent = on ? 'Radio Napoli' : 'Radio off';
  });
  radioBtn.addEventListener('click', () => {
    sound.setRadio(!sound.radio);
    if (sound.radio) note('Radio Napoli, 90.0 FM.', '“Valzer del forno”, an old waltz for mandolin. (We wrote it.)', 3200);
  });

  // ————— Routing —————
  let route: Route = 'strada';
  // Every place has a way back to the dining room: the back button in the bar (and the logo).
  const backBtn = $('[data-back]');
  backBtn.addEventListener('click', () => go('sala'));
  $('[data-go]').addEventListener('click', () => go('sala'));

  const leaveCurrent = (next: Route): void => {
    const wasKitchen = STEP_IDS.includes(route);
    const toKitchen = STEP_IDS.includes(next);
    if (wasKitchen && !toKitchen) kitchen.hide();
    if (route === 'viaggio' && next !== 'viaggio') delivery.hide();
    if (route === 'casa' && next !== 'casa') {
      arrivalBox.group.visible = false;
      steaming = false;
    }
    hub.leave();
    clearNotes();
    if (!toKitchen) {
      stage.setInsets({ top: 0, bottom: 0, left: 0, right: 0 });
      oven.setCutaway(false);
    }
  };

  const go = (next: Route, push = true): void => {
    if (!ROUTES.includes(next)) next = 'sala';
    if (STEP_IDS.includes(next) && !kitchen.started) next = 'impasto';
    leaveCurrent(next);
    route = next;
    // Shadow casters move in the kitchen (the pizza, toppings, the peel, the box); elsewhere shadows hold still.
    stage.shadowsLive = STEP_IDS.includes(next);
    stage.refreshShadows();
    backBtn.hidden = next === 'sala' || next === 'strada';
    if (push && location.hash.slice(1) !== next) history.pushState({ place: next }, '', `#${next}`);
    const sheetInsets = (): void => {
      const phone = innerWidth <= 760;
      stage.setInsets(phone ? { top: 56, bottom: innerHeight * 0.55, left: 0, right: 0 } : { top: 64, bottom: 0, left: 0, right: 440 });
    };
    switch (next) {
      case 'strada':
      case 'sala':
        stage.setInsets({ top: 0, bottom: 0, left: 0, right: 0 });
        void rig.go('sala', 1.6, 0.1);
        hub.enterSala();
        break;
      case 'menu':
      case 'famiglia':
      case 'lievito':
      case 'fronte':
        sheetInsets();
        void rig.go(next as PlaceId, 1.5, 0.08);
        hub.open(next as PlaceId);
        break;
      case 'viaggio': {
        const ride = Delivery.saved();
        if (!ride) return go('sala', false);
        setPlace('In viaggio', 'On the way');
        delivery.show(ride);
        break;
      }
      case 'casa':
        void arrive();
        break;
      default:
        void kitchen.go(next as StepId);
    }
  };

  addEventListener('popstate', (e) => {
    const r = ((e.state as { place?: string } | null)?.place ?? location.hash.slice(1)) as Route;
    go(r || 'sala', false);
  });

  // ————— Sending and arriving —————

  const send = async (info: SendInfo): Promise<void> => {
    if (info.name) stamps.setName(info.name);
    store.set('pizza', { pizza: pizza.save(), report: info.report, name: info.name, order: info.order });
    const ride = delivery.start(info.name, info.to);
    sound.beep();
    await wait(300);
    leaveCurrent('viaggio');
    route = 'viaggio';
    backBtn.hidden = false;
    history.pushState({ place: 'viaggio' }, '', '#viaggio');
    setPlace('In viaggio', 'On the way');
    delivery.show(ride);
  };

  // The ride goes on while the visitor is back in the shop: a pill in the bar counts down, the doorbell rings.
  delivery.onLeave = () => go('sala');
  const ridePill = $('[data-ride-pill]');
  let rang = false;
  ridePill.addEventListener('click', () => {
    const ride = Delivery.saved();
    if (!ride) return;
    go(Date.now() - ride.startedAt >= ride.duration ? 'casa' : 'viaggio');
  });
  setInterval(() => {
    const ride = Delivery.saved();
    const away = !!ride && route !== 'viaggio' && route !== 'casa' && route !== 'strada';
    ridePill.hidden = !away;
    if (!ride) {
      rang = false;
      return;
    }
    if (!away) return;
    const left = Math.max(0, Math.ceil((ride.duration - (Date.now() - ride.startedAt)) / 1000));
    const here = left === 0;
    ridePill.classList.toggle('is-here', here);
    $('[data-ride-eta]').textContent = here ? 'Alla porta!' : `0:${String(left).padStart(2, '0')}`;
    ridePill.setAttribute('aria-label', here ? 'Your pizza is at the door' : `Your pizza arrives in ${left} seconds`);
    if (here && !rang) {
      rang = true;
      sound.doorbell();
      note('Ding dong! È arrivata.', 'Your pizza is at the door: tap the scooter up top.', 4200);
    }
  }, 1000);

  delivery.onArrive = () => {
    route = 'casa';
    history.replaceState({ place: 'casa' }, '', '#casa');
    delivery.hide();
    void arrive();
  };

  const arrive = async (): Promise<void> => {
    const saved = store.get<{ pizza: Record<string, unknown>; report: { grade: string; seconds: number; spots: number } | null; name: string; order: number } | null>('pizza', null);
    if (!saved) return go('sala');
    // A reload loses the pizza in memory: rebuild it from what was saved when it was sent.
    if (!pizza.pieces.length && saved.pizza) {
      await pizza.preload();
      await pizza.restore(saved.pizza);
      new Bake(pizza).applyAll();
    }
    kitchen.hide();
    backBtn.hidden = false;
    setPlace('Alla porta', 'At your door');
    const spot = new THREE.Vector3(30, 0.018, -0.02);
    arrivalBox.group.visible = true;
    arrivalBox.group.position.copy(spot);
    arrivalBox.group.rotation.y = 0.15;
    arrivalBox.fold = 1;
    arrivalBox.lid = 0;
    arrivalBox.apply();
    arrivalBox.setTicket({ name: saved.name, pizza: pizza.name, lines: [], seconds: saved.report?.seconds ?? 90, grade: saved.report?.grade ?? 'Pizzaiolo', order: saved.order });
    pizza.group.position.copy(spot).setY(spot.y + 0.004);
    pizza.group.rotation.y = 0.15 + (pizza.group.rotation.y % (Math.PI * 2));
    pizza.group.visible = true;
    pizza.setWedge(0, 0, 0);
    stage.setInsets({ top: 64, bottom: innerWidth <= 760 ? innerHeight * 0.42 : 0, left: 0, right: innerWidth <= 760 ? 0 : 440 });
    rig.jump('casa');
    stage.shadowsLive = true;
    sound.doorbell();
    navigator.vibrate?.([60, 80, 60]);
    stamps.give('door');
    const el = (await import('./app/ui')).sheet(
      `<p class="sheet__kicker">Ding dong!</p>
      <h2 class="sheet__title"><span class="it">È arrivata.</span></h2>
      <p class="sheet__lead">${saved.name ? `For ${saved.name}: ` : ''}“${pizza.name}”, still warm. ${innerWidth <= 760 ? 'Swipe the lid up' : 'Drag the lid up'}, or tap below.</p>
      <p><button class="btn btn--tomato" type="button" data-open>Apri · Open the box</button></p>`,
      {},
    );
    let opened = false;
    const open = async (): Promise<void> => {
      if (opened) return;
      opened = true;
      input.set(null);
      sound.cardboard();
      await tween(0.9, (k) => {
        arrivalBox.lid = k;
        arrivalBox.apply();
      }, easeInOut);
      steaming = true;
      steam.burst(pizza.group.position.clone().setY(0.05), 14, 0.08, 0.12, 0.06, 2.5);
      delivery.clear();
      const r = saved.report;
      el.innerHTML = `<p class="sheet__kicker">Buon appetito</p>
        <h2 class="sheet__title"><span class="it">${pizza.name}</span></h2>
        <p class="sheet__lead">The very pizza you stretched, dressed and baked: the same ${r?.spots ?? 0} leopard spots, the same melted cheese, the same cuts.</p>
        ${r ? `<div class="report"><div class="report__grade">${r.grade}</div><div>Baked in ${r.seconds} s at 485 °C</div></div>` : ''}
        <p class="fineprint">Seals on your diploma: ${stamps.count}/10.</p>
        <div class="panel__row" style="margin-top:14px"><button class="btn btn--tomato" type="button" data-again>Fanne un’altra · Make another</button><button class="btn btn--paper" type="button" data-shop>Torna in pizzeria · Back to the shop</button><button class="btn btn--paper" type="button" data-card>Il diploma</button></div>`;
      el.querySelector('[data-again]')?.addEventListener('click', () => {
        kitchen.fresh();
        go('impasto');
      });
      el.querySelector('[data-shop]')?.addEventListener('click', () => {
        kitchen.fresh();
        go('sala');
      });
      el.querySelector('[data-card]')?.addEventListener('click', () => stamps.open());
    };
    el.querySelector('[data-open]')?.addEventListener('click', () => void open());
    input.set({ up: (_p, _s, v) => v.y < -300 && void open() });
  };

  // ————— Start —————
  const withSound = await gateDone;
  clearTimeout(slowHint);
  clearTimeout(slowCard);
  // A device that can't keep up: fewer pixels now, lite on its next visit.
  if (!LITE) {
    let frames = 0;
    let since = 0;
    const off = stage.tick((dt) => {
      since += dt;
      frames++;
      if (since < 5) return;
      if (frames / since < 22) {
        stage.downshift();
        preferLite();
      }
      off();
    });
  }
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => {
    void getRapier();
    void pizza.preload();
    ['p-1958', 'p-street', 'p-family'].forEach((n) => {
      const img = new Image();
      img.src = mediaUrl(base, `photos/${n}.webp`);
      void img.decode().catch(() => undefined);
    });
  });
  void withSound;
  $('[data-bar]').classList.add('is-on');
  const ride = Delivery.saved();
  const wanted = location.hash.slice(1) as Route;
  if (ride && Date.now() - ride.startedAt < ride.duration) {
    route = 'viaggio';
    history.replaceState({ place: 'viaggio' }, '', '#viaggio');
    setPlace('In viaggio', 'On the way');
    delivery.show(ride);
  } else if (ride) {
    route = 'casa';
    history.replaceState({ place: 'casa' }, '', '#casa');
    void arrive();
  } else if (wanted && wanted !== 'strada' && ROUTES.includes(wanted)) {
    go(wanted, false);
    history.replaceState({ place: wanted }, '', `#${wanted}`);
  } else {
    route = 'sala';
    history.replaceState({ place: 'sala' }, '', '#sala');
    hub.enterSala();
    note('Benvenuti da Novanta!', 'Welcome. Tap “Impasta!” to make a pizza, or look around.', 4200);
  }
  void (window as unknown as { __rides?: Ride });
  Object.assign(window, { __novanta: { stage, oven, pizza, rig, kitchen, hub, sound, stamps, delivery, facade, props, go: (r: Route) => go(r), getPhysics, arrive } });
}

void boot().catch((e) => trouble('crash', e));
