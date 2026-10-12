import { describe, expect, it } from 'vitest';
import {
  diagnose,
  HEADLINE_MAX,
  LINE_MAX,
  memoryFor,
  nextVenue,
  samePerformer,
  type Scorecard,
  type SetRecord,
} from '../src';

function card(over: Partial<Scorecard> = {}): Scorecard {
  return {
    act: 'standup',
    venue: 'club',
    durationSec: 180,
    landed: 6,
    candidates: 9,
    landedPerMin: 2,
    roomReactions: 5,
    longestDeadAirSec: 3.2,
    longestDeadAirAt: 95,
    wpm: 150,
    peakWpm: 170,
    fillers: {
      count: 4,
      top: [
        { word: 'um', n: 3 },
        { word: 'like', n: 1 },
      ],
    },
    inTunePct: null,
    longestHoldSec: null,
    unsure: 1,
    ...over,
  };
}

describe('measured analysis for the MC', () => {
  it('keeps the screen limits the model’s words are held to', () => {
    expect(HEADLINE_MAX).toBe(60);
    expect(LINE_MAX).toBe(180);
  });

  it('diagnoses in the MC service’s order: gap, pace, fillers, beat, hold, praise', () => {
    expect(diagnose(card({ longestDeadAirSec: 5.5, longestDeadAirAt: 22, peakWpm: 200 }), 'standup')).toBe('gap');
    expect(diagnose(card({ longestDeadAirSec: 5.5, longestDeadAirAt: null }), 'standup')).toBe('praise');
    expect(diagnose(card({ peakWpm: 185, fillers: { count: 9, top: [] } }), 'standup')).toBe('pace');
    expect(diagnose(card({ fillers: { count: 5, top: [] }, landed: 1 }), 'standup')).toBe('fillers');
    expect(diagnose(card({ landed: 3 }), 'standup')).toBe('beat');
    expect(diagnose(card({ landed: 4 }), 'standup')).toBe('praise');
    expect(diagnose(card({ candidates: 0, landed: 0 }), 'standup')).toBe('beat');
    const sung = { wpm: null, peakWpm: null, fillers: null };
    expect(diagnose(card({ ...sung, inTunePct: 55 }), 'singing')).toBe('hold');
    expect(diagnose(card({ ...sung, inTunePct: null }), 'singing')).toBe('hold');
    expect(diagnose(card({ ...sung, inTunePct: 61, landed: 0 }), 'singing')).toBe('praise');
  });

  it('decides the next venue from landed per minute and the longest silence', () => {
    expect(nextVenue(card({ landedPerMin: 3, longestDeadAirSec: 3.9 }), 'club')).toBe('up');
    expect(nextVenue(card({ landedPerMin: 3.5, longestDeadAirSec: 4 }), 'club')).toBe('again');
    expect(nextVenue(card({ landedPerMin: 0.9 }), 'club')).toBe('down');
    expect(nextVenue(card({ landedPerMin: 0.9 }), 'openmic')).toBe('again');
    expect(nextVenue(card({ landedPerMin: 2 }), 'arena')).toBe('again');
    expect(nextVenue(card({ landedPerMin: 3.5, longestDeadAirSec: 2 }), 'arena')).toBe('again'); // nowhere up
  });
});

describe("the MC's memory", () => {
  const rec = (setId: string, performer: string): SetRecord => ({
    setId,
    endedAt: '2026-10-12T12:00:00Z',
    act: 'standup',
    venue: 'club',
    persona: 'sarcastic',
    performer,
    scorecard: card(),
    summary: '',
  });

  it("is the performer's own sets only, newest last, at most six", () => {
    const records = [rec('a1', 'Aman'), rec('r1', 'Riya'), rec('a2', ' aman '), rec('k1', 'Kabir')];
    expect(memoryFor(records, 'Aman').map((r) => r.setId)).toEqual(['a1', 'a2']);
    // Riya's first poetry piece after Aman's stand-up: nothing of Aman's reaches her intro.
    expect(memoryFor(records, 'Riya').map((r) => r.setId)).toEqual(['r1']);
    expect(memoryFor(records, 'Meera')).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => rec(`a${i}`, 'Aman'));
    expect(memoryFor(many, 'Aman').map((r) => r.setId)).toEqual(['a3', 'a4', 'a5', 'a6', 'a7', 'a8']);
    expect(samePerformer('Riya', ' riya')).toBe(true);
  });
});
