import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * One fixed, transparent WebGL canvas behind the page content. Everything 3D on the site (the robot, the game
 * board, the shipping box) lives in this one scene, so phones only ever hold a single WebGL context.
 *
 * The camera looks straight down -z at the z = 0 plane; `toWorld` maps a CSS pixel on the canvas to that plane,
 * which is how HTML layout boxes ("slots") decide where the robot stands.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** CSS size of the canvas. */
  width = 1;
  height = 1;
  /** World units per CSS pixel on the z = 0 plane. */
  wpp = 0.01;

  private readonly distance = 24;
  private listeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new THREE.PerspectiveCamera(22, 1, 0.5, 80);
    this.camera.position.set(0, 0, this.distance);
    this.camera.lookAt(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight('#fff6ea', '#e9d9c6', 0.9);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff1e0', 2.1);
    key.position.set(-6, 9, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#cfe2ff', 1.3);
    rim.position.set(8, 4, -6);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffe3d6', 0.5);
    fill.position.set(6, -2, 8);
    this.scene.add(fill);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  onResize(fn: () => void): void {
    this.listeners.add(fn);
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    // Phones get a slightly lower pixel ratio: the robot stays crisp and the GPU stays cool.
    const dpr = Math.min(window.devicePixelRatio || 1, w < 760 ? 1.75 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const visibleH = 2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.wpp = visibleH / h;
    this.listeners.forEach((fn) => fn());
  }

  /** CSS pixel on the canvas → point on the z = 0 plane. */
  toWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set((x - this.width / 2) * this.wpp, (this.height / 2 - y) * this.wpp, 0);
  }

  /** World point → CSS pixel on the canvas (z is the NDC depth, > 1 means behind the camera). */
  toScreen(v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(v).project(this.camera);
    return out.set((out.x + 1) * 0.5 * this.width, (1 - out.y) * 0.5 * this.height, out.z);
  }

  /** Normalised device coordinates of a client point, for raycasting. */
  ndc(clientX: number, clientY: number, out = new THREE.Vector2()): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return out.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
