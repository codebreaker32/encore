/**
 * Measured analysis shared by the TV and the MC service. No MC words live here, or anywhere in
 * this package: every word the MC says is written by the model, and when the model cannot answer
 * the MC is silent. What remains is arithmetic over the scorecard and the limits the screens hold
 * the model's words to.
 */
import type { ActId, McNote, Scorecard, SetRecord, VenueId } from './types';

/** The longest `McNote.headline` the screens will lay out. */
export const HEADLINE_MAX = 60;
/** The longest `McNote.line` the screens will lay out. */
export const LINE_MAX = 180;

/** The biggest measured problem of a set, in the MC service's order. */
export type Diagnosis = 'gap' | 'pace' | 'fillers' | 'beat' | 'hold' | 'praise';

/** gap (≥ 4 s of dead air) → pace (peak ≥ 185 wpm) → fillers (≥ 5) → beat (< 40 % landed) → hold (singing, < 60 % in tune) → praise. */
export function diagnose(sc: Scorecard, act: ActId): Diagnosis {
  if (sc.longestDeadAirSec >= 4 && sc.longestDeadAirAt !== null) return 'gap';
  if (sc.peakWpm !== null && sc.peakWpm >= 185) return 'pace';
  if (sc.fillers !== null && sc.fillers.count >= 5) return 'fillers';
  if (act !== 'singing' && (sc.candidates === 0 || sc.landed / sc.candidates < 0.4)) return 'beat';
  if (act === 'singing' && (sc.inTunePct === null || sc.inTunePct < 60)) return 'hold';
  return 'praise';
}

/** The venue rule: up on 3 landed a minute with no silence of 4 s (never above the arena), down on under 1 above open mic. */
export function nextVenue(sc: Scorecard, venue: VenueId): McNote['next'] {
  if (sc.landedPerMin >= 3 && sc.longestDeadAirSec < 4) return venue === 'arena' ? 'again' : 'up';
  if (sc.landedPerMin < 1 && venue !== 'openmic') return 'down';
  return 'again';
}

/** Whether two performer names are the same person's (the phone's name, trimmed and case-insensitive). */
export function samePerformer(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The MC's memory of one performer: their own sets only, newest last, at most `max`. Every MC request (the intro and
 * the cards, the debrief, the green room) is built from this, so one performer's numbers are never credited to the
 * next one at the mic. People are told apart by the name their phone gives (the seat's name on the relay).
 */
export function memoryFor(records: SetRecord[], performer: string, max = 6): SetRecord[] {
  const own = records.filter((r) => samePerformer(r.performer, performer));
  return own.slice(Math.max(0, own.length - max));
}
