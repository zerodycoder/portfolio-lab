import { geoEqualEarth, geoEquirectangular, geoInterpolate, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';

export type Pin = { id: string; lon: number; lat: number; label: string; kind: 'farm' | 'home' };

type Dot = { lon: number; lat: number; belt: boolean };

/**
 * A dot-matrix world map on canvas (Equal Earth projection), the coffee belt picked out between the tropics,
 * with an SVG layer on top for the pins and the great-circle routes from each farm to Lisbon. The view can glide
 * to any point (scale and centre tweened), re-projecting every dot each frame.
 */
export class WorldMap {
  private ctx: CanvasRenderingContext2D;
  private dots: Dot[] = [];
  private projection: GeoProjection = geoEqualEarth();
  private base = { scale: 1, w: 1, h: 1 };
  view = { k: 1, lon: 10, lat: 9 };
  private colors = { land: '#000', belt: '#000', pin: '#000' };
  private routes: SVGPathElement[] = [];
  private pinEls = new Map<string, SVGGElement>();
  selected: string | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private svg: SVGSVGElement,
    private pins: Pin[],
    private onPick: (id: string) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.buildDots();
    this.buildOverlay();
    this.resize();
  }

  /** Land mask from an equirectangular raster (2 px per degree), then dots on an even grid in Equal Earth space. */
  private buildDots(): void {
    const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
    const land = feature(topo, topo.objects.land);
    const mw = 720;
    const mh = 360;
    const off = document.createElement('canvas');
    off.width = mw;
    off.height = mh;
    const octx = off.getContext('2d', { willReadFrequently: true })!;
    const eq = geoEquirectangular().scale(mw / (2 * Math.PI)).translate([mw / 2, mh / 2]);
    octx.fillStyle = '#000';
    octx.beginPath();
    geoPath(eq, octx)(land);
    octx.fill();
    const mask = octx.getImageData(0, 0, mw, mh).data;
    const isLand = (lon: number, lat: number): boolean => {
      const x = Math.floor(((lon + 180) / 360) * mw);
      const y = Math.floor(((90 - lat) / 180) * mh);
      if (x < 0 || y < 0 || x >= mw || y >= mh) return false;
      return mask[(y * mw + x) * 4 + 3] > 100;
    };
    // An even grid in projected space at a reference size, inverted back to lon/lat.
    const ref = geoEqualEarth().fitSize([1000, 486], { type: 'Sphere' });
    const step = 4.6;
    for (let y = 0; y < 486; y += step) {
      for (let x = (Math.round(y / step) % 2) * (step / 2); x < 1000; x += step) {
        const ll = ref.invert?.([x, y]);
        if (!ll || Number.isNaN(ll[0])) continue;
        const [lon, lat] = ll;
        if (lat < -58) continue;
        if (isLand(lon, lat)) this.dots.push({ lon, lat, belt: lat < 23.5 && lat > -23.5 });
      }
    }
  }

  private buildOverlay(): void {
    const NS = 'http://www.w3.org/2000/svg';
    for (const p of this.pins.filter((q) => q.kind === 'farm')) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'map-route');
      path.dataset.id = p.id;
      this.svg.appendChild(path);
      this.routes.push(path);
    }
    for (const p of this.pins) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `map-pin map-pin--${p.kind}`);
      g.dataset.id = p.id;
      g.innerHTML = `<circle class="map-pin__pulse" r="14"/><circle class="map-pin__dot" r="${p.kind === 'home' ? 5 : 7}"/><text class="map-pin__label" x="12" y="4">${p.label}</text>`;
      if (p.kind === 'farm') {
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', `Open the farm in ${p.label}`);
        g.addEventListener('click', () => this.onPick(p.id));
        g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && this.onPick(p.id));
      }
      this.svg.appendChild(g);
      this.pinEls.set(p.id, g);
    }
  }

  setColors(c: { land: string; belt: string; pin: string }): void {
    this.colors = c;
    this.draw();
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // Frame the inhabited world (58°S to 76°N), not the empty poles.
    const fit = geoEqualEarth().fitExtent(
      [
        [10, 10],
        [w - 10, h - 10],
      ],
      { type: 'MultiPoint', coordinates: [[-180, 0], [180, 0], [0, 76], [0, -58], [-150, 76], [150, 76], [-120, -58], [120, -58]] },
    );
    this.base = { scale: fit.scale(), w, h };
    this.draw();
  }

  /** Projection for the current view: centred on (lon, lat) at k × the fitted scale. */
  private project(): GeoProjection {
    const { k, lon, lat } = this.view;
    const p = this.projection.scale(this.base.scale * k).rotate([-lon, 0]).translate([this.base.w / 2, this.base.h / 2]);
    const c = p([lon, lat]);
    if (c) p.translate([this.base.w / 2 + (this.base.w / 2 - c[0]), this.base.h / 2 + (this.base.h / 2 - c[1])]);
    return p;
  }

  draw(): void {
    const { w, h } = this.base;
    const ctx = this.ctx;
    const p = this.project();
    ctx.clearRect(0, 0, w, h);
    const r = Math.max(0.9, Math.min(2.4, 1.05 * this.view.k ** 0.55)) * (w < 600 ? 0.75 : 1);
    for (const belt of [false, true]) {
      ctx.fillStyle = belt ? this.colors.belt : this.colors.land;
      ctx.beginPath();
      for (const d of this.dots) {
        if (d.belt !== belt) continue;
        const xy = p([d.lon, d.lat]);
        if (!xy || xy[0] < -4 || xy[1] < -4 || xy[0] > w + 4 || xy[1] > h + 4) continue;
        ctx.moveTo(xy[0] + r, xy[1]);
        ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // Tropic lines bounding the coffee belt.
    ctx.strokeStyle = this.colors.belt;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    for (const lat of [23.44, -23.44]) {
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 2) {
        const xy = p([lon, lat]);
        if (!xy) continue;
        if (lon === -180) ctx.moveTo(xy[0], xy[1]);
        else ctx.lineTo(xy[0], xy[1]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Pins and routes.
    const home = this.pins.find((q) => q.kind === 'home')!;
    for (const pin of this.pins) {
      const xy = p([pin.lon, pin.lat]);
      const g = this.pinEls.get(pin.id)!;
      if (xy) g.setAttribute('transform', `translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`);
      g.classList.toggle('is-selected', pin.id === this.selected);
      g.classList.toggle('is-dim', !!this.selected && pin.kind === 'farm' && pin.id !== this.selected);
    }
    for (const route of this.routes) {
      const pin = this.pins.find((q) => q.id === route.dataset.id)!;
      const interp = geoInterpolate([pin.lon, pin.lat], [home.lon, home.lat]);
      let d = '';
      for (let i = 0; i <= 48; i++) {
        const xy = p(interp(i / 48));
        if (!xy) continue;
        d += `${i ? 'L' : 'M'}${xy[0].toFixed(1)} ${xy[1].toFixed(1)}`;
      }
      route.setAttribute('d', d);
      route.classList.toggle('is-selected', pin.id === this.selected);
      route.classList.toggle('is-dim', !!this.selected && pin.id !== this.selected);
    }
  }
}
