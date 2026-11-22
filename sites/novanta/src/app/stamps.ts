import { $ } from '@portfolio-lab/kit/dom';
import { store } from '../lib/store';

/**
 * The tessera fedeltà: a pizzeria loyalty card with ten stamps. It is the site's discovery layer: every stamp is
 * something to find or do, worded for mouse and touch alike, and each one lands with a rubber-stamp thunk.
 */

export type StampId = 'stretch' | 'sauce' | 'leopard' | 'even' | 'fire' | 'pull' | 'pineapple' | 'classic' | 'door' | 'family';

const LIST: { id: StampId; it: string; en: string }[] = [
  { id: 'stretch', it: 'Mano d’oro', en: 'Stretch a round, even 30 cm base' },
  { id: 'sauce', it: 'Neanche un buco', en: 'Sauce it edge to edge, rim kept clean' },
  { id: 'leopard', it: 'Leopardata', en: 'Bake 30+ leopard spots into the crust' },
  { id: 'even', it: 'Girata giusta', en: 'Turn it enough for an even bake' },
  { id: 'fire', it: 'Soffia sul fuoco', en: 'Fan the fire in the oven' },
  { id: 'pull', it: 'Filo d’oro', en: 'Pull a slice until the cheese snaps' },
  { id: 'pineapple', it: 'La confessione', en: 'Put pineapple on it. We saw.' },
  { id: 'classic', it: 'Un classico', en: 'Bake a classic from the chalkboard' },
  { id: 'door', it: 'Alla porta', en: 'Follow the rider to your door' },
  { id: 'family', it: 'La famiglia', en: 'Meet the family on the photo wall' },
];

export class Stamps {
  private got = new Set<StampId>(store.get<StampId[]>('stamps', []));
  onStamp: ((id: StampId) => void) | null = null;

  constructor() {
    this.render();
    $('[data-tessera]').addEventListener('click', () => this.open());
    $('[data-tessera-close]').addEventListener('click', () => this.close());
    $('[data-tessera-panel]').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
  }

  has(id: StampId): boolean {
    return this.got.has(id);
  }

  get count(): number {
    return this.got.size;
  }

  give(id: StampId): void {
    if (this.got.has(id)) return;
    this.got.add(id);
    store.set('stamps', [...this.got]);
    this.render();
    const s = LIST.find((x) => x.id === id)!;
    const toast = $('[data-stamp-toast]');
    toast.innerHTML = `${s.it}<small>Timbro ${this.got.size}/${LIST.length}</small>`;
    toast.classList.remove('is-on');
    void toast.offsetWidth;
    toast.classList.add('is-on');
    const btn = $('[data-tessera]');
    btn.classList.remove('is-bump');
    void btn.offsetWidth;
    btn.classList.add('is-bump');
    this.onStamp?.(id);
  }

  private render(): void {
    $('[data-tessera-count]').textContent = `${this.got.size}/${LIST.length}`;
    $('[data-tessera-grid]').innerHTML = LIST.map(
      (s, i) => `<li class="${this.got.has(s.id) ? 'is-got' : ''}"><i>${this.got.has(s.id) ? 'N°' + (i + 1) : ''}</i><span><b>${s.it}</b>${s.en}</span></li>`,
    ).join('');
  }

  open(): void {
    $('[data-tessera-panel]').hidden = false;
  }

  close(): void {
    $('[data-tessera-panel]').hidden = true;
  }
}
