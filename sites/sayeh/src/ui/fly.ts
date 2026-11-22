import { gsap } from 'gsap';

/** A copy of the bag arcs from where it was clicked into the cart button, which then bumps. */
export function flyToCart(img: HTMLImageElement): void {
  const target = document.querySelector<HTMLElement>('[data-cart-btn]');
  if (!target) return;
  const from = img.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = img.cloneNode() as HTMLImageElement;
  ghost.removeAttribute('style');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    zIndex: '75',
    pointerEvents: 'none',
    maxWidth: 'none',
  });
  document.body.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const s = Math.max(0.08, 26 / from.height);
  gsap
    .timeline({ onComplete: () => ghost.remove() })
    .to(ghost, { x: dx, duration: 0.75, ease: 'power1.inOut' }, 0)
    .to(ghost, { y: dy, duration: 0.75, ease: 'back.in(1.4)' }, 0)
    .to(ghost, { scale: s, rotate: 18, duration: 0.75, ease: 'power2.in' }, 0)
    .to(ghost, { autoAlpha: 0, duration: 0.15 }, 0.66)
    .fromTo(target, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1.1, 0.4)' }, 0.72);
}
