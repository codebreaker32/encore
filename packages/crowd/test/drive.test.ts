import { describe, expect, it } from 'vitest';
import {
  createSetState,
  crowdDrive,
  reactionLevel,
  REACTION_RISE_SEC,
  REACTION_TAIL_SEC,
  WARMTH_SEC,
  type Reaction,
  type SetConfig,
  type SetState,
} from '../src';

const CONFIG: SetConfig = {
  setId: 's1',
  act: 'standup',
  venue: 'club',
  persona: 'warm',
  durationSec: 60,
  performer: 'Aman',
  words: 'off',
};
const LINE = { id: 1, t0: 1, t1: 4, level: 0.5, endLevel: 0.6, peakLevel: 0.7, pauseBefore: 1 };

function live(patch: Partial<SetState> = {}): SetState {
  const base = createSetState(CONFIG);
  // The performer has been heard (the line from 1 s to 4 s): silence is measured from there, as the ledger does.
  return { ...base, phase: 'live', startedAt: 0, lines: [LINE], book: { ...base.book, firstVoiceAt: 1 }, ...patch };
}

function laugh(at: number, strength = 0.8): Reaction {
  return { kind: 'laugh', at, strength, lineId: 1, why: 'measured beat' };
}

describe('crowdDrive', () => {
  it('reads only the state: the same state and clock give the same drive', () => {
    const s = live({ now: 10, lastVoiceAt: 9, reactions: [laugh(8)] });
    expect(crowdDrive(s, 10.5)).toEqual(crowdDrive(s, 10.5));
  });

  it('a performer who is speaking holds the room, and nobody is restless yet', () => {
    const d = crowdDrive(live({ now: 5, speaking: true, lastVoiceAt: 5 }));
    expect(d.silenceSec).toBe(0);
    expect(d.restless).toBe(0);
    expect(d.attention).toBeGreaterThanOrEqual(0.6);
  });

  it('silence past the venue patience makes the room restless and less attentive', () => {
    const base = live({ now: 4, lastVoiceAt: 4 });
    const patience = base.venue.patienceSec;
    const before = crowdDrive(base, 4 + patience * 0.9);
    const after = crowdDrive(base, 4 + patience * 1.5);
    expect(before.restless).toBe(0);
    expect(after.restless).toBeCloseTo(0.5, 5);
    expect(after.attention).toBeLessThan(before.attention);
    expect(crowdDrive(base, 4 + patience * 3).restless).toBe(1);
  });

  it('nobody is restless before the first line, however long the wait', () => {
    expect(crowdDrive(live({ lines: [], now: 30, lastVoiceAt: 0 })).restless).toBe(0);
  });

  it('a reaction rises, holds for the venue, trails off by kind, then leaves the drive', () => {
    const s = live({ reactions: [laugh(10, 0.8)] });
    const hold = s.venue.reactionHoldMs / 1000;
    expect(crowdDrive(s, 10 + REACTION_RISE_SEC / 2).reactions[0].level).toBeCloseTo(0.4, 5);
    expect(crowdDrive(s, 10 + hold / 2).reactions[0].level).toBeCloseTo(0.8, 5);
    expect(crowdDrive(s, 10 + hold + REACTION_TAIL_SEC.laugh / 2).reactions[0].level).toBeCloseTo(0.4, 5);
    expect(crowdDrive(s, 10 + hold + REACTION_TAIL_SEC.laugh + 0.01).reactions).toEqual([]);
    expect(crowdDrive(s, 9.9).reactions).toEqual([]);
  });

  it('landed reactions warm the room and fade over WARMTH_SEC; a murmur does not', () => {
    const s = live({ reactions: [laugh(10, 0.6), { kind: 'murmur', at: 11, strength: 0.9, why: 'dead air' }] });
    expect(crowdDrive(s, 10).warmth).toBeCloseTo(0.6, 5);
    expect(crowdDrive(s, 10 + WARMTH_SEC / 2).warmth).toBeCloseTo(0.3, 5);
    expect(crowdDrive(s, 10 + WARMTH_SEC).warmth).toBe(0);
  });

  it('surfaces the newest heckle while it is still moving the room', () => {
    const s = live({
      reactions: [laugh(2), { kind: 'heckle', at: 20, strength: 0.7, why: 'two dead bits', text: 'x' }],
    });
    expect(crowdDrive(s, 21)?.heckle?.kind).toBe('heckle');
    expect(crowdDrive(s, 40).heckle).toBeNull();
  });

  it('dead bits cost attention', () => {
    const fresh = crowdDrive(live({ now: 5, lastVoiceAt: 5 }));
    const tired = crowdDrive(live({ now: 5, lastVoiceAt: 5, deadBits: 2 }));
    expect(tired.attention).toBeCloseTo(fresh.attention - 0.16, 5);
  });

  it('the finale is sized by how much of the set the room reacted to', () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({ ...LINE, id: i + 1 }));
    const quiet = crowdDrive(live({ phase: 'done', lines, reactions: [laugh(3)] }));
    const warm = crowdDrive(live({ phase: 'done', lines, reactions: [1, 2, 3, 4].map((t) => laugh(t * 5)) }));
    expect(quiet.finale?.strength).toBeLessThan(warm.finale?.strength ?? 0);
    expect(warm.finale?.strength).toBeCloseTo(1, 5);
    expect(crowdDrive(live()).finale).toBeNull();
  });

  it('reactionLevel is zero before a reaction and never above its strength', () => {
    for (const age of [-1, 0, 0.1, 1, 2, 3, 5]) {
      const v = reactionLevel('applause', 0.7, age, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.7);
    }
    expect(reactionLevel('silence', 1, 3, 2)).toBe(0);
  });
});
