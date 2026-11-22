import * as THREE from 'three';
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

  private slots: Slot[] = [];
  private a = newPose();
  private b = newPose();
  private target = newPose();
  private placed = false;
  private prevPos = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private euler = new THREE.Euler();
  private extraQuat = new THREE.Quaternion();
  private listeners = new Set<(slot: Slot) => void>();

  constructor(
    private stage: Stage,
    private robot: Robot,
    private brain: Brain,
    private reduced: boolean,
  ) {}

  add(slot: Slot): void {
    this.slots.push(slot);
  }

  onChange(fn: (slot: Slot) => void): void {
    this.listeners.add(fn);
  }

  get(id: string): Slot | undefined {
    return this.slots.find((s) => s.id === id);
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
      this.target.pos.lerpVectors(this.a.pos, this.b.pos, s);
      // Arc through the air a little when travelling between two sections.
      this.target.pos.z += Math.sin(s * Math.PI) * 1.2;
      this.target.quat.slerpQuaternions(this.a.quat, this.b.quat, s);
      this.target.scale = THREE.MathUtils.lerp(this.a.scale, this.b.scale, s);
    } else {
      this.target.pos.copy(this.a.pos);
      this.target.quat.copy(this.a.quat);
      this.target.scale = this.a.scale;
    }
    if (this.extraYaw) {
      this.extraQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.extraYaw);
      this.target.quat.multiply(this.extraQuat);
    }

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
