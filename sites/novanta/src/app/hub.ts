import * as THREE from 'three';
import { $ } from '@portfolio-lab/kit/dom';
import { CLASSICS, type Classic } from '../pizza/catalog';
import type { Sound } from '../lib/sound';
import type { PlaceId, Rig } from '../world/places';
import type { Props } from '../world/props';
import type { Stage } from '../world/stage';
import type { Stamps } from './stamps';
import { closeSheet, euro, setPlace, sheet } from './ui';

/**
 * The dining room and its corners. Hotspots float over the 3D room (projected from anchors every frame); each
 * opens a corner of the shop: the chalkboard menu, the family photos, the dough boxes with a live 48-hour clock,
 * the oven, the radio. The main one starts a pizza.
 */

export type HubCtx = {
  stage: Stage;
  rig: Rig;
  props: Props;
  sound: Sound;
  stamps: Stamps;
  makePizza: () => void;
  bakeClassic: (c: Classic) => void;
  go: (place: string) => void;
};

const SPOTS: { id: string; it: string; en: string; main?: boolean }[] = [
  { id: 'banco', it: 'Impasta!', en: 'Make your pizza', main: true },
  { id: 'menu', it: 'Il menu', en: 'The classics' },
  { id: 'forno', it: 'Il forno', en: '485 °C' },
  { id: 'lievito', it: 'Il lievito', en: '48 hours' },
  { id: 'famiglia', it: 'La famiglia', en: 'Since 1958' },
  { id: 'radio', it: 'La radio', en: 'Music' },
];

/** The dough rises on a 48-hour cycle; batches are numbered from the day the shop "opened" online. */
export function doughClock(now = Date.now()): { batch: number; hours: number; minutes: number; left: number; rise: number } {
  const epoch = Date.UTC(2019, 0, 1, 17, 0, 0);
  const cycle = 48 * 3600e3;
  const age = (now - epoch) % cycle;
  const batch = 1000 + Math.floor((now - epoch) / cycle);
  const hours = Math.floor(age / 3600e3);
  const minutes = Math.floor((age % 3600e3) / 60e3);
  const left = 48 - age / 3600e3;
  return { batch, hours, minutes, left, rise: age / cycle };
}

export class Hub {
  private els = new Map<string, HTMLButtonElement>();
  private active = false;
  private tickTimer = 0;

  constructor(private readonly c: HubCtx) {
    const nav = $('[data-spots]');
    SPOTS.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `spot${s.main ? ' spot--main' : ''}`;
      b.innerHTML = `<span class="spot__t"><span class="spot__it">${s.it}</span><span class="spot__en">${s.en}</span></span>`;
      b.addEventListener('click', () => {
        c.sound.click();
        if (s.id === 'banco') c.makePizza();
        else if (s.id === 'radio') this.radio();
        else c.go(s.id);
      });
      nav.appendChild(b);
      this.els.set(s.id, b);
    });
    c.stage.tick(() => this.update());
    // The dough balls in the box rise with the real clock.
    const rise = (): void => {
      const r = doughClock().rise;
      c.props.doughBalls.forEach((b, i) => {
        const k = 0.85 + Math.min(1, r + i * 0.01) * 0.5;
        b.scale.set(k, 0.62 * k, k);
      });
    };
    rise();
    setInterval(rise, 60000);
  }

  show(on: boolean): void {
    this.active = on;
    $('[data-spots]').classList.toggle('is-hidden', !on);
  }

  private update(): void {
    if (!this.active) return;
    const v = new THREE.Vector3();
    this.els.forEach((el, id) => {
      const a = this.c.props.anchors[id];
      if (!a) return;
      this.c.stage.toScreen(a, v);
      const off = v.z > 1 || v.x < 20 || v.x > innerWidth - 20 || v.y < 70 || v.y > innerHeight - 20;
      el.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.style.opacity = off ? '0' : '1';
      el.style.pointerEvents = off ? 'none' : 'auto';
    });
  }

  enterSala(): void {
    setPlace('La sala', 'The dining room');
    closeSheet();
    this.show(true);
    window.clearInterval(this.tickTimer);
  }

  leave(): void {
    this.show(false);
    closeSheet();
    window.clearInterval(this.tickTimer);
  }

  private back = (): void => this.c.go('sala');

  open(place: PlaceId): void {
    this.show(false);
    window.clearInterval(this.tickTimer);
    if (place === 'menu') this.menu();
    else if (place === 'famiglia') this.famiglia();
    else if (place === 'lievito') this.lievito();
    else if (place === 'fronte') this.forno();
  }

  private menu(): void {
    setPlace('Il menu', 'The chalkboard');
    const el = sheet(
      `<p class="sheet__kicker">Le pizze classiche</p>
      <h2 class="sheet__title">Bake one of ours</h2>
      <p class="sheet__lead">Every one of these goes through the same 48 hours and the same 90 seconds. Pick one and watch it come together, or make your own.</p>
      ${CLASSICS.map((cl) => `<div class="menu-item"><h3>${cl.name}</h3><b>${euro(cl.price)}</b><p>${cl.en}</p><em>${cl.story}</em><button type="button" data-classic="${cl.id}">Bake it</button></div>`).join('')}
      <p style="margin-top:18px"><button class="btn btn--tomato" type="button" data-own>Make your own →</button></p>`,
      { chalk: true, onClose: this.back },
    );
    el.querySelectorAll<HTMLButtonElement>('[data-classic]').forEach((b) =>
      b.addEventListener('click', () => this.c.bakeClassic(CLASSICS.find((x) => x.id === b.dataset.classic)!)),
    );
    el.querySelector('[data-own]')?.addEventListener('click', () => this.c.makePizza());
  }

  private famiglia(): void {
    setPlace('La famiglia', 'Since 1958');
    this.c.stamps.give('family');
    const base = import.meta.env.BASE_URL;
    sheet(
      `<p class="sheet__kicker">La famiglia</p>
      <h2 class="sheet__title">Three generations, one oven</h2>
      <figure class="photo"><img src="${base}media/photos/p-1958.webp" alt="An old photograph of a young pizzaiolo in front of a wood-fired oven" /><figcaption>Nonno Gennaro, 1958, the week the oven was lit.</figcaption></figure>
      <div class="story">
        <p>He built the oven with his father from bricks of Sorrento tufa, and it has not gone cold for longer than a Sunday since. Six tables, one menu, the same dough.</p>
        <figure class="photo"><img src="${base}media/photos/p-street.webp" alt="An old colour photograph of the pizzeria's door on a narrow Naples street" /><figcaption>Via Novanta, 1964. The boy with the pizza is our dad.</figcaption></figure>
        <h3>What we still do the old way</h3>
        <p>Flour, water, salt and a little yeast, left to rise for 48 hours. San Marzano tomatoes crushed by hand. Fior di latte from the hills of Agerola. An oak fire at 485 °C, and ninety seconds, not one more.</p>
        <h3>Why “Novanta”</h3>
        <p>Novanta is Italian for ninety: the seconds a pizza spends in our oven.</p>
        <figure class="photo"><img src="${base}media/photos/p-family.webp" alt="An old colour photograph of a family laughing around a table of pizzas" /><figcaption>Sundays, 1977.</figcaption></figure>
        <p class="fineprint">A made-up family and a made-up pizzeria: this is a portfolio piece. The pizza rules are real.</p>
      </div>`,
      { onClose: this.back },
    );
  }

  private lievito(): void {
    setPlace('Il lievito', '48 hours of patience');
    const el = sheet(
      `<p class="sheet__kicker">Il lievito · live</p>
      <h2 class="sheet__title">The dough is rising right now</h2>
      <p class="big-num" data-batch></p>
      <p class="sheet__lead" data-age></p>
      <div class="meter" style="height:12px;margin:8px 0 18px"><i data-rise style="background:var(--basil)"></i></div>
      <div class="story">
        <p>Every ball you see in those boxes was mixed on a 48-hour clock. In the first hours the yeast wakes up; by the second day the gluten has relaxed and the flavour has turned nutty and slightly sour. That slow rise is why a Neapolitan crust puffs and blisters in ninety seconds.</p>
        <p>The balls in the top box grow with this clock. Come back tomorrow and they’ll be bigger.</p>
      </div>
      <p style="margin-top:14px"><button class="btn btn--tomato" type="button" data-make>Stretch one →</button></p>`,
      { onClose: this.back },
    );
    const tick = (): void => {
      const d = doughClock();
      el.querySelector('[data-batch]')!.textContent = `Batch N° ${d.batch}`;
      el.querySelector('[data-age]')!.innerHTML = `Mixed <b>${d.hours} h ${String(d.minutes).padStart(2, '0')} min</b> ago · ready in <b>${Math.floor(d.left)} h ${String(Math.floor((d.left % 1) * 60)).padStart(2, '0')} min</b>`;
      (el.querySelector('[data-rise]') as HTMLElement).style.width = `${(d.rise * 100).toFixed(1)}%`;
    };
    tick();
    this.tickTimer = window.setInterval(tick, 1000);
    el.querySelector('[data-make]')?.addEventListener('click', () => this.c.makePizza());
  }

  private forno(): void {
    setPlace('Il forno', '485 °C, 90 seconds');
    const el = sheet(
      `<p class="sheet__kicker">Il forno a legna</p>
      <h2 class="sheet__title">A dome of gold, a heart of fire</h2>
      <div class="story">
        <p>The dome is clad in gold mosaic, as the old Neapolitan ovens are, with the name set in red tesserae. Inside, oak burns against the left wall at about 485 °C, and the stone floor holds the heat like a battery.</p>
        <p>Because the flame is on one side, a pizza is turned three or four times in its ninety seconds, with a small round peel called a <i>palino</i>. Forget, and one side chars while the other stays pale. You’ll see.</p>
      </div>
      <p style="margin-top:14px"><button class="btn btn--tomato" type="button" data-make>Bake one →</button></p>`,
      { onClose: this.back },
    );
    el.querySelector('[data-make]')?.addEventListener('click', () => this.c.makePizza());
  }

  private radio(): void {
    const on = !this.c.sound.radio;
    this.c.sound.setRadio(on);
  }
}
