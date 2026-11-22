import type Lenis from 'lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$ } from '../lib/dom';
import type { Sound } from '../lib/sound';

/** Header: hides on scroll down, shows on scroll up, tracks the active section, sound toggle and mobile menu. */
export function initNav(lenis: Lenis, sound: Sound): void {
  const nav = $('[data-nav]');
  const menu = $('[data-menu]');
  const menuBtn = $<HTMLButtonElement>('[data-menu-toggle]');
  let menuOpen = false;

  lenis.on('scroll', (l: Lenis) => {
    nav.classList.toggle('is-solid', l.scroll > 40);
    if (menuOpen) return;
    if (l.direction === 1 && l.scroll > 200) nav.classList.add('is-hidden');
    else if (l.direction === -1) nav.classList.remove('is-hidden');
  });

  $$<HTMLAnchorElement>('[data-link]').forEach((a) => {
    const section = document.getElementById(a.dataset.link ?? '');
    if (!section) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 45%',
      refreshPriority: -10,
      onToggle: (self) => a.classList.toggle('is-active', self.isActive),
    });
  });

  const soundBtn = $<HTMLButtonElement>('[data-sound-toggle]');
  const soundLabel = $('.sound-toggle__label', soundBtn);
  soundBtn.addEventListener('click', () => {
    sound.toggle();
    sound.click();
  });
  sound.onChange((on) => {
    soundBtn.classList.toggle('is-on', on);
    soundBtn.setAttribute('aria-pressed', String(on));
    soundLabel.textContent = on ? 'Sound on' : 'Sound off';
  });

  const setMenu = (open: boolean): void => {
    menuOpen = open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.documentElement.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
      lenis.stop();
      sound.whoosh(0.7);
    } else {
      menu.classList.remove('is-open');
      lenis.start();
      setTimeout(() => {
        if (!menuOpen) menu.hidden = true;
      }, 500);
    }
  };
  menuBtn.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setMenu(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });
}
