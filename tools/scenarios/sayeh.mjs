// Screenshot scenario for sites/sayeh, used by tools/shoot.mjs. Specs starting with / navigate in place.

export default {
  sections:
    'pour~4,pour:pour,pour:etch,pour:day,pour:stamps,shade^0.5,shade,farms,roast@0.15,roast@0.85,shot~3,shot~8,coffees^0.5,coffees,cafe,cafe:night,cafe:day,footer,' +
    '/shop,grid:filter,subscribe,/shop/hambela-shade,buy:add,farm,label,pairs,/checkout,checkout:order,' +
    '/lab,lab,lab:dial,timer:timer,/origins,atlas,atlas:farm,farm,flavours:note,/visit,cafe,cafe:sun,visit,footer,/,pour:golden,pour:night',

  // The gate's coffee flies to the cup, then a barista pours a heart (about 3.5 s).
  afterEnterMs: 2500,

  overflowIgnore: '.shade, .bag-row, .farm-strip, .drawer, .cup-scene',

  probe: () => {
    const app = window.__sayeh;
    if (!app) return null;
    const l = app.cup.latte;
    return {
      page: document.documentElement.dataset.page,
      milk: l ? Number(l.fluid.coverage.toFixed(3)) : null,
      busy: l?.busy ?? null,
      photo: l?.fluid.hasPhoto ?? null,
      stamps: app.stamps.found,
      cart: app.cart.count,
      theme: document.documentElement.dataset.theme,
    };
  },

  actions: {
    // Preview the site at a given hour through the sun dial's model (10:00, 19:00, 23:00).
    async day({ page }) {
      await page.evaluate(() => window.__sayeh.day.set(600));
      await page.waitForTimeout(1400);
    },
    async golden({ page }) {
      await page.evaluate(() => window.__sayeh.day.set(19 * 60 + 30));
      await page.waitForTimeout(1400);
    },
    async night({ page }) {
      await page.evaluate(() => window.__sayeh.day.set(23 * 60));
      await page.waitForTimeout(1400);
    },

    // Swirl the cup: two fingers twisting on the coffee (phones), or circles dragged on the saucer (mouse).
    async swirl({ page, name, shot }) {
      const r = await page.evaluate(() => {
        const b = window.__sayeh.cup.liquidRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, s: b.width / 2 };
      });
      if (name === 'mobile') {
        const cdp = await page.context().newCDPSession(page);
        const pts = (a) => [
          { x: r.x + Math.cos(a) * r.s * 0.5, y: r.y + Math.sin(a) * r.s * 0.5, id: 1 },
          { x: r.x - Math.cos(a) * r.s * 0.5, y: r.y - Math.sin(a) * r.s * 0.5, id: 2 },
        ];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
        for (let i = 1; i <= 24; i++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts((i / 24) * Math.PI * 1.5) });
          await page.waitForTimeout(16);
        }
        await shot('twisting');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        const R = r.s * 1.5;
        await page.mouse.move(r.x + R, r.y);
        await page.mouse.down();
        for (let i = 1; i <= 40; i++) {
          const a = (i / 40) * Math.PI * 3;
          await page.mouse.move(r.x + Math.cos(a) * R, r.y + Math.sin(a) * R);
          await page.waitForTimeout(16);
        }
        await shot('twisting');
        await page.mouse.up();
      }
      await page.waitForTimeout(1500);
      const found = await page.evaluate(() => window.__sayeh.stamps.has('swirl'));
      if (!found) console.warn('swirl: no stamp');
    },

    // On phones a swipe that starts beside the coffee (on the saucer) must scroll the page.
    async swipe({ page, name }) {
      if (name !== 'mobile') return;
      const at = await page.evaluate(() => {
        const b = window.__sayeh.cup.liquidRect();
        return { x: b.left + b.width / 2 + b.width * 0.72, y: b.top + b.height / 2, scroll: scrollY };
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x, y: at.y - i * 30 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => scrollY);
      console.warn(`swipe beside the cup scrolled ${Math.round(after - at.scroll)}px`);
    },

    async stamps({ page, shot }) {
      await page.click('[data-stamps-btn]');
      await page.waitForTimeout(500);
      await shot('card');
      await page.click('[data-stamps-close]');
      await page.waitForTimeout(300);
      return true;
    },

    async sun({ page, shot }) {
      await page.click('[data-sun-btn]');
      await page.waitForTimeout(500);
      await shot('dial');
      await page.keyboard.press('Escape');
      return true;
    },

    // Add the product to the bag with a non-default grind and plan, then open the drawer.
    async add({ page, shot }) {
      await page.locator('.pill', { hasText: 'Filter' }).click();
      await page.locator('.pill', { hasText: 'Every 2 weeks' }).click();
      await page.locator('.buy__add').click();
      await page.waitForTimeout(1200);
      await page.click('[data-cart-btn]');
      await page.waitForTimeout(700);
      await shot('drawer');
      await page.click('[data-cart-close]');
      await page.waitForTimeout(400);
      return true;
    },

    async filter({ page }) {
      await page.click('[data-filter="choc"]');
      await page.waitForTimeout(900);
    },

    // Submit empty (errors show), then fill and place the order.
    async order({ page, shot }) {
      await page.locator('[data-form] button[type="submit"]').click();
      await page.waitForTimeout(500);
      await shot('errors');
      await page.fill('[name="email"]', 'ana@example.com');
      await page.fill('[name="first"]', 'Ana');
      await page.fill('[name="last"]', 'Silva');
      await page.fill('[name="address"]', 'Rua das Flores 12');
      await page.fill('[name="postcode"]', '1200-195');
      await page.fill('[name="city"]', 'Lisbon');
      await page.locator('[data-form] button[type="submit"]').click();
      await page.waitForTimeout(1200);
      await shot('confirmed');
      return true;
    },

    // Grind finer on the pour-over until the dot leaves the box, then back.
    async dial({ page, shot }) {
      const set = (k, v) => page.evaluate(([k, v]) => {
        const el = document.querySelector(`[data-input="${k}"]`);
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, [k, v]);
      await set('grind', 400);
      await page.waitForTimeout(700);
      await shot('fine');
      await set('grind', 650);
      await set('temp', 95);
      await page.waitForTimeout(700);
    },

    async timer({ page }) {
      await page.click('[data-start]');
      await page.waitForTimeout(2600);
    },

    async farm({ page }) {
      await page.click('[data-farm="kenya"]');
      await page.waitForTimeout(1800);
    },

    async note({ page }) {
      await page.locator('.wheel__note[aria-label="Blackcurrant"]').click();
      await page.waitForTimeout(700);
    },

    // Hold on the coffee and draw a slow S while pouring (real touch events on phones).
    async pour({ page, name, shot }) {
      const r = await page.evaluate(() => {
        const b = window.__sayeh.cup.liquidRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, s: b.width / 2 };
      });
      const path = Array.from({ length: 40 }, (_, i) => ({ x: r.x + Math.sin(i / 6) * r.s * 0.25, y: r.y - r.s * 0.3 + (i / 40) * r.s * 0.5 }));
      await page.click('[data-newcup]');
      await page.waitForTimeout(900);
      if (name === 'mobile') {
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
        await touch('touchStart', path[0]);
        for (const p of path) {
          await touch('touchMove', p);
          await page.waitForTimeout(40);
        }
        await shot('pouring');
        await touch('touchEnd');
      } else {
        await page.mouse.move(path[0].x, path[0].y);
        await page.mouse.down();
        for (const p of path) {
          await page.mouse.move(p.x, p.y);
          await page.waitForTimeout(40);
        }
        await shot('pouring');
        await page.mouse.up();
      }
      await page.waitForTimeout(2200);
    },

    // Switch to Etch and drag a line across the foam.
    async etch({ page, name }) {
      await page.click('[data-tool="etch"]');
      const r = await page.evaluate(() => {
        const b = window.__sayeh.cup.liquidRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, s: b.width / 2 };
      });
      const path = Array.from({ length: 20 }, (_, i) => ({ x: r.x - r.s * 0.6 + (i / 19) * r.s * 1.2, y: r.y }));
      if (name === 'mobile') {
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
        await touch('touchStart', path[0]);
        for (const p of path) {
          await touch('touchMove', p);
          await page.waitForTimeout(25);
        }
        await touch('touchEnd');
      } else {
        await page.mouse.move(path[0].x, path[0].y);
        await page.mouse.down();
        for (const p of path) {
          await page.mouse.move(p.x, p.y);
          await page.waitForTimeout(25);
        }
        await page.mouse.up();
      }
      await page.waitForTimeout(1500);
      await page.click('[data-tool="pour"]');
    },
  },
};
