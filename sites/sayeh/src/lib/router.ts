import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { App, PageFactory } from '../app';

type Loader = () => Promise<{ default: PageFactory }>;
type RouteDef = { name: string; pattern: RegExp; keys: string[]; load: Loader };

type VT = { finished: Promise<void>; updateCallbackDone: Promise<void>; ready: Promise<void> };
type DocVT = Document & { startViewTransition?: (cb: () => void) => VT };

/** '/shop/:slug' → a regexp with named keys. */
function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = path
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { pattern: new RegExp(`^${src === '' ? '/' : src}/?$`), keys };
}

/**
 * A small History-API router. Pages are code-split modules loaded on demand (and prefetched when a link is
 * hovered). Navigations run inside the View Transitions API where it exists, so shared elements (a coffee bag
 * from the shop grid to its page) morph and pages cross-fade; elsewhere the swap is instant. Back and forward
 * restore the scroll position; links into a section (`/#roast`) scroll to it after the page mounts.
 */
export class Router {
  private routes: RouteDef[] = [];
  private fallback: Loader | null = null;
  private cleanup: (() => void) | void = undefined;
  private busy = false;
  private queued: { url: URL; mode: 'push' | 'pop' | 'replace' } | null = null;
  current = '';
  private listeners = new Set<(name: string, path: string) => void>();

  constructor(
    private app: App,
    private view: HTMLElement,
  ) {
    document.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('popstate', () => void this.navigate(new URL(location.href), 'pop'));
    document.addEventListener(
      'pointerover',
      (e) => {
        const a = (e.target as Element | null)?.closest?.('a[href^="/"]');
        if (a) this.prefetch(a.getAttribute('href')!);
      },
      { passive: true },
    );
  }

  add(path: string, name: string, load: Loader): this {
    this.routes.push({ name, load, ...compile(path) });
    return this;
  }

  notFound(load: Loader): this {
    this.fallback = load;
    return this;
  }

  onChange(fn: (name: string, path: string) => void): void {
    this.listeners.add(fn);
  }

  private match(pathname: string): { route: RouteDef | null; params: Record<string, string> } {
    for (const r of this.routes) {
      const m = r.pattern.exec(pathname);
      if (m) {
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
    }
    return { route: null, params: {} };
  }

  prefetch(href: string): void {
    const { route } = this.match(new URL(href, location.origin).pathname);
    void route?.load().catch(() => undefined);
  }

  private onClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    e.preventDefault();
    this.go(href);
  }

  go(href: string, replace = false): void {
    const url = new URL(href, location.origin);
    if (url.pathname === location.pathname && url.search === location.search) {
      // Same page: just scroll to the section (or the top).
      this.scrollToHash(url.hash, true);
      if (url.hash) history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      return;
    }
    void this.navigate(url, replace ? 'replace' : 'push');
  }

  start(): Promise<void> {
    return this.navigate(new URL(location.href), 'initial');
  }

  private scrollToHash(hash: string, smooth: boolean): void {
    const lenis = this.app.lenis;
    if (!hash) {
      lenis.scrollTo(0, { immediate: !smooth, force: true, duration: 1.2 });
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (el) lenis.scrollTo(el, { immediate: !smooth, force: true, duration: 1.4, offset: -10 });
  }

  private async navigate(url: URL, mode: 'push' | 'pop' | 'replace' | 'initial'): Promise<void> {
    if (this.busy && mode !== 'initial') {
      this.queued = { url, mode: mode as 'push' | 'pop' | 'replace' };
      return;
    }
    this.busy = true;
    const { route, params } = this.match(url.pathname);
    const loader = route?.load ?? this.fallback!;
    let factory: PageFactory;
    try {
      factory = (await loader()).default;
    } catch {
      // A chunk failed to load (offline, or a new deploy): fall back to a full page load.
      location.href = url.href;
      return;
    }
    const restoreY = mode === 'pop' ? ((history.state as { y?: number } | null)?.y ?? 0) : 0;
    if (mode === 'push' || mode === 'replace') {
      history.replaceState({ ...(history.state ?? {}), y: window.scrollY }, '');
      if (mode === 'push') history.pushState({ y: 0 }, '', url.pathname + url.search + url.hash);
      else history.replaceState({ y: 0 }, '', url.pathname + url.search + url.hash);
    }
    const page = factory(this.app, params, url.searchParams);
    const name = route?.name ?? 'notfound';

    const swap = (): void => {
      if (this.cleanup) this.cleanup();
      this.cleanup = undefined;
      ScrollTrigger.getAll().forEach((t) => t.kill());
      this.view.innerHTML = page.html;
      this.view.dataset.page = name;
      document.documentElement.dataset.page = name;
      document.title = page.title;
      this.current = name;
      this.app.lenis.scrollTo(mode === 'pop' ? restoreY : 0, { immediate: true, force: true });
      this.cleanup = page.mount?.(this.view);
      this.listeners.forEach((fn) => fn(name, url.pathname));
    };

    const doc = document as DocVT;
    document.documentElement.dataset.dir = mode === 'pop' ? 'back' : 'forward';
    if (mode !== 'initial' && doc.startViewTransition && !this.app.reduced) {
      const vt = doc.startViewTransition(swap);
      await vt.updateCallbackDone.catch(() => undefined);
      void vt.finished.finally(() => ScrollTrigger.refresh());
    } else swap();
    ScrollTrigger.refresh();
    if (mode !== 'pop' && url.hash) requestAnimationFrame(() => this.scrollToHash(url.hash, mode !== 'initial'));
    if (mode !== 'initial') {
      this.app.sound.paper();
      this.view.focus({ preventScroll: true });
    }
    this.busy = false;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      void this.navigate(q.url, q.mode);
    }
  }
}
