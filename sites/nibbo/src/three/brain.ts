import { gsap } from 'gsap';
import * as THREE from 'three';
import type { Sound } from '../lib/sound';
import { vibrate } from '../lib/dom';
import type { Mood } from './face';
import type { Robot } from './robot';

/**
 * Nibbo's behaviour. Layers, from strongest to weakest:
 *   1. a reaction (poked, tossed, bumped): a timed mood plus an emote
 *   2. sleep: after a while with no input it gets sleepy, then dozes off; any input wakes it
 *   3. the base mood the current section asks for
 * Gaze follows the pointer (or the phone's tilt), drives both the head and the LED eyes, and the antenna
 * sways on a spring from the head's acceleration. Drag-and-toss is a small hand-written physics loop.
 */

type PhysState = 'grounded' | 'held' | 'falling';
export type BrainEvent = 'poke' | 'pickup' | 'toss' | 'dizzy' | 'grumpy' | 'sleep' | 'wake';

const SLEEPY_AFTER = 26;
const ASLEEP_AFTER = 34;
const GRAVITY = 26;

const damp = (a: number, b: number, lambda: number, dt: number): number => a + (b - a) * (1 - Math.exp(-lambda * dt));

export class Brain {
  /** True while a program is running or the robot is otherwise on a job: no sleeping, no pokes. */
  busy = false;
  /** Whether the robot may be picked up where it currently stands. */
  draggable = true;
  /** How far (robot units, from its spot) it may be dragged or thrown and stay on screen. Set by the director. */
  readonly bounds = { x: 3.2, y: 2.6 };
  /** Called whenever the visitor plays with the robot (poke or pick-up). */
  onPlay: (() => void) | null = null;
  private listeners = new Set<(e: BrainEvent) => void>();

  private baseMood: Mood = 'idle';
  private reaction: { mood: Mood; until: number } | null = null;
  private idleFor = 0;
  private asleep = false;
  private snoreAt = 0;
  private time = 0;

  // Gaze.
  private gazeTarget = new THREE.Vector3(0, 0, 8);
  private gazeOverride: THREE.Vector3 | null = null;
  private pointerSeen = false;
  private wanderAt = 0;
  private glanceAt: THREE.Vector3 | null = null;
  private glanceUntil = 0;
  private touchUntil = 0;
  private wander = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private tiltInput: { x: number; y: number } | null = null;

  // Dizziness from fast circular pointer motion.
  private lastPointer: { x: number; y: number; t: number; angle: number | null } | null = null;
  private spinAccum = 0;

  // Pokes.
  private pokes: number[] = [];

  // Physics (phys group, robot-local units).
  private state: PhysState = 'grounded';
  private vel = new THREE.Vector3();
  private holdTarget = new THREE.Vector3();
  private grabOffset = new THREE.Vector3();
  private heldVel = new THREE.Vector3();
  private lastHold = new THREE.Vector3();
  private travel = new THREE.Vector2();

  // Antenna spring.
  private headPrev = new THREE.Vector3();
  private headVel = new THREE.Vector3();
  private antenna = { x: 0, z: 0, vx: 0, vz: 0 };

  /** Offsets animated by emotes and applied on top of the base pose every frame. */
  readonly pose = { headTilt: 0, headNod: 0, headTurn: 0, armL: 0, armR: 0, wave: 0, lean: 0, armsBack: 0 };

  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(
    private robot: Robot,
    private sound: Sound,
    private reduced: boolean,
  ) {}

  get mood(): Mood {
    return this.robot.face.mood;
  }

  get isAsleep(): boolean {
    return this.asleep;
  }

  get physState(): PhysState {
    return this.state;
  }

  on(fn: (e: BrainEvent) => void): void {
    this.listeners.add(fn);
  }

  private emit(e: BrainEvent): void {
    this.listeners.forEach((fn) => fn(e));
  }

  /** A quick look at something (a tapped button, a new chat line), then back to whatever it was watching. */
  glance(world: THREE.Vector3, seconds = 1.2): void {
    this.glanceAt = world.clone();
    this.glanceUntil = this.time + seconds;
  }

  /** A finger on the screen: watched while it moves and for a moment after it lifts. */
  touch(world: THREE.Vector3): void {
    this.gazeTarget.copy(world);
    this.touchUntil = this.time + 1.6;
    this.input();
  }

  setBaseMood(m: Mood): void {
    this.baseMood = m;
  }

  /** Shows a mood for a while, then returns to whatever the base mood is. */
  react(m: Mood, seconds: number, voice = true): void {
    this.reaction = { mood: m, until: this.time + seconds };
    if (voice) this.sound.chirp(m);
  }

  /** Any sign of life from the visitor: resets the sleep timer and wakes the robot up. */
  input(): void {
    this.idleFor = 0;
    if (this.asleep) {
      this.asleep = false;
      this.emit('wake');
      this.react('surprised', 0.9, false);
      this.sound.chirp('surprised');
      this.hop(0.25);
    }
  }

  /** Pointer position in world space (on or in front of the z = 0 plane). */
  pointer(world: THREE.Vector3, clientX: number, clientY: number): void {
    this.pointerSeen = true;
    this.gazeTarget.copy(world);
    this.input();
    this.trackSpin(clientX, clientY);
  }

  /** Phone tilt, each axis -1..1, used for gaze when there's no mouse. */
  tilt(x: number, y: number): void {
    this.tiltInput = { x, y };
  }

  /** Forces the gaze toward a world point (or back to the pointer with null). */
  lookAt(world: THREE.Vector3 | null): void {
    this.gazeOverride = world ? world.clone() : null;
  }

  /** Root velocity from the director, in screen-ish world units per second: tilts and spins the wheels. */
  setTravel(vx: number, vy: number): void {
    this.travel.set(vx, vy);
  }

  /** A phone shake (from devicemotion): enough of them in a row makes Nibbo dizzy. */
  shake(): void {
    this.spinAccum += 9;
    this.input();
  }

  private trackSpin(x: number, y: number): void {
    const now = performance.now();
    const last = this.lastPointer;
    if (last) {
      const dt = Math.max(1, now - last.t) / 1000;
      const dx = x - last.x;
      const dy = y - last.y;
      const speed = Math.hypot(dx, dy) / dt;
      if (speed > 40) {
        const angle = Math.atan2(dy, dx);
        if (last.angle !== null && speed > 900) {
          let d = angle - last.angle;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.spinAccum += Math.abs(d) * Math.min(2, speed / 1500);
        }
        this.lastPointer = { x, y, t: now, angle };
        return;
      }
    }
    this.lastPointer = { x, y, t: now, angle: last?.angle ?? null };
  }

  // Emotes ------------------------------------------------------------------------------------------------

  hop(height = 0.45): void {
    if (this.reduced) return;
    const e = this.robot.emote;
    gsap.timeline()
      .to(e.scale, { y: 0.86, x: 1.06, z: 1.06, duration: 0.09, ease: 'power2.out' })
      .to(e.scale, { y: 1.08, x: 0.96, z: 0.96, duration: 0.12, ease: 'power2.out' })
      .to(e.position, { y: height, duration: 0.24, ease: 'power2.out' }, '<')
      .to(e.position, { y: 0, duration: 0.22, ease: 'power2.in' })
      .to(e.scale, { y: 1, x: 1, z: 1, duration: 0.1 }, '<0.1')
      .add(() => this.sound.land(0.5))
      .to(e.scale, { y: 0.92, x: 1.04, z: 1.04, duration: 0.07, yoyo: true, repeat: 1 });
  }

  spin(): void {
    if (this.reduced) return;
    this.sound.servo();
    gsap.to(this.robot.emote.rotation, { y: `+=${Math.PI * 2}`, duration: 0.9, ease: 'back.inOut(1.4)' });
  }

  wave(): void {
    const p = this.pose;
    gsap.killTweensOf(p, 'armR,wave');
    this.sound.servo(true);
    gsap.timeline()
      .to(p, { armR: 2.5, duration: 0.3, ease: 'back.out(2)' })
      .to(p, { wave: 1, duration: 0.15 }, '<0.15')
      .to(p, { wave: 0, duration: 0.2 }, '+=0.9')
      .to(p, { armR: 0, duration: 0.4, ease: 'power2.inOut' }, '<');
  }

  nod(times = 2): void {
    gsap.to(this.pose, { headNod: 0.22, duration: 0.14, yoyo: true, repeat: times * 2 - 1, ease: 'sine.inOut' });
  }

  tiltHead(amount = 0.28, seconds = 1.6): void {
    gsap.timeline().to(this.pose, { headTilt: amount, duration: 0.35, ease: 'back.out(2)' }).to(this.pose, { headTilt: 0, duration: 0.5 }, `+=${seconds}`);
  }

  dance(): void {
    if (this.reduced) return;
    const p = this.pose;
    gsap.timeline()
      .to(p, { lean: 0.16, armL: 1.6, armR: 0.4, duration: 0.22, ease: 'sine.inOut' })
      .to(p, { lean: -0.16, armL: 0.4, armR: 1.6, duration: 0.22, ease: 'sine.inOut', repeat: 5, yoyo: true })
      .to(p, { lean: 0, armL: 0, armR: 0, duration: 0.3 });
    this.hop(0.25);
  }

  /** Flicks the antenna so it boings on its spring. */
  kickAntenna(strength = 8): void {
    this.antenna.vz += strength;
    this.antenna.vx -= strength * 0.3;
  }

  shiver(): void {
    if (this.reduced) return;
    gsap.fromTo(this.robot.emote.position, { x: -0.04 }, { x: 0.04, duration: 0.05, repeat: 7, yoyo: true, ease: 'none', onComplete: () => void (this.robot.emote.position.x = 0) });
  }

  /** Tap or click on the robot. Different every time; pestering it too much makes it grumpy. */
  poke(): void {
    if (this.busy) return;
    this.input();
    this.onPlay?.();
    const now = this.time;
    this.pokes = this.pokes.filter((t) => now - t < 3.5);
    this.pokes.push(now);
    vibrate(12);
    this.emit('poke');
    if (this.pokes.length >= 5) {
      this.pokes = [];
      this.emit('grumpy');
      this.react('grumpy', 2.2);
      gsap.timeline().to(this.pose, { headTurn: 0.9, duration: 0.3 }).to(this.pose, { headTurn: 0, duration: 0.5 }, '+=1.4');
      this.shiver();
      return;
    }
    const pick = Math.floor(Math.random() * 5);
    if (pick === 0) {
      this.react('joy', 1.3, false);
      this.sound.giggle();
      this.hop();
    } else if (pick === 1) {
      this.react('starry', 1.4, false);
      this.sound.whee();
      this.spin();
    } else if (pick === 2) {
      this.react('happy', 1.6);
      this.wave();
    } else if (pick === 3) {
      this.react('surprised', 1, false);
      this.sound.boop();
      this.hop(0.3);
    } else {
      this.react('love', 1.6);
      this.tiltHead(0.25, 0.8);
    }
  }

  // Drag and toss -------------------------------------------------------------------------------------------

  /** Pick up at a point given in root-local space. */
  grab(local: THREE.Vector3): void {
    this.input();
    this.onPlay?.();
    this.emit('pickup');
    this.state = 'held';
    this.grabOffset.copy(local).sub(this.robot.phys.position);
    this.grabOffset.y = Math.min(this.grabOffset.y, 2.0);
    this.holdTarget.copy(this.robot.phys.position);
    this.lastHold.copy(this.robot.phys.position);
    this.heldVel.set(0, 0, 0);
    this.react('surprised', 0.6, false);
    this.sound.boop();
    vibrate(10);
  }

  drag(local: THREE.Vector3): void {
    if (this.state !== 'held') return;
    this.holdTarget.copy(local).sub(this.grabOffset);
    this.holdTarget.y = Math.max(0, Math.min(this.holdTarget.y, this.bounds.y));
    this.holdTarget.x = Math.max(-this.bounds.x, Math.min(this.bounds.x, this.holdTarget.x));
    this.holdTarget.z = 0;
  }

  release(): void {
    if (this.state !== 'held') return;
    this.state = 'falling';
    this.vel.copy(this.heldVel).clampLength(0, 14);
    const fast = this.vel.length() > 5;
    this.react(fast ? 'starry' : 'surprised', fast ? 1.4 : 0.8, false);
    if (fast) {
      this.sound.whee();
      this.emit('toss');
    }
  }

  // Frame update ----------------------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    const { robot } = this;
    const face = robot.face;

    // Sleep.
    if (!this.busy && this.state === 'grounded') this.idleFor += dt;
    else this.idleFor = 0;
    if (this.idleFor > ASLEEP_AFTER && !this.asleep) {
      this.asleep = true;
      this.emit('sleep');
      this.snoreAt = this.time + 1.5;
    }
    if (this.asleep && this.time > this.snoreAt) {
      this.sound.snore();
      this.snoreAt = this.time + 3.4;
    }

    // Dizziness decays; a burst of circling (or shaking) tips it over.
    this.spinAccum = Math.max(0, this.spinAccum - dt * 9);
    if (this.spinAccum > 26 && !this.busy) {
      this.spinAccum = 0;
      this.emit('dizzy');
      this.react('dizzy', 2.6);
      if (!this.reduced) gsap.to(this.robot.emote.rotation, { z: 0.12, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut', onComplete: () => void (this.robot.emote.rotation.z = 0) });
      vibrate([20, 40, 20]);
    }

    // Mood resolution.
    if (this.reaction && this.time > this.reaction.until) this.reaction = null;
    let mood: Mood = this.baseMood;
    if (this.asleep) mood = 'asleep';
    else if (this.idleFor > SLEEPY_AFTER) mood = 'sleepy';
    if (this.reaction) mood = this.reaction.mood;
    face.set(mood);

    this.updateGaze(dt, mood);
    this.updatePhysics(dt);
    this.updateLimbs(dt, mood);
  }

  private updateGaze(dt: number, mood: Mood): void {
    const head = this.robot.parts.head;
    let target: THREE.Vector3;
    if (this.gazeOverride) {
      target = this.gazeOverride;
    } else if (this.glanceAt && this.time < this.glanceUntil) {
      target = this.glanceAt;
    } else if (this.pointerSeen || this.time < this.touchUntil) {
      target = this.gazeTarget;
    } else if (this.tiltInput) {
      head.parent!.getWorldPosition(this.tmp2);
      target = this.tmp.set(this.tmp2.x + this.tiltInput.x * 6, this.tmp2.y - this.tiltInput.y * 4, 10);
    } else {
      // No pointer (touch screens): look around now and then.
      if (this.time > this.wanderAt) {
        this.wanderAt = this.time + 1.6 + Math.random() * 2.6;
        head.parent!.getWorldPosition(this.tmp2);
        this.wander.set(this.tmp2.x + (Math.random() - 0.5) * 9, this.tmp2.y + (Math.random() - 0.3) * 4, 10);
      }
      target = this.wander;
    }

    // Direction from the head to the target, in the head's parent space.
    const parent = head.parent!;
    const local = parent.worldToLocal(this.tmp2.copy(target));
    local.sub(head.position);
    local.y -= 0.44;
    const flatDist = Math.hypot(local.x, local.z) || 1e-6;
    let yaw = Math.atan2(local.x, Math.max(0.3, local.z));
    let pitch = -Math.atan2(local.y, flatDist);
    const sleepy = mood === 'asleep' || mood === 'sleepy';
    if (sleepy) {
      yaw = 0;
      pitch = mood === 'asleep' ? 0.32 : 0.15;
    }
    yaw = Math.max(-0.75, Math.min(0.75, yaw));
    pitch = Math.max(-0.42, Math.min(0.4, pitch));
    const lambda = this.state === 'held' ? 4 : 7;
    this.yaw = damp(this.yaw, yaw * 0.62, lambda, dt);
    this.pitch = damp(this.pitch, pitch * 0.62, lambda, dt);
    // Eyes lead the head: they cover the part of the angle the head hasn't turned yet.
    const eyesX = sleepy ? 0 : (yaw - this.yaw) / 0.4 + this.yaw * 0.6;
    const eyesY = sleepy ? 0 : -(pitch - this.pitch) / 0.35 - this.pitch * 0.6;
    this.robot.face.look(eyesX, -eyesY);

    const p = this.pose;
    const breathe = Math.sin(this.time * 1.7) * 0.015;
    head.rotation.set(this.pitch + p.headNod + breathe, this.yaw + p.headTurn, p.headTilt + (mood === 'curious' ? 0.18 : 0));
  }

  private updatePhysics(dt: number): void {
    const phys = this.robot.phys;
    const pos = phys.position;
    let tiltX = 0;
    let tiltZ = 0;

    if (this.state === 'held') {
      const prev = this.tmp.copy(pos);
      pos.x = damp(pos.x, this.holdTarget.x, 16, dt);
      pos.y = damp(pos.y, this.holdTarget.y, 16, dt);
      pos.z = 0;
      const v = this.tmp2.copy(pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
      this.heldVel.lerp(v, 0.35);
      // Dangles: swings against the direction it's being moved.
      tiltZ = THREE.MathUtils.clamp(-this.heldVel.x * 0.06, -0.7, 0.7);
      tiltX = THREE.MathUtils.clamp(this.heldVel.y * 0.02, -0.3, 0.3);
      this.robot.wheelSpeed = damp(this.robot.wheelSpeed, 14, 3, dt);
    } else if (this.state === 'falling') {
      this.vel.y -= GRAVITY * dt;
      pos.addScaledVector(this.vel, dt);
      pos.z = 0;
      tiltZ = THREE.MathUtils.clamp(-this.vel.x * 0.05, -0.6, 0.6);
      // Bounce off the screen edges.
      if (Math.abs(pos.x) > this.bounds.x) {
        pos.x = THREE.MathUtils.clamp(pos.x, -this.bounds.x, this.bounds.x);
        this.vel.x *= -0.5;
        this.sound.land(0.3);
      }
      if (pos.y <= 0) {
        pos.y = 0;
        const impact = Math.abs(this.vel.y);
        if (impact > 2.2) {
          this.vel.y = impact * 0.34;
          this.vel.x *= 0.6;
          this.sound.land(Math.min(1, impact / 10));
          if (impact > 7) vibrate(18);
          const e = this.robot.emote.scale;
          gsap.fromTo(e, { y: 0.82, x: 1.1, z: 1.1 }, { y: 1, x: 1, z: 1, duration: 0.35, ease: 'elastic.out(1.2, 0.4)' });
        } else {
          this.vel.set(0, 0, 0);
          this.state = 'grounded';
          this.react('joy', 1.1, false);
          this.sound.chirp('happy');
        }
      }
    } else {
      // Grounded: drive back to its spot.
      const before = pos.x;
      pos.x = damp(pos.x, 0, 2.2, dt);
      pos.y = 0;
      pos.z = 0;
      const vx = (pos.x - before) / Math.max(dt, 1e-4);
      this.robot.wheelSpeed = damp(this.robot.wheelSpeed, vx * 6 + this.travel.length() * 0.6, 6, dt);
    }

    // Travel between sections leans the robot into the motion.
    tiltZ += THREE.MathUtils.clamp(-this.travel.x * 0.025, -0.35, 0.35);
    tiltX += THREE.MathUtils.clamp(-this.travel.y * 0.012, -0.25, 0.25);
    phys.rotation.z = damp(phys.rotation.z, tiltZ + this.pose.lean, 10, dt);
    phys.rotation.x = damp(phys.rotation.x, tiltX, 10, dt);

    // Shadow shrinks and fades as the robot leaves the ground.
    const h = Math.max(0, pos.y + this.robot.emote.position.y);
    const s = 1 / (1 + h * 0.55);
    this.robot.shadow.scale.setScalar(s);
    this.robot.shadow.position.x = pos.x;
    (this.robot.shadow.material as THREE.MeshBasicMaterial).opacity = s;
  }

  private updateLimbs(dt: number, mood: Mood): void {
    const { parts } = this.robot;
    const p = this.pose;
    const t = this.time;
    const airborne = this.state !== 'grounded';
    const travel = Math.min(1, this.travel.length() / 10);

    let baseL = 0.16 + Math.sin(t * 1.3) * 0.03;
    let baseR = 0.16 + Math.sin(t * 1.3 + 1) * 0.03;
    if (airborne) {
      baseL = 2.3 + Math.sin(t * 15) * 0.25;
      baseR = 2.3 + Math.sin(t * 15 + 1.5) * 0.25;
    } else if (mood === 'joy' || mood === 'starry') {
      baseL = baseR = 0.9 + Math.sin(t * 12) * 0.25;
    } else if (mood === 'asleep' || mood === 'sad') {
      baseL = baseR = 0.05;
    }
    const waveWiggle = p.wave * Math.sin(t * 13) * 0.4;
    const targetL = -(baseL + p.armL);
    const targetR = baseR + p.armR + waveWiggle;
    parts.armL.rotation.z = damp(parts.armL.rotation.z, targetL, 14, dt);
    parts.armR.rotation.z = damp(parts.armR.rotation.z, targetR, 14, dt);
    const back = travel * 0.7 + p.armsBack;
    parts.armL.rotation.x = damp(parts.armL.rotation.x, back, 8, dt);
    parts.armR.rotation.x = damp(parts.armR.rotation.x, back, 8, dt);

    // Antenna spring, driven by how the head accelerates through the world.
    const headPos = parts.head.getWorldPosition(this.tmp);
    const scale = this.robot.root.scale.x || 1;
    if (dt > 0) {
      const v = this.tmp2.copy(headPos).sub(this.headPrev).divideScalar(dt * scale);
      const acc = v.clone().sub(this.headVel).divideScalar(dt);
      this.headVel.copy(v);
      const a = this.antenna;
      const k = 160;
      const c = 7;
      a.vz += (-k * a.z - c * a.vz + THREE.MathUtils.clamp(acc.x * 0.012, -40, 40)) * dt;
      a.vx += (-k * a.x - c * a.vx + THREE.MathUtils.clamp(-acc.y * 0.01, -40, 40)) * dt;
      a.z = THREE.MathUtils.clamp(a.z + a.vz * dt, -0.6, 0.6);
      a.x = THREE.MathUtils.clamp(a.x + a.vx * dt, -0.5, 0.5);
      parts.antenna.rotation.z = a.z;
      parts.antenna.rotation.x = a.x;
    }
    this.headPrev.copy(headPos);
  }
}
