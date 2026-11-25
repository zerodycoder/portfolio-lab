import * as THREE from 'three';

export type Ctx = CanvasRenderingContext2D;

/** `readback`: the canvas's pixels will be read (getImageData); keep it in CPU memory so reads don't stall the GPU. */
export function canvas(w: number, h = w, readback = false): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: readback });
  if (!g) throw new Error('2D canvas unavailable');
  return { c, g };
}

/** The chalkboard panel's dust: smudges and specks on a tileable 256 px square, as a data URL. */
export function chalkDust(): string {
  const { c, g } = canvas(256);
  g.fillStyle = '#24302a';
  g.fillRect(0, 0, 256, 256);
  const r = (n: number): number => Math.random() * n;
  for (let i = 0; i < 26; i++) {
    const x = r(256);
    const y = r(256);
    const rad = 20 + r(60);
    // Draw each smudge at the 9 tile offsets so the square repeats without seams.
    for (const ox of [-256, 0, 256])
      for (const oy of [-256, 0, 256]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grad.addColorStop(0, `rgba(255,255,255,${0.015 + r(0.03)})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${0.03 + r(0.07)})`;
    g.fillRect(r(256), r(256), 1, 1);
  }
  return c.toDataURL('image/png');
}

/** A scaled copy of a canvas (for lite mode: the same art at fewer pixels). Returns the canvas itself at k = 1. */
export function shrink(src: HTMLCanvasElement, k: number, into?: HTMLCanvasElement): HTMLCanvasElement {
  if (k >= 1 && !into) return src;
  const c = into ?? document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** A canvas as a colour texture (sRGB), optionally repeating. */
export function colorTex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** A canvas as linear data (masks, height, roughness). */
export function dataTex(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Fills a canvas pixel by pixel. fn returns [r, g, b] (0..255) or [r, g, b, a]. */
export function paint(g: Ctx, w: number, h: number, fn: (x: number, y: number) => ArrayLike<number>): void {
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = p[0];
      d[i + 1] = p[1];
      d[i + 2] = p[2];
      d[i + 3] = p.length > 3 ? p[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
}

export const hex = (c: string, a = 1): string => {
  const n = parseInt(c.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Loads an image; resolves null when it is missing so callers can fall back to the procedural version. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
