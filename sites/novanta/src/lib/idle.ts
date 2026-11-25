/**
 * Background work in small slices. `slice()` resolves when the browser has a moment to spare and nothing on screen
 * is animating (the camera isn't moving), so building things in the background never costs a frame of a move.
 * Work that someone is waiting for (`urgent`) still goes ahead, one slice at a time.
 */

type IdleWindow = Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number };

let busy: () => boolean = () => false;
let urgent = 0;
let hurried = 0;

/** Tells the scheduler when the page is busy animating (checked before every slice). */
export function setBusy(fn: () => boolean): void {
  busy = fn;
}

/** While `fn` runs, slices don't wait for quiet moments (someone is waiting for the result). */
export async function hurry<T>(fn: () => Promise<T>): Promise<T> {
  urgent++;
  try {
    return await fn();
  } finally {
    urgent--;
  }
}

export function slice(): Promise<void> {
  const w = window as IdleWindow;
  return new Promise((resolve) => {
    const attempt = (): void => {
      // Someone is waiting: several slices a frame, then let a frame through.
      if (urgent > 0) return void (++hurried % 6 ? resolve() : requestAnimationFrame(() => resolve()));
      const go = (d?: { timeRemaining(): number }): void => {
        if (busy() || (d && d.timeRemaining() < 6)) return void setTimeout(attempt, 120);
        resolve();
      };
      if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 });
      else setTimeout(() => go(), 60);
    };
    attempt();
  });
}
