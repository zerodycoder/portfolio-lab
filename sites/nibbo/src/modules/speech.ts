import * as THREE from 'three';
import { $ } from '../lib/dom';
import type { Robot } from '../three/robot';
import type { Stage } from '../three/stage';

/**
 * A speech bubble that rides next to Nibbo's head wherever it is on the page (projected from 3D every frame).
 * It flips to whichever side has room and hides while the robot is off screen.
 */
export class Speech {
  private el = $('[data-speech]');
  private text = $('[data-speech-text]');
  private until = 0;
  private shown = false;
  private v = new THREE.Vector3();
  private side: 1 | -1 = 1;

  constructor(
    private stage: Stage,
    private robot: Robot,
  ) {}

  get busy(): boolean {
    return this.shown;
  }

  say(line: string, seconds = 3): void {
    this.text.textContent = line;
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

  update(): void {
    if (!this.shown) return;
    if (performance.now() > this.until) {
      this.shown = false;
      this.el.classList.remove('is-shown');
      return;
    }
    const head = this.robot.parts.head;
    head.localToWorld(this.v.set(0, 0.95, 0));
    const p = this.stage.toScreen(this.v, this.v);
    const top = this.stage.canvas.getBoundingClientRect().top;
    const x = p.x;
    const y = p.y + top;
    const vw = window.innerWidth;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const offscreen = y < 40 || y > window.innerHeight + h;
    this.el.style.visibility = offscreen ? 'hidden' : 'visible';
    // Upper right of the head by default; upper left when that would run off the screen.
    const headHalf = 0.58 * this.robot.root.scale.x / this.stage.wpp;
    if (x + headHalf * 0.6 + w > vw - 12) this.side = -1;
    else if (x - headHalf * 0.6 - w < 12) this.side = 1;
    const left = this.side > 0 ? x + headHalf * 0.55 : x - headHalf * 0.55 - w;
    const nav = 70;
    const ty = Math.max(nav, y - h - 6);
    this.el.style.transform = `translate3d(${Math.max(8, Math.min(vw - w - 8, left)).toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
    this.el.classList.toggle('is-left', this.side < 0);
  }
}
