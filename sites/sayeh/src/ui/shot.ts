import { onVisible } from '@portfolio-lab/kit/dom';
import type { App } from '../app';

/** The shot we pull: 18 g in, 36 g out, 28 seconds. */
export const SHOT = { dose: 18, out: 36, time: 28 };

/**
 * The espresso film with a live readout over it: a shot clock and a scale, mapped onto the slow-motion clip (the
 * first drops land about two seconds in, the cup is full at the end). It pulls once when it comes into view after
 * the visitor is in, then waits on the full cup; "Pull another" pulls again. A soft stream plays under it.
 */
export function mountShot(root: HTMLElement, app: App): () => void {
  const video = root.querySelector<HTMLVideoElement>('[data-shot-video]');
  const clock = root.querySelector('[data-shot-time]');
  const grams = root.querySelector('[data-shot-out]');
  const ratio = root.querySelector('[data-shot-ratio]');
  const bar = root.querySelector<HTMLElement>('[data-shot-bar]');
  const again = root.querySelector<HTMLButtonElement>('[data-shot-again]');
  if (!video) return () => undefined;

  let raf = 0;
  const read = (): void => {
    const d = video.duration || 10;
    const t = Math.min(video.currentTime, d);
    const drip = d * 0.2;
    const shot = t < drip * 0.75 ? (t / (drip * 0.75)) * 6 : 6 + ((t - drip * 0.75) / (d - drip * 0.75)) * (SHOT.time - 6);
    const out = t < drip ? 0 : SHOT.out * Math.pow((t - drip) / (d - drip), 1.2);
    if (clock) clock.textContent = `${shot.toFixed(1)} s`;
    if (grams) grams.textContent = `${out.toFixed(1)} g`;
    if (ratio) ratio.textContent = out > 0.5 ? `1 : ${(out / SHOT.dose).toFixed(2)}` : '—';
    bar?.style.setProperty('--p', (out / SHOT.out).toFixed(3));
    root.classList.toggle('is-flowing', !video.paused && out > 0.2 && out < SHOT.out - 0.5);
    app.sound.pour(!video.paused && out > 0.2 && out < SHOT.out - 0.3 ? 0.28 : 0);
    if (!video.paused && !video.ended) raf = requestAnimationFrame(read);
    else app.sound.pour(0);
  };
  const pull = (): void => {
    video.currentTime = 0;
    root.classList.add('is-pulling');
    void video.play().then(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    }, () => undefined);
  };
  video.addEventListener('ended', () => {
    root.classList.remove('is-pulling');
    root.classList.add('is-done');
    read();
  });
  again?.addEventListener('click', () => {
    root.classList.remove('is-done');
    app.sound.clink(0.7);
    pull();
  });
  read();

  // Only once the visitor is in (not behind the entry gate), and only while it's on screen.
  let entered = false;
  let visible = false;
  let pulled = false;
  const maybe = (): void => {
    if (entered && visible && !pulled) {
      pulled = true;
      video.preload = 'auto';
      pull();
    }
  };
  void app.entered.then(() => {
    entered = true;
    maybe();
  });
  const io = onVisible(
    video,
    (v) => {
      visible = v;
      if (!v && !video.paused) video.pause();
      else if (v && pulled && video.paused && !video.ended && video.currentTime > 0) void video.play().then(() => (raf = requestAnimationFrame(read)), () => undefined);
      maybe();
    },
    '0px',
    0.45,
  );
  return () => {
    io.disconnect();
    cancelAnimationFrame(raf);
    video.pause();
    app.sound.pour(0);
  };
}

/** The readout markup laid over a shot film. */
export const shotHud = (compact = false): string => `
  <div class="shot-hud${compact ? ' shot-hud--compact' : ''}" aria-hidden="true">
    <span><small>Shot</small><b data-shot-time>0.0 s</b></span>
    <span><small>Out</small><b data-shot-out>0.0 g</b></span>
    <span><small>Ratio</small><b data-shot-ratio>—</b></span>
    <i class="shot-hud__bar" data-shot-bar></i>
  </div>`;
