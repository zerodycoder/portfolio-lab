/**
 * One router for every pointer on the canvas. The active place installs a handler; the router turns raw pointer
 * events into drags, taps, flicks and two-finger pinch/rotate, the same for mouse and touch.
 */

export type Pt = { x: number; y: number };

export type Gesture = {
  down?(p: Pt, e: PointerEvent): boolean | void;
  move?(p: Pt, start: Pt, e: PointerEvent): void;
  up?(p: Pt, start: Pt, velocity: Pt, e: PointerEvent): void;
  tap?(p: Pt): void;
  /** Two fingers: scale relative to the start, rotation delta (radians) since the last call, centre. */
  pinch?(scale: number, dRot: number, centre: Pt): void;
  pinchEnd?(): void;
  hover?(p: Pt): void;
};

export class Input {
  private handler: Gesture | null = null;
  private pointers = new Map<number, Pt>();
  private start: Pt = { x: 0, y: 0 };
  private last: Pt = { x: 0, y: 0 };
  private lastT = 0;
  private vel: Pt = { x: 0, y: 0 };
  private moved = 0;
  private pinchStart = 0;
  private pinchAngle = 0;
  private dragging = false;
  /** A single pointer is down (whether or not the handler took it as a drag): taps come from this. */
  private pressed = false;
  private pinching = false;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  set(h: Gesture | null): void {
    this.handler = h;
    this.pointers.clear();
    this.pressed = false;
    this.dragging = false;
    this.pinching = false;
  }

  private pt(e: PointerEvent): Pt {
    return { x: e.clientX, y: e.clientY };
  }

  private down(e: PointerEvent): void {
    if (!this.handler) return;
    this.pointers.set(e.pointerId, this.pt(e));
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    if (this.pointers.size === 2 && this.handler.pinch) {
      // A second finger turns the drag into a pinch.
      if (this.dragging) this.handler.up?.(this.last, this.start, { x: 0, y: 0 }, e);
      this.dragging = false;
      this.pinching = true;
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(b.x - a.x, b.y - a.y);
      this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
      return;
    }
    if (this.pointers.size > 1) return;
    const p = this.pt(e);
    this.start = p;
    this.last = p;
    this.lastT = performance.now();
    this.vel = { x: 0, y: 0 };
    this.moved = 0;
    this.pressed = true;
    this.dragging = this.handler.down?.(p, e) !== false;
  }

  private move(e: PointerEvent): void {
    if (!this.handler) return;
    const p = this.pt(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') this.handler.hover?.(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.pinching && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      let dr = ang - this.pinchAngle;
      if (dr > Math.PI) dr -= Math.PI * 2;
      if (dr < -Math.PI) dr += Math.PI * 2;
      this.pinchAngle = ang;
      this.handler.pinch?.(d / Math.max(1, this.pinchStart), dr, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    if (!this.dragging) {
      // Not a drag, but still count the travel so a wobbly tap is told apart from a swipe.
      this.moved += Math.hypot(p.x - this.last.x, p.y - this.last.y);
      this.last = p;
      return;
    }
    const now = performance.now();
    const dt = Math.max(1, now - this.lastT);
    this.vel = { x: ((p.x - this.last.x) / dt) * 1000, y: ((p.y - this.last.y) / dt) * 1000 };
    this.moved += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = p;
    this.lastT = now;
    this.handler.move?.(p, this.start, e);
  }

  private up(e: PointerEvent): void {
    if (!this.handler) return;
    this.pointers.delete(e.pointerId);
    if (this.pinching) {
      if (this.pointers.size < 2) {
        this.pinching = false;
        this.handler.pinchEnd?.();
      }
      return;
    }
    const p = this.pt(e);
    const wasPressed = this.pressed;
    this.pressed = false;
    // A tap is a press that barely moved, whether or not the handler wanted it as a drag.
    if (wasPressed && this.moved < 8) this.handler.tap?.(p);
    if (!this.dragging) return;
    this.dragging = false;
    // A stale velocity (the pointer stopped before lifting) is not a flick.
    const v = performance.now() - this.lastT > 90 ? { x: 0, y: 0 } : this.vel;
    this.handler.up?.(p, this.start, v, e);
  }
}
