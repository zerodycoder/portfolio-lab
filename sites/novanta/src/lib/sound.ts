import { AudioEngine, type Live } from '@portfolio-lab/kit/audio';

/**
 * Every sound in the pizzeria, synthesised: the fire's crackle and rumble, the sizzle of a pizza in the oven, soft
 * landings tuned to a scale (a handful of toppings plays a little phrase), the peel's scrape, a bell, cardboard,
 * paper, a doorbell. And the radio: an original Neapolitan-style waltz on a mandolin and a guitar, both
 * synthesised by physical modelling (Karplus-Strong plucked strings), played through a small-radio filter.
 * Everything is soft; nothing bangs.
 */

const A4 = 440;
const midi = (n: number): number => A4 * Math.pow(2, (n - 69) / 12);
// D minor pentatonic-ish scale for landings.
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91];

// The tune: [midi note or 0 rest, beats]. 3/4 time. Original melody.
const MELODY: [number, number][] = [
  [69, 3], [67, 1], [65, 1], [64, 1], [65, 2], [62, 1], [57, 3],
  [70, 1], [69, 1], [67, 1], [69, 2], [65, 1], [64, 1], [65, 1], [67, 1], [69, 3],
  [74, 2], [72, 1], [70, 1], [69, 1], [67, 1], [69, 2], [65, 1], [62, 3],
  [64, 1], [65, 1], [67, 1], [69, 1], [67, 1], [65, 1], [64, 2], [61, 1], [62, 3],
];
// One chord per bar (root, third, fifth), 16 bars.
const CHORDS: number[][] = [
  [50, 53, 57], [48, 52, 55], [50, 53, 57], [45, 49, 52],
  [43, 46, 50], [50, 53, 57], [48, 52, 55], [41, 45, 48],
  [46, 50, 53], [43, 46, 50], [50, 53, 57], [50, 53, 57],
  [48, 52, 55], [50, 53, 57], [45, 49, 52], [50, 53, 57],
];

export class Sound extends AudioEngine {
  private bed: { rumble: GainNode; sizzle: GainNode; src: AudioBufferSourceNode[] } | null = null;
  private fireLevel = 0;
  private sizzleLevel = 0;
  private crackleTimer = 0;
  private strings = new Map<number, AudioBuffer>();
  private radioBus: GainNode | null = null;
  private radioOn = false;
  private songTimer = 0;
  private songPos = 0;
  private nextBeatAt = 0;
  private radioListeners = new Set<(on: boolean) => void>();

  constructor() {
    super({ level: 0.8, fadeIn: 0.5 });
  }

  protected started(): void {
    this.ensureBed();
    this.scheduleCrackle();
  }

  // ————— Ambience —————

  private ensureBed(): void {
    const l = this.live();
    if (!l || this.bed) return;
    const mk = (type: BiquadFilterType, f: number, q: number): { src: AudioBufferSourceNode; g: GainNode } => {
      const src = l.ctx.createBufferSource();
      src.buffer = l.noise;
      src.loop = true;
      const filter = l.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = f;
      filter.Q.value = q;
      const g = l.ctx.createGain();
      g.gain.value = 0;
      src.connect(filter).connect(g).connect(l.out);
      src.start();
      return { src, g };
    };
    const rumble = mk('lowpass', 170, 0.7);
    const sizzle = mk('highpass', 4200, 0.5);
    this.bed = { rumble: rumble.g, sizzle: sizzle.g, src: [rumble.src, sizzle.src] };
    this.applyLevels();
  }

  /** 0 (cold) … 1 (at the oven) … 1.6 (fanned). */
  setFire(level: number): void {
    this.fireLevel = level;
    this.applyLevels();
  }

  /** 0 … 1: how loudly the pizza sizzles. */
  setSizzle(level: number): void {
    this.sizzleLevel = level;
    this.applyLevels();
  }

  private applyLevels(): void {
    const l = this.live();
    if (!l || !this.bed) return;
    const t = l.ctx.currentTime;
    this.bed.rumble.gain.setTargetAtTime(0.05 * this.fireLevel, t, 0.4);
    this.bed.sizzle.gain.setTargetAtTime(0.022 * this.sizzleLevel, t, 0.3);
  }

  private scheduleCrackle(): void {
    window.clearTimeout(this.crackleTimer);
    const tick = (): void => {
      const l = this.live();
      if (l && this.fireLevel > 0.05) {
        const n = Math.random() < 0.5 ? 1 : 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const t = l.ctx.currentTime + i * (0.012 + Math.random() * 0.03);
          const f = 1600 + Math.random() * 3800;
          this.noiseHit(l, t, 'bandpass', f, f * 0.7, 4, 0.06 * this.fireLevel * (0.4 + Math.random()), 0.001, 0.02 + Math.random() * 0.04);
        }
      }
      this.crackleTimer = window.setTimeout(tick, 60 + Math.random() * 260 / Math.max(0.3, this.fireLevel));
    };
    tick();
  }

  // ————— Effects —————

  match(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.noiseHit(l, t, 'bandpass', 3500, 1200, 1.2, 0.08, 0.01, 0.18);
    this.noiseHit(l, t + 0.12, 'lowpass', 300, 1600, 0.6, 0.08, 0.15, 0.7);
  }

  /** The shutter rolling up: a soft ratchet of metal slats. */
  shutter(seconds: number): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const n = Math.round(seconds * 14);
    for (let i = 0; i < n; i++) this.noiseHit(l, t + i / 14 + Math.random() * 0.01, 'bandpass', 2600, 1800, 6, 0.018, 0.002, 0.05);
    this.noiseHit(l, t, 'lowpass', 400, 200, 0.5, 0.03, 0.1, seconds);
  }

  /** Dough pressed on the board. */
  thud(strength = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 150, 70, 0.12 * strength, 0.005, 0.18);
    this.noiseHit(l, t, 'lowpass', 900, 300, 0.7, 0.06 * strength, 0.003, 0.12);
  }

  /** A puff of flour: soft breath. */
  puff(): void {
    const l = this.live();
    if (!l) return;
    this.noiseHit(l, l.ctx.currentTime, 'bandpass', 1800, 700, 0.8, 0.03, 0.02, 0.3);
  }

  /** Sauce being spread: call repeatedly with the stroke speed (0..1). */
  swish(speed: number): void {
    const l = this.live();
    if (!l) return;
    const f = 600 + speed * 900;
    this.noiseHit(l, l.ctx.currentTime, 'bandpass', f, f * 0.8, 1.4, 0.02 + 0.03 * speed, 0.02, 0.09);
  }

  /** A topping landing: a soft wooden tap tuned to the topping's note. */
  drop(note: number, strength = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const f = midi(SCALE[Math.abs(note) % SCALE.length]);
    const s = Math.min(1, strength);
    this.tone(l, t, 'sine', f, f * 0.98, 0.05 * s, 0.004, 0.22);
    this.tone(l, t, 'triangle', f * 2, f * 1.96, 0.012 * s, 0.003, 0.09);
    this.noiseHit(l, t, 'lowpass', 1200, 500, 0.6, 0.025 * s, 0.002, 0.05);
  }

  whoosh(): void {
    const l = this.live();
    if (!l) return;
    this.noiseHit(l, l.ctx.currentTime, 'bandpass', 300, 1400, 0.9, 0.08, 0.18, 0.4);
  }

  /** Wood or metal sliding over stone. */
  scrape(metal = false): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.noiseHit(l, t, 'bandpass', metal ? 3200 : 1400, metal ? 2600 : 900, metal ? 5 : 2, 0.04, 0.04, 0.35);
  }

  bell(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    [1, 2.4, 3.9].forEach((k, i) => this.tone(l, t, 'sine', 988 * k, 988 * k, [0.06, 0.02, 0.01][i], 0.002, 1.6 - i * 0.4));
  }

  /** The cutter wheel: tiny ticks along the cut. */
  cutter(length = 0.5): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const n = Math.round(10 * length + 6);
    for (let i = 0; i < n; i++) this.noiseHit(l, t + i * 0.022, 'bandpass', 2600, 2200, 6, 0.02, 0.001, 0.02);
    this.noiseHit(l, t, 'lowpass', 500, 300, 0.7, 0.03, 0.02, n * 0.022);
  }

  /** Cheese stretching: a small glide up; snap: a pluck. */
  stretch(amount: number): void {
    const l = this.live();
    if (!l) return;
    this.tone(l, l.ctx.currentTime, 'sine', 220 + amount * 220, 230 + amount * 240, 0.015, 0.02, 0.1);
  }

  snap(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 520, 260, 0.05, 0.002, 0.15);
    this.noiseHit(l, t, 'highpass', 2000, 1500, 0.7, 0.02, 0.001, 0.04);
  }

  cardboard(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 120, 80, 0.08, 0.004, 0.12);
    this.noiseHit(l, t, 'bandpass', 700, 400, 1.2, 0.06, 0.003, 0.1);
  }

  tear(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    for (let i = 0; i < 8; i++) this.noiseHit(l, t + i * 0.025, 'highpass', 3000, 2000, 1, 0.025, 0.002, 0.03);
  }

  /** The rubber stamp on the loyalty card. */
  stamp(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 110, 60, 0.12, 0.003, 0.14);
    this.noiseHit(l, t, 'lowpass', 600, 200, 0.7, 0.05, 0.002, 0.08);
    this.tone(l, t + 0.08, 'sine', 880, 880, 0.03, 0.005, 0.3);
  }

  /** The thermal printer of the ticket. */
  printer(lines = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    for (let i = 0; i < lines * 6; i++) this.noiseHit(l, t + i * 0.03, 'bandpass', 3800, 3400, 3, 0.012, 0.002, 0.025);
  }

  doorbell(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 659, 659, 0.09, 0.005, 1.1);
    this.tone(l, t, 'sine', 1318, 1318, 0.015, 0.005, 0.6);
    this.tone(l, t + 0.55, 'sine', 523, 523, 0.09, 0.005, 1.4);
    this.tone(l, t + 0.55, 'sine', 1046, 1046, 0.015, 0.005, 0.7);
  }

  /** The rider's horn: two soft beeps. */
  beep(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'square', 740, 740, 0.012, 0.01, 0.1);
    this.tone(l, t + 0.16, 'square', 740, 740, 0.012, 0.01, 0.14);
  }

  /** A soft pentatonic ping (map milestones, UI). */
  ping(step = 0): void {
    const l = this.live();
    if (!l) return;
    const f = midi(SCALE[(step + 4) % SCALE.length]);
    this.tone(l, l.ctx.currentTime, 'sine', f, f, 0.04, 0.004, 0.5);
  }

  click(): void {
    const l = this.live();
    if (!l) return;
    this.noiseHit(l, l.ctx.currentTime, 'bandpass', 2400, 2000, 3, 0.02, 0.001, 0.02);
  }

  // ————— The radio —————

  /** A plucked string (Karplus-Strong), cached per note. */
  private string(l: Live, note: number, bright: number): AudioBuffer {
    const key = note * 10 + Math.round(bright * 9);
    const cached = this.strings.get(key);
    if (cached) return cached;
    const sr = l.ctx.sampleRate;
    const f = midi(note);
    const len = Math.floor(sr * 1.6);
    const buf = l.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    // Pre-filter the excitation: a softer pick for the guitar, a brighter one for the mandolin.
    for (let i = 1; i < N; i++) ring[i] = ring[i] * bright + ring[i - 1] * (1 - bright);
    const decay = 0.996 - (note > 70 ? 0.004 : 0);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx];
      const b = ring[(idx + 1) % N];
      const v = (a + b) * 0.5 * decay;
      ring[idx] = v;
      out[i] = a;
      idx = (idx + 1) % N;
    }
    // Fade the tail.
    for (let i = len - 2000; i < len; i++) out[i] *= (len - i) / 2000;
    this.strings.set(key, buf);
    return buf;
  }

  private pluck(l: Live, note: number, t: number, gain: number, bright: number): void {
    if (!this.radioBus) return;
    const src = l.ctx.createBufferSource();
    src.buffer = this.string(l, note, bright);
    const g = l.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.radioBus);
    src.start(t);
    src.stop(t + 1.6);
  }

  get radio(): boolean {
    return this.radioOn;
  }

  onRadio(fn: (on: boolean) => void): void {
    this.radioListeners.add(fn);
    fn(this.radioOn);
  }

  setRadio(on: boolean): void {
    if (on && !this.enabled) this.setEnabled(true);
    const l = this.live();
    this.radioOn = on;
    this.radioListeners.forEach((fn) => fn(on));
    if (!l) return;
    if (!this.radioBus) {
      // A small kitchen radio: no deep bass, no sparkle, a touch of warmth.
      const hp = l.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 220;
      const lp = l.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3600;
      const peak = l.ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = 1400;
      peak.gain.value = 4;
      this.radioBus = l.ctx.createGain();
      this.radioBus.gain.value = 0;
      this.radioBus.connect(hp).connect(peak).connect(lp).connect(l.out);
    }
    const t = l.ctx.currentTime;
    this.radioBus.gain.cancelScheduledValues(t);
    this.radioBus.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 0.6 : 0.15);
    window.clearInterval(this.songTimer);
    if (on) {
      this.nextBeatAt = t + 0.1;
      this.songTimer = window.setInterval(() => this.scheduleSong(), 120);
    }
  }

  /** Schedules the waltz a little ahead of time (tempo ♩ = 132, 3/4). */
  private scheduleSong(): void {
    const l = this.live();
    if (!l || !this.radioOn) return;
    const beat = 60 / 132;
    const horizon = l.ctx.currentTime + 0.5;
    const total = MELODY.reduce((a, [, b]) => a + b, 0);
    while (this.nextBeatAt < horizon) {
      const pos = this.songPos % total;
      const bar = Math.floor(pos / 3) % CHORDS.length;
      const inBar = pos % 3;
      const chord = CHORDS[bar];
      // Guitar: bass on one, the chord on two and three.
      if (inBar === 0) this.pluck(l, chord[0] - 12 + 12, this.nextBeatAt, 0.55, 0.45);
      else {
        this.pluck(l, chord[1] + 12, this.nextBeatAt, 0.22, 0.5);
        this.pluck(l, chord[2] + 12, this.nextBeatAt + 0.012, 0.2, 0.5);
      }
      // Mandolin: the melody note starting on this beat, with tremolo on long notes.
      let acc = 0;
      for (const [note, len] of MELODY) {
        if (acc === pos && note) {
          const reps = len >= 2 ? Math.floor(len * beat * 12) : 1;
          for (let r = 0; r < reps; r++) this.pluck(l, note, this.nextBeatAt + r / 12, r % 2 ? 0.16 : 0.24, 0.92);
        }
        acc += len;
        if (acc > pos) break;
      }
      this.songPos++;
      this.nextBeatAt += beat;
    }
  }
}
