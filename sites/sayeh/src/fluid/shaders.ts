/**
 * GLSL for the latte-art simulation: a 2D incompressible fluid (stable fluids, Jos Stam 1999) inside a round cup.
 *
 * The domain is the cup's bounding square in uv space; the liquid is the disk of radius 0.5 around (0.5, 0.5).
 * Walls: velocity is reflected at the rim (no flow through the ceramic) and pressure uses a Neumann boundary.
 * Velocity is in uv units per second. Pouring is modelled as a mass source: the pour point adds divergence,
 * which the pressure solve turns into an outward flow, so poured milk really spreads instead of being "painted".
 */

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
`;

export const VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec2 uTexel;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const COMMON = /* glsl */ `
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
// 1 inside the liquid, 0 in the ceramic. The tiny margin keeps the rim cell itself fluid.
float inside(vec2 uv) { return step(length(uv - 0.5), 0.496); }
`;

/** Adds a Gaussian of `uValue` around `uPoint` (velocity impulses). */
export const SPLAT = `${HEADER}${COMMON}
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  float g = exp(-dot(p, p) / uRadius);
  vec4 base = texture(uTarget, vUv);
  outColor = vec4(base.xyz + g * uValue, 1.0) * inside(vUv);
}
`;

/**
 * Milk going into the cup: saturates at 1 (the surface can't get whiter than foam). The green channel tags the
 * milk with the pour it came from (`uGen`), so the display can draw the thin crema line where two pours meet,
 * the line that separates the layers of a tulip.
 */
export const MILK = `${HEADER}${COMMON}
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform float uAmount;
uniform float uRadius;
uniform float uGen;
void main() {
  vec2 p = vUv - uPoint;
  float w = exp(-dot(p, p) / uRadius);
  float g = w * uAmount;
  vec4 base = texture(uTarget, vUv);
  if (uAmount < 0.0) {
    // Negative amounts draw crema back into the foam (an etching pen's line).
    outColor = vec4(base.r * (1.0 + g), base.gba);
    return;
  }
  float add = (1.0 - base.r) * clamp(g, 0.0, 1.0);
  float m = base.r + add;
  float own = clamp(exp(-dot(p, p) / (uRadius * 0.6)) * 4.0, 0.0, 1.0);
  float gen = base.r < 0.05 ? uGen : mix(base.g, uGen, own);
  outColor = vec4(m, gen, base.ba);
}
`;

/** Semi-Lagrangian advection, with a decay rate. `uMask` > 0 zeroes whatever lands outside the disk. */
export const ADVECT = `${HEADER}${COMMON}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
uniform float uMask;
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy;
  vec4 r = texture(uSource, coord) / (1.0 + uDissipation * uDt);
  outColor = mix(r, r * inside(vUv), uMask);
}
`;

/**
 * Divergence of the velocity, minus the pour's mass sources (and a uniform sink over the disk that balances them,
 * so the Neumann problem stays solvable). Neighbours in the ceramic reflect the centre velocity.
 */
export const DIVERGENCE = `${HEADER}${COMMON}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform vec3 uSrc;
uniform float uSrcRadius;
uniform float uSink;
void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  float L = inside(vL) > 0.5 ? texture(uVelocity, vL).x : -C.x;
  float R = inside(vR) > 0.5 ? texture(uVelocity, vR).x : -C.x;
  float T = inside(vT) > 0.5 ? texture(uVelocity, vT).y : -C.y;
  float B = inside(vB) > 0.5 ? texture(uVelocity, vB).y : -C.y;
  float div = 0.5 * (R - L + T - B) / uTexel.x;
  vec2 p = vUv - uSrc.xy;
  float s = uSrc.z * exp(-dot(p, p) / uSrcRadius);
  div -= (s - uSink);
  outColor = vec4(div * inside(vUv), 0.0, 0.0, 1.0);
}
`;

/** One Jacobi iteration of the pressure Poisson equation (Neumann walls). */
export const PRESSURE = `${HEADER}${COMMON}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float C = texture(uPressure, vUv).x;
  float L = inside(vL) > 0.5 ? texture(uPressure, vL).x : C;
  float R = inside(vR) > 0.5 ? texture(uPressure, vR).x : C;
  float T = inside(vT) > 0.5 ? texture(uPressure, vT).x : C;
  float B = inside(vB) > 0.5 ? texture(uPressure, vB).x : C;
  float div = texture(uDivergence, vUv).x;
  float p = (L + R + T + B - uTexel.x * uTexel.x * div) * 0.25;
  outColor = vec4(p * inside(vUv), 0.0, 0.0, 1.0);
}
`;

/** Projection: subtract the pressure gradient so the flow is divergence-free (except at the sources). */
export const GRADIENT = `${HEADER}${COMMON}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float C = texture(uPressure, vUv).x;
  float L = inside(vL) > 0.5 ? texture(uPressure, vL).x : C;
  float R = inside(vR) > 0.5 ? texture(uPressure, vR).x : C;
  float T = inside(vT) > 0.5 ? texture(uPressure, vT).x : C;
  float B = inside(vB) > 0.5 ? texture(uPressure, vB).x : C;
  vec2 v = texture(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B) / uTexel.x;
  outColor = vec4(v * inside(vUv), 0.0, 1.0);
}
`;

/** Whole-cup motion: a swirl (rotation about the centre, weaker at the wall) plus a slosh in one direction. */
export const STIR = `${HEADER}${COMMON}
uniform sampler2D uVelocity;
uniform float uOmega;
uniform vec2 uPush;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float wall = 1.0 - smoothstep(0.75, 1.0, r);
  vec2 v = texture(uVelocity, vUv).xy + (uOmega * vec2(-p.y, p.x) + uPush * (1.0 - r * r)) * wall;
  outColor = vec4(v * inside(vUv), 0.0, 1.0);
}
`;

/** Multiplies a field (clearing the cup, or fading the old pressure as a warm start). */
export const SCALE = `${HEADER}${COMMON}
uniform sampler2D uTarget;
uniform float uValue;
void main() {
  outColor = texture(uTarget, vUv) * uValue;
}
`;

/**
 * Settles the surface back toward a fresh espresso: milk scaled by uKeep, the crema's source coordinates (BA,
 * advected with the flow so the photo's crema texture moves with the liquid) eased back to each cell's own uv.
 */
export const RESET = `${HEADER}${COMMON}
uniform sampler2D uTarget;
uniform float uKeep;
void main() {
  vec4 b = texture(uTarget, vUv);
  outColor = vec4(b.r * uKeep, b.g, mix(vUv, b.ba, uKeep));
}
`;

/** Downsamples the milk into a small 8-bit target that is read back for scoring. */
export const PROBE = `${HEADER}${COMMON}
uniform sampler2D uDye;
void main() {
  float m = texture(uDye, vUv).r;
  outColor = vec4(m, m, m, 1.0);
}
`;

/**
 * Draws the cup's surface: crema with its mottled "tiger" flecks, darker toward the rim; steamed milk with a fine
 * microfoam grain and the tan halo where thin milk mixes into crema; a faint relief (foam sits a hair higher) lit
 * from the window; the meniscus darkening at the wall and the window's reflection. `uTint` and `uWarm` carry the
 * page's light (time of day) so the coffee sits in the same light as the photo around it.
 */
export const DISPLAY = `${HEADER}${COMMON}
uniform sampler2D uDye;
uniform vec2 uDyeTexel;
uniform vec3 uTint;
uniform float uSheen;
uniform float uSeed;
uniform vec2 uLightDir;
uniform sampler2D uCrema;
uniform float uPhoto;
uniform float uMix;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  if (d > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  vec2 tx = vec2(uDyeTexel.x * 1.5, 0.0);
  vec2 ty = vec2(0.0, uDyeTexel.y * 1.5);
  float m = texture(uDye, vUv).r;
  float mL = texture(uDye, vUv - tx).r;
  float mR = texture(uDye, vUv + tx).r;
  float mT = texture(uDye, vUv + ty).r;
  float mB = texture(uDye, vUv - ty).r;

  // Crema: golden in the middle, deeper toward the wall, mottled ("tiger" flecks) by domain-warped noise on a
  // rotated grid, so no grid-aligned blocks show; a fine grain of microbubbles on top.
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  vec2 q = rot * (vUv * 5.0) + uSeed;
  float warp = fbm(q + 1.6 * fbm(rot * q * 1.9));
  float tone = smoothstep(0.0, 1.05, d * 0.8 + (warp - 0.5) * 0.6);
  vec3 crema = mix(vec3(0.72, 0.47, 0.23), vec3(0.34, 0.18, 0.08), tone);
  float tiger = fbm(rot * rot * (vUv * 26.0) + uSeed * 1.3);
  crema = mix(crema, vec3(0.30, 0.15, 0.06), smoothstep(0.52, 0.78, tiger) * 0.38 * smoothstep(0.1, 0.8, d));
  crema = mix(crema, vec3(0.80, 0.56, 0.30), smoothstep(0.6, 0.8, fbm(rot * (vUv * 9.0) - uSeed)) * 0.25);
  crema += (noise(rot * vUv * 260.0) - 0.5) * 0.03;

  // With the table photo: the crema IS the photo's crema. Its fine texture is read where the flow has carried it
  // (BA), its broad light where the cell sits, so swirls stretch the texture without moving the shading.
  if (uPhoto > 0.5) {
    vec2 src = texture(uDye, vUv).ba;
    vec2 sp = src - 0.5;
    float sl = length(sp) * 2.0;
    vec2 safe = 0.5 + sp * min(1.0, 0.92 / max(sl, 1e-4));
    float moved = smoothstep(0.002, 0.01, length(src - vUv));
    vec2 at = mix(vUv, safe, moved);
    // Stretched crema loses some of its grain rather than smearing into streaks.
    vec3 photo = (texture(uCrema, at).rgb - textureLod(uCrema, at, 4.0).rgb) * mix(1.0, 0.45, moved) + textureLod(uCrema, vUv, 4.0).rgb;
    crema = photo;
  }

  // The canvas: milk that dives under the crema while pouring mixes into it, so the surface turns from bright crema to
  // a softer caramel as the cup fills (keeping the crema's own texture). A ring by the wall stays darker, as in a real
  // cup, where the milk never quite reaches the rim.
  float lum = dot(crema, vec3(0.299, 0.587, 0.114));
  vec3 caramel = vec3(0.58, 0.37, 0.21) * (0.78 + 0.9 * (lum - 0.42));
  float mixHere = uMix * (1.0 - smoothstep(0.8, 0.97, d) * 0.7);
  crema = mix(crema, caramel, mixHere * 0.85);

  // Steamed milk is not paint: it is a glossy, slightly domed layer of microfoam. How deep inside the foam a point
  // is (the average milk on two rings around it) sets how thick the foam is there: thick foam is bright ivory, the
  // thin margin lets the coffee show through as a warm cream, and the dome catches the window as a soft sheen.
  float foam = smoothstep(0.38, 0.6, m);
  float thin = smoothstep(0.05, 0.36, m);
  vec2 ld0 = normalize(uLightDir);
  float ring1 = 0.0;
  float ring2 = 0.0;
  vec2 dome = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 dir = vec2(cos(a), sin(a));
    float s1 = texture(uDye, vUv + dir * uDyeTexel * 7.0).r;
    float s2 = texture(uDye, vUv + dir * uDyeTexel * 16.0).r;
    ring1 += s1;
    ring2 += s2;
    dome += dir * (s1 + s2);
  }
  ring1 /= 12.0;
  ring2 /= 12.0;
  float depth = smoothstep(0.45, 1.0, ring1 * 0.55 + ring2 * 0.45);
  // The dome's slope points from the thick middle toward the edge; light it from the window.
  vec3 dn = normalize(vec3(-dome * 0.22, 1.0));
  vec3 Ld = normalize(vec3(ld0, 0.9));
  float diffuse = dot(dn, Ld);
  vec3 milk = mix(vec3(0.9, 0.8, 0.66), vec3(0.975, 0.95, 0.9), smoothstep(0.0, 0.7, depth));
  milk *= 0.93 + 0.09 * diffuse;
  // Glossy microfoam: a soft highlight on the side of the dome that faces the window.
  float sheen = pow(max(0.0, dot(reflect(-Ld, dn), vec3(0.0, 0.0, 1.0))), 18.0);
  milk += sheen * 0.05 * (1.0 - depth * 0.5);
  // The finest bubbles, almost invisible, and a faint flow grain carried along with the foam.
  vec2 flowUv = texture(uDye, vUv).ba;
  milk -= (noise(vUv * 210.0) - 0.5) * 0.018 + (fbm(flowUv * vec2(30.0, 90.0)) - 0.5) * 0.02;

  // Around every shape, crema is pushed up against the foam: a thin darker outline just outside the white.
  float near = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 o = vec2(cos(a), sin(a)) * uDyeTexel;
    near = max(near, texture(uDye, vUv + o * 2.5).r);
    near = max(near, texture(uDye, vUv + o * 5.5).r * 0.7);
  }
  float outline = smoothstep(0.35, 0.85, near) * (1.0 - smoothstep(0.08, 0.38, m));
  crema *= 1.0 - outline * 0.28;
  // The foam stands proud: a soft shadow falls on the crema on the side away from the window.
  float lit = texture(uDye, vUv + ld0 * uDyeTexel * 5.0).r;
  crema *= 1.0 - smoothstep(0.45, 0.9, lit) * (1.0 - foam) * 0.14;

  // Thin milk over crema: a narrow band of tan, then the foam itself.
  vec3 tan = mix(crema, vec3(0.84, 0.68, 0.5), 0.72);
  vec3 col = mix(crema, tan, thin * (1.0 - foam));
  col = mix(col, milk, foam);

  // Where two layers of foam meet (each pour, each swing of the jug), a hairline of crema shows between them: the
  // lines of a rosetta's leaves and a tulip's stack.
  float gL = texture(uDye, vUv - tx).g;
  float gR = texture(uDye, vUv + tx).g;
  float gT = texture(uDye, vUv + ty).g;
  float gB = texture(uDye, vUv - ty).g;
  float seam = smoothstep(0.035, 0.09, length(vec2(gR - gL, gT - gB))) * smoothstep(0.5, 0.82, min(min(mL, mR), min(mT, mB)));
  col = mix(col, mix(crema, tan, 0.35), seam * 0.9);

  // The foam's edge, where it meets the crema, catches a little light on the window side.
  vec2 g = vec2(mR - mL, mT - mB);
  col += max(0.0, dot(normalize(-g + 1e-5), ld0)) * length(g) * 0.12 * (1.0 - foam * 0.5);

  // The meniscus: the liquid darkens and climbs the wall in a thin ring.
  float wallShade = mix(1.0, 0.64, smoothstep(0.84, 1.0, d));
  float ring = smoothstep(0.955, 0.985, d) * (1.0 - smoothstep(0.985, 1.0, d));
  float own = uPhoto > 0.5 ? thin : 1.0;
  col *= mix(1.0, wallShade, own);
  col = mix(col, col * 1.35 + 0.03, ring * 0.55 * own);

  // Window reflection: a soft bright crescent on the side the light comes from.
  vec2 ld = normalize(uLightDir);
  float side = dot(normalize(p + 0.0001), ld);
  float crescent = smoothstep(0.55, 0.98, side) * smoothstep(0.62, 0.86, d) * (1.0 - smoothstep(0.9, 0.97, d));
  col += crescent * uSheen * 0.16 * (uPhoto > 0.5 ? foam : 1.0);

  col *= uTint;
  float alpha = 1.0 - smoothstep(0.988, 1.0, d);
  outColor = vec4(col * alpha, alpha);
}
`;
