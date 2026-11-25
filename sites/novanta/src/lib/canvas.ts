import * as THREE from 'three';

export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h = w): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: false });
  if (!g) throw new Error('2D canvas unavailable');
  return { c, g };
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
