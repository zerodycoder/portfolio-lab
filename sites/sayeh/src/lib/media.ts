import type { OriginId } from './catalog';

export type Video = { mp4: string; mp4Small?: string; poster?: string };

/**
 * Generated media, processed by tools/process-sayeh.mjs into public/media and described by manifest.json. Every
 * page falls back to a designed state for anything missing, so the site works with any subset of the assets.
 */
export type Media = {
  /** The top-down cup: image size, and the liquid circle (centre and radius) in image pixels. */
  cup?: { src: string; crema?: string; w: number; h: number; cx: number; cy: number; r: number; bg: string };
  roast?: Video;
  espresso?: Video;
  hands?: string;
  origins?: Partial<Record<OriginId, string>>;
  cafe?: { day?: string; night?: string };
  og?: string;
};

export async function loadMedia(): Promise<Media> {
  try {
    const res = await fetch('/media/manifest.json', { cache: 'no-cache' });
    return res.ok ? ((await res.json()) as Media) : {};
  } catch {
    return {};
  }
}
