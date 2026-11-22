import { gsap } from 'gsap';
import { bot } from '../lib/bot';
import { $, $$ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import type { Robot } from '../three/robot';

/**
 * Hero: "Hi, I'm [robot] Nibbo." with the robot standing in the gap of its own sentence. A shared link
 * (?bot=) swaps in the adopted robot's name. The intro is the wake-up: a yawn, a stretch, a look round, a wave.
 */
export function initHero(o: { director: Director; brain: Brain; robot: Robot; sound: Sound; reduced: boolean }): { intro(): void } {
  const { director, brain, robot, sound, reduced } = o;
  director.add({ id: 'hero', el: $('[data-slot="hero"]'), mood: 'happy', draggable: true });

  const name = $('[data-hero-name]');
  bot.subscribe((b, changed) => {
    if (changed === null || changed === 'name') name.textContent = `${b.name.trim() || 'Nibbo'}.`;
  });

  // The "drag me" hint bows out once the visitor has played with the robot.
  const hint = $('[data-hint]');
  let played = false;
  brain.onPlay = () => {
    if (played) return;
    played = true;
    gsap.to(hint, { autoAlpha: 0, scale: 0.8, duration: 0.35, ease: 'back.in(2)', overwrite: true });
  };
  gsap.set(hint, { autoAlpha: 0 });

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
      }, 2.75);
      tl.add(() => void (played || gsap.to(hint, { autoAlpha: 1, duration: 0.5 })), 3.4);
      tl.from($$('.hero__foot > *, .hero__eyebrow, .scroll-cue'), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0.4);
    },
  };
}
