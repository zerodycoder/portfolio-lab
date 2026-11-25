import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching. The room is built from hundreds of small parts (tins, chair legs, plates, leaves, tiles…), and
 * each part is a draw call with its own uniform uploads: on a laptop that, not the GPU, is what makes the frames
 * uneven. Once a group is built, every mesh that never moves is merged with the others that look the same (same
 * material instance, or plain materials with identical settings) into one mesh per look.
 *
 * Left alone: anything marked `userData.keep` (animated, or looked up later), multi-material meshes, instanced
 * meshes, skinned/morphed meshes, and materials with custom shader code that aren't shared as one instance.
 */

const plainKey = (m: THREE.Material): string | null => {
  if (m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return null;
  const s = m as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial;
  if (!(s.isMeshStandardMaterial || (m as THREE.MeshBasicMaterial).isMeshBasicMaterial)) return null;
  const tex = (t: THREE.Texture | null | undefined): string => (t ? t.uuid : '-');
  return [
    m.type,
    (s.color as THREE.Color | undefined)?.getHexString(),
    s.roughness,
    s.metalness,
    (s.emissive as THREE.Color | undefined)?.getHexString(),
    s.emissiveIntensity,
    tex(s.map),
    tex(s.normalMap),
    tex(s.roughnessMap),
    tex(s.aoMap),
    tex(s.emissiveMap),
    tex(s.alphaMap),
    m.side,
    m.transparent,
    m.opacity,
    m.alphaTest,
    m.depthWrite,
    m.blending,
    s.clearcoat ?? 0,
    s.transmission ?? 0,
    s.wireframe,
    (m.clippingPlanes ?? []).length,
  ].join('|');
};

const attrKey = (g: THREE.BufferGeometry): string =>
  (g.index ? 'i' : 'n') + Object.keys(g.attributes).sort().join(',') + (g.morphAttributes && Object.keys(g.morphAttributes).length ? 'm' : '');

export function batchStatic(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[]; cast: boolean; receive: boolean }>();
  let before = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    before++;
    // A kept object keeps its whole subtree.
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.keep) return;
    if ((m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material) || !m.visible || !m.geometry || m.geometry.groups.length > 1) return;
    let vis = true;
    for (let p: THREE.Object3D | null = o.parent; p && p !== root; p = p.parent) if (!p.visible) vis = false;
    if (!vis || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return;
    const mat = m.material;
    const key = `${plainKey(mat) ?? `id:${mat.uuid}`}#${attrKey(m.geometry)}#${m.castShadow}${m.receiveShadow}#${m.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: mat, meshes: [], cast: m.castShadow, receive: m.receiveShadow }));
    b.meshes.push(m);
  });
  let removed = 0;
  let added = 0;
  buckets.forEach((b) => {
    if (b.meshes.length < 2) return;
    const geos = b.meshes.map((m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.name = 'batched';
    root.add(mesh);
    added++;
    b.meshes.forEach((m) => {
      m.removeFromParent();
      removed++;
    });
  });
  // Groups left empty can go too (fewer nodes to walk every frame).
  const empty: THREE.Object3D[] = [];
  root.traverse((o) => o !== root && !(o as THREE.Mesh).isMesh && !(o as THREE.Light).isLight && o.children.length === 0 && o.type === 'Group' && !o.userData.keep && empty.push(o));
  empty.forEach((o) => o.removeFromParent());
  return { before, after: before - removed + added };
}
