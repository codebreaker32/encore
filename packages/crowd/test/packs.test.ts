import { describe, expect, it } from 'vitest';
import {
  ACTS,
  ACT_IDS,
  getPack,
  getVenue,
  HOUSE_STANDARD,
  packsAsJson,
  PERSONA_IDS,
  PERSONAS,
  VENUE_IDS,
} from '../src';

describe('act packs', () => {
  it('has the four acts with the four venues each, in the spec order', () => {
    expect(ACTS.map((a) => a.id)).toEqual(['standup', 'poetry', 'speech', 'singing']);
    for (const act of ACT_IDS) {
      expect(getPack(act).venues.map((v) => v.id)).toEqual(['openmic', 'club', 'theatre', 'arena']);
    }
  });

  it('uses the venues table numbers at every act', () => {
    for (const act of ACT_IDS) {
      const [openmic, club, theatre, arena] = getPack(act).venues;
      expect([
        openmic.seats,
        openmic.threshold,
        openmic.patienceSec,
        openmic.hecklesAfterDeadBits,
        openmic.reactionHoldMs,
      ]).toEqual([30, 0.42, 5, 0, 1800]);
      expect([club.seats, club.threshold, club.patienceSec, club.hecklesAfterDeadBits, club.reactionHoldMs]).toEqual([
        80, 0.55, 3.5, 2, 2000,
      ]);
      expect([
        theatre.seats,
        theatre.threshold,
        theatre.patienceSec,
        theatre.hecklesAfterDeadBits,
        theatre.reactionHoldMs,
      ]).toEqual([800, 0.66, 2.5, 2, 2300]);
      expect([
        arena.seats,
        arena.threshold,
        arena.patienceSec,
        arena.hecklesAfterDeadBits,
        arena.reactionHoldMs,
      ]).toEqual([20000, 0.75, 2, 1, 2600]);
    }
    expect(HOUSE_STANDARD).toBe(0.55);
  });

  it('names the houses and tiers per act', () => {
    expect(getPack('standup').venues.map((v) => v.house)).toEqual([
      'The Back Room',
      'The Basement',
      'The Playhouse',
      'The Bowl',
    ]);
    expect(getPack('poetry').venues.map((v) => v.house)).toEqual([
      'Tuesday Slam',
      'The Cellar',
      'The Studio',
      'The Dome',
    ]);
    expect(getPack('speech').venues.map((v) => v.house)).toEqual([
      "The Meeting Hall",
      'The Lecture Room',
      'The Auditorium',
      'The Keynote',
    ]);
    expect(getPack('singing').venues.map((v) => v.house)).toEqual([
      'The Pub Mic',
      'The Bar Stage',
      'The Concert Hall',
      'The Stadium',
    ]);
    expect(getVenue('standup', 'club').name).toBe('Comedy Club');
    expect(getVenue('poetry', 'club').name).toBe('Club');
    expect(getVenue('singing', 'openmic').name).toBe('Open Mic');
    expect(getVenue('speech', 'theatre').name).toBe('Theatre');
    expect(getVenue('standup', 'arena').name).toBe('Arena');
  });

  it('gives each act its reaction, unit, slot length and what it listens for', () => {
    expect(getPack('standup').reaction).toEqual({ kind: 'laugh', noun: 'laugh', plural: 'laughs', verb: 'laughed' });
    expect(getPack('poetry').reaction).toEqual({ kind: 'snap', noun: 'snap', plural: 'snaps', verb: 'snapped' });
    expect(getPack('speech').reaction).toEqual({
      kind: 'applause',
      noun: 'applause',
      plural: 'applause',
      verb: 'applauded',
    });
    expect(getPack('singing').reaction).toEqual({ kind: 'cheer', noun: 'cheer', plural: 'cheers', verb: 'cheered' });
    expect(ACTS.map((a) => a.defaultDurationSec)).toEqual([300, 180, 240, 210]);
    expect(ACTS.map((a) => a.unit)).toEqual(['set', 'piece', 'talk', 'song']);
    for (const a of ACTS) {
      expect(a.listensFor.length).toBeGreaterThan(20);
      for (const v of a.venues) expect(v.blurb.length).toBeGreaterThan(20);
    }
  });

  it('assigns wide, reaction and finale plates to every venue', () => {
    for (const a of ACTS) {
      for (const v of a.venues) {
        expect(v.plates.wide.length).toBeGreaterThanOrEqual(2);
        expect(v.plates.reaction.length).toBeGreaterThanOrEqual(1);
        expect(v.plates.finale.length).toBe(1);
        for (const id of [...v.plates.wide, ...v.plates.reaction, ...v.plates.finale])
          expect(id).toMatch(/^[a-z0-9-]+$/);
        expect(new Set(v.plates.wide).size).toBe(v.plates.wide.length);
      }
    }
    expect(getVenue('poetry', 'openmic').plates.wide).toContain('poetry-slam-open-mic-audience-aculibrary');
    expect(getVenue('singing', 'arena').plates.finale).toEqual(['singing-phone-lights-dark-osezua']);
    expect(getVenue('singing', 'theatre').plates.wide).toEqual([
      'theatre-opera-house-balconies-dumitru',
      'theatre-balconies-santa-isabel-ribeiro',
    ]);
  });

  it('describes all four personas and exports the packs as JSON', () => {
    for (const p of PERSONA_IDS) {
      expect(PERSONAS[p].name.length).toBeGreaterThan(0);
      expect(PERSONAS[p].blurb.length).toBeGreaterThan(10);
    }
    const json = JSON.parse(packsAsJson());
    expect(json.houseStandard).toBe(HOUSE_STANDARD);
    expect(json.acts.map((a: { id: string }) => a.id)).toEqual(
      ACT_IDS.slice().sort((x, y) => ACTS.findIndex((a) => a.id === x) - ACTS.findIndex((a) => a.id === y)),
    );
    expect(VENUE_IDS).toEqual(['openmic', 'club', 'theatre', 'arena']);
  });

  it('rejects unknown ids', () => {
    expect(() => getPack('opera' as never)).toThrow();
    expect(() => getVenue('standup', 'stadium' as never)).toThrow();
  });
});
