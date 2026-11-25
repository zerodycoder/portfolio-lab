// Builds the half-size media NOVANTA loads in lite mode (older and low-memory phones; see src/lib/quality.ts).
// node tools/make-novanta-lite.mjs
//
// media/<folder>/… → media/<folder>-lite/… for pbr (512 px maps), textures, scenes and photos (half width) and the
// topping sheets (half size, with their cell rectangles halved in the JSON). Run it after process-novanta.mjs or
// fetch-novanta-pbr.mjs.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const MEDIA = 'sites/novanta/public/media';

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

let before = 0;
let after = 0;
for (const folder of ['pbr', 'textures', 'scenes', 'photos', 'toppings']) {
  const src = path.join(MEDIA, folder);
  const dst = path.join(MEDIA, `${folder}-lite`);
  await fs.rm(dst, { recursive: true, force: true });
  for (const file of await walk(src)) {
    const rel = path.relative(src, file);
    const out = path.join(dst, rel);
    await fs.mkdir(path.dirname(out), { recursive: true });
    const ext = path.extname(file);
    if (ext === '.webp') {
      const meta = await sharp(file).metadata();
      const w = Math.max(64, Math.round(meta.width / 2));
      const quality = rel.endsWith('nor.webp') ? 78 : 76;
      await sharp(file).resize(w).webp({ quality, alphaQuality: 90, effort: 6 }).toFile(out);
      before += meta.width * meta.height;
      after += w * Math.round((meta.height * w) / meta.width);
    } else if (ext === '.json' && folder === 'toppings') {
      const json = JSON.parse(await fs.readFile(file, 'utf8'));
      json.cells = json.cells.map((c) => ({ ...c, x: c.x / 2, y: c.y / 2, w: c.w / 2, h: c.h / 2 }));
      await fs.writeFile(out, JSON.stringify(json));
    } else await fs.copyFile(file, out);
  }
  console.log(`${folder}-lite done`);
}
console.log(`pixels: ${(before / 1e6).toFixed(1)} M → ${(after / 1e6).toFixed(1)} M (GPU memory scales with this)`);
