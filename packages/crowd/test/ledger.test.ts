import { describe, expect, it } from 'vitest';
import {
  contentRow,
  createSetState,
  ledgerRows,
  measuredNext,
  numberSet,
  reduceSet,
  seedSetNumbers,
  scorecard,
  setRecord,
  summaryLine,
  type LedgerRow,
  type PitchSample,
  type Scorecard,
  type SetAction,
  type SetConfig,
  type SetRecord,
  type SetState,
} from '../src';

/**
 * The cut sheet's ledger never shows a zero for something it did not measure (honesty rule 3). The QA pass on the
 * Android TV emulator (2026-10-12, issue 5) found a singing set with no pitch reading "0.0 s longest hold", "0.0
 * phrases held per minute" and "0 patterns in your words" with words off.
 */

function apply(state: SetState, ...actions: SetAction[]): SetState {
  for (const a of actions) state = reduceSet(state, a);
  return state;
}

function config(act: SetConfig['act'], words: SetConfig['words'] = 'off'): SetConfig {
  return { setId: `set-${act}`, act, venue: 'arena', persona: 'warm', durationSec: 210, performer: 'Aman', words };
}

function samples(from: number, n: number, midi: number | null, clarity = 0.9, level = 0.1): PitchSample[] {
  const out: PitchSample[] = [];
  for (let i = 0; i < n; i++) out.push({ t: Math.round((from + i * 0.1) * 10) / 10, midi, clarity, level });
  return out;
}

/** A singing set like the QA's: the phone sent voice and lines but never a pitch batch. */
function singingWithoutPitch(): SetState {
  let s = apply(createSetState(config('singing')), { type: 'start', startedAt: 0 }, { type: 'tick', now: 1 });
  for (let t = 2; t < 40; t += 6) {
    s = apply(
      s,
      { type: 'voice', at: t, speaking: true, level: 0.2 },
      {
        type: 'line',
        line: { id: t, t0: t, t1: t + 3, level: 0.2, endLevel: 0.2, peakLevel: 0.22, pauseBefore: 3 },
      },
      { type: 'voice', at: t + 3, speaking: false, level: 0 },
      { type: 'tick', now: t + 5 },
    );
  }
  return apply(s, { type: 'finish', now: 45 });
}

function record(sc: Partial<Scorecard> & Pick<Scorecard, 'act'>): SetRecord {
  const card: Scorecard = {
    venue: 'club',
    durationSec: 120,
    landed: 4,
    candidates: 8,
    landedPerMin: 2,
    roomReactions: 3,
    longestDeadAirSec: 2,
    longestDeadAirAt: 30,
    wpm: 150,
    peakWpm: 170,
    fillers: { count: 2, top: [{ word: 'um', n: 2 }] },
    inTunePct: null,
    longestHoldSec: null,
    unsure: 0,
    content: null,
    ...sc,
  };
  return {
    setId: 'r1',
    endedAt: '2026-10-12T19:00:00Z',
    act: card.act,
    venue: card.venue,
    persona: 'warm',
    performer: 'Aman',
    scorecard: card,
    summary: '',
  };
}

function row(rows: LedgerRow[], k: string): LedgerRow {
  const r = rows.find((x) => x.k === k);
  if (!r) throw new Error(`no row ${k}: ${rows.map((x) => x.k).join(', ')}`);
  return r;
}

describe('singing with no pitch heard', () => {
  it('leaves the hold, the in-tune share and the pitch patterns null, never 0', () => {
    const sc = scorecard(singingWithoutPitch());
    expect(sc.inTunePct).toBeNull();
    expect(sc.longestHoldSec).toBeNull();
    expect(sc.content).toBeNull();
    expect(summaryLine(sc, 'singing')).toBe('no pitch measured in 0:45');
  });

  it('prints "not measured" on every pitch row of the cut sheet', () => {
    const rec = setRecord(singingWithoutPitch(), '2026-10-12T19:20:00Z');
    const rows = ledgerRows(rec);
    for (const r of rows) {
      expect(r.measured).toBe(false);
      expect(r.n).toBe('not measured');
      expect(r.n).not.toMatch(/^0/);
    }
    expect(row(rows, 'longest hold').v).toBe('no pitch was heard');
    expect(row(rows, 'phrases held per minute').v).toBe('no pitch was heard · this room gave 0 cheers');
    expect(row(rows, 'held notes and range').v).toBe('no pitch was heard · words were off on the phone');
    expect(row(rows, 'phrases that held').v).toBe('no pitch was heard');
    // Nothing was measured, so the house rule does not send the singer down from the Arena for a zero.
    expect(measuredNext(rec)).toBe('again');
  });

  it('still measures a hold of 0 when the pitch was heard but no note held', () => {
    let s = apply(createSetState(config('singing')), { type: 'start', startedAt: 0 });
    // Voiced and clear but between notes (40 cents off): heard, never in tune.
    s = apply(s, { type: 'pitch', samples: samples(2.0, 20, 60.4) }, { type: 'finish', now: 5 });
    const sc = scorecard(s);
    expect(sc.inTunePct).toBe(0);
    expect(sc.longestHoldSec).toBe(0);
    expect(sc.content).not.toBeNull();
    expect(row(ledgerRows(setRecord(s, '2026-10-12T19:20:00Z')), 'longest hold')).toMatchObject({
      n: '0.0 s',
      measured: true,
    });
  });

  it('keeps the measured rows when the pitch was heard', () => {
    let s = apply(createSetState(config('singing')), { type: 'start', startedAt: 0 }, { type: 'tick', now: 1.2 });
    s = apply(
      s,
      { type: 'pitch', samples: samples(2.0, 20, 60.05) },
      { type: 'pitch', samples: samples(4.0, 5, null, 0, 0.01) },
      { type: 'finish', now: 6 },
    );
    const rows = ledgerRows(setRecord(s, '2026-10-12T19:20:00Z'));
    expect(row(rows, 'longest hold')).toMatchObject({ n: '1.9 s', measured: true });
    expect(row(rows, 'in tune')).toMatchObject({ n: '100%', measured: true });
    expect(row(rows, 'phrases that held')).toMatchObject({ n: '1 / 1', measured: true });
  });
});

describe('the content row', () => {
  it('says words were off instead of "0 patterns in your words"', () => {
    const off = record({ act: 'standup', wpm: null, peakWpm: null, fillers: null, content: null });
    expect(contentRow(off)).toEqual({
      n: 'not measured',
      k: 'what you said',
      v: 'words were off on the phone',
      measured: false,
    });
    // A stale record that carries an empty count with words off still never reads 0.
    const stale = record({
      act: 'standup',
      wpm: null,
      peakWpm: null,
      fillers: null,
      content: { lines: 0, features: { callback: 0, tag: 0 }, rhymedEnds: null, rangeSemitones: null, judge: null },
    });
    expect(contentRow(stale)).toMatchObject({ n: 'not measured', v: 'words were off on the phone', measured: false });
  });

  it('says no words reached the TV when words were on but none arrived', () => {
    const none = record({
      act: 'standup',
      content: { lines: 0, features: { callback: 0, tag: 0 }, rhymedEnds: null, rangeSemitones: null, judge: null },
    });
    expect(contentRow(none)).toMatchObject({ n: 'not measured', v: 'no words reached the TV', measured: false });
  });

  it('keeps a measured zero when lines were heard and nothing was found', () => {
    const zero = record({
      act: 'standup',
      content: { lines: 6, features: { callback: 0, tag: 0 }, rhymedEnds: null, rangeSemitones: null, judge: null },
    });
    expect(contentRow(zero)).toEqual({
      n: '0',
      k: 'patterns in your words',
      v: '6 lines heard, none found',
      measured: true,
    });
  });

  it('counts the patterns found, most first', () => {
    const found = record({
      act: 'standup',
      venue: 'arena',
      content: {
        lines: 10,
        features: { callback: 1, wordplay: 0, tag: 2, specific: 6 },
        rhymedEnds: null,
        rangeSemitones: null,
        judge: { inTime: 4, missed: 0, early: 0, meanScore: 0.6 },
      },
    });
    expect(contentRow(found)).toEqual({
      n: '6',
      k: 'specific details',
      v: "2 tags · 1 callback · the MC's model read 4 in time (an estimate)",
      measured: true,
    });
  });
});

describe('the spoken acts', () => {
  it('print "not measured" for pace and fillers with words off, and the dead air against the room', () => {
    const rows = ledgerRows(
      record({ act: 'standup', wpm: null, peakWpm: null, fillers: null, longestDeadAirSec: 4.1 }),
    );
    expect(row(rows, 'words per minute')).toMatchObject({ n: 'not measured', v: 'words were off on the phone' });
    expect(row(rows, 'fillers')).toMatchObject({ n: 'not measured', v: 'words were off on the phone' });
    expect(row(rows, 'longest dead air')).toMatchObject({
      n: '4.1 s',
      v: "at 0:30 · past this room's patience of 3.5 s",
    });
    expect(row(rows, 'landed per minute').n).toBe('2.0');
  });

  it('follows the house rule for the next room', () => {
    expect(measuredNext(record({ act: 'standup', landedPerMin: 3.2, longestDeadAirSec: 2 }))).toBe('up');
    expect(measuredNext(record({ act: 'standup', venue: 'arena', landedPerMin: 5, longestDeadAirSec: 2 }))).toBe(
      'again',
    );
    expect(measuredNext(record({ act: 'standup', landedPerMin: 0.5 }))).toBe('down');
    expect(measuredNext(record({ act: 'standup', venue: 'openmic', landedPerMin: 0.5 }))).toBe('again');
  });
});

describe('the set number', () => {
  it('keeps counting past the six records the TV keeps', () => {
    let book = seedSetNumbers(null, []);
    const kept: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const id = `s${i}`;
      kept.push(id);
      if (kept.length > 6) kept.shift();
      book = numberSet(book, id, kept);
      expect(book.byId[id]).toBe(i);
    }
    expect(book.count).toBe(8);
    expect(Object.keys(book.byId)).toEqual(['s3', 's4', 's5', 's6', 's7', 's8']);
    // The same set asked again keeps its number.
    expect(numberSet(book, 's8', kept)).toEqual(book);
  });

  it('numbers records from before the counter and never goes back', () => {
    const recs = ['a', 'b', 'c'].map((setId) => ({ ...record({ act: 'standup' }), setId }));
    expect(seedSetNumbers(null, recs)).toEqual({ count: 3, byId: { a: 1, b: 2, c: 3 } });
    expect(seedSetNumbers('garbage', recs).count).toBe(3);
    // The counter had reached 9 and only the last record was numbered: the older ones sit below it.
    const seeded = seedSetNumbers({ count: 9, byId: { c: 9 } }, recs);
    expect(seeded).toEqual({ count: 9, byId: { a: 7, b: 8, c: 9 } });
    expect(numberSet(seeded, 'd', ['b', 'c', 'd']).byId.d).toBe(10);
  });
});
