import { gsap } from 'gsap';
import { bot } from '../lib/bot';
import { $, $$ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import type { Robot } from '../three/robot';
import type { Speech } from './speech';

/**
 * Hero: "Hi, I'm [robot] Nibbo." with the robot standing in the gap of its own sentence. A shared link
 * (?bot=) swaps in the adopted robot's name. The intro is the wake-up: a yawn, a stretch, a look round, a wave
 * and a hello in its speech bubble.
 */
export function initHero(o: { director: Director; brain: Brain; robot: Robot; sound: Sound; speech: Speech; reduced: boolean }): { intro(): void } {
  const { director, brain, robot, sound, speech, reduced } = o;
  director.add({ id: 'hero', el: $('[data-slot="hero"]'), mood: 'happy', draggable: true });

  const name = $('[data-hero-name]');
  bot.subscribe((b, changed) => {
    if (changed === null || changed === 'name') name.textContent = `${b.name.trim() || 'Nibbo'}.`;
  });

  return {
    intro() {
      const p = brain.pose;
      const tl = gsap.timeline();
      brain.react('sleepy', 1.6, false);
      tl.add(() => sound.yawn(), 0.1);
      if (!reduced) {
        // Stretch: both arms up, a little rise on the toes.
        tl.to(p, { armL: 2.2, armR: 2.2, headNod: -0.18, duration: 0.6, ease: 'power2.out' }, 0.2)
          .to(robot.emote.position, { y: 0.08, duration: 0.6, ease: 'power2.out' }, 0.2)
          .to(p, { armL: 0, armR: 0, headNod: 0, duration: 0.5, ease: 'power2.inOut' }, 1.05)
          .to(robot.emote.position, { y: 0, duration: 0.4, ease: 'power2.in' }, 1.05)
          // Looks around: who woke me?
          .to(p, { headTurn: -0.5, duration: 0.35, ease: 'power2.inOut' }, 1.5)
          .to(p, { headTurn: 0.5, duration: 0.45, ease: 'power2.inOut' }, 1.95)
          .to(p, { headTurn: 0, duration: 0.35, ease: 'power2.inOut' }, 2.5);
      }
      tl.add(() => {
        brain.react('joy', 1.4, false);
        sound.chirp('hello');
        brain.wave();
        if (director.current?.id === 'hero') speech.say(bot.shared ? `Hi! I’m ${bot.get().name}.` : 'Oh! Hi there.', 2.6);
      }, 2.75);
      tl.from($$('.hero__foot > *, .hero__eyebrow, .scroll-cue, .stamp'), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0.4);
    },
  };
}
