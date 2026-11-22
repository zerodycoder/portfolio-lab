// Turns the generated NOVANTA media into what the site loads.
// node tools/process-novanta.mjs [--inbox=assets-inbox/novanta]
//
// - i-<topping>: a top-down flat lay on a plain background → every piece is cut out (background colour estimated
//   from the border, connected components, small holes filled, soft edge, edge colours pulled in from the inside),
//   squared into 256 px cells and packed into public/media/toppings/<id>.webp, with <id>.json listing the cells and
//   each piece's size relative to the sheet's median (so a big basil leaf stays bigger than a small one).
// - t-dough: the inside of the stretched dough disc (rim excluded), as a texture tile.
// - t-sauce, t-cheese: square detail tiles. t-marble, t-bench: surfaces.
// - s-alley: the street outside the window. p-*: the family photos.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const inbox = flag('inbox') ?? 'assets-inbox/novanta';
const out = 'sites/novanta/public/media';
const CELL = 256;
const MAX_VARIANTS = 9;

const files = await fs.readdir(inbox);
const find = (prefix) => files.find((f) => f.startsWith(prefix + '.') && /\.(png|jpe?g|webp)$/i.test(f));

async function raw(file) {
  const { data, info } = await sharp(path.join(inbox, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

function borderColour({ data, W, H }) {
  const rs = [];
  const gs = [];
  const bs = [];
  const take = (x, y) => {
    const i = (y * W + x) * 4;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  for (let x = 0; x < W; x += 3) for (const y of [2, 5, H - 3, H - 6]) take(x, y);
  for (let y = 0; y < H; y += 3) for (const x of [2, 5, W - 3, W - 6]) take(x, y);
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/** Binary foreground mask by colour distance from the background. */
function foreground(img, bg, threshold) {
  const { data, W, H } = img;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
    m[i] = d > threshold ? 1 : 0;
  }
  return m;
}

/** Connected components (8-neighbour) of a mask → list of { pixels, x0, y0, x1, y1 }. */
function components(m, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const list = [];
  const stack = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || label[s] >= 0) continue;
    const id = list.length;
    let sp = 0;
    stack[sp++] = s;
    label[s] = id;
    const px = [];
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (sp) {
      const p = stack[--sp];
      px.push(p);
      const x = p % W;
      const y = (p / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (m[q] && label[q] < 0) {
            label[q] = id;
            stack[sp++] = q;
          }
        }
    }
    list.push({ id, px, x0, y0, x1, y1 });
  }
  return { label, list };
}

/** The piece's own mask in its bounding box (+pad), with enclosed holes under `holeFrac` of the area filled. */
function pieceMask(c, label, W, H, pad, holeFrac) {
  const bx0 = Math.max(0, c.x0 - pad);
  const by0 = Math.max(0, c.y0 - pad);
  const bx1 = Math.min(W - 1, c.x1 + pad);
  const by1 = Math.min(H - 1, c.y1 + pad);
  const w = bx1 - bx0 + 1;
  const h = by1 - by0 + 1;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = label[(by0 + y) * W + bx0 + x] === c.id ? 1 : 0;
  // Outside = flood from the box border; anything not reached and not the piece is a hole.
  const outside = new Uint8Array(w * h);
  const st = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const p = st.pop();
    if (outside[p] || mask[p]) continue;
    outside[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) st.push(p - 1);
    if (x < w - 1) st.push(p + 1);
    if (y > 0) st.push(p - w);
    if (y < h - 1) st.push(p + w);
  }
  const area = c.px.length;
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (mask[s] || outside[s] || seen[s]) continue;
    const hole = [];
    const q = [s];
    seen[s] = 1;
    while (q.length) {
      const p = q.pop();
      hole.push(p);
      const x = p % w;
      const y = (p / w) | 0;
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (n >= 0 && !mask[n] && !outside[n] && !seen[n]) {
          seen[n] = 1;
          q.push(n);
        }
      }
    }
    if (hole.length < area * holeFrac) hole.forEach((p) => (mask[p] = 1));
  }
  return { mask, bx0, by0, w, h };
}

/** RGBA crop of one piece: soft alpha from the mask, edge colours replaced by their inner neighbours. */
function cutout(img, pm) {
  const { data, W } = img;
  const { mask, bx0, by0, w, h } = pm;
  const outBuf = Buffer.alloc(w * h * 4);
  const inner = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && mask[y * w + x] && mask[y * w + x - 1] && mask[y * w + x + 1] && mask[(y - 1) * w + x] && mask[(y + 1) * w + x];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const s = ((by0 + y) * W + bx0 + x) * 4;
      let r = data[s];
      let g = data[s + 1];
      let b = data[s + 2];
      if (mask[y * w + x] && !inner(x, y)) {
        // Edge pixel: average the inner neighbours' colour (removes the background fringe).
        let n = 0, sr = 0, sg = 0, sb = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || !inner(xx, yy)) continue;
            const t = ((by0 + yy) * W + bx0 + xx) * 4;
            sr += data[t];
            sg += data[t + 1];
            sb += data[t + 2];
            n++;
          }
        if (n) {
          r = sr / n;
          g = sg / n;
          b = sb / n;
        }
      }
      // Alpha: 3×3 average of the mask = a one-pixel soft edge.
      let a = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) a += mask[yy * w + xx];
        }
      outBuf[o] = r;
      outBuf[o + 1] = g;
      outBuf[o + 2] = b;
      outBuf[o + 3] = Math.round((a / 9) * 255);
    }
  return outBuf;
}

async function topping(prefix) {
  const file = find(prefix);
  if (!file) return null;
  const id = prefix.slice(2);
  const img = await raw(file);
  const bg = borderColour(img);
  const bright = (bg[0] + bg[1] + bg[2]) / 3;
  const m = foreground(img, bg, bright > 200 ? 34 : 40);
  const { label, list } = components(m, img.W, img.H);
  const minArea = img.W * img.H * 0.0012;
  const pieces = list
    .filter((c) => c.px.length > minArea && c.x0 > 2 && c.y0 > 2 && c.x1 < img.W - 3 && c.y1 < img.H - 3)
    .sort((a, b) => b.px.length - a.px.length)
    .slice(0, MAX_VARIANTS);
  if (!pieces.length) throw new Error(`${file}: no pieces found`);
  const dims = pieces.map((c) => Math.max(c.x1 - c.x0, c.y1 - c.y0));
  const median = [...dims].sort((a, b) => a - b)[dims.length >> 1];
  const cols = Math.ceil(Math.sqrt(pieces.length));
  const rows = Math.ceil(pieces.length / cols);
  const cells = [];
  const composites = [];
  for (let i = 0; i < pieces.length; i++) {
    const c = pieces[i];
    const pm = pieceMask(c, label, img.W, img.H, 6, 0.08);
    const rgba = cutout(img, pm);
    const side = Math.round(Math.max(pm.w, pm.h) * 1.04);
    const cell = await sharp(rgba, { raw: { width: pm.w, height: pm.h, channels: 4 } })
      .extend({
        top: Math.floor((side - pm.h) / 2),
        bottom: Math.ceil((side - pm.h) / 2),
        left: Math.floor((side - pm.w) / 2),
        right: Math.ceil((side - pm.w) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true })
      // sharp applies extend after resize within one pipeline, so square first, then resize.
      .then(({ data, info }) => sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).resize(CELL, CELL, { kernel: 'lanczos3' }))
      .then((s) => s.png().toBuffer());
    const x = (i % cols) * CELL;
    const y = Math.floor(i / cols) * CELL;
    composites.push({ input: cell, left: x, top: y });
    cells.push({ x, y, w: CELL, h: CELL, scale: Number((dims[i] / median).toFixed(3)) });
  }
  await fs.mkdir(path.join(out, 'toppings'), { recursive: true });
  await sharp({ create: { width: cols * CELL, height: rows * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(path.join(out, 'toppings', `${id}.webp`));
  await fs.writeFile(path.join(out, 'toppings', `${id}.json`), JSON.stringify({ cells, background: bg }, null, 1));
  return `${id}: ${pieces.length} pieces (bg ${bg.join(',')})`;
}

async function dough() {
  const file = find('t-dough');
  if (!file) return null;
  const img = await raw(file);
  const bg = borderColour(img);
  const { list } = components(foreground(img, bg, 40), img.W, img.H);
  const disc = list.sort((a, b) => b.px.length - a.px.length)[0];
  const cx = (disc.x0 + disc.x1) / 2;
  const cy = (disc.y0 + disc.y1) / 2;
  const R = Math.min(disc.x1 - disc.x0, disc.y1 - disc.y0) / 2;
  // The flat middle, clear of the rim.
  const side = Math.round(R * 1.15);
  await fs.mkdir(path.join(out, 'textures'), { recursive: true });
  await sharp(path.join(inbox, file))
    .extract({ left: Math.round(cx - side / 2), top: Math.round(cy - side / 2), width: side, height: side })
    .resize(1024, 1024)
    .webp({ quality: 88 })
    .toFile(path.join(out, 'textures', 't-dough.webp'));
  return `t-dough: disc r=${Math.round(R)}px, tile ${side}px`;
}

async function squareTile(prefix, size = 1024) {
  const file = find(prefix);
  if (!file) return null;
  const meta = await sharp(path.join(inbox, file)).metadata();
  const s = Math.min(meta.width, meta.height);
  await fs.mkdir(path.join(out, 'textures'), { recursive: true });
  await sharp(path.join(inbox, file))
    .extract({ left: Math.round((meta.width - s) / 2), top: Math.round((meta.height - s) / 2), width: s, height: s })
    .resize(size, size)
    .webp({ quality: 88 })
    .toFile(path.join(out, 'textures', `${prefix}.webp`));
  return `${prefix}: ${size}²`;
}

async function surface(prefix, aspect, width) {
  const file = find(prefix);
  if (!file) return null;
  const meta = await sharp(path.join(inbox, file)).metadata();
  let w = meta.width;
  let h = Math.round(w / aspect);
  if (h > meta.height) {
    h = meta.height;
    w = Math.round(h * aspect);
  }
  await fs.mkdir(path.join(out, 'textures'), { recursive: true });
  await sharp(path.join(inbox, file))
    .extract({ left: Math.round((meta.width - w) / 2), top: Math.round((meta.height - h) / 2), width: w, height: h })
    .resize(width, Math.round(width / aspect))
    .webp({ quality: 86 })
    .toFile(path.join(out, 'textures', `${prefix}.webp`));
  return `${prefix}: ${width}×${Math.round(width / aspect)}`;
}

async function still(prefix, dir, width) {
  const file = find(prefix);
  if (!file) return null;
  await fs.mkdir(path.join(out, dir), { recursive: true });
  await sharp(path.join(inbox, file)).resize(width).webp({ quality: 84 }).toFile(path.join(out, dir, `${prefix}.webp`));
  return `${prefix}: ${width}w`;
}

const tasks = [
  ...files.filter((f) => f.startsWith('i-')).map((f) => () => topping(f.replace(/\.[^.]+$/, ''))),
  dough,
  () => squareTile('t-sauce'),
  () => squareTile('t-cheese'),
  () => surface('t-bench', 0.92 / 0.62, 1536),
  () => surface('t-marble', 16 / 9, 1600),
  () => still('s-alley', 'scenes', 1672),
  () => still('p-1958', 'photos', 1200),
  () => still('p-street', 'photos', 1200),
  () => still('p-family', 'photos', 1200),
];
for (const t of tasks) {
  const r = await t();
  if (r) console.log(r);
}
