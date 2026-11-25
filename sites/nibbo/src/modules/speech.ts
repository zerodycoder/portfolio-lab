import * as THREE from 'three';
import { $ } from '../lib/dom';
import type { Robot } from '../three/robot';
import type { Stage } from '../three/stage';

/**
 * A speech bubble that rides next to Nibbo's head wherever it is on the page (projected from 3D every frame).
 * It flips to whichever side has room, steers clear of the page's text, and hides while the robot is off screen,
 * travelling between sections, or has no room to speak without covering something.
 */
export class Speech {
  private el = $('[data-speech]');
  private text = $('[data-speech-text]');
  private until = 0;
  private shown = false;
  private v = new THREE.Vector3();
  private side: 1 | -1 = 1;
  /** While this returns true (the robot is travelling between sections) the bubble stays out of sight. */
  away: () => boolean = () => false;
  /** Fills `out` with what the bubble shouldn't cover (text and controls of the robot's current section). */
  avoid: ((out: DOMRect[]) => void) | null = null;
  private blocked: DOMRect[] = [];
  /** The way out the bubble took last frame (side flipped, moved up by dy px), kept while it still works. */
  private shift = { flip: false, dy: 0 };
  private size = { w: 230, h: 56 };

  constructor(
    private stage: Stage,
    private robot: Robot,
  ) {}

  get busy(): boolean {
    return this.shown;
  }

  say(line: string, seconds = 3): void {
    this.text.textContent = line;
    this.shift = { flip: false, dy: 0 };
    this.until = performance.now() + seconds * 1000;
    if (!this.shown) {
      this.shown = true;
      this.el.classList.add('is-shown');
    }
    this.el.classList.remove('is-pop');
    void this.el.offsetWidth;
    this.el.classList.add('is-pop');
  }

  hide(): void {
    this.until = 0;
  }

  /** Whether a bubble of the usual size would fit next to Nibbo right now without covering the page's text. */
  get hasRoom(): boolean {
    return !this.away() && this.place(this.size.w, this.size.h) !== null;
  }

  /**
   * Where the bubble goes: upper right of the head (upper left when that runs off the screen). It must not cover
   * the page's text or controls, so it keeps last frame's way out while that is clear, else tries the other side,
   * then moving up, then down over the robot itself, nearest first. Null when nothing is clear (or the head is off
   * screen): the bubble then waits rather than covering the text.
   */
  private place(w: number, h: number): { left: number; top: number; flip: boolean; dy: number } | null {
    const head = this.robot.parts.head;
    head.localToWorld(this.v.set(0, 0.95, 0));
    const p = this.stage.toScreen(this.v, this.v);
    const x = p.x;
    const y = p.y + this.stage.canvas.getBoundingClientRect().top;
    if (y < 40 || y > window.innerHeight + h) return null;
    const vw = window.innerWidth;
    const headHalf = (0.58 * this.robot.root.scale.x) / this.stage.wpp;
    if (x + headHalf * 0.6 + w > vw - 12) this.side = -1;
    else if (x - headHalf * 0.6 - w < 12) this.side = 1;
    const nav = 70;
    const ty = Math.max(nav, y - h - 6);
    const at = (flip: boolean, dy: number): [number, number] => {
      const right = this.side > 0 !== flip;
      const l = right ? x + headHalf * 0.55 : x - headHalf * 0.55 - w;
      return [Math.max(8, Math.min(vw - w - 8, l)), Math.max(nav, ty - dy)];
    };
    const result = (flip: boolean, dy: number): { left: number; top: number; flip: boolean; dy: number } => {
      const [left, top] = at(flip, dy);
      return { left, top, flip, dy };
    };
    if (!this.avoid) return result(false, 0);
    this.blocked.length = 0;
    this.avoid(this.blocked);
    const clear = ([l, t]: [number, number]): boolean =>
      !this.blocked.some((r) => r.right > l && r.left < l + w && r.bottom > t && r.top < t + h);
    if (clear(at(this.shift.flip, this.shift.dy))) return result(this.shift.flip, this.shift.dy);
    const tries: [boolean, number][] = [[false, 0], [true, 0]];
    for (let dy = 14; dy <= 112; dy += 14) tries.push([false, dy], [true, dy]);
    for (let dy = -14; dy >= -h * 1.6; dy -= 14) tries.push([false, dy], [true, dy]);
    const way = tries.find(([f, dy]) => clear(at(f, dy)));
    if (!way) return null;
    this.shift = { flip: way[0], dy: way[1] };
    return result(way[0], way[1]);
  }

  update(): void {
    if (!this.shown) return;
    if (performance.now() > this.until) {
      this.shown = false;
      this.el.classList.remove('is-shown');
      return;
    }
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.size = { w, h };
    const spot = this.away() ? null : this.place(w, h);
    this.el.style.visibility = spot ? 'visible' : 'hidden';
    if (!spot) return;
    this.el.style.transform = `translate3d(${spot.left.toFixed(1)}px, ${spot.top.toFixed(1)}px, 0)`;
    this.el.classList.toggle('is-left', this.side < 0 !== spot.flip);
  }
}
