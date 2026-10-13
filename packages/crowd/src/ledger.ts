import { FEATURE_NAMES } from './engine';
import { mmss } from './format';
import { getPack, getVenue } from './packs';
import type { ContentFeature, Scorecard, SetRecord } from './types';

/**
 * One row of the cut sheet's ledger ("Measured, not judged"): the number, what it counts, and the detail. A row that
 * was not measured says so in `n` and its reason in `v`; it never shows a zero (honesty rule 3).
 */
export interface LedgerRow {
  n: string;
  k: string;
  v: string;
  /** Drawn in gold: a measured number that reads well. */
  good?: boolean;
  /** false → "not measured" in gold-dim; never a zero. */
  measured: boolean;
}

export const NOT_MEASURED = 'not measured';
const WORDS_OFF = 'words were off on the phone';
const NO_PITCH = 'no pitch was heard';

/** Words were off for this set: the scorecard has no pace and no fillers (null, never 0). */
export function wordsWereOff(sc: Scorecard): boolean {
  return sc.wpm === null && sc.fillers === null;
}

/**
 * Singing with no usable pitch from the phone: nothing the pitch measures (in tune, holds, phrases, range) was measured.
 * The engine leaves `inTunePct` and `longestHoldSec` null then.
 */
export function pitchUnheard(sc: Scorecard): boolean {
  return sc.act === 'singing' && sc.inTunePct === null;
}

function notMeasured(k: string, v: string): LedgerRow {
  return { n: NOT_MEASURED, k, v, measured: false };
}

function featureCount(f: ContentFeature, n: number): string {
  return `${n} ${FEATURE_NAMES[f][n === 1 ? 0 : 1]}`;
}

/** The cut sheet's ledger for one set, from its record alone (the same numbers at every venue). */
export function ledgerRows(record: SetRecord): LedgerRow[] {
  const sc = record.scorecard;
  const pack = getPack(record.act);
  const venue = getVenue(record.act, record.venue);
  const plural = pack.reaction.plural;
  const rows: LedgerRow[] = [];
  if (record.act === 'singing') {
    const unheard = pitchUnheard(sc);
    rows.push(
      sc.inTunePct === null
        ? notMeasured('in tune', NO_PITCH)
        : {
            n: `${sc.inTunePct}%`,
            k: 'in tune',
            v: 'voiced time within 25 cents of a note',
            good: sc.inTunePct >= 70,
            measured: true,
          },
    );
    rows.push(
      sc.longestHoldSec === null
        ? notMeasured('longest hold', NO_PITCH)
        : {
            n: `${sc.longestHoldSec.toFixed(1)} s`,
            k: 'longest hold',
            v: 'one note, held within 25 cents',
            measured: true,
          },
    );
    // Phrases are judged from the pitch alone: with none heard, their counts are not a result.
    rows.push(
      unheard
        ? notMeasured('phrases held per minute', `${NO_PITCH} · this room gave ${sc.roomReactions} ${plural}`)
        : {
            n: sc.landedPerMin.toFixed(1),
            k: 'phrases held per minute',
            v: `${sc.landed} phrases cleared the house standard · this room gave ${sc.roomReactions} ${plural}`,
            good: true,
            measured: true,
          },
    );
    rows.push(contentRow(record));
    rows.push(
      unheard
        ? notMeasured('phrases that held', NO_PITCH)
        : {
            n: `${sc.landed} / ${sc.candidates}`,
            k: 'phrases that held',
            v: `detection is an estimate; ${sc.unsure} unsure ${sc.unsure === 1 ? 'phrase was' : 'phrases were'} not counted`,
            good: sc.candidates > 0 && sc.landed / sc.candidates >= 0.5,
            measured: true,
          },
    );
    return rows;
  }
  rows.push({
    n: sc.landedPerMin.toFixed(1),
    k: 'landed per minute',
    v: `${sc.landed} lines cleared the house standard · this room gave ${sc.roomReactions} ${sc.roomReactions === 1 ? pack.reaction.noun : plural}`,
    good: true,
    measured: true,
  });
  rows.push({
    n: `${sc.longestDeadAirSec.toFixed(1)} s`,
    k: 'longest dead air',
    v:
      sc.longestDeadAirAt === null
        ? 'no silence longer than a beat'
        : `at ${mmss(sc.longestDeadAirAt)}${sc.longestDeadAirSec >= venue.patienceSec ? ` · past this room's patience of ${venue.patienceSec.toFixed(1)} s` : ''}`,
    measured: true,
  });
  rows.push(
    sc.wpm === null
      ? notMeasured('words per minute', WORDS_OFF)
      : {
          n: `${sc.wpm}`,
          k: 'words per minute',
          v: sc.peakWpm !== null && sc.peakWpm > sc.wpm ? `peak ${sc.peakWpm} over 20 s` : 'steady across the set',
          measured: true,
        },
  );
  rows.push(
    sc.fillers === null
      ? notMeasured('fillers', WORDS_OFF)
      : {
          n: `${sc.fillers.count}`,
          k: 'fillers',
          v: sc.fillers.top.length ? sc.fillers.top.map((f) => `"${f.word}" ×${f.n}`).join(', ') : 'none heard',
          measured: true,
        },
  );
  rows.push(contentRow(record));
  rows.push({
    n: `${sc.landed} / ${sc.candidates}`,
    k: `${record.act === 'standup' ? 'punchlines' : 'lines'} that landed`,
    v: `detection is an estimate; ${sc.unsure} unsure ${sc.unsure === 1 ? 'line was' : 'lines were'} not counted`,
    good: sc.candidates > 0 && sc.landed / sc.candidates >= 0.5,
    measured: true,
  });
  return rows;
}

/**
 * What the words showed (counted patterns, measured) and, when it was asked, how many lines the MC's model read in
 * time (its scores are estimates). "not measured" when words were off, when no words reached the TV, and, for singing,
 * when no pitch was heard (singing's patterns come from the pitch).
 */
export function contentRow(record: SetRecord): LedgerRow {
  const sc = record.scorecard;
  const c = sc.content;
  const off = wordsWereOff(sc);
  if (record.act === 'singing' && (c === null || c === undefined || pitchUnheard(sc))) {
    return notMeasured('held notes and range', off ? `${NO_PITCH} · ${WORDS_OFF}` : NO_PITCH);
  }
  if (c === undefined) return notMeasured('what you said', 'not counted on this record');
  if (c === null) return notMeasured('what you said', WORDS_OFF);
  const found = (Object.keys(c.features) as ContentFeature[])
    .map((f) => ({ f, n: c.features[f] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const model = c.judge
    ? `the MC's model read ${c.judge.inTime} in time${c.judge.missed ? `, ${c.judge.missed} not in time` : ''} (an estimate)`
    : '';
  const detail = (rest: { f: ContentFeature; n: number }[]) =>
    [...rest.slice(0, 2).map((x) => featureCount(x.f, x.n)), model].filter(Boolean).join(' · ');
  if (c.rhymedEnds && c.rhymedEnds.of > 0) {
    return {
      n: `${c.rhymedEnds.rhymed} / ${c.rhymedEnds.of}`,
      k: 'line ends that rhyme',
      v: detail(found.filter((x) => x.f !== 'endRhyme')) || `${c.lines} lines heard`,
      measured: true,
    };
  }
  if (c.rangeSemitones !== null) {
    return {
      n: `${c.rangeSemitones}`,
      k: 'semitones of range',
      v: detail(found) || 'no note held 1.5 s',
      measured: true,
    };
  }
  if (found.length === 0) {
    // Words off, or on but nothing reached the TV: no line was checked, so "0 patterns" would be a zero for nothing.
    if (c.lines === 0 || (off && record.act !== 'singing'))
      return notMeasured('what you said', off ? WORDS_OFF : 'no words reached the TV');
    return {
      n: '0',
      k: record.act === 'singing' ? 'patterns in the pitch' : 'patterns in your words',
      v: [`${c.lines} ${c.lines === 1 ? 'line' : 'lines'} heard, none found`, model].filter(Boolean).join(' · '),
      measured: true,
    };
  }
  const top = found[0];
  return {
    n: `${top.n}`,
    k: FEATURE_NAMES[top.f][top.n === 1 ? 0 : 1],
    v: detail(found.slice(1)) || `of ${c.lines} ${c.lines === 1 ? 'line' : 'lines'} heard`,
    measured: true,
  };
}

/**
 * The house rule for the next room, as a measurement (not MC prose): up at ≥ 3 landed a minute with no gap of 4 s,
 * down under 1 a minute above the open mic, else again; the arena has no room above it. A singing set with no pitch
 * heard measured nothing to move on, so it stays. The MC service's `next_venue` (facts.py) is the same rule.
 */
export function measuredNext(record: SetRecord): 'again' | 'up' | 'down' {
  const sc = record.scorecard;
  if (pitchUnheard(sc)) return 'again';
  if (sc.landedPerMin >= 3 && sc.longestDeadAirSec < 4 && record.venue !== 'arena') return 'up';
  if (sc.landedPerMin < 1 && record.venue !== 'openmic') return 'down';
  return 'again';
}

/**
 * The set number on the cut sheet ("Set 7"): a counter that only goes up, kept apart from the records (only the last
 * six are kept, so a number taken from their positions stopped at 6; QA 2026-10-12, issue 7). `byId` holds the numbers
 * of the sets still on record.
 */
export interface SetNumbers {
  count: number;
  byId: Record<string, number>;
}

/** The book after `setId` was played, keeping only the numbers of `keep` (the records still held) and the new one. */
export function numberSet(book: SetNumbers, setId: string, keep: string[]): SetNumbers {
  const byId: Record<string, number> = {};
  for (const id of keep) if (book.byId[id] !== undefined) byId[id] = book.byId[id];
  if (book.byId[setId] !== undefined) return { count: book.count, byId: { ...byId, [setId]: book.byId[setId] } };
  const count = book.count + 1;
  byId[setId] = count;
  return { count, byId };
}

/**
 * A stored book (or none, or something unreadable) made consistent with the records on hand: the count is never below
 * the numbers it has given or the records held, and every record has a distinct number.
 */
export function seedSetNumbers(stored: unknown, records: SetRecord[]): SetNumbers {
  const s = stored as { count?: unknown; byId?: unknown } | null;
  let count = s && typeof s.count === 'number' && isFinite(s.count) && s.count > 0 ? Math.floor(s.count) : 0;
  const byId: Record<string, number> = {};
  const given = s && s.byId && typeof s.byId === 'object' ? (s.byId as Record<string, unknown>) : {};
  for (const r of records) {
    const n = given[r.setId];
    if (typeof n === 'number' && isFinite(n) && n > 0) byId[r.setId] = Math.floor(n);
  }
  for (const id of Object.keys(byId)) count = Math.max(count, byId[id]);
  count = Math.max(count, records.length);
  // Any record without its number (records from before the counter, or a lost book): number the records on hand in
  // their order, ending at the count, so the numbers stay distinct and the next set still goes above them.
  if (records.some((r) => byId[r.setId] === undefined)) {
    records.forEach((r, i) => {
      byId[r.setId] = count - records.length + i + 1;
    });
  }
  return { count, byId };
}
