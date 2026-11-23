// Downloads the CC0 PBR materials and the HDRI NOVANTA uses from Poly Haven (polyhaven.com, CC0: no attribution
// required, credited in the README anyway) and converts them for the web.
// node tools/fetch-novanta-pbr.mjs
//
// Each material lands in sites/novanta/public/media/pbr/<name>/ as diff.webp (colour), nor.webp (OpenGL normal) and
// arm.webp (R = ambient occlusion, G = roughness, B = metalness: exactly the channels three.js reads from aoMap,
// roughnessMap and metalnessMap). The HDRI is saved as env.hdr.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'sites/novanta/public/media/pbr';
// name on the site → Poly Haven asset id, resolution, webp quality
const MATERIALS = {
  stucco: ['white_stucco', '1k'],
  floor: ['terracotta_floor_tiles', '2k'],
  brick: ['red_brick', '1k'],
  soot: ['dark_brick_wall', '1k'],
  beam: ['dark_wood', '1k'],
  ceiling: ['old_planks_02', '1k'],
  wood: ['kitchen_wood', '1k'],
  ochre: ['yellow_plaster_02', '1k'],
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
    // Normal maps lose detail at low quality; colour can go lower.
    await sharp(buf).webp({ quality: key === 'nor' ? 90 : 82, effort: 5 }).toFile(out);
    sizes.push(`${key} ${Math.round((await fs.stat(out)).size / 1024)}KB`);
  }
  console.log(`${name} (${id} ${res}): ${sizes.join(', ')}`);
}

const h = await files(HDRI[0]);
const hdrUrl = h.hdri?.[HDRI[1]]?.hdr?.url;
if (hdrUrl) {
  await fs.writeFile(path.join(OUT, 'env.hdr'), await download(hdrUrl));
  console.log(`env.hdr (${HDRI[0]} ${HDRI[1]}): ${Math.round((await fs.stat(path.join(OUT, 'env.hdr'))).size / 1024)}KB`);
}
