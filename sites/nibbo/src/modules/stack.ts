import { siClaude, siGsap, siThreedotjs, siTypescript, siVercel, siVite } from 'simple-icons';
import { brandLogo, playwrightLogo, renderBadges, waveformLogo, type Badge } from '@portfolio-lab/kit/stack';
import { $ } from '../lib/dom';

const page = { background: 'light', ink: '#1e1b2e' } as const;

const BADGES: Badge[] = [
  { name: 'Claude Code', logo: brandLogo(siClaude, page) },
  { name: 'TypeScript', logo: brandLogo(siTypescript, page) },
  { name: 'three.js', logo: brandLogo(siThreedotjs, page) },
  { name: 'Vite', logo: brandLogo(siVite, page) },
  { name: 'GSAP', logo: brandLogo(siGsap, page) },
  // Lenis publishes no vector logo, so it gets its brand red as a marker.
  { name: 'Lenis', mark: '#E30613' },
  { name: 'Web Audio API', logo: waveformLogo(page.ink) },
  { name: 'Playwright', logo: playwrightLogo },
  { name: 'Vercel', logo: brandLogo(siVercel, page) },
];

export function renderStack(): void {
  renderBadges($('[data-badges]'), BADGES);
}
