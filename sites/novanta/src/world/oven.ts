import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { colorTex, dataTex } from '../lib/canvas';
import { GLSL_NOISE } from '../pizza/surface';
import { boxUV, pbr, pbrSet } from './pbr';
import { majolica, mosaic, ovenFloor } from './textures';

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
  uniform float uTime, uBoost, uSeed, uGain;
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
    vec3 col = mix(vec3(0.55, 0.05, 0.0), vec3(1.0, 0.36, 0.03), smoothstep(0.0, 0.5, f));
    col = mix(col, vec3(1.0, 0.7, 0.28), smoothstep(0.7, 1.0, f) * (1.0 - uv.y));
    // Seven tongues overlap additively: each one stays dim so their sum reads orange, not white.
    gl_FragColor = vec4(col * f * (0.42 + 0.2 * uBoost) * uGain, f);
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

export async function buildOven(name: string, base: string): Promise<Oven> {
  const group = new THREE.Group();
  group.name = 'oven';
  const { floor: F, innerR, outerR } = OVEN;

  // Podium: a brick block the oven stands on (scanned red brick), and the vestibule in the same brick.
  const [brickMat, sootSet, clayMat] = await Promise.all([
    pbr(base, 'brick', { color: '#e6c4b4' }),
    pbrSet(base, 'soot'),
    pbr(base, 'clay', { color: '#d8c0a8' }),
  ]);
  const podiumW = 1.95;
  const podiumD = OVEN.mouthZ + 0.32 + 2.5;
  const podiumGeo = boxUV(podiumW, F.y, podiumD, 1.0);
  const podium = new THREE.Mesh(podiumGeo, brickMat);
  podium.position.set(F.x, F.y / 2, -2.5 + podiumD / 2);
  podium.receiveShadow = true;
  group.add(podium);
  // A band of majolica just under the cooking floor.
  const tile = colorTex(majolica(), [1, 1]);
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  const bandGeo = boxUV(podiumW + 0.01, 0.15, podiumD + 0.01, 0.6);
  const band = new THREE.Mesh(bandGeo, new THREE.MeshPhysicalMaterial({ map: tile, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
  band.position.set(F.x, F.y - 0.1, -2.5 + podiumD / 2);
  group.add(band);
  const ledge = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.05, 0.3, 2, 0.01), new THREE.MeshPhysicalMaterial({ color: '#e9e3d8', roughness: 0.3, clearcoat: 0.4 }));
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
    sh.uniforms.uMouth = { value: new THREE.Vector4(F.x, F.y + OVEN.mouthH + 0.02, OVEN.mouthW / 2 + 0.01, F.z + innerR * 0.92 - 0.01) };
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
  // The vestibule: a solid brick block, arch-fronted, from the mouth back into the chamber. Its sides fill the cut
  // in the dome, so from any angle the mouth reads as a passage into the fire, never as a hole in a shell.
  const vestBack = F.z + innerR * 0.92;
  const vestDepth = OVEN.mouthZ - vestBack;
  const frame = archShape(OVEN.mouthW + 0.16, OVEN.mouthH + 0.09);
  const hole = archShape(OVEN.mouthW, OVEN.mouthH);
  frame.holes.push(new THREE.Path(hole.getPoints(24)));
  const facadeGeo = new THREE.ExtrudeGeometry(frame, { depth: vestDepth - 0.01, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 20 });
  // Extrude UVs are in metres: rescale them to the brick's repeat.
  const fuv = facadeGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) / 1.0, fuv.getY(i) / 1.0);
  const facade = new THREE.Mesh(facadeGeo, brickMat);
  facade.position.set(F.x, F.y, vestBack);
  facade.castShadow = true;
  facade.receiveShadow = true;
  group.add(facade);
  // Keystone and a little terracotta saint's tile above the mouth.
  const key = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.12, 0.04, 2, 0.01), new THREE.MeshStandardMaterial({ color: '#b6553a', roughness: 0.6 }));
  key.position.set(F.x, F.y + OVEN.mouthH + 0.06, OVEN.mouthZ + 0.012);
  void key;


  // The fire burns against the back-left wall, where it can be seen through the mouth.
  const fireUniforms = { uFirePos: { value: new THREE.Vector3(F.x - 0.3, F.y + 0.1, F.z - 0.3) }, uGlow: { value: 1 }, uTime: { value: 0 }, uCeil: { value: F.y } };
  const sootMat = new THREE.MeshStandardMaterial({ map: sootSet.map, normalMap: sootSet.normalMap, roughnessMap: sootSet.arm, aoMap: sootSet.arm, roughness: 1, side: THREE.BackSide });
  sootMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, fireUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uFirePos;\nuniform float uGlow, uTime, uCeil;\nvarying vec3 vW;\n${GLSL_NOISE}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float dF = distance(vW, uFirePos);
        // The whole vault glows; hottest by the fire, and the flame rolls along the ceiling in licks.
        // Soot: the bricks are near black; what you see is the fire's light on them.
        diffuseColor.rgb *= 0.14;
        float glow = 1.3 * exp(-dF * dF / 0.06) + 0.35 * exp(-dF * dF / 0.5) + 0.08;
        float high = smoothstep(uCeil + 0.06, uCeil + 0.3, vW.y);
        float lick = smoothstep(0.4, 0.8, pzFbm(vW.xz * 6.0 + vec2(uTime * 1.1, uTime * 0.5))) * high * exp(-dF * dF / 0.9);
        totalEmissiveRadiance += vec3(1.0, 0.34, 0.07) * uGlow * glow + vec3(1.0, 0.52, 0.14) * lick * 2.2 * uGlow;`,
      );
  };
  sootMat.customProgramCacheKey = () => 'oven-soot';
  const vaultGeo = new THREE.SphereGeometry(innerR, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const vuv = vaultGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < vuv.count; i++) vuv.setXY(i, vuv.getX(i) * 4, vuv.getY(i) * 1.2);
  const vault = new THREE.Mesh(vaultGeo, sootMat);
  vault.scale.set(1, 0.6, 1);
  vault.position.copy(F);
  group.add(vault);
  const tunnelGeo = new THREE.ExtrudeGeometry(archShape(OVEN.mouthW - 0.008, OVEN.mouthH - 0.004), { depth: vestDepth + 0.005, bevelEnabled: false, curveSegments: 16 });
  // Only the tunnel's walls and vault are drawn (extrude group 1). Its end caps (group 0) would close the passage:
  // drawn from inside, the back cap reads as a lit wall right behind the arch, as if the oven's door were shut.
  const tunnel = new THREE.Mesh(tunnelGeo, [new THREE.MeshBasicMaterial({ visible: false }), sootMat]);
  tunnel.position.set(F.x, F.y, vestBack - 0.004);
  group.add(tunnel);

  const floorTex = colorTex(ovenFloor());
  const floorMat = clayMat;
  void floorTex;
  floorMat.onBeforeCompile = (sh) => {
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
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.45, 0.15) * uGlow * (0.9 * exp(-dF * dF / 0.08) + 0.12);`,
      );
  };
  floorMat.customProgramCacheKey = () => 'oven-floor';
  const chamberFloor = new THREE.Mesh(new THREE.CircleGeometry(innerR, 64), floorMat);
  chamberFloor.rotation.x = -Math.PI / 2;
  chamberFloor.position.set(F.x, F.y + 0.001, F.z);
  chamberFloor.receiveShadow = true;
  group.add(chamberFloor);
  const mouthFloor = new THREE.Mesh(new THREE.PlaneGeometry(OVEN.mouthW, OVEN.mouthZ - F.z), floorMat);
  mouthFloor.rotation.x = -Math.PI / 2;
  mouthFloor.position.set(F.x, F.y + 0.0012, (OVEN.mouthZ + F.z) / 2);
  group.add(mouthFloor);

  // The chimney rises straight off the vestibule, just behind the arch, as on a real Neapolitan oven: a brick
  // collar, then a copper flue to the ceiling.
  const archTop = F.y + OVEN.mouthH + 0.09;
  const flueZ = (OVEN.mouthZ + vestBack) / 2;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.1, 32), facade.material as THREE.Material);
  collar.position.set(F.x, archTop + 0.04, flueZ);
  collar.castShadow = true;
  group.add(collar);
  const copper = new THREE.MeshStandardMaterial({ color: '#b87346', metalness: 0.9, roughness: 0.3 });
  const flueY0 = archTop + 0.08;
  const flueLen = 3.1 - flueY0;
  const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, flueLen, 32, 1, true), copper);
  flue.position.set(F.x, flueY0 + flueLen / 2, flueZ);
  flue.castShadow = true;
  group.add(flue);
  // Bands where the sections join, and a collar at the ceiling.
  for (const y of [flueY0 + 0.02, flueY0 + flueLen * 0.45, 3.1 - 0.05]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.03, 32), copper);
    band.position.set(F.x, y, flueZ);
    group.add(band);
  }

  // The fire: oak logs on the left, flames, embers, two lights.
  const fireGroup = new THREE.Group();
  fireGroup.position.copy(fireUniforms.uFirePos.value).setY(F.y);
  group.add(fireGroup);
  const logMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1, metalness: 0 });
  const capMat = new THREE.MeshStandardMaterial({ map: ringsTexture(), emissive: '#ff6a20', emissiveMap: ringsTexture(), emissiveIntensity: 0.6, roughness: 0.95 });
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
        // Charred wood: thin ember cracks that breathe, mostly on the side facing the fire's heart.
        vec2 q = vec2(vL.y * 30.0, atan(vL.x, vL.z) * 3.0);
        float n = pzFbm(q * 1.6);
        float crack = pow(1.0 - abs(n * 2.0 - 1.0), 30.0) * smoothstep(0.45, 0.75, pzNoise(q * 0.5 + 4.0));
        float breathe = 0.6 + 0.4 * sin(uTime * 2.1 + vL.y * 25.0 + n * 6.0);
        totalEmissiveRadiance += vec3(1.0, 0.32, 0.05) * crack * breathe * 1.6;`,
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
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, len, 16), [logMat, capMat, capMat]);
    log.rotation.set(Math.PI / 2, 0, ry);
    log.position.set(x, y, z);
    fireGroup.add(log);
  }
  const flameBase = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBoost: { value: 1 }, uSeed: { value: 0 }, uGain: { value: 1 } },
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
  // Tongues of the fire curling round towards the mouth, just inside the vestibule: what a visitor sees of the
  // fire from the room. They step aside (hide) when the camera goes inside the oven.
  const mouthFlames: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const h = 0.16 + (i % 2) * 0.08;
    const f = flamePlane(0.13, h, 3 + i * 0.61, flameBase);
    f.position.set(F.x - 0.19 + i * 0.045, F.y + h / 2, vestBack + 0.07 - i * 0.025);
    f.rotation.y = 0.35 - i * 0.12;
    f.userData.h = h;
    // Seen against the glowing chamber, these need more light to read as flame.
    (f.material as THREE.ShaderMaterial).uniforms.uGain.value = 1.7;
    group.add(f);
    mouthFlames.push(f);
    flames.push(f);
  }

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
    fireUniforms.uTime.value = t;
    flames.forEach((f) => {
      const u = (f.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = t;
      u.uBoost.value = fire.boost;
      f.scale.y = 0.85 + 0.45 * (fire.boost - 1) + 0.08 * Math.sin(t * 5 + f.id);
      f.position.y = (f.parent === fireGroup ? 0.03 : F.y) + (f.userData.h as number) * f.scale.y * 0.5;
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

  const front: THREE.Object3D[] = [dome, facade, tunnel, mouthFloor, collar, ...mouthFlames];
  const setCutaway = (on: boolean): void => front.forEach((o) => (o.visible = !on));
  return { group, fire, facade, setCutaway, update };
}

/** Oak bark, charred: deep vertical fissures (the log's length runs along v). */
function barkTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c1410';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 256;
    const w = 2 + Math.random() * 6;
    g.fillStyle = `rgba(${50 + Math.random() * 30},${36 + Math.random() * 20},${26 + Math.random() * 14},0.9)`;
    g.fillRect(x, 0, w, 512);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(8,5,4,${0.4 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 10 + Math.random() * 60);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(150,140,130,${Math.random() * 0.25})`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 4 + Math.random() * 18, 3 + Math.random() * 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The cut end of a log: growth rings, charred at the edge, an ember glow at the heart. */
function ringsTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a1a10';
  g.fillRect(0, 0, 128, 128);
  for (let r = 60; r > 2; r -= 4 + Math.random() * 3) {
    g.strokeStyle = `rgba(${90 + (60 - r)},${55 + (60 - r) * 0.5},${30},0.8)`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(64 + Math.random() * 2, 64 + Math.random() * 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  const ember = g.createRadialGradient(64, 64, 0, 64, 64, 40);
  ember.addColorStop(0, 'rgba(255,120,30,0.9)');
  ember.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = ember;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(10,6,4,0.95)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  // The blade is centred on the group origin, where the pizza sits; the handle runs off towards +z.

  const palino = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#7d8287', metalness: 0.85, roughness: 0.45 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.002, 32), dark);
  palino.add(disc);
  const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.4, 8), dark);
  ph.rotation.x = Math.PI / 2 - 0.12;
  ph.position.set(0, 0.085, 0.76);
  palino.add(ph);
  return { peel, palino };
}
