import { PROBE_SIZE } from './fluid';

export type Score = {
  /** 0..1: how well the pattern mirrors across its best axis. */
  symmetry: number;
  /** 0..1: crisp milk against crema, rather than a muddy blend. */
  contrast: number;
  /** 0..1 of the surface covered with foam. */
  coverage: number;
  /** The mirror axis, in radians from the x axis (uv space, y up). */
  axis: number;
  grade: string;
  total: number;
  verdict: string;
};

const GRADES: [number, string][] = [
  [0.92, 'A+'],
  [0.86, 'A'],
  [0.8, 'A−'],
  [0.74, 'B+'],
  [0.68, 'B'],
  [0.62, 'B−'],
  [0.5, 'C'],
  [0, 'D'],
];

/**
 * Judges a pour from the read-back milk field the way a barista would: is it symmetrical, is it crisp, is there
 * enough (but not too much) foam? The symmetry search mirrors the field across axes through the centre every 4°
 * and keeps the best; only cells where either side has milk count, so a big empty cup doesn't score for free.
 */
export function judge(m: Float32Array): Score | null {
  const N = PROBE_SIZE;
  const c = N / 2;
  const r2 = (c - 1.5) ** 2;
  let cells = 0;
  let milk = 0;
  let contrast = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (dx * dx + dy * dy > r2) continue;
      const v = m[y * N + x];
      cells++;
      if (v > 0.5) milk++;
      contrast += Math.abs(2 * v - 1);
    }
  }
  const coverage = milk / cells;
  if (coverage < 0.04) return null;
  contrast /= cells;

  let best = 0;
  let axis = Math.PI / 2;
  for (let deg = 0; deg < 180; deg += 4) {
    const a = (deg * Math.PI) / 180;
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    let diff = 0;
    let n = 0;
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const px = x + 0.5 - c;
        const py = y + 0.5 - c;
        if (px * px + py * py > r2) continue;
        const v = m[y * N + x];
        const d = px * ax + py * ay;
        const mx = Math.round(2 * d * ax - px + c - 0.5);
        const my = Math.round(2 * d * ay - py + c - 0.5);
        if (mx < 0 || my < 0 || mx >= N || my >= N) continue;
        const w = m[my * N + mx];
        if (v < 0.25 && w < 0.25) continue;
        diff += Math.abs(v - w);
        n++;
      }
    }
    const sym = n ? 1 - diff / n : 0;
    if (sym > best) {
      best = sym;
      axis = a;
    }
  }
  // A real pattern fills a good part of the cup without drowning the crema.
  const fit = coverage < 0.22 ? coverage / 0.22 : coverage > 0.68 ? Math.max(0, 1 - (coverage - 0.68) / 0.3) : 1;
  const symmetry = Math.max(0, Math.min(1, (best - 0.55) / 0.42));
  // A cup drowned in milk (or with barely any) is no pattern, however symmetrical it is.
  const total = coverage > 0.8 || coverage < 0.08 ? Math.min(0.55, 0.5 * symmetry + 0.3 * contrast + 0.2 * fit) : 0.5 * symmetry + 0.3 * contrast + 0.2 * fit;
  const grade = GRADES.find(([t]) => total >= t)![1];
  const verdict =
    coverage > 0.8
      ? 'All milk, no crema: that’s a flat white in disguise.'
      : coverage < 0.15
        ? 'A little shy. Pour longer and closer to the surface.'
        : symmetry < 0.55
          ? 'Lopsided. Keep the pitcher on one line as you pour.'
          : contrast < 0.62
            ? 'Muddy. Pour faster so the foam sits on top.'
            : total >= 0.86
              ? 'Clean, crisp and centred. You could work our bar.'
              : 'Nice pour. A steadier hand gets you the A.';
  return { symmetry, contrast, coverage, axis, grade, total, verdict };
}
