import type { VenueId } from '@strumble/crowd';

/**
 * When the live 3D room may be shown over the screens' photographic plates (pure, no React Native: tested in
 * stageGate.test.ts).
 *
 * The crowd page builds one room per page load: a `venue` message for another room makes it reload itself into that
 * room (`location.replace`, prototypes/crowd3d/crowd.js), and until the new page has drawn its first frames the WebView
 * shows only its house-black background. On the emulator that is 1.3–1.8 s after every venue change on the bill; on the
 * Google TV 7–8 s, and a load that started while the D-pad was still moving could even show the previous room under
 * the new room's name (black-screen hunt, 2026-10-13). So the stage counts as visible only while the page that last
 * said `ready` was loaded for the room the TV wants now; otherwise the screens show the wanted room's plate.
 */

/** The page's own room when its URL names none (crowd.js: `VENUES[Q.get('venue')] ? Q.get('venue') : 'club'`). */
export const PAGE_DEFAULT_VENUE: VenueId = 'club';

/**
 * A venue change on the bill is posted to the page only once the selection has rested this long, so scrolling through
 * the rooms reloads the page once, for the room you stop on, instead of once per key press (each reload restarts a load
 * that takes 7–8 s on the Google TV, 25 s or more cold: three Right presses during the first load put the first room 77 s
 * after launch). The plate of the selected room shows meanwhile.
 */
export const VENUE_SETTLE_MS = 700;

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/**
 * The room a page loaded for, from its URL: the `venue` query value, the page's default room when the URL names none,
 * or 'any' when it can't be told (no URL) or the page is locked to its room (`venue-lock`: it never reloads).
 */
export function pageVenueOf(url: string | null | undefined): string {
  if (!url) return 'any';
  const q = url.indexOf('?');
  if (q < 0) return PAGE_DEFAULT_VENUE;
  const hash = url.indexOf('#', q);
  const query = url.slice(q + 1, hash < 0 ? undefined : hash);
  let venue: string | null = null;
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    const name = decode(eq < 0 ? part : part.slice(0, eq));
    if (name === 'venue-lock') return 'any';
    if (name === 'venue' && eq >= 0) venue = decode(part.slice(eq + 1));
  }
  return venue || PAGE_DEFAULT_VENUE;
}

/**
 * Whether the stage shows the wanted room: `readyFor` is the room of the page that last said `ready` (null while a page
 * is loading, after a renderer loss, or before the first ready).
 */
export function stageShows(readyFor: string | null, wanted: VenueId): boolean {
  return readyFor !== null && (readyFor === 'any' || readyFor === wanted);
}

/**
 * How long to wait before posting the venue message: at once when the page has just (re)loaded, during a set or after
 * one (the live screen must not wait), or for the first post; after `VENUE_SETTLE_MS` of rest for a change on the bill.
 */
export function venuePostDelay(mode: 'preview' | 'live' | 'after', firstForThisPage: boolean): number {
  return mode === 'preview' && !firstForThisPage ? VENUE_SETTLE_MS : 0;
}
