import * as THREE from 'three';
import { finePointer } from '../lib/dom';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import type { Robot } from '../three/robot';
import type { Stage } from '../three/stage';

const INTERACTIVE = 'a, button, input, label, select, textarea, [role="radio"], [role="switch"], .make__stage, .tag';

/**
 * Pointer, touch and motion input for the robot.
 * - Gaze: the mouse (or the phone's tilt) is where Nibbo looks.
 * - Poke: a click or tap on the robot.
 * - Drag and toss: press on the robot and move. On phones only in the hero, where a touch on the robot means
 *   "pick it up" rather than "scroll"; elsewhere a touch on the robot still scrolls the page.
 * - Shake: a hard phone shake counts towards making Nibbo dizzy.
 */
export function initControls(stage: Stage, robot: Robot, brain: Brain, director: Director): void {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const gaze = new THREE.Vector3();
  const rootPos = new THREE.Vector3();

  const hitsRobot = (x: number, y: number): boolean => {
    stage.ndc(x, y, ndc);
    ray.setFromCamera(ndc, stage.camera);
    return ray.intersectObject(robot.hitbox, false).length > 0;
  };

  /** Pointer → point in the robot root's local space, on the plane through the robot facing the camera. */
  const toRootLocal = (x: number, y: number, out: THREE.Vector3): boolean => {
    stage.ndc(x, y, ndc);
    ray.setFromCamera(ndc, stage.camera);
    robot.root.getWorldPosition(rootPos);
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), rootPos);
    if (!ray.ray.intersectPlane(plane, hit)) return false;
    out.copy(robot.root.worldToLocal(hit));
    return true;
  };

  const canGrab = (pointerType: string): boolean =>
    brain.draggable && !brain.busy && (pointerType === 'mouse' || pointerType === 'pen' || director.current?.id === 'hero');

  // A touch that lands on the robot in the hero picks it up instead of scrolling.
  window.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) return;
      if ((e.target as Element | null)?.closest(INTERACTIVE)) return;
      if (canGrab('touch') && hitsRobot(t.clientX, t.clientY)) e.preventDefault();
    },
    { passive: false },
  );

  let down: { id: number; x: number; y: number; t: number; type: string; onRobot: boolean } | null = null;
  let dragging = false;
  const local = new THREE.Vector3();

  window.addEventListener('pointerdown', (e) => {
    brain.input();
    if (!e.isPrimary || (e.target as Element | null)?.closest(INTERACTIVE)) return;
    const onRobot = hitsRobot(e.clientX, e.clientY);
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, onRobot };
    dragging = false;
    if (onRobot && e.pointerType === 'mouse') e.preventDefault();
  });

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        // Gaze target: the point under the cursor, pulled towards the viewer so Nibbo looks at *you*.
        stage.ndc(e.clientX, e.clientY, ndc);
        ray.setFromCamera(ndc, stage.camera);
        const t = (8 - ray.ray.origin.z) / ray.ray.direction.z;
        gaze.copy(ray.ray.direction).multiplyScalar(t).add(ray.ray.origin);
        brain.pointer(gaze, e.clientX, e.clientY);
        if (!down) document.documentElement.classList.toggle('over-robot', brain.draggable && hitsRobot(e.clientX, e.clientY));
      }
      if (!down || e.pointerId !== down.id || !down.onRobot) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (!dragging && moved > 6 && canGrab(down.type) && toRootLocal(down.x, down.y, local)) {
        dragging = true;
        brain.grab(local);
        document.documentElement.classList.add('is-dragging');
      }
      if (dragging && toRootLocal(e.clientX, e.clientY, local)) brain.drag(local);
    },
    { passive: true },
  );

  const end = (e: PointerEvent, cancelled: boolean): void => {
    if (!down || e.pointerId !== down.id) return;
    if (dragging) {
      brain.release();
      document.documentElement.classList.remove('is-dragging');
    } else if (!cancelled && down.onRobot) {
      const quick = performance.now() - down.t < 450 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10;
      if (quick) brain.poke();
    }
    down = null;
    dragging = false;
  };
  window.addEventListener('pointerup', (e) => end(e, false));
  window.addEventListener('pointercancel', (e) => end(e, true));

  window.addEventListener('wheel', () => brain.input(), { passive: true });
  window.addEventListener('keydown', () => brain.input());

  if (!finePointer()) {
    // Phone tilt steers the gaze; a hard shake makes it dizzy.
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma === null || e.beta === null) return;
      brain.tilt(e.gamma / 30, (e.beta - 45) / 30);
    });
    let lastShake = 0;
    window.addEventListener('devicemotion', (e) => {
      const a = e.acceleration;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const m = Math.hypot(a.x, a.y, a.z);
      const now = performance.now();
      if (m > 17 && now - lastShake > 180) {
        lastShake = now;
        brain.shake();
      }
    });
  }
}
