import { describe, expect, it } from 'vitest';
import {
  CONTENT_CAP,
  CONTENT_WEIGHTS,
  JUDGE_ANSWER_SEC,
  JUDGE_DEADLINE_SEC,
  JUDGE_MAX_WAIT_SEC,
  JUDGE_FLOOR,
  JUDGE_WEIGHT,
  VENUE_IDS,
  contentHits,
  contentSummary,
  createSetState,
  cutSheet,
  judgeBonus,
  judgeRequests,
  landingScore,
  phraseHits,
  reduceSet,
  rhymeKey,
  rhymes,
  scorecard,
  setRecord,
  stem,
  summaryLine,
  syllables,
  tokens,
  type ActId,
  type ContentContext,
  type JudgeVerdict,
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

function config(act: ActId, venue: VenueId = 'club', words: WordsMode = 'local', judge = false): SetConfig {
  return { setId: `c-${act}-${venue}`, act, venue, persona: 'warm', durationSec: 120, performer: 'Aman', words, judge };
}

let nextId = 1;
function line(t0: number, t1: number, text: string | undefined, o: { endLevel?: number; id?: number } = {}): LineEvent {
  const l: LineEvent = {
    id: o.id ?? nextId++,
    t0,
    t1,
    level: 0.2,
    endLevel: o.endLevel ?? 0.2,
    peakLevel: 0.22,
    pauseBefore: 0,
  };
  if (text !== undefined) {
    l.text = text;
    l.words = tokens(text).length;
    l.fillers = [];
  }
  return l;
}

function spoken(l: LineEvent): SetAction[] {
  return [
    { type: 'voice', at: l.t0, speaking: true, level: l.level },
    { type: 'line', line: l },
    { type: 'voice', at: l.t1, speaking: false, level: 0 },
  ];
}

/** Lines of one bit (bit 1 unless given), for calling contentHits directly. */
function ctx(act: ActId, earlier: { text: string; bit?: number; t?: number }[], bit = 1): ContentContext {
  return {
    act,
    bit,
    earlier: earlier.map((e, i) => ({
      line: line(e.t ?? i * 2, (e.t ?? i * 2) + 1.5, e.text, { id: 100 + i }),
      bit: e.bit ?? 1,
    })),
  };
}

function hits(act: ActId, text: string, earlier: { text: string; bit?: number; t?: number }[] = [], bit = 1, t0 = 60) {
  return contentHits(line(t0, t0 + 1.5, text, { id: 999 }), ctx(act, earlier, bit)).map((h) => h.feature);
}

function verdict(lineId: number, score: number, act: JudgeVerdict['act'] = 'standup'): JudgeVerdict {
  return { lineId, act, score, dims: { punch: score, surprise: score }, model: 'test', ms: 200, source: 'ai' };
}

describe('the words: tokens, stems, rhymes and syllables', () => {
  it('tokenises ASCII-safely and stems lightly', () => {
    expect(tokens("He didn't say WHICH winter!")).toEqual(['he', "didn't", 'say', 'which', 'winter']);
    expect(stem('landlords')).toBe(stem('landlord'));
    expect(stem('driving')).toBe(stem('drive'));
    expect(stem('running')).toBe('run');
  });

  it('hears common end rhymes by spelling and refuses the same word', () => {
    for (const [a, b] of [
      ['light', 'tonight'],
      ['bite', 'night'],
      ['day', 'away'],
      ['rain', 'plane'],
      ['moon', 'soon'],
      ['free', 'sea'],
      ['cold', 'old'],
      ['fire', 'desire'],
    ]) {
      expect(rhymes(a, b), `${a}/${b}`).toBe(true);
    }
    for (const [a, b] of [
      ['light', 'lights'],
      ['night', 'nights'],
      ['cat', 'dog'],
      ['home', 'alone'],
      ['the', 'me'],
    ]) {
      expect(rhymes(a, b), `${a}/${b}`).toBe(false);
    }
    expect(rhymeKey('light')).toBe(rhymeKey('bite'));
  });

  it('counts syllables to about one per line', () => {
    expect(syllables(tokens('the river runs beneath the light'))).toBe(8);
    expect(syllables(tokens('silver snow'))).toBe(3);
  });
});

describe('stand-up patterns', () => {
  const landlord = [{ text: 'so my landlord came round to fix the boiler', bit: 1, t: 1 }];

  it('hears a callback to a distinctive word from an earlier bit, not to the topic of this bit', () => {
    expect(hits('standup', 'and now the landlord is my boss', landlord, 2)).toContain('callback');
    const h = contentHits(line(60, 61.5, 'and now the landlord is my boss', { id: 999 }), ctx('standup', landlord, 2));
    expect(h[0]).toMatchObject({
      feature: 'callback',
      why: 'a callback to "landlord" from your first bit',
      caption: 'a callback to your first bit',
    });
    // The same bit: still the topic. Too soon (under 15 s): not a callback. A common word: never.
    expect(hits('standup', 'and the landlord is my boss', landlord, 1)).not.toContain('callback');
    expect(hits('standup', 'and the landlord is my boss', landlord, 2, 10)).not.toContain('callback');
    expect(
      hits('standup', 'anyway that was my friend', [{ text: 'anyway my friend called', bit: 1, t: 1 }], 2),
    ).toEqual([]);
  });

  it('hears the punch turning a word from its setup, and homophones across setup and punch', () => {
    const setup = [{ text: 'my landlord said he would fix the heating by winter' }];
    expect(hits('standup', 'he did not say which winter', setup)).toContain('wordplay');
    expect(hits('standup', 'the knight was long', [{ text: 'i worked all night' }])).toContain('wordplay');
    expect(hits('standup', 'he did not say which year', setup)).not.toContain('wordplay');
  });

  it('hears a list of three, a reversal, a specific detail and a tag', () => {
    expect(hits('standup', 'i lost my keys my phone and my dignity')).not.toContain('triad');
    expect(hits('standup', 'i lost my keys, my phone, and my dignity')).toContain('triad');
    expect(hits('standup', 'keys and phone and dignity gone')).toContain('triad');
    const three = [{ text: 'i tried yoga last week' }, { text: 'i tried running on monday' }];
    expect(hits('standup', 'i tried eating the whole cake', three)).toContain('triad');
    expect(hits('standup', 'turns out it was the cat', [{ text: 'i thought the house was haunted' }])).toContain(
      'reversal',
    );
    expect(hits('standup', 'turns out it was the cat')).not.toContain('reversal'); // no setup: nothing to reverse
    expect(hits('standup', 'it cost me 400 rupees')).toContain('specific');
    expect(hits('standup', 'then I moved to Mumbai')).toContain('specific');
    expect(hits('standup', 'then i moved away')).not.toContain('specific');
    const lastReacted = { line: line(10, 12, 'my dentist is a vampire', { id: 50 }), at: 12.6 };
    const tag = contentHits(line(13, 14, 'the dentist bills at midnight', { id: 51 }), {
      ...ctx('standup', [{ text: 'my dentist is a vampire', t: 10 }]),
      lastReacted,
    });
    expect(tag.map((h) => h.feature)).toContain('tag');
  });
});

describe('poetry and speech patterns', () => {
  it('poetry: end rhyme, internal rhyme, alliteration, meter, a repeated opening and a turn', () => {
    expect(hits('poetry', 'and every star goes out tonight', [{ text: 'the river runs beneath the light' }])).toContain(
      'endRhyme',
    );
    expect(hits('poetry', 'the cold and old stone wall')).toContain('internalRhyme');
    expect(hits('poetry', 'silver snow on sleeping streets')).toContain('alliteration');
    const steady = [{ text: 'the river runs beneath the light' }, { text: 'the morning breaks above the hill' }];
    expect(hits('poetry', 'a heron waits beside the reeds', steady)).toContain('meter');
    expect(hits('poetry', 'a heron', steady)).not.toContain('meter');
    expect(hits('poetry', 'i remember the kitchen', [{ text: 'i remember the rain' }])).toContain('anaphora');
    const three = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
    expect(hits('poetry', 'but nothing stayed', three)).toContain('volta');
    expect(hits('poetry', 'but nothing stayed', three.slice(0, 2))).not.toContain('volta');
  });

  it('speech: triads, anaphora, contrast, questions, calls to action and a short line after a long one', () => {
    expect(hits('speech', 'we will fight for jobs we will fight for schools we will fight for you')).toEqual(
      expect.arrayContaining(['triad', 'callToAction']),
    );
    expect(hits('speech', 'we will win', [{ text: 'we will build' }])).toContain('anaphora');
    expect(hits('speech', 'ask not what your country can do for you')).toContain('contrast');
    expect(hits('speech', 'it is not about money but about time')).toContain('contrast');
    expect(hits('speech', 'why do we wait')).toContain('question');
    expect(hits('speech', 'what i learned was simple')).not.toContain('question');
    expect(hits('speech', "let's start today")).toContain('callToAction');
    const long = [
      { text: 'for twenty years we have been told that the river cannot be cleaned and the town cannot change' },
    ];
    expect(hits('speech', 'this ends today', long)).toContain('quotable');
    expect(hits('speech', 'this ends today', [{ text: 'we waited' }])).not.toContain('quotable');
  });

  it('lists only the patterns each act listens for, strongest first', () => {
    // A callback is a stand-up pattern; speech does not look for it.
    const old = [{ text: 'so my landlord came round', bit: 1, t: 1 }];
    expect(hits('speech', 'and now the landlord is my boss', old, 2)).not.toContain('callback');
    const h = hits('speech', 'we will fight for jobs we will fight for schools we will fight for you');
    expect(h[0]).toBe('triad'); // 0.12 before the call to action's 0.08
    for (const act of ['standup', 'poetry', 'speech'] as ActId[]) {
      const w = CONTENT_WEIGHTS[act];
      for (const f of Object.keys(w)) expect(w[f as keyof typeof w]).toBeLessThanOrEqual(CONTENT_CAP[act]);
    }
  });
});

describe('singing patterns come from the pitch', () => {
  const noteOf = (p: PitchSample) => (p.midi === null ? null : Math.round(p.midi));
  const run = (from: number, n: number, midi: number, level = 0.1): PitchSample[] =>
    Array.from({ length: n }, (_, i) => ({ t: Math.round((from + i * 0.1) * 10) / 10, midi, clarity: 0.9, level }));

  it('hears a held note, a held ending and the range', () => {
    const phrase = [...run(0, 5, 60), ...run(0.5, 5, 64), ...run(1.0, 5, 67), ...run(1.5, 16, 72, 0.2)];
    const h = phraseHits(phrase, noteOf, false).map((x) => x.feature);
    expect(h).toEqual(['heldNote', 'finalNote', 'range']);
    expect(phraseHits(phrase, noteOf, true).find((x) => x.feature === 'finalNote')?.why).toBe(
      'a big final note (1.5 s)',
    );
    expect(phraseHits(run(0, 8, 60), noteOf, false)).toEqual([]);
  });
});

describe('content in the landing score', () => {
  const setup = line(1, 4, 'my landlord said he would fix the heating by winter', { id: 1 });
  const punch = line(4.3, 5.6, 'he did not say which winter', { id: 2 });
  const hitsFor = contentHits(punch, { act: 'standup', bit: 1, earlier: [{ line: setup, bit: 1 }] });

  it('only adds, is capped, and names what it found', () => {
    const timing = landingScore(punch, setup, 0.6, 'standup', 'local');
    const both = landingScore(punch, setup, 0.6, 'standup', 'local', { hits: hitsFor });
    expect(both.score).toBeCloseTo((timing.score ?? 0) + 0.1, 9);
    expect(both.why).toBe(`${timing.why}, the punch turns "winter" from the setup`);
    const many = landingScore(punch, setup, 0.6, 'standup', 'local', {
      hits: [
        ...hitsFor,
        ...contentHits(line(60, 61, 'turns out it cost 400 rupees, 2 dogs, and 3 cats', { id: 9 }), {
          act: 'standup',
          bit: 2,
          earlier: [{ line: line(1, 3, 'my landlord moved in', { id: 8 }), bit: 1 }],
        }),
      ],
      judge: 1,
    });
    expect((many.score ?? 0) - (timing.score ?? 0)).toBeLessThanOrEqual(CONTENT_CAP.standup + 1e-9);
  });

  it('with words off scores timing only, whatever the line says', () => {
    const off = landingScore(punch, setup, 0.6, 'standup', 'off', { hits: hitsFor, judge: 1 });
    expect(off).toEqual(landingScore(punch, setup, 0.6, 'standup', 'off'));
    expect(off.why).toMatch(/words off$/);
  });

  it("weighs the MC model's estimate only above its floor, and labels it an estimate", () => {
    expect(judgeBonus('standup', JUDGE_FLOOR.standup)).toBe(0);
    expect(judgeBonus('standup', 0.5)).toBe(0); // a typical Reddit joke on the percentile scale
    expect(judgeBonus('speech', 0.75)).toBeCloseTo(JUDGE_WEIGHT.speech * 0.5, 9);
    expect(judgeBonus('standup', 1)).toBeCloseTo(JUDGE_WEIGHT.standup, 9);
    expect(judgeBonus('singing', 1)).toBe(0);
    const plain = line(10, 11.5, 'and that was the evening', { id: 3 });
    const base = landingScore(plain, undefined, 0.6, 'standup', 'local', { hits: [] });
    const rated = landingScore(plain, undefined, 0.6, 'standup', 'local', { hits: [], judge: 0.9 });
    expect(rated.score).toBeCloseTo((base.score ?? 0) + judgeBonus('standup', 0.9), 9);
    expect(rated.why).toMatch(/the room heard a punchline \(the MC's model, an estimate\)$/);
    expect(landingScore(plain, undefined, 0.6, 'standup', 'local', { hits: [], judge: 0.3 }).why).toMatch(
      /rated the words ordinary \(an estimate\)$/,
    );
    expect(landingScore(plain, undefined, 0.6, 'standup', 'local', { hits: [], judge: 'late' }).why).toMatch(
      /too late \(timing and patterns only\)$/,
    );
  });
});

/** A stand-up set with a callback in bit 2, at a venue; optionally with the judge on and verdicts handed in. */
function callbackSet(venue: VenueId, judge: boolean, verdicts: Record<number, number> = {}): SetState {
  const l1 = line(1.0, 4.0, 'so my landlord came round to fix the boiler', { id: 1 });
  const l2 = line(4.3, 5.8, 'he brought a plumber for me', { id: 2, endLevel: 0.26 });
  const l3 = line(20.0, 23.0, 'my sister got a new job at the bank last week', { id: 3 });
  const l4 = line(23.3, 24.6, 'and her boss is my landlord', { id: 4 });
  let s = apply(
    createSetState(config('standup', venue, 'local', judge)),
    { type: 'start', startedAt: 0 },
    { type: 'tick', now: 0.5 },
  );
  for (const [l, until] of [
    [l1, 4.1],
    [l2, 9],
    [l3, 23.1],
    [l4, 27],
  ] as [LineEvent, number][]) {
    s = apply(s, ...spoken(l));
    if (verdicts[l.id] !== undefined) s = apply(s, { type: 'judge', verdict: verdict(l.id, verdicts[l.id]) });
    for (let t = Math.ceil(l.t1 * 10) / 10; t <= until + 1e-9; t = Math.round((t + 0.1) * 10) / 10)
      s = apply(s, { type: 'tick', now: t });
  }
  return apply(s, { type: 'finish', now: 30 });
}

describe('content in a live set', () => {
  it('rewards a callback and says so on the reaction and in the caption', () => {
    const s = callbackSet('club', false);
    const j4 = s.judged.find((j) => j.lineId === 4);
    expect(j4?.features).toEqual(['callback']);
    const laugh = s.reactions.find((r) => r.lineId === 4);
    expect(laugh?.why).toMatch(/a callback to "landlord" from your first bit/);
    expect(laugh?.features).toEqual(['callback']);
    const cut = s.shots.find((x) => x.kind === 'reaction' && x.reaction?.lineId === 4);
    expect(cut?.caption).toMatch(/^LAUGH · a callback to your first bit · \d\.\d s beat$/);
    const record = setRecord(s, '2026-10-12T20:00:00Z');
    expect(record.reactions?.find((r) => r.lineId === 4)?.features).toEqual(['callback']);
  });

  it('a tougher venue changes the room, never the score, with content and the judge', () => {
    const verdicts = { 2: 0.9, 4: 0.7 };
    const sets = VENUE_IDS.map((v) => callbackSet(v, true, verdicts));
    const scores = sets.map((s) => s.judged.map((j) => [j.lineId, j.score, j.landed, j.features, j.judge]));
    for (const x of scores) expect(x).toEqual(scores[0]);
    const cards = sets.map((s) => scorecard(s));
    for (const c of cards) {
      expect(c.landed).toBe(cards[0].landed);
      expect(c.content).toEqual(cards[0].content);
    }
    // The rooms differ: the arena's bar is higher, so the same lines earn weaker laughs there.
    const strengths = sets.map((s) => s.reactions.filter((r) => r.kind === 'laugh').map((r) => r.strength));
    expect(strengths[3]).not.toEqual(strengths[0]);
  });

  it('with words off: timing only, and the content is not measured', () => {
    const on = callbackSet('club', false);
    let off = apply(createSetState(config('standup', 'club', 'off')), { type: 'start', startedAt: 0 });
    for (const l of on.lines) off = apply(off, ...spoken(l), { type: 'tick', now: l.t1 + 0.6 });
    const timingOnly = off.lines.map((l, i) => landingScore(l, off.lines[i - 1], 0.6, 'standup', 'off').score);
    expect(off.judged.filter((j) => j.candidate).map((j) => j.score)).toEqual(timingOnly.filter((x) => x !== null));
    expect(off.judged.every((j) => j.features === undefined)).toBe(true);
    expect(scorecard(off).content).toBeNull();
    expect(summaryLine(scorecard(off), 'standup')).toMatch(/words off/);
    expect(scorecard(on).content?.features.callback).toBe(1);
  });

  it("waits for the MC model's estimate until the deadline, and reacts no sooner than it decided", () => {
    const l1 = line(1.0, 2.5, 'my dentist is a vampire', { id: 1 });
    const start = (judge: boolean) =>
      apply(createSetState(config('standup', 'club', 'local', judge)), { type: 'start', startedAt: 0 }, ...spoken(l1));
    // Without the judge the room decides at the beat.
    expect(apply(start(false), { type: 'tick', now: 3.0 }).judged).toHaveLength(1);
    // With it, the beat alone is not enough; the estimate arriving decides at once.
    let s = apply(start(true), { type: 'tick', now: 3.0 }, { type: 'tick', now: 3.1 });
    expect(s.judged).toHaveLength(0);
    expect(judgeRequests(s)).toEqual([
      { kind: 'judge', act: 'standup', lineId: 1, text: 'my dentist is a vampire', context: [] },
    ]);
    s = apply(s, { type: 'judge', verdict: verdict(1, 0.95) });
    expect(s.judged[0]).toMatchObject({ lineId: 1, judge: 0.95 });
    expect(s.judged[0].why).toMatch(/the room heard a punchline \(the MC's model, an estimate\)/);
    const laugh = s.reactions.find((r) => r.lineId === 1);
    expect(laugh?.judge).toBe(0.95);
    expect(laugh?.at).toBeGreaterThanOrEqual(3.1);
    expect(judgeRequests(s)).toEqual([]);
    // No estimate by the deadline: timing and patterns, and the why says the model was late.
    const late = apply(start(true), { type: 'tick', now: 3.0 }, { type: 'tick', now: 2.5 + JUDGE_DEADLINE_SEC });
    expect(late.judged[0]).toMatchObject({ judge: 'late' });
    expect(late.judged[0].why).toMatch(/the MC's model was too late \(timing and patterns only\)/);
    expect(judgeRequests(late)).toEqual([]);
    const none = apply(start(true), { type: 'tick', now: 3.0 }, { type: 'judge-none', lineId: 1 });
    expect(none.judged[0]).toMatchObject({ judge: 'unavailable' });
    // Voice back after the beat: decided now, whatever is missing.
    const resumed = apply(
      start(true),
      { type: 'tick', now: 3.1 },
      { type: 'voice', at: 3.2, speaking: true, level: 0.2 },
    );
    // The room decided because the next line began: that is not the model being late.
    expect(resumed.judged[0]).toMatchObject({ lineId: 1, candidate: true, judge: 'early' });
    expect(resumed.judged[0].why).toMatch(/your next line came before the MC's model answered/);
  });

  it('asks the judge only with words on, a spoken act and text, with up to three earlier lines', () => {
    const lines = [1, 2, 3, 4, 5].map((i) => line(i * 3, i * 3 + 1, `line number ${i}`, { id: i }));
    let s = apply(createSetState(config('standup', 'club', 'local', true)), { type: 'start', startedAt: 0 });
    for (const l of lines) s = apply(s, { type: 'line', line: l });
    expect(judgeRequests(s).map((r) => r.lineId)).toEqual([5]);
    expect(judgeRequests(s)[0].context).toEqual(['line number 2', 'line number 3', 'line number 4']);
    expect(judgeRequests(apply(s, { type: 'words', mode: 'off' }))).toEqual([]);
    let sung = apply(createSetState(config('singing', 'club', 'local', true)), { type: 'start', startedAt: 0 });
    sung = apply(sung, { type: 'line', line: lines[0] });
    expect(judgeRequests(sung)).toEqual([]);
    const noJudge = apply(
      createSetState(config('standup')),
      { type: 'start', startedAt: 0 },
      { type: 'line', line: lines[0] },
    );
    expect(judgeRequests(noJudge)).toEqual([]);
  });

  it("judges a line's interim words at the beat; the final words replace them on the ledger", () => {
    const old = line(1, 3, 'my landlord moved in', { id: 1 });
    const guess: LineEvent = { ...line(20, 21.5, 'and now the land', { id: 2 }), interim: true };
    let s = apply(createSetState(config('standup')), { type: 'start', startedAt: 0 }, ...spoken(old), {
      type: 'tick',
      now: 4,
    });
    s = apply(s, ...spoken(guess), { type: 'tick', now: 22.1 });
    expect(s.judged.find((j) => j.lineId === 2)?.features).toEqual([]);
    s = apply(s, { type: 'words-for', lineId: 2, words: 6, text: 'and now the landlord is my boss', fillers: [] });
    expect(scorecard(s).content?.features.callback).toBe(1);
    expect(s.lines.find((l) => l.id === 2)?.interim).toBeUndefined();
  });

  it('poetry: snaps for rhymes, and the ledger counts rhymed line ends', () => {
    const poem = [
      'the river runs beneath the light',
      'and every star goes out tonight',
      'the morning breaks above the hill',
      'and all the quiet town is still',
    ];
    let s = apply(createSetState(config('poetry', 'openmic')), { type: 'start', startedAt: 0 });
    poem.forEach((text, i) => {
      const l = line(1 + i * 4, 3.5 + i * 4, text, { id: i + 1 });
      s = apply(s, ...spoken(l), { type: 'tick', now: l.t1 + 0.6 });
    });
    s = apply(s, { type: 'finish', now: 20 });
    const sc = scorecard(s);
    expect(sc.content?.rhymedEnds).toEqual({ rhymed: 2, of: 3 });
    expect(sc.content?.features.endRhyme).toBe(2);
    expect(contentSummary(sc)).toMatch(/rhymes 2 of 3 line ends/);
    const snap = s.shots.find((x) => x.kind === 'reaction' && /rhymes/.test(x.caption ?? ''));
    expect(snap?.caption).toMatch(/^SNAP · "tonight" rhymes · \d\.\d s beat$/);
  });

  it('speech: applause names the triad', () => {
    let s = apply(createSetState(config('speech', 'openmic')), { type: 'start', startedAt: 0 });
    const l = line(1, 5.5, 'we will fight for jobs we will fight for schools we will fight for you', {
      endLevel: 0.25,
    });
    s = apply(s, ...spoken(l), { type: 'tick', now: 6.1 });
    expect(s.shot.caption).toMatch(/^APPLAUSE · three times "we will" · \d\.\d s beat$/);
  });

  it('the ledger says what the judge did, and nothing when it was off', () => {
    const on = scorecard(callbackSet('club', true, { 2: 0.8 }));
    expect(on.content?.judge).toEqual({ inTime: 1, missed: 1, early: 0, meanScore: 0.8 });
    expect(scorecard(callbackSet('club', false)).content?.judge).toBeNull();
  });
});

describe('one dead air: the live murmur, the strip and the ledger agree', () => {
  it('measures the murmur as the ledger does, and never hears a silence inside a line', () => {
    const l1 = line(1, 3, 'so the first thing', { id: 1 });
    const l2 = line(3.3, 8, 'and a long rambling second line that goes on and on for ages', { id: 2 });
    let s = apply(createSetState(config('standup', 'club', 'off')), { type: 'start', startedAt: 0 });
    // The next line's voice starts before the phone's "voice off" for the first one arrives: they crossed.
    s = apply(
      s,
      { type: 'voice', at: 1, speaking: true, level: 0.2 },
      { type: 'voice', at: 3.3, speaking: true, level: 0.2 },
      { type: 'voice', at: 3, speaking: false, level: 0 },
      { type: 'line', line: l1 },
    );
    expect(s.speaking).toBe(true);
    for (let t = 3.4; t < 8; t = Math.round((t + 0.1) * 10) / 10) s = apply(s, { type: 'tick', now: t });
    expect(s.reactions.filter((r) => r.kind === 'murmur')).toEqual([]);
    // Then a real silence past the club's patience (3.5 s): one murmur, with the ledger's own number.
    s = apply(s, { type: 'voice', at: 8, speaking: false, level: 0 }, { type: 'line', line: l2 });
    for (let t = 8.1; t <= 12.6; t = Math.round((t + 0.1) * 10) / 10) s = apply(s, { type: 'tick', now: t });
    const murmurs = s.reactions.filter((r) => r.kind === 'murmur');
    expect(murmurs).toHaveLength(1);
    const said = Number(/^([\d.]+) s of dead air$/.exec(murmurs[0].why)?.[1]);
    expect(said).toBeGreaterThanOrEqual(3.5);
    const l3 = line(13, 14, 'right', { id: 3 });
    s = apply(s, ...spoken(l3), { type: 'finish', now: 15 });
    const sc = scorecard(s);
    expect(sc.longestDeadAirSec).toBeGreaterThanOrEqual(said);
    expect(sc.longestDeadAirAt).toBe(8);
    // The strip stripes exactly that silence: past the room's patience, not a fixed 3 s.
    const dead = cutSheet(s).filter((f) => f.kind === 'dead');
    expect(dead.map((f) => f.label)).toEqual([`dead ${sc.longestDeadAirSec.toFixed(1)} s`]);
  });
});

describe('calibration on the emulator night (2026-10-12)', () => {
  const setup = line(1, 4.5, 'I rent a flat in Bengaluru, which means I have a landlord, and he has a plan.', {
    id: 1,
  });

  it('a specific detail alone never lifts a line: a setup with a beat stays a setup', () => {
    const l = line(5, 9, 'Last November he promised he would fix the water heater by winter.', { id: 2 });
    const hits = contentHits(l, { act: 'standup', bit: 1, earlier: [{ line: setup, bit: 1 }] });
    expect(hits.map((h) => h.feature)).toEqual(['specific']);
    const timing = landingScore(l, setup, 0.6, 'standup', 'service');
    const withContent = landingScore(l, setup, 0.6, 'standup', 'service', { hits });
    expect(withContent).toEqual(timing);
    expect(timing.score).toBeLessThan(0.55);
    // With a punch pattern alongside, the detail counts too.
    const callbackHits = contentHits(line(40, 42, 'my landlord moved to 2016', { id: 9 }), {
      act: 'standup',
      bit: 3,
      earlier: [{ line: setup, bit: 1 }],
    });
    expect(callbackHits.map((h) => h.feature)).toEqual(['callback', 'specific']);
  });

  it('"the punch turns a word" needs a punch-shaped line', () => {
    const s1 = line(1, 3.5, 'he said he would fix the heating by winter', { id: 1 });
    const short = line(4, 5.2, 'he did not say which winter', { id: 2 });
    const long = line(4, 9, 'and so then I waited and waited all through the long cold dark winter', { id: 3 });
    const ctxOf = () => ({ act: 'standup' as ActId, bit: 1, earlier: [{ line: s1, bit: 1 }] });
    expect(contentHits(short, ctxOf()).map((h) => h.feature)).toContain('wordplay');
    expect(contentHits(long, ctxOf()).map((h) => h.feature)).not.toContain('wordplay');
  });

  it('poetry: a line delivered flat with a beat does not snap at the theatre; a rhyme with weight does', () => {
    const a = line(1, 3.5, 'the monsoon comes to mumbai late at night', { id: 1 });
    const flat = line(5, 7.5, 'we do not sleep we are too busy listening', { id: 2 });
    const strong = line(5, 7.5, 'and every window keeps a square of light', { id: 3, endLevel: 0.26 });
    const ctxOf = () => ({ act: 'poetry' as ActId, bit: 1, earlier: [{ line: a, bit: 1 }] });
    const theatre = 0.66;
    const flatScore = landingScore(flat, a, 1.2, 'poetry', 'service', { hits: contentHits(flat, ctxOf()), judge: 0.8 });
    expect(flatScore.score).toBeLessThan(0.55);
    const strongScore = landingScore(strong, a, 1.2, 'poetry', 'service', {
      hits: contentHits(strong, ctxOf()),
      judge: 0.9,
    });
    expect(strongScore.score).toBeGreaterThanOrEqual(theatre);
  });
});

describe('the judge deadline on the TV clock', () => {
  it('gives the judge time after the line reaches the TV, within a hard cap', () => {
    const l = line(1, 2.5, 'my dentist is a vampire', { id: 1 });
    // The TV's clock is 0.5 s ahead of the phone's when the line arrives (skew plus the phone's hangover).
    let s = apply(createSetState(config('standup', 'club', 'local', true)), { type: 'start', startedAt: 0 });
    s = apply(s, { type: 'voice', at: 1, speaking: true, level: 0.2 }, { type: 'tick', now: 3.3 });
    s = apply(s, { type: 'voice', at: 2.5, speaking: false, level: 0 }, { type: 'line', line: l });
    expect(s.pending[0].deadline).toBeCloseTo(3.3 + JUDGE_ANSWER_SEC, 9);
    expect(judgeRequests(s).map((r) => r.lineId)).toEqual([1]);
    // An answer 0.5 s after arrival is in time, though it is 1.3 s after the line by the phone's clock.
    s = apply(s, { type: 'tick', now: 3.8 }, { type: 'judge', verdict: verdict(1, 0.95) });
    expect(s.judged[0]).toMatchObject({ judge: 0.95 });
    // However late the line arrives, the room never waits more than JUDGE_MAX_WAIT_SEC after it.
    let late = apply(createSetState(config('standup', 'club', 'local', true)), { type: 'start', startedAt: 0 });
    late = apply(late, { type: 'voice', at: 1, speaking: true, level: 0.2 }, { type: 'tick', now: 3.7 });
    late = apply(late, { type: 'voice', at: 2.5, speaking: false, level: 0 }, { type: 'line', line: l });
    expect(late.pending[0].deadline).toBeCloseTo(2.5 + JUDGE_MAX_WAIT_SEC, 9);
  });
});
