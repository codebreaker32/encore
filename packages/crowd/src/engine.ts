/**
 * The crowd engine: one set as a pure reducer. Phone events (voice, lines, late words, pitch)
 * and the TV's ticks go in; the room's reactions, the director's shots, the bits and the
 * judgements come out as state. Nothing here reads a clock or rolls a die: the same actions
 * always produce the same set.
 *
 * Honesty rules that live here: every reaction carries a measured `why`; `landed` is counted at
 * HOUSE_STANDARD at every venue (the venue only changes what the room gives); unsure lines are
 * never candidates and never count against the performer.
 *
 * The engine writes no MC words. Where the MC may speak it records a `SetMoment` with measured
 * facts; the TV asks the MC service and hands the words back (`mc-line`) or reports that none
 * came (`mc-silent`). Words that miss their moment's window are not shown.
 */
import {
  CONTENT_CAP,
  CONTENT_WEIGHTS,
  contentHits,
  contentWeight,
  countingHits,
  endRhymes,
  judgeBonus,
  phraseHits,
  rangeSemitones,
  type ContentContext,
  type ContentHit,
} from './content';
import { keyWord, mmss, ordinal } from './format';
import { getPack, getVenue, HOUSE_STANDARD } from './packs';

export { mmss, ordinal } from './format';
import type {
  ActId,
  ActPack,
  ContentFeature,
  ContentMeasures,
  JudgeAct,
  JudgeRequest,
  JudgeVerdict,
  LineEvent,
  McMoment,
  MomentFacts,
  PitchSample,
  PlateId,
  Reaction,
  RecordedReaction,
  Scorecard,
  SetConfig,
  SetMoment,
  SetRecord,
  Venue,
  WordsMode,
} from './types';

// ---------------------------------------------------------------------------------------------
// The numbers, as named in the spec ("The crowd engine").

/**
 * Scores are sums of weights and durations are differences of phone timestamps: a line sitting
 * exactly on a threshold (0.6 s, 0.45 s, 0.55) must not lose to floating point.
 */
const EPS = 1e-9;

/** Lines with a mean level under this are `unsure` (too quiet). RMS, 0..1. */
export const NOISE_GATE = 0.02;
/** Lines shorter than this are `unsure` (too short). */
export const MIN_LINE_SEC = 0.4;
/** The beat is known this long after a line ends, unless voice resumes first. */
export const BEAT_DECIDE_SEC = 0.5;
/** The beat: a candidate earns it by holding at least this much silence (voice sooner cancels the candidate). */
export const BEAT_MIN_SEC = 0.45;
/** A pause this long is a fully held beat on the ledger; the live score is binary and no longer ramps on it. */
export const BEAT_SAT_SEC = 1.2;
/**
 * The room's latency carries the verdict: a reaction lands REACTION_LATENCY_MIN after the line for a
 * line at full strength, plus up to REACTION_LATENCY_SPREAD for one that barely cleared the threshold.
 */
export const REACTION_LATENCY_MIN = 0.4;
export const REACTION_LATENCY_SPREAD = 0.5;
export const SHAPE_MIN_SEC = 0.6;
export const SHAPE_MAX_SEC = 6;
export const SHAPE_MIN_WORDS = 2;
export const SHAPE_MAX_WORDS = 25;
/** setupPunch: the previous line was at least this many times longer than this one ... */
export const SETUP_RATIO = 1.3;
/** ... and this one is a punch-sized line, no longer than this. */
export const PUNCH_MAX_SEC = 2.5;
/** Retired from the score (a line within 2.5 s of a 4 s line fired on nearly every flowing line); kept for callers. */
export const PUNCH_AFTER_SEC = 2.5;
export const SETUP_MIN_SEC = 4;
/** emphasis: the last 400 ms are at least this much louder than the line's mean ... */
export const EMPHASIS_RATIO = 1.1;
/** ... or the end window carries the peak (LineEvent has no peak time, so "peak in the last 40 %" is read as this). */
export const PEAK_IN_TAIL_RATIO = 0.8;
/** The room needs this much breath between two positive reactions ... */
export const REACTION_BREATH_SEC = 2;
/** ... except a tag: a line under TAG_MAX_SEC that ends within TAG_WINDOW_SEC of a reaction, which gets TAG_BONUS more strength. */
export const TAG_MAX_SEC = 2;
export const TAG_WINDOW_SEC = 3;
export const TAG_BONUS = 0.15;
/** A pause this long between lines closes a bit. */
export const BIT_PAUSE_SEC = 2;
export const HECKLE_COOLDOWN_SEC = 30;
export const HECKLE_CARD_SEC = 2;
export const BETWEEN_BITS_CARD_SEC = 1;
export const BETWEEN_BITS_COOLDOWN_SEC = 45;
export const INTRO_CARD_SEC = 1.2;
/** Live-angle cadence: a long wide hard-cuts to the venue's other wide plate every WIDE_HOLD_SEC ... */
export const WIDE_HOLD_SEC = 8;
/** ... but never this close before a pending candidate's decision (a reaction may be about to cut) and never while a card is queued. */
export const ANGLE_GUARD_SEC = 1.5;
/** The MC's words for a between-bits or heckle moment are shown only if they arrive within this long of the moment. */
export const MC_LINE_WINDOW_SEC = 4;
/** The intro card is shown only if its words arrive this soon after the start, and before the performer's first voice. */
export const INTRO_WINDOW_SEC = 4;
/** Defensive cap on a card's text (the service already limits a line to 120 characters); cut on a word boundary. */
export const MC_TEXT_MAX = 140;
/**
 * Retired: dead air is now one definition everywhere (`silences`, past the venue's `patienceSec`); the cut sheet's dead
 * frames, the murmur and the record's summary all use the room's own patience. Kept for callers.
 */
export const DEAD_FRAME_SEC = 3;
/** The finale's nominal width on the cut sheet (it starts at the end of the set). */
export const FINALE_FRAME_SEC = 2;
export const PEAK_WPM_WINDOW_SEC = 20;
/** Singing: a phrase is a voiced run at least this long ... */
export const PHRASE_MIN_SEC = 1.5;
/** ... that ends after this much unvoiced time. */
export const PHRASE_GAP_SEC = 0.3;
export const CLARITY_GATE = 0.8;
export const IN_TUNE_CENTS = 25;
/**
 * Content judging: with `config.judge` and words on, the room waits for the line's words and the MC model's estimate
 * until this long after the line ends (it decides at the beat, BEAT_DECIDE_SEC, when both are already in). Past it,
 * the room uses timing and the patterns it has, and the why says the model was late.
 */
export const JUDGE_DEADLINE_SEC = 0.9;
/**
 * The deadline is also anchored to when the TV received the line. `line.t1` is on the phone's audio clock and `now` on
 * the TV's relay-clock estimate, and the line itself arrives about 0.3 s after it ends (the phone's voice hangover), so
 * a little clock skew or delivery lag used to leave the judge almost no time (7 in time, 23 late on the Google TV,
 * 2026-10-12, with the service answering within 250 ms). The room waits at least JUDGE_ANSWER_SEC after the line
 * arrives, and never longer than JUDGE_MAX_WAIT_SEC after the line ends.
 */
export const JUDGE_ANSWER_SEC = 0.6;
export const JUDGE_MAX_WAIT_SEC = 1.4;

export interface Weights {
  beat: number;
  shape: number;
  setupPunch: number;
  emphasis: number;
  clean: number;
}

/**
 * Per-act weights of the landing score. Singing never uses them (phrases are scored by hold).
 * Stand-up and speech are rebalanced from the spec's first numbers so that a flowing, clean line
 * with a beat but no structure and no emphasis (beat + shape + clean) stays under the house
 * standard: 0.50, not 0.60. Poetry was rebalanced the same way on 2026-10-12, after every line of a scripted poem
 * drew a snap on the Android TV emulator, the flat one too: a line delivered flat with a beat scores 0.50, and a snap
 * needs the line's weight at the end (emphasis) or what it says (a rhyme, a turn, the model's estimate).
 */
export const WEIGHTS: Record<ActId, Weights> = {
  standup: { beat: 0.3, shape: 0.1, setupPunch: 0.25, emphasis: 0.25, clean: 0.1 },
  poetry: { beat: 0.3, shape: 0.1, setupPunch: 0, emphasis: 0.5, clean: 0.1 },
  speech: { beat: 0.3, shape: 0.1, setupPunch: 0.05, emphasis: 0.45, clean: 0.1 },
  singing: { beat: 0.3, shape: 0.1, setupPunch: 0.25, emphasis: 0.25, clean: 0.1 },
};

// ---------------------------------------------------------------------------------------------
// State

export type ShotKind = 'wide' | 'reaction' | 'card' | 'finale';

export interface Shot {
  kind: ShotKind;
  plate: PlateId | null;
  from: number;
  /** null while the shot is open-ended (a wide, or the finale). */
  to: number | null;
  /** The director's words, top-left: "LAUGH · 0.8 s after your line · the room's third tonight". */
  caption?: string;
  reaction?: Reaction;
  /** The one line on a title card. */
  text?: string;
}

export interface Bit {
  index: number;
  from: number;
  to: number | null;
  lines: number;
  reactions: number;
}

/**
 * One judgement. Three states: a candidate (`candidate: true`, `score` set), a line that left no
 * beat (`candidate: false`, `score: null`, why "no beat") and an unsure line (`candidate: false`,
 * `score: null`, why "too quiet" or "too short"). In singing, `lineId` is the id of a phrase in
 * `SetState.phrases`.
 */
export interface Judged {
  lineId: number;
  /** Lines that ended with a beat are candidates; only they are scored. */
  candidate: boolean;
  score: number | null;
  why: string;
  landed: boolean;
  roomReacted: boolean;
  /** The measured silence after the line, once voice is back or the set has ended; null until then (or for phrases). */
  pauseAfter: number | null;
  /** The content features found when the room decided, strongest first (words on, or pitch for singing). */
  features?: ContentFeature[];
  /**
   * The MC model's estimate when the room decided: its score (0..1, an opinion of the words), or why there was none
   * (`late`: not in by JUDGE_DEADLINE_SEC; `unavailable`: the service could not answer). Absent when the judge is off.
   */
  judge?: number | 'late' | 'unavailable' | 'early';
}

/** Singing: a voiced run scored by how much of it sat within IN_TUNE_CENTS of a semitone. */
export interface Phrase {
  id: number;
  from: number;
  to: number;
  samples: number;
  inTune: number;
  /** inTune / samples. */
  hold: number;
}

export type SetPhase = 'armed' | 'live' | 'done';

/**
 * What became of a moment's words: `shown` on a card (or as the finale caption), `late` when they
 * missed the moment's window (or never came before it closed), `silent` when the MC could not answer.
 */
export type MomentOutcome = 'shown' | 'late' | 'silent';

/** The engine's own bookkeeping; the screens have no reason to read it. */
export interface Bookkeeping {
  /** When voice last started (for the voiced interval that is still open). */
  voiceStartedAt: number | null;
  /** The first voice of the set; dead air exists only after it (before, the room is waiting for the act). */
  firstVoiceAt: number | null;
  /** The `lastVoiceAt` for which the room has already murmured. */
  murmuredFor: number | null;
  /** When the room last heckled and when the last between-bits moment was recorded (the cooldowns). */
  lastHeckleAt: number | null;
  lastBetweenAt: number | null;
  wideCuts: number;
  reactionCuts: number;
  /** MC words that arrived for a moment and wait for the screen (a reaction shot, a card, the performer speaking). */
  waiting: { momentId: number; text: string }[];
  /** Reaction shots decided but not yet due (the room's latency), oldest first. */
  cuts: Shot[];
  /** The open singing phrase. */
  phrase: { from: number; lastVoicedAt: number; samples: number; inTune: number } | null;
}

export interface SetState {
  config: SetConfig;
  pack: ActPack;
  venue: Venue;
  phase: SetPhase;
  /** Relay-clock ms of t = 0, as the TV learned it; null before the set starts. */
  startedAt: number | null;
  /** Seconds since t = 0, as far as the engine has been told. */
  now: number;
  endsAt: number;
  lines: LineEvent[];
  pitch: PitchSample[];
  speaking: boolean;
  lastVoiceAt: number;
  reactions: Reaction[];
  /** Candidates waiting for their beat (`decideAt`) and, with content judging, for their words and estimate (`deadline`). */
  pending: { lineId: number; decideAt: number; deadline: number; waited?: boolean }[];
  judged: Judged[];
  bits: Bit[];
  deadBits: number;
  shot: Shot;
  /** Finished shots, oldest first; `shot` is the current one. */
  shots: Shot[];
  wordsMode: WordsMode;
  phrases: Phrase[];
  /** Where the MC may speak, with the measured facts at that moment; ids from 1. */
  moments: SetMoment[];
  /** What became of each moment's words, by moment id; a moment without an entry is still open. */
  momentOutcomes: Record<number, MomentOutcome>;
  /** The MC model's content estimates by line id, as they arrived (`unavailable` when the service could not answer). */
  verdicts: Record<number, JudgeVerdict | 'unavailable'>;
  book: Bookkeeping;
}

export type SetAction =
  | { type: 'start'; startedAt: number }
  | { type: 'voice'; at: number; speaking: boolean; level: number }
  | { type: 'line'; line: LineEvent }
  | { type: 'words-for'; lineId: number; words: number; text: string; fillers: string[] }
  | { type: 'pitch'; samples: PitchSample[] }
  | { type: 'words'; mode: WordsMode }
  | { type: 'tick'; now: number }
  | { type: 'finish'; now: number }
  /** The MC service's words for a moment, verbatim. */
  | { type: 'mc-line'; momentId: number; text: string }
  /** The MC service could not answer for a moment: nothing is shown. */
  | { type: 'mc-silent'; momentId: number }
  /** The MC model's content estimate for a line (`kind: judge`), verbatim. */
  | { type: 'judge'; verdict: JudgeVerdict }
  /** The judge could not answer for a line: the room decides on timing and patterns. */
  | { type: 'judge-none'; lineId: number };

export function createSetState(config: SetConfig): SetState {
  const pack = getPack(config.act);
  const venue = getVenue(config.act, config.venue);
  return {
    config,
    pack,
    venue,
    phase: 'armed',
    startedAt: null,
    now: 0,
    endsAt: config.durationSec,
    lines: [],
    pitch: [],
    speaking: false,
    lastVoiceAt: 0,
    reactions: [],
    pending: [],
    judged: [],
    bits: [],
    deadBits: 0,
    shot: { kind: 'wide', plate: venue.plates.wide[0] ?? null, from: 0, to: null },
    shots: [],
    wordsMode: config.words,
    phrases: [],
    moments: [],
    momentOutcomes: {},
    verdicts: {},
    book: {
      voiceStartedAt: null,
      firstVoiceAt: null,
      murmuredFor: null,
      lastHeckleAt: null,
      lastBetweenAt: null,
      wideCuts: 0,
      reactionCuts: 0,
      waiting: [],
      cuts: [],
      phrase: null,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Reducer

export function reduceSet(state: SetState, action: SetAction): SetState {
  switch (action.type) {
    case 'words':
      return { ...state, wordsMode: action.mode };

    case 'words-for':
      return settleContent(patchWords(state, action.lineId, action.words, action.text, action.fillers));

    case 'judge': {
      const v = action.verdict;
      if (!v || v.source !== 'ai' || !lineById(state, v.lineId) || typeof v.score !== 'number') return state;
      if (state.verdicts[v.lineId] !== undefined) return state;
      return settleContent({ ...state, verdicts: { ...state.verdicts, [v.lineId]: v } });
    }

    case 'judge-none':
      if (!lineById(state, action.lineId) || state.verdicts[action.lineId] !== undefined) return state;
      return settleContent({ ...state, verdicts: { ...state.verdicts, [action.lineId]: 'unavailable' } });

    case 'start': {
      if (state.phase !== 'armed') return state;
      // The set opens on the wide; an intro card appears only if the MC's words arrive in time.
      const { shot, book } = wideShot(state, 0);
      const live: SetState = {
        ...state,
        phase: 'live',
        startedAt: action.startedAt,
        now: 0,
        lastVoiceAt: 0,
        shot,
        shots: [],
        book,
      };
      return recordMoment(live, 'intro', {});
    }

    case 'mc-line':
      return onMcLine(state, action.momentId, action.text);

    case 'mc-silent':
      return onMcSilent(state, action.momentId);

    case 'tick':
      if (state.phase !== 'live') return state;
      return advance(state, action.now);

    case 'finish':
      if (state.phase !== 'live') return state;
      return finish(state, action.now);

    case 'voice':
      if (state.phase !== 'live') return state;
      return onVoice(advance(state, action.at), action.at, action.speaking);

    case 'line': {
      if (state.phase !== 'live') return state;
      // Everything due up to the moment the line began (dead air, bits); the line itself is voice.
      const s = advance(state, action.line.t0);
      return s.phase === 'live' ? onLine(s, action.line) : s;
    }

    case 'pitch':
      if (state.phase !== 'live') return state;
      return onPitch(state, action.samples);
  }
}

/** Move the clock to `now` (never backwards) and do everything that is due. */
function advance(state: SetState, now: number): SetState {
  if (state.phase !== 'live' || now <= state.now) return state;
  if (now >= state.endsAt) return finish(state, state.endsAt);
  let s: SetState = { ...state, now };
  s = expireShots(s);
  s = decideDue(s);
  s = releaseCuts(s, false);
  s = deliver(s);
  s = angleCut(s);
  s = closeIdleBit(s);
  s = murmur(s);
  return s;
}

function onVoice(state: SetState, at: number, speaking: boolean): SetState {
  if (state.phase !== 'live') return state;
  // A "voice off" stamped before the voice that is on now belongs to the segment before it (messages can cross): the
  // performer is still speaking, and the room must not hear a silence there.
  if (!speaking && state.speaking && state.book.voiceStartedAt !== null && at < state.book.voiceStartedAt) {
    return { ...state, lastVoiceAt: Math.max(state.lastVoiceAt, at) };
  }
  let s: SetState = { ...state, speaking, lastVoiceAt: Math.max(state.lastVoiceAt, at) };
  if (speaking) {
    s = { ...s, book: { ...s.book, voiceStartedAt: at, firstVoiceAt: firstVoice(s, at) } };
    s = recordPauses(s, at);
    // Voice back before the beat is known: the performer did not leave the beat.
    s = resolvePendingAtVoice(s, at);
  } else {
    s = { ...s, book: { ...s.book, voiceStartedAt: null } };
  }
  return s;
}

function onLine(state: SetState, line: LineEvent): SetState {
  if (state.phase !== 'live') return state;
  let s: SetState = {
    ...state,
    lines: [...state.lines, line],
    lastVoiceAt: Math.max(state.lastVoiceAt, line.t1),
    now: Math.min(Math.max(state.now, line.t1), state.endsAt),
    book: { ...state.book, firstVoiceAt: firstVoice(state, line.t0) },
  };
  s = recordPauses(s, line.t0);
  s = resolvePendingAtVoice(s, line.t0);
  s = openOrExtendBit(s, line);
  s = expireShots(s);
  if (s.config.act === 'singing') return s; // sung lines are not judged as lines; phrases are.
  const dur = line.t1 - line.t0;
  if (line.level < NOISE_GATE || dur + EPS < MIN_LINE_SEC) {
    const why = line.level < NOISE_GATE ? 'too quiet' : 'too short';
    return { ...s, judged: [...s.judged, notCandidate(line.id, why, null)] };
  }
  const decideAt = line.t1 + BEAT_DECIDE_SEC;
  // The phone reports a line ~300 ms after it ends, so voice may already have resumed.
  const resumedAt =
    s.speaking && s.book.voiceStartedAt !== null && s.book.voiceStartedAt > line.t1 ? s.book.voiceStartedAt : null;
  if (resumedAt !== null && resumedAt < decideAt) {
    return { ...s, judged: [...s.judged, notCandidate(line.id, 'no beat', resumedAt - line.t1)] };
  }
  if (resumedAt !== null) return decide(s, line.id, resumedAt - line.t1, true, false);
  const arrived = Math.max(state.now, line.t1);
  const deadline = Math.min(
    line.t1 + JUDGE_MAX_WAIT_SEC,
    Math.max(line.t1 + JUDGE_DEADLINE_SEC, arrived + JUDGE_ANSWER_SEC),
  );
  s = { ...s, pending: [...s.pending, { lineId: line.id, decideAt, deadline }] };
  s = decideDue(s);
  return releaseCuts(s, false);
}

/** Words or an estimate arrived: a candidate past its beat that was waiting only for them is decided now. */
function settleContent(state: SetState): SetState {
  if (state.phase !== 'live' || state.pending.length === 0) return state;
  return releaseCuts(decideDue(state), false);
}

/** Whether content judging applies to this set right now: words on and a spoken act. */
function judgingWords(state: SetState): boolean {
  return state.wordsMode !== 'off' && state.config.act !== 'singing';
}

/**
 * Whether the room is still waiting for a line's content: only with `config.judge` (the TV asks the model), until the
 * line has words and the model's estimate (or its "unavailable") is in.
 */
function contentPending(state: SetState, lineId: number): boolean {
  if (!state.config.judge || !judgingWords(state)) return false;
  const line = lineById(state, lineId);
  if (!line) return false;
  if (!line.text || !line.text.trim()) return true;
  return state.verdicts[lineId] === undefined;
}

/**
 * The model-judge requests the TV should send now: lines with words that are not unsure, have no estimate yet and can
 * still be decided with one (before JUDGE_DEADLINE_SEC). Asked as soon as a line has text, before its beat is known.
 * The TV sends each line once (it keys them by set and line id); empty unless `config.judge` and words are on.
 */
export function judgeRequests(state: SetState): JudgeRequest[] {
  if (!state.config.judge || !judgingWords(state) || state.phase !== 'live') return [];
  const out: JudgeRequest[] = [];
  const act = state.config.act as JudgeAct;
  for (let i = Math.max(0, state.lines.length - 4); i < state.lines.length; i++) {
    const line = state.lines[i];
    const text = line.text ? line.text.trim() : '';
    if (!text || state.verdicts[line.id] !== undefined) continue;
    if (line.level < NOISE_GATE || line.t1 - line.t0 + EPS < MIN_LINE_SEC) continue;
    const waiting = state.pending.find((c) => c.lineId === line.id);
    const until = waiting ? waiting.deadline : line.t1 + JUDGE_DEADLINE_SEC;
    if (state.now + EPS >= until || state.judged.some((j) => j.lineId === line.id)) continue;
    const context: string[] = [];
    for (let j = i - 1; j >= 0 && context.length < 3; j--) {
      const t = state.lines[j].text;
      if (t && t.trim()) context.unshift(t.trim());
    }
    out.push({ kind: 'judge', act, lineId: line.id, text, context });
  }
  return out;
}

/** Voice is back at `t`: settle anything still pending (the beat is now known, or was never left). */
function resolvePendingAtVoice(state: SetState, t: number): SetState {
  if (state.pending.length === 0) return state;
  let s: SetState = { ...state, pending: [] };
  for (const cand of state.pending) {
    const line = lineById(s, cand.lineId);
    const pause = Math.max(0, t - (line ? line.t1 : t));
    if (t < cand.decideAt) s = { ...s, judged: [...s.judged, notCandidate(cand.lineId, 'no beat', pause)] };
    else s = decide(s, cand.lineId, pause, true, false, false, true);
  }
  return s;
}

function notCandidate(lineId: number, why: string, pauseAfter: number | null): Judged {
  return {
    lineId,
    candidate: false,
    score: null,
    why,
    landed: false,
    roomReacted: false,
    pauseAfter: pauseAfter === null ? null : round3(Math.max(0, pauseAfter)),
  };
}

function firstVoice(state: SetState, at: number): number {
  return state.book.firstVoiceAt === null ? at : Math.min(state.book.firstVoiceAt, at);
}

/** The pause after a line is known once voice is back at `t` (or the set ends): write it into the judgement. */
function recordPauses(state: SetState, t: number): SetState {
  if (state.config.act === 'singing') return state; // judgements there are phrases, not lines
  let changed = false;
  const judged = state.judged.map((j) => {
    if (j.pauseAfter !== null) return j;
    const line = lineById(state, j.lineId);
    if (!line || line.t1 > t) return j;
    changed = true;
    return { ...j, pauseAfter: round3(t - line.t1) };
  });
  return changed ? { ...state, judged } : state;
}

function patchWords(state: SetState, lineId: number, words: number, text: string, fillers: string[]): SetState {
  const idx = state.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) return state;
  const lines = state.lines.slice();
  // The final words replace the recogniser's interim guess, if the line carried one.
  const { interim: _guess, ...line } = lines[idx];
  lines[idx] = { ...line, words, text, fillers: fillers.map((f) => f.toLowerCase()) };
  return { ...state, lines };
}

function finish(state: SetState, at: number): SetState {
  if (state.phase !== 'live') return state;
  const now = Math.min(Math.max(state.now, at), state.endsAt);
  let s: SetState = { ...state, now };
  // Moments during the set close with it; only the end moment's words can still arrive.
  s = expireMoments(s, true);
  s = expireShots(s);
  // Pending candidates are decided with the beat known so far; the room reacts no later than the clock.
  const pending = s.pending;
  s = { ...s, pending: [] };
  for (const cand of pending) {
    const line = lineById(s, cand.lineId);
    // the set ended before the estimate's deadline: `early` like a next line, never counted as the model being late
    s = decide(s, cand.lineId, Math.max(0, now - (line ? line.t1 : now)), true, true, false, true);
  }
  s = recordPauses(s, now);
  s = closePhrase(s, now, true);
  s = releaseCuts(s, true);
  s = closeBit(s, false);
  s = { ...s, phase: 'done', speaking: false };
  // The finale has no caption until the MC's words for the end moment arrive (mc-line), whenever that is.
  const finale: Shot = { kind: 'finale', plate: s.venue.plates.finale[0] ?? null, from: now, to: null };
  return recordMoment(cutTo(s, finale), 'end', {});
}

// ---------------------------------------------------------------------------------------------
// The landing score

/**
 * Score one line against the act's weights. `pauseAfter` is the silence known when the decision is
 * made; the beat component is binary (held for BEAT_MIN_SEC or not), which every candidate that
 * survives to its decision has by construction. Returns null for lines that cannot be judged (too
 * quiet, too short); those are `unsure`.
 */
export function landingScore(
  line: LineEvent,
  prev: LineEvent | undefined,
  pauseAfter: number,
  act: ActId,
  words: WordsMode,
  content?: ContentInput,
): { score: number | null; why: string } {
  const r = scoreLine(line, prev, pauseAfter, act, words, content);
  return { score: r.score, why: r.score === null ? r.beat : [r.beat, ...r.parts].join(', ') };
}

/**
 * What the words gave a line, for `landingScore`: the Tier 1 patterns found (`contentHits`) and the MC model's
 * estimate (a score, or why there is none; leave it out when the judge is off). Used only with words on.
 */
export interface ContentInput {
  hits: ContentHit[];
  /**
   * The estimate's score, or why there is none: `late` (not in by JUDGE_DEADLINE_SEC), `unavailable` (the service could
   * not answer), `early` (the performer's next line began before it arrived, so the room decided then).
   */
  judge?: number | 'late' | 'unavailable' | 'early';
}

/** How the model's estimate is named when it counted: an estimate, never a measurement. */
const JUDGE_HEARD: Record<ActId, string> = {
  standup: 'the room heard a punchline',
  poetry: 'the room heard a striking line',
  speech: 'the room heard a point',
  singing: 'the room heard a phrase',
};

function judgeClause(act: ActId, judge: number | 'late' | 'unavailable' | 'early', bonus: number): string {
  if (judge === 'late') return "the MC's model was too late (timing and patterns only)";
  if (judge === 'early') return "the room decided before the MC's model answered (your next line or the set's end came first; timing and patterns only)";
  if (judge === 'unavailable') return "the MC's model was unavailable (timing and patterns only)";
  return bonus > 0
    ? `${JUDGE_HEARD[act]} (the MC's model, an estimate)`
    : "the MC's model rated the words ordinary (an estimate)";
}

interface LineScore {
  score: number | null;
  /** The timing-only part of the score (what words off would give). */
  timing: number | null;
  /** The beat clause ("beat held after a 1.5 s line"), or the reason the line is unsure. */
  beat: string;
  /** The other measured clauses: timing in weight order, then content, strongest first. */
  parts: string[];
  /** Content features that counted, strongest first. */
  features: ContentFeature[];
  /** The strongest content reason in caption form, when content counted. */
  caption?: string;
}

function scoreLine(
  line: LineEvent,
  prev: LineEvent | undefined,
  pauseAfter: number,
  act: ActId,
  words: WordsMode,
  content?: ContentInput,
): LineScore {
  const dur = line.t1 - line.t0;
  if (line.level < NOISE_GATE) return { score: null, timing: null, beat: 'too quiet', parts: [], features: [] };
  if (dur + EPS < MIN_LINE_SEC) return { score: null, timing: null, beat: 'too short', parts: [], features: [] };
  const w = WEIGHTS[act];
  const why: string[] = [];

  const beat = pauseAfter + EPS >= BEAT_MIN_SEC ? 1 : 0;
  const beatWhy = `${beat ? 'beat held' : 'no beat'} after a ${fixed(dur, 1)} s line${beat ? '' : ' (needs 0.45 s)'}`;

  const checkable =
    words !== 'off' && (line.text !== undefined || line.fillers !== undefined || line.words !== undefined);
  let shape = dur + EPS >= SHAPE_MIN_SEC && dur - EPS <= SHAPE_MAX_SEC ? 1 : 0;
  if (
    shape === 1 &&
    checkable &&
    line.words !== undefined &&
    (line.words < SHAPE_MIN_WORDS || line.words > SHAPE_MAX_WORDS)
  ) {
    shape = 0;
  }
  if (shape === 0) {
    // Nothing else is awarded to a line that is not shaped like one: a long line is a setup, never a punch.
    const reason =
      dur - EPS > SHAPE_MAX_SEC
        ? `long line (${fixed(dur, 1)} s): a setup, not a punch`
        : dur + EPS < SHAPE_MIN_SEC
          ? `short line (${fixed(dur, 1)} s)`
          : `${line.words} words`;
    return { score: 0, timing: 0, beat: beatWhy, parts: [reason], features: [] };
  }

  let setupPunch = 0;
  if (prev) {
    const prevDur = prev.t1 - prev.t0;
    if (prevDur + EPS >= SETUP_RATIO * dur && dur - EPS <= PUNCH_MAX_SEC) {
      setupPunch = 1;
      if (w.setupPunch > 0) why.push(`punch after a ${fixed(prevDur, 1)} s setup`);
    }
  }

  const emphasis =
    line.level > 0 &&
    (line.endLevel / line.level >= EMPHASIS_RATIO ||
      (line.peakLevel > 0 && line.endLevel >= PEAK_IN_TAIL_RATIO * line.peakLevel && line.endLevel > line.level))
      ? 1
      : 0;
  why.push(emphasis ? 'louder at the end' : 'flat ending');

  let clean: number;
  if (!checkable) {
    clean = 0.5; // the line cannot be checked: neither rewarded nor punished
    why.push(words === 'off' ? 'words off' : 'no words heard');
  } else {
    const fillers = line.fillers ?? [];
    clean = fillers.length === 0 ? 1 : 0;
    why.push(fillers.length === 0 ? 'no fillers' : `fillers: ${fillers.slice(0, 3).join(', ')}`);
  }

  const timing = w.beat * beat + w.shape * shape + w.setupPunch * setupPunch + w.emphasis * emphasis + w.clean * clean;
  const heard = !!line.text && line.text.trim().length > 0;
  if (!content || words === 'off' || act === 'singing' || !heard) {
    return { score: timing, timing, beat: beatWhy, parts: why, features: [] };
  }
  // Content only adds, capped: a joke the patterns miss costs nothing, and timing stays the larger part. It counts only
  // with a pattern of the act's own kind or the model's estimate above its floor: a specific detail (or a steady
  // meter) alone never lifts a line, so a setup with a beat stays a setup.
  const fromModel = typeof content.judge === 'number' ? judgeBonus(act, content.judge) : 0;
  const counting = countingHits(act, content.hits, fromModel);
  const bonus = Math.min(CONTENT_CAP[act], contentWeight(act, counting) + fromModel);
  const features: ContentFeature[] = [];
  for (const h of counting) {
    why.push(h.why);
    features.push(h.feature);
  }
  if (content.judge !== undefined) why.push(judgeClause(act, content.judge, fromModel));
  const top = counting.length ? counting[0] : undefined;
  const topWeight = top ? (CONTENT_WEIGHTS[act][top.feature] ?? 0) : 0;
  const caption =
    fromModel > 0 && fromModel > topWeight ? `${JUDGE_HEARD[act]} (an estimate)` : top ? top.caption : undefined;
  return { score: Math.min(1, timing + bonus), timing, beat: beatWhy, parts: why, features, caption };
}

// ---------------------------------------------------------------------------------------------
// Room decisions

function decideDue(state: SetState): SetState {
  let s = state;
  // A candidate past its beat that is still waiting for its words or estimate is marked: its reaction cannot come
  // before the moment the room decides.
  if (s.pending.some((c) => !c.waited && c.decideAt <= s.now && c.deadline > s.now && contentPending(s, c.lineId))) {
    s = {
      ...s,
      pending: s.pending.map((c) =>
        !c.waited && c.decideAt <= s.now && c.deadline > s.now && contentPending(s, c.lineId)
          ? { ...c, waited: true }
          : c,
      ),
    };
  }
  while (true) {
    const due = s.pending.find((c) => c.decideAt <= s.now && (c.deadline <= s.now || !contentPending(s, c.lineId)));
    if (!due) return s;
    s = { ...s, pending: s.pending.filter((c) => c !== due) };
    const line = lineById(s, due.lineId);
    s = decide(s, due.lineId, Math.max(0, s.now - (line ? line.t1 : s.now)), false, false, !!due.waited);
  }
}

/** When the room reacts to a line: its latency shrinks with the reaction's strength. */
export function reactionAt(t1: number, strength: number): number {
  return t1 + REACTION_LATENCY_MIN + (1 - clamp(strength, 0, 1)) * REACTION_LATENCY_SPREAD;
}

/**
 * Judge a candidate. `pauseKnown` says whether `pauseAfter` is the final silence (voice is back, or
 * the set ended) rather than the silence so far; `cap` keeps the reaction no later than the clock.
 */
function decide(
  state: SetState,
  lineId: number,
  pauseAfter: number,
  pauseKnown: boolean,
  cap: boolean,
  waited = false,
  byVoice = false,
): SetState {
  const idx = state.lines.findIndex((l) => l.id === lineId);
  if (idx < 0) return state;
  const line = state.lines[idx];
  const prev = idx > 0 ? state.lines[idx - 1] : undefined;
  const content = contentInput(state, idx, byVoice);
  const { score, beat, parts, features, caption } = scoreLine(
    line,
    prev,
    pauseAfter,
    state.config.act,
    state.wordsMode,
    content,
  );
  const landed = score !== null && score + EPS >= HOUSE_STANDARD;
  const pause = pauseKnown ? round3(Math.max(0, pauseAfter)) : null;
  let s = state;
  let roomReacted = false;
  let why = [beat, ...parts].join(', ');
  if (score !== null && score + EPS >= s.venue.threshold) {
    const last = lastPositive(s);
    const isTag = line.t1 - line.t0 < TAG_MAX_SEC && last !== undefined && line.t1 - last.at <= TAG_WINDOW_SEC;
    const raw = (score - s.venue.threshold) / (1 - s.venue.threshold);
    const strength = clamp(raw * venueScale(s.venue) + (isTag ? TAG_BONUS : 0), 0, 1);
    // A room that waited for the words reacts no sooner than it decided.
    const due = waited ? Math.max(reactionAt(line.t1, strength), s.now) : reactionAt(line.t1, strength);
    const at = cap ? Math.min(due, s.now) : due;
    const breath = last === undefined || at - last.at >= REACTION_BREATH_SEC;
    if (breath || isTag) {
      const latency = Math.max(0, at - line.t1);
      const dur = line.t1 - line.t0;
      why = `${isTag ? 'tag: ' : ''}${s.pack.reaction.noun} ${fixed(latency, 1)} s after a ${fixed(dur, 1)} s line${parts.length ? `, ${parts.join(', ')}` : ''}`;
      const reaction: Reaction = { kind: s.pack.reaction.kind, at, strength, lineId, why };
      if (features.length) reaction.features = features;
      if (content && typeof content.judge === 'number') reaction.judge = content.judge;
      s = react(s, reaction, latency, caption);
      roomReacted = true;
    } else {
      why = `${why}, too soon after the last ${s.pack.reaction.noun}`;
    }
  }
  const judged: Judged = { lineId, candidate: true, score, why, landed, roomReacted, pauseAfter: pause };
  if (content) {
    judged.features = features;
    if (content.judge !== undefined) judged.judge = content.judge;
  }
  return { ...s, judged: [...s.judged, judged] };
}

/** The bit (1-based) a line belongs to: the last bit that opened at or before it. */
function bitOf(state: SetState, line: LineEvent): number {
  let bit = 1;
  for (const b of state.bits) if (b.from <= line.t0 + EPS) bit = b.index;
  return bit;
}

/** What the features may know at line `idx`: the lines before it, their bits, and the last line the room rewarded. */
function contextAt(state: SetState, idx: number): ContentContext {
  const line = state.lines[idx];
  const earlier = state.lines.slice(0, idx).map((l) => ({ line: l, bit: bitOf(state, l) }));
  let lastReacted: ContentContext['lastReacted'];
  for (const r of state.reactions) {
    if (r.kind !== state.pack.reaction.kind || r.lineId === undefined || r.lineId === line.id || r.at > line.t1)
      continue;
    const l = lineById(state, r.lineId);
    if (l) lastReacted = { line: l, at: r.at };
  }
  return { act: state.config.act, earlier, bit: bitOf(state, line), lastReacted };
}

/** The content input for a decision: patterns from the words in now, and the estimate (when the judge is on). */
function contentInput(state: SetState, idx: number, byVoice = false): ContentInput | undefined {
  if (!judgingWords(state)) return undefined;
  const line = state.lines[idx];
  const hits = line.text && line.text.trim() ? contentHits(line, contextAt(state, idx)) : [];
  if (!state.config.judge) return { hits };
  const v = state.verdicts[line.id];
  // Decided because the next line began (not because the estimate ran out of time): `early`, not the model's lateness.
  const missing = byVoice && state.now < line.t1 + JUDGE_DEADLINE_SEC - EPS ? 'early' : 'late';
  return { hits, judge: v === 'unavailable' ? 'unavailable' : v ? v.score : missing };
}

/**
 * Append a positive reaction and cut to a reaction plate at its moment: now if that has come, or
 * queued until the clock reaches it. `latency` is what the caption quotes.
 */
function react(state: SetState, reaction: Reaction, latency: number, reason?: string): SetState {
  const reactions = [...state.reactions, reaction];
  const count = reactions.filter((r) => r.kind === state.pack.reaction.kind).length;
  const what = state.config.act === 'singing' ? 'phrase' : 'line';
  const noun = state.pack.reaction.noun.toUpperCase();
  // With a content reason the caption names it first ("LAUGH · a callback to your first bit · 0.6 s beat").
  const caption = reason
    ? `${noun} · ${reason} · ${fixed(latency, 1)} s beat`
    : `${noun} · ${fixed(latency, 1)} s after your ${what} · the room's ${ordinal(count)} tonight`;
  const plates = state.venue.plates.reaction;
  const plate = plates.length ? plates[state.book.reactionCuts % plates.length] : null;
  const shot: Shot = {
    kind: 'reaction',
    plate,
    from: reaction.at,
    to: reaction.at + state.venue.reactionHoldMs / 1000,
    caption,
    reaction,
  };
  let s: SetState = {
    ...state,
    reactions,
    deadBits: 0,
    book: { ...state.book, reactionCuts: state.book.reactionCuts + 1 },
  };
  s = bumpBitReactions(s);
  if (reaction.at <= s.now) return cutTo(s, shot);
  return { ...s, book: { ...s.book, cuts: [...s.book.cuts, shot] } };
}

/** Cut to the reaction shots whose moment has come; with `all`, the set is ending and the rest land now. */
function releaseCuts(state: SetState, all: boolean): SetState {
  let s = state;
  while (s.book.cuts.length && (all || s.book.cuts[0].from <= s.now)) {
    const next = s.book.cuts[0];
    s = { ...s, book: { ...s.book, cuts: s.book.cuts.slice(1) } };
    if (next.from <= s.now || !next.reaction) {
      s = cutTo(s, next);
    } else {
      // The set ended before the room got there: the reaction lands at the final whistle.
      const reaction: Reaction = { ...next.reaction, at: s.now };
      const reactions = s.reactions.map((r) => (r === next.reaction ? reaction : r));
      const hold = next.to === null ? s.venue.reactionHoldMs / 1000 : next.to - next.from;
      s = cutTo({ ...s, reactions }, { ...next, from: s.now, to: s.now + hold, reaction });
    }
  }
  return s;
}

function lastPositive(state: SetState): Reaction | undefined {
  for (let i = state.reactions.length - 1; i >= 0; i--) {
    if (state.reactions[i].kind === state.pack.reaction.kind) return state.reactions[i];
  }
  return undefined;
}

/** Reactions are scaled by the room's size: 0.67 at thirty seats, 1.0 at twenty thousand. */
export function venueScale(venue: Venue): number {
  const max = Math.log10(20000);
  return 0.5 + 0.5 * clamp(Math.log10(Math.max(1, venue.seats)) / max, 0, 1);
}

/**
 * Dead air is nobody making a sound: the performer's last voice, or the end of the room's last
 * reaction, whichever is later. A laugh the performer waits out is not dead air.
 */
function quietSince(state: SetState): number {
  return silenceSince(state);
}

/**
 * When the current silence began, by the same definition as the ledger (`silences`): the end of the last line the
 * phone reported or of the room's own last reaction being held, never before the set's first voice. A voice the phone
 * only flagged (no line yet) holds the silence off while it lasts (`speaking`) but does not end it: the silence is
 * what the ledger will measure, so the live murmur never claims more dead air than the cut sheet reports.
 */
export function silenceSince(state: SetState): number {
  let since = state.book.firstVoiceAt === null ? state.now : state.book.firstVoiceAt;
  for (const l of state.lines) if (l.t1 > since) since = l.t1;
  const hold = state.venue.reactionHoldMs / 1000;
  for (const r of state.reactions) if (r.kind === state.pack.reaction.kind && r.at + hold > since) since = r.at + hold;
  return since;
}

/** The silence running now, in seconds (0 while the performer speaks or before the first voice). */
export function currentSilence(state: SetState, now = state.now): number {
  if (state.speaking || state.book.firstVoiceAt === null) return 0;
  return Math.max(0, now - silenceSince(state));
}

function murmur(state: SetState): SetState {
  if (state.speaking || state.book.firstVoiceAt === null) return state;
  const since = quietSince(state);
  const dead = state.now - since;
  if (dead < state.venue.patienceSec || state.book.murmuredFor === since) return state;
  const why = `${fixed(dead, 1)} s of dead air`;
  const reaction: Reaction = { kind: 'murmur', at: state.now, strength: 0.5 * venueScale(state.venue), why };
  const shot = state.shot.kind === 'wide' ? { ...state.shot, caption: `MURMUR · ${why}` } : state.shot;
  return { ...state, reactions: [...state.reactions, reaction], shot, book: { ...state.book, murmuredFor: since } };
}

// ---------------------------------------------------------------------------------------------
// Bits

function openOrExtendBit(state: SetState, line: LineEvent): SetState {
  const open = state.bits.length ? state.bits[state.bits.length - 1] : undefined;
  let s = state;
  if (open && open.to === null) {
    const prev = s.lines.length >= 2 ? s.lines[s.lines.length - 2] : undefined;
    if (prev && line.t0 - prev.t1 >= BIT_PAUSE_SEC) {
      s = closeBit(s, true);
    } else {
      const bits = s.bits.slice();
      bits[bits.length - 1] = { ...open, lines: open.lines + 1 };
      return { ...s, bits };
    }
  }
  const bit: Bit = { index: s.bits.length + 1, from: line.t0, to: null, lines: 1, reactions: 0 };
  return { ...s, bits: [...s.bits, bit] };
}

function bumpBitReactions(state: SetState): SetState {
  const open = state.bits.length ? state.bits[state.bits.length - 1] : undefined;
  if (!open || open.to !== null) return state;
  const bits = state.bits.slice();
  bits[bits.length - 1] = { ...open, reactions: open.reactions + 1 };
  return { ...state, bits };
}

/** On a tick: the performer has been quiet for BIT_PAUSE_SEC since the last line, so the bit is over. */
function closeIdleBit(state: SetState): SetState {
  const open = state.bits.length ? state.bits[state.bits.length - 1] : undefined;
  if (!open || open.to !== null || state.speaking || state.lines.length === 0) return state;
  // The phone sends `voice off` about 300 ms before the matching line, so the voice clock counts too.
  const last = state.lines[state.lines.length - 1];
  if (state.now - Math.max(last.t1, state.lastVoiceAt) < BIT_PAUSE_SEC) return state;
  return closeBit(state, true);
}

/** Close the open bit; with `react`, count it dead (and maybe heckle) or record a between-bits moment. */
function closeBit(state: SetState, react: boolean): SetState {
  const open = state.bits.length ? state.bits[state.bits.length - 1] : undefined;
  if (!open || open.to !== null || state.lines.length === 0) return state;
  const last = state.lines[state.lines.length - 1];
  const bits = state.bits.slice();
  bits[bits.length - 1] = { ...open, to: Math.max(open.from, last.t1) };
  let s: SetState = { ...state, bits };
  if (!react) return s;
  if (open.reactions === 0) {
    s = { ...s, deadBits: s.deadBits + 1 };
    const n = s.venue.hecklesAfterDeadBits;
    const cooled = s.book.lastHeckleAt === null || s.now - s.book.lastHeckleAt >= HECKLE_COOLDOWN_SEC;
    if (n > 0 && s.deadBits >= n && cooled) {
      const reaction: Reaction = {
        kind: 'heckle',
        at: s.now,
        strength: venueScale(s.venue),
        why: deadBitsWhy(s.deadBits),
      };
      s = { ...s, reactions: [...s.reactions, reaction], book: { ...s.book, lastHeckleAt: s.now } };
      // The caption is measured and shows at once; the heckle's words, if any, come from the MC.
      if (s.shot.kind === 'wide') s = { ...s, shot: { ...s.shot, caption: heckleCaption(s.deadBits) } };
      s = recordMoment(s, 'heckle', { bit: open.index, deadBits: s.deadBits });
    }
  } else {
    s = { ...s, deadBits: 0 };
    const cooled = s.book.lastBetweenAt === null || s.now - s.book.lastBetweenAt >= BETWEEN_BITS_COOLDOWN_SEC;
    if (cooled) {
      s = { ...s, book: { ...s.book, lastBetweenAt: s.now } };
      s = recordMoment(s, 'between', { bit: open.index, bitReactions: open.reactions });
    }
  }
  return s;
}

function deadBitsWhy(n: number): string {
  return `${n} dead ${n === 1 ? 'bit' : 'bits'} in a row`;
}

function heckleCaption(n: number): string {
  return `HECKLE · ${deadBitsWhy(n)}`;
}

// ---------------------------------------------------------------------------------------------
// MC moments

/** Record a moment where the MC may speak, with what was measured at that point. */
function recordMoment(
  state: SetState,
  kind: McMoment,
  extra: { bit?: number; bitReactions?: number; deadBits?: number },
): SetState {
  const sc = scorecard(state);
  const facts: MomentFacts = {
    at: round3(state.now),
    ...extra,
    landed: sc.landed,
    candidates: sc.candidates,
    roomReactions: sc.roomReactions,
    longestDeadAirSec: sc.longestDeadAirSec,
    elapsedSec: sc.durationSec,
  };
  const moment: SetMoment = { id: state.moments.length + 1, kind, facts };
  return { ...state, moments: [...state.moments, moment] };
}

/** The MC's words as shown: verbatim, whitespace tidied, cut on a word boundary if ever longer than MC_TEXT_MAX. */
export function cardText(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= MC_TEXT_MAX) return text;
  const cut = text.slice(0, MC_TEXT_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

/** Whether a moment can still take its words at time `t`. The end moment always can. */
function windowOpen(state: SetState, moment: SetMoment, t: number): boolean {
  switch (moment.kind) {
    case 'intro':
      return state.book.firstVoiceAt === null && t <= moment.facts.at + INTRO_WINDOW_SEC + EPS;
    case 'between':
    case 'heckle':
      return t <= moment.facts.at + MC_LINE_WINDOW_SEC + EPS;
    case 'end':
      return true;
  }
}

function settle(state: SetState, momentId: number, outcome: MomentOutcome): SetState {
  return { ...state, momentOutcomes: { ...state.momentOutcomes, [momentId]: outcome } };
}

function onMcLine(state: SetState, momentId: number, raw: string): SetState {
  const moment = state.moments.find((m) => m.id === momentId);
  // Unknown moment, or already settled or waiting: at most one card per moment.
  if (!moment || state.momentOutcomes[momentId] !== undefined) return state;
  if (state.book.waiting.some((w) => w.momentId === momentId)) return state;
  const text = cardText(raw);
  if (text.length === 0) return settle(state, momentId, 'silent');
  if (moment.kind === 'end') {
    if (state.shot.kind !== 'finale') return state;
    return settle({ ...state, shot: { ...state.shot, caption: text } }, momentId, 'shown');
  }
  if (state.phase !== 'live' || !windowOpen(state, moment, state.now)) return settle(state, momentId, 'late');
  return deliver({ ...state, book: { ...state.book, waiting: [...state.book.waiting, { momentId, text }] } });
}

function onMcSilent(state: SetState, momentId: number): SetState {
  const moment = state.moments.find((m) => m.id === momentId);
  const outcome = state.momentOutcomes[momentId];
  if (!moment || outcome === 'shown' || outcome === 'silent') return state;
  // "The MC could not answer" outranks "no words arrived in time".
  const waiting = state.book.waiting.filter((w) => w.momentId !== momentId);
  return settle({ ...state, book: { ...state.book, waiting } }, momentId, 'silent');
}

/**
 * Moments whose window has closed without a card become `late` (their waiting words are dropped);
 * with `all` (the set is ending) every open moment does, except the end.
 */
function expireMoments(state: SetState, all: boolean): SetState {
  const waiting = all
    ? []
    : state.book.waiting.filter((w) => {
        const m = state.moments.find((x) => x.id === w.momentId);
        return m !== undefined && windowOpen(state, m, state.now);
      });
  let outcomes = state.momentOutcomes;
  for (const m of state.moments) {
    if (m.kind === 'end' || outcomes[m.id] !== undefined) continue;
    if (!all && windowOpen(state, m, state.now)) continue;
    if (outcomes === state.momentOutcomes) outcomes = { ...outcomes };
    outcomes[m.id] = 'late';
  }
  if (outcomes === state.momentOutcomes && waiting.length === state.book.waiting.length) return state;
  return { ...state, momentOutcomes: outcomes, book: { ...state.book, waiting } };
}

/** Show the first waiting words as a title card from `at`. */
function showWaiting(state: SetState, at: number): SetState {
  const next = state.book.waiting[0];
  const moment = state.moments.find((m) => m.id === next.momentId);
  const rest: SetState = { ...state, book: { ...state.book, waiting: state.book.waiting.slice(1) } };
  if (!moment) return rest;
  const sec =
    moment.kind === 'intro' ? INTRO_CARD_SEC : moment.kind === 'heckle' ? HECKLE_CARD_SEC : BETWEEN_BITS_CARD_SEC;
  const card: Shot = { kind: 'card', plate: null, from: at, to: at + sec, text: next.text };
  if (moment.kind === 'heckle') card.caption = heckleCaption(moment.facts.deadBits ?? 1);
  return settle(cutTo(rest, card), next.momentId, 'shown');
}

/** Drop words that missed their moment; put the first waiting words on screen if the wide is up and the performer is quiet. */
function deliver(state: SetState): SetState {
  const s = expireMoments(state, false);
  if (s.phase !== 'live' || s.book.waiting.length === 0 || s.shot.kind !== 'wide' || s.speaking) return s;
  return showWaiting(s, s.now);
}

// ---------------------------------------------------------------------------------------------
// Director

/** Close the current shot where the next one starts and make the next one current. */
function cutTo(state: SetState, next: Shot): SetState {
  const from = Math.max(next.from, state.shot.from);
  const shot: Shot = { ...next, from, to: next.to === null ? null : Math.max(next.to, from) };
  const current: Shot = { ...state.shot, to: from };
  const shots = current.to !== null && current.to > current.from ? [...state.shots, current] : state.shots;
  return { ...state, shots, shot };
}

function wideShot(state: SetState, from: number): { shot: Shot; book: Bookkeeping } {
  const plates = state.venue.plates.wide;
  const plate = plates.length ? plates[state.book.wideCuts % plates.length] : null;
  return { shot: { kind: 'wide', plate, from, to: null }, book: { ...state.book, wideCuts: state.book.wideCuts + 1 } };
}

/**
 * Live-angle cadence: a wide that has held for WIDE_HOLD_SEC hard-cuts to the venue's other wide
 * plate, so the room feels like a multi-camera broadcast even when nothing happens. Never with a
 * decision imminent or a card or reaction cut waiting: those cuts belong to the room.
 */
function angleCut(state: SetState): SetState {
  if (state.shot.kind !== 'wide' || state.now - state.shot.from + EPS < WIDE_HOLD_SEC) return state;
  if (state.book.waiting.length > 0 || state.book.cuts.length > 0 || state.venue.plates.wide.length < 2) return state;
  if (state.pending.some((c) => c.decideAt - state.now <= ANGLE_GUARD_SEC)) return state;
  const { shot, book } = wideShot(state, state.now);
  return cutTo({ ...state, book }, shot);
}

/**
 * Timed shots (cards, reactions) that have run their course give way to the MC's waiting words (if
 * their moment is still open and the performer is quiet) or to a wide.
 */
function expireShots(state: SetState): SetState {
  let s = state;
  while (s.shot.to !== null && s.shot.to <= s.now) {
    const at = s.shot.to;
    const first = s.book.waiting.length ? s.book.waiting[0] : undefined;
    const moment = first ? s.moments.find((m) => m.id === first.momentId) : undefined;
    if (moment && !s.speaking && windowOpen(s, moment, at)) {
      s = showWaiting(s, at);
    } else {
      const { shot, book } = wideShot(s, at);
      s = cutTo({ ...s, book }, shot);
    }
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Singing

function onPitch(state: SetState, samples: PitchSample[]): SetState {
  if (state.phase !== 'live' || samples.length === 0) return state;
  let s: SetState = { ...state, pitch: [...state.pitch, ...samples] };
  for (const sample of samples) {
    if (s.phase !== 'live') break;
    const voiced = sample.midi !== null && sample.clarity >= CLARITY_GATE && sample.level >= NOISE_GATE;
    const open = s.book.phrase;
    if (voiced) {
      const inTune = sample.midi !== null && centsOff(sample.midi) <= IN_TUNE_CENTS ? 1 : 0;
      const phrase = open
        ? { ...open, lastVoicedAt: sample.t, samples: open.samples + 1, inTune: open.inTune + inTune }
        : { from: sample.t, lastVoicedAt: sample.t, samples: 1, inTune };
      // A voiced sample is voice: the room's patience clock restarts.
      s = {
        ...s,
        lastVoiceAt: Math.max(s.lastVoiceAt, sample.t),
        book: { ...s.book, phrase, firstVoiceAt: firstVoice(s, sample.t) },
      };
    } else if (open && sample.t - open.lastVoicedAt >= PHRASE_GAP_SEC) {
      s = closePhrase(s, sample.t, false);
    }
    s = advance(s, sample.t);
  }
  return s;
}

/** The open phrase ends at its last voiced sample and is judged by its hold. */
function closePhrase(state: SetState, now: number, finishing: boolean): SetState {
  const open = state.book.phrase;
  if (!open) return state;
  let s: SetState = { ...state, book: { ...state.book, phrase: null } };
  const dur = open.lastVoicedAt - open.from;
  if (dur < MIN_LINE_SEC) return s;
  const id = s.phrases.length + 1;
  if (dur < PHRASE_MIN_SEC) {
    const phrase: Phrase = {
      id,
      from: open.from,
      to: open.lastVoicedAt,
      samples: open.samples,
      inTune: open.inTune,
      hold: open.inTune / open.samples,
    };
    return { ...s, phrases: [...s.phrases, phrase], judged: [...s.judged, notCandidate(id, 'too short', null)] };
  }
  const hold = round3(open.inTune / open.samples);
  const phrase: Phrase = {
    id,
    from: open.from,
    to: open.lastVoicedAt,
    samples: open.samples,
    inTune: open.inTune,
    hold,
  };
  s = { ...s, phrases: [...s.phrases, phrase] };
  // The pitch's own features (a held note, the ending, the range) add to the hold, capped; words play no part.
  const own = s.pitch.filter((p) => p.t >= open.from - EPS && p.t <= open.lastVoicedAt + EPS);
  const hits = phraseHits(own, noteOf, finishing);
  const score = Math.min(1, hold + Math.min(CONTENT_CAP.singing, contentWeight('singing', hits)));
  const features = hits.map((h) => h.feature);
  const extra = hits.length ? `, ${hits.map((h) => h.why).join(', ')}` : '';
  const why = `${Math.round(hold * 100)}% of a ${fixed(dur, 1)} s phrase within ${IN_TUNE_CENTS} cents${extra}`;
  const landed = score + EPS >= HOUSE_STANDARD;
  let roomReacted = false;
  if (score + EPS >= s.venue.threshold) {
    const raw = (score - s.venue.threshold) / (1 - s.venue.threshold);
    const strength = clamp(raw * venueScale(s.venue), 0, 1);
    const at = finishing
      ? Math.min(now, reactionAt(open.lastVoicedAt, strength))
      : reactionAt(open.lastVoicedAt, strength);
    const last = lastPositive(s);
    if (last === undefined || at - last.at >= REACTION_BREATH_SEC) {
      const latency = Math.max(0, at - open.lastVoicedAt);
      const reaction: Reaction = {
        kind: s.pack.reaction.kind,
        at,
        strength,
        lineId: id,
        why: `${s.pack.reaction.noun} ${fixed(latency, 1)} s after a ${fixed(dur, 1)} s phrase, ${Math.round(hold * 100)}% within ${IN_TUNE_CENTS} cents${extra}`,
      };
      if (features.length) reaction.features = features;
      s = react(s, reaction, latency, hits.length ? hits[0].caption : undefined);
      roomReacted = true;
    }
  }
  const judged: Judged = { lineId: id, candidate: true, score, why, landed, roomReacted, pauseAfter: null, features };
  return { ...s, judged: [...s.judged, judged] };
}

/** A sample the phone heard as a pitched voice: a reading, clear and loud enough. */
function isVoiced(p: PitchSample): boolean {
  return p.midi !== null && p.clarity >= CLARITY_GATE && p.level >= NOISE_GATE;
}

/** The in-tune note a sample sits on (voiced, clear, loud enough, within IN_TUNE_CENTS), or null. */
function noteOf(p: PitchSample): number | null {
  if (p.midi === null || p.clarity < CLARITY_GATE || p.level < NOISE_GATE) return null;
  return centsOff(p.midi) <= IN_TUNE_CENTS ? Math.round(p.midi) : null;
}

/** Distance in cents from the nearest semitone. */
export function centsOff(midi: number): number {
  return Math.abs(midi - Math.round(midi)) * 100;
}

// ---------------------------------------------------------------------------------------------
// The ledger

export function scorecard(state: SetState): Scorecard {
  const act = state.config.act;
  const durationSec = round1(state.now);
  const landed = state.judged.filter((j) => j.landed).length;
  const candidates = state.judged.filter((j) => j.candidate).length;
  const roomReactions = state.reactions.filter((r) => r.kind === state.pack.reaction.kind).length;
  // "No beat" lines are not unsure: they were heard fine and simply had no beat after them.
  const unsure = state.judged.filter((j) => !j.candidate && (j.why === 'too quiet' || j.why === 'too short')).length;
  const gaps = silences(state, state.now);
  let longest = { from: 0, to: 0 };
  for (const g of gaps) if (g.to - g.from > longest.to - longest.from) longest = g;
  const longestDeadAirSec = round1(longest.to - longest.from);

  const words = state.wordsMode !== 'off';
  const withWords = words ? state.lines.filter((l) => l.words !== undefined) : [];
  let wpm: number | null = null;
  let peakWpm: number | null = null;
  if (withWords.length) {
    const totalWords = withWords.reduce((n, l) => n + (l.words ?? 0), 0);
    const spokenSec = withWords.reduce((n, l) => n + (l.t1 - l.t0), 0);
    wpm = spokenSec > 0 ? Math.round((totalWords * 60) / spokenSec) : null;
    peakWpm = wpm;
    for (let i = 0; i < withWords.length; i++) {
      const start = mid(withWords[i]);
      let n = 0;
      let sec = 0;
      for (let j = i; j < withWords.length && mid(withWords[j]) <= start + PEAK_WPM_WINDOW_SEC; j++) {
        n += withWords[j].words ?? 0;
        sec += withWords[j].t1 - withWords[j].t0;
      }
      if (sec >= 5 && Math.round((n * 60) / sec) > (peakWpm ?? 0)) peakWpm = Math.round((n * 60) / sec);
    }
  }

  let fillers: Scorecard['fillers'] = null;
  if (words) {
    const counts: Record<string, number> = {};
    let count = 0;
    for (const l of state.lines) {
      for (const f of l.fillers ?? []) {
        const w = f.toLowerCase();
        counts[w] = (counts[w] ?? 0) + 1;
        count++;
      }
    }
    const top = Object.keys(counts)
      .map((word) => ({ word, n: counts[word] }))
      .sort((a, b) => b.n - a.n || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0))
      .slice(0, 3);
    fillers = { count, top };
  }

  let inTunePct: number | null = null;
  let longestHoldSec: number | null = null;
  if (act === 'singing') {
    const voiced = state.pitch.filter(isVoiced);
    // No usable pitch from the phone: the hold, like the in-tune share, was not measured (null, never 0).
    if (voiced.length) {
      const inTune = voiced.filter((p) => p.midi !== null && centsOff(p.midi) <= IN_TUNE_CENTS).length;
      inTunePct = Math.round((100 * inTune) / voiced.length);
      longestHoldSec = round1(longestHold(state.pitch));
    }
  }

  return {
    act,
    venue: state.config.venue,
    durationSec,
    landed,
    candidates,
    landedPerMin: durationSec > 0 ? round1((landed * 60) / durationSec) : 0,
    roomReactions,
    longestDeadAirSec,
    longestDeadAirAt: longestDeadAirSec > 0 ? round1(longest.from) : null,
    wpm,
    peakWpm,
    fillers,
    inTunePct,
    longestHoldSec,
    unsure,
    content: contentMeasures(state),
  };
}

/** The scorecard's content counts are memoised per lines array (the screens ask for the scorecard on every tick). */
const contentMemo = new WeakMap<LineEvent[], { key: string; out: ContentMeasures | null }>();

/**
 * What the words (or the pitch) showed across the set, over every line's final words. null when not measured: words
 * off for a spoken act. Independent of the venue, like the rest of the scorecard.
 */
export function contentMeasures(state: SetState): ContentMeasures | null {
  const act = state.config.act;
  const listened = Object.keys(CONTENT_WEIGHTS[act]) as ContentFeature[];
  const counts = (): Partial<Record<ContentFeature, number>> => {
    const c: Partial<Record<ContentFeature, number>> = {};
    for (const f of listened) c[f] = 0;
    return c;
  };
  if (act === 'singing') {
    // Singing's patterns come from the pitch: with none heard, nothing was measured.
    if (!state.pitch.some(isVoiced)) return null;
    const features = counts();
    let lines = 0;
    for (const j of state.judged) {
      if (!j.candidate) continue;
      lines++;
      for (const f of j.features ?? []) features[f] = (features[f] ?? 0) + 1;
    }
    return { lines, features, rhymedEnds: null, rangeSemitones: rangeSemitones(state.pitch, noteOf), judge: null };
  }
  if (state.wordsMode === 'off') return null;
  const judge = judgeStats(state);
  // The patterns depend on the lines, the bits and the room's reactions (for tags), not on the judgements: memoised on
  // those, so the screens' scorecard on every tick does not recount every line.
  const key = `${state.wordsMode}|${state.reactions.length}|${state.bits.length}`;
  const memo = contentMemo.get(state.lines);
  if (memo && memo.key === key) return memo.out === null ? null : { ...memo.out, judge };
  const features = counts();
  let lines = 0;
  let rhymed = 0;
  let ends = 0;
  const heard: LineEvent[] = [];
  // One pass: each line's context (the lines before it with their bits, the last line the room rewarded) grows as we go.
  const earlier: { line: LineEvent; bit: number }[] = [];
  const positive = state.reactions.filter((r) => r.kind === state.pack.reaction.kind && r.lineId !== undefined);
  for (let i = 0; i < state.lines.length; i++) {
    const line = state.lines[i];
    const bit = bitOf(state, line);
    if (line.text && line.text.trim()) {
      lines++;
      let lastReacted: ContentContext['lastReacted'];
      for (const r of positive) {
        if (r.lineId === line.id || r.at > line.t1) continue;
        const l = lineById(state, r.lineId as number);
        if (l) lastReacted = { line: l, at: r.at };
      }
      for (const h of contentHits(line, { act, earlier, bit, lastReacted })) {
        features[h.feature] = (features[h.feature] ?? 0) + 1;
      }
      if (act === 'poetry' && heard.length > 0) {
        ends++;
        if (endRhymes(line, heard.slice(-2))) rhymed++;
      }
      heard.push(line);
    }
    earlier.push({ line, bit });
  }
  const out: ContentMeasures = {
    lines,
    features,
    rhymedEnds: act === 'poetry' ? { rhymed, of: ends } : null,
    rangeSemitones: null,
    judge,
  };
  contentMemo.set(state.lines, { key, out });
  return out;
}

/** The MC model's estimates over the set (see ContentMeasures.judge); null when the judge is off. */
function judgeStats(state: SetState): ContentMeasures['judge'] {
  if (!state.config.judge) return null;
  const scores: number[] = [];
  let missed = 0;
  let early = 0;
  for (const j of state.judged) {
    if (!j.candidate || j.judge === undefined) continue;
    if (typeof j.judge === 'number') scores.push(j.judge);
    else if (j.judge === 'early') early++;
    else missed++;
  }
  const mean = scores.length ? Math.round((100 * scores.reduce((a, b) => a + b, 0)) / scores.length) / 100 : null;
  return { inTime: scores.length, missed, early, meanScore: mean };
}

/** The longest run of consecutive voiced samples held within IN_TUNE_CENTS of one semitone, in seconds. */
function longestHold(samples: PitchSample[]): number {
  let best = 0;
  let runStart: number | null = null;
  let runNote: number | null = null;
  let last = 0;
  for (const p of samples) {
    const voiced = p.midi !== null && p.clarity >= CLARITY_GATE && p.level >= NOISE_GATE;
    const note = voiced && p.midi !== null && centsOff(p.midi) <= IN_TUNE_CENTS ? Math.round(p.midi) : null;
    if (note !== null && note === runNote && runStart !== null) {
      last = p.t;
      best = Math.max(best, last - runStart);
    } else if (note !== null) {
      runStart = p.t;
      runNote = note;
      last = p.t;
    } else {
      runStart = null;
      runNote = null;
    }
  }
  return best;
}

/**
 * Gaps with nobody making a sound between 0 and `end`: no line, no voice still open, no positive
 * reaction being held.
 */
function silences(state: SetState, end: number): { from: number; to: number }[] {
  // Before the first voice the room is waiting for the act, not for a line: no dead air yet.
  if (state.book.firstVoiceAt === null) return [];
  const voiced: { from: number; to: number }[] = state.lines.map((l) => ({ from: l.t0, to: l.t1 }));
  if (state.speaking && state.book.voiceStartedAt !== null) voiced.push({ from: state.book.voiceStartedAt, to: end });
  const hold = state.venue.reactionHoldMs / 1000;
  for (const r of state.reactions)
    if (r.kind === state.pack.reaction.kind) voiced.push({ from: r.at, to: r.at + hold });
  voiced.sort((a, b) => a.from - b.from);
  const gaps: { from: number; to: number }[] = [];
  let cursor = state.book.firstVoiceAt;
  for (const v of voiced) {
    if (v.from > cursor) gaps.push({ from: cursor, to: Math.min(v.from, end) });
    cursor = Math.max(cursor, v.to);
  }
  if (end > cursor) gaps.push({ from: cursor, to: end });
  return gaps.filter((g) => g.to > g.from);
}

// ---------------------------------------------------------------------------------------------
// Cut sheet and records

export interface CutFrame {
  kind: 'wide' | 'reaction' | 'dead' | 'finale';
  from: number;
  to: number;
  label: string;
  plate: PlateId | null;
}

/**
 * The set as contiguous frames from 0 to the end: wides, reaction cuts, dead air; then, once the
 * set is done, the finale as one FINALE_FRAME_SEC frame after the end.
 */
export function cutSheet(state: SetState): CutFrame[] {
  const end = state.now;
  const all = [...state.shots, state.shot];
  let frames: CutFrame[] = [];
  let finale: Shot | undefined;
  for (const s of all) {
    if (s.kind === 'finale') {
      finale = s;
      continue;
    }
    const from = Math.max(0, s.from);
    const to = Math.min(end, s.to === null ? end : s.to);
    if (to <= from) continue;
    if (s.kind === 'reaction') {
      const judged =
        s.reaction && s.reaction.lineId !== undefined
          ? state.judged.find((j) => j.lineId === s.reaction?.lineId)
          : undefined;
      const beat = judged && judged.pauseAfter !== null ? ` · ${fixed(judged.pauseAfter, 1)} s beat` : '';
      frames.push({
        kind: 'reaction',
        from,
        to,
        label: `${state.pack.reaction.noun} ${mmss(s.reaction ? s.reaction.at : from)}${beat}`,
        plate: s.plate,
      });
    } else {
      // Cards are the director's words, not a shot of the room: they fold into the wide.
      const prev = frames.length ? frames[frames.length - 1] : undefined;
      if (prev && prev.kind === 'wide' && prev.to === from) prev.to = to;
      else
        frames.push({
          kind: 'wide',
          from,
          to,
          label: 'wide',
          plate: s.kind === 'wide' ? s.plate : (state.venue.plates.wide[0] ?? null),
        });
    }
  }
  // Dead air (a silence past this room's patience, the same measure as the ledger and the murmur) splits the wides.
  for (const gap of silences(state, end)) {
    if (gap.to - gap.from + EPS < state.venue.patienceSec) continue;
    const next: CutFrame[] = [];
    for (const f of frames) {
      if (f.kind !== 'wide' || gap.to <= f.from || gap.from >= f.to) {
        next.push(f);
        continue;
      }
      const a = Math.max(f.from, gap.from);
      const b = Math.min(f.to, gap.to);
      if (a > f.from) next.push({ ...f, to: a });
      if (b > a)
        next.push({ kind: 'dead', from: a, to: b, label: `dead ${fixed(gap.to - gap.from, 1)} s`, plate: null });
      if (f.to > b) next.push({ ...f, from: b });
    }
    frames = next;
  }
  // Keep the frames contiguous whatever the shots did.
  const out: CutFrame[] = [];
  let cursor = 0;
  for (const f of frames) {
    if (f.to <= cursor) continue;
    const from = Math.max(cursor, f.from);
    if (from > cursor)
      out.push({ kind: 'wide', from: cursor, to: from, label: 'wide', plate: state.venue.plates.wide[0] ?? null });
    out.push({ ...f, from });
    cursor = f.to;
  }
  if (end > cursor)
    out.push({ kind: 'wide', from: cursor, to: end, label: 'wide', plate: state.venue.plates.wide[0] ?? null });
  if (finale && state.phase === 'done')
    out.push({ kind: 'finale', from: end, to: end + FINALE_FRAME_SEC, label: 'finale', plate: finale.plate });
  return out;
}

export function setRecord(state: SetState, endedAt: string): SetRecord {
  const sc = scorecard(state);
  const reactions: RecordedReaction[] = state.reactions.map((r) => {
    const out: RecordedReaction = { kind: r.kind, at: round1(r.at), strength: round3(r.strength) };
    if (r.lineId !== undefined) out.lineId = r.lineId;
    const line = r.lineId !== undefined && state.config.act !== 'singing' ? lineById(state, r.lineId) : undefined;
    const word = line ? keyWord(line.text) : null;
    if (word) out.word = word;
    if (r.features && r.features.length) out.features = r.features.slice();
    return out;
  });
  return {
    setId: state.config.setId,
    endedAt,
    act: state.config.act,
    venue: state.config.venue,
    persona: state.config.persona,
    performer: state.config.performer,
    scorecard: sc,
    summary: summaryLine(sc, state.config.act),
    reactions,
  };
}

/** One measured sentence for the ledger. Numbers only; no opinion. */
export function summaryLine(sc: Scorecard, act: ActId): string {
  const pack = getPack(act);
  const parts: string[] = [];
  if (act === 'singing') {
    if (sc.inTunePct === null) {
      // Phrases are judged from the pitch: with none heard there is no count to report.
      parts.push(`no pitch measured in ${mmss(sc.durationSec)}`);
    } else {
      parts.push(`${sc.inTunePct}% in tune`);
      if (sc.longestHoldSec !== null && sc.longestHoldSec > 0)
        parts.push(`longest hold ${fixed(sc.longestHoldSec, 1)} s`);
      parts.push(`${sc.landed} of ${sc.candidates} phrases held in ${mmss(sc.durationSec)}`);
    }
  } else {
    parts.push(`${sc.landed} of ${sc.candidates} lines landed in ${mmss(sc.durationSec)}`);
    parts.push(
      `the room gave ${sc.roomReactions} ${sc.roomReactions === 1 ? pack.reaction.noun : pack.reaction.plural}`,
    );
    if (sc.longestDeadAirSec + EPS >= getVenue(act, sc.venue).patienceSec && sc.longestDeadAirAt !== null) {
      parts.push(`went quiet for ${fixed(sc.longestDeadAirSec, 1)} s at ${mmss(sc.longestDeadAirAt)}`);
    }
    if (sc.wpm !== null)
      parts.push(`${sc.wpm} wpm${sc.peakWpm !== null && sc.peakWpm > sc.wpm ? ` (peak ${sc.peakWpm})` : ''}`);
    else parts.push('words off');
    if (sc.fillers && sc.fillers.count > 0)
      parts.push(`${sc.fillers.count} ${sc.fillers.count === 1 ? 'filler' : 'fillers'}`);
  }
  const heard = contentSummary(sc);
  if (heard) parts.push(heard);
  if (sc.unsure > 0) parts.push(`${sc.unsure} unsure`);
  return parts.join('; ');
}

/** Names of the content features, singular and plural, for the ledger and the cut sheet. */
export const FEATURE_NAMES: Record<ContentFeature, [string, string]> = {
  callback: ['callback', 'callbacks'],
  wordplay: ['wordplay', 'wordplay'],
  triad: ['triad', 'triads'],
  reversal: ['reversal', 'reversals'],
  tag: ['tag', 'tags'],
  specific: ['specific detail', 'specific details'],
  endRhyme: ['end rhyme', 'end rhymes'],
  internalRhyme: ['internal rhyme', 'internal rhymes'],
  alliteration: ['alliteration', 'alliterations'],
  meter: ['steady-meter line', 'steady-meter lines'],
  anaphora: ['repeated opening', 'repeated openings'],
  volta: ['turn', 'turns'],
  contrast: ['contrast', 'contrasts'],
  question: ['question', 'questions'],
  callToAction: ['call to action', 'calls to action'],
  quotable: ['short line after a long one', 'short lines after long ones'],
  heldNote: ['held note', 'held notes'],
  finalNote: ['held ending', 'held endings'],
  range: ['wide-range phrase', 'wide-range phrases'],
};

/** "2 callbacks, 1 triad" (features found, most first), or null when nothing was found or nothing measured. */
export function contentSummary(sc: Scorecard): string | null {
  const c = sc.content;
  if (!c) return null;
  const found = (Object.keys(c.features) as ContentFeature[])
    .map((f) => ({ f, n: c.features[f] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const parts = found.slice(0, 3).map((x) => `${x.n} ${FEATURE_NAMES[x.f][x.n === 1 ? 0 : 1]}`);
  if (c.rhymedEnds && c.rhymedEnds.of > 0) parts.push(`rhymes ${c.rhymedEnds.rhymed} of ${c.rhymedEnds.of} line ends`);
  return parts.length ? parts.join(', ') : null;
}

/** The set clock as "3:12"; the TV adds "of a 5:00 set". */
export function clockLabel(state: SetState): string {
  return mmss(state.now);
}

// ---------------------------------------------------------------------------------------------
// Helpers

function lineById(state: SetState, id: number): LineEvent | undefined {
  return state.lines.find((l) => l.id === id);
}

function mid(line: LineEvent): number {
  return (line.t0 + line.t1) / 2;
}

function fixed(x: number, digits: number): string {
  return x.toFixed(digits);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
