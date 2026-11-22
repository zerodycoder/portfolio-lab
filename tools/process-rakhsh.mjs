// Turns raw generated media from assets-inbox/rakhsh into web-ready files and writes the site's media manifest.
// Usage: node tools/process-rakhsh.mjs [--in=<dir>] [--out=<dir>]
// Expected inputs (any image/video extension; names are matched by prefix):
//   a-hero.*  b-orbit.*  c-reveal.*  e-ride.*  f-ember.*  f-ash.*  d-1.* … d-4.*  g-legend.* (image and/or video)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const IN = path.resolve(arg('in') ?? path.join(ROOT, 'assets-inbox', 'rakhsh'));
const OUT = path.resolve(arg('out') ?? path.join(ROOT, 'sites', 'rakhsh', 'public', 'media'));
const ORBIT_FRAMES = 96;

const IMAGE = /\.(png|jpe?g|webp|avif|tiff?)$/i;
const VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;

const files = fs.existsSync(IN) ? fs.readdirSync(IN) : [];
const find = (prefix, kind) => {
  const name = files.find((n) => n.toLowerCase().startsWith(prefix) && (!kind || kind.test(n)));
  return name ? path.join(IN, name) : null;
};
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args]).toString().trim();
const duration = (f) => parseFloat(probe(['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]));
const size = (f) => probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).split(',').map(Number);
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;

const webp = (src, out, width, quality = 82) => {
  ffmpeg(['-i', src, '-vf', `scale='min(${width},iw)':-2`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), out]);
  return out;
};
const mp4 = (src, out, width, crf = 23) => {
  ffmpeg(['-i', src, '-an', '-vf', `scale='min(${width},iw)':-2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', out]);
  return out;
};
// Seamless loop: drop the first second and cross-fade the clip's tail into that second, so the last frame
// flows straight back into the first. Generated clips almost never loop cleanly on their own.
const XFADE = 1;
const loopMp4 = (src, out, width, crf = 23) => {
  const d = duration(src);
  const graph = [
    '[0:v]split[a][b]',
    `[a]trim=${XFADE}:${d},setpts=PTS-STARTPTS[main]`,
    `[b]trim=0:${XFADE},setpts=PTS-STARTPTS[head]`,
    `[main][head]xfade=transition=fade:duration=${XFADE}:offset=${(d - 2 * XFADE).toFixed(3)},scale='min(${width},iw)':-2,format=yuv420p[v]`,
  ].join(';');
  ffmpeg(['-i', src, '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', out]);
  return out;
};
const firstFrame = (video, out, quality = 78) => {
  ffmpeg(['-i', video, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), out]);
  return out;
};
const url = (p) => `/media/${path.relative(OUT, p).split(path.sep).join('/')}`;
const log = (key, msg) => console.log(`  ✔ ${key.padEnd(9)} ${msg}`);

if (!files.length) {
  console.log(`No files in ${IN}. Nothing to do.`);
  process.exit(0);
}
fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
console.log(`Processing ${IN} → ${OUT}`);

const hero = find('a-hero', IMAGE);
if (hero) {
  const d = webp(hero, path.join(OUT, 'hero.webp'), 2400);
  const m = webp(hero, path.join(OUT, 'hero-m.webp'), 1200);
  manifest.hero = { src: url(d), srcMobile: url(m) };
  log('hero', `${kb(d)} / ${kb(m)}`);
}

const orbit = find('b-orbit', VIDEO);
if (orbit) {
  const fps = (ORBIT_FRAMES / duration(orbit)).toFixed(5);
  const counts = [];
  for (const [dir, width, quality] of [
    ['orbit', 1600, 74],
    ['orbit-m', 900, 70],
  ]) {
    const outDir = path.join(OUT, dir);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir);
    ffmpeg(['-i', orbit, '-vf', `fps=${fps},scale='min(${width},iw)':-2`, '-c:v', 'libwebp', '-quality', String(quality), path.join(outDir, '%03d.webp')]);
    counts.push(fs.readdirSync(outDir).filter((f) => f.endsWith('.webp')).length);
  }
  const frames = Math.min(...counts);
  const [width, height] = size(path.join(OUT, 'orbit', '001.webp'));
  manifest.orbit = { frames, pattern: '/media/orbit/{i}.webp', patternMobile: '/media/orbit-m/{i}.webp', width, height };
  const total = fs.readdirSync(path.join(OUT, 'orbit')).reduce((a, f) => a + fs.statSync(path.join(OUT, 'orbit', f)).size, 0);
  log('orbit', `${frames} frames, ${width}×${height}, ${Math.round(total / 1024)} KB desktop set`);
}

const reveal = find('c-reveal', VIDEO);
if (reveal) {
  const d = mp4(reveal, path.join(OUT, 'reveal.mp4'), 1920, 22);
  const m = mp4(reveal, path.join(OUT, 'reveal-m.mp4'), 1080, 24);
  manifest.reveal = { src: url(d), srcMobile: url(m) };
  log('reveal', `${kb(d)} / ${kb(m)}`);
}

const ride = find('e-ride', VIDEO);
if (ride) {
  const d = loopMp4(ride, path.join(OUT, 'ride.mp4'), 1920, 23);
  const m = loopMp4(ride, path.join(OUT, 'ride-m.mp4'), 960, 25);
  const poster = firstFrame(d, path.join(OUT, 'ride-poster.webp'));
  manifest.ride = { src: url(d), srcMobile: url(m), poster: url(poster) };
  log('ride', `${kb(d)} / ${kb(m)} (seamless loop)`);
}

const legendImg = find('g-legend', IMAGE);
const legendVid = find('g-legend', VIDEO);
if (legendImg || legendVid) {
  manifest.legend = {};
  if (legendVid) {
    // With a film, the poster must be the film's own first frame or the swap to video visibly jumps.
    const v = loopMp4(legendVid, path.join(OUT, 'legend.mp4'), 1920, 25);
    manifest.legend.video = url(v);
    manifest.legend.src = url(firstFrame(v, path.join(OUT, 'legend.webp')));
    log('legend', `video ${kb(v)} (seamless loop), poster from its first frame`);
  } else {
    manifest.legend.src = url(webp(legendImg, path.join(OUT, 'legend.webp'), 2400, 78));
    log('legend', 'image');
  }
}

const colors = {};
if (hero) colors.graphite = url(webp(hero, path.join(OUT, 'color-graphite.webp'), 2000));
for (const f of ['ember', 'ash', 'bone', 'olive']) {
  const src = find(`f-${f}`, IMAGE);
  if (src) colors[f] = url(webp(src, path.join(OUT, `color-${f}.webp`), 2000));
}
if (Object.keys(colors).length) {
  manifest.colors = colors;
  log('colors', Object.keys(colors).join(', '));
}

const details = [1, 2, 3, 4].map((i) => find(`d-${i}`, IMAGE));
if (details.some(Boolean)) {
  manifest.details = details.map((src, i) => (src ? url(webp(src, path.join(OUT, `detail-${i + 1}.webp`), 1400)) : null));
  log('details', `${manifest.details.filter(Boolean).length} of 4`);
}

if (hero) {
  const og = path.join(OUT, 'og.jpg');
  ffmpeg(['-i', hero, '-vf', 'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630', '-frames:v', '1', '-q:v', '3', og]);
  log('og', kb(og));
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest written with: ${Object.keys(manifest).join(', ') || 'nothing'}`);
