import * as THREE from 'three';
import { TEX_HALF } from './dough';

/**
 * The pizza's surface material: a MeshStandardMaterial whose albedo and roughness are composed per pixel from the
 * dough, the painted sauce, the melted cheese, the drizzles and the bake. The bake is a heat field accumulated by
 * the oven model (see bake.ts): the shader turns heat into the Maillard browning ramp, chars it at the top end, and
 * adds the leopard spots and blisters the bake drew into their own mask.
 *
 * Back faces render as crumb, so wherever a slice is cut away the inside of the dough reads as a cut face.
 * A wedge uniform keeps or removes an angular sector (a slice lifted away from the rest of the pizza).
 */

export type SurfaceMaps = {
  dough: THREE.Texture;
  sauce: THREE.Texture;
  cheese: THREE.Texture;
  layer: THREE.Texture;
  melt: THREE.Texture;
  drizzle: THREE.Texture;
  spots: THREE.Texture;
  heat: THREE.Texture;
};

export type SurfaceUniforms = {
  uTime: { value: number };
  uBubbling: { value: number };
  uFlour: { value: number };
  uCutCount: { value: number };
  uCuts: { value: number[] };
  uWedge: { value: THREE.Vector3 };
  uRepeat: { value: number };
};

export const GLSL_NOISE = /* glsl */ `
  float pzHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float pzNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = pzHash(i), b = pzHash(i + vec2(1.0, 0.0)), c = pzHash(i + vec2(0.0, 1.0)), d = pzHash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float pzFbm(vec2 p) { return 0.55 * pzNoise(p) + 0.3 * pzNoise(p * 2.07 + 3.1) + 0.15 * pzNoise(p * 4.13 + 7.7); }
`;

export const GLSL_WEDGE = /* glsl */ `
  uniform vec3 uWedge;
  bool pzOutsideWedge(vec2 xz) {
    if (abs(uWedge.z) < 0.5) return false;
    float a = atan(xz.y, xz.x);
    float d = mod(a - uWedge.x + 12.566370614, 6.283185307);
    bool inside = d < uWedge.y;
    return uWedge.z > 0.5 ? !inside : inside;
  }
`;

export function createSurface(maps: SurfaceMaps): { material: THREE.MeshStandardMaterial; uniforms: SurfaceUniforms } {
  const uniforms: SurfaceUniforms = {
    uTime: { value: 0 },
    uBubbling: { value: 0 },
    uFlour: { value: 1 },
    uCutCount: { value: 0 },
    uCuts: { value: new Array(8).fill(0) },
    uWedge: { value: new THREE.Vector3(0, 0, 0) },
    uRepeat: { value: 2.2 },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      tDough: { value: maps.dough },
      tSauce: { value: maps.sauce },
      tCheese: { value: maps.cheese },
      tLayer: { value: maps.layer },
      tMelt: { value: maps.melt },
      tDrizzle: { value: maps.drizzle },
      tSpots: { value: maps.spots },
      tHeat: { value: maps.heat },
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aZone;
        varying vec2 vP;
        varying vec2 vZone;
        varying vec3 vLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vP = vec2(0.5 + position.x / ${(2 * TEX_HALF).toFixed(3)}, 0.5 - position.z / ${(2 * TEX_HALF).toFixed(3)});
        vZone = aZone;
        vLocal = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDough, tSauce, tCheese, tLayer, tMelt, tDrizzle, tSpots, tHeat;
        uniform float uTime, uBubbling, uFlour, uCutCount, uRepeat;
        uniform float uCuts[8];
        varying vec2 vP;
        varying vec2 vZone;
        varying vec3 vLocal;
        ${GLSL_NOISE}
        ${GLSL_WEDGE}
        // Two samples, rotated and offset, blended by noise: hides the repeat of a non-seamless photo tile.
        vec3 pzTex(sampler2D t, vec2 p, float k) {
          vec3 a = texture2D(t, p * k).rgb;
          vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * k * 0.83 + vec2(0.37, 0.71);
          vec3 b = texture2D(t, q).rgb;
          return mix(a, b, smoothstep(0.35, 0.65, pzNoise(p * 7.0)));
        }
        vec3 pzBake(float h) {
          vec3 raw = vec3(0.94, 0.88, 0.77);
          vec3 golden = vec3(0.95, 0.74, 0.42);
          vec3 brown = vec3(0.76, 0.47, 0.22);
          vec3 dark = vec3(0.42, 0.23, 0.11);
          vec3 burnt = vec3(0.07, 0.05, 0.04);
          vec3 c = mix(raw, golden, smoothstep(0.05, 0.5, h));
          c = mix(c, brown, smoothstep(0.5, 0.95, h));
          c = mix(c, dark, smoothstep(0.95, 1.35, h));
          return mix(c, burnt, smoothstep(1.4, 1.8, h));
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        if (pzOutsideWedge(vLocal.xz)) discard;
        vec2 P = vP;
        float rim = vZone.x;
        float bottom = vZone.y;
        float n1 = pzFbm(vLocal.xz * 95.0 + vLocal.y * 160.0);
        float n2 = pzFbm(vLocal.xz * 310.0 + vLocal.y * 420.0 + 7.0);
        float heat = texture2D(tHeat, P).r * 2.0;
        float hCrust = heat * mix(0.88 + 0.42 * rim, 1.12, bottom) + (n1 - 0.5) * 0.42 * smoothstep(0.08, 0.7, heat);
        vec3 dough = pzTex(tDough, P, uRepeat);
        vec3 col = dough * pzBake(hCrust) / vec3(0.94, 0.88, 0.77);
        float pzRough = 0.84;
        float rawness = 1.0 - smoothstep(0.15, 0.7, heat);
        col = mix(col, vec3(0.98, 0.96, 0.92), uFlour * rawness * smoothstep(0.62, 0.82, n2) * (0.35 + 0.5 * rim + 0.4 * bottom));

        vec4 sp = texture2D(tSpots, P);
        col = mix(col, vec3(0.055, 0.04, 0.032), sp.r * (0.7 + 0.3 * n2));
        col = mix(col, col * 1.12 + vec3(0.05, 0.035, 0.0), sp.g * 0.7 * (1.0 - sp.r));

        float topMask = (1.0 - bottom) * (1.0 - smoothstep(0.0, 0.3, rim));
        vec4 layer = texture2D(tLayer, P);
        float sauce = smoothstep(0.3, 0.6, layer.r + (n1 - 0.5) * 0.34) * topMask;
        vec3 sauceCol = pzTex(tSauce, P, uRepeat * 1.25);
        sauceCol *= mix(vec3(0.9, 0.86, 0.86), vec3(0.66, 0.46, 0.4), smoothstep(0.35, 1.3, heat));
        sauceCol = mix(sauceCol, col, (1.0 - smoothstep(0.3, 0.62, layer.r)) * 0.35);
        col = mix(col, sauceCol, sauce);
        pzRough = mix(pzRough, mix(0.36, 0.62, smoothstep(0.3, 1.2, heat)), sauce);
        float oil = smoothstep(0.2, 0.6, layer.g) * topMask;
        col = mix(col, col * vec3(1.03, 0.95, 0.7), oil * 0.55);
        pzRough = mix(pzRough, 0.24, oil * 0.8);

        vec4 melt = texture2D(tMelt, P);
        float nC = pzFbm(vLocal.xz * 38.0 + 3.0);
        float cheese = smoothstep(0.3, 0.55, melt.r + (nC - 0.5) * 0.55 + (n1 - 0.5) * 0.15) * (1.0 - bottom);
        vec3 cheeseCol = pzTex(tCheese, P, uRepeat * 1.45) * vec3(1.0, 0.97, 0.9);
        // Thin edges of a pool let the sauce blush through; hot spots blister golden.
        cheeseCol = mix(cheeseCol, cheeseCol * vec3(1.0, 0.82, 0.72), (1.0 - smoothstep(0.4, 0.8, melt.r)) * 0.5);
        float blist = smoothstep(0.52, 0.8, n2 + (heat - 0.9) * 0.8) * smoothstep(0.6, 1.05, heat);
        cheeseCol = mix(cheeseCol, vec3(0.83, 0.58, 0.28), blist * 0.9);
        cheeseCol = mix(cheeseCol, vec3(0.2, 0.12, 0.06), smoothstep(1.55, 1.95, heat + (n2 - 0.5) * 0.4));
        float bub = 0.0;
        if (uBubbling > 0.0) {
          vec2 q = vLocal.xz * 170.0;
          float b = pzNoise(q + vec2(0.0, uTime * 1.4)) * pzNoise(q * 0.7 - vec2(uTime * 0.9, 0.0));
          bub = smoothstep(0.5, 0.72, b) * uBubbling;
        }
        col = mix(col, cheeseCol + bub * 0.14, cheese);
        pzRough = mix(pzRough, 0.3 - bub * 0.16, cheese);
        float nduja = smoothstep(0.28, 0.6, melt.g + (n1 - 0.5) * 0.3) * (1.0 - bottom);
        col = mix(col, vec3(0.7, 0.17, 0.06) * (0.85 + 0.3 * n2), nduja * 0.92);
        pzRough = mix(pzRough, 0.28, nduja);
        float spill = melt.b * (1.0 - bottom);
        col = mix(col, col * vec3(1.12, 0.72, 0.4), spill * 0.5);
        pzRough = mix(pzRough, 0.18, spill);

        vec4 dz = texture2D(tDrizzle, P);
        // Contact shadows under the toppings (painted when they settle): grounds them on the pizza.
        col *= 1.0 - dz.b * 0.42 * (1.0 - bottom);
        col = mix(col, vec3(0.8, 0.46, 0.1), dz.r * 0.85);
        pzRough = mix(pzRough, 0.1, dz.r);
        col = mix(col, col * vec3(1.06, 1.0, 0.68), dz.g * 0.55);
        pzRough = mix(pzRough, 0.12, dz.g);

        for (int i = 0; i < 8; i++) {
          if (float(i) >= uCutCount) break;
          float a = uCuts[i];
          float d = abs(vLocal.x * sin(a) - vLocal.z * cos(a));
          col *= mix(0.5, 1.0, smoothstep(0.0005, 0.0017, d));
        }

        if (!gl_FrontFacing) {
          float holes = smoothstep(0.52, 0.72, pzFbm(vec2(length(vLocal.xz), vLocal.y) * 700.0 + atan(vLocal.z, vLocal.x) * 40.0));
          col = mix(vec3(0.95, 0.88, 0.74), vec3(0.78, 0.64, 0.46), holes);
          col = mix(col, col * 0.8, 1.0 - smoothstep(0.0, 0.004, vLocal.y));
          pzRough = 0.92;
        }
        diffuseColor.rgb *= col;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = pzRough;`,
      );
  };
  material.customProgramCacheKey = () => 'pizza-surface';
  return { material, uniforms };
}
