import * as THREE from 'three';
import { canvas } from '../lib/canvas';
import { sheetOf, type Kind } from './catalog';
import { sheet, type Sheet } from './sprites';
import { GLSL_NOISE, GLSL_WEDGE } from './surface';

/**
 * A topping piece is a small height field cut out of its sprite: the silhouette comes from the sprite's alpha, and
 * the height from the distance to that silhouette (a salami slice is a flat disc, a mozzarella piece a pillow, an
 * olive a dome). So the same code turns a drawn sprite or a cut-out photo into a lit, shadow-casting 3D piece,
 * and the same points give the physics engine its convex hull.
 */

export type Variant = {
  geometry: THREE.BufferGeometry;
  /** Convex hull points (x, y, z, …) in metres, piece space. */
  hull: Float32Array;
  /** Footprint radius in metres. */
  radius: number;
};

export type KindAssets = { kind: Kind; sheet: Sheet; texture: THREE.Texture; variants: Variant[] };

const G = 44;
const N = 22;

function profile(kind: Kind, d: number): number {
  switch (kind.profile) {
    case 'flat':
      return 0.55 + 0.45 * Math.min(1, d / 0.25);
    case 'dome':
      return Math.sqrt(Math.max(0, 1 - (1 - d) * (1 - d)));
    case 'pillow':
      return Math.pow(Math.min(1, d / 0.75), 0.55);
    case 'leaf':
      return 0.45 + 0.55 * d;
  }
}

function buildVariant(kind: Kind, sh: Sheet, cellIndex: number): Variant | null {
  const cell = sh.cells[cellIndex];
  const { g } = canvas(G);
  g.drawImage(sh.image, cell.x, cell.y, cell.w, cell.h, 0, 0, G, G);
  const data = g.getImageData(0, 0, G, G).data;
  const alpha = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) alpha[i] = data[i * 4 + 3] / 255;

  // Chamfer distance to the outside, then normalised.
  const INF = 1e9;
  const dist = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) dist[i] = alpha[i] > 0.5 ? INF : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= G || y >= G ? 0 : dist[y * G + x]);
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const i = y * G + x;
      if (dist[i] === 0) continue;
      dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
  for (let y = G - 1; y >= 0; y--)
    for (let x = G - 1; x >= 0; x--) {
      const i = y * G + x;
      if (dist[i] === 0) continue;
      dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
    }
  let dmax = 0;
  let x0 = G;
  let y0 = G;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const d = dist[y * G + x];
      if (d <= 0) continue;
      dmax = Math.max(dmax, d);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  if (x1 < 0 || dmax < 1) return null;

  const sample = (arr: Float32Array, fx: number, fy: number): number => {
    const x = Math.min(G - 1.001, Math.max(0, fx * G - 0.5));
    const y = Math.min(G - 1.001, Math.max(0, fy * G - 0.5));
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = x - xi;
    const ty = y - yi;
    const a = arr[yi * G + xi];
    const b = arr[yi * G + xi + 1];
    const c = arr[(yi + 1) * G + xi];
    const d = arr[(yi + 1) * G + xi + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  // Grid over the piece's bounding box (one texel of margin), in cell fractions.
  const u0 = Math.max(0, (x0 - 1) / G);
  const v0 = Math.max(0, (y0 - 1) / G);
  const u1 = Math.min(1, (x1 + 2) / G);
  const v1 = Math.min(1, (y1 + 2) / G);
  const span = Math.max(u1 - u0, v1 - v0);
  // Photo sheets carry each piece's size relative to the sheet's median, so variety in the photo survives.
  const rel = Math.min(1.45, Math.max(0.65, cell.scale ?? 1));
  const m = (kind.size * rel) / span;
  const uc = (u0 + u1) / 2;
  const vc = (v0 + v1) / 2;
  const W = sh.image instanceof HTMLImageElement ? sh.image.naturalWidth : sh.image.width;
  const H = sh.image instanceof HTMLImageElement ? sh.image.naturalHeight : sh.image.height;

  const pos: number[] = [];
  const uv: number[] = [];
  const edge: number[] = [];
  const inside: boolean[] = [];
  const hull: number[] = [];
  let radius = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const fu = u0 + ((u1 - u0) * i) / N;
      const fv = v0 + ((v1 - v0) * j) / N;
      const a = sample(alpha, fu, fv);
      const dn = Math.min(1, sample(dist, fu, fv) / dmax);
      const x = (fu - uc) * m;
      const z = (fv - vc) * m;
      let h = a > 0.5 ? kind.thick * profile(kind, dn) : 0;
      if (kind.profile === 'leaf' && a > 0.5) h += 0.0018 * ((x * x + z * z) / ((kind.size / 2) ** 2));
      pos.push(x, h, z);
      uv.push((cell.x + fu * cell.w) / W, 1 - (cell.y + fv * cell.h) / H);
      edge.push(dn);
      inside.push(a > 0.3);
      if (a > 0.5) {
        radius = Math.max(radius, Math.hypot(x, z));
        if (i % 2 === 0 && j % 2 === 0) hull.push(x, Math.max(h, 0.0008), z, x, 0, z);
      }
    }
  }
  const index: number[] = [];
  const row = N + 1;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * row + i;
      const b = a + 1;
      const d = a + row;
      const c = d + 1;
      if (!(inside[a] || inside[b] || inside[c] || inside[d])) continue;
      index.push(a, d, b, b, d, c);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, hull: new Float32Array(hull), radius };
}

const assets = new Map<string, Promise<KindAssets>>();

export function loadKind(kind: Kind, base: string): Promise<KindAssets> {
  let p = assets.get(kind.id);
  if (!p) {
    p = sheet(sheetOf(kind.id), base).then((sh) => {
      const texture = sh.image instanceof HTMLCanvasElement ? new THREE.CanvasTexture(sh.image) : new THREE.Texture(sh.image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      const variants = sh.cells.map((_, i) => buildVariant(kind, sh, i)).filter((v): v is Variant => !!v);
      return { kind, sheet: sh, texture, variants };
    });
    assets.set(kind.id, p);
  }
  return p;
}

export type PieceUniforms = {
  uCook: { value: number };
  uTint: { value: THREE.Vector3 };
  uCurl: { value: number };
  uR2: { value: number };
  uGloss: { value: number };
  uCharAt: { value: number };
  uDissolve: { value: number };
  uWedge: { value: THREE.Vector3 };
  uPiece: { value: THREE.Matrix4 };
};

/** One material per piece (the cook state is per piece); all share one compiled program. */
export function pieceMaterial(a: KindAssets, v: Variant): { material: THREE.MeshStandardMaterial; uniforms: PieceUniforms } {
  const k = a.kind;
  const tint = k.cook.tint ?? [1, 1, 1];
  const uniforms: PieceUniforms = {
    uCook: { value: 0 },
    uTint: { value: new THREE.Vector3(...tint) },
    uCurl: { value: 0 },
    uR2: { value: Math.max(1e-6, v.radius * v.radius) },
    uGloss: { value: k.cook.gloss ?? 0 },
    uCharAt: { value: k.cook.charAt ?? 9 },
    uDissolve: { value: 0 },
    uWedge: { value: new THREE.Vector3() },
    uPiece: { value: new THREE.Matrix4() },
  };
  const glossy = ['bufala', 'burrata', 'olive', 'pomodorini', 'nduja'].includes(k.id);
  const material = new THREE.MeshStandardMaterial({
    map: a.texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: glossy ? 0.38 : k.profile === 'leaf' ? 0.55 : 0.62,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aEdge;
        uniform float uCurl, uR2;
        uniform mat4 uPiece;
        varying float vEdge;
        varying vec3 vPL;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y += uCurl * dot(position.xz, position.xz) / uR2;
        vEdge = aEdge;
        vPL = (uPiece * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uCook, uGloss, uCharAt, uDissolve;
        uniform vec3 uTint;
        varying float vEdge;
        varying vec3 vPL;
        ${GLSL_NOISE}
        ${GLSL_WEDGE}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (pzOutsideWedge(vPL.xz)) discard;
        if (uDissolve > 0.001 && pzNoise(vPL.xz * 900.0) * 0.8 + vEdge * 0.35 < uDissolve) discard;
        float ck = clamp(uCook, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), uTint, ck);
        float pzChar = smoothstep(uCharAt, uCharAt + 0.35, uCook) * (1.0 - smoothstep(0.0, 0.5, vEdge));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.05, 0.04), pzChar * 0.92);
        diffuseColor.rgb *= mix(1.0, 0.5, smoothstep(1.5, 2.1, uCook));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.2, uGloss * clamp(uCook, 0.0, 1.0));`,
      );
  };
  material.customProgramCacheKey = () => 'pizza-piece';
  return { material, uniforms };
}
