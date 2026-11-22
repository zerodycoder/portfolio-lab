import * as THREE from 'three';
import { finePointer, vibrate } from '../lib/dom';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import type { Robot } from '../three/robot';
import type { Stage } from '../three/stage';

const INTERACTIVE = 'a, button, input, label, select, textarea, [role="radio"], [role="switch"], .make__stage, .tag, [data-tricks-panel]';
const LONG_PRESS_MS = 320;

/**
 * Pointer, touch and motion input for the robot, with the same abilities on a phone as with a mouse.
 * - Gaze: the mouse; on phones the finger (while it's down), the phone's tilt, and whatever was just tapped.
 * - Poke: a click or tap on the robot.
 * - Pick up and toss: mouse drag anywhere. On phones a touch on the robot in the hero picks it up straight
 *   away; everywhere else a long press does (so a swipe across the robot still scrolls the page).
 * - Shake: a hard phone shake counts towards making Nibbo dizzy.
 */
export function initControls(stage: Stage, robot: Robot, brain: Brain, director: Director): void {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3(0, 0, 1);
  const hit = new THREE.Vector3();
  const rootPos = new THREE.Vector3();

  const hitsRobot = (x: number, y: number): boolean => {
    stage.ndc(x, y, ndc);
    ray.setFromCamera(ndc, stage.camera);
    return ray.intersectObject(robot.hitbox, false).length > 0;
  };

  /** Point under the screen position, pulled towards the viewer so Nibbo looks at *you*, not at the page. */
  const gazePoint = (x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 => {
    stage.ndc(x, y, ndc);
    ray.setFromCamera(ndc, stage.camera);
    const t = (8 - ray.ray.origin.z) / ray.ray.direction.z;
    return out.copy(ray.ray.direction).multiplyScalar(t).add(ray.ray.origin);
  };

  /** Pointer → point in the robot root's local space, on the plane through the robot facing the camera. */
  const toRootLocal = (x: number, y: number, out: THREE.Vector3): boolean => {
    stage.ndc(x, y, ndc);
    ray.setFromCamera(ndc, stage.camera);
    robot.root.getWorldPosition(rootPos);
    plane.setFromNormalAndCoplanarPoint(normal, rootPos);
    if (!ray.ray.intersectPlane(plane, hit)) return false;
    out.copy(robot.root.worldToLocal(hit));
    return true;
  };

  const instantGrab = (): boolean => director.current?.id === 'hero';

  type Down = { id: number; x: number; y: number; t: number; type: string; onRobot: boolean; timer: number };
  let down: Down | null = null;
  let dragging = false;
  const local = new THREE.Vector3();
  const gaze = new THREE.Vector3();

  const startDrag = (): void => {
    if (!down || dragging || !brain.draggable || brain.busy) return;
    if (!toRootLocal(down.x, down.y, local)) return;
    dragging = true;
    brain.grab(local);
    document.documentElement.classList.add('is-dragging');
  };

  // Touch: decide before the browser starts scrolling. In the hero a touch on the robot is a grab; elsewhere a
  // grab only begins after a still long press, and from then on the page must not scroll under the finger.
  window.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t || (e.target as Element | null)?.closest(INTERACTIVE)) return;
      if (instantGrab() && brain.draggable && !brain.busy && hitsRobot(t.clientX, t.clientY)) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (dragging) e.preventDefault();
    },
    { passive: false },
  );

  window.addEventListener('pointerdown', (e) => {
    brain.input();
    const target = e.target as Element | null;
    const ui = target?.closest(INTERACTIVE);
    if (ui && e.pointerType !== 'mouse') {
      // Glance at whatever was just tapped.
      const r = ui.getBoundingClientRect();
      brain.glance(gazePoint(r.left + r.width / 2, r.top + r.height / 2), 1.3);
    }
    if (!e.isPrimary || ui) return;
    if (e.pointerType === 'touch') brain.touch(gazePoint(e.clientX, e.clientY, gaze));
    const onRobot = hitsRobot(e.clientX, e.clientY);
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, onRobot, timer: 0 };
    dragging = false;
    if (onRobot && e.pointerType === 'mouse') e.preventDefault();
    if (onRobot && e.pointerType !== 'mouse') {
      // While the robot is pressed, a long press must not start selecting the page text underneath.
      document.documentElement.classList.add('is-pressing');
      if (instantGrab()) startDrag();
      else
        down.timer = window.setTimeout(() => {
          vibrate(15);
          startDrag();
        }, LONG_PRESS_MS);
    }
  });

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        brain.pointer(gazePoint(e.clientX, e.clientY, gaze), e.clientX, e.clientY);
        if (!down) document.documentElement.classList.toggle('over-robot', brain.draggable && hitsRobot(e.clientX, e.clientY));
      } else if (e.isPrimary) {
        brain.touch(gazePoint(e.clientX, e.clientY, gaze));
      }
      if (!down || e.pointerId !== down.id) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (!dragging && moved > 8 && down.timer) {
        // Moved before the long press completed: it's a scroll, not a grab.
        window.clearTimeout(down.timer);
        down.timer = 0;
      }
      if (!dragging && down.onRobot && down.type === 'mouse' && moved > 6) startDrag();
      if (dragging && toRootLocal(e.clientX, e.clientY, local)) brain.drag(local);
    },
    { passive: true },
  );

  const end = (e: PointerEvent, cancelled: boolean): void => {
    if (!down || e.pointerId !== down.id) return;
    window.clearTimeout(down.timer);
    document.documentElement.classList.remove('is-pressing');
    if (dragging) {
      brain.release();
      document.documentElement.classList.remove('is-dragging');
    } else if (!cancelled && down.onRobot) {
      const quick = performance.now() - down.t < LONG_PRESS_MS && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10;
      if (quick) brain.poke();
    }
    down = null;
    dragging = false;
  };
  window.addEventListener('pointerup', (e) => end(e, false));
  window.addEventListener('pointercancel', (e) => end(e, true));
  // Some browsers start a native drag or open a menu on long press; that must not strand a held robot.
  window.addEventListener('contextmenu', (e) => {
    if (down?.onRobot) e.preventDefault();
  });

  window.addEventListener('wheel', () => brain.input(), { passive: true });
  window.addEventListener('keydown', () => brain.input());

  // Scrolling: Nibbo glances the way the page is going (up or down), which reads as it watching along with you.
  let lastY = window.scrollY;
  let lastGlance = 0;
  window.addEventListener(
    'scroll',
    () => {
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      brain.input();
      const now = performance.now();
      if (Math.abs(dy) < 3 || now - lastGlance < 250 || finePointer()) return;
      lastGlance = now;
      robot.root.getWorldPosition(rootPos);
      const s = robot.root.scale.x;
      brain.glance(gaze.set(rootPos.x + s * 0.6, rootPos.y + s * (dy > 0 ? -1.2 : 4.2), 8), 0.7);
    },
    { passive: true },
  );

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
