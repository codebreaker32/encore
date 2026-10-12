/**
 * Act packs: the four acts, each with the four venues from the spec's venues table, the plates
 * the director may cut to, and the MC personas. Pure data; `packsAsJson()` is the S3 copy.
 *
 * A tougher venue changes the room (threshold, patience, heckles, hold), never the score: the
 * scorecard counts `landed` at HOUSE_STANDARD everywhere.
 */
import type { ActId, ActPack, PersonaId, PlateId, Venue, VenueId } from './types';

/** The landing score a line needs to count as `landed` on the scorecard, at every venue. */
export const HOUSE_STANDARD = 0.55;

export const PERSONAS: Record<PersonaId, { name: string; blurb: string }> = {
  warm: { name: 'Meera', blurb: 'Wants you to do well and says so; finds the number that proves it.' },
  sarcastic: { name: 'Vik', blurb: 'Dry as the ice bucket. Mocks the material and the numbers, never the person.' },
  strict: { name: 'Mr. Rao', blurb: 'Counts the beats and the fillers. Praise is rare and exact.' },
  deadpan: { name: 'Dev', blurb: 'Reads the numbers in a flat voice and lets them land.' },
};

interface VenueRules {
  seats: number;
  threshold: number;
  patienceSec: number;
  hecklesAfterDeadBits: number;
  reactionHoldMs: number;
}

/** The venues table from the spec; identical for every act. */
const RULES: Record<VenueId, VenueRules> = {
  openmic: { seats: 30, threshold: 0.42, patienceSec: 5.0, hecklesAfterDeadBits: 0, reactionHoldMs: 1800 },
  club: { seats: 80, threshold: 0.55, patienceSec: 3.5, hecklesAfterDeadBits: 2, reactionHoldMs: 2000 },
  theatre: { seats: 800, threshold: 0.66, patienceSec: 2.5, hecklesAfterDeadBits: 2, reactionHoldMs: 2300 },
  arena: { seats: 20000, threshold: 0.75, patienceSec: 2.0, hecklesAfterDeadBits: 1, reactionHoldMs: 2600 },
};

interface Plates {
  wide: PlateId[];
  reaction: PlateId[];
  finale: PlateId[];
}

/** Plate ids are file names (without extension) in packages/shared-ui/src/assets/plates/. */
const PLATES: Record<VenueId, Plates> = {
  openmic: {
    wide: ['openmic-pub-tables-from-stage-bertelli', 'openmic-small-club-crowd-attias'],
    reaction: ['comedy-laughing-seated-group-lewis'],
    finale: ['openmic-pub-guitar-from-stage-bertelli'],
  },
  club: {
    wide: ['comedy-club-dark-red-quintero', 'comedy-club-crowd-hands-quintero'],
    reaction: ['comedy-laughing-crowd-jimenez', 'comedy-laughing-faces-bucks'],
    finale: ['comedy-club-neon-crowd-regan-asante'],
  },
  theatre: {
    wide: ['theatre-red-seats-lit-faces-luhaers', 'theatre-attentive-audience-antenna'],
    reaction: ['comedy-improv-bar-audience-lindamarie', 'theatre-rows-warm-faces-oquendo'],
    finale: ['theatre-applause-red-seats-vietfotos'],
  },
  arena: {
    wide: ['arena-packed-blue-crowd-quintero', 'arena-crowd-faces-from-stage-whitehead'],
    reaction: ['arena-cheering-faces-green', 'arena-festival-hands-up-lakatos'],
    finale: ['arena-hands-raised-orange-vanleur'],
  },
};

const POETRY_PLATES: Record<VenueId, Plates> = {
  ...PLATES,
  openmic: { ...PLATES.openmic, wide: ['poetry-slam-open-mic-audience-aculibrary', ...PLATES.openmic.wide] },
};

const SINGING_PLATES: Record<VenueId, Plates> = {
  ...PLATES,
  openmic: {
    ...PLATES.openmic,
    wide: ['openmic-singer-facing-tables-winminaung', 'openmic-pub-tables-from-stage-bertelli'],
  },
  theatre: {
    ...PLATES.theatre,
    wide: ['theatre-opera-house-balconies-dumitru', 'theatre-balconies-santa-isabel-ribeiro'],
  },
  arena: {
    wide: ['singing-phones-faces-warm-quintero', 'singing-phone-lights-crowd-blue-quintero'],
    reaction: ['singing-phones-up-blue-qudratovna'],
    finale: ['singing-phone-lights-dark-osezua'],
  },
};

const TIER: Record<VenueId, string> = { openmic: 'Open Mic', club: 'Club', theatre: 'Theatre', arena: 'Arena' };

interface House {
  house: string;
  blurb: string;
  /** Tier name override (stand-up calls its club a "Comedy Club"). */
  name?: string;
}

function venues(houses: Record<VenueId, House>, plates: Record<VenueId, Plates>): Venue[] {
  const ids: VenueId[] = ['openmic', 'club', 'theatre', 'arena'];
  return ids.map((id) => ({
    id,
    name: houses[id].name ?? TIER[id],
    house: houses[id].house,
    blurb: houses[id].blurb,
    ...RULES[id],
    plates: { wide: [...plates[id].wide], reaction: [...plates[id].reaction], finale: [...plates[id].finale] },
  }));
}

const STANDUP: ActPack = {
  id: 'standup',
  name: 'Stand-up',
  reaction: { kind: 'laugh', noun: 'laugh', plural: 'laughs', verb: 'laughed' },
  unit: 'set',
  defaultDurationSec: 300,
  listensFor:
    'A beat after a line, a short line after a longer one, emphasis at the end, no fillers; with words on, also callbacks, wordplay and a list of three. It still needs the beat.',
  venues: venues(
    {
      openmic: {
        house: 'The Back Room',
        blurb:
          'Thirty people in a pub back room who came for the cheap pints and laugh at anything with a beat. Nobody heckles.',
      },
      club: {
        house: 'The Basement',
        name: 'Comedy Club',
        blurb:
          'A dark room of eighty who paid to be here. Generous to a good setup, silent to a weak tag. Hecklers after two dead bits.',
      },
      theatre: {
        house: 'The Playhouse',
        blurb:
          'Eight hundred seats and a quiet so complete you can hear a setup fail. They laugh late and only when it is earned.',
      },
      arena: {
        house: 'The Bowl',
        blurb:
          'Twenty thousand under floodlights who hear your timing before your words. Land it clean or the stadium talks among itself.',
      },
    },
    PLATES,
  ),
};

const POETRY: ActPack = {
  id: 'poetry',
  name: 'Poetry',
  reaction: { kind: 'snap', noun: 'snap', plural: 'snaps', verb: 'snapped' },
  unit: 'piece',
  defaultDurationSec: 180,
  listensFor:
    'Held beats, short lines, a steady pace, no fillers; with words on, also rhymes, alliteration and a turn. It snaps for a beat that holds and stays silent for the rest.',
  venues: venues(
    {
      openmic: {
        house: 'Tuesday Slam',
        blurb: 'A slam night of thirty who snap at a held beat and sit still for everything else. Nobody heckles.',
      },
      club: {
        house: 'The Cellar',
        blurb:
          'Eighty regulars who know the form. Snaps for a short line with a held beat, silence for a rushed one, a heckle after two flat pieces.',
      },
      theatre: {
        house: 'The Studio',
        blurb: 'A black-box room of eight hundred that listens hard and snaps only for a beat that truly holds.',
      },
      arena: {
        house: 'The Dome',
        blurb: 'Twenty thousand under a dome. Only the longest, cleanest beat reaches the back rows.',
      },
    },
    POETRY_PLATES,
  ),
};

const SPEECH: ActPack = {
  id: 'speech',
  name: 'Speech',
  reaction: { kind: 'applause', noun: 'applause', plural: 'applause', verb: 'applauded' },
  unit: 'talk',
  defaultDurationSec: 240,
  listensFor:
    'Emphasis and a beat at the end of a point, 120 to 160 words a minute, no fillers; with words on, also triads, contrasts and calls to action. It applauds the delivery.',
  venues: venues(
    {
      openmic: {
        house: "The Meeting Hall",
        blurb: 'Thirty people with coffee who applaud a clear point and forgive an um. Nobody heckles.',
      },
      club: {
        house: 'The Lecture Room',
        blurb:
          'Eighty who came to learn. Applause for emphasis and a beat at the end of a point, silence for a rush, a heckle after two flat points.',
      },
      theatre: {
        house: 'The Auditorium',
        blurb: 'Eight hundred in raked seats who applaud a point delivered at pace, inside 120 to 160 words a minute.',
      },
      arena: {
        house: 'The Keynote',
        blurb:
          'A keynote crowd of twenty thousand. One point, hit hard, with a beat after it, or the room checks its phones.',
      },
    },
    PLATES,
  ),
};

const SINGING: ActPack = {
  id: 'singing',
  name: 'Singing',
  reaction: { kind: 'cheer', noun: 'cheer', plural: 'cheers', verb: 'cheered' },
  unit: 'song',
  defaultDurationSec: 210,
  listensFor:
    'Notes held in tune, a long held note, an ending on a held note and range; an off-pitch wobble gets silence. The room cheers the hold, not the song.',
  venues: venues(
    {
      openmic: {
        house: 'The Pub Mic',
        blurb: 'Thirty people at tables who cheer any phrase held in tune. Nobody heckles.',
      },
      club: {
        house: 'The Bar Stage',
        blurb:
          'Eighty at a bar stage. Cheers for a note held true, nothing for a wobble, a heckle after two flat phrases.',
      },
      theatre: {
        house: 'The Concert Hall',
        blurb: 'A hall of eight hundred that hears every cent. Hold the note and the lights go up.',
      },
      arena: {
        house: 'The Stadium',
        blurb: 'A stadium of twenty thousand phone lights. Only a long, true hold raises them.',
      },
    },
    SINGING_PLATES,
  ),
};

export const ACTS: ActPack[] = [STANDUP, POETRY, SPEECH, SINGING];

export function getPack(act: ActId): ActPack {
  const pack = ACTS.find((p) => p.id === act);
  if (!pack) throw new Error(`unknown act: ${act}`);
  return pack;
}

export function getVenue(act: ActId, venue: VenueId): Venue {
  const v = getPack(act).venues.find((x) => x.id === venue);
  if (!v) throw new Error(`unknown venue: ${venue}`);
  return v;
}

/** The act packs as the JSON document published to S3 (the TV ships the same data at build time). */
export function packsAsJson(): string {
  return JSON.stringify({ version: 1, houseStandard: HOUSE_STANDARD, personas: PERSONAS, acts: ACTS }, null, 2);
}
