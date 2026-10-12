/**
 * Names for the status line: the act and the house the performer is facing. These mirror the
 * venue table in docs/concept-encore.md; once `@strumble/crowd` exports its act packs the
 * phone can read the names from there instead.
 */
import type { ActId, VenueId } from '@strumble/crowd';

const ACT_NAMES: Record<ActId, string> = {
  standup: 'Stand-up',
  poetry: 'Poetry',
  speech: 'Speech',
  singing: 'Singing',
};

const HOUSES: Record<ActId, Record<VenueId, string>> = {
  standup: { openmic: 'The Back Room', club: 'The Basement', theatre: 'The Playhouse', arena: 'The Bowl' },
  poetry: { openmic: 'Tuesday Slam', club: 'The Cellar', theatre: 'The Studio', arena: 'The Dome' },
  speech: { openmic: "The Meeting Hall", club: 'The Lecture Room', theatre: 'The Auditorium', arena: 'The Keynote' },
  singing: { openmic: 'The Pub Mic', club: 'The Bar Stage', theatre: 'The Concert Hall', arena: 'The Stadium' },
};

export function actName(act: ActId): string {
  return ACT_NAMES[act] ?? act;
}

export function houseName(act: ActId, venue: VenueId): string {
  return HOUSES[act]?.[venue] ?? venue;
}

/** "3:12" for 192 seconds; never negative. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
