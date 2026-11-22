/**
 * Core of every site's sound: a Web Audio graph (master gain into a gentle compressor), a shared noise buffer and
 * the synthesis primitives the sites build their own sounds from. No audio files are downloaded.
 * Nothing plays until the visitor chooses to enter with sound (browsers require that gesture).
 */

export type Live = { ctx: AudioContext; out: GainNode; noise: AudioBuffer };

/** A tenth of a second of 8-bit silence as a WAV data URI, used to open the media audio channel on iOS. */
function silentWav(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (o: number, t: string): void => [...t].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export class AudioEngine {
  enabled = false;
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  protected noise: AudioBuffer | null = null;
  private listeners = new Set<(on: boolean) => void>();
  private mediaChannel: HTMLAudioElement | null = null;

  /** `level` is the master gain once faded in; `fadeIn` the time constant of that fade, in seconds. */
  constructor(private readonly mix: { level?: number; fadeIn?: number } = {}) {}

  /** 'none' until sound is first enabled; otherwise the AudioContext state. */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /**
   * iPhones mute Web Audio while the ring/silent switch is on. Declaring a "playback" audio session (Safari 17+)
   * and keeping a silent <audio> element playing (older iOS) puts the page on the media channel, which the
   * switch does not mute: the same channel videos use. Must run inside the user's tap.
   */
  private openMediaChannel(): void {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    if (!this.mediaChannel) {
      const a = new Audio(silentWav());
      a.loop = true;
      a.setAttribute('playsinline', '');
      this.mediaChannel = a;
    }
    void this.mediaChannel.play().catch(() => undefined);
  }

  protected ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);
    comp.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.noise = buf;

    // Mobile browsers suspend audio when the tab is hidden or a call comes in; wake it on return or the next tap.
    const wake = (): void => {
      if (this.enabled && ctx.state !== 'running') void ctx.resume();
    };
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
    window.addEventListener('pointerdown', wake, { passive: true });
    return ctx;
  }

  /** Called every time sound is switched on, after the master fade-in has been scheduled (e.g. to start a bed). */
  protected started(): void {}

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.openMediaChannel();
      const ctx = this.ensure();
      if (ctx && this.master) {
        void ctx.resume();
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        // Ease in over about a second: phones are often at full volume and a hard start is startling.
        this.master.gain.setTargetAtTime(this.mix.level ?? 0.85, ctx.currentTime, this.mix.fadeIn ?? 0.35);
        this.started();
      }
    } else if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      this.mediaChannel?.pause();
    }
    this.listeners.forEach((fn) => fn(on));
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  onChange(fn: (on: boolean) => void): void {
    this.listeners.add(fn);
    fn(this.enabled);
  }

  /** The live graph, or null while sound is off: every sound method starts with this guard. */
  protected live(): Live | null {
    if (!this.enabled || !this.ctx || !this.master || !this.noise) return null;
    return { ctx: this.ctx, out: this.master, noise: this.noise };
  }

  protected envelope(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Filtered burst of noise with a sweeping cutoff. */
  protected noiseHit(
    l: Live,
    t: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    peak: number,
    attack: number,
    decay: number,
    out: AudioNode = l.out,
  ): void {
    const src = l.ctx.createBufferSource();
    src.buffer = l.noise;
    const filter = l.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = l.ctx.createGain();
    this.envelope(g, t, attack, peak, decay);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  /** One oscillator note gliding exponentially from f0 to f1 under an attack/decay envelope. */
  protected tone(
    l: Live,
    t: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    peak: number,
    attack: number,
    decay: number,
    out: AudioNode = l.out,
  ): void {
    const o = l.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = l.ctx.createGain();
    this.envelope(g, t, attack, peak, decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }
}
