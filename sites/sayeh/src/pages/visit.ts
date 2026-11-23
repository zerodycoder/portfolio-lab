import { $, $$ } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { cafeStatus, HOURS, lisbonNow, MENU, menuAt } from '../lib/cafe';
import { clock, money, shortDate } from '../lib/format';

/** The next few Saturdays (Lisbon), for the cupping class. */
function saturdays(n: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) out.push(new Date(d));
  }
  return out;
}

const visit: PageFactory = (app) => {
  const day = app.media.cafe?.day;
  const night = app.media.cafe?.night;
  const now = lisbonNow();
  const current = menuAt(now.minutes);
  return {
    title: 'Visit — SAYEH',
    html: `
<section class="visit-hero" id="cafe">
  <div class="visit-hero__photo ${day ? '' : 'is-drawn'}">
    ${day ? `<img class="visit-hero__day" src="${day}" alt="Inside the SAYEH café: a wooden counter, an espresso machine and blue azulejo tiles" />` : ''}
    ${night ? `<img class="visit-hero__night" src="${night}" alt="" aria-hidden="true" />` : ''}
  </div>
  <div class="visit-hero__copy wrap">
    <p class="eyebrow mono">Visit · Príncipe Real, Lisbon</p>
    <h1 class="h1">Under the <em>cedar.</em></h1>
    <p class="lede">A small bar and the roaster, across from the old cedar in the garden. The light in this photo follows yours: <button type="button" class="link-btn" data-open-sun>drag the sun</button> to see us after dark.</p>
  </div>
</section>

<section class="wrap visit" id="visit">
  <div class="card status-card" data-status-card>
    <p class="status-card__now"><i class="dot" data-dot></i><b data-status-line></b></p>
    <p class="mono status-card__local" data-local></p>
    <table class="hours">
      <tbody>
        ${[1, 2, 3, 4, 5, 6, 0]
          .map((i) => `<tr class="${i === now.day ? 'is-today' : ''}"><th scope="row">${HOURS[i].day}</th><td class="mono">${clock(HOURS[i].open)}–${clock(HOURS[i].close)}</td></tr>`)
          .join('')}
      </tbody>
    </table>
    <p class="status-card__note">Late on Fridays and Saturdays: decaf pour-overs and affogato until ten.</p>
  </div>

  <div class="card menu-card">
    <div class="menu-card__head">
      <p class="eyebrow mono">On the bar</p>
      <div class="menu-tabs" role="tablist" aria-label="Menu by time of day">
        ${MENU.map((m) => `<button type="button" role="tab" data-menu="${m.id}" aria-selected="${m.id === current.id}" class="${m.id === current.id ? 'is-on' : ''}">${m.label}${m.id === current.id ? '<small class="mono">now</small>' : ''}</button>`).join('')}
      </div>
    </div>
    <ul class="menu-list" data-menu-list></ul>
  </div>

  <div class="card map-card">
    <svg class="street-map" viewBox="0 0 400 300" role="img" aria-label="Sketch map: the café faces the garden of Príncipe Real, a short walk from Rato metro">
      <rect class="sm-block" x="0" y="0" width="400" height="300" />
      <path class="sm-street sm-street--main" d="M-10 210 C 80 196, 150 190, 230 168 S 360 120, 420 96" />
      <path class="sm-street" d="M40 -10 C 60 80, 90 150, 120 310" />
      <path class="sm-street" d="M300 -10 C 290 70, 300 140, 330 310" />
      <path class="sm-street" d="M-10 70 C 100 80, 220 66, 420 40" />
      <ellipse class="sm-garden" cx="205" cy="118" rx="70" ry="44" transform="rotate(-12 205 118)" />
      <circle class="sm-cedar" cx="205" cy="118" r="20" />
      <text class="sm-label" x="205" y="160" text-anchor="middle">Jardim do Príncipe Real</text>
      <text class="sm-label sm-label--small" x="205" y="122" text-anchor="middle">cedar</text>
      <g class="sm-pin" transform="translate(268 176)"><circle r="16" /><path d="M-5 3c0-6 3-9 10-9 0 6-3 9-10 9Z" /></g>
      <text class="sm-label sm-label--pin" x="290" y="200">SAYEH</text>
      <g class="sm-metro" transform="translate(58 236)"><rect x="-11" y="-11" width="22" height="22" rx="5" /><text y="4" text-anchor="middle">M</text></g>
      <text class="sm-label" x="80" y="262">Rato · 8 min walk</text>
    </svg>
    <ul class="getting mono">
      <li><b>Metro</b> Rato (yellow line), 8 minutes on foot</li>
      <li><b>Tram</b> 24E, stop Príncipe Real</li>
      <li><b>From Bairro Alto</b> 6 minutes, uphill</li>
    </ul>
  </div>

  <div class="card cupping-card">
    <p class="eyebrow mono">Saturday cupping</p>
    <p class="h3">Taste six coffees side by side, <em>the way we buy them.</em></p>
    <p>Every Saturday at 10:00 at the roaster. One hour, eight seats, ${money(18)} (refunded on any bag).</p>
    <div class="dates" role="radiogroup" aria-label="Pick a date">
      ${saturdays(4)
        .map((d, i) => `<label class="pill"><input type="radio" name="cup-date" ${i === 0 ? 'checked' : ''} /><span>${shortDate(d)}<small>${[3, 6, 8, 5][i]} seats left</small></span></label>`)
        .join('')}
    </div>
    <button class="btn btn--solid" type="button" data-book>Hold a seat (demo)</button>
  </div>
</section>`,

    mount(root) {
      const list = $('[data-menu-list]', root);
      const showMenu = (id: string): void => {
        const m = MENU.find((x) => x.id === id)!;
        list.innerHTML = m.items.map((it) => `<li><span><b>${it.name}</b><small>${it.note}</small></span><em class="mono">€${it.price.toFixed(2)}</em></li>`).join('');
        $$<HTMLButtonElement>('[data-menu]', root).forEach((b) => {
          b.classList.toggle('is-on', b.dataset.menu === id);
          b.setAttribute('aria-selected', String(b.dataset.menu === id));
        });
      };
      showMenu(current.id);
      $$<HTMLButtonElement>('[data-menu]', root).forEach((b) =>
        b.addEventListener('click', () => {
          showMenu(b.dataset.menu!);
          app.sound.press();
        }),
      );

      const tick = (): void => {
        const s = cafeStatus();
        $('[data-status-line]', root).textContent = s.line;
        $('[data-dot]', root).classList.toggle('is-open', s.open);
        $('[data-local]', root).textContent = `It’s ${s.local}`;
      };
      tick();
      const t = window.setInterval(tick, 20_000);

      $('[data-open-sun]', root).addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelector<HTMLButtonElement>('[data-sun-btn]')?.click();
      });
      $('[data-book]', root).addEventListener('click', () => {
        app.sound.stamp();
        app.toast('Seat held. (A demo: nobody will be expecting you.)');
      });
      return () => window.clearInterval(t);
    },
  };
};

export default visit;
