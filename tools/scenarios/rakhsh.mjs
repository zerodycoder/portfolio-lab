// Screenshot scenario for sites/rakhsh, used by tools/shoot.mjs.
// A section spec is `id[@fraction][:action][~seconds]`; actions are defined below.

export default {
  sections:
    'top,legend@0.6,machine@0.1,machine@0.7,ignite,ignite:hold,details@0.5,specs,ride@0.4,finish,finish:ember,reserve,reserve:submit,footer',

  // Elements allowed to extend past the viewport (carousels, oversized titles) when checking horizontal overflow.
  overflowIgnore: '.details__track, .ride__rows, .hero__title, .footer__mark, .pin-spacer .details__track',

  actions: {
    // Hold the throttle for 3.3 s and screenshot mid-acceleration. Returns true: no regular shot afterwards.
    async hold({ page, shot }) {
      await page.evaluate(() => {
        const btn = document.querySelector('[data-hold]');
        const y = btn.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.62;
        window.__lenis.scrollTo(y, { immediate: true, force: true });
      });
      await page.waitForTimeout(600);
      const box = await page.locator('[data-hold]').boundingBox();
      if (!box) return false;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(3300);
      await shot('holding');
      await page.mouse.up();
      return true;
    },

    // Switch to the Ember finish and catch the lightning-edge wipe mid-way.
    async ember({ page, shot }) {
      await page.click('[data-finish="ember"]');
      await page.waitForTimeout(400);
      await shot('wipe');
      await page.waitForTimeout(1200);
    },

    // Fill and submit the reservation form, then centre the printed ticket.
    async submit({ page }) {
      await page.fill('#f-name', 'Ada Lovelace');
      await page.fill('#f-email', 'ada@example.com');
      await page.fill('#f-city', 'London');
      await page.click('.form button[type="submit"]');
      await page.waitForTimeout(2800);
      await page.evaluate(() => document.querySelector('[data-slot]')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(600);
    },
  },
};
