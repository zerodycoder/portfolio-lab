import { finePointer } from '../lib/dom';
import type { Brain, BrainEvent } from '../three/brain';
import type { Director } from '../three/director';
import type { Speech } from './speech';
import type { TrickId, Tricks } from './tricks';

type Hint = { trick: TrickId; fine: string; touch?: string };

/** What Nibbo suggests in each section, in order, skipping tricks already found. */
const HINTS: Record<string, Hint[]> = {
  hero: [
    { trick: 'pickup', fine: 'Psst. Grab me and throw me. I bounce.', touch: 'Psst. Press on me and fling me. I bounce.' },
    { trick: 'poke', fine: 'Boop my nose. Go on.', touch: 'Tap my nose. Go on.' },
    { trick: 'bop', fine: 'Those letter blocks are mine. Click one.', touch: 'Those letter blocks are mine. Tap one.' },
  ],
  inside: [{ trick: 'xray', fine: 'Flip the X-ray switch. It tickles.' }],
  feelings: [
    { trick: 'dizzy', fine: 'Circle your mouse really fast. I dare you.', touch: 'Give your phone a shake. I dare you.' },
    { trick: 'mood', fine: 'Go on, pick a feeling for me.' },
  ],
  play: [{ trick: 'solve', fine: 'Give me a plan. I follow it exactly.' }],
  make: [{ trick: 'makeover', fine: 'New hat? Please say new hat.' }],
  specs: [
    { trick: 'grumpy', fine: 'Fun fact: poking me five times in a row is rude.', touch: 'Fun fact: tapping me five times in a row is rude.' },
    { trick: 'sleep', fine: 'Leave me alone for half a minute and I nap.' },
  ],
  adopt: [
    { trick: 'name', fine: 'What will you call me?' },
    { trick: 'pack', fine: 'I fit in that box. I checked.' },
  ],
  hello: [
    { trick: 'pickup', fine: 'You can pick me up, you know.', touch: 'Press and hold me. I like being carried.' },
  ],
};

/** What Nibbo says when the visitor finds a trick. */
const CHEERS: Partial<Record<TrickId, string>> = {
  poke: 'Boop!',
  pickup: 'Whoa! Up we go.',
  toss: 'Wheeeee!',
  dizzy: 'The room is spinning…',
  grumpy: 'Hmph. That’s enough poking.',
  bop: 'My blocks!',
  xray: 'Hey! Those are my insides.',
  solve: 'Home! Charging up.',
  makeover: 'Ooh. Fancy.',
  pack: 'Comfy in here.',
};

/**
 * The coach turns hidden interactions into discovered ones: after a few quiet seconds in a section, Nibbo
 * suggests a trick the visitor hasn't found yet (one per visit to a section, never while they're busy), and it
 * reacts in words when one is found.
 */
export function initCoach(o: { director: Director; brain: Brain; tricks: Tricks; speech: Speech; name: () => string }): { update(dt: number): void } {
  const { director, brain, tricks, speech } = o;
  let here: string | null = null;
  let since = 0;
  let quietSince = 0;
  let lastHint = -99;
  let clock = 0;
  const hinted = new Set<string>();

  director.onChange((slot) => {
    here = slot.id;
    since = 0;
    hinted.delete(slot.id);
  });

  const map: Partial<Record<BrainEvent, TrickId>> = { poke: 'poke', pickup: 'pickup', toss: 'toss', dizzy: 'dizzy', grumpy: 'grumpy', sleep: 'sleep' };
  brain.on((e) => {
    quietSince = clock;
    const trick = map[e];
    if (trick) tricks.find(trick);
    if (e === 'wake') speech.say('I’m up! I’m up!', 2);
    if (e === 'sleep') speech.say('Zzz…', 2.5);
  });

  tricks.onFound((id, count) => {
    lastHint = clock;
    if (count === tricks.total) {
      speech.say('You found every trick. You know me better than I do.', 4.5);
      brain.react('starry', 3);
      brain.dance();
      return;
    }
    const line = id === 'name' ? `${o.name()}? I love it.` : CHEERS[id];
    if (line) speech.say(line, 2.4);
  });

  window.addEventListener('pointerdown', () => (quietSince = clock), { passive: true });
  window.addEventListener('keydown', () => (quietSince = clock));

  return {
    update(dt) {
      clock += dt;
      since += dt;
      if (!here || hinted.has(here) || speech.busy || brain.busy || brain.isAsleep) return;
      const wait = here === 'hero' ? 7 : 4;
      if (since < wait || clock - quietSince < 2.5 || clock - lastHint < 10) return;
      const hint = (HINTS[here] ?? []).find((h) => !tricks.has(h.trick));
      if (!hint) return;
      hinted.add(here);
      lastHint = clock;
      speech.say(finePointer() ? hint.fine : (hint.touch ?? hint.fine), 5);
    },
  };
}
