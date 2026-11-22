/**
 * Everything that can go on a NOVANTA pizza: names (Italian first, English under it), prices, real-world sizes,
 * how a piece looks in profile, how it behaves in the oven and what the pizzaiolo says about it.
 */

export type Stage = 'cheese' | 'pre' | 'post';
export type Profile = 'flat' | 'dome' | 'pillow' | 'leaf';

/** How a topping reacts to heat. Every field is the full effect at cook = 1. */
export type Cook = {
  /** Melts into the cheese layer (fior di latte, bufala) or the orange oil layer ('nduja). */
  melt?: 'cheese' | 'nduja';
  /** Edges lift into a cup (salami). */
  curl?: number;
  /** Shrinks to this scale. */
  shrink?: number;
  /** Darkens towards this RGB multiplier. */
  tint?: [number, number, number];
  /** Gets glossy (oil comes out). */
  gloss?: number;
  /** Chars at the edges past this cook level. */
  charAt?: number;
};

export type Kind = {
  id: string;
  it: string;
  en: string;
  stage: Stage;
  price: number;
  /** Longest side of one piece in metres. */
  size: number;
  /** Peak height of one piece in metres. */
  thick: number;
  profile: Profile;
  /** Pieces per handful. */
  handful: number;
  cook: Cook;
  /** Average colour, used for chips and fallbacks. */
  color: string;
  /** Scale degree of its landing note (pentatonic), so a handful plays a little tune. */
  note: number;
  /** What the pizzaiolo says the first time it goes on. [Italian, English] */
  say?: [string, string];
};

export const KINDS: Kind[] = [
  // Cheese
  { id: 'fiordilatte', it: 'Fior di latte', en: 'Cow’s-milk mozzarella', stage: 'cheese', price: 1.5, size: 0.034, thick: 0.012, profile: 'pillow', handful: 7, cook: { melt: 'cheese' }, color: '#f3efe4', note: 0 },
  { id: 'bufala', it: 'Bufala', en: 'Buffalo mozzarella', stage: 'cheese', price: 3, size: 0.038, thick: 0.014, profile: 'pillow', handful: 6, cook: { melt: 'cheese', gloss: 0.6 }, color: '#f6f3ea', note: 1, say: ['Bufala campana. Ottima scelta.', 'Buffalo mozzarella from Campania. Excellent choice.'] },
  // Before the oven
  { id: 'salame', it: 'Salame piccante', en: 'Spicy salami', stage: 'pre', price: 2, size: 0.042, thick: 0.002, profile: 'flat', handful: 6, cook: { curl: 1, tint: [0.5, 0.3, 0.26], gloss: 0.45, charAt: 1.2 }, color: '#a8322b', note: 2 },
  { id: 'nduja', it: '’Nduja', en: 'Spicy spreadable salami', stage: 'pre', price: 2.5, size: 0.026, thick: 0.008, profile: 'dome', handful: 6, cook: { melt: 'nduja', gloss: 1 }, color: '#c2391f', note: 3, say: ['’Nduja! Piccante, eh.', '’Nduja! It’s hot, careful.'] },
  { id: 'funghi', it: 'Funghi', en: 'Mushrooms', stage: 'pre', price: 1.5, size: 0.036, thick: 0.004, profile: 'flat', handful: 6, cook: { shrink: 0.84, tint: [0.48, 0.34, 0.2], charAt: 1.3 }, color: '#d8c7ad', note: 4 },
  { id: 'olive', it: 'Olive nere', en: 'Black olives', stage: 'pre', price: 1, size: 0.02, thick: 0.009, profile: 'dome', handful: 8, cook: { shrink: 0.94, gloss: 0.4 }, color: '#2a2224', note: 5 },
  { id: 'cipolla', it: 'Cipolla rossa', en: 'Red onion', stage: 'pre', price: 1, size: 0.04, thick: 0.003, profile: 'flat', handful: 6, cook: { shrink: 0.9, tint: [0.6, 0.42, 0.38], charAt: 1.15 }, color: '#9a4a7c', note: 6 },
  { id: 'carciofi', it: 'Carciofi', en: 'Artichokes', stage: 'pre', price: 2, size: 0.034, thick: 0.009, profile: 'dome', handful: 5, cook: { tint: [0.55, 0.42, 0.25], charAt: 1.25 }, color: '#a8a46a', note: 7 },
  { id: 'acciughe', it: 'Acciughe', en: 'Anchovies', stage: 'pre', price: 2, size: 0.05, thick: 0.004, profile: 'flat', handful: 5, cook: { shrink: 0.92, gloss: 0.6 }, color: '#7a5a48', note: 8, say: ['Acciughe di Cetara. Da veri napoletani.', 'Anchovies from Cetara. A true Neapolitan.'] },
  { id: 'pomodorini', it: 'Pomodorini', en: 'Cherry tomatoes', stage: 'pre', price: 1.5, size: 0.026, thick: 0.01, profile: 'dome', handful: 7, cook: { shrink: 0.86, tint: [0.68, 0.42, 0.36], gloss: 0.7, charAt: 1.25 }, color: '#d2382b', note: 9 },
  { id: 'friarielli', it: 'Friarielli', en: 'Neapolitan broccoli rabe', stage: 'pre', price: 2.5, size: 0.04, thick: 0.005, profile: 'leaf', handful: 6, cook: { tint: [0.42, 0.42, 0.3], charAt: 1.2 }, color: '#3e5a2a', note: 10, say: ['Friarielli! Questo è Napoli.', 'Friarielli! Now that is Naples.'] },
  { id: 'basilico', it: 'Basilico', en: 'Basil, baked', stage: 'pre', price: 0, size: 0.046, thick: 0.002, profile: 'leaf', handful: 5, cook: { shrink: 0.86, tint: [0.12, 0.16, 0.08], gloss: 0.7, charAt: 1.0 }, color: '#3f8a35', note: 11 },
  { id: 'ananas', it: 'Ananas', en: 'Pineapple', stage: 'pre', price: 1.5, size: 0.026, thick: 0.011, profile: 'dome', handful: 7, cook: { tint: [0.8, 0.5, 0.24], charAt: 1.3 }, color: '#e9c34f', note: 12, say: ['Ananas? Va bene… non lo dico a nessuno.', 'Pineapple? Fine… I won’t tell anyone.'] },
  // After the oven
  { id: 'crudo', it: 'Prosciutto crudo', en: 'Cured ham', stage: 'post', price: 3.5, size: 0.08, thick: 0.004, profile: 'leaf', handful: 4, cook: {}, color: '#c86a6a', note: 0, say: ['Il crudo va dopo il forno. Sempre.', 'Prosciutto goes on after the oven. Always.'] },
  { id: 'rucola', it: 'Rucola', en: 'Rocket', stage: 'post', price: 1, size: 0.05, thick: 0.002, profile: 'leaf', handful: 10, cook: {}, color: '#4d7a32', note: 2 },
  { id: 'burrata', it: 'Burrata', en: 'Burrata', stage: 'post', price: 4, size: 0.055, thick: 0.03, profile: 'pillow', handful: 2, cook: {}, color: '#f5f1e6', note: 4, say: ['Burrata fredda sulla pizza calda. Che meraviglia.', 'Cold burrata on a hot pizza. Marvellous.'] },
  { id: 'parmigiano', it: 'Parmigiano', en: 'Parmesan shavings', stage: 'post', price: 1.5, size: 0.03, thick: 0.002, profile: 'leaf', handful: 8, cook: {}, color: '#ead9a8', note: 7 },
  { id: 'basilico_fresco', it: 'Basilico fresco', en: 'Fresh basil', stage: 'post', price: 0, size: 0.046, thick: 0.002, profile: 'leaf', handful: 5, cook: {}, color: '#3f8a35', note: 9 },
];

export const KIND: Record<string, Kind> = Object.fromEntries(KINDS.map((k) => [k.id, k]));

/** Which sprite sheet a kind is drawn from (fresh basil reuses the basil sheet). */
export const sheetOf = (id: string): string => (id === 'basilico_fresco' ? 'basilico' : id);

export type SauceId = 'rossa' | 'bianca';
export const SAUCES: { id: SauceId; it: string; en: string; price: number }[] = [
  { id: 'rossa', it: 'Pomodoro San Marzano', en: 'San Marzano tomato', price: 0 },
  { id: 'bianca', it: 'Bianca, olio e aglio', en: 'White: olive oil and garlic', price: 0 },
];

/** Drizzles drawn on after the oven. */
export const DRIZZLES = [
  { id: 'miele', it: 'Miele piccante', en: 'Hot honey', price: 1.5 },
  { id: 'olio', it: 'Olio extravergine', en: 'Extra-virgin olive oil', price: 0 },
] as const;
export type DrizzleId = (typeof DRIZZLES)[number]['id'];

/** Sizes: diameter in cm, the dough radius (m) that counts as reaching it, and the base price. */
export const SIZES = [
  { cm: 26, it: 'Piccola', radius: 0.13, price: 7 },
  { cm: 30, it: 'Classica', radius: 0.15, price: 8.5 },
  { cm: 34, it: 'Grande', radius: 0.17, price: 10 },
] as const;

export const MAX_TOPPING_KINDS = 5;

/** The classics on the chalkboard, used by "Order a classic". */
export type Classic = {
  id: string;
  name: string;
  en: string;
  sauce: SauceId;
  cheese: string | null;
  pre: string[];
  post: string[];
  drizzle: DrizzleId[];
  price: number;
  story: string;
};

export const CLASSICS: Classic[] = [
  { id: 'margherita', name: 'Margherita', en: 'Tomato, fior di latte, basil', sauce: 'rossa', cheese: 'fiordilatte', pre: ['basilico'], post: [], drizzle: ['olio'], price: 9, story: 'Named for a queen in 1889. Red, white and green, like the flag.' },
  { id: 'marinara', name: 'Marinara', en: 'Tomato, garlic, oregano, oil', sauce: 'rossa', cheese: null, pre: [], post: [], drizzle: ['olio'], price: 7, story: 'Older than the Margherita. What the fishermen ate.' },
  { id: 'diavola', name: 'Diavola', en: 'Tomato, fior di latte, spicy salami', sauce: 'rossa', cheese: 'fiordilatte', pre: ['salame'], post: [], drizzle: [], price: 11, story: 'The devil’s own. Ask for chilli oil.' },
  { id: 'ortolana', name: 'Ortolana', en: 'Mushrooms, artichokes, red onion, olives', sauce: 'rossa', cheese: 'fiordilatte', pre: ['funghi', 'carciofi', 'cipolla', 'olive'], post: [], drizzle: [], price: 11, story: 'From the vegetable garden behind the shop.' },
  { id: 'nduja', name: '’Nduja e miele', en: 'Bufala, ’nduja, hot honey', sauce: 'rossa', cheese: 'bufala', pre: ['nduja'], post: [], drizzle: ['miele'], price: 12, story: 'Calabria came to visit and never left.' },
  { id: 'crudo', name: 'Crudo e rucola', en: 'Bianca, prosciutto, rocket, parmesan', sauce: 'bianca', cheese: 'fiordilatte', pre: [], post: ['crudo', 'rucola', 'parmigiano'], drizzle: ['olio'], price: 13, story: 'Everything green goes on after the fire.' },
];
