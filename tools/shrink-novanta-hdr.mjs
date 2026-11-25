// Shrinks NOVANTA's HDR environment (Poly Haven 1k, ~1.3 MB) to a small equirectangular map. The site only uses it
// for soft reflections and fill light at low intensity, through a PMREM blur, so 256 × 128 loses nothing visible.
// node tools/shrink-novanta-hdr.mjs [in] [out] [width]
import fs from 'node:fs';

const [inPath = 'sites/novanta/public/media/pbr/env-1k.hdr', outPath = 'sites/novanta/public/media/pbr/env.hdr', widthArg = '256'] = process.argv.slice(2);
const buf = fs.readFileSync(inPath);

// Header: text lines until an empty line, then the resolution line "-Y h +X w".
let pos = 0;
const line = () => {
  let s = '';
  while (buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]);
  pos++;
  return s;
};
let l;
do l = line();
while (l !== '');
const res = line().split(/\s+/);
const H = Number(res[1]);
const W = Number(res[3]);

// Decode (new-style RLE scanlines, or flat).
const rgbe = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  if (buf[pos] === 2 && buf[pos + 1] === 2 && ((buf[pos + 2] << 8) | buf[pos + 3]) === W) {
    pos += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let n = buf[pos++];
        if (n > 128) {
          n -= 128;
          const v = buf[pos++];
          for (let i = 0; i < n; i++) rgbe[(y * W + x++) * 4 + c] = v;
        } else for (let i = 0; i < n; i++) rgbe[(y * W + x++) * 4 + c] = buf[pos++];
      }
    }
  } else {
    rgbe.set(buf.subarray(pos, pos + W * 4), y * W * 4);
    pos += W * 4;
  }
}
const toFloat = (i) => {
  const e = rgbe[i + 3];
  if (!e) return [0, 0, 0];
  const f = Math.pow(2, e - 136);
  return [rgbe[i] * f, rgbe[i + 1] * f, rgbe[i + 2] * f];
};

// Box-filter down to w × h.
const w = Number(widthArg);
const h = w / 2;
const sx = W / w;
const sy = H / h;
const out = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++)
      for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
        const [a, bb, c] = toFloat((yy * W + xx) * 4);
        r += a;
        g += bb;
        b += c;
        n++;
      }
    r /= n;
    g /= n;
    b /= n;
    const m = Math.max(r, g, b);
    const o = (y * w + x) * 4;
    if (m < 1e-32) continue;
    const e = Math.ceil(Math.log2(m));
    const k = 256 / Math.pow(2, e);
    out[o] = Math.min(255, r * k);
    out[o + 1] = Math.min(255, g * k);
    out[o + 2] = Math.min(255, b * k);
    out[o + 3] = e + 128;
  }
// Flat (uncompressed) scanlines: three's HDRLoader reads them as such.
fs.writeFileSync(outPath, Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'ascii'), out]));
console.log(`${inPath} ${W}×${H} → ${outPath} ${w}×${h}, ${Math.round(fs.statSync(outPath).size / 1024)} KB`);
