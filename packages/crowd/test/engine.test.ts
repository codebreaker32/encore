import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  createSetState,
  cutSheet,
  getVenue,
  HOUSE_STANDARD,
  cardText,
  INTRO_CARD_SEC,
  MC_TEXT_MAX,
  landingScore,
  reactionAt,
  REACTION_LATENCY_MIN,
  reduceSet,
  scorecard,
  setRecord,
  summaryLine,
  VENUE_IDS,
  type LineEvent,
  type PitchSample,
  type SetAction,
  type SetConfig,
  type SetState,
  type VenueId,
  type WordsMode,
} from '../src';

function apply(state: SetState, ...actions: SetAction[]): SetState {
  for (const a of actions) state = reduceSet(state, a);
  return state;
}

function config(venue: VenueId, words: WordsMode = 'local', act: SetConfig['act'] = 'standup'): SetConfig {
  return { setId: `set-${act}-${venue}`, act, venue, persona: 'warm', durationSec: 60, performer: 'Aman', words };
}

interface LineOpts {
  level?: number;
  endLevel?: number;
  peakLevel?: number;
  words?: number;
  text?: string;
  fillers?: string[];
}

function line(id: number, t0: number, t1: number, prevT1: number, o: LineOpts = {}): LineEvent {
  const level = o.level ?? 0.2;
  const l: LineEvent = {
    id,
    t0,
    t1,
    level,
    endLevel: o.endLevel ?? level,
    peakLevel: o.peakLevel ?? level * 1.1,
    pauseBefore: prevT1 < 0 ? 0 : t0 - prevT1,
  };
  if (o.words !== undefined) l.words = o.words;
  if (o.text !== undefined) l.text = o.text;
  if (o.fillers !== undefined) l.fillers = o.fillers;
  return l;
}

/** One spoken line as the phone would report it: voice on, the line, voice off. */
function spoken(l: LineEvent): SetAction[] {
  return [
    { type: 'voice', at: l.t0, speaking: true, level: l.level },
    { type: 'line', line: l },
    { type: 'voice', at: l.t1, speaking: false, level: 0 },
  ];
}

/**
 * The scripted stand-up set. Every candidate has the beat (0.35) and the shape (0.10); the rest
 * decides the room. Bit 1: a 4 s setup, a 1.5 s punch, louder at the end, clean: 1.0 (lands
 * everywhere). Bits 2 and 3: flat lines with fillers: 0.45 (the open mic laughs, nobody else).
 * Bit 4: a 4 s setup then a flat punch with a filler: 0.65 (lands; club laughs, theatre and arena
 * stay quiet). Bit 5: a flat line with a filler on its own: 0.45 again.
 */
const SETUP = line(1, 2.0, 6.0, -1, {
  peakLevel: 0.25,
  words: 12,
  text: 'so my landlord came round to fix the boiler on a tuesday',
  fillers: [],
});
const PUNCH = line(2, 6.3, 7.8, 6.0, {
  endLevel: 0.26,
  peakLevel: 0.3,
  words: 5,
  text: 'he brought a plumber for me',
  fillers: [],
});
const FLAT3 = line(3, 15.0, 17.0, 7.8, {
  peakLevel: 0.22,
  words: 6,
  text: 'um so anyway the other thing',
  fillers: ['um'],
});
const FLAT4 = line(4, 17.2, 19.0, 17.0, { peakLevel: 0.22, words: 5, text: 'um it was like that', fillers: ['um'] });
const FLAT5 = line(5, 22.0, 23.5, 19.0, { peakLevel: 0.22, words: 3, text: 'like whatever', fillers: ['like'] });
const SETUP6 = line(6, 28.0, 32.0, 23.5, {
  words: 10,
  text: 'my neighbour has a dog that only barks at the postman',
  fillers: [],
});
// The scripted set tests timing, so its punch carries no content pattern (content has its own tests below).
const PUNCH7 = line(7, 32.2, 33.4, 32.0, { words: 4, text: 'uh the postman hates me', fillers: ['uh'] });
const LONE8 = line(8, 36.0, 37.0, 33.4, { words: 3, text: 'anyway yeah', fillers: [] });

function playBitOne(s: SetState): SetState {
  return apply(
    s,
    { type: 'start', startedAt: 1000 },
    { type: 'tick', now: INTRO_CARD_SEC },
    ...spoken(SETUP),
    ...spoken(PUNCH),
    { type: 'tick', now: 8.7 },
  );
}

function playWholeSet(s: SetState): SetState {
  return apply(
    playBitOne(s),
    { type: 'tick', now: 9.8 },
    { type: 'tick', now: 11.0 },
    { type: 'tick', now: 12.0 },
    { type: 'tick', now: 13.9 },
    ...spoken(FLAT3),
    ...spoken(FLAT4),
    { type: 'tick', now: 19.6 },
    { type: 'tick', now: 21.0 },
    ...spoken(FLAT5),
    { type: 'tick', now: 24.1 },
    { type: 'tick', now: 25.5 },
    ...spoken(SETUP6),
    ...spoken(PUNCH7),
    { type: 'tick', now: 34.0 },
    { type: 'tick', now: 35.4 },
    ...spoken(LONE8),
    { type: 'tick', now: 37.6 },
    { type: 'tick', now: 39.0 },
    { type: 'finish', now: 40 },
  );
}

const laughs = (s: SetState) => s.reactions.filter((r) => r.kind === 'laugh');

/** The club set up to its heckle at 25.5 s (two dead bits after the laughed opener). */
function toHeckle(venue: VenueId = 'club'): SetState {
  return apply(
    playBitOne(createSetState(config(venue))),
    { type: 'tick', now: 9.8 },
    { type: 'tick', now: 11.0 },
    { type: 'tick', now: 12.0 },
    { type: 'tick', now: 13.9 },
    ...spoken(FLAT3),
    ...spoken(FLAT4),
    { type: 'tick', now: 19.6 },
    { type: 'tick', now: 21.0 },
    ...spoken(FLAT5),
    { type: 'tick', now: 24.1 },
    { type: 'tick', now: 25.5 },
  );
}

/** Every string in the engine's output (the config, packs and the performer's own lines are inputs). */
function outputStrings(s: SetState): string[] {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x !== null && typeof x === 'object')
      Object.keys(x).forEach((k) => walk((x as Record<string, unknown>)[k]));
  };
  walk({ ...s, config: null, pack: null, venue: null, lines: null });
  return out;
}

/** What the engine itself may write: enums, plate ids and measured captions and reasons. */
const MEASURED = [
  /^(wide|reaction|card|finale|laugh|snap|applause|cheer|murmur|heckle|silence|intro|between|end|armed|live|done|off|local|service|shown|late|silent)$/,
  /^[a-z0-9]+(-[a-z0-9]+)+$/,
  /^(LAUGH|SNAP|APPLAUSE|CHEER) · \d+\.\d s after your (line|phrase) · the room's \w+ tonight$/,
  /^(MURMUR · )?\d+\.\d s of dead air$/,
  /^(HECKLE · )?\d+ dead bits? in a row$/,
  /^(tag: )?(laugh|snap|applause|cheer) \d+\.\d s after a \d+\.\d s (line|phrase)/,
  /^(beat held|no beat) after a \d+\.\d s line/,
  /^(no beat|too quiet|too short)$/,
  /^\d+% of a \d+\.\d s phrase within 25 cents/,
  // Content features (ids) and the captions that name them: measured patterns in the performer's words or pitch.
  /^(callback|wordplay|triad|reversal|tag|specific|endRhyme|internalRhyme|alliteration|meter|anaphora|volta|contrast|question|callToAction|quotable|heldNote|finalNote|range)$/,
  /^(LAUGH|SNAP|APPLAUSE|CHEER) · [^·]+ · \d+\.\d s beat$/,
];
const prose = (s: SetState) => outputStrings(s).filter((x) => !MEASURED.some((re) => re.test(x)));

describe('a stand-up set at the club', () => {
  it('opens on the wide and records the intro moment, with no words of its own', () => {
    const armed = createSetState(config('club'));
    expect(armed.phase).toBe('armed');
    expect(clockLabel(armed)).toBe('0:00');
    expect(armed.moments).toEqual([]);
    const live = apply(armed, { type: 'start', startedAt: 1000 });
    expect(live.phase).toBe('live');
    expect(live.startedAt).toBe(1000);
    expect(live.shot).toEqual({ kind: 'wide', plate: 'comedy-club-dark-red-quintero', from: 0, to: null });
    expect(live.moments).toEqual([
      {
        id: 1,
        kind: 'intro',
        facts: { at: 0, landed: 0, candidates: 0, roomReactions: 0, longestDeadAirSec: 0, elapsedSec: 0 },
      },
    ]);
    expect(live.momentOutcomes).toEqual({});
  });

  it('ignores phone events before the set starts', () => {
    const s = apply(createSetState(config('club')), ...spoken(SETUP), { type: 'tick', now: 9 });
    expect(s.lines).toHaveLength(0);
    expect(s.now).toBe(0);
  });

  it('gives "no beat" to a setup the performer talks over, with the pause it did leave', () => {
    const s = playBitOne(createSetState(config('club')));
    const setup = s.judged.find((j) => j.lineId === 1);
    expect(setup).toEqual({
      lineId: 1,
      candidate: false,
      score: null,
      why: 'no beat',
      landed: false,
      roomReacted: false,
      pauseAfter: 0.3,
    });
  });

  it('laughs once, with a latency set by the line’s strength, and says so in the caption', () => {
    const s = playBitOne(createSetState(config('club')));
    const punch = s.judged.find((j) => j.lineId === 2);
    expect(punch?.candidate).toBe(true);
    expect(punch?.score).toBeCloseTo(1, 5);
    expect(punch?.landed).toBe(true);
    expect(punch?.roomReacted).toBe(true);
    expect(punch?.pauseAfter).toBeNull(); // voice has not come back yet
    expect(punch?.why).toBe('laugh 0.5 s after a 1.5 s line, punch after a 4.0 s setup, louder at the end, no fillers');
    expect(s.reactions).toHaveLength(1);
    const laugh = s.reactions[0];
    expect(laugh).toMatchObject({ kind: 'laugh', lineId: 2, why: punch?.why });
    expect(laugh.strength).toBeGreaterThan(0.6);
    expect(laugh.strength).toBeLessThanOrEqual(1);
    expect(laugh.at).toBeCloseTo(reactionAt(PUNCH.t1, laugh.strength), 9);
    expect(laugh.at - PUNCH.t1).toBeCloseTo(0.54, 2);
    expect(s.shot.kind).toBe('reaction');
    expect(s.shot.plate).toBe('comedy-laughing-crowd-jimenez');
    expect(s.shot.from).toBe(laugh.at);
    expect(s.shot.to).toBeCloseTo(laugh.at + 2.0, 9);
    expect(s.shot.caption).toBe("LAUGH · 0.5 s after your line · the room's first tonight");
    expect(s.bits[0]).toMatchObject({ index: 1, from: 2.0, to: null, lines: 2, reactions: 1 });
    expect(s.deadBits).toBe(0);
  });

  it('records the real pause after a line once voice is back', () => {
    const s = apply(playBitOne(createSetState(config('club'))), { type: 'voice', at: 9.0, speaking: true, level: 0.2 });
    expect(s.judged.find((j) => j.lineId === 2)?.pauseAfter).toBeCloseTo(1.2, 9);
  });

  it('records a between-bits moment when a laughed bit closes, and shows the MC’s words behind the reaction', () => {
    let s = apply(playBitOne(createSetState(config('club'))), { type: 'tick', now: 9.8 });
    expect(s.bits[0].to).toBe(PUNCH.t1);
    expect(s.moments[1]).toEqual({
      id: 2,
      kind: 'between',
      facts: {
        at: 9.8,
        bit: 1,
        bitReactions: 1,
        landed: 1,
        candidates: 1,
        roomReactions: 1,
        longestDeadAirSec: 0.5,
        elapsedSec: 9.8,
      },
    });
    expect(s.momentOutcomes[1]).toBe('late'); // the intro got no words in its four seconds
    expect(s.shot.kind).toBe('reaction'); // a moment makes no card of its own
    s = apply(s, { type: 'mc-line', momentId: 2, text: '[model] between' });
    expect(s.shot.kind).toBe('reaction'); // the words wait behind the reaction shot
    expect(s.book.waiting).toEqual([{ momentId: 2, text: '[model] between' }]);
    s = apply(s, { type: 'tick', now: 11.0 });
    const holdEnd = laughs(s)[0].at + 2.0;
    expect(s.shot.kind).toBe('card');
    expect(s.shot.text).toBe('[model] between');
    expect(s.shot.caption).toBeUndefined();
    expect(s.shot.from).toBeCloseTo(holdEnd, 9);
    expect(s.shot.to).toBeCloseTo(holdEnd + 1, 9);
    expect(s.momentOutcomes[2]).toBe('shown');
    const later = apply(s, { type: 'tick', now: 11.5 });
    expect(later.shot).toMatchObject({ kind: 'wide', plate: 'comedy-club-crowd-hands-quintero' });
    expect(later.shot.from).toBeCloseTo(holdEnd + 1, 9);
    // At most one card per moment.
    expect(apply(later, { type: 'mc-line', momentId: 2, text: '[model] again' })).toBe(later);
  });

  it('murmurs once per silence after the room runs out of patience, staying on the wide', () => {
    const quiet = apply(
      playBitOne(createSetState(config('club'))),
      { type: 'tick', now: 9.8 },
      { type: 'tick', now: 11.0 },
      { type: 'tick', now: 12.0 },
    );
    // The laugh was held until ~10.3; the room's patience runs from there, not from the line.
    expect(quiet.reactions.filter((r) => r.kind === 'murmur')).toHaveLength(0);
    const s = apply(quiet, { type: 'tick', now: 13.9 });
    const murmurs = s.reactions.filter((r) => r.kind === 'murmur');
    expect(murmurs).toHaveLength(1);
    expect(murmurs[0]).toMatchObject({ at: 13.9, why: '3.6 s of dead air' });
    expect(s.shot.kind).toBe('wide');
    expect(s.shot.caption).toBe('MURMUR · 3.6 s of dead air');
    const again = apply(s, { type: 'tick', now: 14.5 });
    expect(again.reactions.filter((r) => r.kind === 'murmur')).toHaveLength(1);
  });

  it('heckles after two dead bits with a two-second card', () => {
    let s = apply(
      playBitOne(createSetState(config('club'))),
      { type: 'tick', now: 9.8 },
      { type: 'tick', now: 11.0 },
      { type: 'tick', now: 12.0 },
      { type: 'tick', now: 13.9 },
      ...spoken(FLAT3),
      ...spoken(FLAT4),
      { type: 'tick', now: 19.6 },
      { type: 'tick', now: 21.0 },
    );
    expect(s.judged.find((j) => j.lineId === 3)).toMatchObject({ candidate: false, why: 'no beat', pauseAfter: 0.2 });
    expect(s.judged.find((j) => j.lineId === 4)).toMatchObject({ candidate: true, landed: false, roomReacted: false });
    expect(s.judged.find((j) => j.lineId === 4)?.score).toBeCloseTo(0.4, 9);
    expect(s.bits[1]).toMatchObject({ index: 2, lines: 2, reactions: 0, to: FLAT4.t1 });
    expect(s.deadBits).toBe(1);
    expect(s.reactions.filter((r) => r.kind === 'heckle')).toHaveLength(0);
    s = apply(s, ...spoken(FLAT5), { type: 'tick', now: 24.1 }, { type: 'tick', now: 25.5 });
    expect(s.deadBits).toBe(2);
    const heckles = s.reactions.filter((r) => r.kind === 'heckle');
    expect(heckles).toHaveLength(1);
    expect(heckles[0]).toMatchObject({ at: 25.5, why: '2 dead bits in a row' });
    expect(heckles[0].text).toBeUndefined();
    const heckle = s.moments[s.moments.length - 1];
    expect(heckle).toMatchObject({
      kind: 'heckle',
      facts: { at: 25.5, bit: 3, deadBits: 2, landed: 1, candidates: 3, roomReactions: 1, elapsedSec: 25.5 },
    });
    // The measured caption goes up at once on the wide; there is no card without the MC's words.
    expect(s.shot).toMatchObject({ kind: 'wide', caption: 'HECKLE · 2 dead bits in a row' });
    expect(s.shot.text).toBeUndefined();
    s = apply(s, { type: 'tick', now: 26.0 }, { type: 'mc-line', momentId: heckle.id, text: '[model] heckle' });
    expect(s.shot).toMatchObject({
      kind: 'card',
      from: 26.0,
      to: 28.0,
      text: '[model] heckle',
      caption: 'HECKLE · 2 dead bits in a row',
    });
    expect(s.momentOutcomes[heckle.id]).toBe('shown');
  });

  it('ends on the finale plate, captioned only when the MC’s words for the end arrive', () => {
    const s = playWholeSet(createSetState(config('club')));
    expect(s.phase).toBe('done');
    expect(s.now).toBe(40);
    expect(clockLabel(s)).toBe('0:40');
    expect(s.shot).toEqual({ kind: 'finale', plate: 'comedy-club-neon-crowd-regan-asante', from: 40, to: null });
    const end = s.moments[s.moments.length - 1];
    expect(end).toEqual({
      id: 4,
      kind: 'end',
      facts: { at: 40, landed: 2, candidates: 5, roomReactions: 2, longestDeadAirSec: 4.7, elapsedSec: 40 },
    });
    // Moments during the set that got no words close as late; the end stays open.
    expect(s.momentOutcomes).toEqual({ 1: 'late', 2: 'late', 3: 'late' });
    const captioned = apply(s, { type: 'tick', now: 47 }, { type: 'mc-line', momentId: end.id, text: '[model] end' });
    expect(captioned.shot.caption).toBe('[model] end');
    expect(captioned.momentOutcomes[end.id]).toBe('shown');
    expect(apply(captioned, { type: 'mc-line', momentId: end.id, text: '[model] twice' }).shot.caption).toBe(
      '[model] end',
    );
    const silent = apply(s, { type: 'mc-silent', momentId: end.id });
    expect(silent.shot.caption).toBeUndefined();
    expect(silent.momentOutcomes[end.id]).toBe('silent');
    expect(s.pending).toHaveLength(0);
    expect(s.book.cuts).toHaveLength(0);
    expect(s.bits.every((b) => b.to !== null)).toBe(true);
    expect(s.judged.every((j) => j.pauseAfter !== null)).toBe(true);
    // Nothing moves after the end.
    expect(apply(s, { type: 'tick', now: 50 }, ...spoken(line(9, 41, 43, 37)))).toBe(s);
  });

  it('ends on the clock', () => {
    const s = apply(
      playBitOne(createSetState(config('club'))),
      { type: 'tick', now: 59.9 },
      { type: 'tick', now: 60.4 },
    );
    expect(s.phase).toBe('done');
    expect(s.now).toBe(60);
    expect(s.shot.kind).toBe('finale');
  });

  it('decides a line still pending at the finish with the beat known so far, reacting no later than the clock', () => {
    const s = apply(
      createSetState(config('club')),
      { type: 'start', startedAt: 0 },
      ...spoken(SETUP),
      { type: 'voice', at: 6.3, speaking: true, level: 0.2 },
      { type: 'line', line: PUNCH },
      { type: 'finish', now: 8.0 },
    );
    const punch = s.judged.find((j) => j.lineId === 2);
    expect(punch).toMatchObject({ candidate: true, landed: true, roomReacted: true, pauseAfter: 0.2 });
    expect(punch?.score).toBeCloseTo(0.7, 9); // no beat credit; shape, setup, emphasis and clean carry it
    expect(punch?.why).toBe('laugh 0.2 s after a 1.5 s line, punch after a 4.0 s setup, louder at the end, no fillers');
    expect(s.reactions[0].at).toBe(8.0);
    expect(landingScore(PUNCH, SETUP, 0.2, 'standup', 'local').why).toMatch(
      /^no beat after a 1\.5 s line \(needs 0\.45 s\)/,
    );
  });

  it('cancels the beat when the voice message arrives before the line it follows', () => {
    const s = apply(
      createSetState(config('club')),
      { type: 'start', startedAt: 0 },
      { type: 'voice', at: 2.0, speaking: true, level: 0.2 },
      { type: 'line', line: SETUP },
      { type: 'voice', at: 6.0, speaking: false, level: 0 },
      { type: 'voice', at: 6.3, speaking: true, level: 0.2 },
      { type: 'voice', at: 7.8, speaking: false, level: 0 },
      { type: 'voice', at: 8.1, speaking: true, level: 0.2 },
      { type: 'line', line: PUNCH }, // reported late, after the next voice began
    );
    expect(s.judged.find((j) => j.lineId === 2)).toMatchObject({
      candidate: false,
      score: null,
      why: 'no beat',
      pauseAfter: 0.3,
    });
    expect(s.pending).toHaveLength(0);
  });

  it('reports the ledger: landed at the house standard, the room’s count, pace, fillers, dead air', () => {
    const s = playWholeSet(createSetState(config('club')));
    const sc = scorecard(s);
    expect(sc).toMatchObject({
      act: 'standup',
      venue: 'club',
      durationSec: 40,
      landed: 2,
      candidates: 5,
      landedPerMin: 3,
      roomReactions: 2,
      unsure: 0,
    });
    expect(sc.longestDeadAirSec).toBe(4.7);
    expect(sc.longestDeadAirAt).toBe(10.3);
    expect(sc.wpm).toBe(Math.round((48 * 60) / 17));
    expect(sc.peakWpm).toBe(172);
    expect(sc.fillers).toEqual({
      count: 4,
      top: [
        { word: 'um', n: 2 },
        { word: 'like', n: 1 },
        { word: 'uh', n: 1 },
      ],
    });
    expect(sc.inTunePct).toBeNull();
    expect(sc.longestHoldSec).toBeNull();
    const record = setRecord(s, '2026-10-10T12:00:00Z');
    expect(record).toMatchObject({
      setId: 'set-standup-club',
      act: 'standup',
      venue: 'club',
      persona: 'warm',
      performer: 'Aman',
      endedAt: '2026-10-10T12:00:00Z',
    });
    expect(record.summary).toBe(summaryLine(sc, 'standup'));
    expect(record.summary).toBe(
      '2 of 5 lines landed in 0:40; the room gave 2 laughs; went quiet for 4.7 s at 0:10; 169 wpm (peak 172); 4 fillers',
    );
    const recorded = (record.reactions ?? []).filter((r) => r.kind === 'laugh');
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ at: 8.3, lineId: 2, word: 'plumber' });
    expect(recorded[1]).toMatchObject({ at: 34.2, lineId: 7, word: 'postman' });
    expect((record.reactions ?? []).map((r) => r.kind)).toEqual(['laugh', 'murmur', 'heckle', 'murmur', 'laugh']);
  });

  it('patches late words into a line without re-judging it', () => {
    const s = apply(playBitOne(createSetState(config('club'))), {
      type: 'words-for',
      lineId: 2,
      words: 6,
      text: 'he brought a plumber for me',
      fillers: ['Um'],
    });
    expect(s.lines[1]).toMatchObject({ words: 6, fillers: ['um'] });
    expect(s.judged.find((j) => j.lineId === 2)?.landed).toBe(true);
    expect(scorecard(s).fillers?.count).toBe(1);
  });
});

describe('the room’s latency', () => {
  it('laughs sooner at a strong line than at a marginal one, and waits for its moment', () => {
    const club = playWholeSet(createSetState(config('club')));
    const [strong, marginal] = laughs(club);
    const strongLatency = strong.at - PUNCH.t1;
    const marginalLatency = marginal.at - PUNCH7.t1;
    expect(strongLatency).toBeLessThan(0.65);
    expect(marginalLatency).toBeGreaterThan(0.75);
    expect(marginalLatency).toBeGreaterThan(strongLatency);
    expect(marginal.why).toMatch(
      /^laugh 0\.8 s after a 1\.2 s line, punch after a 4\.0 s setup, flat ending, fillers: uh$/,
    );
    const captions = [...club.shots, club.shot].filter((x) => x.kind === 'reaction').map((x) => x.caption);
    expect(captions).toEqual([
      "LAUGH · 0.5 s after your line · the room's first tonight",
      "LAUGH · 0.8 s after your line · the room's second tonight",
    ]);

    // At full strength the arena laughs at the floor latency.
    const arena = playBitOne(createSetState(config('arena')));
    expect(laughs(arena)[0].at).toBeCloseTo(PUNCH.t1 + REACTION_LATENCY_MIN, 9);

    // A reaction decided before its moment is on the books but not yet on screen.
    const decided = apply(playWholeSet(createSetState(config('club'))));
    expect(decided.phase).toBe('done');
    let mid = apply(
      createSetState(config('club')),
      { type: 'start', startedAt: 0 },
      ...spoken(SETUP6),
      ...spoken(PUNCH7),
      { type: 'tick', now: 34.0 },
    );
    expect(laughs(mid)).toHaveLength(1);
    expect(laughs(mid)[0].at).toBeGreaterThan(34.0);
    expect(mid.shot.kind).toBe('wide');
    expect(mid.book.cuts).toHaveLength(1);
    mid = apply(mid, { type: 'tick', now: 34.3 });
    expect(mid.shot.kind).toBe('reaction');
    expect(mid.shot.from).toBe(laughs(mid)[0].at);
    expect(mid.book.cuts).toHaveLength(0);
  });
});

describe('ending on a laugh', () => {
  it('lands a reaction still on its way at the final whistle, no later than the clock', () => {
    let s = apply(
      createSetState(config('club')),
      { type: 'start', startedAt: 0 },
      ...spoken(SETUP6),
      ...spoken(PUNCH7),
      { type: 'tick', now: 34.0 },
    );
    expect(laughs(s)[0].at).toBeGreaterThan(34.1);
    s = apply(s, { type: 'finish', now: 34.1 });
    expect(s.phase).toBe('done');
    expect(laughs(s)).toHaveLength(1);
    expect(laughs(s)[0].at).toBe(34.1);
    expect(s.book.cuts).toHaveLength(0);
    expect(s.shot.kind).toBe('finale');
    expect(scorecard(s).roomReactions).toBe(1);
    const frames = cutSheet(s);
    expect(frames[frames.length - 1]).toMatchObject({ kind: 'finale', from: 34.1 });
    expect(frames.every((f) => f.to > f.from)).toBe(true);
  });
});

describe('the same set at every venue', () => {
  it('lands the same lines everywhere while the rooms react differently', () => {
    const openmic = scorecard(playWholeSet(createSetState(config('openmic'))));
    const club = scorecard(playWholeSet(createSetState(config('club'))));
    const theatre = scorecard(playWholeSet(createSetState(config('theatre'))));
    const arena = scorecard(playWholeSet(createSetState(config('arena'))));
    expect([openmic.landed, club.landed, theatre.landed, arena.landed]).toEqual([2, 2, 2, 2]);
    expect([openmic.candidates, club.candidates, theatre.candidates, arena.candidates]).toEqual([5, 5, 5, 5]);
    expect([openmic.roomReactions, club.roomReactions, theatre.roomReactions, arena.roomReactions]).toEqual([
      3, 2, 1, 1,
    ]);
    expect(openmic.landedPerMin).toBe(arena.landedPerMin);
  });

  it('never heckles at the open mic and heckles after one dead bit at the arena', () => {
    const openmic = playWholeSet(createSetState(config('openmic')));
    expect(openmic.reactions.filter((r) => r.kind === 'heckle')).toHaveLength(0);
    const arena = playWholeSet(createSetState(config('arena')));
    const heckles = arena.reactions.filter((r) => r.kind === 'heckle');
    expect(heckles).toHaveLength(1);
    expect(heckles[0]).toMatchObject({ at: 21.0, why: '1 dead bit in a row' });
  });

  it('runs out of patience sooner in a tougher room, counting from the end of its own laugh', () => {
    const run = (venue: VenueId) =>
      apply(
        playBitOne(createSetState(config(venue))),
        { type: 'tick', now: 12.95 },
        { type: 'tick', now: 13.15 },
        { type: 'tick', now: 13.85 },
        { type: 'tick', now: 15.05 },
      );
    const first = (venue: VenueId) => run(venue).reactions.find((r) => r.kind === 'murmur')?.at ?? null;
    expect(first('arena')).toBe(12.95); // laugh at 8.2 held 2.6 s, patience 2.0
    expect(first('theatre')).toBe(13.15); // ~10.58 + 2.5
    expect(first('club')).toBe(13.85); // ~10.34 + 3.5
    expect(first('openmic')).toBeNull(); // ~10.16 + 5.0 is still to come
  });
});

describe('words off', () => {
  it('reports pace and fillers as not measured, never zero', () => {
    const s = playWholeSet(createSetState(config('club', 'off')));
    const sc = scorecard(s);
    expect(sc.wpm).toBeNull();
    expect(sc.peakWpm).toBeNull();
    expect(sc.fillers).toBeNull();
    expect(summaryLine(sc, 'standup')).toMatch(/words off/);
  });

  it('awards the clean component at half weight when the line cannot be checked', () => {
    const on = landingScore(PUNCH, SETUP, 0.9, 'standup', 'local');
    const off = landingScore(PUNCH, SETUP, 0.9, 'standup', 'off');
    expect(on.score).not.toBeNull();
    expect(off.score).not.toBeNull();
    expect((on.score ?? 0) - (off.score ?? 0)).toBeCloseTo(0.05, 5);
    expect(off.why).toMatch(/words off/);
    const dirty = landingScore({ ...PUNCH, fillers: ['um'] }, SETUP, 0.9, 'standup', 'local');
    expect((on.score ?? 0) - (dirty.score ?? 0)).toBeCloseTo(0.1, 5);
    expect(dirty.why).toMatch(/fillers: um/);
    const unheard = landingScore(
      { ...PUNCH, words: undefined, text: undefined, fillers: undefined },
      SETUP,
      0.9,
      'standup',
      'local',
    );
    expect(unheard.score).toBeCloseTo(off.score ?? 0, 5);
  });
});

describe('the landing score', () => {
  it('weighs the beat, the shape, the setup, the emphasis and the fillers per act', () => {
    const full = landingScore(PUNCH, SETUP, 1.2, 'standup', 'local');
    expect(full.score).toBeCloseTo(1, 5);
    expect(full.why).toBe('beat held after a 1.5 s line, punch after a 4.0 s setup, louder at the end, no fillers');
    const noBeat = landingScore(PUNCH, SETUP, 0.3, 'standup', 'local');
    expect(noBeat.score).toBeCloseTo(0.7, 5);
    expect(noBeat.why).toMatch(/^no beat after a 1\.5 s line \(needs 0\.45 s\)/);
    const poetry = landingScore(PUNCH, SETUP, 1.2, 'poetry', 'local');
    expect(poetry.score).toBeCloseTo(1, 5); // setupPunch weighs nothing in poetry, the rest is full
    const poetryNoBeat = landingScore(PUNCH, SETUP, 0.3, 'poetry', 'local');
    expect(poetryNoBeat.score).toBeCloseTo(0.7, 5); // poetry: beat 0.30 (rebalanced 2026-10-12)
    const speech = landingScore({ ...PUNCH, endLevel: 0.2 }, SETUP, 1.2, 'speech', 'local');
    expect(speech.score).toBeCloseTo(0.55, 5); // flat ending costs 0.45 in speech
    expect(speech.why).toMatch(/flat ending/);
  });

  it('treats the beat as held or not: a 0.5 s beat scores like a 1.2 s one', () => {
    expect(landingScore(PUNCH, SETUP, 0.5, 'standup', 'local').score).toBeCloseTo(
      landingScore(PUNCH, SETUP, 1.2, 'standup', 'local').score ?? 0,
      9,
    );
    expect(landingScore(PUNCH, SETUP, 0.45, 'standup', 'local').score).toBeCloseTo(1, 9);
    expect(landingScore(PUNCH, SETUP, 0.44, 'standup', 'local').score).toBeCloseTo(0.7, 9);
  });

  it('does not lose a line on a threshold to floating point', () => {
    // 9.0 - 8.4 is 0.5999…; the line is 0.6 s long and keeps its shape.
    const edge = line(3, 8.4, 9.0, 7.8, { endLevel: 0.26, peakLevel: 0.3, words: 3, text: 'and the dog', fillers: [] });
    expect(landingScore(edge, PUNCH, 1, 'standup', 'local').score).toBeCloseTo(1, 9);
    expect(landingScore(edge, PUNCH, 8.85 - 8.4, 'standup', 'local').score).toBeCloseTo(1, 9); // a 0.45 s beat
  });

  it('is unsure about lines that are too quiet or too short', () => {
    expect(landingScore({ ...PUNCH, level: 0.01 }, SETUP, 1, 'standup', 'local')).toEqual({
      score: null,
      why: 'too quiet',
    });
    expect(landingScore({ ...PUNCH, t1: PUNCH.t0 + 0.3 }, SETUP, 1, 'standup', 'local')).toEqual({
      score: null,
      why: 'too short',
    });
  });

  it('a short tag soon after a laugh gets a bigger laugh without waiting for breath', () => {
    const tag = line(3, 8.4, 9.1, 7.8, { endLevel: 0.26, peakLevel: 0.3, words: 3, text: 'and the dog', fillers: [] });
    const s = apply(playBitOne(createSetState(config('club'))), ...spoken(tag), { type: 'tick', now: 9.9 });
    const got = laughs(s);
    expect(got).toHaveLength(2);
    expect(got[1]).toMatchObject({ lineId: 3 });
    expect(got[1].at).toBeCloseTo(reactionAt(tag.t1, got[1].strength), 9);
    expect(got[1].at - got[0].at).toBeLessThan(2);
    expect(got[1].why).toMatch(/^tag: laugh 0\.\d s after a 0\.7 s line/);
    expect(got[1].strength).toBeGreaterThanOrEqual(got[0].strength + 0.15 - 1e-9);
    expect(s.shot.caption).toMatch(/the room's second tonight$/);
    expect(s.judged.find((j) => j.lineId === 2)?.pauseAfter).toBeCloseTo(0.6, 9);
  });
});

describe('the shape of a punch', () => {
  it('does not land a flowing line without a louder ending, and treats a long line as a setup', () => {
    // A clean 3.5 s line with a beat, no structure, no emphasis: beat + shape + clean = 0.50.
    const flowing = line(2, 6.5, 10.0, 6.0, {
      words: 11,
      text: 'and then the plumber looked at the boiler for a while',
      fillers: [],
    });
    expect(landingScore(flowing, SETUP, 1.0, 'standup', 'local').score).toBeCloseTo(0.5, 9);
    expect(landingScore(flowing, SETUP, 1.0, 'standup', 'local').score).toBeLessThan(HOUSE_STANDARD);
    // A 7 s line is not shaped like a punch: nothing is awarded, whatever else it did.
    const ramble = line(3, 11.0, 18.0, 10.0, {
      endLevel: 0.3,
      peakLevel: 0.3,
      words: 20,
      text: 'so anyway',
      fillers: [],
    });
    const long = landingScore(ramble, flowing, 1.0, 'standup', 'local');
    expect(long.score).toBe(0);
    expect(long.why).toBe('beat held after a 7.0 s line, long line (7.0 s): a setup, not a punch');
    // ... but it is a setup for the short line after it.
    const punch = line(4, 19.0, 20.5, 18.0, { words: 4, text: 'it was tuesday', fillers: [] });
    const after = landingScore(punch, ramble, 1.0, 'standup', 'local');
    expect(after.score).toBeCloseTo(0.75, 9);
    expect(after.why).toMatch(/punch after a 7\.0 s setup/);
    // The old "within 2.5 s of a 4 s line" clause is gone: a 3 s line after a setup is no punch.
    const slow = line(5, 21.0, 24.0, 20.5, { words: 9, text: 'and the landlord said', fillers: [] });
    expect(landingScore(slow, ramble, 1.0, 'standup', 'local').score).toBeCloseTo(0.5, 9);
    expect(landingScore(slow, ramble, 1.0, 'standup', 'local').why).not.toMatch(/setup/);
  });

  it('keeps the scripted set honest: only the punchlines land at the club', () => {
    const s = playWholeSet(createSetState(config('club')));
    expect(s.judged.filter((j) => j.candidate).map((j) => [j.lineId, Math.round((j.score ?? 0) * 100) / 100])).toEqual([
      [2, 1],
      [4, 0.4],
      [5, 0.4],
      [7, 0.65],
      [8, 0.5],
    ]);
  });
});

describe('the phone’s message order', () => {
  it('keeps a bit open when voice stops 300 ms before the line that ended it arrives', () => {
    const first = line(1, 2.0, 4.0, -1, { words: 5, text: 'first line here', fillers: [] });
    let s = apply(createSetState(config('club')), { type: 'start', startedAt: 0 }, ...spoken(first));
    s = apply(s, { type: 'voice', at: 4.5, speaking: true, level: 0.2 }, { type: 'tick', now: 7.0 });
    expect(s.bits).toHaveLength(1);
    expect(s.bits[0].to).toBeNull();
    // Voice stops at 7.5; the line (4.5–7.5) is still on its way.
    s = apply(s, { type: 'voice', at: 7.5, speaking: false, level: 0 }, { type: 'tick', now: 7.6 });
    expect(s.bits[0].to).toBeNull();
    const second = line(2, 4.5, 7.5, 4.0, { words: 8, text: 'the second line of the bit', fillers: [] });
    s = apply(s, { type: 'tick', now: 7.8 }, { type: 'line', line: second }, { type: 'tick', now: 9.4 });
    expect(s.bits).toHaveLength(1);
    expect(s.bits[0]).toMatchObject({ lines: 2, to: null });
    s = apply(s, { type: 'tick', now: 9.5 });
    expect(s.bits[0].to).toBe(7.5);
  });
});

describe('dead air', () => {
  it('starts counting only after the first voice of the set', () => {
    let s = apply(createSetState(config('club')), { type: 'start', startedAt: 0 });
    for (let t = 1.2; t <= 5.0; t += 0.5) s = apply(s, { type: 'tick', now: t });
    expect(s.reactions.filter((r) => r.kind === 'murmur')).toHaveLength(0);
    const first = line(1, 5.2, 7.0, -1, { words: 5, text: 'good evening everybody', fillers: [] });
    s = apply(s, ...spoken(first), { type: 'finish', now: 7.0 });
    const sc = scorecard(s);
    expect(sc.longestDeadAirSec).toBe(0);
    expect(sc.longestDeadAirAt).toBeNull();
    expect(cutSheet(s).filter((f) => f.kind === 'dead')).toHaveLength(0);
    expect(s.reactions.filter((r) => r.kind === 'murmur')).toHaveLength(0);
  });
});

describe('the live angle', () => {
  it('cuts between the wide plates every eight seconds while nothing happens', () => {
    let s = apply(createSetState(config('club')), { type: 'start', startedAt: 0 });
    for (let t = 0.5; t <= 30; t += 0.5) s = apply(s, { type: 'tick', now: Math.round(t * 10) / 10 });
    const wides = [...s.shots, s.shot].filter((x) => x.kind === 'wide');
    expect(wides.length).toBeGreaterThanOrEqual(3);
    expect(wides.map((x) => x.from)).toEqual([0, 8, 16, 24]);
    expect(wides.map((x) => x.plate)).toEqual([
      'comedy-club-dark-red-quintero',
      'comedy-club-crowd-hands-quintero',
      'comedy-club-dark-red-quintero',
      'comedy-club-crowd-hands-quintero',
    ]);
    // The cut sheet folds them into one wide.
    expect(cutSheet(s).filter((f) => f.kind === 'wide')).toHaveLength(1);
  });

  it('holds the angle while a decision is pending or a card is waiting', () => {
    const late = line(1, 2.0, 9.0, -1, { words: 20, text: 'a long opening line that runs and runs', fillers: [] });
    let s = apply(createSetState(config('club')), { type: 'start', startedAt: 0 }, ...spoken(late));
    expect(s.pending).toHaveLength(1);
    s = apply(s, { type: 'tick', now: 9.3 }); // the wide is 8.1 s old, but the decision is 0.2 s away
    expect([...s.shots, s.shot].filter((x) => x.kind === 'wide')).toHaveLength(1);
    s = apply(s, { type: 'tick', now: 9.6 }); // decided (score 0: a 7 s line); now the angle may change
    expect([...s.shots, s.shot].filter((x) => x.kind === 'wide')).toHaveLength(2);
  });
});

describe('MC moments', () => {
  const started = () =>
    apply(createSetState(config('club')), { type: 'start', startedAt: 0 }, { type: 'tick', now: 2.5 });

  it('records the moments the room decided, in order, ids from 1', () => {
    const kinds = (venue: VenueId) => playWholeSet(createSetState(config(venue))).moments.map((m) => [m.id, m.kind]);
    expect(kinds('club')).toEqual([
      [1, 'intro'],
      [2, 'between'],
      [3, 'heckle'],
      [4, 'end'],
    ]);
    // The open mic never heckles, and a second between moment within 45 s of the first is not recorded.
    expect(kinds('openmic')).toEqual([
      [1, 'intro'],
      [2, 'between'],
      [3, 'end'],
    ]);
    // The arena heckles after one dead bit, then waits 30 s before the next.
    expect(kinds('arena')).toEqual([
      [1, 'intro'],
      [2, 'between'],
      [3, 'heckle'],
      [4, 'end'],
    ]);
  });

  it('shows the intro card only if its words come within four seconds and before the first voice', () => {
    const shown = apply(started(), { type: 'mc-line', momentId: 1, text: '[model] intro' });
    expect(shown.shot).toMatchObject({ kind: 'card', from: 2.5, to: 2.5 + INTRO_CARD_SEC, text: '[model] intro' });
    expect(shown.momentOutcomes[1]).toBe('shown');
    expect(apply(shown, { type: 'tick', now: 3.8 }).shot).toMatchObject({ kind: 'wide', from: 3.7 });
    const late = apply(started(), { type: 'tick', now: 4.2 }, { type: 'mc-line', momentId: 1, text: '[model] intro' });
    expect(late.shot).toMatchObject({ kind: 'wide', from: 0 });
    expect(late.momentOutcomes[1]).toBe('late');
    const talking = apply(
      started(),
      { type: 'voice', at: 3.0, speaking: true, level: 0.2 },
      { type: 'mc-line', momentId: 1, text: '[model] intro' },
    );
    expect(talking.shot.kind).toBe('wide');
    expect(talking.momentOutcomes[1]).toBe('late');
  });

  it('shows nothing for a silent moment, for words that miss the window, or for an unknown moment', () => {
    const at = apply(playBitOne(createSetState(config('club'))), { type: 'tick', now: 9.8 });
    const silent = apply(at, { type: 'mc-silent', momentId: 2 }, { type: 'tick', now: 11.0 });
    expect(silent.momentOutcomes[2]).toBe('silent');
    expect(silent.shot.kind).toBe('wide');
    expect(apply(silent, { type: 'mc-line', momentId: 2, text: '[model] after silence' }).shot.kind).toBe('wide');
    const late = apply(at, { type: 'tick', now: 14.0 }, { type: 'mc-line', momentId: 2, text: '[model] late' });
    expect(late.momentOutcomes[2]).toBe('late');
    expect([...late.shots, late.shot].some((x) => x.kind === 'card')).toBe(false);
    // "Could not answer" after the window outranks "late".
    expect(apply(late, { type: 'mc-silent', momentId: 2 }).momentOutcomes[2]).toBe('silent');
    expect(apply(at, { type: 'mc-line', momentId: 99, text: '[model] nobody asked' })).toBe(at);
    expect(apply(at, { type: 'mc-line', momentId: 2, text: '   ' }).momentOutcomes[2]).toBe('silent');
  });

  it('holds words while the performer speaks, shows them when they stop, drops them when the moment passes', () => {
    const base = toHeckle();
    const id = base.moments[base.moments.length - 1].id;
    expect(base.shot).toMatchObject({ kind: 'wide', from: 19.6 });
    let s = apply(
      base,
      { type: 'voice', at: 26.0, speaking: true, level: 0.2 },
      { type: 'mc-line', momentId: id, text: '[model] heckle' },
    );
    expect(s.shot.kind).toBe('wide');
    expect(s.book.waiting).toHaveLength(1);
    // While words wait, the director holds the angle, though this wide is past eight seconds.
    s = apply(s, { type: 'tick', now: 27.8 });
    expect(s.shot).toMatchObject({ kind: 'wide', from: 19.6 });
    const stops = apply(s, { type: 'voice', at: 28.0, speaking: false, level: 0 }, { type: 'tick', now: 28.1 });
    expect(stops.shot).toMatchObject({ kind: 'card', from: 28.1, to: 30.1, text: '[model] heckle' });
    expect(stops.momentOutcomes[id]).toBe('shown');
    const talks = apply(s, { type: 'tick', now: 29.6 });
    expect(talks.momentOutcomes[id]).toBe('late');
    expect(talks.book.waiting).toHaveLength(0);
    expect(talks.shot).toMatchObject({ kind: 'wide', from: 29.6 });
  });

  it('shows the words verbatim, cut defensively on a word boundary past 140 characters', () => {
    expect(cardText('  two   spaces\n here ')).toBe('two spaces here');
    expect(cardText('x'.repeat(120))).toBe('x'.repeat(120));
    const long = 'word '.repeat(40).trim();
    expect(cardText(long).length).toBeLessThanOrEqual(MC_TEXT_MAX);
    expect(cardText(long)).toMatch(/^(word )+word…$/);
    expect(apply(started(), { type: 'mc-line', momentId: 1, text: long }).shot.text).toBe(cardText(long));
  });

  it('writes no MC prose of its own: every word on screen came through mc-line', () => {
    for (const venue of VENUE_IDS) expect(prose(playWholeSet(createSetState(config(venue))))).toEqual([]);
    expect(prose(toHeckle())).toEqual([]);
    let s = apply(started(), { type: 'mc-line', momentId: 1, text: '[model] intro' });
    s = apply(s, { type: 'tick', now: 5 }, { type: 'finish', now: 6 });
    s = apply(s, { type: 'mc-line', momentId: s.moments[s.moments.length - 1].id, text: '[model] end' });
    expect(prose(s).sort()).toEqual(['[model] end', '[model] intro']);
  });
});

describe('unsure lines', () => {
  it('never become candidates and never count against the performer', () => {
    const quiet = line(1, 2.0, 4.0, -1, { level: 0.01, endLevel: 0.01, peakLevel: 0.01, words: 5, fillers: [] });
    const short = line(2, 6.0, 6.3, 4.0, { words: 1, fillers: [] });
    const s = apply(
      createSetState(config('club')),
      { type: 'start', startedAt: 0 },
      ...spoken(quiet),
      ...spoken(short),
      { type: 'tick', now: 9.0 },
    );
    expect(s.pending).toHaveLength(0);
    expect(s.judged.map((j) => j.why)).toEqual(['too quiet', 'too short']);
    expect(s.judged.every((j) => !j.candidate && j.score === null && !j.landed && !j.roomReacted)).toBe(true);
    const sc = scorecard(s);
    expect(sc.unsure).toBe(2);
    expect(sc.candidates).toBe(0);
    expect(sc.landed).toBe(0);
    expect(summaryLine(sc, 'standup')).toMatch(/2 unsure/);
  });

  it('does not count "no beat" lines as unsure', () => {
    const s = playBitOne(createSetState(config('club')));
    expect(s.judged.filter((j) => !j.candidate)).toHaveLength(1);
    expect(scorecard(s).unsure).toBe(0);
    expect(scorecard(s).candidates).toBe(1);
  });
});

describe('singing', () => {
  function samples(from: number, n: number, midi: number | null, clarity = 0.9, level = 0.1): PitchSample[] {
    const out: PitchSample[] = [];
    for (let i = 0; i < n; i++) out.push({ t: Math.round((from + i * 0.1) * 10) / 10, midi, clarity, level });
    return out;
  }

  it('scores phrases by how long they held a semitone and cheers the ones that did', () => {
    let s = apply(
      createSetState(config('openmic', 'off', 'singing')),
      { type: 'start', startedAt: 0 },
      { type: 'tick', now: 1.2 },
    );
    s = apply(
      s,
      { type: 'pitch', samples: samples(2.0, 20, 60.05) },
      { type: 'pitch', samples: samples(4.0, 5, null, 0, 0.01) },
    );
    expect(s.phrases).toHaveLength(1);
    expect(s.phrases[0]).toMatchObject({ id: 1, from: 2.0, to: 3.9, samples: 20, inTune: 20, hold: 1 });
    expect(s.judged[0]).toMatchObject({
      lineId: 1,
      candidate: true,
      score: 1,
      landed: true,
      roomReacted: true,
      pauseAfter: null,
    });
    // One note held 1.9 s and the phrase ends on it: the pitch's own features name the reason.
    expect(s.judged[0].why).toBe(
      '100% of a 1.9 s phrase within 25 cents, one note held 1.9 s, ended on a held note (1.9 s)',
    );
    expect(s.judged[0].features).toEqual(['heldNote', 'finalNote']);
    const cheer = s.reactions[0];
    expect(cheer).toMatchObject({ kind: 'cheer', lineId: 1, features: ['heldNote', 'finalNote'] });
    expect(cheer.at).toBeCloseTo(reactionAt(3.9, cheer.strength), 9);
    expect(cheer.why).toMatch(/^cheer 0\.\d s after a 1\.9 s phrase, 100% within 25 cents, one note held 1\.9 s/);
    s = apply(s, { type: 'tick', now: 4.6 });
    expect(s.shot.kind).toBe('reaction');
    expect(s.shot.caption).toMatch(/^CHEER · a note held 1\.9 s · 0\.\d s beat$/);

    s = apply(
      s,
      { type: 'pitch', samples: samples(6.0, 20, 60.4) },
      { type: 'pitch', samples: samples(8.0, 5, null, 0, 0.01) },
    );
    expect(s.phrases).toHaveLength(2);
    expect(s.judged[1]).toMatchObject({ lineId: 2, candidate: true, score: 0, landed: false, roomReacted: false });
    expect(s.reactions.filter((r) => r.kind === 'cheer')).toHaveLength(1);

    // Too short to be a phrase, long enough to be noticed: unsure.
    s = apply(
      s,
      { type: 'pitch', samples: samples(9.0, 8, 62.0) },
      { type: 'pitch', samples: samples(9.8, 5, null, 0, 0.01) },
    );
    expect(s.judged[2]).toMatchObject({ lineId: 3, candidate: false, score: null, why: 'too short' });

    s = apply(s, { type: 'finish', now: 12 });
    const sc = scorecard(s);
    expect(sc).toMatchObject({
      act: 'singing',
      landed: 1,
      candidates: 2,
      roomReactions: 1,
      unsure: 1,
      inTunePct: Math.round(2800 / 48),
      longestHoldSec: 1.9,
      wpm: null,
      fillers: null,
    });
    expect(summaryLine(sc, 'singing')).toMatch(/^58% in tune; longest hold 1\.9 s; 1 of 2 phrases held in 0:12/);
  });

  it('ignores unclear or quiet readings and closes an open phrase at the finish', () => {
    let s = apply(createSetState(config('club', 'off', 'singing')), { type: 'start', startedAt: 0 });
    s = apply(s, { type: 'pitch', samples: samples(2.0, 10, 60, 0.5) }); // unclear: not voiced
    expect(s.phrases).toHaveLength(0);
    s = apply(s, { type: 'pitch', samples: samples(3.0, 20, 60) }, { type: 'finish', now: 5.0 });
    expect(s.phrases).toHaveLength(1);
    expect(s.judged[0].landed).toBe(true);
    expect(s.reactions[0].at).toBeLessThanOrEqual(5.0);
    expect(s.shot.kind).toBe('finale');
  });
});

describe('the cut sheet', () => {
  it('covers the set contiguously with wides, reaction cuts, dead air and the finale', () => {
    const s = playWholeSet(createSetState(config('club')));
    const frames = cutSheet(s);
    expect(frames[0].from).toBe(0);
    for (let i = 1; i < frames.length; i++) expect(frames[i].from).toBe(frames[i - 1].to);
    const last = frames[frames.length - 1];
    expect(last.kind).toBe('finale');
    expect(last.from).toBe(40);
    expect(frames[frames.length - 2].to).toBe(40);
    expect(frames.every((f) => f.to > f.from)).toBe(true);
    const reactions = frames.filter((f) => f.kind === 'reaction');
    // The label carries the real pause the performer left after the line, once it was known.
    expect(reactions.map((f) => f.label)).toEqual(['laugh 0:08 · 7.2 s beat', 'laugh 0:34 · 2.6 s beat']);
    expect(reactions[0].plate).toBe('comedy-laughing-crowd-jimenez');
    expect(reactions[0].from).toBe(laughs(s)[0].at);
    expect(reactions[0].to).toBeCloseTo(laughs(s)[0].at + 2.0, 9);
    const dead = frames.filter((f) => f.kind === 'dead');
    // Only silences past this room's patience (3.5 s at the club) are dead air, as on the live card and the ledger.
    expect(dead.map((f) => f.label)).toEqual(['dead 4.7 s', 'dead 4.5 s']);
    expect(dead[0].from).toBeCloseTo(laughs(s)[0].at + 2.0, 9); // after the laugh, not after the line
    expect(dead[0]).toMatchObject({ to: 15.0, plate: null });
    expect(frames.filter((f) => f.kind === 'wide').every((f) => f.plate !== null)).toBe(true);
  });

  it('works mid-set, ending at the clock', () => {
    const s = apply(playBitOne(createSetState(config('club'))), { type: 'tick', now: 9.0 });
    const frames = cutSheet(s);
    expect(frames[0]).toMatchObject({ kind: 'wide', from: 0, to: laughs(s)[0].at });
    expect(frames[frames.length - 1]).toMatchObject({
      kind: 'reaction',
      from: laughs(s)[0].at,
      to: 9.0,
      label: 'laugh 0:08',
    });
    expect(cutSheet(createSetState(config('club')))).toEqual([]);
  });
});

describe('bits', () => {
  it('closes a bit on a two-second pause, counting the laughs it earned', () => {
    const s = playWholeSet(createSetState(config('club')));
    expect(s.bits.map((b) => [b.index, b.from, b.to, b.lines, b.reactions])).toEqual([
      [1, 2.0, 7.8, 2, 1],
      [2, 15.0, 19.0, 2, 0],
      [3, 22.0, 23.5, 1, 0],
      [4, 28.0, 33.4, 2, 1],
      [5, 36.0, 37.0, 1, 0],
    ]);
  });

  it('resets the dead-bit count on a laugh', () => {
    const s = playWholeSet(createSetState(config('club')));
    // bit 4 laughed (deadBits -> 0), bit 5 died (-> 1)
    expect(s.deadBits).toBe(1);
  });
});

describe('plates and the venue', () => {
  it('reads its venue from the pack', () => {
    const s = createSetState(config('theatre'));
    expect(s.venue).toEqual(getVenue('standup', 'theatre'));
    expect(s.endsAt).toBe(60);
    expect(s.wordsMode).toBe('local');
    expect(reduceSet(s, { type: 'words', mode: 'off' }).wordsMode).toBe('off');
  });

  it('alternates reaction plates between laughs', () => {
    const s = playWholeSet(createSetState(config('club')));
    const reactionShots = [...s.shots, s.shot].filter((x) => x.kind === 'reaction');
    expect(reactionShots.map((x) => x.plate)).toEqual(['comedy-laughing-crowd-jimenez', 'comedy-laughing-faces-bucks']);
  });

  it('counts landed at the house standard, not the room’s threshold', () => {
    const s = playWholeSet(createSetState(config('arena')));
    const landedScores = s.judged.filter((j) => j.landed).map((j) => j.score ?? 0);
    expect(landedScores.every((x) => x >= HOUSE_STANDARD)).toBe(true);
    expect(landedScores.some((x) => x < getVenue('standup', 'arena').threshold)).toBe(true);
  });
});
