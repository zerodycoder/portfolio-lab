import { gsap } from 'gsap';
import { $, $$, reducedMotion } from '../lib/dom';
import { FINISHES, finishStore, type Finish } from '../lib/finish';
import type { Sound } from '../lib/sound';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** FNV-1a: a stable number per email, so the same person always gets the same build number. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

type Ticket = { no: string; name: string; city: string; finish: Finish; date: string; code: string; bars: number[] };

/**
 * Reservation: validates the form, then "prints" a numbered build ticket out of a slot.
 * The ticket can be downloaded as a PNG drawn on a canvas. Nothing is sent anywhere.
 */
export function initReserve(sound: Sound): void {
  const form = $<HTMLFormElement>('[data-form]');
  const slot = $('[data-slot]');
  const empty = $('[data-slot-empty]', slot);
  const ticketEl = $('[data-ticket]', slot);
  const actions = $('[data-slot-actions]', slot);
  const radios = $$<HTMLInputElement>('input[name="finish"]', form);
  let ticket: Ticket | null = null;

  radios.forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) finishStore.set(r.value as Finish, 'reserve');
    }),
  );
  finishStore.on((f) => radios.forEach((r) => (r.checked = r.value === f)));

  const field = (name: string): HTMLInputElement => form.elements.namedItem(name) as HTMLInputElement;
  const setInvalid = (input: HTMLInputElement, bad: boolean): void => {
    input.closest('.field')?.classList.toggle('is-invalid', bad);
    input.setAttribute('aria-invalid', String(bad));
  };
  ['name', 'email', 'city'].forEach((n) => field(n).addEventListener('input', () => setInvalid(field(n), false)));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = field('name').value.trim();
    const email = field('email').value.trim().toLowerCase();
    const city = field('city').value.trim();
    const checks: [HTMLInputElement, boolean][] = [
      [field('name'), name.length < 2],
      [field('email'), !EMAIL.test(email)],
      [field('city'), city.length < 2],
    ];
    checks.forEach(([input, bad]) => setInvalid(input, bad));
    const firstBad = checks.find(([, bad]) => bad);
    if (firstBad) {
      firstBad[0].focus();
      sound.click();
      gsap.fromTo(firstBad[0].closest('.field'), { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      return;
    }

    const h = hash(email);
    const n = (h % 999) + 1;
    const finish = finishStore.get();
    const rand = rng(h);
    ticket = {
      no: String(n).padStart(3, '0'),
      name,
      city,
      finish,
      date: n <= 333 ? 'Spring 2027' : n <= 666 ? 'Summer 2027' : 'Autumn 2027',
      code: `RKH-01-${String(n).padStart(3, '0')}-${FINISHES[finish].code}`,
      bars: Array.from({ length: 46 }, () => 1 + Math.floor(rand() * 4)),
    };
    print(ticket);
  });

  const print = (t: Ticket): void => {
    $('[data-t-no]', ticketEl).textContent = t.no;
    $('[data-t-name]', ticketEl).textContent = t.name;
    $('[data-t-finish]', ticketEl).textContent = FINISHES[t.finish].name;
    $('[data-t-city]', ticketEl).textContent = t.city;
    $('[data-t-date]', ticketEl).textContent = t.date;
    $('[data-t-code]', ticketEl).textContent = t.code;
    $('[data-t-barcode]', ticketEl).innerHTML = t.bars.map((b, i) => `<i style="width:${b * 2}px;opacity:${i % 2 ? 0 : 1}"></i>`).join('');

    empty.hidden = true;
    ticketEl.hidden = false;
    slot.classList.add('is-printed');
    sound.printer(1.5);
    if (reducedMotion()) {
      actions.hidden = false;
      return;
    }
    gsap
      .timeline()
      .fromTo(ticketEl, { yPercent: -104 }, { yPercent: -6, duration: 1.5, ease: 'steps(30)' })
      .to(ticketEl, { yPercent: 0, duration: 0.6, ease: 'back.out(2.2)' })
      .add(() => {
        actions.hidden = false;
        gsap.fromTo(actions, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
      });
  };

  $('[data-again]', slot).addEventListener('click', () => {
    ticket = null;
    form.reset();
    radios.forEach((r) => (r.checked = r.value === finishStore.get()));
    gsap.to(ticketEl, {
      yPercent: -104,
      duration: 0.6,
      ease: 'power3.in',
      onComplete: () => {
        ticketEl.hidden = true;
        empty.hidden = false;
        actions.hidden = true;
        slot.classList.remove('is-printed');
        field('name').focus();
      },
    });
  });

  $('[data-download]', slot).addEventListener('click', () => {
    if (!ticket) return;
    const canvas = renderTicket(ticket);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rakhsh-build-ticket-${ticket?.no ?? '000'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  });
}

/** Draws the ticket at print resolution with the site's own fonts. */
function renderTicket(t: Ticket): HTMLCanvasElement {
  const W = 1400;
  const H = 760;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return c;
  const display = "'Archivo Variable', Archivo, sans-serif";
  const mono = "'JetBrains Mono Variable', monospace";
  const accent = FINISHES[t.finish].accent;

  x.fillStyle = '#070707';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#ece6dc';
  x.beginPath();
  x.roundRect(40, 40, W - 80, H - 80, 28);
  x.fill();
  // Perforation notches.
  x.fillStyle = '#070707';
  [40, W - 40].forEach((cx) => {
    x.beginPath();
    x.arc(cx, 520, 26, 0, Math.PI * 2);
    x.fill();
  });
  x.setLineDash([10, 12]);
  x.strokeStyle = 'rgba(7,7,7,0.35)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(90, 520);
  x.lineTo(W - 90, 520);
  x.stroke();
  x.setLineDash([]);

  x.fillStyle = '#0a0a0a';
  x.strokeStyle = '#0a0a0a';
  x.lineWidth = 6;
  x.beginPath();
  x.moveTo(100, 122);
  x.lineTo(138, 122);
  x.lineTo(146, 104);
  x.lineTo(155, 140);
  x.lineTo(163, 122);
  x.lineTo(196, 122);
  x.stroke();
  (x as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = 'expanded';
  x.font = `800 34px ${display}`;
  x.fillText('RAKHSH', 214, 134);
  x.font = `500 22px ${mono}`;
  x.textAlign = 'right';
  x.fillText('BUILD TICKET · MODEL 01', W - 100, 132);
  x.textAlign = 'left';

  x.font = `800 150px ${display}`;
  x.fillText(`No. ${t.no}`, 96, 320);
  const noWidth = x.measureText(`No. ${t.no}`).width;
  x.font = `700 56px ${display}`;
  x.fillStyle = accent;
  x.fillText('/999', 110 + noWidth, 320);

  const cols: [string, string][] = [
    ['HOLDER', t.name],
    ['FINISH', FINISHES[t.finish].name],
    ['CITY', t.city],
    ['EST. DELIVERY', t.date],
  ];
  cols.forEach(([k, v], i) => {
    const cx = 100 + i * 300;
    x.fillStyle = 'rgba(10,10,10,0.55)';
    x.font = `500 20px ${mono}`;
    x.fillText(k, cx, 402);
    x.fillStyle = '#0a0a0a';
    x.font = `650 34px ${display}`;
    const value = v.length > 15 ? `${v.slice(0, 14)}…` : v;
    x.fillText(value, cx, 448);
  });

  let bx = 100;
  t.bars.forEach((b, i) => {
    const bw = b * 4;
    if (i % 2 === 0) {
      x.fillStyle = '#0a0a0a';
      x.fillRect(bx, 580, bw, 80);
    }
    bx += bw;
  });
  x.fillStyle = '#0a0a0a';
  x.font = `500 24px ${mono}`;
  x.textAlign = 'right';
  x.fillText(t.code, W - 100, 632);
  x.fillStyle = 'rgba(10,10,10,0.5)';
  x.font = `500 18px ${mono}`;
  x.fillText('CONCEPT — NOT A REAL PRODUCT', W - 100, 664);
  return c;
}
