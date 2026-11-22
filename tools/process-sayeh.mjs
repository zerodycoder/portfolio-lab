// Turns raw generated media from assets-inbox/sayeh into web-ready files and writes the site's media manifest.
// Usage: node tools/process-sayeh.mjs [--in=<dir>] [--out=<dir>]
// Expected inputs (any image/video extension; names are matched by prefix):
//   a-cup.*  b-roast.*  c-ethiopia.*  c-colombia.*  c-kenya.*  c-guatemala.*  d-hands.*  e-espresso.*
//   f-cafe-day.*  f-cafe-night.*
// The cup photo is measured automatically: the crema's circle (centre and radius) is found from its colour, so
// the fluid simulation can be laid exactly over the liquid, and the crema itself is cropped out as the
// simulation's base texture.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const IN = path.resolve(arg('in') ?? path.join(ROOT, 'assets-inbox', 'sayeh'));
const OUT = path.resolve(arg('out') ?? path.join(ROOT, 'sites', 'sayeh', 'public', 'media'));

// The generator delivered e-espresso as 20 s: the first 10 s are a duplicate of the roast clip, the pour is 10–20 s.
const ESPRESSO_FROM = 10;

const IMAGE = /\.(png|jpe?g|webp|avif|tiff?)$/i;
const VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;

const files = fs.existsSync(IN) ? fs.readdirSync(IN) : [];
const find = (prefix, kind) => {
  const name = files.find((n) => n.toLowerCase().startsWith(prefix) && (!kind || kind.test(n)));
  return name ? path.join(IN, name) : null;
};
const ffmpeg = (args, opts = {}) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', maxBuffer: 1 << 28 });
const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args]).toString().trim();
const duration = (f) => parseFloat(probe(['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]));
const size = (f) => probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).split(',').map(Number);
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;
const url = (p) => `/media/${path.relative(OUT, p).split(path.sep).join('/')}`;
const log = (key, msg) => console.log(`  ✔ ${key.padEnd(10)} ${msg}`);

const webp = (src, out, width, quality = 82, extra = '') => {
  ffmpeg(['-i', src, '-vf', `${extra}scale='min(${width},iw)':-2:flags=lanczos`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), out]);
  return out;
};
const encode = (src, out, width, { from = 0, to, crf = 23 } = {}) => {
  const span = to !== undefined ? ['-ss', String(from), '-to', String(to)] : from ? ['-ss', String(from)] : [];
  ffmpeg([...span, '-i', src, '-an', '-vf', `scale='min(${width},iw)':-2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', out]);
  return out;
};
/**
 * A seamless loop from [from, to]: the clip after the first second, with its last second cross-faded into that
 * first second, so the final frame flows straight back into the first.
 */
const loop = (src, out, width, from, to, crf = 23) => {
  const x = 1;
  const graph = [
    `[0:v]trim=${from}:${to},setpts=PTS-STARTPTS,split[a][b]`,
    `[a]trim=${x}:${to - from},setpts=PTS-STARTPTS[main]`,
    `[b]trim=0:${x},setpts=PTS-STARTPTS[head]`,
    `[main][head]xfade=transition=fade:duration=${x}:offset=${(to - from - 2 * x).toFixed(3)},scale='min(${width},iw)':-2,format=yuv420p[v]`,
  ].join(';');
  ffmpeg(['-i', src, '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', out]);
  return out;
};
const still = (video, at, out, width = 1280, quality = 78) => {
  ffmpeg(['-ss', String(at), '-i', video, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-c:v', 'libwebp', '-quality', String(quality), out]);
  return out;
};

/** Raw RGB pixels of an image (decoded by ffmpeg). */
function pixels(src) {
  const [w, h] = size(src);
  const buf = ffmpeg(['-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { capture: true });
  return { w, h, px: buf };
}

/**
 * Finds the crema: saturated orange-brown pixels in the middle of the frame. Its outline is traced on 720 rays
 * from the centroid and fitted with a least-squares circle. Also samples the table colour at the frame edges.
 */
function measureCup(src) {
  const { w, h, px } = pixels(src);
  const isCrema = (i) => {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const mx = Math.max(r, g, b);
    const sat = (mx - Math.min(r, g, b)) / Math.max(mx, 1);
    return sat > 0.55 && r > 110 && g > 50 && g < 170 && b < 90;
  };
  // Centroid, refined three times to the crema near the current estimate (sunlit table can be orange too).
  let cx0 = w / 2;
  let cy0 = h / 2;
  let reach = Math.min(w, h) * 0.45;
  for (let pass = 0; pass < 3; pass++) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = Math.max(0, Math.round(cy0 - reach)); y < Math.min(h, cy0 + reach); y++)
      for (let x = Math.max(0, Math.round(cx0 - reach)); x < Math.min(w, cx0 + reach); x++)
        if ((x - cx0) ** 2 + (y - cy0) ** 2 < reach * reach && isCrema((y * w + x) * 3)) {
          sx += x;
          sy += y;
          n++;
        }
    if (n < 1000) throw new Error('No crema found in the cup photo');
    cx0 = sx / n;
    cy0 = sy / n;
    reach = Math.sqrt(n / Math.PI) * 1.25;
  }
  // Trace each ray outward until the crema ends (a gap of a few pixels), so nothing beyond the cup counts.
  const pts = [];
  for (let k = 0; k < 720; k++) {
    const a = (k / 720) * Math.PI * 2;
    let last = 0;
    for (let rr = 0; rr < Math.min(w, h) * 0.45; rr += 0.5) {
      const x = Math.round(cx0 + rr * Math.cos(a));
      const y = Math.round(cy0 + rr * Math.sin(a));
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (isCrema((y * w + x) * 3)) last = rr;
      else if (rr - last > 6) break;
    }
    pts.push([cx0 + last * Math.cos(a), cy0 + last * Math.sin(a)]);
  }
  // Least squares: x² + y² = 2ax + 2by + c.
  let [s11, s12, s13, s22, s23, s33, t1, t2, t3] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    s11 += 4 * x * x;
    s12 += 4 * x * y;
    s13 += 2 * x;
    s22 += 4 * y * y;
    s23 += 2 * y;
    s33 += 1;
    t1 += 2 * x * z;
    t2 += 2 * y * z;
    t3 += z;
  }
  const M = [
    [s11, s12, s13],
    [s12, s22, s23],
    [s13, s23, s33],
  ];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  const col = (i, v) => M.map((row, r) => row.map((c, j) => (j === i ? v[r] : c)));
  const T = [t1, t2, t3];
  const a = det(col(0, T)) / D;
  const b = det(col(1, T)) / D;
  const c = det(col(2, T)) / D;
  const r = Math.sqrt(c + a * a + b * b);
  // The table colour around the frame, for the page behind the photo.
  let tr = 0;
  let tg = 0;
  let tb = 0;
  let tn = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (y > 30 && y < h - 30 && x > 30 && x < w - 30) continue;
      const i = (y * w + x) * 3;
      tr += px[i];
      tg += px[i + 1];
      tb += px[i + 2];
      tn++;
    }
  const hex = (v) => Math.round(v / tn).toString(16).padStart(2, '0');
  return { w, h, cx: +a.toFixed(1), cy: +b.toFixed(1), r: +r.toFixed(1), bg: `#${hex(tr)}${hex(tg)}${hex(tb)}` };
}

if (!files.length) {
  console.log(`No files in ${IN}. Nothing to do.`);
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
console.log(`Processing ${IN} → ${OUT}`);

const cupSrc = find('a-cup', IMAGE);
if (cupSrc) {
  const m = measureCup(cupSrc);
  const full = webp(cupSrc, path.join(OUT, 'cup.webp'), 2400, 86);
  // The crema alone: the liquid's bounding square, a hair inside the rim, at 512² for the simulation.
  const r = m.r - 3;
  const side = Math.round(2 * r);
  const crema = path.join(OUT, 'cup-crema.webp');
  ffmpeg(['-i', cupSrc, '-vf', `crop=${side}:${side}:${Math.round(m.cx - r)}:${Math.round(m.cy - r)},scale=512:512:flags=lanczos`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '90', crema]);
  manifest.cup = { src: url(full), crema: url(crema), w: m.w, h: m.h, cx: m.cx, cy: m.cy, r: +r.toFixed(1), bg: m.bg };
  log('cup', `${kb(full)}, crema ${kb(crema)}, liquid at (${m.cx}, ${m.cy}) r=${m.r}, table ${m.bg}`);
}

const roast = find('b-roast', VIDEO);
if (roast) {
  // The tray sweep after the beans have dropped (from 3.5 s) loops seamlessly behind the roast chart.
  const d = duration(roast);
  const big = loop(roast, path.join(OUT, 'roast.mp4'), 1280, 3.5, d);
  const small = loop(roast, path.join(OUT, 'roast-m.mp4'), 720, 3.5, d, 25);
  const poster = still(roast, 4.5, path.join(OUT, 'roast.webp'));
  manifest.roast = { mp4: url(big), mp4Small: url(small), poster: url(poster) };
  log('roast', `${kb(big)} / ${kb(small)}`);
}

const espresso = find('e-espresso', VIDEO);
if (espresso) {
  const from = duration(espresso) > 15 ? ESPRESSO_FROM : 0;
  const big = encode(espresso, path.join(OUT, 'espresso.mp4'), 1280, { from });
  const small = encode(espresso, path.join(OUT, 'espresso-m.mp4'), 720, { from, crf: 25 });
  const poster = still(espresso, from + 6, path.join(OUT, 'espresso.webp'));
  manifest.espresso = { mp4: url(big), mp4Small: url(small), poster: url(poster) };
  log('espresso', `${kb(big)} / ${kb(small)} (from ${from} s)`);
}

const origins = {};
for (const id of ['ethiopia', 'colombia', 'kenya', 'guatemala']) {
  const src = find(`c-${id}`, IMAGE);
  if (!src) continue;
  const out = webp(src, path.join(OUT, `origin-${id}.webp`), 1600, 80);
  origins[id] = url(out);
  log(id, kb(out));
}
if (Object.keys(origins).length) manifest.origins = origins;

const hands = find('d-hands', IMAGE);
if (hands) {
  const out = webp(hands, path.join(OUT, 'hands.webp'), 1400, 82);
  manifest.hands = url(out);
  log('hands', kb(out));
}

const cafe = {};
for (const k of ['day', 'night']) {
  const src = find(`f-cafe-${k}`, IMAGE);
  if (!src) continue;
  const out = webp(src, path.join(OUT, `cafe-${k}.webp`), 1600, 82);
  cafe[k] = url(out);
  log(`cafe ${k}`, kb(out));
}
if (Object.keys(cafe).length) manifest.cafe = cafe;

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`  → ${path.join(OUT, 'manifest.json')}`);
