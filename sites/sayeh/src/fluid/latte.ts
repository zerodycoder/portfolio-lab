import { Fluid, type Light } from './fluid';
import { judge, type Score } from './score';

export type Tool = 'pour' | 'etch';
/** 'pull' is the pull-through at the end of a pattern (a thin stream dragged through the foam); 'lift' just moves. */
type Move = Tool | 'pull' | 'lift';
export type Preset = 'heart' | 'rosetta' | 'tulip';

/** What a scripted pour does at time t: where the spout is, how hard it pours, and with which tool. */
type Frame = { x: number; y: number; flow: number; tool: Move; push?: number; drag?: number; gain?: number; pullRadius?: number; cone?: number; twin?: number } | null;

export interface LatteSound {
  pour(flow: number): void;
  scrape(speed: number): void;
  slosh(speed: number): void;
  clink(): void;
}

export type LatteEvent =
  /** A new stream started; `hand` is false when a preset poured it. */
  | { type: 'pour'; hand: boolean }
  | { type: 'etch' }
  | { type: 'swirl' }
  | { type: 'empty' }
  /** A finished pour was judged; `hand` is true if the visitor poured any of it. */
  | { type: 'score'; score: Score; hand: boolean }
  | { type: 'busy'; busy: boolean }
  | { type: 'milk'; left: number };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Piecewise-linear position over named keyframes [t, x, y, flow, tool?]. */
function keyframes(keys: [number, number, number, number, Move?][], push = 0, drag = 0.8, gain = 1, pullRadius = 0.0005): (t: number) => Frame {
  const end = keys[keys.length - 1][0];
  return (t) => {
    if (t > end) return null;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, x0, y0, f0] = keys[i];
    const [t1, x1, y1, f1, tool] = keys[i + 1];
    const k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    return { x: lerp(x0, x1, k), y: lerp(y0, y1, k), flow: lerp(f0, f1, k), tool: tool ?? 'pour', push, drag, gain, pullRadius };
  };
}

/**
 * The three classic patterns, choreographed like a barista's hand (uv space, y up; the handle side is the bottom of
 * the screen). A heart is one blob and a pull-through; a rosetta is a wiggle while backing away, then the pull; a
 * tulip is stacked pushes, each one shoving the last forward.
 */
const PRESETS: Record<Preset, (t: number) => Frame> = {
  // A blob poured from a jug wiggling very slightly (two lobes growing side by side), then the pull-through in three
  // phases: entering, a cone-shaped drag folds the top into a V between the lobes (fading as it goes, so the crema it
  // carries in doesn't pile up); through the middle the hand barely drags while a thin stream keeps the white closed;
  // past the front edge a cone-shaped drag draws the sides together and the narrow tail of the stroke makes the point.
  heart: (t) => {
    if (t > 4.2) return null;
    if (t < 0.4) return { x: 0.5, y: 0.6, flow: ease(t / 0.4) * 0.9, tool: 'pour', gain: 1.45, twin: 0.035 };
    if (t < 3.4) return { x: 0.5, y: lerp(0.6, 0.58, (t - 0.4) / 3), flow: lerp(0.9, 1, (t - 0.4) / 3), tool: 'pour', gain: 1.45, twin: 0.035 };
    if (t < 3.55) return { x: 0.5, y: lerp(0.58, 0.88, (t - 3.4) / 0.15), flow: 0, tool: 'lift' };
    const y = lerp(0.88, 0.3, Math.min(1, (t - 3.55) / 0.5));
    if (y > 0.74) {
      const n = (y - 0.74) / 0.14;
      return { x: 0.5, y, flow: 0, tool: 'pull', drag: 0.64 * (0.35 + 0.65 * n), pullRadius: 0.0006, cone: 1.12 * n };
    }
    if (y > 0.47) return { x: 0.5, y, flow: 0.55, tool: 'pull', drag: 0.12, pullRadius: 0.0005 };
    const cone = 1.6 * Math.max(0, 1 - (0.47 - y) / 0.12);
    const fade = Math.max(0, Math.min(1, (y - 0.3) / 0.06));
    return { x: 0.5, y, flow: 0, tool: 'pull', drag: 0.6 * fade, pullRadius: 0.0004, cone };
  },
  // The stream leans forward (push < 0 is toward the bottom of the screen): each wiggle shoves the last one ahead.
  rosetta: (t) => {
    if (t > 4.4) return null;
    if (t < 0.6) return { x: 0.5, y: 0.5, flow: ease(t / 0.6) * 0.85, tool: 'pour', push: -0.5 };
    if (t < 3.3) {
      const k = (t - 0.6) / 2.7;
      const amp = lerp(0.075, 0.03, k);
      return { x: 0.5 + Math.sin((t - 0.6) * Math.PI * 2 * 3.7) * amp, y: lerp(0.5, 0.79, k), flow: 0.9, tool: 'pour', push: -0.8 };
    }
    if (t < 3.45) return { x: 0.5, y: lerp(0.79, 0.83, (t - 3.3) / 0.15), flow: 0, tool: 'lift' };
    const k = Math.min(1, (t - 3.45) / 0.55);
    const y = lerp(0.83, 0.17, k);
    const tail = Math.max(0, (0.3 - y) / 0.13);
    return { x: 0.5, y, flow: Math.max(0, 0.45 * (1 - k / 0.7)), tool: 'pull', drag: 1 * (1 - tail), pullRadius: 0.0005 };
  },
  tulip: keyframes(
    [
      [0, 0.5, 0.44, 0],
      [0.3, 0.5, 0.44, 0.9],
      [1.0, 0.5, 0.44, 0.9],
      [1.08, 0.5, 0.44, 0],
      [1.3, 0.5, 0.58, 0, 'lift'],
      [1.5, 0.5, 0.58, 0.95],
      [2.1, 0.5, 0.58, 0.95],
      [2.18, 0.5, 0.58, 0],
      [2.4, 0.5, 0.7, 0, 'lift'],
      [2.6, 0.5, 0.7, 0.95],
      [3.1, 0.5, 0.7, 0.95],
      [3.18, 0.5, 0.7, 0],
      [3.35, 0.5, 0.83, 0, 'lift'],
      [3.6, 0.5, 0.55, 0.45, 'pull'],
      [3.82, 0.5, 0.32, 0.12, 'pull'],
      [3.94, 0.5, 0.21, 0, 'pull'],
      [3.98, 0.5, 0.2, 0, 'pull'],
    ],
    -0.6,
    0.7,
    1.25,
    0.0006,
  ),
};

/**
 * The barista: turns pointer input (or a preset's choreography) into milk, flow and swirl on the fluid, keeps the
 * pitcher's milk level, and judges each finished pour.
 */
export class Latte {
  readonly fluid: Fluid;
  tool: Tool = 'pour';
  /** Milk left in the pitcher (1 = full jug, about eight seconds of steady pouring). */
  milkLeft = 1;
  light: Light = { tint: [1, 1, 1], sheen: 1, dir: [-0.55, 0.6] };

  private flow = 0;
  private held = false;
  private pos = { x: 0.5, y: 0.5 };
  private prev = { x: 0.5, y: 0.5 };
  private script: ((t: number) => Frame) | null = null;
  private scriptT = 0;
  private quiet = 99;
  private sinceInput = 99;
  private poured = false;
  private judged = true;
  private pendingStir = { omega: 0, x: 0, y: 0, n: 0 };
  private listeners = new Set<(e: LatteEvent) => void>();
  private dirty = true;
  private gen = 0;
  private tick = 0;
  /** How much milk has dived under the crema (0..1): lightens the canvas as the cup fills. */
  private mixLevel = 0;
  /** Direction of the jug's last clear movement while pouring, to spot each swing of a wiggle. */
  private swing: { x: number; y: number } | null = null;
  private byHand = false;
  private streaming = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sound: LatteSound,
    quality: 'high' | 'low',
  ) {
    this.fluid = new Fluid(canvas, quality === 'high' ? { simRes: 112, dyeRes: 768, iterations: 18 } : { simRes: 112, dyeRes: 512, iterations: 18 });
  }

  on(fn: (e: LatteEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: LatteEvent): void {
    this.listeners.forEach((fn) => fn(e));
  }

  get busy(): boolean {
    return this.script !== null;
  }

  /** Where the spout is (uv), for drawing the pitcher during a preset. */
  get spout(): { x: number; y: number } {
    return this.pos;
  }

  /** How hard milk is flowing right now (0..1), for the stream drawn under the pitcher. */
  get pouring(): number {
    return this.lastMove === 'pour' ? this.flow : this.lastMove === 'pull' ? this.flow * 0.5 : 0;
  }

  private lastMove: Move = 'pour';

  /** Is the spout over the coffee (uv inside the disk, with a little room off the wall)? */
  static onCoffee(x: number, y: number): boolean {
    return Math.hypot(x - 0.5, y - 0.5) < 0.47;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
  }

  /** Pointer pressed on the coffee at uv (x, y). */
  press(x: number, y: number): void {
    if (this.script) return;
    this.held = true;
    this.pos = { x, y };
    this.prev = { x, y };
    this.sinceInput = 0;
  }

  move(x: number, y: number): void {
    this.pos = { x, y };
  }

  release(): void {
    this.held = false;
  }

  /** Spin the cup by `omega` rad/s, or slosh it (uv/s): from a drag around the saucer or the phone's motion. */
  stir(omega: number, pushX = 0, pushY = 0): void {
    // Input events can arrive several times a frame: they're averaged and applied as a rate in update().
    this.pendingStir.omega += omega;
    this.pendingStir.x += pushX;
    this.pendingStir.y += pushY;
    this.pendingStir.n++;
    this.sinceInput = 0;
    this.quiet = 0;
    this.judged = !this.poured;
  }

  play(preset: Preset): void {
    if (this.script) return;
    if (this.milkLeft < 0.55) this.refill();
    this.script = PRESETS[preset];
    this.scriptT = 0;
    this.byHand = false;
    this.held = false;
    this.sound.clink();
    this.emit({ type: 'busy', busy: true });
  }

  /** A fresh espresso: the old milk fades away and the pitcher is refilled. */
  newCup(): void {
    this.script = null;
    this.held = false;
    this.fadeOut = 1;
    this.refill();
    this.poured = false;
    this.judged = true;
    this.byHand = false;
    this.sound.clink();
    this.emit({ type: 'busy', busy: false });
  }

  private fadeOut = 0;

  refill(): void {
    this.milkLeft = 1;
    this.emit({ type: 'milk', left: 1 });
  }

  /** True while something is moving, so the page can stop simulating when the cup is still. */
  get active(): boolean {
    return this.held || this.script !== null || this.flow > 0.001 || this.quiet < 3 || this.fadeOut > 0 || this.dirty;
  }

  /** Re-render the surface on the next frame (e.g. the light changed). */
  invalidate(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    const f = this.fluid;
    let tool: Move = this.tool;
    let target = 0;
    let push = 0;
    let drag = 0.8;
    let gain = 1;
    let pullRadius = 0.0005;
    let cone = 0;
    let twin = 0;


    if (this.script) {
      this.scriptT += dt;
      const fr = this.script(this.scriptT);
      if (!fr) {
        this.script = null;
        this.flow = 0;
        this.emit({ type: 'busy', busy: false });
      } else {
        this.pos = { x: fr.x, y: fr.y };
        tool = fr.tool;
        target = fr.flow;
        push = fr.push ?? 0;
        drag = fr.drag ?? 0.8;
        gain = fr.gain ?? 1;
        pullRadius = fr.pullRadius ?? 0.0005;
        cone = fr.cone ?? 0;
        twin = fr.twin ?? 0;

        if (this.scriptT < dt * 1.5) this.prev = { ...this.pos };
      }
    } else if (this.held) {
      target = tool === 'pour' ? (this.milkLeft > 0 ? 1 : 0) : 0;
    }
    this.sinceInput += dt;

    this.lastMove = tool;
    const moved = { x: this.pos.x - this.prev.x, y: this.pos.y - this.prev.y };
    const speed = Math.hypot(moved.x, moved.y) / Math.max(dt, 1e-3);

    if (tool === 'pour' || tool === 'pull' || tool === 'lift') {
      // The stream builds up over a quarter second and stops faster than it starts, like tipping a jug.
      const k = target > this.flow ? 1 - Math.exp(-dt / 0.2) : 1 - Math.exp(-dt / 0.06);
      this.flow += (target - this.flow) * k;
      const fl = tool === 'lift' ? 0 : this.flow;
      // A new pour (a new layer) starts when the stream starts again, with hysteresis so the ramp counts once.
      if (fl < 0.004) {
        this.streaming = false;
        this.swing = null;
      }
      if (tool === 'pull') {
        // The pull-through: a thin stream cuts through the foam, dragging its middle forward into a point. As the jug
        // lifts away the stream thins to nothing, so the drag alone draws the tip.
        if (speed > 0.01) f.splat(this.pos.x, this.pos.y, (moved.x / dt) * drag, (moved.y / dt) * drag, pullRadius);
        // A cone-shaped drag (strongest on the line, falling off steadily to the sides, built from three widths):
        // the edge of the foam is pulled out into a V rather than a narrow nub or a round lobe.
        if (cone > 0 && speed > 0.01) {
          const vx = moved.x / dt;
          const vy = moved.y / dt;
          f.splat(this.pos.x, this.pos.y, vx * 0.5 * cone, vy * 0.5 * cone, 0.0018);
          f.splat(this.pos.x, this.pos.y, vx * 0.26 * cone, vy * 0.26 * cone, 0.007);
        }
        // The thin stream itself lands in the channel it cuts, so only the top of the cut stays open (the cleft).
        if (fl > 0.01) f.milk(this.pos.x, this.pos.y, Math.min(1, fl * dt * 45), 0.00028 + fl * 0.0003, 0.2 + this.gen * 0.13);
        this.quiet = 0;
      } else if (fl > 0.01 && this.milkLeft > 0) {
        if (!this.streaming) {
          this.streaming = true;
          this.gen = (this.gen + 1) % 6;
          this.emit({ type: 'pour', hand: this.held });
        }
        if (this.held) this.byHand = true;
        // Each swing of a wiggle lays down a new layer of foam (a new leaf): a reversal of the jug's direction
        // starts a new tag, and the seams between tags are drawn as fine crema lines.
        if (speed > 0.35 && fl > 0.3) {
          const dir = { x: moved.x / (speed * dt), y: moved.y / (speed * dt) };
          if (this.swing && dir.x * this.swing.x + dir.y * this.swing.y < -0.3) this.gen = (this.gen + 1) % 6;
          this.swing = dir;
        }
        this.mixLevel = Math.min(1, this.mixLevel + fl * dt * 0.22 * gain);
        // A twin pour alternates between two spouts every frame (two lobes growing side by side).
        this.tick++;
        const sx = twin ? this.pos.x + (this.tick % 2 ? twin : -twin) : this.pos.x;
        f.source(sx, this.pos.y, 20 * fl * gain, 0.0016);
        f.milk(sx, this.pos.y, Math.min(1, fl * dt * 34 * gain * (twin ? 1.6 : 1)), 0.0009, 0.2 + this.gen * 0.13);
        if (push) f.splat(this.pos.x, this.pos.y, 0, push * fl, 0.0012);
        // A moving stream carries its momentum into the cup (this is what draws a rosetta's leaves).
        if (speed > 0.01) f.splat(this.pos.x, this.pos.y, (moved.x / dt) * (0.3 + 0.45 * fl), (moved.y / dt) * (0.3 + 0.45 * fl), 0.0022);
        if (!this.script) {
          this.milkLeft = Math.max(0, this.milkLeft - fl * dt * 0.12);
          this.emit({ type: 'milk', left: this.milkLeft });
          if (this.milkLeft === 0) this.emit({ type: 'empty' });
        }
        this.poured = true;
        this.judged = false;
        this.quiet = 0;
      }
      this.sound.pour(fl);
      this.sound.scrape(0);
    } else {
      this.flow = 0;
      this.sound.pour(0);
      const etching = this.held;
      if (etching && speed > 0.02) {
        // An etching pen: a thin, strong drag along its path, interpolated so fast strokes stay continuous. The
        // pen also carries a little crema into the foam, which leaves a fine brown line.
        const steps = Math.min(16, Math.ceil(Math.hypot(moved.x, moved.y) / 0.006));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = lerp(this.prev.x, this.pos.x, t);
          const y = lerp(this.prev.y, this.pos.y, t);
          f.splat(x, y, (moved.x / dt) * 0.9, (moved.y / dt) * 0.9, 0.00018);
          f.milk(x, y, -0.45, 0.00005);
        }
        if (this.poured) this.emit({ type: 'etch' });
        this.byHand = true;
        this.judged = !this.poured;
        this.quiet = 0;
      }
      this.sound.scrape(etching ? Math.min(1, speed / 2.5) : 0);
    }

    const st = this.pendingStir;
    if (st.n > 0) {
      // The cup's motion drags the liquid along over a fraction of a second (the walls' grip), never instantly.
      const k = Math.min(1, dt * 7);
      const omega = st.omega / st.n;
      f.stir(omega * k, (st.x / st.n) * k, (st.y / st.n) * k);
      this.sound.slosh(Math.min(1, Math.abs(omega) / 6 + Math.hypot(st.x, st.y) * 3));
      if (Math.abs(omega) > 0.8 && this.poured) this.emit({ type: 'swirl' });
      this.pendingStir = { omega: 0, x: 0, y: 0, n: 0 };
    } else this.sound.slosh(0);

    if (this.fadeOut > 0) {
      this.fadeOut = Math.max(0, this.fadeOut - dt * 1.6);
      this.mixLevel *= 0.9;
      f.fade(this.fadeOut > 0 ? 0.9 : 0, 0.9);
      this.quiet = 0;
    }

    // Foam is viscous: once the hand stops, the surface settles within a fraction of a second.
    const handOn = this.held || this.script !== null;
    f.step(dt, { velocityDecay: !handOn ? 11 : tool === 'pull' ? 16 : tool === 'etch' ? 3 : 5.5, dyeDecay: 0.0 });
    f.render({ ...this.light, mix: this.mixLevel });
    this.dirty = false;
    this.prev = { ...this.pos };
    this.quiet += dt;

    // Judge once the cup has been still for a moment after a pour.
    if (!this.judged && !this.held && !this.script && this.flow < 0.01 && this.quiet > 1.1) {
      this.judged = true;
      const score = judge(f.read());
      if (score) this.emit({ type: 'score', score, hand: this.byHand });
    }
  }
}
