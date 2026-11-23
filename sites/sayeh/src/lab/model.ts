/**
 * A small extraction model for the Brew Lab, built on the barista's two numbers:
 *  - extraction yield (EY): the share of the coffee's mass that dissolved into the cup (ideal 18–22%);
 *  - strength (TDS): how much of the drink is dissolved coffee (ideal ~1.15–1.45% for filter, 8–12% espresso).
 * Extraction follows first-order kinetics, EY = EYmax·(1 − e^(−k·t)), where k grows as the grind gets finer
 * (more surface) and the water hotter. For pour-over and espresso the contact time isn't set directly: it follows
 * from the grind (finer grounds slow the water), exactly the trade-off baristas fight with.
 */

export type MethodId = 'pourover' | 'espresso' | 'press' | 'aeropress';

export type Range = { min: number; max: number; step: number };

export type Method = {
  id: MethodId;
  name: string;
  dose: Range & { value: number };
  ratio: Range & { value: number };
  grind: Range & { value: number };
  temp: Range & { value: number };
  /** Steep time for immersion methods; derived for percolation. */
  time?: Range & { value: number };
  /** TDS axis of the chart and the ideal box, in %. */
  tds: { lo: number; hi: number; ideal: [number, number] };
  /** Grams of water held back by the spent grounds, per gram of coffee. */
  retained: number;
  k0: number;
  g0: number;
  note: string;
};

export const METHODS: Method[] = [
  {
    id: 'pourover',
    name: 'Pour-over',
    dose: { min: 10, max: 30, step: 0.5, value: 15 },
    ratio: { min: 12, max: 20, step: 0.1, value: 16.7 },
    grind: { min: 300, max: 1200, step: 10, value: 650 },
    temp: { min: 80, max: 100, step: 1, value: 94 },
    tds: { lo: 0.8, hi: 1.8, ideal: [1.15, 1.45] },
    retained: 2,
    k0: 0.005871,
    g0: 650,
    note: 'Contact time follows the grind: finer grounds hold the water back.',
  },
  {
    id: 'espresso',
    name: 'Espresso',
    dose: { min: 14, max: 22, step: 0.5, value: 18 },
    ratio: { min: 1.4, max: 3, step: 0.05, value: 2 },
    grind: { min: 150, max: 450, step: 5, value: 260 },
    temp: { min: 86, max: 96, step: 0.5, value: 93 },
    tds: { lo: 5, hi: 15, ideal: [8, 12] },
    retained: 0,
    k0: 0.0387,
    g0: 260,
    note: 'Shot time follows the grind: finer grounds choke the flow.',
  },
  {
    id: 'press',
    name: 'French press',
    dose: { min: 15, max: 45, step: 1, value: 30 },
    ratio: { min: 12, max: 18, step: 0.1, value: 16 },
    grind: { min: 700, max: 1400, step: 10, value: 1000 },
    temp: { min: 85, max: 100, step: 1, value: 95 },
    time: { min: 120, max: 600, step: 10, value: 240 },
    tds: { lo: 0.8, hi: 1.8, ideal: [1.15, 1.45] },
    retained: 2.2,
    k0: 0.004297,
    g0: 1000,
    note: 'An immersion: you choose the steep, the grind sets the pace.',
  },
  {
    id: 'aeropress',
    name: 'AeroPress',
    dose: { min: 11, max: 20, step: 0.5, value: 15 },
    ratio: { min: 10, max: 17, step: 0.1, value: 15.5 },
    grind: { min: 400, max: 900, step: 10, value: 600 },
    temp: { min: 75, max: 96, step: 1, value: 85 },
    time: { min: 60, max: 240, step: 5, value: 120 },
    tds: { lo: 0.8, hi: 1.8, ideal: [1.15, 1.45] },
    retained: 1.6,
    k0: 0.01181,
    g0: 600,
    note: 'Immersion, then a press: forgiving, cooler water works.',
  },
];

export type Recipe = { method: MethodId; dose: number; ratio: number; grind: number; temp: number; time: number };

export type Result = {
  /** Contact time in seconds (derived for percolation methods). */
  time: number;
  water: number;
  beverage: number;
  ey: number;
  tds: number;
  zone: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
  ideal: boolean;
  title: string;
  advice: string;
  taste: { acidity: number; sweetness: number; bitterness: number; body: number; clarity: number };
};

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));

export const method = (id: MethodId): Method => METHODS.find((m) => m.id === id)!;

export function defaults(id: MethodId): Recipe {
  const m = method(id);
  return { method: id, dose: m.dose.value, ratio: m.ratio.value, grind: m.grind.value, temp: m.temp.value, time: m.time?.value ?? 0 };
}

/** Contact time: chosen for immersion, a consequence of grind and water for percolation. */
export function contactTime(r: Recipe): number {
  const m = method(r.method);
  if (m.time) return r.time;
  const water = r.dose * r.ratio;
  if (r.method === 'espresso') return 9 + water * 0.53 * Math.pow(m.g0 / r.grind, 2.2);
  return 60 + water * 0.48 * Math.pow(m.g0 / r.grind, 1.4);
}

export function brew(r: Recipe): Result {
  const m = method(r.method);
  const time = contactTime(r);
  const water = r.dose * r.ratio;
  const k = m.k0 * (m.g0 / r.grind) * Math.exp(0.025 * (r.temp - 93));
  // Immersion methods extract a little more with more water (a steeper concentration gradient).
  const gradient = m.time ? 1 + 0.15 * (r.ratio / m.ratio.value - 1) : 1;
  const eyMax = 0.3 + 0.002 * (r.temp - 93);
  const ey = clamp(eyMax * (1 - Math.exp(-k * time)) * gradient, 0.05, 0.32);
  const dissolved = ey * r.dose;
  const beverage = r.method === 'espresso' ? water : Math.max(1, water - m.retained * r.dose + dissolved);
  const tds = (dissolved / beverage) * 100;
  const eyPct = ey * 100;

  const x: -1 | 0 | 1 = eyPct < 18 ? -1 : eyPct > 22 ? 1 : 0;
  const y: -1 | 0 | 1 = tds < m.tds.ideal[0] ? -1 : tds > m.tds.ideal[1] ? 1 : 0;
  const ideal = x === 0 && y === 0;
  const strengthWord = y < 0 ? 'thin' : y > 0 ? 'heavy' : '';
  let title: string;
  let advice: string;
  if (ideal) {
    title = 'Sweet spot.';
    advice = 'Balanced, sweet and clear. Write this recipe down.';
  } else if (x < 0) {
    title = `Sour${strengthWord ? ` and ${strengthWord}` : ''}.`;
    advice = m.time
      ? 'Under-extracted: steep longer, grind finer or use hotter water.'
      : r.method === 'espresso'
        ? 'Under-extracted: grind finer (the shot will run slower) or pull it longer.'
        : 'Under-extracted: grind finer so the water lingers, or brew hotter.';
  } else if (x > 0) {
    title = `Bitter${strengthWord ? ` and ${strengthWord}` : ''}.`;
    advice = m.time ? 'Over-extracted: steep shorter, or grind coarser.' : 'Over-extracted: grind coarser so the water runs through faster, or cool it down.';
  } else if (y < 0) {
    title = 'Well extracted, but watery.';
    advice = r.method === 'espresso' ? 'Too long a shot: stop it earlier (a shorter ratio).' : 'Use less water for this dose (a shorter ratio), or more coffee.';
  } else {
    title = 'Well extracted, but heavy.';
    advice = r.method === 'espresso' ? 'Let the shot run a little longer (a longer ratio).' : 'Use more water for this dose (a longer ratio).';
  }

  const coarse = (r.grind - m.grind.min) / (m.grind.max - m.grind.min);
  const taste = {
    acidity: clamp(0.55 + (20 - eyPct) / 8),
    sweetness: clamp(1 - Math.abs(eyPct - 20) / 5),
    bitterness: clamp(0.15 + (eyPct - 20) / 6),
    body: clamp((tds - m.tds.lo) / (m.tds.hi - m.tds.lo)),
    clarity: clamp((r.method === 'press' ? 0.25 : r.method === 'espresso' ? 0.35 : 0.65) + coarse * 0.3 - (eyPct > 22 ? 0.2 : 0)),
  };
  return { time, water, beverage, ey: eyPct, tds, zone: { x, y }, ideal, title, advice, taste };
}

/** The brew-along steps (seconds, what to do), for the timer. */
export function steps(r: Recipe, res: Result): { at: number; text: string }[] {
  const water = Math.round(r.dose * r.ratio);
  const t = Math.round(res.time);
  switch (r.method) {
    case 'pourover':
      return [
        { at: 0, text: `Bloom: pour ${Math.round(r.dose * 2)} g of water and let it rise` },
        { at: 45, text: `Pour slowly in circles to ${Math.round(water * 0.6)} g` },
        { at: 75, text: `Pour to ${water} g` },
        { at: 105, text: 'Give the dripper a gentle swirl' },
        { at: t, text: 'Drawdown done. Pour and taste.' },
      ];
    case 'espresso':
      return [
        { at: 0, text: 'Start the pump' },
        { at: 7, text: 'First drops: thick and dark' },
        { at: Math.round(t * 0.6), text: 'The stream turns golden' },
        { at: t, text: `Stop at ${Math.round(r.dose * r.ratio)} g` },
      ];
    case 'press':
      return [
        { at: 0, text: `Pour all ${water} g of water, lid on` },
        { at: Math.min(t - 30, 240), text: 'Break the crust and skim the foam' },
        { at: t, text: 'Press gently and pour it all out' },
      ];
    default:
      return [
        { at: 0, text: `Add ${water} g of water` },
        { at: 10, text: 'Stir three times' },
        { at: Math.max(20, t - 30), text: 'Fit the plunger' },
        { at: t, text: 'Press for 30 seconds, until it hisses' },
      ];
  }
}
