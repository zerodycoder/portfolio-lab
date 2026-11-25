/**
 * What a floating robot must not cover on a phone: the lines of text and the visible controls and cards inside a
 * section, as screen rectangles. Text is measured line by line (a short heading leaves the screen edge next to it
 * free, a full paragraph doesn't). The lists of text nodes and boxes are cached per section and rebuilt every second
 * (sections rewrite some of their text), the rectangles themselves are read live.
 */
type Scan = { at: number; texts: Text[]; boxes: Element[] };

const BOXY = 'button, input, textarea, select, img, video, canvas, svg, [role="switch"], [role="radio"]';
// Decorative layers and layout boxes that only look like obstacles.
const SKIP = '.slot, .chat__stick, .footer__sky, .footer__night, [data-dock-ignore]';

export class Clearance {
  private scans = new Map<Element, Scan>();
  private range = document.createRange();

  constructor(private stageCanvas: HTMLCanvasElement) {
    addEventListener('resize', () => this.scans.clear());
  }

  private scan(root: Element): Scan {
    const texts: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue?.trim() && !n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    const boxes: Element[] = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el === this.stageCanvas || el.closest(SKIP)) return;
      if (el.matches(BOXY)) {
        // An svg's own shapes are covered by the svg box.
        if (!el.parentElement?.closest('svg')) boxes.push(el);
        return;
      }
      const cs = getComputedStyle(el);
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none';
      if (filled) boxes.push(el);
    });
    return { at: performance.now(), texts, boxes };
  }

  /** Pushes the rectangles inside `roots` that cross the vertical strip [x0, x1] and are on screen. */
  collect(roots: Element[], x0: number, x1: number, out: DOMRect[]): void {
    const now = performance.now();
    const vh = innerHeight;
    const vw = innerWidth;
    const keep = (r: DOMRect): void => {
      if (r.width < 1 || r.height < 1 || r.right <= x0 || r.left >= x1 || r.bottom <= 0 || r.top >= vh) return;
      // A backdrop as wide as the screen and taller than half of it is a section background, not an obstacle.
      if (r.width > vw * 0.95 && r.height > vh * 0.5) return;
      out.push(r);
    };
    for (const root of roots) {
      let s = this.scans.get(root);
      if (!s || now - s.at > 1000) this.scans.set(root, (s = this.scan(root)));
      for (const t of s.texts) {
        if (!t.isConnected) continue;
        this.range.selectNodeContents(t);
        for (const r of this.range.getClientRects()) keep(r);
      }
      for (const el of s.boxes) {
        if (!el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        // A drawing layer over a large part of the screen (the anatomy's leader lines) is not something to dodge.
        if ((el.tagName === 'svg' || el.tagName === 'CANVAS') && r.width * r.height > vw * vh * 0.25) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
        keep(r);
      }
    }
  }
}
