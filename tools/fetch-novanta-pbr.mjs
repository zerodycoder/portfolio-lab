// Downloads the CC0 PBR materials and the HDRI NOVANTA uses from Poly Haven (polyhaven.com, CC0: no attribution
// required, credited in the README anyway) and converts them for the web.
// node tools/fetch-novanta-pbr.mjs   (then node tools/make-novanta-lite.mjs for the lite copies)
//
// Each material lands in sites/novanta/public/media/pbr/<name>/ as diff.webp (colour), nor.webp (OpenGL normal) and
// arm.webp (R = ambient occlusion, G = roughness, B = metalness: exactly the channels three.js reads from aoMap,
// roughnessMap and metalnessMap). The HDRI is shrunk to 256 × 128 (tools/shrink-novanta-hdr.mjs) and saved as env.hdr.
// Everything is sized for a first load on a phone: 1k maps, moderate WebP quality (normal maps keep a little more).
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'sites/novanta/public/media/pbr';
// name on the site → Poly Haven asset id, resolution, webp quality
const MATERIALS = {
  stucco: ['white_stucco', '1k'],
  floor: ['terracotta_floor_tiles', '1k'],
  brick: ['red_brick', '1k'],
  soot: ['dark_brick_wall', '1k'],
  beam: ['dark_wood', '1k'],
  ceiling: ['old_planks_02', '1k'],
  wood: ['kitchen_wood', '1k'],
  oldplaster: ['red_plaster_weathered', '1k'],
  basalt: ['cobblestone_floor_01', '1k'],
  shutter: ['painted_metal_shutter', '1k'],
  clay: ['clay_floor_001', '1k'],
};
const HDRI = ['fireplace', '1k'];

async function files(id) {
  const r = await fetch(`https://api.polyhaven.com/files/${id}`);
  if (!r.ok) throw new Error(`${id}: ${r.status}`);
  return r.json();
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const pickUrl = (entry, res) => entry?.[res]?.jpg?.url ?? entry?.[res]?.png?.url;

for (const [name, [id, res]] of Object.entries(MATERIALS)) {
  const f = await files(id);
  const dir = path.join(OUT, name);
  await fs.mkdir(dir, { recursive: true });
  const maps = { diff: f.Diffuse, nor: f.nor_gl, arm: f.arm };
  const sizes = [];
  for (const [key, entry] of Object.entries(maps)) {
    const url = pickUrl(entry, res);
    if (!url) {
      console.warn(`${name}: no ${key} at ${res}`);
      continue;
    }
    const buf = await download(url);
    const out = path.join(dir, `${key}.webp`);
    // Normal maps lose detail at low quality; colour and the packed AO/roughness can go lower.
    await sharp(buf).webp({ quality: key === 'nor' ? 80 : key === 'arm' ? 72 : 78, effort: 6 }).toFile(out);
    sizes.push(`${key} ${Math.round((await fs.stat(out)).size / 1024)}KB`);
  }
  console.log(`${name} (${id} ${res}): ${sizes.join(', ')}`);
}

const h = await files(HDRI[0]);
const hdrUrl = h.hdri?.[HDRI[1]]?.hdr?.url;
if (hdrUrl) {
  const full = 'tools/out/env-1k.hdr';
  await fs.mkdir('tools/out', { recursive: true });
  await fs.writeFile(full, await download(hdrUrl));
  execFileSync('node', ['tools/shrink-novanta-hdr.mjs', full, path.join(OUT, 'env.hdr'), '256'], { stdio: 'inherit' });
}
