import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { colorTex, dataTex } from '../lib/canvas';
import { GLSL_NOISE } from '../pizza/surface';
import { majolica, mosaic, ovenFloor, sootBrick } from './textures';

/**
 * The forno a legna: a mosaic dome on a tiled podium, a stone arch around the mouth, a copper flue, and inside,
 * a soot-black brick vault, a pale stone floor and a fire of oak logs on the left. The flames are a shader
 * (domain-warped noise shaped into tongues, additive), the logs glow through their cracks, embers rise, and two
 * flickering lights carry the fire's colour onto the pizza and out into the room.
 */

export const OVEN = {
  /** Centre of the cooking floor. */
  floor: new THREE.Vector3(-1.55, 1.0, -1.72),
  innerR: 0.6,
  outerR: 0.8,
  mouthZ: -0.9,
  mouthW: 0.6,
  mouthH: 0.36,
};

/** Where a pizza sits to bake (pizza space origin), in front of the centre so the camera sees it whole. */
export const OVEN_SPOT = new THREE.Vector3(OVEN.floor.x + 0.06, OVEN.floor.y + 0.002, OVEN.floor.z + 0.08);

export type Oven = {
  group: THREE.Group;
  fire: { light: THREE.PointLight; spill: THREE.PointLight; flames: THREE.ShaderMaterial; boost: number; target: number };
  facade: THREE.Object3D;
  /** Hides the front of the oven (dome shell, arch, mouth vault) so the camera can look straight in. */
  setCutaway(on: boolean): void;
  update(dt: number, t: number): void;
};

const FLAME_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FLAME_FRAG = /* glsl */ `
  uniform float uTime, uBoost, uSeed;
  varying vec2 vUv;
  ${GLSL_NOISE}
  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.7 + uSeed * 13.0;
    // The tongue sways more the higher it reaches.
    float sway = (pzNoise(vec2(uv.y * 2.0 - t * 0.6, uSeed * 7.0)) - 0.5) * 0.4 * uv.y;
    vec2 p = vec2((uv.x - 0.5 - sway) * 2.0, uv.y);
    float width = mix(0.85, 0.06, pow(uv.y, 0.75));
    float body = (1.0 - smoothstep(width * 0.45, width, abs(p.x))) * smoothstep(0.0, 0.05, uv.y);
    // Noise rising through the body eats it away into licks.
    float n = pzFbm(vec2(p.x * 2.4 + uSeed, uv.y * 3.2 - t * 1.7));
    float f = clamp((body - (n * 0.75 + uv.y * 0.7) * (0.3 + 0.7 * uv.y)) * 2.4, 0.0, 1.0);
    vec3 col = mix(vec3(0.5, 0.04, 0.0), vec3(1.0, 0.42, 0.04), smoothstep(0.0, 0.45, f));
    col = mix(col, vec3(1.0, 0.82, 0.42), smoothstep(0.55, 1.0, f));
    gl_FragColor = vec4(col * f * (0.85 + 0.35 * uBoost), f);
  }
`;

function flamePlane(w: number, h: number, seed: number, mat: THREE.ShaderMaterial): THREE.Mesh {
  const m = mat.clone();
  m.uniforms = THREE.UniformsUtils.clone(mat.uniforms);
  m.uniforms.uSeed.value = seed;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.y = h / 2;
  return mesh;
}

export function buildOven(name: string): Oven {
  const group = new THREE.Group();
  group.name = 'oven';
  const { floor: F, innerR, outerR } = OVEN;

  // Podium: a tiled block the oven stands on.
  const tile = colorTex(majolica(), [1, 1]);
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  const podiumW = 1.95;
  const podiumD = OVEN.mouthZ + 0.32 + 2.5;
  const podiumGeo = new THREE.BoxGeometry(podiumW, F.y, podiumD);
  const uv = podiumGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (podiumW / 0.6), uv.getY(i) * (F.y / 0.6));
  const podium = new THREE.Mesh(podiumGeo, new THREE.MeshStandardMaterial({ map: tile, roughness: 0.25 }));
  podium.position.set(F.x, F.y / 2, -2.5 + podiumD / 2);
  podium.receiveShadow = true;
  group.add(podium);
  const ledge = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.05, 0.3, 2, 0.01), new THREE.MeshStandardMaterial({ color: '#e9e3d8', roughness: 0.3 }));
  ledge.position.set(F.x, F.y - 0.02, OVEN.mouthZ + 0.1);
  ledge.receiveShadow = true;
  group.add(ledge);

  // The mosaic dome.
  const m = mosaic(name);
  const domeTex = colorTex(m.color);
  domeTex.anisotropy = 16;
  const domeBump = dataTex(m.bump);
  const domeGeo = new THREE.SphereGeometry(outerR, 128, 40, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(
    domeGeo,
    new THREE.MeshStandardMaterial({ map: domeTex, bumpMap: domeBump, bumpScale: 1.2, roughness: 0.34, metalness: 0.3 }),
  );
  // The mouth's tunnel passes through the front of the dome: cut that box out of the dome's shell.
  const domeMat = dome.material as THREE.MeshStandardMaterial;
  domeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uMouth = { value: new THREE.Vector4(F.x, F.y + OVEN.mouthH + 0.02, OVEN.mouthW / 2 + 0.01, F.z + innerR * 0.5) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uMouth;\nvarying vec3 vW;')
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (abs(vW.x - uMouth.x) < uMouth.z && vW.y < uMouth.y && vW.z > uMouth.w) discard;',
      );
  };
  dome.scale.set(1, 0.72, 1);
  dome.position.copy(F);
  dome.castShadow = true;
  group.add(dome);

  // The mouth: a stone arch frame with the opening cut out, and a short vault through to the chamber.
  const archShape = (w: number, h: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2.6);
    s.quadraticCurveTo(w / 2, h, 0, h);
    s.quadraticCurveTo(-w / 2, h, -w / 2, h - w / 2.6);
    s.closePath();
    return s;
  };
  const frame = archShape(OVEN.mouthW + 0.16, OVEN.mouthH + 0.09);
  const hole = archShape(OVEN.mouthW, OVEN.mouthH);
  frame.holes.push(new THREE.Path(hole.getPoints(24)));
  const facadeGeo = new THREE.ExtrudeGeometry(frame, { depth: 0.1, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 20 });
  const facade = new THREE.Mesh(facadeGeo, new THREE.MeshStandardMaterial({ color: '#9b4a2e', roughness: 0.75 }));
  facade.position.set(F.x, F.y, OVEN.mouthZ - 0.1);
  facade.castShadow = true;
  facade.receiveShadow = true;
  group.add(facade);
  // Keystone and a little terracotta saint's tile above the mouth.
  const key = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.12, 0.04, 2, 0.01), new THREE.MeshStandardMaterial({ color: '#b6553a', roughness: 0.6 }));
  key.position.set(F.x, F.y + OVEN.mouthH + 0.06, OVEN.mouthZ + 0.012);
  void key;

  const brick = colorTex(sootBrick(), [12, 2.5]);
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const fireUniforms = { uFirePos: { value: new THREE.Vector3(F.x - 0.38, F.y + 0.1, F.z - 0.06) }, uGlow: { value: 1 } };
  const sootMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95, side: THREE.BackSide });
  sootMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, fireUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFirePos;\nuniform float uGlow;\nvarying vec3 vW;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float dF = distance(vW, uFirePos);
        totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * uGlow * (0.55 * exp(-dF * dF / 0.04) + 0.06 * exp(-dF * dF / 0.35));`,
      );
  };
  sootMat.customProgramCacheKey = () => 'oven-soot';
  const vault = new THREE.Mesh(new THREE.SphereGeometry(innerR, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), sootMat);
  vault.scale.set(1, 0.6, 1);
  vault.position.copy(F);
  group.add(vault);
  const tunnelGeo = new THREE.ExtrudeGeometry(hole, { depth: OVEN.mouthZ - (F.z + innerR * 0.92), bevelEnabled: false, curveSegments: 16 });
  // Only the tunnel's walls and vault are drawn (extrude group 1). Its end caps (group 0) would close the passage:
  // drawn from inside, the back cap reads as a lit wall right behind the arch, as if the oven's door were shut.
  const tunnel = new THREE.Mesh(tunnelGeo, [new THREE.MeshBasicMaterial({ visible: false }), sootMat]);
  tunnel.position.set(F.x, F.y, F.z + innerR * 0.92);
  group.add(tunnel);

  const floorTex = colorTex(ovenFloor());
  const chamberFloor = new THREE.Mesh(new THREE.CircleGeometry(innerR, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  chamberFloor.rotation.x = -Math.PI / 2;
  chamberFloor.position.set(F.x, F.y + 0.001, F.z);
  chamberFloor.receiveShadow = true;
  group.add(chamberFloor);
  const mouthFloor = new THREE.Mesh(new THREE.PlaneGeometry(OVEN.mouthW, OVEN.mouthZ - F.z), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  mouthFloor.rotation.x = -Math.PI / 2;
  mouthFloor.position.set(F.x, F.y + 0.0012, (OVEN.mouthZ + F.z) / 2);
  group.add(mouthFloor);

  // The flue above the mouth.
  const flue = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, 1.6, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: '#b87346', metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide }),
  );
  flue.position.set(F.x, F.y + 0.62 + 0.8 + 0.12, OVEN.mouthZ - 0.32);
  group.add(flue);

  // The fire: oak logs on the left, flames, embers, two lights.
  const fireGroup = new THREE.Group();
  fireGroup.position.copy(fireUniforms.uFirePos.value).setY(F.y);
  group.add(fireGroup);
  const logMat = new THREE.MeshStandardMaterial({ color: '#1a120d', roughness: 1, metalness: 0 });
  logMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    logMat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec3 vL;\n${GLSL_NOISE}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Charred wood: a net of thin glowing cracks that breathe.
        vec2 q = vec2(vL.y * 26.0 + vL.x * 9.0, (vL.x + vL.z) * 40.0);
        float n = pzFbm(q * 2.0);
        float crack = pow(1.0 - abs(n * 2.0 - 1.0), 26.0) * smoothstep(0.35, 0.7, pzNoise(q * 0.6 + 4.0));
        float breathe = 0.65 + 0.35 * sin(uTime * 2.3 + vL.y * 30.0 + n * 6.0);
        float ash = smoothstep(0.7, 0.85, pzNoise(q * 3.0 + 9.0));
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.5 + 0.5 * pzNoise(q * 9.0)), vec3(0.2, 0.19, 0.18), ash * 0.5);
        totalEmissiveRadiance += vec3(1.0, 0.3, 0.04) * crack * breathe * 2.2;`,
      );
  };
  // The ember bed under the logs.
  const bedMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  bedMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    bedMat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vB;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec2 vB;\n${GLSL_NOISE}`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float d = length(vB - 0.5) * 2.0;
        float n = pzFbm(vB * 22.0 + vec2(uTime * 0.15, 0.0));
        float glow = smoothstep(1.0, 0.2, d) * smoothstep(0.42, 0.75, n) * (0.7 + 0.3 * sin(uTime * 3.0 + n * 9.0));
        vec4 diffuseColor = vec4(vec3(1.0, 0.32, 0.05) * glow * 1.6, glow);`,
      );
  };
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.004;
  fireGroup.add(bed);
  for (const [x, z, ry, len, y] of [
    [-0.04, 0.04, 0.35, 0.3, 0.032],
    [0.02, -0.08, -0.45, 0.27, 0.03],
    [-0.03, -0.02, 1.35, 0.25, 0.085],
  ]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, len, 14), logMat);
    log.rotation.set(Math.PI / 2, 0, ry);
    log.position.set(x, y, z);
    fireGroup.add(log);
  }
  const flameBase = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBoost: { value: 1 }, uSeed: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const flames: THREE.Mesh[] = [];
  // Several tongues of different heights, crossed so they read from any side.
  for (let i = 0; i < 7; i++) {
    const h = 0.22 + ((i * 37) % 11) / 11 * 0.16;
    const f = flamePlane(0.16 + (i % 3) * 0.03, h, i * 0.37, flameBase);
    f.rotation.y = (i / 7) * Math.PI * 2;
    f.position.set(Math.cos(i * 2.1) * 0.06, h / 2 + 0.03, Math.sin(i * 2.1) * 0.07);
    f.userData.h = h;
    fireGroup.add(f);
    flames.push(f);
  }
  const flamesMat = flames[0].material as THREE.ShaderMaterial;

  const N = 60;
  const ember = new Float32Array(N * 3);
  const life = new Float32Array(N);
  for (let i = 0; i < N; i++) life[i] = Math.random();
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(ember, 3));
  const embers = new THREE.Points(
    emberGeo,
    new THREE.PointsMaterial({ color: '#ffb35a', size: 0.01, map: emberSprite(), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  fireGroup.add(embers);

  const light = new THREE.PointLight('#ff8a3a', 1.1, 2.4, 2);
  light.position.set(0.06, 0.24, 0.02);
  fireGroup.add(light);
  const spill = new THREE.PointLight('#ff9a4a', 0.9, 4.5, 1.6);
  spill.position.set(F.x, F.y + 0.25, OVEN.mouthZ + 0.25);
  group.add(spill);

  const fire = { light, spill, flames: flamesMat, boost: 1, target: 1 };
  const update = (dt: number, t: number): void => {
    fire.boost += (fire.target - fire.boost) * Math.min(1, dt * 3);
    const flick = 0.82 + 0.18 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1) + 0.08 * Math.sin(t * 29.0);
    light.intensity = 1.1 * flick * fire.boost;
    spill.intensity = 0.9 * flick * (0.7 + 0.3 * fire.boost);
    fireUniforms.uGlow.value = flick * fire.boost;
    flames.forEach((f) => {
      const u = (f.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = t;
      u.uBoost.value = fire.boost;
      f.scale.y = 0.85 + 0.45 * (fire.boost - 1) + 0.08 * Math.sin(t * 5 + f.id);
      f.position.y = (f.userData.h as number) * f.scale.y * 0.5 + 0.03;
    });
    for (const m of [logMat, bedMat]) {
      const sh = m.userData.shader as { uniforms: { uTime: { value: number } } } | undefined;
      if (sh) sh.uniforms.uTime.value = t;
    }
    for (let i = 0; i < N; i++) {
      life[i] += dt * (0.35 + (i % 5) * 0.08) * fire.boost;
      if (life[i] > 1) life[i] -= 1;
      const l = life[i];
      const a = i * 2.39996;
      ember[i * 3] = Math.cos(a) * 0.12 * (1 - l) + Math.sin(t * 2 + i) * 0.02 * l;
      ember[i * 3 + 1] = 0.05 + l * 0.34;
      ember[i * 3 + 2] = Math.sin(a) * 0.1 * (1 - l);
    }
    (emberGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  };

  const front = [dome, facade, tunnel, mouthFloor];
  const setCutaway = (on: boolean): void => front.forEach((o) => (o.visible = !on));
  return { group, fire, facade, setCutaway, update };
}

function emberSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,200,120,0.8)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** The tools: the big wooden peel that carries the pizza and the small round turning peel (palino). */
export function buildPeels(): { peel: THREE.Group; palino: THREE.Group } {
  const wood = new THREE.MeshStandardMaterial({ color: '#c79a62', roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.9, roughness: 0.3 });
  const peel = new THREE.Group();
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.19, 0);
  bladeShape.lineTo(0.19, 0);
  bladeShape.quadraticCurveTo(0.21, 0.36, 0, 0.4);
  bladeShape.quadraticCurveTo(-0.21, 0.36, -0.19, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002 }), wood);
  blade.rotation.x = -Math.PI / 2;
  blade.position.z = 0.2;
  blade.castShadow = true;
  peel.add(blade);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.1, 10), wood);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.005, 0.2 + 0.55);
  handle.castShadow = true;
  peel.add(handle);
  // The blade's centre is the group's origin offset: pizza centre sits at (0, 0.01, 0).
  peel.children.forEach((c) => (c.position.z -= 0.4));

  const palino = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.004, 32), steel);
  palino.add(disc);
  const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 8), steel);
  ph.rotation.x = Math.PI / 2;
  ph.position.set(0, 0.01, 0.8);
  palino.add(ph);
  return { peel, palino };
}
