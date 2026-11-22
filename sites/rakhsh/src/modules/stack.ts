import { siClaude, siFfmpeg, siGsap, siTypescript, siVercel, siVite } from 'simple-icons';
import { brandLogo, playwrightLogo, renderBadges, waveformLogo, type Badge } from '@portfolio-lab/kit/stack';
import { $ } from '../lib/dom';

const page = { background: 'dark', ink: '#ece6dc' } as const;

const BADGES: Badge[] = [
  { name: 'Claude Code', logo: brandLogo(siClaude, page) },
  { name: 'TypeScript', logo: brandLogo(siTypescript, page) },
  { name: 'Vite', logo: brandLogo(siVite, page) },
  { name: 'GSAP', logo: brandLogo(siGsap, page) },
  // Lenis publishes no vector logo (only an animated banner), so it gets its brand red as a marker.
  { name: 'Lenis', mark: '#E30613' },
  { name: 'Web Audio API', logo: waveformLogo(page.ink) },
  { name: 'Playwright', logo: playwrightLogo },
  { name: 'FFmpeg', logo: brandLogo(siFfmpeg, page) },
  { name: 'Vercel', logo: brandLogo(siVercel, page) },
];

/** "Built with" row on the entry gate: each technology as a badge with its own logo. */
export function renderStack(): void {
  renderBadges($('[data-badges]'), BADGES);
}
