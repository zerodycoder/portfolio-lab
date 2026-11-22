/**
 * The coffees. SAYEH and every farm and producer here are fictional; the regions, varietals, processes and
 * altitudes are realistic for where they're set. Everything on the site (labels, map, wheel, shop) reads from this.
 */

export type Roast = 'light' | 'medium' | 'espresso';

export type Coffee = {
  slug: string;
  name: string;
  kind: 'single' | 'blend' | 'decaf';
  country: string;
  region: string;
  farm: string;
  producer: string;
  altitude: [number, number];
  process: string;
  varietal: string;
  /** Harvest months, 1–12. */
  harvest: number[];
  notes: string[];
  roast: Roast;
  /** 0 = very light, 1 = dark. */
  roastLevel: number;
  /** Prices in USD for 250 g and 1 kg. */
  price: [number, number];
  lat: number;
  lon: number;
  /** The origin (map/photo) this coffee belongs to. Blends point at their main component. */
  origin: OriginId;
  shade: string;
  line: string;
  story: string;
  /** What the lab suggests for it. */
  best: string;
  /** Pouch colour. */
  bag: string;
};

export type OriginId = 'ethiopia' | 'colombia' | 'kenya' | 'guatemala';

export const COFFEES: Coffee[] = [
  {
    slug: 'hambela-shade',
    name: 'Hambela Shade',
    kind: 'single',
    country: 'Ethiopia',
    region: 'Guji, Oromia',
    farm: 'Smallholders around Hambela',
    producer: 'A washing station shared by 640 families',
    altitude: [2050, 2250],
    process: 'Washed',
    varietal: 'Ethiopian landraces',
    harvest: [11, 12, 1],
    notes: ['Jasmine', 'Bergamot', 'White peach'],
    roast: 'light',
    roastLevel: 0.18,
    price: [19, 64],
    lat: 5.95,
    lon: 38.92,
    origin: 'ethiopia',
    shade: 'Wild forest canopy: the coffee grows half-wild under native trees.',
    line: 'Floral and clear, like tea that grew up.',
    story:
      'Coffee was born in forests like this one. In Guji the shrubs grow under a native canopy that was never cleared, picked cherry by cherry and washed in mountain water. We roast it as lightly as it will let us.',
    best: 'Pour-over',
    bag: '#e9e1d2',
  },
  {
    slug: 'los-guamos',
    name: 'Finca Los Guamos',
    kind: 'single',
    country: 'Colombia',
    region: 'Pitalito, Huila',
    farm: 'Finca Los Guamos',
    producer: 'A family farm, third generation',
    altitude: [1750, 1900],
    process: 'Washed',
    varietal: 'Pink Bourbon',
    harvest: [4, 5, 6, 10, 11],
    notes: ['Red apple', 'Panela', 'Cacao nib'],
    roast: 'light',
    roastLevel: 0.3,
    price: [21, 70],
    lat: 1.85,
    lon: -76.05,
    origin: 'colombia',
    shade: 'Named after its guamo trees: tall Inga that shade every row.',
    line: 'Crisp and sweet. The one we drink at home.',
    story:
      'The farm is named after its shade trees, the guamos (Inga) that fix nitrogen into the soil and keep the slope cool. Pink Bourbon is fussy to grow and worth it: a crisp apple sweetness that holds up hot or cold.',
    best: 'Pour-over or AeroPress',
    bag: '#d9c3a5',
  },
  {
    slug: 'karii-hill',
    name: 'Karii Hill AA',
    kind: 'single',
    country: 'Kenya',
    region: 'Nyeri',
    farm: 'Karii Hill growers',
    producer: 'A cooperative factory on the slopes of Mount Kenya',
    altitude: [1750, 1850],
    process: 'Washed, double fermented',
    varietal: 'SL28, SL34',
    harvest: [10, 11, 12],
    notes: ['Blackcurrant', 'Grapefruit', 'Brown sugar'],
    roast: 'light',
    roastLevel: 0.24,
    price: [23, 78],
    lat: -0.42,
    lon: 36.95,
    origin: 'kenya',
    shade: 'Grevillea and macadamia rows break the afternoon sun.',
    line: 'Loud, juicy, unmistakably Kenyan.',
    story:
      'Red volcanic soil, cold nights and SL28: the recipe for the most electric cups we buy. Each lot is fermented twice and dried on raised beds under the eye of the factory manager. Expect blackcurrant.',
    best: 'Pour-over',
    bag: '#e7d6cf',
  },
  {
    slug: 'el-cedro',
    name: 'El Cedro',
    kind: 'single',
    country: 'Guatemala',
    region: 'Huehuetenango',
    farm: 'Finca El Cedro',
    producer: 'An estate that keeps a third of its land as forest',
    altitude: [1600, 1800],
    process: 'Washed',
    varietal: 'Bourbon, Caturra',
    harvest: [1, 2, 3],
    notes: ['Dark chocolate', 'Plum', 'Toffee'],
    roast: 'medium',
    roastLevel: 0.48,
    price: [18, 60],
    lat: 15.32,
    lon: -91.47,
    origin: 'guatemala',
    shade: 'Cedar and avocado trees over the coffee, a forest kept on purpose.',
    line: 'Round, chocolatey, forgiving.',
    story:
      'Dry winds from Mexico keep Huehuetenango’s high slopes free of frost. El Cedro grows under its namesake trees and keeps a third of the estate wild. A coffee that is good however you brew it.',
    best: 'French press or espresso',
    bag: '#c9a27c',
  },
  {
    slug: 'under-the-cedar',
    name: 'Under the Cedar',
    kind: 'blend',
    country: 'Guatemala & Ethiopia',
    region: 'House espresso',
    farm: 'El Cedro + Hambela natural',
    producer: 'Blended and roasted in Lisbon',
    altitude: [1600, 2250],
    process: 'Washed + natural',
    varietal: 'Bourbon, Caturra, landraces',
    harvest: [1, 2, 3, 11, 12],
    notes: ['Milk chocolate', 'Cherry', 'Hazelnut'],
    roast: 'espresso',
    roastLevel: 0.62,
    price: [17, 56],
    lat: 15.32,
    lon: -91.47,
    origin: 'guatemala',
    shade: 'Two shade forests in one cup.',
    line: 'Our house espresso, built for milk.',
    story:
      'Named after the cedar our café sits under. Sixty percent El Cedro for body and chocolate, forty percent natural Ethiopian for a cherry top note that survives the milk. It’s what’s in the cup above.',
    best: 'Espresso',
    bag: '#2b211b',
  },
  {
    slug: 'night-shade',
    name: 'Night Shade',
    kind: 'decaf',
    country: 'Colombia',
    region: 'Huila',
    farm: 'Huila smallholders',
    producer: 'Decaffeinated with sugarcane ethyl acetate in Caldas',
    altitude: [1600, 1850],
    process: 'Washed, sugarcane decaf',
    varietal: 'Caturra, Castillo',
    harvest: [4, 5, 6, 10, 11],
    notes: ['Caramel', 'Red berries', 'Cocoa'],
    roast: 'medium',
    roastLevel: 0.45,
    price: [18, 60],
    lat: 2.2,
    lon: -75.6,
    origin: 'colombia',
    shade: 'Grown under the same Huila canopy as Los Guamos.',
    line: 'Decaf for the evening menu. You won’t miss a thing.',
    story:
      'Decaffeinated in Colombia with ethyl acetate made from sugarcane, a gentle process that leaves the sweetness in. We pour it after six, when the café lights come on.',
    best: 'Any method',
    bag: '#1f2a3a',
  },
];

export const bySlug = (slug: string): Coffee | undefined => COFFEES.find((c) => c.slug === slug);

export type Origin = {
  id: OriginId;
  country: string;
  region: string;
  lat: number;
  lon: number;
  altitude: number;
  coffee: string;
  /** Terrain for the elevation silhouette: height samples across the farm's valley, metres. */
  terrain: number[];
  fact: string;
};

export const ORIGINS: Origin[] = [
  {
    id: 'ethiopia',
    country: 'Ethiopia',
    region: 'Guji',
    lat: 5.95,
    lon: 38.92,
    altitude: 2150,
    coffee: 'hambela-shade',
    terrain: [1650, 1720, 1810, 1960, 2080, 2150, 2230, 2190, 2120, 2210, 2290, 2240, 2100, 1980, 1900],
    fact: 'Where coffee was born: Arabica still grows wild in these forests.',
  },
  {
    id: 'colombia',
    country: 'Colombia',
    region: 'Huila',
    lat: 1.85,
    lon: -76.05,
    altitude: 1820,
    coffee: 'los-guamos',
    terrain: [1250, 1380, 1520, 1700, 1820, 1900, 2050, 2240, 2400, 2300, 2120, 1960, 1800, 1650, 1500],
    fact: 'Two harvests a year: the main crop and the smaller “mitaca”.',
  },
  {
    id: 'kenya',
    country: 'Kenya',
    region: 'Nyeri',
    lat: -0.42,
    lon: 36.95,
    altitude: 1800,
    coffee: 'karii-hill',
    terrain: [1620, 1680, 1740, 1800, 1830, 1880, 1990, 2150, 2400, 2700, 2950, 2800, 2500, 2200, 1900],
    fact: 'On the shoulder of Mount Kenya, in volcanic red soil.',
  },
  {
    id: 'guatemala',
    country: 'Guatemala',
    region: 'Huehuetenango',
    lat: 15.32,
    lon: -91.47,
    altitude: 1700,
    coffee: 'el-cedro',
    terrain: [1300, 1420, 1560, 1700, 1760, 1720, 1650, 1780, 1950, 2200, 2500, 2800, 2650, 2300, 2000],
    fact: 'Warm winds from Mexico keep the highest farms free of frost.',
  },
];

/** The café and roastery. */
export const LISBON = { lat: 38.716, lon: -9.149, name: 'Lisbon', timeZone: 'Europe/Lisbon' };

/** Flavour notes on the wheel: family → note → colour. */
export const WHEEL: { family: string; color: string; notes: { name: string; color: string }[] }[] = [
  {
    family: 'Floral',
    color: '#c9a7c7',
    notes: [
      { name: 'Jasmine', color: '#e7d7a2' },
      { name: 'Orange blossom', color: '#f1c27d' },
      { name: 'Black tea', color: '#8a5a3c' },
    ],
  },
  {
    family: 'Fruit',
    color: '#c8504a',
    notes: [
      { name: 'Blackcurrant', color: '#4b2246' },
      { name: 'Red berries', color: '#b83a4b' },
      { name: 'Cherry', color: '#a3243b' },
      { name: 'Plum', color: '#6b2c4f' },
      { name: 'White peach', color: '#f2a679' },
      { name: 'Red apple', color: '#c8423b' },
      { name: 'Grapefruit', color: '#f07b6b' },
      { name: 'Bergamot', color: '#c9b23a' },
    ],
  },
  {
    family: 'Sweet',
    color: '#c98a3c',
    notes: [
      { name: 'Panela', color: '#b9772c' },
      { name: 'Brown sugar', color: '#a8662f' },
      { name: 'Toffee', color: '#c08a3e' },
      { name: 'Caramel', color: '#c98a3c' },
      { name: 'Honey', color: '#e0a83e' },
    ],
  },
  {
    family: 'Cocoa & nut',
    color: '#6a4030',
    notes: [
      { name: 'Cacao nib', color: '#5a3325' },
      { name: 'Dark chocolate', color: '#3b2219' },
      { name: 'Milk chocolate', color: '#8a5a3b' },
      { name: 'Cocoa', color: '#6a4030' },
      { name: 'Hazelnut', color: '#a87b4f' },
    ],
  },
  {
    family: 'Spice',
    color: '#9a6a3a',
    notes: [
      { name: 'Cinnamon', color: '#b06a3a' },
      { name: 'Clove', color: '#6e3b2a' },
      { name: 'Cedar', color: '#8b6a48' },
    ],
  },
];

export const noteColor = (name: string): string => {
  for (const f of WHEEL) for (const n of f.notes) if (n.name === name) return n.color;
  return '#8a6a4a';
};

export const familyOf = (name: string): string => WHEEL.find((f) => f.notes.some((n) => n.name === name))?.family ?? '';

export const GRINDS = ['Whole bean', 'Espresso', 'Moka pot', 'Filter', 'French press'] as const;
export type Grind = (typeof GRINDS)[number];

export const PLANS = [
  { id: 'once', label: 'One-off', off: 0 },
  { id: '2w', label: 'Every 2 weeks', off: 0.12 },
  { id: '4w', label: 'Every 4 weeks', off: 0.12 },
] as const;
export type PlanId = (typeof PLANS)[number]['id'];
