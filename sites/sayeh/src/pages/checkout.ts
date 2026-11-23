import { gsap } from 'gsap';
import { $, $$ } from '@portfolio-lab/kit/dom';
import type { PageFactory } from '../app';
import { bagImage } from '../art/label';
import { bySlug } from '../lib/catalog';
import { Cart } from '../lib/cart';
import { addDays, delivered, escapeHtml, longDate, money, nextRoast, shortDate } from '../lib/format';

const COUNTRIES = ['Portugal', 'Spain', 'France', 'Germany', 'Netherlands', 'United Kingdom', 'Ireland', 'Italy', 'Belgium', 'Denmark', 'Sweden', 'United States', 'Canada'];

/**
 * Checkout, as a demo: real validation and real totals, but no payment fields at all. Nothing is sent anywhere;
 * placing the order clears the bag and shows the confirmation with the roast and delivery dates.
 */
const checkout: PageFactory = (app) => {
  const cart = app.cart;
  const summary = (express: boolean): string => {
    const ship = express ? 9 : cart.shipping;
    const total = cart.subtotal - cart.discount + ship;
    return `
      <ul class="sum__lines">${cart.lines
        .map((l) => {
          const c = bySlug(l.slug)!;
          return `<li><img src="${bagImage(c, 120)}" alt="" width="44" height="60" /><span><b>${c.name}</b><small>${l.qty} × ${l.size === '250' ? '250 g' : '1 kg'} · ${l.grind}${l.plan !== 'once' ? ` · every ${l.plan === '2w' ? '2' : '4'} weeks` : ''}</small></span><em class="mono">${money(Cart.unit(l.slug, l.size, l.plan) * l.qty)}</em></li>`;
        })
        .join('')}</ul>
      <dl class="totals">
        <div><dt>Subtotal</dt><dd class="mono">${money(cart.subtotal)}</dd></div>
        ${cart.discount ? `<div class="is-reward"><dt>Stamp card (15%)</dt><dd class="mono">−${money(cart.discount)}</dd></div>` : ''}
        <div><dt>Shipping${express ? ' (express)' : ''}</dt><dd class="mono">${ship ? money(ship) : 'Free'}</dd></div>
        <div class="totals__sum"><dt>Total</dt><dd class="mono">${money(total)}</dd></div>
      </dl>`;
  };

  if (!cart.lines.length)
    return {
      title: 'Checkout — SAYEH',
      html: `
<section class="page-head page-head--center notfound">
  <p class="eyebrow mono">Checkout</p>
  <h1 class="h1">Your bag is <em>empty.</em></h1>
  <p class="lede">Pick a coffee first. They’re roasted on Monday and Thursday.</p>
  <div class="row-center"><a class="btn btn--solid" href="/shop">Browse the coffees</a></div>
</section>`,
    };

  const roast = nextRoast();
  return {
    title: 'Checkout — SAYEH',
    html: `
<section class="page-head checkout-head">
  <a class="back mono" href="/shop">← Keep shopping</a>
  <h1 class="h1">Checkout</h1>
  <p class="demo-note mono">Portfolio demo: nothing is charged, stored or sent. There is no payment step.</p>
</section>
<section class="wrap checkout" id="checkout" data-checkout>
  <form class="co-form" data-form novalidate>
    <fieldset>
      <legend class="h3">Contact</legend>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required /><small class="field__err">Enter an email address like name@example.com.</small></label>
    </fieldset>
    <fieldset>
      <legend class="h3">Shipping to</legend>
      <div class="field-2">
        <label class="field"><span>First name</span><input name="first" autocomplete="given-name" required /><small class="field__err">Required.</small></label>
        <label class="field"><span>Last name</span><input name="last" autocomplete="family-name" required /><small class="field__err">Required.</small></label>
      </div>
      <label class="field"><span>Address</span><input name="address" autocomplete="street-address" required minlength="4" /><small class="field__err">Street and number, please.</small></label>
      <div class="field-2">
        <label class="field"><span>Postcode</span><input name="postcode" autocomplete="postal-code" required pattern="[A-Za-z0-9 \\-]{3,10}" /><small class="field__err">3–10 letters or digits.</small></label>
        <label class="field"><span>City</span><input name="city" autocomplete="address-level2" required /><small class="field__err">Required.</small></label>
      </div>
      <label class="field"><span>Country</span><select name="country" autocomplete="country-name">${COUNTRIES.map((c) => `<option>${c}</option>`).join('')}</select></label>
    </fieldset>
    <fieldset>
      <legend class="h3">Delivery</legend>
      <label class="choice"><input type="radio" name="ship" value="standard" checked /><span><b>Standard</b><small>Arrives ${shortDate(delivered(roast, 2))} · ${cart.shipping ? money(cart.shipping) : 'free'}</small></span></label>
      <label class="choice"><input type="radio" name="ship" value="express" /><span><b>Express</b><small>Arrives ${shortDate(delivered(roast, 1))} · ${money(9)}</small></span></label>
    </fieldset>
    <button class="btn btn--solid btn--big btn--wide" type="submit">Place demo order</button>
  </form>
  <aside class="co-sum">
    <p class="eyebrow mono">Your order · roasted ${longDate(roast)}</p>
    <div data-sum>${summary(false)}</div>
  </aside>
</section>`,

    mount(root) {
      const form = $<HTMLFormElement>('[data-form]', root);
      const sum = $('[data-sum]', root);
      const express = (): boolean => new FormData(form).get('ship') === 'express';
      form.addEventListener('change', (e) => {
        if ((e.target as HTMLInputElement).name === 'ship') sum.innerHTML = summary(express());
      });
      // Validate a field once it has been left, then live while it's being corrected.
      $$<HTMLInputElement>('input[required]', form).forEach((input) => {
        input.addEventListener('blur', () => input.closest('.field')!.classList.toggle('is-bad', !input.checkValidity()));
        input.addEventListener('input', () => {
          if (input.closest('.field')!.classList.contains('is-bad')) input.closest('.field')!.classList.toggle('is-bad', !input.checkValidity());
        });
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const bad = $$<HTMLInputElement>('input[required]', form).filter((i) => !i.checkValidity());
        bad.forEach((i) => i.closest('.field')!.classList.add('is-bad'));
        if (bad.length) {
          bad[0].focus();
          app.sound.press();
          return;
        }
        const fd = new FormData(form);
        const first = escapeHtml(String(fd.get('first')));
        const email = escapeHtml(String(fd.get('email')));
        const isExpress = express();
        const order = `SY-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        const sub = cart.hasSubscription;
        const lines = summary(isExpress);
        const arrive = delivered(roast, isExpress ? 1 : 2);
        cart.clear();
        app.sound.stamp();
        const wrap = $('[data-checkout]', root);
        wrap.classList.add('is-done');
        wrap.innerHTML = `
          <div class="confirm">
            <div class="confirm__stamp" aria-hidden="true">Roasting<br /><b>${shortDate(roast)}</b></div>
            <p class="eyebrow mono">Order ${order} · demo</p>
            <h2 class="h1">Thank you, <em>${first}.</em></h2>
            <p class="lede">Your coffee goes into the roaster on ${longDate(roast)} and should be with you by ${longDate(arrive)}. A receipt would go to ${email}, if this were a real shop.</p>
            ${sub ? `<p class="confirm__sub">Your subscription repeats from ${shortDate(addDays(roast, 14))}. Skip or stop any time.</p>` : ''}
            <div class="confirm__sum">${lines}</div>
            <div class="row-center"><a class="btn btn--solid" href="/">Back to the cup</a><a class="btn btn--ghost" href="/visit">Visit the café</a></div>
          </div>`;
        root.ownerDocument.defaultView?.scrollTo({ top: 0 });
        app.lenis.scrollTo(0, { immediate: true, force: true });
        gsap.from('.confirm__stamp', { scale: 1.8, rotate: -30, autoAlpha: 0, duration: 0.6, ease: 'back.out(2)' });
      });
    },
  };
};

export default checkout;
