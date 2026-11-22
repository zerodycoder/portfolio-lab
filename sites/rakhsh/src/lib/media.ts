import { isNarrow } from './dom';
import type { Finish } from './finish';

/**
 * Media manifest written by tools/process-rakhsh.mjs from the raw files in assets-inbox/rakhsh.
 * Every entry is optional: each section renders its own designed fallback when an asset is absent.
 */
export type Media = {
  hero?: { src: string; srcMobile?: string };
  reveal?: { src: string; srcMobile?: string };
  orbit?: { frames: number; pattern: string; patternMobile?: string; width: number; height: number };
  ride?: { src: string; srcMobile?: string; poster?: string };
  legend?: { src?: string; video?: string };
  colors?: Partial<Record<Finish, string>>;
  details?: (string | null)[];
};

export async function loadMedia(): Promise<Media> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}media/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return {};
    return (await res.json()) as Media;
  } catch {
    return {};
  }
}

export const pick = (src: string, mobile?: string): string => (mobile && isNarrow() ? mobile : src);

export function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

/** Resolves once a video can play through, or after a timeout so a slow network never blocks the page. */
export function videoReady(video: HTMLVideoElement, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 3) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      video.removeEventListener('canplaythrough', done);
      video.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener('canplaythrough', done);
    video.addEventListener('error', done);
  });
}
