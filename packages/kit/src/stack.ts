import type { SimpleIcon } from 'simple-icons';
import playwrightSvg from './assets/playwright.svg';

/** A technology on the "Built with" row: its logo as an image URL, or a colour dot when it has no vector logo. */
export type Badge = { name: string; logo?: string; mark?: string };

export const svgUrl = (inner: string, viewBox = '0 0 24 24'): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`)}`;

/**
 * Official Simple Icons path in its brand colour. A mark that would vanish into the page (near-black on a dark
 * page, near-white on a light one) is drawn in the page's ink instead.
 */
export function brandLogo(icon: SimpleIcon, page: { background: 'dark' | 'light'; ink: string }): string {
  const n = parseInt(icon.hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const lost = page.background === 'dark' ? luminance < 0.3 : luminance > 0.8;
  return svgUrl(`<path fill="${lost ? page.ink : `#${icon.hex}`}" d="${icon.path}"/>`);
}

/** Web Audio is a browser standard with no logo of its own: a plain waveform stands in for it. */
export const waveformLogo = (ink: string): string =>
  svgUrl(`<path fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" d="M2 12h3l2-6 3 12 3-15 3 18 3-12 2 3h1"/>`);

/** Playwright isn't in Simple Icons; this is its official SVG from microsoft/playwright.dev. */
export const playwrightLogo: string = playwrightSvg;

/** Renders the badges into a list (each gets `--i` for a staggered entrance). */
export function renderBadges(list: HTMLElement, badges: Badge[]): void {
  list.innerHTML = '';
  badges.forEach((badge, i) => {
    const li = document.createElement('li');
    li.className = 'badge';
    li.style.setProperty('--i', String(i));
    if (badge.logo) {
      const img = document.createElement('img');
      img.src = badge.logo;
      img.alt = '';
      img.width = 15;
      img.height = 15;
      li.appendChild(img);
    } else if (badge.mark) {
      const dot = document.createElement('i');
      dot.className = 'badge__mark';
      dot.style.background = badge.mark;
      li.appendChild(dot);
    }
    li.appendChild(document.createTextNode(badge.name));
    list.appendChild(li);
  });
}
