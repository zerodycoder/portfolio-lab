import { gsap } from 'gsap';
import { $, $$, devMissing } from '../lib/dom';
import type { Media } from '../lib/media';

/**
 * Detail shots: a pinned track that slides sideways as you scroll down, on every screen size.
 * With reduced motion it falls back to a native swipe carousel.
 */
export function initDetails(media: Media): void {
  const root = $('[data-details]');
  const track = $('[data-details-track]', root);

  $$('[data-detail]', root).forEach((slot, i) => {
    const src = media.details?.[i];
    if (!src) return devMissing(slot, `d-${i + 1}.png`);
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;
    slot.appendChild(img);
    slot.classList.add('has-img');
  });

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    root.classList.add('is-pinned');
    const distance = (): number => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        id: 'details',
        trigger: root,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.8,
        invalidateOnRefresh: true,
      },
    });
    return () => root.classList.remove('is-pinned');
  });
}
