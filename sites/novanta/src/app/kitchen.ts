import * as THREE from 'three';
import { $ } from '@portfolio-lab/kit/dom';
import { vibrate } from '@portfolio-lab/kit/dom';
import { Bake, OVEN_SPEED, type BakeReport } from '../pizza/bake';
import { CLASSICS, DRIZZLES, KIND, KINDS, SAUCES, SIZES, type Classic, type DrizzleId, type Kind } from '../pizza/catalog';
import type { Physics } from '../pizza/physics';
import type { Piece, Pizza } from '../pizza/pizza';
import { Slicer } from '../pizza/slice';
import type { Sound } from '../lib/sound';
import { PizzaBox } from '../world/box';
import { buildLadle, buildWheel, easeIn, easeInOut, easeOut, Puffs, tween } from '../world/fx';
import { OVEN, OVEN_SPOT, type Oven } from '../world/oven';
import type { Rig } from '../world/places';
import { BOARD_SPOT } from '../world/room';
import type { Stage } from '../world/stage';
import type { Input, Pt } from './input';
import type { Stamps } from './stamps';
import { clearNotes, euro, isPhone, note, setPlace, spriteChip, wait } from './ui';

export type StepId = 'impasto' | 'condimenti' | 'forno' | 'taglio' | 'consegna';
export const STEPS: { id: StepId; it: string; en: string }[] = [
  { id: 'impasto', it: 'Impasto', en: 'The dough' },
  { id: 'condimenti', it: 'Condimenti', en: 'Toppings' },
  { id: 'forno', it: 'Forno', en: 'The oven' },
  { id: 'taglio', it: 'Taglio', en: 'Finish & cut' },
  { id: 'consegna', it: 'Consegna', en: 'Box & send' },
];

export type KitchenCtx = {
  stage: Stage;
  rig: Rig;
  input: Input;
  oven: Oven;
  peels: { peel: THREE.Group; palino: THREE.Group };
  pizza: Pizza;
  physics: () => Promise<Physics>;
  sound: Sound;
  stamps: Stamps;
  /** Called when the box has been sent. */
  onSend: (info: SendInfo) => void;
  onExit: () => void;
};

export type SendInfo = { name: string; to: string; report: BakeReport | null; order: number };

const html = String.raw;

export class Kitchen {
  step: StepId | null = null;
  private done = new Set<StepId>();
  private bake: Bake;
  private slicer: Slicer;
  private box = new PizzaBox();
  private flour: Puffs;
  private steam: Puffs;
  private ladle = buildLadle();
  private wheel = buildWheel();
  private physics: Physics | null = null;
  private history: Piece[][] = [];
  private report: BakeReport | null = null;
  private said = new Set<string>();
  private noteAt = new Set<string>();
  private steamOn = false;
  private classic: Classic | null = null;
  private order = 100 + Math.floor(Math.random() * 800);
  private drizzle: DrizzleId | null = null;
  private tickers: ((dt: number) => void)[] = [];
  private panelEl = $('[data-panel]');
  private name = '';
  private dest = 'desk';

  constructor(private readonly c: KitchenCtx) {
    this.bake = new Bake(c.pizza);
    this.slicer = new Slicer(c.pizza);
    this.flour = new Puffs(c.stage.camera, '#fffaf0', 0.55);
    this.steam = new Puffs(c.stage.camera, '#ffffff', 0.1, 120);
    c.stage.scene.add(this.flour.mesh, this.steam.mesh, this.ladle, this.wheel, this.box.group, c.peels.peel, c.peels.palino);
    this.ladle.visible = false;
    this.wheel.visible = false;
    this.box.group.visible = false;
    c.peels.peel.visible = false;
    c.peels.palino.visible = false;
    this.slicer.onSnap = () => {
      c.sound.snap();
      vibrate(8);
    };
    let lastStretch = 0;
    this.slicer.onStretch = (a) => {
      if (performance.now() - lastStretch > 140) {
        lastStretch = performance.now();
        c.sound.stretch(a);
      }
    };
    c.stage.tick((dt) => this.update(dt));
    this.renderSteps();
    $('[data-ticket-pill]').addEventListener('click', () => {
      const t = $('[data-ticket]');
      t.classList.toggle('is-open');
      $('[data-ticket-pill]').setAttribute('aria-expanded', String(t.classList.contains('is-open')));
    });
  }

  get pizza(): Pizza {
    return this.c.pizza;
  }

  /** Has a pizza been started (so coming back to the kitchen resumes it)? */
  get started(): boolean {
    return this.step !== null;
  }

  get reportNow(): BakeReport | null {
    return this.report;
  }

  // ————— Frame —————

  private update(dt: number): void {
    this.flour.update(dt);
    this.steam.update(dt);
    if (this.steamOn && Math.random() < dt * 9) {
      const p = this.pizza.group.getWorldPosition(new THREE.Vector3());
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * this.pizza.radius * 0.8;
      this.steam.burst(p.add(new THREE.Vector3(Math.cos(a) * r, 0.01, Math.sin(a) * r)), 1, 0.004, 0.05, 0.035, 2.2);
    }
    this.slicer.update(dt);
    this.physics?.step(dt);
    this.tickers.forEach((fn) => fn(dt));
  }

  // ————— Layout —————

  private renderSteps(): void {
    $('[data-steps]').innerHTML = STEPS.map(
      (s, i) => `<li class="${s.id === this.step ? 'is-now' : ''} ${this.done.has(s.id) ? 'is-done' : ''}"><b>${i + 1}</b><span class="it">${s.it}</span></li>`,
    ).join('');
  }

  /** The 3D view is framed in whatever the panel, the ticket and the bars leave free. */
  layout(): void {
    const phone = isPhone();
    const panel = this.panelEl.getBoundingClientRect();
    const top = (phone ? 56 : 64) + 52;
    if (phone) this.c.stage.setInsets({ top, bottom: this.panelEl.hidden ? 20 : Math.max(120, innerHeight - panel.top + 8), left: 0, right: 0 });
    else this.c.stage.setInsets({ top, bottom: 24, left: this.panelEl.hidden ? 0 : panel.right + 12, right: 270 });
    this.c.rig.refit();
  }

  private panel(content: string): void {
    this.panelEl.innerHTML = content;
    this.panelEl.classList.remove('is-out');
    requestAnimationFrame(() => this.layout());
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.panelEl.querySelector(sel) as T;
  }

  private renderTicket(): void {
    const lines = this.pizza.lines;
    const total = this.pizza.price;
    $('[data-ticket-total]').textContent = euro(total);
    $('[data-ticket-paper]').innerHTML = html`<div class="ticket__head"><b>NOVANTA</b>Vico Novanta, 90 · Napoli<br />Ordine N° ${String(this.order).padStart(4, '0')}</div>
      ${lines.map(([it, en, p]) => `<div class="ticket__line"><span>${it}<small>${en}</small></span><span>${p ? euro(p) : '—'}</span></div>`).join('')}
      <div class="ticket__total"><span>TOTALE</span><span>${euro(total)}</span></div>
      ${this.pizza.name ? `<div class="ticket__name">“${this.pizza.name}”</div>` : ''}`;
  }

  private sayOnce(key: string, it: string, en: string, ms?: number): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    note(it, en, ms);
  }

  // ————— Flow —————

  /** Starts a fresh pizza. */
  fresh(): void {
    const p = this.pizza;
    p.clearStage('cheese');
    p.clearStage('pre');
    p.clearStage('post');
    p.layers.clear();
    p.layers.clearHeat();
    p.sauce = null;
    p.cheese = null;
    p.drizzles.clear();
    p.name = '';
    p.setPuff(0);
    p.setPress(0);
    p.group.position.copy(BOARD_SPOT);
    p.group.rotation.set(0, 0, 0);
    p.group.visible = true;
    p.surface.uBubbling.value = 0;
    p.setWedge(0, 0, 0);
    this.slicer.reset();
    this.done.clear();
    this.history = [];
    this.report = null;
    this.classic = null;
    this.drizzle = null;
    this.order++;
    this.box.group.visible = false;
    this.c.oven.setCutaway(false);
    this.physics?.freeze();
    this.step = null;
    this.renderTicket();
  }

  async go(step: StepId): Promise<void> {
    if (this.step) this.leave();
    this.step = step;
    this.renderSteps();
    $('[data-kitchen]').hidden = false;
    const s = STEPS.find((x) => x.id === step)!;
    setPlace(s.it, s.en);
    clearNotes();
    this.renderTicket();
    switch (step) {
      case 'impasto':
        return this.impasto();
      case 'condimenti':
        return this.condimenti();
      case 'forno':
        return this.forno();
      case 'taglio':
        return this.taglio();
      case 'consegna':
        return this.consegna();
    }
  }

  leave(): void {
    this.c.input.set(null);
    this.tickers = [];
    this.ladle.visible = false;
    this.wheel.visible = false;
    $('[data-bake]').hidden = true;
  }

  hide(): void {
    this.leave();
    $('[data-kitchen]').hidden = true;
  }

  private next(step: StepId): void {
    if (this.step) this.done.add(this.step);
    void this.go(step);
    history.pushState({ place: step }, '', `#${step}`);
  }

  // ————— Pointer helpers —————

  /** A screen point → pizza space on the dough's top plane. */
  private onPizza(p: Pt, lift = 0): THREE.Vector3 | null {
    const y = this.pizza.group.position.y + this.pizza.shape.base + lift;
    const w = this.c.stage.pointOnPlane(p.x, p.y, y);
    if (!w) return null;
    return this.pizza.group.worldToLocal(w.clone());
  }

  // ————— 1. Impasto —————

  private async impasto(): Promise<void> {
    const p = this.pizza;
    if (p.phase === 'ball' && p.press === 0 && !p.pieces.length) {
      this.fresh();
      this.step = 'impasto';
      this.renderSteps();
    }
    this.c.rig.go('banco', 1.6);
    const render = (): void => {
      const phase = p.phase;
      if (phase === 'ball' || phase === 'press') {
        const presses = Math.round(p.press * 3);
        this.panel(html`<p class="panel__kicker">1 · Impasto</p>
          <h2 class="panel__title"><span class="it">Schiaccia</span> the ball</h2>
          <p class="panel__lead">Forty-eight hours of slow rising made this dough. Press it flat with your fingertips: <b>tap the ball</b>, three times.</p>
          <div class="panel__row" aria-label="Presses">${[0, 1, 2].map((i) => `<span style="width:28px;height:28px;border-radius:50%;display:inline-block;background:${i < presses ? 'var(--tomato)' : 'rgba(35,28,23,.12)'}"></span>`).join('')}</div>
          <div class="panel__foot"><span class="hint">Tap the dough</span><button class="btn btn--paper btn--small" type="button" data-auto>Fallo tu · Do it for me</button></div>`);
      } else {
        const cm = Math.round(p.radius * 200);
        const ok = p.radius >= 0.127;
        const size = p.size;
        this.panel(html`<p class="panel__kicker">1 · Impasto</p>
          <h2 class="panel__title"><span class="it">Stendi</span> the dough</h2>
          <p class="panel__lead">${isPhone() ? 'Pinch it wider with two fingers, or drag outwards from the middle.' : 'Drag outwards from the middle to stretch it; drag an edge to pull just that side.'} Push the air to the rim: that’s the cornicione.</p>
          <p class="readout" data-cm>${cm} cm<small>${ok ? size.it : 'keep going'}</small></p>
          <div class="sizes">${SIZES.map((s) => `<span class="${ok && s.cm === size.cm ? 'is-on' : ''}">${s.cm} cm · ${s.it}</span>`).join('')}</div>
          <div class="panel__foot"><button class="btn btn--paper btn--small" type="button" data-auto>Stendila tu · Stretch it for me</button><button class="btn btn--tomato" type="button" data-next ${ok ? '' : 'disabled'}>Avanti →</button></div>`);
      }
      this.q('[data-auto]')?.addEventListener('click', () => void auto());
      this.q('[data-next]')?.addEventListener('click', () => finish());
    };
    const press = async (): Promise<void> => {
      if (p.phase !== 'ball' && p.phase !== 'press') return;
      const from = p.press;
      const to = Math.min(1, Math.round(from * 3 + 1) / 3);
      this.c.sound.thud(1);
      this.c.sound.puff();
      vibrate(10);
      this.flour.burst(p.group.position.clone().setY(p.group.position.y + 0.01), 14, 0.06, 0.12, 0.05, 1.1);
      await tween(0.26, (k) => {
        p.setPress(from + (to - from) * k);
        p.group.scale.set(1 + Math.sin(k * Math.PI) * 0.04, 1 - Math.sin(k * Math.PI) * 0.12, 1 + Math.sin(k * Math.PI) * 0.04);
      }, easeOut);
      p.group.scale.set(1, 1, 1);
      if (to >= 1) this.sayOnce('stretch', 'Brava! Ora stendila.', 'Good. Now stretch it.');
      render();
    };
    const auto = async (): Promise<void> => {
      while (p.phase === 'ball' || p.phase === 'press') await press();
      const from = p.radius;
      p.working = true;
      await tween(1.4, (k) => p.ring.pullAll(from + (0.152 - from) * k), easeInOut);
      p.ring.release();
      await wait(500);
      p.working = false;
      render();
    };
    let mode: 'none' | 'all' | 'edge' = 'none';
    let pinchFrom = 0;
    let lastRender = 0;
    const live = (): void => {
      if (performance.now() - lastRender < 120) return;
      lastRender = performance.now();
      const el = this.q('[data-cm]');
      if (!el) return render();
      const ok = p.radius >= 0.127;
      el.innerHTML = `${Math.round(p.radius * 200)} cm<small>${ok ? p.size.it : 'keep going'}</small>`;
      const btn = this.q<HTMLButtonElement>('[data-next]');
      if (btn) btn.disabled = !ok;
      this.panelEl.querySelectorAll('.sizes span').forEach((s, i) => s.classList.toggle('is-on', ok && SIZES[i].cm === p.size.cm));
    };
    const finish = (): void => {
      p.working = false;
      p.ring.release();
      if (p.ring.roundness > 0.8 && p.radius >= 0.145) this.c.stamps.give('stretch');
      p.phase = 'done';
      p.markDirty();
      this.next('condimenti');
    };
    this.c.input.set({
      down: (pt) => {
        if (p.phase === 'ball' || p.phase === 'press') return false;
        const l = this.onPizza(pt);
        if (!l) return false;
        const r = Math.hypot(l.x, l.z);
        if (r > p.radius + 0.06) return false;
        mode = r > p.radius * 0.7 ? 'edge' : 'all';
        p.working = true;
        return true;
      },
      tap: (pt) => {
        if (p.phase !== 'ball' && p.phase !== 'press') return;
        const hit = this.c.stage.raycast(pt.x, pt.y, [p.dough]);
        if (hit.length) void press();
        else note('Tocca la palla di pasta.', 'Tap the ball of dough.', 2200);
      },
      move: (pt) => {
        const l = this.onPizza(pt);
        if (!l) return;
        const r = Math.hypot(l.x, l.z);
        if (mode === 'edge') p.ring.pull(Math.atan2(l.z, l.x), r);
        else if (mode === 'all') p.ring.pullAll(Math.max(p.radius, r));
        live();
      },
      up: () => {
        mode = 'none';
        p.ring.release();
        setTimeout(() => {
          p.working = false;
          live();
          if (p.radius > 0.175) this.sayOnce('thin', 'Piano! Si rompe.', 'Easy, it will tear.');
        }, 500);
      },
      pinch: (scale) => {
        if (p.phase !== 'stretch') return;
        if (!pinchFrom) pinchFrom = p.radius;
        p.working = true;
        p.ring.pullAll(Math.max(p.radius, pinchFrom * scale));
        live();
      },
      pinchEnd: () => {
        pinchFrom = 0;
        p.ring.release();
        setTimeout(() => ((p.working = false), live()), 500);
      },
    });
    render();
  }

  // ————— 2. Condimenti —————

  private async condimenti(): Promise<void> {
    const p = this.pizza;
    p.phase = 'done';
    p.update(0);
    this.c.rig.go('banco', 1);
    this.physics = await this.c.physics();
    this.physics.setDough(p.doughGeo.geometry);
    this.physics.onLand = (mesh, speed) => {
      const ref = mesh.userData.ref as Piece | undefined;
      if (ref) this.c.sound.drop(ref.kind.note + Math.floor(Math.random() * 3), speed * 0.6);
    };
    let tab: 'salsa' | 'formaggio' | 'condimenti' = p.sauce ? (p.cheese !== null || this.done.has('condimenti') ? 'condimenti' : 'formaggio') : 'salsa';
    let painting = false;
    let lastPt: THREE.Vector3 | null = null;
    let coverage = p.sauceCoverage();

    const render = (): void => {
      const tabs = html`<div class="tabs" role="tablist">
        ${(['salsa', 'formaggio', 'condimenti'] as const)
          .map((t, i) => `<button type="button" role="tab" data-tab="${t}" class="${t === tab ? 'is-on' : ''}"><span class="it">${['Salsa', 'Formaggio', 'Condimenti'][i]}</span>${['Sauce', 'Cheese', 'Toppings'][i]}</button>`)
          .join('')}</div>`;
      let body = '';
      if (tab === 'salsa') {
        body = html`<p class="panel__lead">Pick the base, then <b>paint it on with the ladle</b>: drag over the dough in a spiral. Keep the rim clean.</p>
          <div class="seg">${SAUCES.map((s) => `<button type="button" data-sauce="${s.id}" class="${p.sauce === s.id ? 'is-on' : ''}"><span class="it">${s.id === 'rossa' ? 'Rossa' : 'Bianca'}</span>${s.en}</button>`).join('')}</div>
          <div class="panel__row panel__meter"><div style="flex:1"><div class="meter-label"><span>Coverage</span><span data-cov>${Math.round(coverage * 100)}%</span></div><div class="meter"><i data-cov-bar style="width:${coverage * 100}%"></i></div></div></div>`;
      } else if (tab === 'formaggio') {
        body = html`<p class="panel__lead">Torn by hand this morning. Tap one to scatter a handful.</p>
          <div class="seg">${['fiordilatte', 'bufala', ''].map((id) => `<button type="button" data-cheese="${id}" class="${(p.cheese ?? '') === id && (id || p.cheese === null) ? 'is-on' : ''}"><span class="it">${id ? KIND[id].it : 'Senza'}</span>${id ? KIND[id].en + ' · ' + euro(KIND[id].price) : 'No cheese'}</button>`).join('')}</div>`;
      } else {
        const counts = new Map<string, number>();
        p.pieces.forEach((x) => !x.lost && counts.set(x.kind.id, (counts.get(x.kind.id) ?? 0) + 1));
        body = html`<p class="panel__lead">Tap for a handful, or <b>drag one onto the pizza</b> to place it. Five toppings at most: it’s Neapolitan dough.</p>
          <div class="chips" data-chips>${KINDS.filter((k) => k.stage === 'pre')
            .map((k) => `<button type="button" class="chip ${counts.get(k.id) ? 'is-on' : ''} ${!p.canAdd(k) ? 'is-off' : ''}" data-kind="${k.id}"><span class="chip__n">${counts.get(k.id) ?? ''}</span><span class="chip__price">${k.price ? euro(k.price) : ''}</span><i data-sprite="${k.id}"></i><span class="chip__it">${k.it}</span><span class="chip__en">${k.en}</span></button>`)
            .join('')}</div>
          <div class="panel__row"><button class="btn btn--paper btn--small" type="button" data-undo ${this.history.length ? '' : 'disabled'}>↶ Togli · Undo</button></div>`;
      }
      this.panel(html`<p class="panel__kicker">2 · Condimenti</p>
        <h2 class="panel__title"><span class="it">Condisci</span> it</h2>
        ${tabs}${body}
        <div class="panel__foot">${tab === 'salsa' && p.sauce ? '<button class="btn btn--paper btn--small" type="button" data-auto>Stendila tu · Spread it for me</button>' : '<span></span>'}<button class="btn btn--tomato" type="button" data-next>Avanti →</button></div>`);
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
        b.addEventListener('click', () => {
          tab = b.dataset.tab as typeof tab;
          this.c.sound.click();
          render();
        }),
      );
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-sauce]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.sauce as 'rossa' | 'bianca';
          if (p.sauce && p.sauce !== id) p.layers.clear(['layer']);
          p.sauce = id;
          this.renderTicket();
          render();
          this.sayOnce('ladle', 'Col mestolo, a spirale.', 'With the ladle, in a spiral from the middle.');
        }),
      );
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-cheese]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.cheese || null;
          p.clearStage('cheese');
          p.cheese = id;
          if (id && this.physics) {
            const ps = p.handful(KIND[id], this.physics);
            this.history.push(ps);
            if (KIND[id].say) this.sayOnce(id, ...KIND[id].say!);
          }
          this.renderTicket();
          render();
        }),
      );
      this.panelEl.querySelectorAll<HTMLElement>('[data-sprite]').forEach((i) => {
        const a = p.kinds.get(i.dataset.sprite!);
        if (a) i.replaceWith(spriteChip(a.sheet.image, a.sheet.cells[0]));
      });
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) => this.bindChip(b, KIND[b.dataset.kind!], render));
      this.q('[data-undo]')?.addEventListener('click', () => {
        const last = this.history.pop();
        last?.forEach((x) => {
          this.physics?.remove(x.mesh);
          p.removePiece(x);
        });
        this.renderTicket();
        render();
      });
      this.q('[data-auto]')?.addEventListener('click', () => void spiral());
      this.q('[data-next]')?.addEventListener('click', () => void finish());
    };

    const paint = (to: THREE.Vector3): void => {
      if (!p.sauce) return;
      const from = lastPt ?? to;
      const d = from.distanceTo(to);
      const n = Math.max(1, Math.ceil(d / 0.006));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        if (Math.hypot(x, z) < p.radius + 0.01) p.paintSauce(x, z, 0.024, 0.42);
      }
      lastPt = to.clone();
      this.c.sound.swish(Math.min(1, d * 40));
      this.ladle.visible = true;
      const w = p.group.localToWorld(to.clone().setY(p.shape.base + 0.004));
      this.ladle.position.copy(w);
      this.ladle.rotation.y = Math.atan2(to.z, -to.x) * 0.3 + Math.PI * 0.15;
    };
    const updateCoverage = (): void => {
      coverage = p.sauceCoverage();
      const bar = this.q('[data-cov-bar]');
      if (bar) {
        bar.style.width = `${Math.round(coverage * 100)}%`;
        this.q('[data-cov]').textContent = `${Math.round(coverage * 100)}%`;
      }
    };
    const spiral = async (): Promise<void> => {
      if (!p.sauce) return;
      lastPt = null;
      const R = p.radius - 0.032;
      await tween(1.8, (k) => {
        const a = k * Math.PI * 2 * 4.2;
        const r = 0.01 + k * R;
        paint(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }, (t) => t);
      lastPt = null;
      this.ladle.visible = false;
      updateCoverage();
    };
    const finish = async (): Promise<void> => {
      if (!p.sauce) {
        tab = 'salsa';
        render();
        note('Prima la salsa!', 'Sauce first: pick red or white.');
        return;
      }
      if (coverage > 0.9 && p.rimSauce() < 0.2) this.c.stamps.give('sauce');
      // Let everything settle, then sweep whatever fell off the dough.
      const t0 = performance.now();
      while (this.physics?.active && performance.now() - t0 < 1500) await wait(60);
      const lost = p.markLost();
      if (lost.length) note('Questi li mangio io.', `${lost.length} fell off. The cook eats those.`, 2600);
      lost.forEach((x) => p.removePiece(x));
      this.physics?.freeze();
      p.syncPieceMatrices();
      p.groundPieces();
      if (!p.name) p.name = p.suggestName();
      this.next('forno');
    };

    this.c.input.set({
      down: (pt) => {
        if (tab !== 'salsa' || !p.sauce) return false;
        const l = this.onPizza(pt);
        if (!l || Math.hypot(l.x, l.z) > p.radius + 0.02) return false;
        painting = true;
        lastPt = null;
        paint(l);
        return true;
      },
      move: (pt) => {
        if (!painting) return;
        const l = this.onPizza(pt);
        if (l) paint(l);
      },
      up: () => {
        painting = false;
        lastPt = null;
        this.ladle.visible = false;
        updateCoverage();
        if (p.rimSauce() > 0.25) this.sayOnce('rim', 'Il cornicione non si tocca!', 'Keep the rim clean: it has to puff.');
        else if (coverage > 0.9) this.sayOnce('cov', 'Perfetto, neanche un buco.', 'Perfect, not a gap.');
      },
    });
    render();
    this.sayOnce('cond', 'Prima il pomodoro, poi la mozzarella.', 'Tomato first, then the mozzarella, then the rest.');
  }

  /** A topping chip: tap for a handful, or drag a single piece onto the pizza. */
  private bindChip(b: HTMLButtonElement, kind: Kind, render: () => void): void {
    const p = this.pizza;
    let ghost: Piece | null = null;
    let sx = 0;
    let sy = 0;
    let dragging = false;
    let active = false;
    const add = (pieces: Piece[]): void => {
      this.history.push(pieces);
      if (kind.id === 'ananas') this.c.stamps.give('pineapple');
      if (kind.say) this.sayOnce(kind.id, ...kind.say);
      this.renderTicket();
      render();
    };
    const refuse = (): boolean => {
      if (p.canAdd(kind)) return false;
      note('È pasta napoletana, non un camion!', 'This is Neapolitan dough, not a moving truck. Five toppings at most.');
      return true;
    };
    b.addEventListener('pointerdown', (e) => {
      sx = e.clientX;
      sy = e.clientY;
      dragging = false;
      active = true;
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already released pointer */
      }
    });
    b.addEventListener('pointermove', (e) => {
      if (!active) return;
      if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
        if (refuse() || !this.physics) return;
        dragging = true;
        ghost = p.makePiece(kind);
        if (ghost) p.toppings.add(ghost.mesh);
      }
      if (dragging && ghost) {
        const l = this.onPizza({ x: e.clientX, y: e.clientY }, 0.05);
        if (l) ghost.mesh.position.set(l.x, 0.05, l.z);
        ghost.mesh.rotation.y += 0.02;
      }
    });
    const end = (e: PointerEvent): void => {
      if (!active) return;
      active = false;
      if (b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId);
      if (dragging && ghost && this.physics) {
        p.pieces.push(ghost);
        const a = p.kinds.get(kind.id)!;
        this.physics.add(ghost.mesh, a.variants[ghost.variant].hull, ghost.scale, new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5));
        add([ghost]);
      } else if (!dragging) {
        if (refuse() || !this.physics) return;
        add(p.handful(kind, this.physics));
      }
      ghost = null;
      dragging = false;
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }

  // ————— 3. Forno —————

  private async forno(): Promise<void> {
    const p = this.pizza;
    const { peel, palino } = this.c.peels;
    const oven = this.c.oven;
    const bake = this.bake;
    p.syncPieceMatrices();
    this.panel(html`<p class="panel__kicker">3 · Forno</p>
      <h2 class="panel__title"><span class="it">Sulla pala</span></h2>
      <p class="panel__lead">The peel slides under it. Carry it to the fire.</p>`);
    // The peel slides under the pizza on the board, then carries it to the oven's mouth.
    const start = BOARD_SPOT.clone();
    const mouth = new THREE.Vector3(OVEN.floor.x + 0.06, OVEN.floor.y + 0.03, OVEN.mouthZ + 0.32);
    peel.visible = true;
    peel.rotation.set(0, 0, 0);
    peel.position.copy(start).add(new THREE.Vector3(0, 0.002, 0.45));
    this.c.sound.scrape();
    await tween(0.5, (k) => peel.position.set(start.x, start.y + 0.001, start.z + 0.45 * (1 - k)), easeOut);
    const lift = 0.014;
    const path = (k: number): THREE.Vector3 => {
      const v = start.clone().lerp(mouth, k);
      v.y += Math.sin(k * Math.PI) * 0.12 + lift;
      return v;
    };
    void this.c.rig.goShot({ target: mouth.clone().add(new THREE.Vector3(-0.02, 0.05, -0.12)), dir: new THREE.Vector3(0.3, -0.42, -0.86), radius: 0.42, fov: 46 }, 1.7);
    this.c.sound.whoosh();
    await tween(1.6, (k) => {
      const v = path(k);
      p.group.position.copy(v);
      peel.position.copy(v).add(new THREE.Vector3(0, -0.012, 0));
    });
    this.c.sound.setFire(0.8);
    // Wait for the flick (or the button).
    await new Promise<void>((resolve) => {
      this.panel(html`<p class="panel__kicker">3 · Forno</p>
        <h2 class="panel__title"><span class="it">Inforna!</span></h2>
        <p class="panel__lead">One quick, confident move: <b>flick it up</b> into the oven. 485 °C in there.</p>
        <div class="panel__foot"><span class="hint">${isPhone() ? 'Swipe up' : 'Drag up fast'}</span><button class="btn btn--tomato" type="button" data-inforna>Inforna · Slide it in</button></div>`);
      this.q('[data-inforna]').addEventListener('click', () => resolve());
      this.c.input.set({ up: (_p, _s, v) => v.y < -350 && resolve() });
    });
    this.c.input.set(null);
    this.c.sound.whoosh();
    this.c.sound.scrape();
    bake.reset();
    p.setWedge(0, 0, 0);
    const inside = OVEN_SPOT.clone();
    void this.c.rig.go('forno', 1.3, 0);
    setTimeout(() => oven.setCutaway(true), 500);
    await tween(0.6, (k) => {
      p.group.position.copy(mouth.clone().lerp(inside, k));
      p.group.position.y = mouth.y + (inside.y - mouth.y) * k;
      peel.position.copy(mouth).add(new THREE.Vector3(0, -0.012, 0.0)).lerp(inside.clone().setY(inside.y - 0.01), k * 0.6);
    }, easeOut);
    await tween(0.5, (k) => peel.position.z += k * 0.04, easeIn);
    peel.visible = false;
    this.c.sound.setFire(1);
    // Bake.
    bake.running = true;
    $('[data-bake]').hidden = false;
    let fan = false;
    let turnAnim = 0;
    let pulled = false;
    let readyRang = false;
    const ring = $<HTMLCanvasElement>('[data-bake-ring]');
    const secs = $('[data-bake-secs]');
    const renderPanel = (): void => {
      this.panel(html`<p class="panel__kicker">3 · Forno · 485 °C</p>
        <h2 class="panel__title"><span class="it">Gira</span> e guarda</h2>
        <p class="panel__lead">The fire burns on the left, so that side bakes faster. <b>Drag to turn the pizza</b>, or use the buttons. Pull it out when the rim is golden and spotted.</p>
        <div class="panel__row"><button class="btn btn--paper" type="button" data-turn>↻ Gira · Turn</button><button class="btn btn--paper" type="button" data-fan>🔥 Ravviva · Fan the fire</button></div>
        <div class="panel__foot"><span class="hint" data-state>Baking…</span><button class="btn btn--tomato" type="button" data-out disabled>Sforna · Take it out</button></div>`);
      this.q('[data-turn]').addEventListener('click', () => {
        turnAnim += Math.PI / 2;
        bake.turns++;
        this.c.sound.scrape(true);
      });
      const fanBtn = this.q('[data-fan]');
      const fanOn = (on: boolean): void => {
        fan = on;
        bake.boostTarget = on ? 1.7 : 1;
        oven.fire.target = on ? 1.7 : 1;
        this.c.sound.setFire(on ? 1.6 : 1);
        if (on) {
          this.c.sound.whoosh();
          this.c.stamps.give('fire');
        }
      };
      fanBtn.addEventListener('pointerdown', () => fanOn(true));
      fanBtn.addEventListener('pointerup', () => fanOn(false));
      fanBtn.addEventListener('pointerleave', () => fan && fanOn(false));
      fanBtn.addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && fanOn(true));
      fanBtn.addEventListener('keyup', () => fanOn(false));
      this.q('[data-out]').addEventListener('click', () => void pullOut());
    };
    renderPanel();
    // Drag around the pizza to turn it.
    let lastAng: number | null = null;
    const screenCentre = (): THREE.Vector3 => this.c.stage.toScreen(p.group.position.clone());
    this.c.input.set({
      down: (pt) => {
        const c = screenCentre();
        lastAng = Math.atan2(pt.y - c.y, pt.x - c.x);
        palino.visible = true;
        return true;
      },
      move: (pt) => {
        const c = screenCentre();
        const a = Math.atan2(pt.y - c.y, pt.x - c.x);
        if (lastAng !== null) {
          let d = a - lastAng;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          // Screen clockwise is a turn of the pizza about +y the other way round.
          bake.angle -= d;
          bake.addTurnAmount(d);
        }
        lastAng = a;
      },
      up: () => {
        lastAng = null;
        palino.visible = false;
        this.c.sound.scrape(true);
      },
      pinch: (_s, dr) => {
        bake.angle -= dr;
        bake.addTurnAmount(dr);
      },
    });
    const pullOut = async (): Promise<void> => {
      if (pulled) return;
      pulled = true;
      bake.running = false;
      this.c.input.set(null);
      this.c.sound.setSizzle(0);
      this.c.sound.scrape();
      this.report = bake.report();
      // The peel goes in, the pizza comes out to the board.
      peel.visible = true;
      peel.position.copy(OVEN_SPOT).add(new THREE.Vector3(0, -0.01, 0.35));
      await tween(0.4, (k) => peel.position.z = OVEN_SPOT.z + 0.35 * (1 - k), easeOut);
      void this.c.rig.go('banco', 1.8);
      setTimeout(() => oven.setCutaway(false), 700);
      this.c.sound.whoosh();
      const from = p.group.position.clone();
      await tween(1.7, (k) => {
        const v = from.clone().lerp(BOARD_SPOT, k);
        v.y += Math.sin(k * Math.PI) * 0.16;
        p.group.position.copy(v);
        peel.position.copy(v).add(new THREE.Vector3(0, -0.013, 0));
      });
      peel.visible = false;
      p.group.rotation.y = bake.angle;
      $('[data-bake]').hidden = true;
      this.c.sound.setFire(0.25);
      this.steamOn = true;
      this.showReport();
    };
    this.tickers.push((dt) => {
      if (!bake.running) return;
      bake.step(dt);
      if (turnAnim !== 0) {
        const d = Math.sign(turnAnim) * Math.min(Math.abs(turnAnim), dt * 5);
        bake.angle += d;
        turnAnim -= d;
        palino.visible = Math.abs(turnAnim) > 0.01;
      }
      p.group.rotation.y = bake.angle;
      // The turning peel slides in under the front of the pizza.
      palino.position.copy(p.group.position).add(new THREE.Vector3(0.02, -0.0012, 0.09));
      const t = bake.time;
      this.c.sound.setSizzle(Math.min(1, t / 25));
      secs.textContent = String(Math.round(t));
      this.drawRing(ring, t);
      const r = bake.report();
      const out = this.q<HTMLButtonElement>('[data-out]');
      if (out) out.disabled = t < 35;
      const state = this.q('[data-state]');
      if (state) state.textContent = r.doneness < 0.55 ? 'Still pale…' : r.doneness < 0.85 ? 'Colouring…' : r.char > 0.25 ? 'Burning!' : 'Ready: golden and spotted';
      const once = (k: string, at: boolean, it: string, en: string): void => {
        if (at && !this.noteAt.has(k)) {
          this.noteAt.add(k);
          note(it, en, 3600);
        }
      };
      once('left', t > 14 && bake.turns === 0, 'Il fuoco è a sinistra. Girala!', 'The fire is on the left. Turn it!');
      once('puff', t > 26, 'Guarda il cornicione: si gonfia!', 'Look at the rim: it’s puffing up.');
      once('fan', t > 38 && !this.c.stamps.has('fire'), 'Vuoi più fuoco? Ravvivalo.', 'Want more fire? Fan it.');
      if (r.doneness > 0.88 && !readyRang) {
        readyRang = true;
        this.c.sound.bell();
        note('È pronta! Sfornala.', 'It’s ready. Take it out.', 3000);
      }
      once('burn', r.char > 0.2, 'Brucia! Fuori, subito!', 'It’s burning! Out, now!');
      if (t > 140) void pullOut();
      void fan;
    });
    this.noteAt.clear();
  }

  /** The bake clock: seconds around the outside, the rim's colour all round the inside (as seen from above). */
  private drawRing(c: HTMLCanvasElement, t: number): void {
    const g = c.getContext('2d')!;
    const W = c.width;
    const cx = W / 2;
    g.clearRect(0, 0, W, W);
    // Outer: 90 seconds.
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,230,200,0.15)';
    g.beginPath();
    g.arc(cx, cx, W * 0.45, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = t > 90 ? '#ff6a3a' : '#ffd27a';
    g.beginPath();
    g.arc(cx, cx, W * 0.45, -Math.PI / 2, -Math.PI / 2 + Math.min(1, t / 90) * Math.PI * 2);
    g.stroke();
    // Inner: the crust colour by angle, in oven space (the fire marked on the left).
    const L = this.pizza.layers;
    const ramp = (h: number): string => {
      const stops: [number, number[]][] = [[0, [240, 225, 196]], [0.55, [236, 186, 110]], [0.95, [190, 120, 56]], [1.35, [106, 60, 28]], [1.8, [20, 14, 10]]];
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) if (h >= stops[i][0] && h <= stops[i + 1][0]) [a, b] = [stops[i], stops[i + 1]];
      const k = Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0] || 1)));
      return `rgb(${a[1].map((v, i) => Math.round(v + (b[1][i] - v) * k)).join(',')})`;
    };
    const n = 48;
    g.lineWidth = 14;
    for (let i = 0; i < n; i++) {
      const screenA = (i / n) * Math.PI * 2;
      // Screen angle (top-down view, x right, z down) → pizza-local angle.
      const local = screenA - this.bake.angle;
      const R = this.pizza.outlineAt(local) - this.pizza.shape.rimWidth * 0.5;
      const h = L.heatAt(Math.cos(local) * R, Math.sin(local) * R) * 1.18;
      g.strokeStyle = ramp(h);
      g.beginPath();
      g.arc(cx, cx, W * 0.33, screenA, screenA + (Math.PI * 2) / n + 0.01);
      g.stroke();
    }
    g.fillStyle = '#ff8a3a';
    g.font = '22px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🔥', cx - W * 0.33, cx);
    void OVEN_SPEED;
  }

  private showReport(): void {
    const r = this.report!;
    if (r.spots >= 30) this.c.stamps.give('leopard');
    if (r.evenness >= 0.82 && r.doneness > 0.8) this.c.stamps.give('even');
    this.c.sound.printer(4);
    this.panel(html`<p class="panel__kicker">3 · Forno · Il verdetto</p>
      <div class="report">
        <div>NOVANTA · RAPPORTO DI COTTURA</div>
        <div class="report__grade">${r.grade}</div>
        <dl>
          <dt>Tempo · Time</dt><dd>${r.seconds} s</dd>
          <dt>Macchie di leopardo · Spots</dt><dd>${r.spots}</dd>
          <dt>Uniformità · Evenness</dt><dd>${Math.round(r.evenness * 100)}%</dd>
          <dt>Bruciato · Charred</dt><dd>${Math.round(r.char * 100)}%</dd>
          <dt>Giri · Turns</dt><dd>${r.turns}</dd>
        </dl>
        <div class="it" style="font-size:19px">${r.verdict[0]}</div>
        <div style="font-family:var(--sans);font-size:13px;color:var(--ink-2)">${r.verdict[1]}</div>
      </div>
      <div class="panel__foot"><button class="btn btn--paper btn--small" type="button" data-again>Rifalla · Bake another</button><button class="btn btn--tomato" type="button" data-next>Avanti →</button></div>`);
    this.q('[data-next]').addEventListener('click', () => this.next('taglio'));
    this.q('[data-again]').addEventListener('click', () => {
      this.fresh();
      history.replaceState({ place: 'impasto' }, '', '#impasto');
      void this.go('impasto');
    });
  }

  // ————— 4. Taglio —————

  private async taglio(): Promise<void> {
    const p = this.pizza;
    this.c.rig.go('banco', 1);
    this.steamOn = true;
    if (this.classic) void this.applyClassicPost();
    let tab: 'dopo' | 'taglia' = 'dopo';
    let mode: 'none' | 'drizzle' | 'cut' | 'pull' = 'none';
    let cutStart: THREE.Vector3 | null = null;
    let lastDz: THREE.Vector3 | null = null;
    let pulls = 0;
    const render = (): void => {
      const tabs = html`<div class="tabs" role="tablist">
        <button type="button" data-tab="dopo" class="${tab === 'dopo' ? 'is-on' : ''}"><span class="it">Dopo il forno</span>After the oven</button>
        <button type="button" data-tab="taglia" class="${tab === 'taglia' ? 'is-on' : ''}"><span class="it">Taglia</span>Cut it</button></div>`;
      let body = '';
      if (tab === 'dopo') {
        const counts = new Map<string, number>();
        p.pieces.forEach((x) => counts.set(x.kind.id, (counts.get(x.kind.id) ?? 0) + 1));
        body = html`<p class="panel__lead">Some things never see the fire. Tap to add; for a drizzle, pick one and <b>draw it over the pizza</b>.</p>
          <div class="chips">${KINDS.filter((k) => k.stage === 'post')
            .map((k) => `<button type="button" class="chip ${counts.get(k.id) ? 'is-on' : ''}" data-post="${k.id}"><span class="chip__n">${counts.get(k.id) ?? ''}</span><span class="chip__price">${k.price ? euro(k.price) : ''}</span><i data-sprite="${k.id}"></i><span class="chip__it">${k.it}</span><span class="chip__en">${k.en}</span></button>`)
            .join('')}</div>
          <div class="seg" style="margin-top:10px">${DRIZZLES.map((d) => `<button type="button" data-drizzle="${d.id}" class="${this.drizzle === d.id ? 'is-on' : ''}"><span class="it">${d.it}</span>${d.en}${d.price ? ' · ' + euro(d.price) : ''}</button>`).join('')}</div>`;
      } else {
        const n = this.slicer.slices;
        body = html`<p class="panel__lead">${n < 4 ? '<b>Swipe across the pizza</b> to cut it with the wheel, through the middle.' : '<b>Pull a slice away</b> from the rest and watch the cheese.'}</p>
          <p class="readout">${n}<small>${n === 1 ? 'slice' : 'slices'}</small></p>`;
      }
      this.panel(html`<p class="panel__kicker">4 · Taglio</p>
        <h2 class="panel__title"><span class="it">Finiscila</span></h2>
        ${tabs}${body}
        <div class="panel__foot">${tab === 'taglia' && this.slicer.slices < 8 ? '<button class="btn btn--paper btn--small" type="button" data-autocut>Tagliala tu · Cut for me</button>' : '<span></span>'}<button class="btn btn--tomato" type="button" data-next>Avanti →</button></div>`);
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
        b.addEventListener('click', () => {
          tab = b.dataset.tab as typeof tab;
          this.drizzle = null;
          render();
          if (tab === 'taglia') this.sayOnce('cut', 'In otto, come si deve.', 'In eight, the proper way.');
        }),
      );
      this.panelEl.querySelectorAll<HTMLElement>('[data-sprite]').forEach((i) => {
        const a = p.kinds.get(i.dataset.sprite!);
        if (a) i.replaceWith(spriteChip(a.sheet.image, a.sheet.cells[0]));
      });
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-post]').forEach((b) =>
        b.addEventListener('click', () => {
          const k = KIND[b.dataset.post!];
          void this.sprinkle(k).then(render);
          if (k.say) this.sayOnce(k.id, ...k.say);
        }),
      );
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-drizzle]').forEach((b) =>
        b.addEventListener('click', () => {
          this.drizzle = this.drizzle === b.dataset.drizzle ? null : (b.dataset.drizzle as DrizzleId);
          render();
          if (this.drizzle) note(this.drizzle === 'miele' ? 'Un filo di miele piccante…' : 'Un filo d’olio, a crudo.', 'Draw it over the pizza.', 2600);
        }),
      );
      this.q('[data-autocut]')?.addEventListener('click', () => void autoCut());
      this.q('[data-next]').addEventListener('click', () => {
        this.steamOn = false;
        this.next('consegna');
      });
    };
    const centreOf = (): THREE.Vector3 => new THREE.Vector3();
    const cutAlong = async (angle: number): Promise<void> => {
      if (!this.slicer.addCut(angle)) return;
      const R = p.radius + 0.02;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      this.wheel.visible = true;
      this.wheel.rotation.y = -angle + Math.PI / 2;
      this.c.sound.cutter(0.6);
      vibrate(6);
      await tween(0.45, (k) => {
        const local = centreOf().addScaledVector(dir, -R + 2 * R * k).setY(p.shape.base);
        this.wheel.position.copy(p.group.localToWorld(local));
        (this.wheel.userData.disc as THREE.Mesh).rotation.x += 0.4;
      });
      this.wheel.visible = false;
      render();
    };
    const autoCut = async (): Promise<void> => {
      for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) await cutAlong(a - p.group.rotation.y);
    };
    this.c.input.set({
      down: (pt) => {
        const l = this.onPizza(pt);
        if (!l) return false;
        const r = Math.hypot(l.x, l.z);
        if (tab === 'dopo' && this.drizzle) {
          mode = 'drizzle';
          lastDz = l;
          return true;
        }
        if (tab === 'taglia') {
          if (this.slicer.slices >= 2 && r < p.radius) {
            const th = Math.atan2(l.z, l.x);
            if (this.slicer.begin(th, p.group)) {
              mode = 'pull';
              cutStart = l;
              if (!this.slicer.hasCheese) note('Senza formaggio, niente filo.', 'No cheese, no pull. But it’s still good.', 2400);
              return true;
            }
          }
          mode = 'cut';
          cutStart = l;
          return true;
        }
        return false;
      },
      move: (pt) => {
        const l = this.onPizza(pt);
        if (!l) return;
        if (mode === 'drizzle' && lastDz && this.drizzle) {
          p.layers.stroke('drizzle', this.drizzle === 'miele' ? 0 : 1, [lastDz.x, lastDz.z], [l.x, l.z], 0.0032, 0.9, 0.5);
          lastDz = l;
          p.drizzles.add(this.drizzle);
          this.renderTicket();
        } else if (mode === 'pull' && cutStart) {
          const out = l.clone().sub(cutStart);
          this.slicer.pull(Math.max(0, out.length()));
        }
      },
      up: (pt) => {
        if (mode === 'cut' && cutStart) {
          const l = this.onPizza(pt);
          if (l && l.distanceTo(cutStart) > p.radius * 0.6) {
            // Is the swipe's line close to the centre? Then cut through the centre along it.
            const d = l.clone().sub(cutStart);
            const n = new THREE.Vector3(-d.z, 0, d.x).normalize();
            if (Math.abs(n.dot(cutStart)) < p.radius * 0.45) void cutAlong(Math.atan2(d.z, d.x));
            else note('Passa dal centro!', 'Cut through the middle.', 2000);
          }
        } else if (mode === 'pull') {
          void this.slicer.release().then((snapped) => {
            pulls++;
            if (snapped >= 2) this.c.stamps.give('pull');
            if (pulls === 1 && snapped) note('Che filo!', 'Now that’s a cheese pull.', 2400);
          });
        }
        mode = 'none';
        cutStart = null;
        lastDz = null;
      },
    });
    render();
    this.sayOnce('post', 'Il crudo e la rucola vanno dopo.', 'Ham and rocket go on after the oven, never before.');
  }

  /** Post-oven toppings drop gently onto the hot pizza (no physics needed: they settle where they fall). */
  private async sprinkle(kind: Kind): Promise<void> {
    const p = this.pizza;
    const n = kind.handful;
    const R = p.radius - 0.035;
    const made: Piece[] = [];
    for (let i = 0; i < n; i++) {
      const piece = p.makePiece(kind);
      if (!piece) break;
      const a = ((i + Math.random() * 0.7) / n) * Math.PI * 2;
      const d = (kind.id === 'burrata' ? 0.15 : 0.25 + Math.random() * 0.75) * R;
      p.placeFlat(piece, Math.cos(a) * d, Math.sin(a) * d, Math.random() * Math.PI * 2, 0.06);
      made.push(piece);
    }
    p.syncPieceMatrices();
    this.renderTicket();
    await Promise.all(
      made.map(
        (piece, i) =>
          new Promise<void>((res) =>
            setTimeout(async () => {
              const y0 = piece.mesh.position.y;
              const y1 = p.topAt(piece.mesh.position.x, piece.mesh.position.z) + 0.004;
              await tween(0.3, (k) => (piece.mesh.position.y = y0 + (y1 - y0) * k), easeIn);
              this.c.sound.drop(kind.note + i, 0.7);
              p.groundPieces([piece]);
              res();
            }, i * 70),
          ),
      ),
    );
    p.syncPieceMatrices();
  }

  // ————— 5. Consegna —————

  private async consegna(): Promise<void> {
    const p = this.pizza;
    const box = this.box;
    this.c.rig.go('banco', 1);
    box.group.visible = true;
    box.group.position.copy(BOARD_SPOT).setY(BOARD_SPOT.y + 0.0035);
    box.group.rotation.set(0, 0, 0);
    box.fold = 0;
    box.lid = 1;
    box.apply();
    p.group.position.y = BOARD_SPOT.y + 0.004;
    this.c.sound.cardboard();
    await tween(0.9, (k) => {
      box.fold = k;
      box.apply();
    }, easeOut);
    this.c.sound.cardboard();
    const dests = [
      ['desk', 'La tua scrivania', 'Your desk'],
      ['mum', 'Da mamma', 'Your mum’s'],
      ['moon', 'Sulla luna', 'The moon'],
    ];
    const render = (): void => {
      this.panel(html`<p class="panel__kicker">5 · Consegna</p>
        <h2 class="panel__title"><span class="it">Per chi è?</span></h2>
        <p class="panel__lead">“${p.name}”. Boxed and still steaming. Who is it for?</p>
        <label class="field">Name on the box (optional)<input type="text" maxlength="18" autocomplete="off" data-name value="${this.name.replace(/"/g, '')}" placeholder="e.g. Sofia" /></label>
        <div class="seg">${dests.map(([id, it, en]) => `<button type="button" data-dest="${id}" class="${this.dest === id ? 'is-on' : ''}"><span class="it">${it}</span>${en}</button>`).join('')}</div>
        <p class="fineprint">On the house: this pizzeria is a portfolio piece. No payment, and nothing you type leaves your browser.</p>
        <div class="panel__foot"><span class="readout" style="font-size:24px">${euro(p.price)}</span><button class="btn btn--tomato" type="button" data-send>Mandala! · Send it</button></div>`);
      const input = this.q<HTMLInputElement>('[data-name]');
      input.addEventListener('input', () => (this.name = input.value.trim()));
      this.panelEl.querySelectorAll<HTMLButtonElement>('[data-dest]').forEach((b) =>
        b.addEventListener('click', () => {
          this.dest = b.dataset.dest!;
          render();
        }),
      );
      this.q('[data-send]').addEventListener('click', () => void send());
    };
    const send = async (): Promise<void> => {
      this.panelEl.classList.add('is-out');
      const r = this.report;
      box.setTicket({
        name: this.name,
        pizza: p.name,
        lines: p.lines.map(([it, , pr]) => `${it.slice(0, 20).padEnd(20)} ${pr ? pr.toFixed(2) : ' —'}`),
        seconds: r?.seconds ?? 90,
        grade: r?.grade ?? 'Pizzaiolo',
        order: this.order,
      });
      this.c.sound.whoosh();
      await tween(0.8, (k) => {
        box.lid = 1 - k;
        box.apply();
      }, easeIn);
      this.c.sound.cardboard();
      vibrate(12);
      await wait(250);
      this.c.sound.tear();
      await wait(300);
      this.c.sound.stamp();
      await wait(600);
      this.done.add('consegna');
      this.renderSteps();
      this.c.onSend({ name: this.name, to: this.dest, report: r, order: this.order });
    };
    render();
  }

  // ————— Classics: the fast path from the chalkboard —————

  /** Builds a classic in one go (stretched, sauced, topped) and sends it to the oven. */
  async bakeClassic(cl: Classic): Promise<void> {
    this.fresh();
    this.classic = cl;
    this.step = 'impasto';
    this.renderSteps();
    $('[data-kitchen]').hidden = false;
    setPlace(cl.name, 'A classic, coming up');
    this.panel(html`<p class="panel__kicker">Un classico</p><h2 class="panel__title"><span class="it">${cl.name}</span></h2><p class="panel__lead">${cl.en}. ${cl.story}</p>`);
    const p = this.pizza;
    await this.c.rig.go('banco', 1.4);
    for (let i = 0; i < 3; i++) {
      p.setPress((i + 1) / 3);
      this.c.sound.thud(0.8);
      this.flour.burst(p.group.position.clone(), 8, 0.05, 0.1, 0.04, 1);
      await wait(180);
    }
    p.working = true;
    await tween(0.9, (k) => p.ring.pullAll(0.1 + 0.052 * k), easeInOut);
    p.ring.release();
    await wait(300);
    p.working = false;
    p.phase = 'done';
    p.update(0);
    p.sauce = cl.sauce;
    await tween(1.1, (k) => {
      const a = k * Math.PI * 2 * 4;
      const r = 0.01 + k * (p.radius - 0.034);
      p.paintSauce(Math.cos(a) * r, Math.sin(a) * r, 0.026, 0.5);
    }, (t) => t);
    this.physics = await this.c.physics();
    this.physics.setDough(p.doughGeo.geometry);
    this.physics.onLand = (mesh, speed) => {
      const ref = mesh.userData.ref as Piece | undefined;
      if (ref) this.c.sound.drop(ref.kind.note, speed * 0.6);
    };
    if (cl.cheese) {
      p.cheese = cl.cheese;
      p.handful(KIND[cl.cheese], this.physics);
      await wait(500);
    }
    for (const id of cl.pre) {
      p.handful(KIND[id], this.physics);
      await wait(450);
    }
    const t0 = performance.now();
    while (this.physics.active && performance.now() - t0 < 1800) await wait(60);
    p.markLost().forEach((x) => p.removePiece(x));
    this.physics.freeze();
    p.syncPieceMatrices();
    p.groundPieces();
    p.name = cl.name;
    this.done.add('impasto');
    this.done.add('condimenti');
    this.c.stamps.give('classic');
    this.step = null;
    history.pushState({ place: 'forno' }, '', '#forno');
    await this.go('forno');
  }

  /** Post-oven toppings of a classic go on automatically when it reaches the Taglio step. */
  get pendingPost(): Classic | null {
    return this.classic;
  }

  async applyClassicPost(): Promise<void> {
    const cl = this.classic;
    if (!cl) return;
    for (const id of cl.post) await this.sprinkle(KIND[id]);
    cl.drizzle.forEach((d) => this.pizza.drizzles.add(d));
    if (cl.drizzle.includes('olio')) {
      const p = this.pizza;
      for (let a = 0; a < Math.PI * 6; a += 0.2) {
        const r = 0.02 + (a / (Math.PI * 6)) * (p.radius - 0.05);
        p.layers.dab('drizzle', 1, Math.cos(a * 2.3) * r, Math.sin(a * 2.3) * r, 0.003, 0.8);
      }
    }
    this.classic = null;
    this.renderTicket();
  }
}

export { CLASSICS };
