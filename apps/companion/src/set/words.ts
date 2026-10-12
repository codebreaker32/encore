/**
 * Speech → text on the phone, wrapping the browser's SpeechRecognition.
 *
 * Three honest modes, shown on the phone and sent to the TV:
 *   'local'   the browser accepted `processLocally = true`, so the audio stays on the phone;
 *   'service' the browser's ordinary recogniser, which on Android Chrome may send audio to the
 *             browser vendor's speech service (the phone says so on screen);
 *   'off'     no recogniser, no permission, no reachable service, or switched off by the performer.
 *
 * Nothing in this file sends audio anywhere itself; it only reads what the browser recognises.
 * SpeechRecognition results carry no timestamps, so every result is stamped here with `now()`
 * (the caller passes the AudioContext clock) the moment it arrives.
 */
import type { WordsMode } from '@strumble/crowd';

export interface WordsState {
  mode: WordsMode;
  /** Why words are off, when they are. */
  reason?: string;
}

export interface WordsResult {
  /** Unique per recogniser result: restart generation + result index. */
  key: string;
  text: string;
  isFinal: boolean;
  /** Clock time of the first interim text for this result (≈ when the speech began, plus the recogniser's lag). */
  firstAt: number;
  /** Clock time of this update. */
  at: number;
}

// lib.dom has the result-list types but not the recogniser itself (vendors still prefix it).
interface RecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface RecognitionErrorLike {
  error: string;
  message?: string;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  /** Chrome 139+: ask for on-device recognition; absent elsewhere. */
  processLocally?: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: RecognitionErrorLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const RESTART_DELAY_MS = 150;
const MAX_ENDS_WITHOUT_START = 3;
const MAX_ERRORS = 3;
const NOT_STARTED = 'not started yet';

export class Words {
  state: WordsState;
  onResult?: (result: WordsResult) => void;
  onState?: (state: WordsState) => void;

  private enabledFlag = true;
  private rec: Recognition | null = null;
  private active = false;
  private generation = 0;
  private localRefused = false;
  private errors = 0;
  private endsWithoutStart = 0;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private readonly firstAt = new Map<string, number>();
  private waiters: ((state: WordsState) => void)[] = [];
  private readonly lang: string;

  constructor(private readonly opts: { now: () => number; lang?: string }) {
    const navLang = typeof navigator !== 'undefined' ? navigator.language : '';
    this.lang = opts.lang ?? (navLang || 'en-US');
    this.state = Words.supported()
      ? { mode: 'off', reason: NOT_STARTED }
      : { mode: 'off', reason: 'this browser has no speech recogniser' };
  }

  static supported(): boolean {
    return recognitionCtor() !== undefined;
  }

  /** The performer's switch. Off means `start()` does nothing and `mode` reports 'off'. */
  get enabled(): boolean {
    return this.enabledFlag;
  }

  setEnabled(on: boolean): void {
    this.enabledFlag = on;
    if (!on) {
      this.stop();
      return;
    }
    // Switched back on: forget a transient failure so the next probe tries again.
    if (this.state.mode === 'off' && Words.supported()) this.setState({ mode: 'off', reason: NOT_STARTED });
  }

  /** What the TV should be told: the measured mode, or 'off' while the performer has words off. */
  get mode(): WordsMode {
    return this.enabledFlag ? this.state.mode : 'off';
  }

  get running(): boolean {
    return this.active;
  }

  /**
   * Start once to learn which mode this browser gives us, then stop. Resolves with the state;
   * 'off' with a reason when the recogniser never started or failed straight away.
   */
  async probe(timeoutMs = 2500): Promise<WordsState> {
    if (!Words.supported() || !this.enabledFlag) return this.state;
    this.start();
    const settled = await new Promise<WordsState>((resolve) => {
      const timer = setTimeout(() => resolve({ mode: 'off', reason: 'the recogniser did not start' }), timeoutMs);
      this.waiters.push((state) => {
        clearTimeout(timer);
        resolve(state);
      });
    });
    // A recogniser can report `start` and fail a moment later (Chromium without a speech
    // service answers 'network' right after starting), so give it a beat before believing it.
    if (settled.mode !== 'off') await new Promise((r) => setTimeout(r, 500));
    if (settled.mode === 'off' && this.state.mode !== 'off') this.setState(settled);
    this.stop();
    return this.state;
  }

  /** Run continuously, restarting whenever the browser stops it, until `stop()`. */
  start(): void {
    if (!this.enabledFlag || !Words.supported() || this.active) return;
    this.active = true;
    this.errors = 0;
    this.endsWithoutStart = 0;
    this.launch(!this.localRefused);
  }

  stop(): void {
    this.active = false;
    this.generation++;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    const rec = this.rec;
    this.rec = null;
    this.firstAt.clear();
    if (rec) {
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    }
  }

  private launch(local: boolean): void {
    const Ctor = recognitionCtor();
    if (!Ctor) return this.fatal('this browser has no speech recogniser');
    const gen = ++this.generation;
    let rec: Recognition;
    try {
      rec = new Ctor();
    } catch (err) {
      return this.fatal(`could not create the recogniser (${describe(err)})`);
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.maxAlternatives = 1;
    // Checked before assigning: setting an unknown property would make the later `=== true` read trivially true.
    const askLocal = local && 'processLocally' in rec;
    if (askLocal) rec.processLocally = true;
    if (local && !askLocal) this.localRefused = true;
    let started = false;

    rec.onstart = () => {
      if (gen !== this.generation) return;
      started = true;
      this.errors = 0;
      this.endsWithoutStart = 0;
      const isLocal = askLocal && rec.processLocally === true;
      if (askLocal && !isLocal) this.localRefused = true;
      this.settle({ mode: isLocal ? 'local' : 'service' });
    };
    rec.onresult = (e) => {
      if (gen === this.generation) this.emit(gen, e);
    };
    rec.onerror = (e) => {
      if (gen !== this.generation) return;
      switch (e.error) {
        case 'no-speech':
        case 'aborted':
          return; // benign: `onend` follows and restarts
        case 'language-not-supported':
        case 'service-not-allowed':
        case 'phrases-not-supported':
          // On-device recognition refused (no language pack): fall back to the ordinary
          // recogniser at once. Chrome does not always follow this error with `end`.
          if (askLocal) return this.relaunchAsService(rec);
          return this.fatal(`the speech service refused (${e.error})`);
        case 'network':
          if (askLocal) return this.relaunchAsService(rec);
          return this.fatal('no speech service is reachable from this browser');
        case 'not-allowed':
          return this.fatal('microphone permission for speech was refused');
        case 'audio-capture':
          return this.fatal('the recogniser could not open the microphone');
        default:
          if (++this.errors >= MAX_ERRORS) this.fatal(`recogniser error (${e.error})`);
      }
    };
    rec.onend = () => {
      if (gen !== this.generation) return;
      this.rec = null;
      if (!this.active) return;
      if (!started && ++this.endsWithoutStart >= MAX_ENDS_WITHOUT_START) {
        return this.fatal('the recogniser stops before it starts');
      }
      // Chrome ends recognition after a stretch of silence; keep it going while we are asked to.
      this.restartTimer = setTimeout(() => {
        if (this.active && gen === this.generation) this.launch(askLocal && !this.localRefused);
      }, RESTART_DELAY_MS);
    };

    this.rec = rec;
    try {
      rec.start();
    } catch (err) {
      this.rec = null;
      if (askLocal) {
        this.localRefused = true;
        this.launch(false);
        return;
      }
      this.fatal(`the recogniser would not start (${describe(err)})`);
    }
  }

  /** Drop a recogniser that refused to run on-device and start the ordinary one in its place. */
  private relaunchAsService(rec: Recognition): void {
    this.localRefused = true;
    this.generation++; // whatever else this recogniser reports is stale now
    this.rec = null;
    try {
      rec.abort();
    } catch {
      // already stopped
    }
    if (this.active) this.launch(false);
  }

  private emit(gen: number, e: RecognitionEventLike): void {
    const now = this.opts.now();
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = (result[0]?.transcript ?? '').trim();
      if (!text) continue;
      const key = `${gen}:${i}`;
      const firstAt = this.firstAt.get(key) ?? now;
      this.firstAt.set(key, firstAt);
      this.onResult?.({ key, text, isFinal: result.isFinal, firstAt, at: now });
    }
  }

  private fatal(reason: string): void {
    this.stop();
    this.settle({ mode: 'off', reason });
  }

  private settle(state: WordsState): void {
    this.setState(state);
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w(state);
  }

  private setState(state: WordsState): void {
    if (this.state.mode === state.mode && this.state.reason === state.reason) return;
    this.state = state;
    this.onState?.(state);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
