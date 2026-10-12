import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createSetState,
  reduceSet,
  scorecard,
  type ActId,
  type SetAction,
  type SetState,
  type VenueId,
} from '@strumble/crowd';
import {
  fillersIn,
  lineEvent,
  parseScript,
  rng,
  timeline,
  type ScriptedPhrase,
  type WordsScript,
} from '../src/fake-script';

const demo = (name: string): WordsScript =>
  parseScript(readFileSync(resolve(__dirname, '..', 'scripts', `${name}-demo.json`), 'utf8'));

/**
 * The phone's messages for a script, in time order, as `fake-phone.ts --words` sends them: voice on at t0; at t1 + 0.3
 * voice off and the line with its interim words; the final words 0.5 s later; plus the TV's ticks every 0.1 s.
 */
function play(script: WordsScript, act: ActId, venue: VenueId, seed = 7): { s: SetState; phrases: ScriptedPhrase[] } {
  const phrases = timeline(script, rng(seed), 299);
  const events: { at: number; order: number; action: SetAction }[] = [];
  phrases.forEach((p, i) => {
    const line = lineEvent(p, i + 1, phrases[i - 1]);
    events.push({ at: p.t0, order: 0, action: { type: 'voice', at: p.t0, speaking: true, level: p.level } });
    events.push({ at: p.t1 + 0.3, order: 1, action: { type: 'voice', at: p.t1, speaking: false, level: 0 } });
    events.push({ at: p.t1 + 0.3, order: 2, action: { type: 'line', line } });
    events.push({
      at: p.t1 + 0.8,
      order: 3,
      action: { type: 'words-for', lineId: line.id, words: line.words ?? 0, text: line.text ?? '', fillers: [] },
    });
  });
  const end = phrases[phrases.length - 1].t1 + 4;
  for (let t = 0.1; t < end; t = Math.round((t + 0.1) * 10) / 10) {
    events.push({ at: t, order: 4, action: { type: 'tick', now: t } });
  }
  events.sort((a, b) => a.at - b.at || a.order - b.order);
  let s = createSetState({
    setId: 'demo',
    act,
    venue,
    persona: 'warm',
    durationSec: 300,
    performer: 'Aman',
    words: 'service',
  });
  s = reduceSet(s, { type: 'start', startedAt: 0 });
  for (const e of events) s = reduceSet(s, e.action);
  return { s: reduceSet(s, { type: 'finish', now: end }), phrases };
}

describe('words scripts', () => {
  it('reads JSON and the text format alike, and refuses an empty script', () => {
    const json = parseScript(
      JSON.stringify({
        act: 'standup',
        bits: [
          {
            name: 'a',
            lines: [
              { text: 'one two', role: 'setup' },
              { text: 'three', role: 'punch' },
            ],
          },
          { name: 'b', dead: true, lines: [{ text: 'four' }] },
        ],
      }),
    );
    const text = parseScript('# act: standup\n## a\nsetup: one two\npunch: three\n\n## b (dead)\nfour\n');
    expect(text).toEqual(json);
    expect(() => parseScript('{"bits": []}')).toThrow(/needs bits/);
    expect(() => parseScript('{"bits": [{"lines": [{"text": "x", "role": "zinger"}]}]}')).toThrow(/unknown role/);
  });

  it('times lines by their role: held beats after punchlines, none in a dead bit, setups longer than punches', () => {
    const phrases = timeline(demo('standup'), rng(7));
    const gapAfter = (i: number) => phrases[i + 1].t0 - phrases[i].t1;
    for (let i = 0; i + 1 < phrases.length; i++) {
      expect(phrases[i + 1].t0).toBeGreaterThan(phrases[i].t1);
      const p = phrases[i];
      if (phrases[i + 1].bit !== p.bit) continue;
      if (p.role === 'punch') expect(gapAfter(i)).toBeGreaterThanOrEqual(1.1);
      // Setups and dead lines run on: over the phone's 0.3 s hangover, under the 0.45 s beat.
      if (p.role === 'setup' || p.bit === 4 || p.bit === 5) {
        expect(gapAfter(i)).toBeGreaterThan(0.3);
        expect(gapAfter(i)).toBeLessThan(0.45);
      }
      if (p.role === 'trail') expect(p.t1 - p.t0).toBeLessThan(0.4); // too short to judge
    }
    const len = (role: string) => {
      const xs = phrases.filter((p) => p.role === role).map((p) => p.t1 - p.t0);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(len('setup')).toBeGreaterThan(len('punch'));
    expect(phrases.filter((p) => p.role === 'punch').every((p) => p.endLevel > p.level)).toBe(true);
    // About four minutes, within a five-minute slot; and the same seed gives the same set.
    const last = phrases[phrases.length - 1].t1;
    expect(last).toBeGreaterThan(210);
    expect(last).toBeLessThan(270);
    expect(timeline(demo('standup'), rng(7))).toEqual(phrases);
    expect(timeline(demo('standup'), rng(7), 60).every((p) => p.t1 <= 60)).toBe(true);
  });

  it("sends each line's words as the recogniser's interim guess, with the phone's filler count", () => {
    const phrases = timeline(demo('standup'), rng(7));
    const first = lineEvent(phrases[0], 1, undefined);
    expect(first).toMatchObject({ id: 1, interim: true, text: phrases[0].text, words: 17, fillers: [] });
    expect(first.pauseBefore).toBe(phrases[0].t0);
    expect(fillersIn('Um, what else, okay, traffic here is bad, right.')).toEqual(['um', 'okay', 'right']);
    expect(fillersIn('So that is traffic, you know, like')).toEqual(['so', 'you know', 'like']);
  });

  it('the stand-up demo plays to the engine with callbacks, wordplay, a list of three and a heckle at the club', () => {
    const { s, phrases } = play(demo('standup'), 'standup', 'club');
    const sc = scorecard(s);
    expect(sc.wpm).not.toBeNull();
    expect(sc.content?.features.callback).toBeGreaterThanOrEqual(2);
    expect(sc.content?.features.wordplay).toBeGreaterThanOrEqual(2);
    expect(sc.content?.features.triad).toBeGreaterThanOrEqual(2);
    const laughs = s.reactions.filter((r) => r.kind === 'laugh');
    expect(laughs.length).toBeGreaterThanOrEqual(6);
    expect(laughs.some((r) => (r.features ?? []).indexOf('callback') >= 0)).toBe(true);
    // The dead bits get nothing, and two in a row bring the club's heckle.
    const deadIds = phrases.map((p, i) => (p.bit === 4 || p.bit === 5 ? i + 1 : 0)).filter(Boolean);
    expect(s.reactions.some((r) => r.lineId !== undefined && deadIds.indexOf(r.lineId) >= 0)).toBe(false);
    expect(s.reactions.some((r) => r.kind === 'heckle')).toBe(true);
    // Setups and the flat line never draw a laugh (the night's emulator run gave 7 of 22 laughs to setups).
    const reacted = new Set(s.reactions.filter((r) => r.kind === 'laugh').map((r) => r.lineId));
    phrases.forEach((p, i) => {
      if (p.role === 'setup' || p.role === 'flat') expect(reacted.has(i + 1), `${p.role}: ${p.text}`).toBe(false);
    });
    const flatId = phrases.findIndex((p) => p.role === 'flat') + 1;
    expect(s.judged.find((j) => j.lineId === flatId)?.landed).toBe(false);
  });

  it('the poetry demo snaps for its rhymes, and the speech demo applauds its triad, contrast and call', () => {
    // At the theatre (as on the emulator night): the lines delivered with weight snap, the flat one does not.
    const theatre = play(demo('poetry'), 'poetry', 'theatre');
    const snapped = new Set(theatre.s.reactions.filter((r) => r.kind === 'snap').map((r) => r.lineId));
    theatre.phrases.forEach((p, i) => {
      if (p.role === 'flat') expect(snapped.has(i + 1), p.text).toBe(false);
      if (p.role === 'strong') expect(snapped.has(i + 1), p.text).toBe(true);
    });
    expect(snapped.size).toBeLessThan(theatre.phrases.length);
    const poem = play(demo('poetry'), 'poetry', 'openmic').s;
    const pc = scorecard(poem).content;
    expect(pc?.rhymedEnds?.rhymed).toBeGreaterThanOrEqual(5);
    expect(pc?.features.alliteration).toBeGreaterThanOrEqual(1);
    expect(pc?.features.volta).toBeGreaterThanOrEqual(1);
    expect(poem.reactions.filter((r) => r.kind === 'snap').length).toBeGreaterThanOrEqual(4);
    const talk = play(demo('speech'), 'speech', 'openmic').s;
    const tc = scorecard(talk).content;
    for (const f of ['triad', 'contrast', 'callToAction', 'quotable', 'question'] as const) {
      expect(tc?.features[f], f).toBeGreaterThanOrEqual(1);
    }
    expect(talk.reactions.filter((r) => r.kind === 'applause').length).toBeGreaterThanOrEqual(3);
  });
});
