export type Finish = 'graphite' | 'ember' | 'ash' | 'bone' | 'olive';

export const FINISH_ORDER: Finish[] = ['graphite', 'ember', 'ash', 'bone', 'olive'];

export type FinishInfo = {
  name: string;
  desc: string;
  price: string;
  code: string;
  accent: string;
  rgb: [number, number, number];
  paint: string;
};

export const FINISHES: Record<Finish, FinishInfo> = {
  graphite: {
    name: 'Graphite',
    desc: 'Matte graphite with a copper seam. The way it leaves the forge.',
    price: '$24,900',
    code: 'GR',
    accent: '#ff6a2a',
    rgb: [255, 106, 42],
    paint: '#2c2c2e',
  },
  ember: {
    name: 'Ember',
    desc: 'Deep red lacquer, eleven hand-sprayed coats. The colour of the horse it is named for.',
    price: '$26,400',
    code: 'EM',
    accent: '#ff4326',
    rgb: [255, 67, 38],
    paint: '#9b2e18',
  },
  ash: {
    name: 'Ash',
    desc: 'Bead-blasted ash grey. Cold to look at, warm to ride.',
    price: '$25,200',
    code: 'AS',
    accent: '#9cc4dc',
    rgb: [156, 196, 220],
    paint: '#a5a6a4',
  },
  bone: {
    name: 'Bone',
    desc: 'Bone-white ceramic coat over bare aluminium. It shows every line.',
    price: '$25,600',
    code: 'BN',
    accent: '#ecc9a0',
    rgb: [236, 201, 160],
    paint: '#e6e2da',
  },
  olive: {
    name: 'Olive',
    desc: 'Matte field olive with copper hardware. Built to be ridden hard and parked anywhere.',
    price: '$25,900',
    code: 'OL',
    accent: '#c2cf6c',
    rgb: [194, 207, 108],
    paint: '#4b5a2c',
  },
};

type Listener = (finish: Finish, source: string) => void;

let current: Finish = 'graphite';
const listeners = new Set<Listener>();

/** Shared finish selection: the configurator and the reservation form both read and write it. */
export const finishStore = {
  get: (): Finish => current,
  rgb: (): [number, number, number] => FINISHES[current].rgb,
  set(next: Finish, source = ''): void {
    if (next === current) return;
    current = next;
    const root = document.documentElement.style;
    root.setProperty('--accent', FINISHES[next].accent);
    root.setProperty('--accent-rgb', FINISHES[next].rgb.join(', '));
    listeners.forEach((fn) => fn(next, source));
  },
  on(fn: Listener): void {
    listeners.add(fn);
  },
};
