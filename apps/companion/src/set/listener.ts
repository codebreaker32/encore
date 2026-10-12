/**
 * The phone's side of a set: the microphone, the voice-activity detector, the lines, the
 * recogniser's words, the pitch for singing, and the green-room "say your question".
 *
 * The phone is the timing master. Every event is stamped on the AudioContext clock as seconds
 * since t = 0, and `started.startedAt` tells the TV where t = 0 sits on the relay clock. Only
 * events leave the phone (times, levels, and words when the performer has words on); never audio.
 */
import { createPitchTracker, rms } from '@strumble/pitch-judge';
import type { LineEvent, PhoneMessage, PitchSample, TvMessage } from '@strumble/crowd';
import { describeWords } from './fillers';
import type { Words, WordsResult } from './words';

export type ArmCommand = Extract<TvMessage, { type: 'arm' }>;
export type ListenCommand = Extract<TvMessage, { type: 'listen' }>;
export type HushCommand = Extract<TvMessage, { type: 'hush' }>;

export type SetStatus =
  | { kind: 'idle' }
  /** Armed; waiting for the relay clock to reach `startAt`. */
  | { kind: 'armed'; set: ArmCommand }
  | { kind: 'live'; set: ArmCommand }
  /** Green room: capturing one utterance for the MC. */
  | { kind: 'listening'; promptId: string; transcript: string }
  | { kind: 'done' };

export interface Meter {
  level: number;
  floor: number;
  speaking: boolean;
  /** Seconds since t = 0 while live; 0 otherwise. */
  t: number;
  lines: number;
  /** The TV is making sound (a reaction, the MC): the microphone counts as silent. */
  hushed: boolean;
}

export interface SetIo {
  context: AudioContext;
  analyser: AnalyserNode;
  words: Words;
  send: (msg: PhoneMessage) => void;
  /** Relay clock (couch-link serverNow), to wait for `startAt` and to report `startedAt`. */
  serverNow: () => number;
  onStatus?: (status: SetStatus) => void;
  /** About ten times a second; cheap enough to render. */
  onMeter?: (meter: Meter) => void;
}

const POLL_MS = 20;
const METER_MS = 100;
const PITCH_MS = 100;
const PITCH_FLUSH_MS = 250;
const PITCH_FRAME = 2048;
const PITCH_CLARITY = 0.8;
const FLOOR_WINDOW_SEC = 1.5;
const FLOOR_SAMPLES = Math.round((FLOOR_WINDOW_SEC * 1000) / POLL_MS);
/** The floor while nothing has been measured yet (a quiet room is about 0.001–0.005). */
const FLOOR_DEFAULT = 0.003;
/** A floor above this would push the speaking threshold past quiet speech, so it is capped. */
const FLOOR_CAP = 0.02;
const SPEAK_MIN = 0.02;
const SPEAK_RATIO = 3;
const QUIET_MIN = 0.012;
const QUIET_RATIO = 2;
const SPEAK_HOLD_SEC = 0.06;
const QUIET_HOLD_SEC = 0.3;
const MIN_LINE_SEC = 0.25;
const END_WINDOW_SEC = 0.4;
/** A recogniser result belongs to the line whose [t0 − 0.3, t1 + 0.6] overlaps it most. */
const WORDS_BEFORE_SEC = 0.3;
const WORDS_AFTER_SEC = 0.6;
/** Words with no overlapping line go to the nearest line within this. */
const WORDS_NEAREST_SEC = 1.5;
/** The first interim text arrives about this long after the speech began. */
const RESULT_LAG_SEC = 0.6;
/** A final result arrives about this long after the speech ended. */
const FINAL_LAG_SEC = 0.5;
const LISTEN_SILENCE_SEC = 1.5;
/** The TV's sound rings on a little after it stops (reverb, the speaker's own latency). */
const HUSH_TAIL_MS = 250;
/** Hush spans kept for dropping recogniser results that heard the TV. */
const HUSH_KEEP_SEC = 30;

interface Sample {
  /** Absolute AudioContext time (centre of the analyser window). */
  a: number;
  level: number;
}

interface LiveSet {
  cmd: ArmCommand;
  /** AudioContext time of t = 0. */
  t0: number;
  lines: LineEvent[];
  /** Absolute time the voice last stopped, for `pauseBefore`. */
  lastVoiceEnd?: number;
  nextId: number;
  finished: boolean;
  /** Recognised text per line, merged when a line gets more than one result. */
  textByLine: Map<number, string>;
}

interface Listening {
  promptId: string;
  texts: Map<string, string>;
  lastSpeechEnd?: number;
  answered: boolean;
  timer: ReturnType<typeof setTimeout>;
}

type Result = WordsResult & { lineId?: number };

export class SetListener {
  private readonly buffer: Float32Array<ArrayBuffer>;
  private readonly pitchFrame: Float32Array<ArrayBuffer>;
  private readonly frameSec: number;
  private readonly pitch: ReturnType<typeof createPitchTracker>;
  private poll?: ReturnType<typeof setInterval>;
  private meterTimer?: ReturnType<typeof setInterval>;
  private pitchTimer?: ReturnType<typeof setInterval>;
  private pitchFlushTimer?: ReturnType<typeof setInterval>;
  private setTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly ring: number[] = [];
  private floor = FLOOR_DEFAULT;
  private level = 0;
  private speaking = false;
  private aboveSince?: number;
  private belowSince?: number;
  private segStart = 0;
  private samples: Sample[] = [];
  private pending?: ArmCommand;
  private set?: LiveSet;
  private readonly results = new Map<string, Result>();
  private pitchQueue: PitchSample[] = [];
  private listening?: Listening;
  /** Relay-clock ms until which the microphone counts as silent. */
  private hushUntil = 0;
  private hushed = false;
  /** Hush spans on the audio clock. */
  private hushSpans: { start: number; end: number }[] = [];

  constructor(private readonly io: SetIo) {
    this.buffer = new Float32Array(io.analyser.fftSize);
    const frame = Math.min(PITCH_FRAME, this.buffer.length);
    this.pitchFrame = this.buffer.subarray(this.buffer.length - frame) as Float32Array<ArrayBuffer>;
    this.pitch = createPitchTracker(frame, { minClarity: 0, minHz: 60, maxHz: 1400 });
    this.frameSec = io.analyser.fftSize / io.context.sampleRate;
    io.words.onResult = (r) => this.onWords(r);
    this.poll = setInterval(() => this.tick(), POLL_MS);
    this.meterTimer = setInterval(() => this.meter(), METER_MS);
  }

  get live(): boolean {
    return this.set !== undefined;
  }

  /** The TV asked for a set: wait for the relay clock to reach `startAt`, then t = 0. */
  arm(cmd: ArmCommand): void {
    if (this.set) this.finish(this.rel(this.now()));
    this.clearSetTimers();
    this.pending = cmd;
    this.io.onStatus?.({ kind: 'armed', set: cmd });
    // Warm the recogniser up before t = 0 (no-op when words are off).
    this.io.words.start();
    const delay = Math.max(0, cmd.startAt - this.io.serverNow());
    this.setTimers.push(setTimeout(() => this.goLive(cmd), delay));
  }

  /** The TV ended the set (OK pressed). */
  stop(setId?: string): void {
    if (this.pending && (!setId || this.pending.setId === setId)) {
      const { setId: id } = this.pending;
      this.clearSetTimers();
      this.pending = undefined;
      this.io.words.stop();
      this.io.send({ type: 'finished', setId: id, at: 0 });
      this.io.onStatus?.({ kind: 'done' });
      return;
    }
    if (this.set && (!setId || this.set.cmd.setId === setId)) this.finish(this.rel(this.now()));
  }

  /**
   * The TV is about to make sound until `untilMs` (relay clock). Until then plus a short tail the
   * microphone counts as silent: no line starts, a line in progress ends now, the noise floor is
   * not fed, pitch reads null, and recogniser results from that stretch are dropped.
   */
  hush(cmd: HushCommand): void {
    const current = this.set?.cmd.setId ?? this.pending?.setId;
    if (current !== undefined && cmd.setId !== current) return;
    const nowMs = this.io.serverNow();
    const until = cmd.untilMs + HUSH_TAIL_MS;
    if (until <= nowMs || until <= this.hushUntil) return;
    const a = this.now();
    const end = a + (until - nowMs) / 1000;
    this.hushSpans = this.hushSpans.filter((h) => h.end > a - HUSH_KEEP_SEC);
    const last = this.hushSpans[this.hushSpans.length - 1];
    if (last && last.end >= a) last.end = end;
    else this.hushSpans.push({ start: a, end });
    this.hushUntil = until;
    this.updateHush(a);
  }

  /** Green room: capture one utterance for the MC. */
  listen(cmd: ListenCommand): void {
    if (this.listening) this.answer(null);
    const timer = setTimeout(() => this.answer(this.transcript() || null), Math.max(1, cmd.maxSec) * 1000);
    this.listening = { promptId: cmd.promptId, texts: new Map(), answered: false, timer };
    this.io.words.start();
    this.io.onStatus?.({ kind: 'listening', promptId: cmd.promptId, transcript: '' });
  }

  cancelListen(promptId: string): void {
    if (this.listening?.promptId === promptId) this.answer(null);
  }

  /** Typed on the phone instead of spoken (words off, or the performer preferred to type). */
  answerTyped(promptId: string, text: string): void {
    if (this.listening?.promptId === promptId) this.answer(text.trim() || null);
  }

  /** Stop everything; the listener cannot be reused afterwards. */
  destroy(): void {
    if (this.set) this.finish(this.rel(this.now()));
    this.clearSetTimers();
    this.pending = undefined;
    if (this.listening) this.answer(null);
    if (this.poll) clearInterval(this.poll);
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.poll = this.meterTimer = undefined;
    this.io.words.stop();
    this.io.words.onResult = undefined;
  }

  // ---- clock -------------------------------------------------------------------------------

  /** Absolute audio time of the centre of the analyser's current window. */
  private now(): number {
    return this.io.context.currentTime - this.frameSec / 2;
  }

  /** Seconds since t = 0 (0 when no set is live). */
  private rel(a: number): number {
    return this.set ? a - this.set.t0 : 0;
  }

  // ---- polling -----------------------------------------------------------------------------

  private tick(): void {
    const { analyser } = this.io;
    analyser.getFloatTimeDomainData(this.buffer);
    const level = rms(this.buffer);
    const a = this.now();
    this.level = level;
    // While the TV makes sound the microphone counts as silent, and that audio never feeds the floor.
    if (!this.updateHush(a)) {
      this.ring.push(level);
      if (this.ring.length > FLOOR_SAMPLES) this.ring.shift();
      // The floor is refreshed until the set goes live, then frozen for the whole set.
      if (!this.set) this.floor = this.measureFloor();
      this.detectVoice(a, level);
    }
    const set = this.set;
    if (set && !set.finished && a - set.t0 >= set.cmd.durationSec) this.finish(set.cmd.durationSec);
    const l = this.listening;
    if (l && !this.speaking && l.lastSpeechEnd !== undefined && a - l.lastSpeechEnd >= LISTEN_SILENCE_SEC) {
      const text = this.transcript();
      if (text) this.answer(text);
    }
  }

  /** Track the hush on the relay clock; on entering it, end any line in progress. */
  private updateHush(a: number): boolean {
    const hushed = this.io.serverNow() < this.hushUntil;
    if (hushed && !this.hushed) {
      // The line ends where the TV's sound begins, or where the voice had already stopped (hangover).
      if (this.speaking) this.voiceEnd(this.belowSince ?? a, this.level);
      this.aboveSince = undefined;
      this.belowSince = undefined;
      this.samples = [];
    }
    this.hushed = hushed;
    return hushed;
  }

  private inHush(a: number): boolean {
    return this.hushSpans.some((h) => a >= h.start && a <= h.end);
  }

  private measureFloor(): number {
    if (this.ring.length === 0) return FLOOR_DEFAULT;
    const sorted = [...this.ring].sort((x, y) => x - y);
    return Math.min(FLOOR_CAP, sorted[Math.floor(sorted.length / 2)]);
  }

  private meter(): void {
    this.io.onMeter?.({
      level: this.level,
      floor: this.floor,
      speaking: this.speaking,
      t: this.set ? Math.max(0, this.rel(this.now())) : 0,
      lines: this.set?.lines.length ?? 0,
      hushed: this.hushed,
    });
  }

  // ---- voice activity ----------------------------------------------------------------------

  private detectVoice(a: number, level: number): void {
    const speak = Math.max(SPEAK_MIN, this.floor * SPEAK_RATIO);
    const quiet = Math.max(QUIET_MIN, this.floor * QUIET_RATIO);
    if (!this.speaking) {
      if (level > speak) {
        if (this.aboveSince === undefined) {
          this.aboveSince = a;
          this.samples = [];
        }
        this.samples.push({ a, level });
        if (a - this.aboveSince >= SPEAK_HOLD_SEC) this.voiceStart(this.aboveSince, level);
      } else {
        this.aboveSince = undefined;
        this.samples = [];
      }
      return;
    }
    this.samples.push({ a, level });
    if (level < quiet) {
      if (this.belowSince === undefined) this.belowSince = a;
      else if (a - this.belowSince >= QUIET_HOLD_SEC) this.voiceEnd(this.belowSince, level);
    } else {
      this.belowSince = undefined;
    }
  }

  private voiceStart(at: number, level: number): void {
    this.speaking = true;
    this.segStart = at;
    this.aboveSince = undefined;
    this.belowSince = undefined;
    const set = this.set;
    if (set && !set.finished) {
      this.io.send({
        type: 'voice',
        setId: set.cmd.setId,
        at: round3(Math.max(0, this.rel(at))),
        speaking: true,
        level: round4(level),
      });
    }
  }

  /** `at` is the end of voice (the hangover is not part of the line). */
  private voiceEnd(at: number, level: number): void {
    this.speaking = false;
    this.aboveSince = undefined;
    this.belowSince = undefined;
    const start = this.segStart;
    const samples = this.samples.filter((s) => s.a <= at);
    this.samples = [];
    if (this.listening) this.listening.lastSpeechEnd = at;
    const set = this.set;
    if (!set || set.finished) return;
    this.io.send({
      type: 'voice',
      setId: set.cmd.setId,
      at: round3(this.rel(at)),
      speaking: false,
      level: round4(level),
    });
    if (at - start >= MIN_LINE_SEC && samples.length > 0) this.emitLine(set, start, at, samples);
    set.lastVoiceEnd = at;
    // Finals held for the segment that just ended now belong somewhere definite.
    for (const r of this.results.values()) if (r.isFinal && r.lineId === undefined) this.assignFinal(set, r);
  }

  private emitLine(set: LiveSet, start: number, end: number, samples: Sample[]): void {
    const id = set.nextId++;
    let sum = 0;
    let peak = 0;
    let tailSum = 0;
    let tailN = 0;
    for (const s of samples) {
      sum += s.level;
      if (s.level > peak) peak = s.level;
      if (s.a >= end - END_WINDOW_SEC) {
        tailSum += s.level;
        tailN++;
      }
    }
    const line: LineEvent = {
      id,
      t0: round3(Math.max(0, this.rel(start))),
      t1: round3(Math.min(set.cmd.durationSec, this.rel(end))),
      level: round4(sum / samples.length),
      endLevel: round4(tailN > 0 ? tailSum / tailN : sum / samples.length),
      peakLevel: round4(peak),
      pauseBefore: round3(set.lastVoiceEnd === undefined ? 0 : Math.max(0, start - set.lastVoiceEnd)),
    };
    // Words already finalised for this span go with the line; later ones follow as words-for.
    const window: [number, number] = [start - WORDS_BEFORE_SEC, end + WORDS_AFTER_SEC];
    for (const r of this.results.values()) {
      if (r.isFinal && r.lineId === undefined && overlap(resultSpan(r), window) > 0) this.claim(set, r, id);
    }
    const text = set.textByLine.get(id);
    if (text) Object.assign(line, describeWords(text));
    else {
      // No final words yet (they lag the voice by about half a second): send the recogniser's interim guess, marked as
      // such, so the TV can judge the words at the beat. The final words replace it as `words-for`.
      const interim = [...this.results.values()]
        .filter((r) => !r.isFinal && r.lineId === undefined && overlap(resultSpan(r), window) > 0)
        .sort((a, b) => a.firstAt - b.firstAt)
        .map((r) => r.text)
        .join(' ')
        .trim();
      if (interim) Object.assign(line, describeWords(interim), { interim: true });
    }
    set.lines.push(line);
    this.io.send({ type: 'line', setId: set.cmd.setId, line });
  }

  // ---- words ---------------------------------------------------------------------------------

  private onWords(r: WordsResult): void {
    // The recogniser heard the TV (the room, the MC), not the performer.
    const span = resultSpan(r);
    if (this.inHush((span.start + span.end) / 2)) return;
    const l = this.listening;
    if (l) {
      l.texts.set(r.key, r.text);
      this.io.onStatus?.({ kind: 'listening', promptId: l.promptId, transcript: this.transcript() });
      if (r.isFinal) this.answer(this.transcript());
      return;
    }
    const set = this.set;
    if (!set || set.finished) return;
    const entry: Result = { ...r, lineId: this.results.get(r.key)?.lineId };
    this.results.set(r.key, entry);
    if (entry.isFinal && entry.lineId === undefined) this.assignFinal(set, entry);
  }

  /** Give a final result to the line it overlaps best, unless the open segment claims it later. */
  private assignFinal(set: LiveSet, r: Result): void {
    const span = resultSpan(r);
    let best: LineEvent | undefined;
    let bestOverlap = 0;
    for (const line of set.lines) {
      const o = overlap(span, [set.t0 + line.t0 - WORDS_BEFORE_SEC, set.t0 + line.t1 + WORDS_AFTER_SEC]);
      if (o > bestOverlap) {
        best = line;
        bestOverlap = o;
      }
    }
    if (this.speaking && overlap(span, [this.segStart - WORDS_BEFORE_SEC, Infinity]) > bestOverlap) return;
    if (!best) {
      let nearest = Infinity;
      for (const line of set.lines) {
        const d = Math.min(Math.abs(set.t0 + line.t1 - span.start), Math.abs(set.t0 + line.t0 - span.end));
        if (d < nearest && d <= WORDS_NEAREST_SEC) {
          nearest = d;
          best = line;
        }
      }
    }
    if (!best) {
      if (!this.speaking) r.lineId = -1; // nothing to attach it to; forget it
      return;
    }
    this.claim(set, r, best.id);
    const d = describeWords(set.textByLine.get(best.id) ?? '');
    this.io.send({
      type: 'words-for',
      setId: set.cmd.setId,
      lineId: best.id,
      words: d.words,
      text: d.text,
      fillers: d.fillers,
    });
  }

  private claim(set: LiveSet, r: Result, lineId: number): void {
    r.lineId = lineId;
    const prev = set.textByLine.get(lineId);
    set.textByLine.set(lineId, prev ? `${prev} ${r.text}` : r.text);
  }

  private transcript(): string {
    return this.listening ? [...this.listening.texts.values()].join(' ').trim() : '';
  }

  // ---- pitch (singing) -----------------------------------------------------------------------

  private samplePitch(): void {
    const set = this.set;
    if (!set || set.finished) return;
    const t = round3(Math.max(0, this.rel(this.now())));
    if (this.hushed) {
      this.pitchQueue.push({ t, midi: null, clarity: 0, level: 0 });
      return;
    }
    const reading = this.pitch(this.pitchFrame, this.io.context.sampleRate);
    const level = this.level;
    const gate = Math.max(QUIET_MIN, this.floor * QUIET_RATIO);
    const voiced = reading !== null && reading.clarity >= PITCH_CLARITY && level >= gate;
    this.pitchQueue.push({
      t,
      midi: voiced ? round2(reading.midi) : null,
      clarity: round3(reading?.clarity ?? 0),
      level: round4(level),
    });
  }

  private flushPitch(): void {
    const set = this.set;
    if (!set || this.pitchQueue.length === 0) return;
    const samples = this.pitchQueue;
    this.pitchQueue = [];
    this.io.send({ type: 'pitch', setId: set.cmd.setId, samples });
  }

  // ---- set lifecycle -------------------------------------------------------------------------

  private goLive(cmd: ArmCommand): void {
    this.pending = undefined;
    const t0 = this.io.context.currentTime;
    const startedAt = this.io.serverNow();
    this.set = { cmd, t0, lines: [], nextId: 1, finished: false, textByLine: new Map() };
    this.results.clear();
    this.pitchQueue = [];
    if (this.speaking) {
      // Already talking at t = 0: the line starts with the set.
      this.segStart = t0;
      this.samples = this.samples.filter((s) => s.a >= t0);
      this.io.send({ type: 'voice', setId: cmd.setId, at: 0, speaking: true, level: round4(this.level) });
    } else {
      this.aboveSince = undefined;
      this.samples = [];
    }
    this.io.send({ type: 'started', setId: cmd.setId, startedAt });
    this.io.onStatus?.({ kind: 'live', set: cmd });
    if (cmd.act === 'singing') {
      this.pitchTimer = setInterval(() => this.samplePitch(), PITCH_MS);
      this.pitchFlushTimer = setInterval(() => this.flushPitch(), PITCH_FLUSH_MS);
    }
    // Never past the slot, even if the audio clock stalls (a locked screen suspends the context).
    this.setTimers.push(setTimeout(() => this.finish(cmd.durationSec), (cmd.durationSec + 0.5) * 1000));
  }

  private finish(at: number): void {
    const set = this.set;
    if (!set || set.finished) return;
    const end = Math.min(Math.max(0, at), set.cmd.durationSec);
    if (this.speaking) this.voiceEnd(set.t0 + end, this.level);
    set.finished = true;
    this.flushPitch();
    this.io.send({ type: 'finished', setId: set.cmd.setId, at: round3(end) });
    this.clearSetTimers();
    this.set = undefined;
    this.results.clear();
    this.io.words.stop();
    this.io.onStatus?.({ kind: 'done' });
  }

  private answer(text: string | null): void {
    const l = this.listening;
    if (!l || l.answered) return;
    l.answered = true;
    clearTimeout(l.timer);
    this.listening = undefined;
    if (!this.set) this.io.words.stop();
    this.io.send({ type: 'said', promptId: l.promptId, text });
    this.io.onStatus?.(this.set ? { kind: 'live', set: this.set.cmd } : { kind: 'idle' });
  }

  private clearSetTimers(): void {
    for (const t of this.setTimers) clearTimeout(t);
    this.setTimers = [];
    if (this.pitchTimer) clearInterval(this.pitchTimer);
    if (this.pitchFlushTimer) clearInterval(this.pitchFlushTimer);
    this.pitchTimer = this.pitchFlushTimer = undefined;
  }
}

/** The stretch of audio a recogniser result most likely covers, in absolute audio time. */
function resultSpan(r: WordsResult): { start: number; end: number } {
  const start = r.firstAt - RESULT_LAG_SEC;
  const end = r.isFinal ? r.at - FINAL_LAG_SEC : r.at;
  return { start, end: Math.max(end, start + 0.2) };
}

function overlap(span: { start: number; end: number }, window: [number, number]): number {
  return Math.max(0, Math.min(span.end, window[1]) - Math.max(span.start, window[0]));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
