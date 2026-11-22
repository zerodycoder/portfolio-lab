import { gsap } from 'gsap';
import { $, $$, devMissing } from '../lib/dom';
import type { Media } from '../lib/media';

/** Detail shots: a pinned horizontal track on desktop, a native swipe carousel on touch/narrow screens. */
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
  mm.add('(min-width: 900px)', () => {
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
  });
}
