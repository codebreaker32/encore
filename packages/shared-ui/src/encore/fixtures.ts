/**
 * A plausible finished club set and six past records, for static renders and the web demo (`?demo=club`, `?demo=arena`).
 * The set is expressed as the phone's own messages (voice on/off, lines, pitch, finished) so the real engine produces
 * every reaction, cut and number: nothing on screen is invented, the input is. There are no MC words here: every MC line
 * on a demo screen is asked of the MC service live.
 */
import {
  createSetState,
  reduceSet,
  setRecord,
  type LineEvent,
  type PitchSample,
  type Scorecard,
  type SetConfig,
  type SetRecord,
  type SetState,
} from '@strumble/crowd';
import { replay, type TimedAction } from './demo';

export type { TimedAction } from './demo';

export const FIXTURE_CLUB: SetConfig = {
  setId: 'fixture-club',
  act: 'standup',
  venue: 'club',
  persona: 'sarcastic',
  durationSec: 300,
  performer: 'Aman',
  words: 'local',
};

export const FIXTURE_ARENA: SetConfig = {
  setId: 'fixture-arena',
  act: 'singing',
  venue: 'arena',
  persona: 'warm',
  durationSec: 210,
  performer: 'Aman',
  words: 'off',
};

/** [t0, t1, text, flags]: e = louder at the end, b = said "basically", l = said "like". */
type LineSpec = [number, number, string, string?];

const CLUB_LINES: LineSpec[] = [
  // Bit 1: the flat
  [2.6, 8.8, "Good evening. I've just moved flats, which means I now own a drill and absolutely no idea what to do with it."],
  [9.1, 15.4, 'My landlord calls himself a property enthusiast, which is like a dentist calling himself a tooth fan.'],
  [15.7, 22.0, "He's basically enthusiastic about collecting the rent, and a lot less enthusiastic about the boiler.", 'b'],
  [22.8, 29.6, "So I rang him about the boiler, and he said, and I am quoting him, 'have you tried being warmer?'"],
  [29.9, 32.8, "I said I had. He said 'and?'"],
  [33.1, 39.6, "I said 'and now I'm a warm man standing in a cold shower, which is the worst kind of man.'", 'e'],
  // Bit 2: the flatmate and the egg
  [42.4, 48.9, "I've got a new flatmate too. Found him online, which is how you find the best people and all of the worst ones."],
  [49.2, 56.0, "His profile said 'tidy, quiet, like, respects boundaries', and two of those were true, which is a good ratio for the internet.", 'l'],
  [56.3, 63.1, "He respects boundaries. He has basically set up several. There's a shelf in the fridge I'm not allowed to look at.", 'b'],
  [64.0, 70.6, "I looked at it, obviously, I'm not made of stone. It was one egg. A single egg, guarded like a relic."],
  [70.9, 73.4, "I don't know what the egg did. I don't know what the egg knows.", 'e'],
  [75.8, 82.6, "The quiet part is also true. He's so quiet I've started narrating my own day so the flat has some sound in it."],
  [82.9, 88.2, "'Aman is making toast. Aman has burnt the toast. Aman is eating it anyway, for the egg's sake.'", 'e'],
  // Bit 3: the bus stop, at pace, with fillers: it dies
  [91.0, 97.6, 'Right, so, basically the thing about commuting is that nobody chooses it, it just happens to you, like weather.', 'b'],
  [97.9, 104.8, 'And the bus app, the bus app tells you the bus is two minutes away for, like, eleven minutes, which is not how minutes work.', 'l'],
  [105.1, 111.5, "So I'm standing there, and there's a man next to me who has clearly been there since the app was invented."],
  [111.8, 117.4, "And he looks at me and he goes 'it says two minutes', and I go 'yeah', and that's it, that is the whole relationship, that's all of it."],
  // Bit 4: still the bus stop, still dying; the room heckles after two dead bits
  [121.5, 128.0, 'Okay. Okay, so, the man and I are now friends, in the sense that we have never spoken again.'],
  [128.3, 134.6, "I see him every morning and we do the nod. The nod says 'still two minutes'. The nod has said that for a year."],
  [134.9, 139.8, "And then one day he isn't there, and I'm, like, worried? About a man whose name I don't know?", 'l'],
  [140.1, 143.0, "That's a bus stop. That is what a bus stop does to you."],
  [143.3, 151.4, 'Anyway, the bus came, eventually, and we got on it, and he sat at the back, and I sat at the front, and that was that.'],
  // Bit 5: the voice notes: it comes back
  // After the heckle the performer takes it and pauses, as anyone would, before the next bit.
  [156.6, 159.8, 'Let me tell you about my mother, who has discovered voice notes.'],
  [160.1, 166.4, 'She sends them at four in the morning, and they start with my full name, which is never a good sign in any medium.'],
  [167.4, 174.0, "The last one was six minutes long. The first five were her finding her glasses so she could see the phone she was already talking into."],
  [174.3, 176.9, 'The sixth minute was the dog.', 'e'],
  [179.4, 185.9, "And I sent one back, and I did the thing, you know, where you listen to your own voice and immediately want to move country."],
  [186.2, 193.1, "So now we basically text. Which she does with one finger, and every message arrives like a ransom note from a kidnapper with time on his hands.", 'b'],
  [193.4, 196.4, "She signs them. 'Love, Mum.' In case it was a different mum.", 'e'],
  // Bit 6: the closer
  [199.1, 205.7, "I'm going to end on the drill, because I did eventually use it. I put up a shelf. One shelf. It took a weekend."],
  [206.0, 212.5, "And the flatmate came in, looked at it, looked at me, and said 'is that level?', which is a question, but it's also an accusation."],
  [212.8, 219.3, "And I said 'it's level enough', which is what my whole life is, if I'm honest with you. It's level enough."],
  [219.6, 225.5, "So I put the egg on it. The relic. The shelf is for the egg now."],
  [227.9, 234.5, "He hasn't said anything. He doesn't need to. The nod says it all, and the nod says 'still two minutes'."],
  [234.8, 241.4, "That's the thing about a shelf. You put it up and then you have to live underneath it, and so does everybody else."],
  [241.7, 248.3, "My landlord came round, by the way, to look at the boiler. He looked at the shelf instead. He said it added value."],
  [248.6, 255.0, 'I said the boiler would add value, and heat, and he said heat was a lifestyle choice, and he left.'],
  [255.3, 261.8, "So I'm warm, I'm level enough, I have an egg, and the bus is two minutes away. That's the whole set, really."],
  [262.1, 268.6, "I've been asked to tell you that this venue also does not have a working boiler, and that the heat is a lifestyle choice."],
  [268.9, 275.4, "I'm going to go home now and stand in the cold shower, like a warm man does, and think about all of you."],
  [275.7, 282.0, "You've been a lovely room. The egg says hello. The nod says what it always says."],
  [282.3, 287.3, "Two minutes. Good night.", 'e'],
];

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Phone messages for a list of lines: voice on at t0; voice off and the line 300 ms after t1. */
export function lineActions(specs: LineSpec[], level = 0.5): TimedAction[] {
  const out: TimedAction[] = [];
  specs.forEach((spec, i) => {
    const [t0, t1, text, flags = ''] = spec;
    const emph = flags.indexOf('e') >= 0;
    const fillers: string[] = [];
    if (flags.indexOf('b') >= 0) fillers.push('basically');
    if (flags.indexOf('l') >= 0) fillers.push('like');
    const prev = i > 0 ? specs[i - 1] : undefined;
    const line: LineEvent = {
      id: i + 1,
      t0,
      t1,
      level,
      endLevel: emph ? level * 1.25 : level * 0.95,
      peakLevel: emph ? level * 1.4 : level * 1.15,
      pauseBefore: prev ? t0 - prev[1] : t0,
      words: countWords(text),
      text,
      fillers,
    };
    // The phone's VAD needs ~300 ms of silence before it knows the voice stopped, so `voice off` (stamped t1) and the
    // line itself both reach the TV about 300 ms after the line ends.
    const arrives = round1(t1 + 0.3); // rounded so a following line at the same instant sorts after these
    out.push({ at: t0, action: { type: 'voice', at: t0, speaking: true, level } });
    out.push({ at: arrives, action: { type: 'voice', at: t1, speaking: false, level: 0 } });
    out.push({ at: arrives, action: { type: 'line', line } });
  });
  return out;
}

export const CLUB_END_SEC = 292;

export function clubActions(): TimedAction[] {
  const actions = lineActions(CLUB_LINES);
  actions.push({ at: CLUB_END_SEC, action: { type: 'finish', now: CLUB_END_SEC } });
  return sortByTime(actions);
}

/** A sung melody at 10 Hz: phrases of held notes with gaps; every third phrase wobbles, every fifth is too unclear to judge. */
export function arenaActions(): TimedAction[] {
  const melody = [67, 69, 71, 72, 71, 69, 67, 64];
  const samples: PitchSample[] = [];
  let t = 2.0;
  let phrase = 0;
  const end = 210;
  while (t < end - 3) {
    const note = melody[phrase % melody.length];
    const wobble = phrase % 3 === 2;
    const unsure = phrase % 5 === 4;
    const hold = 1.8 + (phrase % 4) * 0.3;
    for (let k = 0; k * 0.1 < hold; k++) {
      const u = Math.sin(k * 1.7) * 0.5 + Math.sin(k * 0.6) * 0.5; // deterministic jitter in -1..1
      const midi = note + (wobble ? 0.45 * Math.sin(k * 0.9) : 0.08 * u);
      samples.push({ t: round1(t + k * 0.1), midi, clarity: unsure ? 0.5 : 0.95, level: 0.4 });
    }
    t += hold;
    for (let k = 0; k * 0.1 < 0.5; k++) {
      samples.push({ t: round1(t + k * 0.1), midi: null, clarity: 0.1, level: 0.05 });
    }
    t += 0.5;
    phrase++;
  }
  const out: TimedAction[] = [];
  for (let i = 0; i < samples.length; i += 4) {
    const batch = samples.slice(i, i + 4);
    out.push({ at: batch[batch.length - 1].t, action: { type: 'pitch', samples: batch } });
  }
  out.push({ at: end, action: { type: 'finish', now: end } });
  return sortByTime(out);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function sortByTime(actions: TimedAction[]): TimedAction[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.at - y.a.at || x.i - y.i)
    .map((x) => x.a);
}

/** Run a set through the engine from t = 0 with the TV ticking every 100 ms between the phone's messages. */
export function playSet(config: SetConfig, actions: TimedAction[], startedAt = 0): SetState {
  return replay(reduceSet(createSetState(config), { type: 'start', startedAt }), actions);
}

function sc(partial: Partial<Scorecard> & Pick<Scorecard, 'act' | 'venue' | 'durationSec' | 'landed' | 'candidates'>): Scorecard {
  const perMin = Math.round((partial.landed * 600) / partial.durationSec) / 10;
  return {
    landedPerMin: perMin,
    roomReactions: partial.landed,
    longestDeadAirSec: 0,
    longestDeadAirAt: null,
    wpm: null,
    peakWpm: null,
    fillers: null,
    inTunePct: null,
    longestHoldSec: null,
    unsure: 0,
    ...partial,
  };
}

/** Six earlier sets, oldest first: the MC's memory and the green room's ledger. */
export const FIXTURE_RECORDS: SetRecord[] = [
  {
    setId: 'fx-1',
    endedAt: '2026-10-05T20:12:00+05:30',
    act: 'standup',
    venue: 'openmic',
    persona: 'sarcastic',
    performer: 'Aman',
    scorecard: sc({ act: 'standup', venue: 'openmic', durationSec: 272, landed: 4, candidates: 11, roomReactions: 6, longestDeadAirSec: 6.0, longestDeadAirAt: 131, wpm: 181, peakWpm: 204, fillers: { count: 9, top: [{ word: 'basically', n: 5 }, { word: 'like', n: 4 }] } }),
    summary: '4 of 11 lines landed in 4:32; the room gave 6 laughs; went quiet for 6.0 s at 2:11; 181 wpm (peak 204); 9 fillers',
  },
  {
    setId: 'fx-2',
    endedAt: '2026-10-06T20:40:00+05:30',
    act: 'standup',
    venue: 'openmic',
    persona: 'sarcastic',
    performer: 'Aman',
    scorecard: sc({ act: 'standup', venue: 'openmic', durationSec: 288, landed: 6, candidates: 12, roomReactions: 8, longestDeadAirSec: 3.4, longestDeadAirAt: 190, wpm: 176, peakWpm: 198, fillers: { count: 11, top: [{ word: 'like', n: 6 }, { word: 'basically', n: 3 }, { word: 'um', n: 2 }] } }),
    summary: '6 of 12 lines landed in 4:48; the room gave 8 laughs; went quiet for 3.4 s at 3:10; 176 wpm (peak 198); 11 fillers',
  },
  {
    setId: 'fx-3',
    endedAt: '2026-10-07T21:05:00+05:30',
    act: 'singing',
    venue: 'club',
    persona: 'warm',
    performer: 'Aman',
    scorecard: sc({ act: 'singing', venue: 'club', durationSec: 184, landed: 9, candidates: 14, roomReactions: 7, longestDeadAirSec: 2.2, longestDeadAirAt: 60, inTunePct: 71, longestHoldSec: 2.9 }),
    summary: '71% in tune; longest hold 2.9 s; 9 of 14 phrases held in 3:04',
  },
  {
    setId: 'fx-4',
    endedAt: '2026-10-08T20:30:00+05:30',
    act: 'standup',
    venue: 'club',
    persona: 'sarcastic',
    performer: 'Aman',
    scorecard: sc({ act: 'standup', venue: 'club', durationSec: 295, landed: 8, candidates: 13, roomReactions: 7, longestDeadAirSec: 3.1, longestDeadAirAt: 142, wpm: 169, peakWpm: 190, fillers: { count: 6, top: [{ word: 'basically', n: 4 }, { word: 'like', n: 2 }] } }),
    summary: '8 of 13 lines landed in 4:55; the room gave 7 laughs; went quiet for 3.1 s at 2:22; 169 wpm (peak 190); 6 fillers',
  },
  {
    setId: 'fx-5',
    endedAt: '2026-10-09T20:18:00+05:30',
    act: 'standup',
    venue: 'club',
    persona: 'sarcastic',
    performer: 'Aman',
    scorecard: sc({ act: 'standup', venue: 'club', durationSec: 292, landed: 7, candidates: 12, roomReactions: 6, longestDeadAirSec: 4.1, longestDeadAirAt: 117, wpm: 172, peakWpm: 196, fillers: { count: 7, top: [{ word: 'basically', n: 4 }, { word: 'like', n: 3 }] } }),
    summary: '7 of 12 lines landed in 4:52; the room gave 6 laughs; went quiet for 4.1 s at 1:57; 172 wpm (peak 196); 7 fillers',
  },
  {
    setId: 'fx-6',
    endedAt: '2026-10-10T19:50:00+05:30',
    act: 'poetry',
    venue: 'theatre',
    persona: 'strict',
    performer: 'Aman',
    scorecard: sc({ act: 'poetry', venue: 'theatre', durationSec: 171, landed: 5, candidates: 9, roomReactions: 3, longestDeadAirSec: 2.4, longestDeadAirAt: 88, wpm: 118, peakWpm: 140, fillers: { count: 1, top: [{ word: 'um', n: 1 }] } }),
    summary: '5 of 9 lines landed in 2:51; the room gave 3 snaps; 118 wpm (peak 140); 1 filler',
  },
];

let clubState: SetState | undefined;
/** The finished club set, computed once on first use. */
export function fixtureClubState(): SetState {
  if (!clubState) clubState = playSet(FIXTURE_CLUB, clubActions());
  return clubState;
}

export function fixtureClubRecord(): SetRecord {
  return setRecord(fixtureClubState(), '2026-10-10T21:22:00+05:30');
}

