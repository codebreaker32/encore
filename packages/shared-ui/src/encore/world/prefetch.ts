import { Platform } from 'react-native';
import type { Clip } from './clips';
import { mediaUri } from './sounds';

const warmed: Record<string, true> = {};

/**
 * Warm the browser's cache for a venue's clips before the director needs them, so a cut lands on moving footage instead
 * of waiting on a cold first load. Web only (the dev server and a laptop browser are where cold loads show); native
 * players read bundled files and need no warm-up.
 */
export function prefetchClips(list: (Clip | undefined)[]): void {
  if (Platform.OS !== 'web' || typeof fetch !== 'function') return;
  for (const clip of list) {
    if (!clip) continue;
    const uri = mediaUri(clip.clip);
    if (!uri || warmed[uri]) continue;
    warmed[uri] = true;
    fetch(uri).catch(() => {
      // A failed warm-up changes nothing: the VideoPlate still falls back to the poster and the still.
    });
  }
}
