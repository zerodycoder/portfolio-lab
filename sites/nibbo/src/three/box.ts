import { gsap } from 'gsap';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ACCESSORIES, LEDS, SHELLS, type Bot } from '../lib/bot';
import type { Pose } from './director';
import { ROBOT_H } from './robot';
import type { Stage } from './stage';

/**
 * The adoption box: a cardboard box built from code with four hinged flaps, packing tape and a shipping label
 * printed (on a canvas texture) with the robot's name and options. It stands next to Nibbo in the adopt slot;
 * adopting hops the robot in, folds the flaps shut and slaps the label on.
 */

const W = 1.9;
const H = 1.45;
const D = 1.5;
const T = 0.05;
const KRAFT = '#d6a466';

function labelCanvas(bot: Bot): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffaf1';
  g.beginPath();
  g.roundRect(0, 0, 512, 320, 22);
  g.fill();
  g.strokeStyle = '#1e1b2e';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(8, 8, 496, 304, 18);
  g.stroke();
  g.fillStyle = '#1e1b2e';
  g.font = '600 20px "Martian Mono Variable", ui-monospace, monospace';
  g.fillText('NIBBO · LIVE ROBOT', 34, 56);
  g.textAlign = 'right';
  g.fillText('↑ UP', 478, 56);
  g.textAlign = 'left';
  g.font = '800 92px "Bricolage Grotesque Variable", system-ui, sans-serif';
  const name = bot.name.trim() || 'Nibbo';
  let size = 92;
  while (g.measureText(name).width > 440 && size > 40) {
    size -= 6;
    g.font = `800 ${size}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
  }
  g.fillText(name, 32, 170);
  g.font = '500 20px "Martian Mono Variable", ui-monospace, monospace';
  g.fillStyle = '#4a4560';
  g.fillText(`${SHELLS[bot.shell].name} shell · ${LEDS[bot.led].name} face`.toUpperCase(), 34, 222);
  g.fillText(`${ACCESSORIES[bot.accessory].name}`.toUpperCase() + ' · HANDLE WITH LOVE', 34, 256);
  g.fillStyle = SHELLS[bot.shell].hex;
  g.fillRect(34, 278, 444, 12);
  return c;
}

export class ShipBox {
  readonly group = new THREE.Group();
  packed = false;

  private flaps: THREE.Group[] = [];
  private tape: THREE.Mesh;
  private label: THREE.Mesh;
  private labelTex: THREE.CanvasTexture;
  private shown = 0;
  private scale = 1;
  private robotSpot = new THREE.Vector3();
  private euler = new THREE.Euler();
  private boxSpot = new THREE.Vector3();
  /** 0 = robot stands beside the box, 1 = robot is inside. */
  readonly bot = { inside: 0, hop: 0 };

  constructor(private stage: Stage) {
    const kraft = new THREE.MeshPhysicalMaterial({ color: KRAFT, roughness: 0.85, clearcoat: 0 });
    const kraftDark = new THREE.MeshPhysicalMaterial({ color: '#b98a50', roughness: 0.9 });
    const box = new THREE.Group();
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m = kraft): void => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.02), m);
      mesh.position.set(x, y, z);
      box.add(mesh);
    };
    wall(W, T, D, 0, T / 2, 0, kraftDark);
    wall(W, H, T, 0, H / 2, D / 2);
    wall(W, H, T, 0, H / 2, -D / 2, kraftDark);
    wall(T, H, D, -W / 2, H / 2, 0);
    wall(T, H, D, W / 2, H / 2, 0);

    // Printed logo on the front: the little face mark.
    const mark = document.createElement('canvas');
    mark.width = 256;
    mark.height = 128;
    const mg = mark.getContext('2d')!;
    mg.fillStyle = '#1e1b2e';
    mg.beginPath();
    mg.roundRect(8, 24, 112, 80, 24);
    mg.fill();
    mg.fillStyle = '#d6a466';
    mg.beginPath();
    mg.roundRect(38, 46, 16, 26, 8);
    mg.roundRect(74, 46, 16, 26, 8);
    mg.fill();
    mg.fillStyle = '#1e1b2e';
    mg.font = '800 64px "Bricolage Grotesque Variable", system-ui, sans-serif';
    mg.fillText('nib', 134, 92);
    const markTex = new THREE.CanvasTexture(mark);
    markTex.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: markTex, transparent: true, opacity: 0.85 }));
    logo.position.set(-0.36, H * 0.78, D / 2 + T / 2 + 0.002);
    box.add(logo);

    // Flaps hinge on the top edges; open they lean outwards.
    const flapDefs: [number, number, number, number, number, 'x' | 'z', number][] = [
      [W, D / 2, 0, H, D / 2, 'x', 1],
      [W, D / 2, 0, H, -D / 2, 'x', -1],
      [D, W / 2, -W / 2, H, 0, 'z', 1],
      [D, W / 2, W / 2, H, 0, 'z', -1],
    ];
    flapDefs.forEach(([len, depth, x, y, z, axis, sign], i) => {
      const hinge = new THREE.Group();
      hinge.position.set(x, y, z);
      const flap = new THREE.Mesh(new RoundedBoxGeometry(axis === 'x' ? len : depth, T * 0.8, axis === 'x' ? depth : len, 2, 0.02), i < 2 ? kraft : kraftDark);
      if (axis === 'x') flap.position.z = (-sign * depth) / 2;
      else flap.position.x = (sign * depth) / 2;
      flap.position.y = i < 2 ? 0.03 : 0.0;
      hinge.add(flap);
      hinge.userData = { axis, sign };
      box.add(hinge);
      this.flaps.push(hinge);
    });

    this.tape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, D + 0.3),
      new THREE.MeshPhysicalMaterial({ color: '#c79652', roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0.85 }),
    );
    this.tape.rotation.x = -Math.PI / 2;
    this.tape.position.set(0, H + 0.075, 0);
    this.tape.scale.y = 0.001;
    box.add(this.tape);

    this.labelTex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.64), new THREE.MeshBasicMaterial({ map: this.labelTex, transparent: true }));
    this.label.position.set(0.3, H * 0.4, D / 2 + T / 2 + 0.004);
    this.label.rotation.z = -0.04;
    this.label.scale.setScalar(0.001);
    box.add(this.label);

    this.group.add(box);
    this.group.visible = false;
    this.setFlaps(1, false);
    stage.scene.add(this.group);
  }

  /** 1 = open, 0 = shut. */
  private setFlaps(open: number, animate = true): gsap.core.Timeline | null {
    const tl = animate ? gsap.timeline() : null;
    this.flaps.forEach((hinge, i) => {
      const { axis, sign } = hinge.userData as { axis: 'x' | 'z'; sign: number };
      // Inner flaps (front/back) close first when shutting, last when opening.
      const angle = open ? sign * (i < 2 ? 2.1 : 2.0) : 0;
      const rot = axis === 'x' ? { x: angle } : { z: angle };
      if (tl) tl.to(hinge.rotation, { ...rot, duration: 0.32, ease: open ? 'back.out(1.6)' : 'power2.in' }, open ? (3 - i) * 0.07 : i < 2 ? 0.25 : 0);
      else Object.assign(hinge.rotation, rot);
    });
    return tl;
  }

  /** Lays out the box and the robot's spot inside the slot: robot left, box right. */
  layout(rect: DOMRect): void {
    const { stage } = this;
    const canvasTop = stage.canvas.getBoundingClientRect().top;
    // Robot and box side by side, both fitted to the slot (the box is 0.75 robot-heights wide at scale 0.8).
    const robotH = Math.min(rect.height * 0.86, rect.width * 0.86);
    this.scale = (robotH * stage.wpp) / ROBOT_H;
    const robotX = rect.left + rect.width * 0.25;
    const boxX = rect.left + rect.width * 0.74;
    stage.toWorld(robotX, rect.bottom - canvasTop, this.robotSpot);
    stage.toWorld(boxX, rect.bottom - canvasTop, this.boxSpot);
    this.group.position.copy(this.boxSpot);
    this.group.rotation.set(0.12, -0.32, 0);
    this.group.scale.setScalar(this.scale * 0.8 * (0.001 + 0.999 * this.shown));
  }

  robotPose(out: Pose): void {
    const t = this.bot.inside;
    out.pos.lerpVectors(this.robotSpot, this.boxSpot, t);
    out.pos.y += this.bot.hop * this.scale;
    out.pos.z += t * 0.3 * this.scale;
    out.quat.setFromEuler(this.euler.set(0.06, 0.32 * (1 - t), 0));
    // Inside the box Nibbo curls up small enough for the flaps to close.
    out.scale = this.scale * (1 - t * 0.5);
  }

  setShown(on: boolean): void {
    const target = on ? 1 : 0;
    if (Math.abs(this.shown - target) < 0.001 && this.group.visible === on) return;
    gsap.to(this, {
      shown: target,
      duration: on ? 0.7 : 0.4,
      ease: on ? 'back.out(1.4)' : 'power2.in',
      overwrite: true,
      onStart: () => void (this.group.visible = true),
      onComplete: () => void (this.group.visible = on),
    });
  }

  /** Robot hops in, flaps fold, tape, label. Calls back at each beat for sounds. */
  pack(bot: Bot, beats: { hop: () => void; land: () => void; flap: () => void; tape: () => void; label: () => void }): gsap.core.Timeline {
    this.labelTex.image = labelCanvas(bot);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.labelTex.needsUpdate = true;
    this.packed = true;
    const tl = gsap.timeline();
    tl.add(beats.hop)
      .to(this.bot, { inside: 1, duration: 0.7, ease: 'power1.inOut' })
      .to(this.bot, { hop: 1.5, duration: 0.35, ease: 'power2.out' }, '<')
      .to(this.bot, { hop: 0, duration: 0.35, ease: 'power2.in' }, '>')
      .add(beats.land)
      .add(() => {
        const flaps = this.setFlaps(0);
        flaps?.eventCallback('onStart', beats.flap);
      }, '+=0.15')
      .add(beats.flap, '+=0.3')
      .add(beats.tape, '+=0.35')
      .to(this.tape.scale, { y: 1, duration: 0.45, ease: 'power2.out' }, '<')
      .add(beats.label, '+=0.1')
      .fromTo(this.label.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.2)' }, '<')
      .to(this.group.rotation, { z: 0.05, duration: 0.08, yoyo: true, repeat: 3, ease: 'sine.inOut' });
    return tl;
  }

  unpack(beats: { flap: () => void; hop: () => void }): gsap.core.Timeline {
    this.packed = false;
    const tl = gsap.timeline();
    tl.to(this.label.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.25, ease: 'back.in(2)' })
      .to(this.tape.scale, { y: 0.001, duration: 0.25 }, '<')
      .add(() => {
        beats.flap();
        this.setFlaps(1);
      })
      .add(beats.hop, '+=0.4')
      .to(this.bot, { inside: 0, duration: 0.7, ease: 'power1.inOut' })
      .to(this.bot, { hop: 1.5, duration: 0.35, ease: 'power2.out' }, '<')
      .to(this.bot, { hop: 0, duration: 0.35, ease: 'power2.in' }, '>');
    return tl;
  }
}
