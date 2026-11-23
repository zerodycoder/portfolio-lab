import { AudioEngine, type Live } from '@portfolio-lab/kit/audio';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** A looping noise voice whose level and filter follow a value every frame (pouring, scraping, sloshing). */
type Bed = { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; level: number };

/**
 * The café's sounds, synthesised on the shared engine (no audio files). Everything is soft and organic: milk
 * pouring (filtered noise with a gurgle and the odd bubble), an etching pen's whisper, a swirl's slosh, ceramic
 * clinks, a rubber stamp, paper, roasting beans cracking, a soft timer bell. Repeated sounds vary every time.
 */
export class Sound extends AudioEngine {
  private lastTick = 0;
  private beds: Record<'pour' | 'scrape' | 'slosh', Bed | null> = { pour: null, scrape: null, slosh: null };
  private bubbleAt = 0;

  constructor() {
    super({ level: 0.85, fadeIn: 0.5 });
  }

  /** Sound switched (back) on: no bed may resume at a level it was left at. */
  protected started(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    Object.values(this.beds).forEach((b) => {
      if (!b) return;
      b.level = 0;
      b.gain.gain.cancelScheduledValues(ctx.currentTime);
      b.gain.gain.setValueAtTime(0, ctx.currentTime);
    });
  }

  /** Silences the continuous voices (the cup went still or off screen). */
  hush(): void {
    this.pour(0);
    this.scrape(0);
    this.slosh(0);
  }

  private bed(l: Live, name: keyof Sound['beds'], type: BiquadFilterType, freq: number, q: number): Bed {
    const existing = this.beds[name];
    if (existing) return existing;
    const src = l.ctx.createBufferSource();
    src.buffer = l.noise;
    src.loop = true;
    const filter = l.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = l.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(l.out);
    src.start();
    const b = { src, filter, gain, level: 0 };
    this.beds[name] = b;
    return b;
  }

  private drive(b: Bed, l: Live, level: number, tc = 0.06): void {
    if (Math.abs(level - b.level) < 0.002) return;
    b.level = level;
    b.gain.gain.setTargetAtTime(level, l.ctx.currentTime, tc);
  }

  /** Milk pouring: a soft bandpassed rush that thickens with the flow, a slow gurgle, and the odd bubble. */
  pour(flow: number): void {
    const l = this.live();
    if (!l) {
      return;
    }
    const b = this.bed(l, 'pour', 'bandpass', 900, 0.9);
    const f = Math.max(0, Math.min(1, flow));
    this.drive(b, l, f * 0.07);
    if (f > 0.05) {
      const t = l.ctx.currentTime;
      b.filter.frequency.setTargetAtTime(650 + 500 * f + Math.sin(t * 7) * 120 + Math.sin(t * 2.3) * 80, t, 0.05);
      if (performance.now() > this.bubbleAt) {
        this.bubbleAt = performance.now() + rand(90, 260) / (0.4 + f);
        this.bubble(l, f);
      }
    }
  }

  /** A small rising "plip": a bubble in the jug. */
  private bubble(l: Live, f: number): void {
    const t = l.ctx.currentTime;
    const base = rand(380, 820);
    this.tone(l, t, 'sine', base, base * rand(1.6, 2.2), 0.012 + 0.014 * f, 0.004, rand(0.04, 0.07));
  }

  /** The etching pen whispering through foam; `speed` 0..1. */
  scrape(speed: number): void {
    const l = this.live();
    if (!l) return;
    const b = this.bed(l, 'scrape', 'highpass', 3200, 0.7);
    this.drive(b, l, speed * 0.025, 0.04);
  }

  /** Liquid sloshing around the cup; `speed` 0..1. */
  slosh(speed: number): void {
    const l = this.live();
    if (!l) return;
    const b = this.bed(l, 'slosh', 'lowpass', 420, 1.4);
    this.drive(b, l, speed * 0.09, 0.08);
    if (speed > 0.05) b.filter.frequency.setTargetAtTime(300 + speed * 380, l.ctx.currentTime, 0.1);
  }

  /** Porcelain: a few inharmonic partials with a quick decay, never the same twice. */
  clink(soft = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const f = rand(1900, 2300);
    [1, 2.76, 5.4, 8.9].forEach((ratio, i) => {
      this.tone(l, t + i * 0.002, 'sine', f * ratio, f * ratio * 0.998, (0.035 / (i + 1)) * soft, 0.002, 0.22 / (1 + i * 0.6));
    });
    this.noiseHit(l, t, 'highpass', 5000, 4000, 0.7, 0.02 * soft, 0.001, 0.02);
  }

  /** Soft UI tick (rate-limited). */
  tick(): void {
    const l = this.live();
    if (!l) return;
    const now = performance.now();
    if (now - this.lastTick < 55) return;
    this.lastTick = now;
    this.tone(l, l.ctx.currentTime, 'sine', 1500, 1100, 0.02, 0.002, 0.035);
  }

  /** A wooden press: buttons and toggles. */
  press(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'triangle', 520, 330, 0.06, 0.002, 0.06);
    this.noiseHit(l, t, 'bandpass', 2200, 1500, 2.5, 0.03, 0.001, 0.025);
  }

  /** A slider detent. */
  detent(pitch = 0.5): void {
    const l = this.live();
    if (!l) return;
    const now = performance.now();
    if (now - this.lastTick < 35) return;
    this.lastTick = now;
    const f = 900 + pitch * 900;
    this.tone(l, l.ctx.currentTime, 'sine', f, f * 0.9, 0.018, 0.001, 0.03);
  }

  /** A rubber stamp on card: a padded thump and a little paper. */
  stamp(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 150, 70, 0.09, 0.004, 0.16);
    this.noiseHit(l, t, 'lowpass', 900, 300, 0.8, 0.04, 0.002, 0.08);
    this.noiseHit(l, t + 0.01, 'bandpass', 2600, 1800, 1.2, 0.02, 0.003, 0.06);
  }

  /** Paper: a page turning or a card coming out. */
  paper(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.noiseHit(l, t, 'bandpass', 1400, 3800, 0.8, 0.035, 0.06, 0.2);
    this.noiseHit(l, t + 0.05, 'highpass', 4200, 6000, 0.6, 0.012, 0.03, 0.12);
  }

  /** A kraft bag of beans set down: crinkles, then beans settling. */
  bag(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    for (let i = 0; i < 5; i++) this.noiseHit(l, t + i * rand(0.025, 0.05), 'bandpass', rand(1800, 3200), rand(1200, 2000), 1.6, rand(0.02, 0.035), 0.002, rand(0.03, 0.06));
    for (let i = 0; i < 9; i++) this.noiseHit(l, t + 0.16 + i * rand(0.012, 0.03), 'bandpass', rand(3500, 5500), 3000, 4, rand(0.008, 0.016), 0.001, 0.012);
    this.tone(l, t + 0.15, 'sine', 140, 90, 0.05, 0.004, 0.1);
  }

  /** Roasting beans at first crack: a scatter of small pops, popcorn-like but soft. */
  crack(intensity = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const n = Math.round(6 + intensity * 10);
    for (let i = 0; i < n; i++) {
      const at = t + rand(0, 1.4);
      this.noiseHit(l, at, 'bandpass', rand(1500, 3400), rand(900, 1500), 2.5, rand(0.05, 0.1) * intensity, 0.0008, rand(0.012, 0.03));
      this.tone(l, at, 'sine', rand(300, 520), 200, 0.025 * intensity, 0.001, 0.02);
    }
  }

  /** The brew timer's bell: soft, with a long tail. */
  chime(step = 0): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const notes = [659.25, 783.99, 880, 987.77, 1174.66];
    const f = notes[step % notes.length];
    this.tone(l, t, 'sine', f, f, 0.05, 0.005, 1.4);
    this.tone(l, t, 'sine', f * 2.01, f * 2.01, 0.012, 0.004, 0.7);
    this.tone(l, t, 'triangle', f / 2, f / 2, 0.012, 0.01, 0.9);
  }

  /** Two soft notes, rising: something good happened (an A, a sweet spot). */
  bright(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 784, 784, 0.04, 0.005, 0.5);
    this.tone(l, t + 0.11, 'sine', 1175, 1175, 0.04, 0.005, 0.8);
  }

  /** Coming in: a cup set on its saucer, then a little room. */
  welcome(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t + 0.25, 'sine', 110, 70, 0.05, 0.01, 0.25);
    window.setTimeout(() => this.clink(0.8), 260);
  }
}
