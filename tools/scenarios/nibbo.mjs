// Screenshot scenario for sites/nibbo, used by tools/shoot.mjs.

export default {
  sections:
    'top,top:poke,top:toss,top:dizzy,top:tricks,hello^0.5,hello@0.25,hello@0.7:longpress,inside^0.5,inside@0.06,inside@0.2,inside@0.45,inside@0.45:xray,inside@0.7,' +
    'feelings^0.5,feelings~5,feelings:mood,play^0.5,play,play:solve,play:loop,make^0.5,make:custom,specs^0.5,specs,adopt^0.5,adopt,adopt:name,adopt:pack,footer^0.5,footer~2',

  // The intro (wake-up, stretch, wave) takes about 4 s after the gate.
  afterEnterMs: 4200,

  // The spinning stamp's bounding box grows while it rotates; the body clips horizontally anyway.
  overflowIgnore: '.hero__title, .footer__night, .tags, .stamp',

  // Robot state at each screenshot.
  probe: () => {
    const n = window.__nibbo;
    if (!n) return null;
    const r = n.robot.root;
    return {
      slot: n.director.current?.id ?? null,
      mood: n.robot.face.mood,
      scale: Number(r.scale.x.toFixed(3)),
      pos: [r.position.x, r.position.y, r.position.z].map((v) => Number(v.toFixed(2))),
      explode: Number(n.robot.exploded.toFixed(2)),
      drawCalls: n.stage.renderer.info.render.calls,
      triangles: n.stage.renderer.info.render.triangles,
    };
  },

  actions: {
    async tricks({ page, shot }) {
      await page.click('[data-tricks]');
      await page.waitForTimeout(600);
      await shot('tricks');
      await page.click('[data-tricks-close]');
      await page.waitForTimeout(300);
      return true;
    },

    // Outside the hero a touch only picks Nibbo up after a still long press; the page must not scroll meanwhile.
    async longpress({ page, name, shot }) {
      const at = await page.evaluate(() => {
        const n = window.__nibbo;
        const s = n.stage.toScreen(n.robot.parts.belly.getWorldPosition(new n.robot.root.position.constructor()));
        return { x: s.x, y: s.y, scroll: Math.round(scrollY) };
      });
      if (name === 'mobile') {
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
        await touch('touchStart', at);
        await page.waitForTimeout(480);
        for (let i = 1; i <= 8; i++) {
          await touch('touchMove', { x: at.x + i * 4, y: at.y - i * 14 });
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(200);
        await shot('held');
        await touch('touchEnd');
      } else {
        await page.mouse.move(at.x, at.y);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) await page.mouse.move(at.x + i * 4, at.y - i * 14, { steps: 2 });
        await page.waitForTimeout(200);
        await shot('held');
        await page.mouse.up();
      }
      const after = await page.evaluate(() => Math.round(scrollY));
      if (after !== at.scroll) console.warn(`longpress scrolled the page by ${after - at.scroll}px`);
      await page.waitForTimeout(1500);
      return true;
    },

    // Pick Nibbo up by the body, swing it up and to the right, let go. Real touch events on phones (via CDP),
    // so the "touch on the robot picks it up instead of scrolling" path is exercised too.
    async toss({ page, name, shot }) {
      const at = await page.evaluate(() => {
        const n = window.__nibbo;
        const s = n.stage.toScreen(n.robot.parts.belly.getWorldPosition(new n.robot.root.position.constructor()));
        return { x: s.x, y: s.y };
      });
      const path = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: at.x + i * 9, y: at.y - i * 26 }));
      if (name === 'mobile') {
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
        await touch('touchStart', path[0]);
        for (const p of path.slice(1)) {
          await touch('touchMove', p);
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(250);
        await shot('held');
        await touch('touchMove', { x: path[8].x + 60, y: path[8].y - 40 });
        await touch('touchEnd');
      } else {
        await page.mouse.move(path[0].x, path[0].y);
        await page.mouse.down();
        for (const p of path.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
        await page.waitForTimeout(250);
        await shot('held');
        await page.mouse.move(path[8].x + 90, path[8].y - 60, { steps: 2 });
        await page.mouse.up();
      }
      await page.waitForTimeout(180);
      await shot('tossed');
      const scroll = await page.evaluate(() => Math.round(scrollY));
      if (scroll !== 0) console.warn(`toss scrolled the page to ${scroll}`);
      await page.waitForTimeout(2400);
      return true;
    },

    // Fast circles with the mouse; on phones, a burst of hard shakes.
    async dizzy({ page, name }) {
      if (name === 'mobile') {
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() =>
            window.dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 22, y: 9, z: 4 }, accelerationIncludingGravity: null, rotationRate: null, interval: 16 })),
          );
          await page.waitForTimeout(200);
        }
      } else {
        for (let i = 0; i < 70; i++) {
          const a = i * 0.7;
          await page.mouse.move(720 + Math.cos(a) * 260, 450 + Math.sin(a) * 200);
          await page.waitForTimeout(8);
        }
      }
      await page.waitForTimeout(500);
    },

    async xray({ page, shot }) {
      await page.click('[data-xray]');
      await page.waitForTimeout(700);
      await shot('xray');
      await page.click('[data-xray]');
      await page.waitForTimeout(300);
      return true;
    },

    // Level 4: Repeat 4× [Forward, Left, Forward, Right].
    async loop({ page, shot }) {
      await page.click('[data-level-dots] .level-dot:nth-child(4)');
      await page.waitForTimeout(900);
      await page.locator('.palette .block--repeat').click();
      await page.waitForTimeout(1000);
      await page.locator('.loop__head').click();
      await page.locator('.loop__head').click();
      for (const k of ['forward', 'left', 'forward', 'right']) await page.locator(`.palette .block--${k}`).click();
      await page.waitForTimeout(300);
      await shot('program');
      await page.click('[data-run]');
      await page.waitForTimeout(3500);
      await shot('running');
      await page.waitForTimeout(5200);
    },

    // Click the robot's head: a random reaction (hop, spin, wave, love...).
    async poke({ page }) {
      const pt = await page.evaluate(() => {
        const n = window.__nibbo;
        const v = n.robot.parts.visor.getWorldPosition(new n.robot.root.position.constructor());
        const s = n.stage.toScreen(v);
        return { x: s.x, y: s.y };
      });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(500);
    },

    async mood({ page }) {
      await page.locator('.mood', { hasText: 'Love' }).click();
      await page.waitForTimeout(900);
    },

    // Level 1: four Forward blocks, Go, then catch the celebration.
    async solve({ page, shot }) {
      // Like a person: the first block brings the board into view on phones; let that glide finish.
      await page.locator('.palette .block--forward').click();
      await page.waitForTimeout(1000);
      for (let i = 0; i < 3; i++) await page.locator('.palette .block--forward').click();
      await page.waitForTimeout(300);
      await shot('program');
      await page.click('[data-run]');
      await page.waitForTimeout(1100);
      await shot('running');
      await page.waitForTimeout(1500);
    },

    async custom({ page }) {
      await page.click('[data-shells] [aria-label="Mint"]');
      await page.waitForTimeout(500);
      await page.click('[data-leds] [aria-label="Rose"]');
      await page.waitForTimeout(400);
      await page.locator('[data-accs] .choice', { hasText: 'Propeller' }).click();
      await page.waitForTimeout(1200);
    },

    async name({ page, shot }) {
      await page.fill('[data-name-input]', '');
      await page.type('[data-name-input]', 'Pixel', { delay: 60 });
      await page.waitForTimeout(500);
      await shot('typing');
      await page.waitForTimeout(1800);
    },

    async pack({ page }) {
      await page.click('[data-adopt-btn]');
      await page.waitForTimeout(4200);
    },
  },
};
