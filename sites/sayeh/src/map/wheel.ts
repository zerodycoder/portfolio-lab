import { WHEEL } from '../lib/catalog';

const NS = 'http://www.w3.org/2000/svg';

/** An annular sector path between radii r0..r1 and angles a0..a1 (radians, 0 = up, clockwise). */
function arc(r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number): string => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

/**
 * The flavour wheel: families on the inner ring, notes on the outer, every note an equal slice. Notes in the
 * highlighted set glow; the rest fade back. Picking a note calls back with its name.
 */
export function renderWheel(svg: SVGSVGElement, onPick: (note: string) => void): { highlight(notes: string[], picked?: string | null): void } {
  const R0 = 46;
  const R1 = 98;
  const R2 = 182;
  svg.setAttribute('viewBox', '-200 -200 400 400');
  svg.innerHTML = '';
  const total = WHEEL.reduce((a, f) => a + f.notes.length, 0);
  const gap = 0.006;
  let i = 0;
  const notes: { name: string; el: SVGGElement }[] = [];
  for (const fam of WHEEL) {
    const a0 = (i / total) * Math.PI * 2;
    const a1 = ((i + fam.notes.length) / total) * Math.PI * 2;
    const fp = document.createElementNS(NS, 'path');
    fp.setAttribute('d', arc(R0, R1 - 2, a0 + gap, a1 - gap));
    fp.setAttribute('class', 'wheel__family');
    fp.setAttribute('fill', fam.color);
    svg.appendChild(fp);
    const mid = (a0 + a1) / 2;
    const ft = document.createElementNS(NS, 'text');
    const fr = (R0 + R1) / 2;
    const deg = (mid * 180) / Math.PI;
    const flip = deg > 90 && deg < 270;
    ft.setAttribute('class', 'wheel__family-label');
    ft.setAttribute('transform', `translate(${(Math.sin(mid) * fr).toFixed(1)} ${(-Math.cos(mid) * fr).toFixed(1)}) rotate(${flip ? deg - 180 : deg})`);
    ft.setAttribute('text-anchor', 'middle');
    ft.setAttribute('dy', '0.35em');
    ft.textContent = fam.family.split(' & ')[0];
    svg.appendChild(ft);
    for (const n of fam.notes) {
      const b0 = (i / total) * Math.PI * 2;
      const b1 = ((i + 1) / total) * Math.PI * 2;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'wheel__note');
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', n.name);
      const np = document.createElementNS(NS, 'path');
      np.setAttribute('d', arc(R1, R2, b0 + gap, b1 - gap));
      np.setAttribute('fill', n.color);
      g.appendChild(np);
      const m = (b0 + b1) / 2;
      const d2 = (m * 180) / Math.PI;
      // Labels run along the radius, reading outward on the right half and inward on the left.
      const right = d2 < 180;
      const t = document.createElementNS(NS, 'text');
      const tr = R1 + 10;
      t.setAttribute('transform', `translate(${(Math.sin(m) * tr).toFixed(1)} ${(-Math.cos(m) * tr).toFixed(1)}) rotate(${right ? d2 - 90 : d2 + 90})`);
      t.setAttribute('text-anchor', right ? 'start' : 'end');
      t.setAttribute('dy', '0.35em');
      t.textContent = n.name;
      // Dark ink on pale slices (jasmine, peach), white on the rest.
      const [cr, cg, cb] = [1, 3, 5].map((k) => parseInt(n.color.slice(k, k + 2), 16) / 255);
      if (0.2126 * cr + 0.7152 * cg + 0.0722 * cb > 0.55) t.classList.add('is-dark');
      g.appendChild(t);
      g.addEventListener('click', () => onPick(n.name));
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(n.name)));
      svg.appendChild(g);
      notes.push({ name: n.name, el: g });
      i++;
    }
  }
  const hub = document.createElementNS(NS, 'circle');
  hub.setAttribute('r', String(R0 - 4));
  hub.setAttribute('class', 'wheel__hub');
  svg.appendChild(hub);
  return {
    highlight(set, picked = null) {
      notes.forEach((n) => {
        n.el.classList.toggle('is-on', set.includes(n.name));
        n.el.classList.toggle('is-picked', n.name === picked);
      });
      svg.classList.toggle('has-focus', set.length > 0);
    },
  };
}
