import { siClaude, siFfmpeg, siGsap, siTypescript, siVercel, siVite, type SimpleIcon } from 'simple-icons';
import playwrightLogo from '../assets/playwright.svg';
import { $ } from '../lib/dom';

type Badge = { name: string; logo?: string; mark?: string };

const svgUrl = (inner: string, viewBox = '0 0 24 24'): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`)}`;

/** Official Simple Icons path in its brand colour; near-black marks switch to the page's light ink to stay visible. */
function brand(icon: SimpleIcon): string {
  const n = parseInt(icon.hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const fill = luminance < 0.3 ? '#ece6dc' : `#${icon.hex}`;
  return svgUrl(`<path fill="${fill}" d="${icon.path}"/>`);
}

// Web Audio is a browser standard with no logo of its own: a plain waveform stands in for it.
const waveform = svgUrl(
  '<path fill="none" stroke="#ece6dc" stroke-width="2.2" stroke-linecap="round" d="M2 12h3l2-6 3 12 3-15 3 18 3-12 2 3h1"/>',
);

const BADGES: Badge[] = [
  { name: 'Claude Code', logo: brand(siClaude) },
  { name: 'TypeScript', logo: brand(siTypescript) },
  { name: 'Vite', logo: brand(siVite) },
  { name: 'GSAP', logo: brand(siGsap) },
  // Lenis publishes no vector logo (only an animated banner), so it gets its brand red as a marker.
  { name: 'Lenis', mark: '#E30613' },
  { name: 'Web Audio API', logo: waveform },
  { name: 'Playwright', logo: playwrightLogo },
  { name: 'FFmpeg', logo: brand(siFfmpeg) },
  { name: 'Vercel', logo: brand(siVercel) },
];

/** "Built with" row on the entry gate: each technology as a badge with its own logo. */
export function renderStack(): void {
  const list = $('[data-badges]');
  list.innerHTML = '';
  BADGES.forEach((badge, i) => {
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
