import { bySlug, PLANS, type Grind, type PlanId } from './catalog';

export type Size = '250' | '1000';

export type Line = { id: string; slug: string; size: Size; grind: Grind; plan: PlanId; qty: number };

const STORE = 'sayeh.cart.v1';
export const FREE_SHIPPING = 40;
export const SHIPPING = 5;
export const REWARD_CODE = 'SHADE15';
export const REWARD_OFF = 0.15;

/** The shopping bag: lines keyed by coffee, size, grind and plan; persisted locally and shared by every page. */
export class Cart {
  lines: Line[] = [];
  /** Set when the stamp card is full: 15% off the whole bag. */
  rewarded = false;
  private listeners = new Set<(reason: string) => void>();

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]') as Line[];
      this.lines = raw.filter((l) => bySlug(l.slug) && l.qty > 0);
    } catch {
      this.lines = [];
    }
  }

  subscribe(fn: (reason: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(reason: string): void {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.lines));
    } catch {
      /* private mode: the bag still works for this visit */
    }
    this.listeners.forEach((fn) => fn(reason));
  }

  static unit(slug: string, size: Size, plan: PlanId): number {
    const c = bySlug(slug)!;
    const base = size === '250' ? c.price[0] : c.price[1];
    const off = PLANS.find((p) => p.id === plan)?.off ?? 0;
    return Math.round(base * (1 - off) * 100) / 100;
  }

  add(slug: string, size: Size, grind: Grind, plan: PlanId, qty = 1): void {
    const id = `${slug}|${size}|${grind}|${plan}`;
    const line = this.lines.find((l) => l.id === id);
    if (line) line.qty = Math.min(20, line.qty + qty);
    else this.lines.push({ id, slug, size, grind, plan, qty });
    this.changed('add');
  }

  setQty(id: string, qty: number): void {
    const line = this.lines.find((l) => l.id === id);
    if (!line) return;
    if (qty <= 0) this.lines = this.lines.filter((l) => l.id !== id);
    else line.qty = Math.min(20, qty);
    this.changed('qty');
  }

  clear(): void {
    this.lines = [];
    this.changed('clear');
  }

  setRewarded(on: boolean): void {
    if (this.rewarded === on) return;
    this.rewarded = on;
    this.changed('reward');
  }

  get count(): number {
    return this.lines.reduce((a, l) => a + l.qty, 0);
  }

  get subtotal(): number {
    return this.lines.reduce((a, l) => a + Cart.unit(l.slug, l.size, l.plan) * l.qty, 0);
  }

  get discount(): number {
    return this.rewarded ? Math.round(this.subtotal * REWARD_OFF * 100) / 100 : 0;
  }

  get shipping(): number {
    if (!this.lines.length) return 0;
    return this.subtotal - this.discount >= FREE_SHIPPING ? 0 : SHIPPING;
  }

  get total(): number {
    return Math.max(0, this.subtotal - this.discount + this.shipping);
  }

  get hasSubscription(): boolean {
    return this.lines.some((l) => l.plan !== 'once');
  }
}
