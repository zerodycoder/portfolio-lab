import { AudioEngine, type Live } from '@portfolio-lab/kit/audio';
import type { Mood } from '../three/face';

/**
 * Nibbo's voice and the site's sounds, all synthesised on the shared engine: no audio files.
 * The voice is a string of short syllables: a gliding oscillator through a vowel formant, so a typed name gets
 * its own little robot pronunciation. Everything is kept soft (peaks well under the master), because a
 * toy that shouts at full phone volume is not cute.
 */

const VOWELS: Record<string, [number, number]> = {
  a: [800, 1250],
  e: [420, 2100],
  i: [320, 2600],
  o: [520, 900],
  u: [360, 760],
  y: [340, 2300],
};

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class Sound extends AudioEngine {
  private lastTick = 0;
  private voiceBusy = 0;

  constructor() {
    super({ level: 0.8, fadeIn: 0.45 });
  }

  /** A syllable: oscillator glide through a vowel formant, with a little vibrato. */
  private syllable(l: Live, t: number, f0: number, f1: number, dur: number, vowel: [number, number], peak = 0.07, type: OscillatorType = 'triangle'): void {
    const o = l.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const vib = l.ctx.createOscillator();
    vib.frequency.value = rand(18, 28);
    const vibAmt = l.ctx.createGain();
    vibAmt.gain.value = f0 * 0.012;
    vib.connect(vibAmt).connect(o.frequency);

    const bp1 = l.ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = vowel[0];
    bp1.Q.value = 2.2;
    const bp2 = l.ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = vowel[1];
    bp2.Q.value = 3;
    const dry = l.ctx.createGain();
    dry.gain.value = 0.35;
    const g = l.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.25));
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp1).connect(g);
    o.connect(bp2).connect(g);
    o.connect(dry).connect(g);
    g.connect(l.out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
  }

  /** Soft hover tick, rate-limited so sweeping across buttons doesn't rattle. */
  tick(): void {
    const l = this.live();
    if (!l) return;
    const now = performance.now();
    if (now - this.lastTick < 60) return;
    this.lastTick = now;
    this.tone(l, l.ctx.currentTime, 'sine', 1800, 1300, 0.025, 0.002, 0.04);
  }

  /** A rounded pop: blocks snapping in (up) or coming out (down). */
  pop(up = true): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    if (up) this.tone(l, t, 'sine', 380, 760, 0.09, 0.004, 0.09);
    else this.tone(l, t, 'sine', 620, 280, 0.07, 0.004, 0.1);
    this.noiseHit(l, t, 'bandpass', 2400, 1800, 2, 0.03, 0.001, 0.02);
  }

  /** Pressing a chunky toy button. */
  press(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'triangle', 240, 150, 0.08, 0.003, 0.06);
    this.noiseHit(l, t, 'highpass', 2600, 2000, 0.8, 0.04, 0.001, 0.025);
  }

  /** A wooden toy block knocked: a hollow tok. */
  tok(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'triangle', 820, 560, 0.09, 0.002, 0.09);
    this.tone(l, t, 'sine', 1640, 1200, 0.03, 0.002, 0.05);
    this.noiseHit(l, t, 'bandpass', 2600, 1800, 3, 0.05, 0.001, 0.03);
  }

  /** A poke on the nose. */
  boop(): void {
    const l = this.live();
    if (!l) return;
    this.syllable(l, l.ctx.currentTime, 700, 1500, 0.12, VOWELS.u, 0.08, 'sine');
  }

  /** Wordless babble with a melody that matches the mood. */
  chirp(mood: Mood | 'hello' | 'question' = 'idle'): void {
    const l = this.live();
    if (!l) return;
    let t = l.ctx.currentTime + 0.01;
    const notes: [number, number, number, keyof typeof VOWELS][] = [];
    switch (mood) {
      case 'hello':
        notes.push([620, 760, 0.11, 'a'], [900, 1300, 0.16, 'i']);
        break;
      case 'happy':
      case 'joy':
      case 'starry':
        for (let i = 0; i < 4; i++) notes.push([800 + i * 140, 1000 + i * 160, rand(0.06, 0.09), i % 2 ? 'i' : 'a']);
        break;
      case 'curious':
      case 'question':
        notes.push([600, 640, 0.1, 'o'], [640, 1400, 0.2, 'e']);
        break;
      case 'sad':
        notes.push([760, 520, 0.22, 'o'], [520, 380, 0.3, 'u']);
        break;
      case 'grumpy':
        return this.hmph();
      case 'love':
        notes.push([700, 900, 0.18, 'o'], [940, 1240, 0.28, 'u']);
        break;
      case 'surprised':
        notes.push([480, 1700, 0.18, 'o']);
        break;
      case 'sleepy':
      case 'asleep':
        return this.yawn();
      case 'dizzy':
      case 'oops':
        return this.woozy();
      default: {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const f = rand(620, 1100);
          const keys = Object.keys(VOWELS) as (keyof typeof VOWELS)[];
          notes.push([f, f * rand(0.8, 1.3), rand(0.06, 0.12), keys[Math.floor(Math.random() * keys.length)]]);
        }
      }
    }
    for (const [f0, f1, d, v] of notes) {
      this.syllable(l, t, f0, f1, d, VOWELS[v]);
      t += d + 0.035;
    }
  }

  /**
   * Says a word in robot: vowels become sung syllables with their own formant, consonants short clicks and
   * glides, with a falling melody that lifts at the end. Returns the duration in seconds.
   */
  say(text: string): number {
    const l = this.live();
    const word = text.toLowerCase().replace(/[^a-z0-9 !?]/g, '').slice(0, 16);
    if (!l || !word) return 0;
    const start = Math.max(l.ctx.currentTime + 0.02, this.voiceBusy);
    let t = start;
    const letters = [...word];
    letters.forEach((ch, i) => {
      const progress = i / Math.max(1, letters.length - 1);
      const base = 760 - progress * 180 + (i === letters.length - 1 ? 260 : 0);
      if (ch === ' ') {
        t += 0.08;
      } else if (VOWELS[ch]) {
        const d = 0.11;
        this.syllable(l, t, base, base * 1.12, d, VOWELS[ch], 0.075);
        t += d + 0.02;
      } else if (/[0-9]/.test(ch)) {
        const f = 500 + Number(ch) * 90;
        this.tone(l, t, 'square', f, f, 0.025, 0.004, 0.07);
        t += 0.09;
      } else if (ch === '!' || ch === '?') {
        this.syllable(l, t, base, base * 1.6, 0.12, VOWELS.i, 0.06);
        t += 0.14;
      } else {
        // Consonant: a short tick of noise plus a quick glide into the next sound.
        const code = ch.charCodeAt(0);
        this.noiseHit(l, t, 'bandpass', 1800 + (code % 7) * 500, 1500, 3, 0.05, 0.002, 0.03);
        this.syllable(l, t + 0.01, base * 0.9, base * 1.05, 0.05, VOWELS.e, 0.045, 'square');
        t += 0.06;
      }
    });
    this.voiceBusy = t;
    return t - start;
  }

  hmph(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.syllable(l, t, 260, 200, 0.16, VOWELS.u, 0.07, 'square');
    this.noiseHit(l, t + 0.05, 'lowpass', 900, 300, 0.7, 0.05, 0.01, 0.18);
  }

  yawn(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.syllable(l, t, 520, 880, 0.45, VOWELS.a, 0.055, 'sine');
    this.syllable(l, t + 0.45, 880, 360, 0.6, VOWELS.o, 0.05, 'sine');
  }

  /** A sleeping breath: very quiet filtered air. */
  snore(): void {
    const l = this.live();
    if (!l) return;
    this.noiseHit(l, l.ctx.currentTime, 'bandpass', 380, 520, 1.4, 0.035, 0.7, 0.9);
  }

  woozy(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const o = l.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(700, t);
    const lfo = l.ctx.createOscillator();
    lfo.frequency.setValueAtTime(7, t);
    lfo.frequency.linearRampToValueAtTime(3, t + 1);
    const amt = l.ctx.createGain();
    amt.gain.value = 180;
    lfo.connect(amt).connect(o.frequency);
    o.frequency.exponentialRampToValueAtTime(380, t + 1);
    const g = l.ctx.createGain();
    this.envelope(g, t, 0.05, 0.05, 1);
    o.connect(g).connect(l.out);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.1);
    lfo.stop(t + 1.1);
  }

  giggle(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const f = 1300 - i * 90;
      this.syllable(l, t + i * 0.075, f, f * 0.85, 0.06, i % 2 ? VOWELS.i : VOWELS.e, 0.06, 'sine');
    }
  }

  whee(): void {
    const l = this.live();
    if (!l) return;
    this.syllable(l, l.ctx.currentTime, 520, 1700, 0.5, VOWELS.i, 0.065, 'sine');
  }

  /** Bumping into a wall: a soft thud and an "oof". */
  bump(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 150, 55, 0.22, 0.004, 0.22);
    this.noiseHit(l, t, 'lowpass', 1200, 200, 0.8, 0.09, 0.002, 0.12);
    this.syllable(l, t + 0.08, 720, 330, 0.22, VOWELS.u, 0.06);
  }

  /** Landing after a hop or a toss. */
  land(power = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'sine', 130, 60, 0.12 * power, 0.003, 0.14);
    this.noiseHit(l, t, 'lowpass', 800, 200, 0.7, 0.04 * power, 0.002, 0.08);
  }

  /**
   * One move on the board. Not a motor buzz: a soft rubber-wheel whirr under a little sung note, and each
   * step climbs a pentatonic scale, so a whole program plays as a tiny tune.
   */
  roll(seconds = 0.4, step = 0): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const o = l.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.linearRampToValueAtTime(250, t + seconds * 0.5);
    o.frequency.linearRampToValueAtTime(220, t + seconds);
    const lp = l.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = l.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.08);
    g.gain.setValueAtTime(0.03, t + seconds - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(lp).connect(g).connect(l.out);
    o.start(t);
    o.stop(t + seconds + 0.02);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const f = 523.25 * Math.pow(2, scale[step % scale.length] / 12);
    this.syllable(l, t + 0.02, f, f * 1.02, 0.12, VOWELS.o, 0.035, 'sine');
  }

  /** Little servo whirr for turns and arm moves: soft and short. */
  servo(up = true): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const o = l.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(up ? 520 : 660, t);
    o.frequency.exponentialRampToValueAtTime(up ? 700 : 500, t + 0.16);
    const lp = l.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const g = l.ctx.createGain();
    this.envelope(g, t, 0.02, 0.02, 0.16);
    o.connect(lp).connect(g).connect(l.out);
    o.start(t);
    o.stop(t + 0.22);
  }

  /** Picking up a spark on the board. */
  spark(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'triangle', 988, 988, 0.06, 0.004, 0.08);
    this.tone(l, t + 0.07, 'triangle', 1319, 1319, 0.06, 0.004, 0.2);
  }

  /** Level complete. */
  jingle(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(l, t + i * 0.1, 'triangle', f, f, 0.075, 0.005, 0.32);
      this.tone(l, t + i * 0.1, 'sine', f * 2, f * 2, 0.02, 0.005, 0.2);
    });
    for (let i = 0; i < 6; i++) this.tone(l, t + 0.42 + i * 0.05, 'sine', 2000 + i * 260, 2400 + i * 260, 0.015, 0.003, 0.08);
  }

  /** Cardboard flap folding shut. */
  flap(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.noiseHit(l, t, 'lowpass', 1400, 300, 0.9, 0.12, 0.004, 0.12);
    this.tone(l, t, 'sine', 110, 70, 0.08, 0.003, 0.1);
  }

  /** Packing tape pulled across the box. */
  tape(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    for (let i = 0; i < 14; i++) this.noiseHit(l, t + i * 0.028, 'bandpass', 2200 + Math.random() * 1600, 1800, 1.5, 0.05, 0.002, 0.02);
  }

  /** Entry: a sleepy little yawn, then a bright two-note "hi". Gentle, never a bang. */
  wake(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.syllable(l, t + 0.15, 420, 700, 0.4, VOWELS.a, 0.04, 'sine');
    this.syllable(l, t + 0.55, 700, 420, 0.4, VOWELS.o, 0.035, 'sine');
    this.tone(l, t + 1.1, 'sine', 1318, 1318, 0.02, 0.02, 0.9);
    this.tone(l, t + 1.22, 'sine', 1976, 1976, 0.014, 0.02, 0.8);
  }
}
