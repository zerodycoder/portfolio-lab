import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$ } from '../lib/dom';
import type { Sound } from '../lib/sound';

/** Sound toggle, the active-section highlight, and the soft hover/press sounds on every button. */
export function initNav(sound: Sound): void {
  const toggle = $('[data-sound-toggle]');
  const label = $('[data-sound-label]');
  toggle.addEventListener('click', () => {
    sound.toggle();
    if (sound.enabled) sound.chirp('hello');
  });
  sound.onChange((on) => {
    toggle.setAttribute('aria-pressed', String(on));
    label.textContent = on ? 'Sound on' : 'Sound off';
  });

  // A soft backdrop behind the nav once content starts scrolling under it.
  const nav = $('[data-nav]');
  const onScroll = (): void => void nav.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = $$<HTMLAnchorElement>('.nav__links a');
  links.forEach((a) => {
    const section = document.querySelector(a.getAttribute('href') ?? '');
    if (!section) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => a.classList.toggle('is-active', self.isActive),
    });
  });

  const tactile = '.btn, .block, .mood, .swatch, .choice, .switch, .level-dot, .chip, .sound-toggle, .tricks-btn, .parts button, .part-card__nav button, .nav__links a';
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest(tactile);
    const from = (e.relatedTarget as Element | null)?.closest(tactile);
    if (el && el !== from && (e as PointerEvent).pointerType === 'mouse') sound.tick();
  });
  document.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest('.btn, .switch, .sound-toggle')) sound.press();
  });
}
