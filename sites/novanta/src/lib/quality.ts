import { store } from './store';

/**
 * Lite mode, for older and low-memory phones: half-size textures (media from the "-lite" folders, built by
 * tools/make-novanta-lite.mjs), fewer lights, a lower pixel ratio and smaller shadow maps. The full scene needs
 * about 300 MB of GPU memory for its textures; lite needs about a quarter of that.
 *
 * It turns on by itself for devices that report 4 GB of memory or less, 4 CPU cores or fewer, or an iOS older than
 * 17 (the last versions old iPhones are stuck on); after a lost WebGL context (the device ran out of graphics
 * memory) or a slow first visit, it is remembered for next time. `?lite` forces it, `?full` turns it off.
 */

function detect(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('full')) return false;
  if (params.has('lite') || store.get<boolean>('lite', false)) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return true;
  if (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) return true;
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)_/.exec(navigator.userAgent);
  if (ios && Number(ios[1]) < 17) return true;
  return false;
}

export const LITE = detect();

/** Remember lite mode for this device's next visit. */
export function preferLite(): void {
  store.set('lite', true);
}

/** A media path, from the half-size folders in lite mode. */
export function mediaUrl(base: string, path: string): string {
  return `${base}media/${LITE ? path.replace(/^(pbr|textures|toppings|scenes|photos)\//, '$1-lite/') : path}`;
}

/** Whether the browser can run the scene at all (three.js needs WebGL 2). */
export function webgl2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // Give the probe context back straight away: low-memory devices only get a few.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
