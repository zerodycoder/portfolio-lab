import type Lenis from 'lenis';
import type { Cart } from './lib/cart';
import type { Daylight } from './lib/daylight';
import type { Media } from './lib/media';
import type { Sound } from './lib/sound';
import type { Stamps } from './lib/stamps';
import type { Coach } from './ui/coach';
import type { CupHost } from './ui/cup';
import type { Router } from './lib/router';

/** Everything a page can use: one instance of each, shared across navigations. */
export type App = {
  sound: Sound;
  lenis: Lenis;
  cart: Cart;
  stamps: Stamps;
  day: Daylight;
  media: Media;
  router: Router;
  coach: Coach;
  cup: CupHost;
  reduced: boolean;
  /** Resolves when the visitor has come through the entry gate (with or without sound). */
  entered: Promise<boolean>;
  toast(msg: string): void;
  /** Opens the bag drawer. */
  openCart(): void;
};

/** A rendered page: its markup, and the code that brings it to life (returning its own cleanup). */
export type Page = {
  title: string;
  html: string;
  mount?(root: HTMLElement): (() => void) | void;
};

export type PageFactory = (app: App, params: Record<string, string>, query: URLSearchParams) => Page;
