import { gsap } from 'gsap';
import { $ } from '../lib/dom';
import type { Sound } from '../lib/sound';
import type { Brain } from '../three/brain';
import type { Director, Slot } from '../three/director';
import { LedFace, type Mood } from '../three/face';

const MOODS: { mood: Mood; label: string; tint: string; caption: string }[] = [
  { mood: 'happy', label: 'Happy', tint: '#ffe9c2', caption: 'Its default setting. Gets even happier when you finish a level together.' },
  { mood: 'curious', label: 'Curious', tint: '#d9e8ff', caption: 'Head tilt included. Shows up whenever it spots something new.' },
  { mood: 'love', label: 'Love', tint: '#ffdcec', caption: 'Hearts. Happens after a good hug, or a really hard level solved.' },
  { mood: 'sleepy', label: 'Sleepy', tint: '#e7e1f7', caption: 'Low battery or past bedtime. Leave it alone for half a minute and it nods off on its own.' },
  { mood: 'grumpy', label: 'Grumpy', tint: '#ffd9cc', caption: 'Poke it five times in a row and find out. We don’t recommend it.' },
  { mood: 'surprised', label: 'Surprised', tint: '#fff3b8', caption: 'Sudden lifts, loud claps, plot twists.' },
  { mood: 'dizzy', label: 'Dizzy', tint: '#d4f5e6', caption: 'Spin your mouse in fast circles, or shake your phone. Poor thing.' },
];

/** Mood buttons, each with a live mini LED face. Picking one changes the robot's face, body language and voice. */
export function initFeelings(o: { director: Director; brain: Brain; sound: Sound; ledHex: string }): { recolor(hex: string): void } {
  const { director, brain, sound } = o;
  const slot: Slot = { id: 'feelings', el: $('[data-slot="feelings"]'), mood: 'happy', draggable: true };
  director.add(slot);

  const list = $('[data-moods]');
  const caption = $('[data-mood-caption]');
  const section = $('.feelings');
  const faces: LedFace[] = [];

  const buttons = MOODS.map((m, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mood';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(i === 0));
    const face = new LedFace(160, o.ledHex);
    face.snap(m.mood);
    face.update(0.016);
    face.canvas.setAttribute('aria-hidden', 'true');
    faces.push(face);
    btn.append(face.canvas, document.createTextNode(m.label));
    btn.addEventListener('click', () => pick(i));
    list.appendChild(btn);
    return btn;
  });

  // The mini faces animate only while hovered (or selected), to keep idle cost at zero.
  let current = 0;
  let last = performance.now();
  const animate = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (director.current?.id === 'feelings') faces[current].update(dt);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  function pick(i: number): void {
    const m = MOODS[i];
    current = i;
    buttons.forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
    caption.textContent = m.caption;
    gsap.to(section, { backgroundColor: m.tint, duration: 0.6 });
    slot.mood = m.mood;
    brain.setBaseMood(m.mood);
    brain.input();
    switch (m.mood) {
      case 'happy':
        sound.chirp('happy');
        brain.hop(0.3);
        break;
      case 'curious':
        sound.chirp('curious');
        brain.tiltHead(0.32, 1.4);
        break;
      case 'love':
        sound.chirp('love');
        brain.nod(1);
        break;
      case 'sleepy':
        sound.yawn();
        break;
      case 'grumpy':
        sound.hmph();
        brain.shiver();
        break;
      case 'surprised':
        sound.chirp('surprised');
        brain.hop(0.45);
        break;
      case 'dizzy':
        sound.woozy();
        brain.spin();
        break;
    }
  }

  caption.textContent = MOODS[0].caption;
  slot.enter = () => brain.setBaseMood(slot.mood);

  return {
    /** Follows the face-light colour chosen in the configurator. */
    recolor(hex: string) {
      faces.forEach((f, i) => {
        f.setColor(hex);
        f.snap(MOODS[i].mood);
        f.update(0.016);
      });
    },
  };
}
