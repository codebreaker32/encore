import { describe, expect, it } from 'vitest';
import { PAGE_DEFAULT_VENUE, VENUE_SETTLE_MS, pageVenueOf, stageShows, venuePostDelay } from './stageGate';

// Run with: packages/crowd/node_modules/.bin/vitest run --root packages/shared-ui src/encore/world/stageGate.test.ts
describe('pageVenueOf', () => {
  it('reads the room from the URL the page reloaded itself into', () => {
    expect(pageVenueOf('file:///android_asset/crowd/index.html?host=1&preset=tv&venue=theatre')).toBe('theatre');
    expect(pageVenueOf('file:///android_asset/crowd/index.html?venue=arena&host=1#x')).toBe('arena');
  });
  it("is the page's default room when the URL names none", () => {
    expect(pageVenueOf('file:///android_asset/crowd/index.html?host=1&preset=tv')).toBe(PAGE_DEFAULT_VENUE);
    expect(pageVenueOf('file:///android_asset/crowd/index.html')).toBe(PAGE_DEFAULT_VENUE);
  });
  it("is 'any' when it can't be told or the page never reloads", () => {
    expect(pageVenueOf(undefined)).toBe('any');
    expect(pageVenueOf('')).toBe('any');
    expect(pageVenueOf('file:///x/index.html?venue=club&venue-lock=1')).toBe('any');
  });
});

describe('stageShows', () => {
  it('hides the stage while a page loads and before the first ready', () => {
    expect(stageShows(null, 'club')).toBe(false);
  });
  it('shows it only when the ready page was built for the wanted room', () => {
    expect(stageShows('club', 'club')).toBe(true);
    // a venue change on the bill: the old room is still up, but the stage is hidden at once (the plate shows)
    expect(stageShows('club', 'theatre')).toBe(false);
    // a page that finished loading the room before last (the D-pad moved on while it loaded) is never shown
    expect(stageShows('theatre', 'arena')).toBe(false);
    expect(stageShows('any', 'arena')).toBe(true);
  });
});

describe('venuePostDelay', () => {
  it('waits for the bill selection to rest, once the page has its first room', () => {
    expect(venuePostDelay('preview', false)).toBe(VENUE_SETTLE_MS);
  });
  it('posts at once to a fresh page, and during or after a set', () => {
    expect(venuePostDelay('preview', true)).toBe(0);
    expect(venuePostDelay('live', false)).toBe(0);
    expect(venuePostDelay('after', false)).toBe(0);
  });
});
