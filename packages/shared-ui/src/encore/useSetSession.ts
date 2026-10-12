import { useCallback, useEffect, useRef, useState } from 'react';
import { CouchLinkClient, type Status } from 'couch-link';
import type {
  McLineRequest,
  MomentFacts,
  PhoneMessage,
  SetConfig,
  SetMoment,
  SetRecord,
  TvMessage,
  WordsMode,
} from '@strumble/crowd';
import { config } from './config';
import {
  createSetState,
  judgeRequests,
  JUDGE_DEADLINE_SEC,
  memoryFor,
  reduceSet,
  type SetAction,
  type SetState,
} from '@strumble/crowd';
import { replay, type TimedAction } from './demo';
import { introFacts, momentAction, momentsOf } from './moments';
import { requestJudge, requestLine, type LineResult } from './useMc';
import type { VoiceClip } from './world/McVoice';
import { voiceClip } from './world/sounds';

export interface Phone {
  id: string;
  name: string;
  connected: boolean;
  micReady: boolean;
  words: WordsMode;
  reason?: string;
}

export interface Said {
  promptId: string;
  text: string | null;
}

export interface SetSession {
  link: Status;
  room?: string;
  phones: Phone[];
  /** The first connected phone whose microphone is live: the performer's. */
  phone?: Phone;
  /** The engine state while a set is armed, live or just done; null on the bill. */
  state: SetState | null;
  serverNow(): number;
  /** OK on the bill: the phone starts listening at `startAt` (1.5 s from now); the TV shows the intro card meanwhile. */
  arm(set: SetConfig): void;
  /**
   * The selection has settled on a set (the bill, or the cut sheet once the debrief is in): keep its intro written ahead
   * of OK, so OK starts with the MC's words and voice ready instead of waiting on the model. It is asked for now, again
   * every 7 minutes while the set stays the same (a warm intro is used for 8, inside its voice URL's 10), and again at
   * once after a failed ask.
   * `null` stops keeping it warm. `arm` uses the answer when the set matches; otherwise it asks again.
   */
  warmIntro(set: IntroSet | null): void;
  /** The warm intro's voice, for the TV to load paused so OK starts it at once; null without one. */
  warmVoice: VoiceClip | null;
  /** OK during the set: the set ends now and the phone stops. */
  finish(): void;
  /** Back: the phone stops and the set is dropped. */
  stop(): void;
  /** Green room: the phone captures one utterance. */
  listen(promptId: string, maxSec: number): void;
  cancelListen(promptId: string): void;
  /** The latest `said` from the phone. */
  said: Said | null;
  /** The intro's words, asked for when OK was pressed (null until the model answers, or if it doesn't). */
  armedIntro: string | null;
  /** The model's words per engine moment id, as they arrived. */
  mcText: Record<number, string>;
  /** Drive the engine without a phone (the web demo). */
  dispatch(action: SetAction): void;
  /** The TV is making sound for `sec` seconds: the phone ignores its microphone until then (live or armed sets only). */
  hush(sec: number): void;
  /** Start a set with no phone at a relay-clock time (the web demo), replaying `backlog` with ticks up to now. */
  startLocal(set: SetConfig, startedAt: number, backlog?: TimedAction[]): void;
}

/** The least time from OK to the set's t = 0. */
const ARM_LEAD_MS = 1500;
/** A breath between the intro's last word and the performer's first. */
const AFTER_INTRO_MS = 600;

/**
 * How long the MC's voice takes to say an intro: Polly's pace (about 2.3 words a second for these voices, measured on
 * the Android TV emulator, 2026-10-12: 5.0 s for a 10-word intro, 8.6 s for 20), slower for deadpan Dev (85 %), a beat
 * for each "...", and the player's start.
 */
export function introSpeechMs(text: string, persona: SetConfig['persona']): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const beats = (text.match(/\.\.\.|…/g) || []).length;
  const rate = persona === 'deadpan' ? 2.0 : 2.3;
  return Math.round(400 + (words / rate) * 1000 + beats * 400);
}

/** If the phone never reports `started`, the clock starts at the armed time after this grace (the show must go on). */
const START_GRACE_MS = 3000;
/** A moment first seen this long after it happened (a replayed backlog) is past any card window: no request. */
const STALE_MOMENT_SEC = 6;

/** What an intro depends on: everything in the set except its id and the words mode. */
export type IntroSet = Pick<SetConfig, 'act' | 'venue' | 'persona' | 'performer' | 'durationSec'>;

/**
 * A warmed intro older than this is asked for again. Its words depend only on the selection, the performer and how many
 * sets they have on record (all in its key), so it keeps; the limit is its voice, a presigned Polly URL valid for 600 s,
 * which must still open when OK plays it. It was 90 s, renewed every 75 s, which made most of the QA's 38 intro calls
 * for 8 sets while the bill or cut sheet simply rested (2026-10-12, issue 11).
 */
const WARM_INTRO_TTL_MS = 480000;
/** While the selection rests, its warm intro is written again this long after the last one, before it expires. */
const WARM_INTRO_RENEW_MS = 420000;
/**
 * A failed warm-up is asked again at once, but never sooner than this after the failed ask began: a slow failure (the
 * model's timeout) retries straight away, a fast one (the service is down) does not loop.
 */
const WARM_INTRO_RETRY_MS = 4000;

interface WarmIntro {
  key: string;
  at: number;
  /** Resolves to the model's answer; a failed one is never reused. */
  result: Promise<LineResult>;
  settled: LineResult | null;
  /** Its voice, once the answer is in (null without audio). */
  voice: VoiceClip | null;
}

function introKey(set: IntroSet, historyLength: number): string {
  return [set.act, set.venue, set.persona, set.performer, set.durationSec, historyLength].join('|');
}

/** A warm intro for `key` that is younger than `maxAgeMs` and has not failed. */
function warmFor(warm: WarmIntro | null, key: string, maxAgeMs: number): boolean {
  return (
    !!warm && warm.key === key && Date.now() - warm.at < maxAgeMs && !(warm.settled && warm.settled.status !== 'ready')
  );
}

interface IntroAsk {
  setId: string;
  result: LineResult | null;
  /** The engine's intro moment id, once it exists. */
  momentId: number | null;
}

/**
 * Hosts the couch-link room, keeps the engine state with `reduceSet`, ticks it every `tickMs` with
 * `now = (serverNow() − startedAt) / 1000`, maps phone messages to engine actions and sends `arm` / `stop` / `listen`.
 * The phone is the timing master: every event carries the phone's own seconds since t = 0.
 */
export function useSetSession(
  opts: {
    history: () => SetRecord[];
    /** The MC's voice for the intro, the one moment voiced during a set (the other cards stay text-only). */
    onVoice?: (clip: VoiceClip) => void;
  } = { history: () => [] },
): SetSession {
  const clientRef = useRef<CouchLinkClient | null>(null);
  const stateRef = useRef<SetState | null>(null);
  const armedRef = useRef<{ setId: string; startAt: number } | null>(null);
  const [state, setStateValue] = useState<SetState | null>(null);
  const [link, setLink] = useState<Status>('idle');
  const [room, setRoom] = useState<string | undefined>();
  const [phones, setPhones] = useState<Phone[]>([]);
  const [said, setSaid] = useState<Said | null>(null);
  const [armedIntro, setArmedIntro] = useState<string | null>(null);
  const [mcText, setMcText] = useState<Record<number, string>>({});
  const historyRef = useRef(opts.history);
  historyRef.current = opts.history;
  const voiceRef = useRef(opts.onVoice);
  voiceRef.current = opts.onVoice;
  const handledRef = useRef<Set<string>>(new Set());
  const introRef = useRef<IntroAsk | null>(null);
  const warmRef = useRef<WarmIntro | null>(null);
  /** The keep-warm loop: a new generation cancels the one before. */
  const warmLoopRef = useRef<{ gen: number; timer: ReturnType<typeof setTimeout> | null }>({ gen: 0, timer: null });
  const [warmVoice, setWarmVoice] = useState<VoiceClip | null>(null);

  const setState = useCallback((next: SetState | null) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const dispatch = useCallback(
    (action: SetAction) => {
      const current = stateRef.current;
      if (!current) return;
      const next = reduceSet(current, action);
      if (next !== current) setState(next);
    },
    [setState],
  );

  const serverNow = useCallback(() => (clientRef.current ? clientRef.current.serverNow() : Date.now()), []);

  const send = useCallback((msg: TvMessage) => {
    const client = clientRef.current;
    if (client) client.send('all', msg);
  }, []);

  const updatePhone = useCallback((id: string, patch: Partial<Phone>) => {
    setPhones((list) => {
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0)
        return [...list, { id, name: patch.name || 'Phone', connected: true, micReady: false, words: 'off', ...patch }];
      const next = list.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  useEffect(() => {
    const client = new CouchLinkClient({ url: config.relayUrl, role: { kind: 'host' } });
    clientRef.current = client;
    const onPhone = (from: string, data: unknown) => {
      const msg = data as PhoneMessage;
      if (!msg || typeof msg !== 'object') return;
      const current = stateRef.current;
      const forThisSet = (setId: string) => !!current && current.config.setId === setId;
      switch (msg.type) {
        case 'mic':
          updatePhone(from, { micReady: msg.ready, words: msg.words, reason: msg.reason });
          return;
        case 'words':
          updatePhone(from, { words: msg.mode });
          if (current) dispatch({ type: 'words', mode: msg.mode });
          return;
        case 'started':
          if (forThisSet(msg.setId) && current && current.phase === 'armed')
            dispatch({ type: 'start', startedAt: msg.startedAt });
          return;
        case 'voice':
          if (forThisSet(msg.setId)) dispatch({ type: 'voice', at: msg.at, speaking: msg.speaking, level: msg.level });
          return;
        case 'line':
          if (forThisSet(msg.setId)) {
            dispatch({ type: 'line', line: msg.line });
            sendJudgesRef.current();
          }
          return;
        case 'words-for':
          if (forThisSet(msg.setId)) {
            dispatch({ type: 'words-for', lineId: msg.lineId, words: msg.words, text: msg.text, fillers: msg.fillers });
            sendJudgesRef.current();
          }
          return;
        case 'pitch':
          if (forThisSet(msg.setId)) dispatch({ type: 'pitch', samples: msg.samples });
          return;
        case 'finished':
          if (forThisSet(msg.setId)) dispatch({ type: 'finish', now: msg.at });
          return;
        case 'said':
          setSaid({ promptId: msg.promptId, text: msg.text });
          return;
        default:
          return;
      }
    };
    const offs = [
      client.on('status', setLink),
      client.on('session', (s) => setRoom(s.room)),
      client.on('presence', (id, name, connected) => {
        updatePhone(id, { name, connected, ...(connected ? {} : { micReady: false }) });
        if (connected)
          client.send(id, {
            type: 'idle',
            message: 'Put the phone on the table, face up. The TV says when you are live.',
          } as TvMessage);
      }),
      client.on('message', (from, data) => {
        if (from !== 'host') onPhone(from, data);
      }),
    ];
    client.connect();
    const tick = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      const t = client.serverNow();
      if (current.phase === 'live' && current.startedAt !== null) {
        dispatch({ type: 'tick', now: (t - current.startedAt) / 1000 });
      } else if (current.phase === 'armed' && armedRef.current && t >= armedRef.current.startAt + START_GRACE_MS) {
        // No `started` from the phone: start the clock at the armed time so the show goes on.
        dispatch({ type: 'start', startedAt: armedRef.current.startAt });
      }
    }, config.tickMs);
    return () => {
      clearInterval(tick);
      offs.forEach((off) => off());
      client.close();
      clientRef.current = null;
    };
  }, [dispatch, updatePhone]);

  /** The intro's words in the MC's voice, for the TV's queue; an answer without a playable URL stays text. */
  const speak = useCallback((setId: string, momentId: number, result: LineResult) => {
    if (result.status !== 'ready' || !voiceRef.current) return;
    const clip = voiceClip(result.line.audio, {
      key: `${setId}:${momentId}`,
      text: result.line.text,
      live: true,
      setId,
    });
    if (clip) voiceRef.current(clip);
  }, []);

  /** Hand the model's words (or its silence) for one moment to the engine; only for this set's own moments. */
  const deliver = useCallback(
    (setId: string, momentId: number, result: LineResult, voice = false) => {
      const current = stateRef.current;
      if (!current || current.config.setId !== setId) return;
      if (result.status === 'ready') {
        setMcText((m) => ({ ...m, [momentId]: result.line.text }));
        dispatch(momentAction({ type: 'mc-line', momentId, text: result.line.text }));
        const moment = momentsOf(current).find((x) => x.id === momentId);
        if (voice && moment && moment.kind === 'intro') speak(setId, momentId, result);
      } else {
        dispatch(momentAction({ type: 'mc-silent', momentId }));
      }
    },
    [dispatch, speak],
  );

  const lineRequest = useCallback((set: IntroSet, kind: SetMoment['kind'], facts: MomentFacts): McLineRequest => {
    return {
      kind: 'line',
      moment: kind,
      persona: set.persona,
      performer: set.performer,
      act: set.act,
      venue: set.venue,
      durationSec: set.durationSec,
      facts,
      // Only this performer's sets: the MC never credits one performer's numbers to the next.
      history: memoryFor(historyRef.current(), set.performer, config.memorySets),
      // Only the intro is voiced: between-bit and heckle cards land mid-set, so they stay text, and at the end card the
      // debrief, which speaks as the cut sheet comes up, is already on its way.
      speak: kind === 'intro',
    };
  }, []);

  // Every new moment the engine records gets its words from the model; the intro was asked for at arm time.
  useEffect(() => {
    const moments = momentsOf(state);
    if (!state || moments.length === 0) return;
    const setId = state.config.setId;
    for (const m of moments) {
      const key = `${setId}:${m.id}`;
      if (handledRef.current.has(key)) continue;
      handledRef.current.add(key);
      const intro = introRef.current;
      if (m.kind === 'intro' && intro && intro.setId === setId) {
        intro.momentId = m.id;
        if (intro.result) deliver(setId, m.id, intro.result);
        continue;
      }
      // Already past its window (a replayed backlog): nothing was asked, so nothing is reported; the engine marks it late.
      if (m.kind !== 'end' && state.now - m.facts.at > STALE_MOMENT_SEC) continue;
      requestLine(lineRequest(state.config, m.kind, m.facts)).then((result) =>
        deliver(setId, m.id, result, m.kind === 'intro'),
      );
    }
  }, [state, deliver, dispatch, lineRequest]);

  // Content judging: each line with words goes to the MC service's content judge once, the moment its words reach the
  // TV (the phone sends the recogniser's interim words with the line). It is sent from the phone-message handler itself,
  // not after a render: on the Google TV a render after the line cost the judge most of its 0.6 s (7 in time, 23 late,
  // 2026-10-12, while the service answered within 250 ms). Requests run in parallel, each on its own promise, so a slow
  // one never holds up the next. The engine waits for the answer at most JUDGE_DEADLINE_SEC after the line and decides
  // without it otherwise, on the TV's own ticks, so nothing here can hold a reaction back.
  const sendJudges = useCallback(() => {
    const current = stateRef.current;
    if (!current || current.phase !== 'live') return;
    const setId = current.config.setId;
    for (const req of judgeRequests(current)) {
      const key = `${setId}:judge:${req.lineId}`;
      if (handledRef.current.has(key)) continue;
      handledRef.current.add(key);
      const sentAt = Date.now();
      requestJudge(req).then((result) => {
        const after = stateRef.current;
        const ms = Date.now() - sentAt;
        if (!after || after.config.setId !== setId) return;
        const line = after.lines.find((l) => l.id === req.lineId);
        const left =
          line && after.startedAt !== null ? line.t1 + JUDGE_DEADLINE_SEC - (serverNow() - after.startedAt) / 1000 : 0;
        console.log(
          `[judge] line ${req.lineId}: ${result.status === 'ready' ? `verdict ${result.verdict.score}` : result.reason} in ${ms} ms, ${left.toFixed(2)} s before the deadline`,
        );
        dispatch(
          result.status === 'ready'
            ? { type: 'judge', verdict: result.verdict }
            : { type: 'judge-none', lineId: req.lineId },
        );
      });
    }
  }, [dispatch, serverNow]);
  const sendJudgesRef = useRef(sendJudges);
  sendJudgesRef.current = sendJudges;

  // A fallback for lines that get words some other way (the web demo's dispatch): the same once-per-line rule.
  useEffect(() => {
    if (state && state.phase === 'live') sendJudges();
  }, [state, sendJudges]);

  const stopWarm = useCallback(() => {
    const loop = warmLoopRef.current;
    loop.gen += 1;
    if (loop.timer) clearTimeout(loop.timer);
    loop.timer = null;
    setWarmVoice(null);
  }, []);

  useEffect(
    () => () => {
      const loop = warmLoopRef.current;
      loop.gen += 1;
      if (loop.timer) clearTimeout(loop.timer);
    },
    [],
  );

  const arm = useCallback(
    (set: SetConfig) => {
      // The phone starts listening at `startAt`. When the intro is already written (the warm intro), the set starts
      // once its voice has finished, plus a breath, so the performer's first line is never under the MC (and never
      // dropped by the phone's hush). Without one, the usual 1.5 s; an intro that arrives too late to finish by then is
      // shown as text only.
      const warmNow = warmRef.current;
      const known =
        warmNow &&
        warmFor(warmNow, introKey(set, memoryFor(historyRef.current(), set.performer).length), WARM_INTRO_TTL_MS) &&
        warmNow.settled &&
        warmNow.settled.status === 'ready'
          ? warmNow.settled.line.text
          : null;
      const startAt =
        serverNow() + Math.max(ARM_LEAD_MS, known ? introSpeechMs(known, set.persona) + AFTER_INTRO_MS : 0);
      armedRef.current = { setId: set.setId, startAt };
      setArmedIntro(null);
      setMcText({});
      // Ask for the intro now so its words can land by t = 0; they are handed to the intro moment when it exists.
      const ask: IntroAsk = { setId: set.setId, result: null, momentId: null };
      introRef.current = ask;
      const warm = warmRef.current;
      warmRef.current = null;
      stopWarm();
      const onIntro = (result: LineResult) => {
        if (introRef.current !== ask) return;
        ask.result = result;
        if (result.status === 'ready') setArmedIntro(result.line.text);
        // The intro speaks as soon as it is known (over the armed card), but only if it can finish before the set
        // starts: never a voice over a running set. The engine gets the words when its moment exists either way.
        if (result.status === 'ready' && serverNow() + introSpeechMs(result.line.text, set.persona) <= startAt + 250) {
          speak(set.setId, 0, result);
        }
        if (ask.momentId !== null) deliver(set.setId, ask.momentId, result);
      };
      const fresh = () => requestLine(lineRequest(set, 'intro', introFacts()));
      const usable = warmFor(
        warm,
        introKey(set, memoryFor(historyRef.current(), set.performer).length),
        WARM_INTRO_TTL_MS,
      );
      // The new set's state first, then its intro: a remote key on Android TV and Vega arrives outside React's batching,
      // so each update renders on its own, and an intro queued before this would meet the bill's state and be dropped as
      // belonging to no set (seen on the Google TV, 2026-10-12: queued, then dropped 20 ms later).
      // With an MC service to ask, the room also waits (briefly) for its content judge; see the judging effect above.
      setState(createSetState({ ...set, judge: set.judge ?? !!config.mcUrl }));
      if (usable && warm && warm.settled && warm.settled.status === 'ready') {
        // Written ahead of OK: the card and the voice (already loaded paused) start in this same render, so the player
        // that holds the clip is still holding it when its turn comes.
        onIntro(warm.settled);
      } else {
        (usable && warm ? warm.result.then((r) => (r.status === 'ready' ? r : fresh())) : fresh()).then(onIntro);
      }
      send({
        type: 'arm',
        setId: set.setId,
        act: set.act,
        venue: set.venue,
        persona: set.persona,
        durationSec: set.durationSec,
        startAt,
      });
    },
    [send, serverNow, setState, lineRequest, deliver, speak, stopWarm],
  );

  const warmIntro = useCallback(
    (set: IntroSet | null) => {
      stopWarm();
      if (!set) return;
      const loop = warmLoopRef.current;
      const gen = loop.gen;
      const step = () => {
        if (loop.gen !== gen) return;
        loop.timer = null;
        const key = introKey(set, memoryFor(historyRef.current(), set.performer).length);
        const held = warmRef.current;
        let entry: WarmIntro;
        if (held && warmFor(held, key, WARM_INTRO_RENEW_MS)) {
          entry = held;
        } else {
          const next: WarmIntro = {
            key,
            at: Date.now(),
            result: requestLine(lineRequest(set, 'intro', introFacts())),
            settled: null,
            voice: null,
          };
          // While the new one is being written, a ready intro it renews stays the one OK uses (each is good for 90 s),
          // so a press during the renewal still starts at once.
          const keep = !!held && warmFor(held, key, WARM_INTRO_TTL_MS) && !!held.settled;
          next.result.then((r) => {
            next.settled = r;
            next.voice =
              r.status === 'ready'
                ? voiceClip(r.line.audio, { key: `warm:${next.at}`, text: r.line.text, live: true })
                : null;
            if (loop.gen === gen && r.status === 'ready') warmRef.current = next;
          });
          if (!keep) warmRef.current = next;
          entry = next;
        }
        const asked = entry;
        asked.result.then((r) => {
          if (loop.gen !== gen) return;
          const used = warmRef.current;
          setWarmVoice(used && used.settled && used.settled.status === 'ready' ? used.voice : null);
          // Written again before it expires, or, after a failure, straight away (a fast failure after a short pause).
          const wait = asked.at + (r.status === 'ready' ? WARM_INTRO_RENEW_MS : WARM_INTRO_RETRY_MS) - Date.now();
          loop.timer = setTimeout(step, Math.max(0, wait));
        });
      };
      step();
    },
    [lineRequest, stopWarm],
  );

  const hush = useCallback(
    (sec: number) => {
      const current = stateRef.current;
      if (!current || (current.phase !== 'live' && current.phase !== 'armed')) return;
      send({ type: 'hush', setId: current.config.setId, untilMs: serverNow() + Math.round(sec * 1000) });
    },
    [send, serverNow],
  );

  const startLocal = useCallback(
    (set: SetConfig, startedAt: number, backlog: TimedAction[] = []) => {
      armedRef.current = null;
      introRef.current = null;
      setArmedIntro(null);
      setMcText({});
      const live = reduceSet(createSetState(set), { type: 'start', startedAt });
      setState(replay(live, backlog));
    },
    [setState],
  );

  const finish = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    if (current.phase === 'live' && current.startedAt !== null) {
      dispatch({ type: 'finish', now: (serverNow() - current.startedAt) / 1000 });
    }
    send({ type: 'stop', setId: current.config.setId });
  }, [dispatch, send, serverNow]);

  const stop = useCallback(() => {
    const current = stateRef.current;
    if (current) send({ type: 'stop', setId: current.config.setId });
    armedRef.current = null;
    // The set is dropped: an intro still being written is never shown or spoken after it.
    introRef.current = null;
    setArmedIntro(null);
    setState(null);
  }, [send, setState]);

  const listen = useCallback((promptId: string, maxSec: number) => send({ type: 'listen', promptId, maxSec }), [send]);
  const cancelListen = useCallback((promptId: string) => send({ type: 'cancelListen', promptId }), [send]);

  const connectedPhones = phones.filter((p) => p.connected);
  const phone = connectedPhones.find((p) => p.micReady);

  return {
    link,
    room,
    phones: connectedPhones,
    phone,
    state,
    serverNow,
    arm,
    warmIntro,
    warmVoice,
    finish,
    stop,
    listen,
    cancelListen,
    said,
    armedIntro,
    mcText,
    hush,
    dispatch,
    startLocal,
  };
}
