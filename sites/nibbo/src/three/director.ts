import * as THREE from 'three';
import { Clearance } from '../lib/clearance';
import type { Brain } from './brain';
import type { Mood } from './face';
import { ROBOT_H, type Robot } from './robot';
import type { Stage } from './stage';

/**
 * Moves the one robot through the whole page. Every section has a "slot": an empty HTML box in the layout that
 * says where Nibbo stands there (feet on the box's bottom edge, height = the box's height). Each frame the
 * director finds the two slots either side of the viewport centre and blends between them by scroll position,
 * so the robot flies from section to section and lands exactly in each layout, on any screen size.
 * A slot can also compute its own pose (the game board, the shipping box) instead of using its box.
 */

export type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number };

export type Slot = {
  id: string;
  el: HTMLElement;
  mood: Mood;
  /** Whether the robot can be picked up while it's here. */
  draggable?: boolean;
  /** Turn (degrees, + shows its left side) and lean back (degrees). */
  yaw?: number;
  pitch?: number;
  /** The part of the page during which the robot belongs to this slot (default: the slot's section). */
  zone?: HTMLElement;
  /** Custom pose; return false to fall back to the box. */
  pose?: (out: Pose, rect: DOMRect) => boolean;
  enter?: () => void;
  leave?: () => void;
};

const newPose = (): Pose => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 });
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export class Director {
  /** Lets sections add a turn on top of the slot's (e.g. the configurator's drag-to-spin). */
  extraYaw = 0;
  /** The slot the robot currently belongs to. */
  current: Slot | null = null;
  /** True while the robot is on its way between two slots (the speech bubble and hints wait meanwhile). */
  travelling = false;
  /** How close the robot is to the slot it belongs to: 1 standing in it, 0 halfway to the next one. */
  nearness = 1;

  private slots: Slot[] = [];
  private a = newPose();
  private b = newPose();
  private target = newPose();
  private dock = newPose();
  private placed = false;
  private prevPos = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler();
  private extraQuat = new THREE.Quaternion();
  private listeners = new Set<(slot: Slot) => void>();
  /** What floating things (the robot on its way, the speech bubble) must not cover. */
  readonly clearance: Clearance;
  private blocked: DOMRect[] = [];
  /** Phones: where the robot's feet stand on the right edge while travelling (px from the top), or null when
   * there's no free spot and it has tucked itself away off screen. */
  private dockFeet: number | null = null;

  constructor(
    private stage: Stage,
    private robot: Robot,
    private brain: Brain,
    private reduced: boolean,
  ) {
    this.clearance = new Clearance(stage.canvas);
  }

  add(slot: Slot): void {
    this.slots.push(slot);
  }

  onChange(fn: (slot: Slot) => void): void {
    this.listeners.add(fn);
  }

  get(id: string): Slot | undefined {
    return this.slots.find((s) => s.id === id);
  }

  /** The part of the page a slot belongs to. */
  zoneOf(slot: Slot): Element {
    return slot.zone ?? slot.el.closest('section, footer') ?? slot.el;
  }

  /** Pose for a slot's box: feet at the bottom centre, scaled to the box height. */
  boxPose(slot: Slot, rect: DOMRect, out: Pose): void {
    const { stage } = this;
    const canvasTop = stage.canvas.getBoundingClientRect().top;
    stage.toWorld(rect.left + rect.width / 2, rect.bottom - canvasTop, out.pos);
    out.scale = (rect.height * stage.wpp) / ROBOT_H;
    this.euler.set(THREE.MathUtils.degToRad(slot.pitch ?? 0), THREE.MathUtils.degToRad(slot.yaw ?? 0), 0);
    out.quat.setFromEuler(this.euler);
  }

  /** Phones: the spot on the right edge where Nibbo rides between sections, turned towards the content. */
  private dockPose(out: Pose): void {
    const { stage } = this;
    const h = stage.height * 0.2;
    const top = stage.canvas.getBoundingClientRect().top;
    const hidden = this.dockFeet === null;
    // Tucked away: the same spot, moved off the right edge so nothing of it shows.
    const x = hidden ? stage.width + h * 0.75 : stage.width - h * 0.3;
    const y = (this.dockFeet ?? this.lastFeet ?? stage.height * 0.64 + top) - top;
    stage.toWorld(x, y, out.pos);
    out.scale = (h * stage.wpp) / ROBOT_H;
    this.euler.set(0.05, THREE.MathUtils.degToRad(-32), 0.08);
    out.quat.setFromEuler(this.euler);
  }

  private lastFeet: number | null = null;

  /**
   * Phones: finds where on the right edge the robot can stand without covering anything in the two sections it is
   * travelling between. It stays where it is while that spot is free, otherwise takes the nearest free one, and
   * tucks away off screen when the edge is full (a paragraph or a card is passing).
   */
  private findDock(a: Element, b: Element): void {
    const vw = this.stage.width;
    const vh = innerHeight;
    const h = this.stage.height * 0.2;
    const pad = 10;
    const x0 = vw - h * 0.62 - pad;
    this.blocked.length = 0;
    this.clearance.collect(a === b ? [a] : [a, b], x0, vw, this.blocked);
    const nav = document.querySelector('.nav')?.getBoundingClientRect().bottom ?? 70;
    const min = nav + h + pad;
    const max = vh - pad;
    const free = (feet: number): boolean => {
      const t = feet - h - pad;
      const btm = feet + pad;
      for (const r of this.blocked) if (r.bottom > t && r.top < btm) return false;
      return true;
    };
    const from = THREE.MathUtils.clamp(this.dockFeet ?? this.lastFeet ?? vh * 0.64, min, max);
    let found: number | null = null;
    for (let d = 0; d <= max - min && found === null; d += 6) {
      if (from - d >= min && free(from - d)) found = from - d;
      else if (from + d <= max && free(from + d)) found = from + d;
    }
    this.dockFeet = found;
    if (found !== null) this.lastFeet = found;
  }

  private poseOf(slot: Slot, rect: DOMRect, out: Pose): void {
    if (!slot.pose || !slot.pose(out, rect)) this.boxPose(slot, rect, out);
  }

  update(dt: number): void {
    if (!this.slots.length) return;
    const vh = window.innerHeight;
    const centre = vh * 0.5;
    // Each slot owns the robot while the viewport centre is inside its section ("zone"), minus a margin at
    // either end; in the margins between two sections the robot flies from one slot to the next.
    const live = this.slots
      .map((s) => {
        const r = s.el.getBoundingClientRect();
        const z = (s.zone ?? s.el.closest('section, footer') ?? s.el).getBoundingClientRect();
        const m = Math.min(z.height * 0.35, vh * 0.4);
        return { s, r, f0: z.top + m, f1: z.bottom - m };
      })
      .filter((x) => x.r.height > 0);
    if (!live.length) return;

    const k = live.findIndex((x) => x.f0 > centre);
    let t = 0;
    let A = live[0];
    let B = live[0];
    if (k === -1) {
      A = B = live[live.length - 1];
    } else if (k > 0) {
      A = live[k - 1];
      B = live[k];
      t = centre <= A.f1 ? 0 : THREE.MathUtils.clamp((centre - A.f1) / Math.max(1, B.f0 - A.f1), 0, 1);
      if (t === 0) B = A;
    }

    this.poseOf(A.s, A.r, this.a);
    if (B !== A) {
      this.poseOf(B.s, B.r, this.b);
      const s = smoothstep(t);
      if (this.stage.width < 760) {
        // Phones stack everything in one column, so a straight flight would cross the text. Instead Nibbo
        // slips out to the right edge, small, rides along there where the edge is free, and hops into the
        // next slot.
        this.findDock(this.zoneOf(A.s), this.zoneOf(B.s));
        this.dockPose(this.dock);
        const first = s < 0.5;
        const k = smoothstep(first ? s * 2 : (s - 0.5) * 2);
        const from = first ? this.a : this.dock;
        const to = first ? this.dock : this.b;
        // An L-shaped path that keeps off the text column: leaving a slot it first slides sideways to the edge and
        // then along it; arriving it first rides the edge to the slot's height and then slides in.
        const lead = (v: number): number => smoothstep(THREE.MathUtils.clamp(v / 0.65, 0, 1));
        const lag = (v: number): number => smoothstep(THREE.MathUtils.clamp((v - 0.35) / 0.65, 0, 1));
        const kx = first ? lead(k) : lag(k);
        const ky = first ? lag(k) : lead(k);
        this.target.pos.set(
          THREE.MathUtils.lerp(from.pos.x, to.pos.x, kx),
          THREE.MathUtils.lerp(from.pos.y, to.pos.y, ky),
          THREE.MathUtils.lerp(from.pos.z, to.pos.z, k),
        );
        this.target.quat.slerpQuaternions(from.quat, to.quat, k);
        this.target.scale = THREE.MathUtils.lerp(from.scale, to.scale, k);
        this.nearness = first ? 1 - k : k;
      } else {
        this.target.pos.lerpVectors(this.a.pos, this.b.pos, s);
        // Arc through the air a little when travelling between two sections.
        this.target.pos.z += Math.sin(s * Math.PI) * 1.2;
        this.target.quat.slerpQuaternions(this.a.quat, this.b.quat, s);
        this.target.scale = THREE.MathUtils.lerp(this.a.scale, this.b.scale, s);
        this.nearness = Math.abs(s - 0.5) * 2;
      }
    } else {
      this.nearness = 1;
      this.target.pos.copy(this.a.pos);
      this.target.quat.copy(this.a.quat);
      this.target.scale = this.a.scale;
    }
    if (this.extraYaw) {
      this.extraQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.extraYaw);
      this.target.quat.multiply(this.extraQuat);
    }

    this.travelling = B !== A && t > 0.02 && t < 0.98;
    if (B === A) this.dockFeet = null;

    const nearest = t < 0.5 ? A.s : B.s;
    if (nearest !== this.current) {
      this.current?.leave?.();
      this.current = nearest;
      this.brain.setBaseMood(nearest.mood);
      this.brain.draggable = !!nearest.draggable;
      nearest.enter?.();
      this.listeners.forEach((fn) => fn(nearest));
    }

    const root = this.robot.root;
    if (!this.placed || this.reduced) {
      this.placed = true;
      root.position.copy(this.target.pos);
      root.quaternion.copy(this.target.quat);
      root.scale.setScalar(this.target.scale);
      this.prevPos.copy(root.position);
    } else {
      const k = 1 - Math.exp(-9 * dt);
      root.position.lerp(this.target.pos, k);
      root.quaternion.slerp(this.target.quat, k);
      root.scale.setScalar(THREE.MathUtils.lerp(root.scale.x, this.target.scale, k));
    }

    // Keep drags and throws on screen: the free half-width either side of the robot's spot, in robot units.
    const halfW = (this.stage.width / 2) * this.stage.wpp;
    const s = Math.max(0.05, root.scale.x);
    this.brain.bounds.x = Math.max(0.4, (halfW - Math.abs(root.position.x)) / s - 0.8);
    this.brain.bounds.y = Math.max(0.6, Math.min(2.6, ((this.stage.height / 2) * this.stage.wpp - root.position.y) / s - ROBOT_H - 0.1));

    // Velocity in robot heights per second, for leaning into the flight.
    if (dt > 0) {
      this.velocity.copy(root.position).sub(this.prevPos).divideScalar(dt * Math.max(0.05, root.scale.x));
      this.prevPos.copy(root.position);
      this.brain.setTravel(this.velocity.x, this.velocity.y);
    }
  }
}
