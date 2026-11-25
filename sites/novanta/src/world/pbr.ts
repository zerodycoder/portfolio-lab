import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { mediaUrl } from '../lib/quality';

/**
 * Photo-scanned PBR materials (CC0, from Poly Haven; fetched by tools/fetch-novanta-pbr.mjs): colour, OpenGL
 * normal and a packed AO/roughness/metalness map per surface. Textures repeat; geometry UVs are laid out in
 * "repeats" so every surface keeps the material's real-world scale.
 */

export type PbrName = 'stucco' | 'floor' | 'brick' | 'soot' | 'beam' | 'ceiling' | 'wood' | 'oldplaster' | 'basalt' | 'shutter' | 'clay';

export type PbrSet = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture };

const loader = new THREE.TextureLoader();
const cache = new Map<PbrName, Promise<PbrSet>>();

function tex(url: string, srgb: boolean): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

export function pbrSet(base: string, name: PbrName): Promise<PbrSet> {
  let p = cache.get(name);
  if (!p) {
    const dir = mediaUrl(base, `pbr/${name}`);
    p = Promise.all([tex(`${dir}/diff.webp`, true), tex(`${dir}/nor.webp`, false), tex(`${dir}/arm.webp`, false)]).then(([map, normalMap, arm]) => ({ map, normalMap, arm }));
    cache.set(name, p);
  }
  return p;
}

/** A standard material dressed in one of the scanned sets. */
export async function pbr(base: string, name: PbrName, opts: THREE.MeshStandardMaterialParameters & { normal?: number } = {}): Promise<THREE.MeshStandardMaterial> {
  const s = await pbrSet(base, name);
  const { normal = 1, ...rest } = opts;
  return new THREE.MeshStandardMaterial({
    map: s.map,
    normalMap: s.normalMap,
    normalScale: new THREE.Vector2(normal, normal),
    aoMap: s.arm,
    aoMapIntensity: 1,
    roughnessMap: s.arm,
    metalnessMap: s.arm,
    roughness: 1,
    metalness: 1,
    ...rest,
  });
}

/** The HDR environment (a warm, fire-lit room) for reflections and soft fill light. */
export async function loadEnv(renderer: THREE.WebGLRenderer, base: string): Promise<THREE.Texture | null> {
  try {
    const hdr = await new HDRLoader().loadAsync(mediaUrl(base, 'pbr/env.hdr'));
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
    return env;
  } catch {
    return null;
  }
}

/** Box geometry whose UVs are in repeats of `metres` (so a scanned texture keeps its scale on every face). */
export function boxUV(w: number, h: number, d: number, metres: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry faces: +x, -x (d × h), +y, -y (w × d), +z, -z (w × h); 4 vertices each.
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * faces[f][0]) / metres, (uv.getY(k) * faces[f][1]) / metres);
    }
  return g;
}
