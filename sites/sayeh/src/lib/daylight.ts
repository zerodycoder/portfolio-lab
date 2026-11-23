import { clamp } from '@portfolio-lab/kit/dom';

/**
 * The site's light. It follows the visitor's own clock: the sun's height and direction come from the local hour and
 * the date (a simple solar model at a mid latitude), and they set the page's palette, the angle and length of the
 * leaf shadows, and the warmth of the light on the coffee. The sun dial can override the hour to preview any time.
 */

export type Sky = {
  /** Minutes since local midnight (overridden or real). */
  minutes: number;
  /** Sun elevation in degrees (negative below the horizon). */
  elevation: number;
  /** Direction the sun shines from, degrees clockwise from north. */
  azimuth: number;
  /** 0 at night, 1 in full daylight. */
  day: number;
  /** 0..1: how golden the light is (low sun). */
  golden: number;
  phase: 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'golden hour' | 'dusk';
  dark: boolean;
  overridden: boolean;
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB): string => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/** Light palettes (a cool clear day and a golden low sun) and one dark palette for the night. */
const DAY = { paper: '#f3ece0', paper2: '#e9dfcf', card: '#fbf7f0', ink: '#2a1d15', ink2: '#5a4637', muted: '#86715f', accent: '#a8642a', leaf: '#3d5a3a' };
const GOLD = { paper: '#f4e2c6', paper2: '#ead0ad', card: '#fbf1e2', ink: '#2c1a10', ink2: '#5e4130', muted: '#8d6c50', accent: '#b5581c', leaf: '#4f5b2a' };
const NIGHT = { paper: '#16110e', paper2: '#211914', card: '#251c16', ink: '#f1e7d8', ink2: '#cdbba5', muted: '#9a8774', accent: '#e2a560', leaf: '#93b08a' };

export class Daylight {
  private override: number | null = null;
  private listeners = new Set<(s: Sky) => void>();
  sky: Sky;

  constructor() {
    this.sky = this.compute();
    this.apply();
    // The real sky moves too: refresh every minute.
    window.setInterval(() => {
      if (this.override === null) this.update();
    }, 60_000);
  }

  subscribe(fn: (s: Sky) => void): () => void {
    this.listeners.add(fn);
    fn(this.sky);
    return () => this.listeners.delete(fn);
  }

  /** Minutes since midnight to preview, or null to follow the clock again. */
  set(minutes: number | null): void {
    this.override = minutes === null ? null : ((minutes % 1440) + 1440) % 1440;
    this.update();
  }

  get overridden(): boolean {
    return this.override !== null;
  }

  private update(): void {
    this.sky = this.compute();
    this.apply();
    this.listeners.forEach((fn) => fn(this.sky));
  }

  /** Sun position for a time of day: day length and noon height vary with the season (latitude ~40°N). */
  static sun(minutes: number, date = new Date()): { elevation: number; azimuth: number; rise: number; set: number } {
    const start = new Date(date.getFullYear(), 0, 0);
    const doy = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
    const season = Math.sin((2 * Math.PI * (doy - 80)) / 365);
    const length = 12 + 3 * season; // hours of daylight
    const noon = 13; // solar noon in local (summer-ish) clock time
    const rise = noon - length / 2;
    const set = noon + length / 2;
    const h = minutes / 60;
    const maxElev = 50 + 23.4 * season;
    let elevation: number;
    if (h >= rise && h <= set) elevation = maxElev * Math.sin((Math.PI * (h - rise)) / length);
    else {
      // Below the horizon: down to -40° at solar midnight.
      const night = 24 - length;
      const into = h > set ? h - set : h + 24 - set;
      elevation = -40 * Math.sin((Math.PI * into) / night);
    }
    // From east at sunrise, through south at noon, to west at sunset.
    const azimuth = 90 + (180 * (h - rise)) / length;
    return { elevation, azimuth, rise: rise * 60, set: set * 60 };
  }

  private compute(): Sky {
    const now = new Date();
    const real = now.getHours() * 60 + now.getMinutes();
    const minutes = this.override ?? real;
    const { elevation, azimuth } = Daylight.sun(minutes, now);
    const day = clamp((elevation + 5) / 13, 0, 1);
    const golden = clamp(1 - Math.abs(elevation - 4) / 14, 0, 1) * (elevation > -4 ? 1 : 0);
    const h = minutes / 60;
    const phase: Sky['phase'] =
      elevation < -6
        ? 'night'
        : elevation < 2
          ? h < 12
            ? 'dawn'
            : 'dusk'
          : elevation < 14
            ? h < 12
              ? 'morning'
              : 'golden hour'
            : h < 11
              ? 'morning'
              : h < 15
                ? 'midday'
                : 'afternoon';
    return { minutes, elevation, azimuth, day, golden, phase, dark: day < 0.4, overridden: this.override !== null };
  }

  /** Writes the palette and the shadow geometry as CSS custom properties. */
  private apply(): void {
    const s = this.sky;
    const root = document.documentElement;
    const set = (k: string, v: string): void => root.style.setProperty(k, v);
    const pal = s.dark ? NIGHT : DAY;
    const t = s.dark ? 0 : s.golden * 0.85;
    (Object.keys(DAY) as (keyof typeof DAY)[]).forEach((k) => {
      const c = s.dark ? hex(pal[k]) : mix(hex(DAY[k]), hex(GOLD[k]), t);
      set(`--${k === 'paper2' ? 'paper-2' : k === 'ink2' ? 'ink-2' : k}`, css(c));
    });
    const ink = s.dark ? hex(NIGHT.ink) : hex(DAY.ink);
    set('--line', `rgb(${ink.join(' ')} / 0.14)`);
    set('--line-strong', `rgb(${ink.join(' ')} / 0.3)`);
    // Shadows fall away from the sun, longer when it's low. Screen up = north.
    const away = s.azimuth + 180;
    const len = clamp(1 / Math.tan((Math.max(6, s.elevation) * Math.PI) / 180), 0.4, 3.2);
    set('--shade-rot', `${(away % 360).toFixed(1)}deg`);
    set('--shade-len', len.toFixed(3));
    set('--shade-op', (s.day * (0.08 + 0.1 * clamp(s.elevation / 40, 0, 1)) + s.golden * 0.04).toFixed(3));
    set('--shade-blur', `${(6 + len * 5).toFixed(1)}px`);
    set('--golden', s.golden.toFixed(3));
    set('--night', (1 - s.day).toFixed(3));
    root.dataset.theme = s.dark ? 'dark' : 'light';
    root.dataset.phase = s.phase.replace(' ', '-');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.dark ? NIGHT.paper : css(mix(hex(DAY.paper), hex(GOLD.paper), t)));
  }

  /**
   * The light on the coffee: a warm tint at golden hour, a dim lamp at night. Its direction stays with the window in
   * the photo around the cup (top left); only the colour of the light changes with the hour.
   */
  coffeeLight(): { tint: [number, number, number]; sheen: number; dir: [number, number] } {
    const s = this.sky;
    const dir: [number, number] = [-0.55, 0.6];
    if (s.dark) return { tint: [0.84, 0.74, 0.64], sheen: 0.5, dir };
    const g = s.golden;
    return { tint: [1 + 0.05 * g, 1 - 0.02 * g, 1 - 0.1 * g], sheen: 1 - g * 0.2, dir };
  }
}

export const PHASE_LINES: Record<Sky['phase'], string> = {
  night: 'Night. The lamps are on.',
  dawn: 'Dawn. First light on the table.',
  morning: 'Morning light through the leaves.',
  midday: 'Midday. Short, sharp shadows.',
  afternoon: 'Afternoon. The shadows stretch.',
  'golden hour': 'Golden hour. Long warm shadows.',
  dusk: 'Dusk. The café lights come on.',
};
