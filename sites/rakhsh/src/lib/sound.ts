import { AudioEngine, type Live } from '@portfolio-lab/kit/audio';

/**
 * RAKHSH's sounds, synthesised on the shared engine (no sound files): UI ticks, lightning, a thermal printer,
 * a room tone and an electric-motor whine that tracks speed. Nothing plays until "Enter with sound".
 */

type MotorGraph = {
  tones: OscillatorNode[];
  sub: OscillatorNode;
  lp: BiquadFilterNode;
  out: GainNode;
  windBp: BiquadFilterNode;
  windGain: GainNode;
};

export class Sound extends AudioEngine {
  private motorGraph: MotorGraph | null = null;
  private ambient = false;

  protected started(): void {
    this.startAmbient();
  }

  /** Tiny high blip for hovers. */
  tick(level = 1): void {
    const l = this.live();
    if (!l) return;
    this.tone(l, l.ctx.currentTime, 'sine', 2300, 1500, 0.045 * level, 0.002, 0.035);
  }

  /** Two-tone mechanical click for presses. */
  click(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.tone(l, t, 'square', 180, 90, 0.06, 0.002, 0.05);
    this.noiseHit(l, t, 'highpass', 3000, 2500, 0.7, 0.08, 0.001, 0.03);
  }

  /** Air moving past: used when sections change. */
  whoosh(level = 1): void {
    const l = this.live();
    if (!l) return;
    this.noiseHit(l, l.ctx.currentTime, 'bandpass', 320, 2600, 1.2, 0.22 * level, 0.25, 0.55);
  }

  /** Entry: a soft rising swell, a breath of air and a quiet chime. Welcoming, never a bang. */
  powerUp(): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const o = l.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 1.8);
    const g = l.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g).connect(l.out);
    o.start(t);
    o.stop(t + 2.5);
    this.noiseHit(l, t, 'bandpass', 380, 2200, 0.9, 0.05, 0.7, 1.1);
    this.tone(l, t + 0.6, 'sine', 1320, 1316, 0.03, 0.03, 1.8);
    this.tone(l, t + 0.6, 'sine', 1980, 1974, 0.012, 0.03, 1.3);
  }

  /** Lightning: a broadband crack, crackle and sub thump. */
  crack(power = 1): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    this.noiseHit(l, t, 'lowpass', 9000, 160, 0.6, 0.75 * power, 0.006, 0.6 + 0.9 * power);
    for (let i = 0; i < 6; i++) {
      this.noiseHit(l, t + Math.random() * 0.24, 'highpass', 2600, 1800, 0.8, 0.45 * power, 0.002, 0.03 + Math.random() * 0.05);
    }
    this.tone(l, t, 'sine', 110, 34, 0.9 * power, 0.008, 0.5 + 0.4 * power);
  }

  /** Thermal printer feeding paper. */
  printer(duration = 1.4): void {
    const l = this.live();
    if (!l) return;
    const t = l.ctx.currentTime;
    const steps = Math.floor(duration / 0.05);
    for (let i = 0; i < steps; i++) this.noiseHit(l, t + i * 0.05, 'bandpass', 3400, 3000, 4, 0.12, 0.002, 0.025);
    const o = l.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 92;
    const lp = l.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = l.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.setValueAtTime(0.05, t + duration - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(lp).connect(g).connect(l.out);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  /** A low, slowly breathing room tone under everything. */
  private startAmbient(): void {
    const ctx = this.ctx;
    if (this.ambient || !ctx || !this.master) return;
    this.ambient = true;
    const g = ctx.createGain();
    g.gain.value = 0.016;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    [55, 82.4, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const depth = ctx.createGain();
    depth.gain.value = 0.011;
    lfo.connect(depth).connect(g.gain);
    lfo.start();
    lp.connect(g).connect(this.master);
  }

  private buildMotor(l: Live): MotorGraph {
    const { ctx } = l;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.value = 900;
    const out = ctx.createGain();
    out.gain.value = 0;
    lp.connect(out).connect(l.out);

    const tones = (
      [
        ['triangle', 0.5],
        ['sine', 0.22],
        ['sine', 0.08],
      ] as const
    ).map(([type, level]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(lp);
      o.start();
      return o;
    });

    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.value = 38;
    const subLp = ctx.createBiquadFilter();
    subLp.type = 'lowpass';
    subLp.frequency.value = 140;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subLp).connect(subGain).connect(out);
    sub.start();

    const wind = ctx.createBufferSource();
    wind.buffer = l.noise;
    wind.loop = true;
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.Q.value = 0.7;
    windBp.frequency.value = 500;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windBp).connect(windGain).connect(l.out);
    wind.start();

    return { tones, sub, lp, out, windBp, windGain };
  }

  /** Electric-motor whine that tracks speed (0..1). Formula-E style: tonal, rising, with wind on top. */
  motor(speed: number, holding: boolean): void {
    const l = this.live();
    if (!l) {
      if (this.motorGraph && this.ctx) this.motorGraph.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    if (!this.motorGraph) {
      if (speed < 0.003) return;
      this.motorGraph = this.buildMotor(l);
    }
    const m = this.motorGraph;
    const t = l.ctx.currentTime;
    const f = 110 + speed * 1100;
    [1, 1.5, 3.02].forEach((mult, i) => m.tones[i].frequency.setTargetAtTime(f * mult, t, 0.03));
    m.sub.frequency.setTargetAtTime(38 + speed * 50, t, 0.05);
    m.lp.frequency.setTargetAtTime(900 + speed * 6000, t, 0.05);
    const level = speed < 0.003 ? 0 : holding ? 0.1 + 0.2 * speed : 0.05 + 0.12 * speed;
    m.out.gain.setTargetAtTime(level, t, 0.05);
    m.windBp.frequency.setTargetAtTime(500 + speed * 2500, t, 0.08);
    m.windGain.gain.setTargetAtTime(speed * speed * 0.3, t, 0.08);
  }
}
