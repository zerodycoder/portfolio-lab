import { ACCESSORIES, bot, cleanName, LEDS, SHELLS } from '../lib/bot';
import { $, $$, vibrate } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { ShipBox } from '../three/box';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import type { Robot } from '../three/robot';
import type { Tricks } from './tricks';

/**
 * Adoption. Typing a name scrolls it across Nibbo's LED face; a pause, and Nibbo says it out loud (in robot).
 * "Adopt" hops the robot into its box, folds the flaps, tapes it and prints a label with the name and options.
 * The result is a link that opens the site with exactly this robot (name included).
 */
export function initAdopt(o: { director: Director; brain: Brain; robot: Robot; sound: Sound; box: ShipBox; tricks: Tricks; toast: (msg: string) => void }): { update(): void } {
  const { director, brain, robot, sound, box, tricks, toast } = o;
  const slotEl = $('[data-slot="adopt"]');
  director.add({
    id: 'adopt',
    el: slotEl,
    mood: 'happy',
    draggable: false,
    pose: (out, rect) => {
      box.layout(rect);
      box.robotPose(out);
      return true;
    },
    leave: () => robot.face.marquee(null),
  });

  const form = $<HTMLFormElement>('[data-adopt-form]');
  const input = $<HTMLInputElement>('[data-name-input]');
  const summary = $('[data-summary]');
  const adoptBtn = $<HTMLButtonElement>('[data-adopt-btn]');
  const done = $('[data-adopt-done]');
  const note = $('[data-share-note]');

  if (bot.get().name !== 'Nibbo') input.value = bot.get().name;

  bot.subscribe((b) => {
    const name = b.name.trim() || 'Nibbo';
    $$('[data-adopt-name], [data-packed-name], [data-share-name]').forEach((n) => (n.textContent = name));
    const acc = ACCESSORIES[b.accessory];
    summary.textContent = `${SHELLS[b.shell].name} shell · ${LEDS[b.led].name} face light · ${acc.name === 'Nothing' ? 'no hat' : acc.name}`;
  });

  let sayTimer = 0;
  input.addEventListener('input', () => {
    const clean = cleanName(input.value);
    if (clean !== input.value) input.value = clean;
    bot.set('name', clean.trim() || 'Nibbo');
    brain.input();
    robot.face.marquee(clean.trim() ? clean.trim().toUpperCase() : null, 16);
    window.clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => {
      robot.face.marquee(null);
      if (!clean.trim()) return;
      sound.say(clean);
      brain.react('joy', 1.4, false);
      brain.hop(0.25);
      tricks.find('name');
    }, 1400);
  });
  input.addEventListener('blur', () => {
    window.clearTimeout(sayTimer);
    robot.face.marquee(null);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (box.packed) return;
    window.clearTimeout(sayTimer);
    robot.face.marquee(null);
    input.blur();
    adoptBtn.disabled = true;
    brain.busy = true;
    brain.react('love', 1.4, false);
    sound.say(bot.get().name);
    box
      .pack(bot.get(), {
        hop: () => {
          sound.whee();
          brain.react('starry', 1, false);
        },
        land: () => sound.land(0.8),
        flap: () => sound.flap(),
        tape: () => sound.tape(),
        label: () => {
          sound.press();
          vibrate(20);
        },
      })
      .then(() => {
        adoptBtn.hidden = true;
        done.hidden = false;
        history.replaceState(null, '', bot.shareUrl());
        brain.busy = false;
        sound.jingle();
        tricks.find('pack');
      });
  });

  $('[data-share]').addEventListener('click', async () => {
    const url = bot.shareUrl();
    const name = bot.get().name;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (nav.share && matchMedia('(pointer: coarse)').matches) {
        await nav.share({ title: `Meet ${name}`, text: `${name} is a Nibbo. Say hi:`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast(`${name}’s link is copied`);
    } catch {
      note.textContent = url;
    }
  });

  $('[data-unpack]').addEventListener('click', () => {
    done.hidden = true;
    brain.busy = true;
    box
      .unpack({
        flap: () => sound.flap(),
        hop: () => {
          sound.chirp('hello');
          brain.react('joy', 1.4, false);
        },
      })
      .then(() => {
        adoptBtn.hidden = false;
        adoptBtn.disabled = false;
        brain.busy = false;
      });
  });

  let wasShown = false;
  return {
    update() {
      const r = slotEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const shown = r.bottom > vh * 0.1 && r.top < vh * 0.9;
      if (shown) box.layout(r);
      if (shown !== wasShown) {
        wasShown = shown;
        box.setShown(shown);
      }
    },
  };
}
