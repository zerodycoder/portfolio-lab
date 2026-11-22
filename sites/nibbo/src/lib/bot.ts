/**
 * The visitor's Nibbo: shell colour, face light, accessory and name. One store shared by the 3D robot, the
 * configurator, the adoption box and the page accent. It round-trips through the URL (`?bot=`), so an adopted
 * Nibbo can be shared as a link that opens the site with that exact robot.
 */

export const SHELLS = {
  tangerine: { name: 'Tangerine', hex: '#ff6a2b', ink: '#1e1b2e' },
  mint: { name: 'Mint', hex: '#34cf9b', ink: '#1e1b2e' },
  sky: { name: 'Sky', hex: '#4a8bff', ink: '#ffffff' },
  butter: { name: 'Butter', hex: '#ffc531', ink: '#1e1b2e' },
  bubblegum: { name: 'Bubblegum', hex: '#ff77b0', ink: '#1e1b2e' },
  midnight: { name: 'Midnight', hex: '#3b3760', ink: '#ffffff' },
} as const;

export const LEDS = {
  ice: { name: 'Ice', hex: '#7cf3ff' },
  lime: { name: 'Lime', hex: '#b8ff5e' },
  amber: { name: 'Amber', hex: '#ffb648' },
  rose: { name: 'Rose', hex: '#ff86dd' },
} as const;

export const ACCESSORIES = {
  none: { name: 'Nothing', price: 0 },
  propeller: { name: 'Propeller cap', price: 12 },
  phones: { name: 'Headphones', price: 15 },
  sprout: { name: 'Sprout', price: 9 },
} as const;

export type Shell = keyof typeof SHELLS;
export type Led = keyof typeof LEDS;
export type Accessory = keyof typeof ACCESSORIES;
export type Bot = { shell: Shell; led: Led; accessory: Accessory; name: string };

export const BASE_PRICE = 149;
export const NAME_MAX = 12;

const DEFAULT: Bot = { shell: 'tangerine', led: 'ice', accessory: 'none', name: 'Nibbo' };

/** Letters, digits, spaces and a few friendly marks; anything else is dropped. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} '\-!.]/gu, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, NAME_MAX);
}

function fromUrl(): Partial<Bot> & { shared: boolean } {
  try {
    const raw = new URLSearchParams(location.search).get('bot');
    if (!raw) return { shared: false };
    const [shell, led, accessory, ...rest] = raw.split('.');
    const name = cleanName(decodeURIComponent(rest.join('.'))).trim();
    return {
      shared: true,
      shell: shell in SHELLS ? (shell as Shell) : undefined,
      led: led in LEDS ? (led as Led) : undefined,
      accessory: accessory in ACCESSORIES ? (accessory as Accessory) : undefined,
      name: name || undefined,
    };
  } catch {
    return { shared: false };
  }
}

type Listener = (bot: Bot, changed: keyof Bot | null) => void;

class BotStore {
  readonly shared: boolean;
  private state: Bot;
  private listeners = new Set<Listener>();

  constructor() {
    const url = fromUrl();
    this.shared = url.shared;
    this.state = {
      shell: url.shell ?? DEFAULT.shell,
      led: url.led ?? DEFAULT.led,
      accessory: url.accessory ?? DEFAULT.accessory,
      name: url.name ?? DEFAULT.name,
    };
  }

  get(): Bot {
    return this.state;
  }

  set<K extends keyof Bot>(key: K, value: Bot[K]): void {
    if (this.state[key] === value) return;
    this.state = { ...this.state, [key]: value };
    this.listeners.forEach((fn) => fn(this.state, key));
  }

  /** Calls back now and on every change. */
  subscribe(fn: Listener): void {
    this.listeners.add(fn);
    fn(this.state, null);
  }

  price(): number {
    return BASE_PRICE + ACCESSORIES[this.state.accessory].price;
  }

  /** A link that opens the site with this exact robot. */
  shareUrl(): string {
    const { shell, led, accessory, name } = this.state;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('bot', `${shell}.${led}.${accessory}.${encodeURIComponent(name.trim() || DEFAULT.name)}`);
    return url.toString();
  }
}

export const bot = new BotStore();
