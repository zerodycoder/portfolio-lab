import { gsap } from 'gsap';
import { $, $$, devMissing, reducedMotion } from '../lib/dom';
import { FINISHES, FINISH_ORDER, finishStore, type Finish } from '../lib/finish';
import type { Media } from '../lib/media';
import type { Sound } from '../lib/sound';

const ORDER = FINISH_ORDER;

/** A jagged, lightning-shaped wipe edge at position p (0..1) across the stage. */
function boltClip(p: number): string {
  const x = -12 + p * 124;
  const pts: [number, number][] = [
    [x, 0],
    [x - 4, 16],
    [x + 3, 33],
    [x - 5, 51],
    [x + 2, 67],
    [x - 3, 84],
    [x + 1, 100],
  ];
  return `polygon(0% 0%, ${pts.map(([px, py]) => `${px.toFixed(2)}% ${py}%`).join(', ')}, 0% 100%)`;
}

/** Finish configurator: switching colourways wipes the new one in along a lightning edge and retints the whole site. */
export function initConfig(media: Media, sound: Sound): void {
  const root = $('[data-config]');
  const stage = $('[data-config-stage]', root);
  const nameEl = $('[data-finish-name]', root);
  const descEl = $('[data-finish-desc]', root);
  const priceEl = $('[data-finish-price]', root);
  const swatches = $$<HTMLButtonElement>('[data-finish]', root);

  const fallbackSrc = media.hero?.src;
  const layers = {} as Record<Finish, HTMLElement>;
  let anyImage = false;
  ORDER.forEach((f, i) => {
    const layer = document.createElement('div');
    layer.className = 'config__layer';
    layer.style.zIndex = String(i === 0 ? 2 : 1);
    const src = media.colors?.[f] ?? (f === 'graphite' ? fallbackSrc : undefined);
    if (src) {
      const img = document.createElement('img');
      img.alt = `Rakhsh Model 01 in ${FINISHES[f].name}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = src;
      layer.appendChild(img);
      anyImage = true;
    } else {
      layer.classList.add('is-chip');
      layer.style.setProperty('--paint', FINISHES[f].paint);
      layer.innerHTML = '<div class="chip"><div class="chip__bar"></div></div>';
    }
    stage.appendChild(layer);
    layers[f] = layer;
  });
  if (!anyImage) devMissing(stage, 'f-ember / f-ash / f-bone / f-olive');

  let z = 3;
  let active: Finish = 'graphite';

  const show = (f: Finish): void => {
    if (f === active) return;
    active = f;
    const info = FINISHES[f];
    const layer = layers[f];
    layer.style.zIndex = String(++z);
    if (reducedMotion()) layer.style.clipPath = 'none';
    else {
      const o = { p: 0 };
      gsap.killTweensOf(layer);
      gsap.to(o, {
        p: 1,
        duration: 0.95,
        ease: 'power3.inOut',
        onUpdate: () => {
          layer.style.clipPath = boltClip(o.p);
        },
        onComplete: () => {
          layer.style.clipPath = 'none';
        },
      });
    }
    swatches.forEach((s) => {
      const on = s.dataset.finish === f;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-checked', String(on));
    });
    gsap.fromTo(nameEl, { yPercent: 105 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', onStart: () => void (nameEl.textContent = info.name) });
    gsap.fromTo([descEl, priceEl], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.05, onStart: () => {
      descEl.textContent = info.desc;
      priceEl.textContent = info.price;
    } });
  };

  swatches.forEach((s) =>
    s.addEventListener('click', () => {
      const f = s.dataset.finish as Finish;
      if (f === finishStore.get()) return;
      sound.crack(0.22);
      finishStore.set(f, 'config');
    }),
  );
  // Arrow keys move between swatches, as a radio group should.
  root.querySelector('.swatches')?.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(ke.key)) return;
    ke.preventDefault();
    const step = ke.key === 'ArrowRight' || ke.key === 'ArrowDown' ? 1 : -1;
    const next = ORDER[(ORDER.indexOf(finishStore.get()) + step + ORDER.length) % ORDER.length];
    finishStore.set(next, 'config');
    swatches.find((s) => s.dataset.finish === next)?.focus();
  });

  finishStore.on((f) => show(f));
}
