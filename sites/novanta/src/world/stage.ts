import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Grain, vignette and a warm grade, applied after tone mapping (display space). */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.035 },
    uWarm: { value: 0.0 },
    uFade: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uWarm, uFade;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 1.15)));
      c *= mix(1.0 - uVignette, 1.0, v);
      c = mix(c, c * vec3(1.06, 0.98, 0.88), uWarm);
      float g = h(vUv * 917.0 + fract(uTime * 7.31)) - 0.5;
      c += g * uGrain;
      c = mix(c, vec3(0.05, 0.035, 0.03), uFade);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export type Insets = { top: number; bottom: number; left: number; right: number };

/** A camera framing: look at `target` from direction `dir` (camera → target), fitting a sphere of `radius`. */
export type Shot = {
  target: THREE.Vector3;
  dir: THREE.Vector3;
  radius: number;
  fov: number;
  /** Optional roll-free "up" for top-down shots. */
  up?: THREE.Vector3;
  /** Pull the camera back or in after fitting (1 = fit). */
  zoom?: number;
  /** An explicit camera position (rooms are too small to back away until a radius fits). */
  pos?: THREE.Vector3;
};

/**
 * The single WebGL canvas. Everything 3D (the street, the pizzeria, the oven, the doorstep) lives in one scene so a
 * phone only holds one context; the camera travels between places instead of the page scrolling.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.02, 80);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly finish: ShaderPass;
  /** Ground-truth ambient occlusion: contact shadows in every corner, joint and under every object (desktop). */
  readonly ao: GTAOPass | null = null;
  readonly canvas: HTMLCanvasElement;
  readonly mobile: boolean;
  width = 1;
  height = 1;
  insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };
  /** Vertical lens shift in CSS px (positive moves the subject down), so the subject centres in the free area. */
  private shiftX = 0;
  private shiftY = 0;
  private listeners = new Set<() => void>();
  private tickers = new Set<(dt: number, t: number) => void>();
  readonly lookAt = new THREE.Vector3();
  private clock = new THREE.Timer();
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    this.scene.background = new THREE.Color('#120d0a');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mobile ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!this.mobile) {
      const ao = new GTAOPass(this.scene, this.camera, 512, 512);
      ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      ao.blendIntensity = 0.9;
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** Swaps the room-environment reflections for a real HDR environment. */
  setEnvironment(env: THREE.Texture, intensity: number): void {
    this.scene.environment = env;
    this.scene.environmentIntensity = intensity;
  }

  onResize(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Adds a per-frame callback (dt in seconds, clamped). Returns a remover. */
  tick(fn: (dt: number, t: number) => void): () => void {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.6 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    // Bloom is soft anyway: half resolution keeps phones cool.
    this.bloom.resolution.set(Math.round((w * dpr) / 2), Math.round((h * dpr) / 2));
    this.camera.aspect = w / h;
    this.applyShift();
    this.listeners.forEach((fn) => fn());
  }

  setInsets(i: Partial<Insets>): void {
    this.insets = { ...this.insets, ...i };
  }

  private applyShift(): void {
    if (Math.abs(this.shiftX) < 0.01 && Math.abs(this.shiftY) < 0.01) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, -this.shiftX, -this.shiftY, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Where the camera must stand for a shot, given the UI insets: the distance that fits the sphere in the free area,
   * and the lens shift that centres it there.
   */
  solve(s: Shot): { pos: THREE.Vector3; target: THREE.Vector3; fov: number; shiftX: number; shiftY: number; up: THREE.Vector3 } {
    const { top, bottom, left, right } = this.insets;
    const freeW = Math.max(80, this.width - left - right);
    const freeH = Math.max(80, this.height - top - bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(s.fov / 2));
    const tanH = tanV * this.camera.aspect;
    const t = Math.min(tanV * (freeH / this.height), tanH * (freeW / this.width));
    const dist = (s.radius / Math.sin(Math.atan(t))) * (s.zoom ?? 1);
    const pos = s.pos ? s.pos.clone() : s.target.clone().addScaledVector(s.dir.clone().normalize(), -dist);
    return {
      pos,
      target: s.target.clone(),
      fov: s.fov,
      shiftX: left / 2 - right / 2,
      shiftY: top / 2 - bottom / 2,
      up: s.up?.clone() ?? new THREE.Vector3(0, 1, 0),
    };
  }

  /** Puts the camera exactly at a solved pose. */
  place(p: { pos: THREE.Vector3; target: THREE.Vector3; fov: number; shiftX: number; shiftY: number; up?: THREE.Vector3 }): void {
    this.camera.position.copy(p.pos);
    this.camera.up.copy(p.up ?? new THREE.Vector3(0, 1, 0));
    this.lookAt.copy(p.target);
    this.camera.lookAt(p.target);
    this.camera.fov = p.fov;
    this.shiftX = p.shiftX;
    this.shiftY = p.shiftY;
    this.applyShift();
  }

  /** World point → CSS pixel on the canvas (z > 1 means behind the camera). */
  toScreen(v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(v).project(this.camera);
    return out.set((out.x + 1) * 0.5 * this.width, (1 - out.y) * 0.5 * this.height, out.z);
  }

  ndc(clientX: number, clientY: number, out = new THREE.Vector2()): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return out.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  private ray = new THREE.Raycaster();
  /** Ray from a client point, hitting a horizontal plane at height y. */
  pointOnPlane(clientX: number, clientY: number, y: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    return this.ray.ray.intersectPlane(plane, out);
  }

  raycast(clientX: number, clientY: number, objects: THREE.Object3D[], recursive = true): THREE.Intersection[] {
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    return this.ray.intersectObjects(objects, recursive);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = (now: number): void => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.clock.update(now);
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.getElapsed();
      this.tickers.forEach((fn) => fn(dt, t));
      this.finish.uniforms.uTime.value = t;
      this.composer.render(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Compiles every material in the scene up front (the gate shows this as loading progress). */
  async warm(): Promise<void> {
    await this.renderer.compileAsync(this.scene, this.camera);
  }
}
