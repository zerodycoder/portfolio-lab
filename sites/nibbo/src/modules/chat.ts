import { $, $$ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director } from '../three/director';
import { LedFace, type Mood } from '../three/face';

/**
 * Nibbo introduces itself as a chat thread. Each of its lines carries a tiny live LED avatar with the face that
 * goes with the line; bubbles type in as they scroll into view, and the 3D robot pulls the same face (and chirps
 * it). The visitor's replies make it tilt its head and listen.
 */
export function initChat(o: { director: Director; brain: Brain; sound: Sound; ledHex: string }): { recolor(hex: string): void } {
  const { director, brain, sound } = o;
  director.add({ id: 'hello', el: $('[data-slot="hello"]'), mood: 'idle', draggable: true });

  const bubbles = $$('[data-chat] .bubble');
  const avatars: { face: LedFace; mood: Mood }[] = [];
  bubbles.forEach((b) => {
    const you = b.classList.contains('bubble--you');
    const who = document.createElement('span');
    who.className = 'bubble__who';
    who.setAttribute('aria-hidden', 'true');
    if (you) {
      who.textContent = 'You';
    } else {
      const mood = (b.dataset.mood ?? 'idle') as Mood;
      const face = new LedFace(128, o.ledHex);
      face.snap(mood);
      face.update(0.016);
      avatars.push({ face, mood });
      who.append(face.canvas, document.createTextNode('Nibbo'));
    }
    b.prepend(who);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        const mood = (el.dataset.mood ?? 'idle') as Mood;
        const you = el.classList.contains('bubble--you');
        el.classList.add('is-in', 'is-typing');
        setTimeout(
          () => {
            el.classList.remove('is-typing');
            if (director.current?.id !== 'hello') return;
            if (you) {
              brain.tiltHead(0.3, 1.2);
              brain.react(mood, 1.6, false);
            } else {
              brain.react(mood, 2.4, false);
              sound.chirp(mood === 'idle' ? undefined : mood);
              if (mood === 'joy') brain.dance();
              if (mood === 'happy') brain.wave();
              if (mood === 'starry') brain.hop(0.3);
            }
          },
          you ? 250 : 520,
        );
      });
    },
    { rootMargin: '0px 0px -30% 0px' },
  );
  bubbles.forEach((b) => io.observe(b));

  return {
    recolor(hex) {
      avatars.forEach(({ face, mood }) => {
        face.setColor(hex);
        face.snap(mood);
        face.update(0.016);
      });
    },
  };
}
