/**
 * The first time the browser paints a kind of thing (a gradient, a dashed border, a rounded shadow, text at a new
 * size, a photo scaled down), its GPU rasteriser builds programs and caches for it, and that first paint stalls a
 * frame for up to a tenth of a second. Opening a panel for the first time did exactly that.
 *
 * So while the loader is still up, one sample of every panel the site can show is painted once, nearly
 * transparent, then removed: the costs are paid behind the loader, and every later first-open is smooth.
 */

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Paints what was just opened in both of its forms: mid-entrance (an animating panel is rasterised as its own
 * moving layer) and settled (once the entrance ends it is rasterised again, flattened into its parent; on some
 * screen sizes that second raster is the slow one).
 */
async function paintBoth(root: HTMLElement): Promise<void> {
  for (let i = 0; i < 2; i++) await frame();
  for (const a of root.getAnimations({ subtree: true })) {
    try {
      a.finish();
    } catch {
      // An endless animation can't be finished; it never settles anyway.
    }
  }
  for (let i = 0; i < 2; i++) await frame();
}

export type PanelOpener = { open(place: 'menu' | 'famiglia' | 'lievito' | 'fronte'): void; close(): void };
export type Opener = { open(): void; close(): void };

export async function prewarmPanels(panels: PanelOpener, diploma: Opener): Promise<void> {
  const html = `
    <section class="kitchen" style="pointer-events:none">
      <ol class="steps"><li class="is-done"><button><b>1</b><span class="it">Impasto</span></button></li><li class="is-now"><b>2</b><span class="it">Condimenti</span></li><li><b>3</b><span class="it">Forno</span></li></ol>
      <div class="panel"><p class="panel__kicker">2 · Condimenti</p><h2 class="panel__title"><span class="it">Condisci</span> it</h2>
        <div class="tabs"><button class="is-on"><span class="it">Salsa</span>Sauce</button><button><span class="it">Formaggio</span>Cheese</button></div>
        <p class="panel__lead">Pick the base, then <b>paint it on</b>.</p>
        <div class="seg"><button class="is-on"><span class="it">Rossa</span>San Marzano</button><button><span class="it">Bianca</span>Olive oil</button></div>
        <div class="chips"><button class="chip is-on"><span class="chip__n">6</span><span class="chip__price">€ 2,00</span><span class="chip__it">Salame</span><span class="chip__en">Spicy salami</span></button><button class="chip is-off"><span class="chip__it">Olive</span></button></div>
        <p class="readout">30 cm<small>Classica</small></p><div class="sizes"><span class="is-on">30 cm</span></div>
        <div class="meter-label"><span>Coverage</span><span>80%</span></div><div class="meter"><i style="width:80%"></i></div>
        <div class="panel__tools"><button class="btn btn--paper btn--small">Stendila tu</button><span class="hint">Tap the dough</span></div>
        <div class="panel__foot"><button class="btn btn--paper panel__back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg><span><span class="it">Impasto</span><small>Back</small></span></button><button class="btn btn--tomato">Avanti →</button></div></div>
      <aside class="ticket"><div class="ticket__paper"><div class="ticket__head"><b>NOVANTA</b>Ordine N° 0123</div><div class="ticket__line"><span>Pizza<small>30 cm</small></span><span>€ 8,50</span></div><div class="ticket__total"><span>TOTALE</span><span>€ 8,50</span></div></div></aside>
      <div class="bake"><div class="bake__clock"><b>69</b><span>sec</span></div></div>
    </section>
    <div class="note" style="animation:none"><p class="note__it">Brava! Ora stendila.</p><p class="note__en">Good. Now stretch it.</p></div>
    <div class="stamp-toast" style="opacity:1;transform:none;left:30%;top:30%"><i>N</i><span>Mano d’oro<small>Sigillo 1/10</small></span></div>
    <div class="map" style="animation:none"><header class="map__head"><div><button class="map__back">Torna</button><h2><span class="it">In viaggio</span> to you</h2></div><div class="map__eta"><b>0:16</b><span>ETA</span></div></header>
      <svg class="map__svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#efe4cf"/><path d="M0 250 C 100 220, 200 270, 400 240 L400 300 L0 300Z" fill="#9fc0d2"/><path d="M20 40 L380 40 M200 40 L200 260" stroke="#fffaf0" stroke-width="13" stroke-linecap="round"/><path d="M20 40 L380 40" stroke="#c8341e" stroke-width="7" stroke-dasharray="2 12"/><text x="200" y="120" font-family="Fraunces Variable, Georgia, serif" font-style="italic" font-size="24">Via Toledo</text><circle cx="120" cy="40" r="20" fill="#fffaf0" stroke="#231c17"/></svg>
      <footer class="map__foot"><p class="rider-msg">Enzo: “Parto!”</p><ol class="track"><li class="is-done"><span class="it">Sfornata</span>Baked</li><li class="is-now"><span class="it">In viaggio</span>On the way</li></ol></footer></div>`;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  // Painted (so it is rasterised) but practically invisible, above the loader, and out of the way of pointers.
  box.style.cssText = 'position:fixed;inset:0;z-index:100;opacity:0.004;pointer-events:none;overflow:hidden;';
  box.innerHTML = html;
  document.body.appendChild(box);
  // The real corner panels, the real diploma panel (its big canvas, its blurred backdrop) and the real seal toast
  // (with its animation) are borrowed into the faint box. Behind the opaque loader they might not be rasterised.
  const sheet = document.querySelector<HTMLElement>('[data-sheet]')!;
  const tessera = document.querySelector<HTMLElement>('[data-tessera-panel]')!;
  const toast = document.querySelector<HTMLElement>('[data-stamp-toast]')!;
  const homes = [sheet, tessera, toast].map((el) => [el, el.parentNode!, el.nextSibling] as const);
  box.append(sheet, tessera, toast);
  const title = document.title;
  try {
    for (const place of ['menu', 'famiglia', 'lievito', 'fronte'] as const) {
      panels.open(place);
      await Promise.all(Array.from(sheet.querySelectorAll('img'), (img) => img.decode().catch(() => undefined)));
      await paintBoth(box);
    }
    panels.close();
    diploma.open();
    await paintBoth(box);
    diploma.close();
    toast.innerHTML = '<i aria-hidden="true">N</i><span>Mano d’oro<small>Sigillo 1/10 on your diploma</small></span>';
    toast.classList.add('is-on');
    for (let i = 0; i < 4; i++) await frame();
    toast.classList.remove('is-on');
    toast.innerHTML = '';
  } finally {
    homes.forEach(([el, parent, next]) => parent.insertBefore(el, next));
    document.title = title;
    box.remove();
  }
}
