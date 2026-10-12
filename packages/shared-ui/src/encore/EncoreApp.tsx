import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, unstable_batchedUpdates } from 'react-native';
import {
  INTRO_WINDOW_SEC,
  VENUE_IDS,
  getPack,
  memoryFor,
  setRecord,
  type McNote,
  type SetConfig,
  type SetRecord,
  type SetState,
  type VenueId,
} from '@strumble/crowd';
import { config } from './config';
import { readDemo, scheduleActions, splitActions } from './demo';
import {
  FIXTURE_ARENA,
  FIXTURE_CLUB,
  FIXTURE_RECORDS,
  arenaActions,
  clubActions,
  fixtureClubRecord,
  fixtureClubState,
} from './fixtures';
import { BillScreen, type BillRow, type Selection } from './screens/BillScreen';
import { CutSheetScreen, measuredNext, nextWords } from './screens/CutSheetScreen';
import { EXAMPLE_QUESTIONS, GreenRoomScreen, type RoomMc, type Turn } from './screens/GreenRoomScreen';
import { LiveScreen } from './screens/LiveScreen';
import { CROWD_STAGE_AVAILABLE, CrowdStage } from './world/CrowdStage';
import { thumbsOf, type CrowdScene } from './world/crowdFeed';
import { loadRecords, loadSetNumbers, saveRecords, saveSetNumber } from './storage';
import { reasonInWords, useMc, type ChatStatus, type DebriefRequest, type DebriefStatus } from './useMc';
import { SupportedKeys, useRemoteKeys } from './useRemoteKeys';
import { useSetSession, type Phone } from './useSetSession';
import { McVoice, type VoiceClip } from './world/McVoice';
import { traceVoice, voiceClip } from './world/sounds';
import { useStageMount } from './world/useStageMount';
import { colors } from './world/theme';

type Screen = 'bill' | 'live' | 'cutsheet' | 'greenroom';

interface Last {
  state: SetState;
  record: SetRecord;
  /** The MC's debrief for this set: being written, the model's note, or silence with its reason. */
  mc: DebriefStatus;
}

interface Room {
  /** What actually happened this session, oldest first; MC turns are the model's own words. */
  turns: Turn[];
  /** The phone is listening for this prompt. */
  promptId: string | null;
  /** The answer to the latest question. */
  answer: ChatStatus | null;
  lastQuestion: string | null;
  /** The phone heard nothing for the last prompt. */
  heardNothing: boolean;
}

/** The finale plate holds this long before the cut sheet. */
const FINALE_MS = 3000;
const LISTEN_SEC = 8;
/**
 * The bill's selection must rest this long before the MC's intro for it is written (no request per key press); OK
 * writes it at once if it is not ready. 900 ms let every D-pad pause through (QA 2026-10-12: over 30 intro calls for
 * 8 sets, with the renewal in useSetSession).
 */
const WARM_INTRO_AFTER_MS = 1200;
/** At most this many of the MC's clips play or wait; past it the newest are dropped, never the one playing. */
const VOICE_QUEUE_MAX = 3;
/**
 * While the MC's voice sounds during a set, the phone ignores its mic for this long, renewed every second. The phone can
 * only extend a hush, never cut one short, so a short lease ends soon after the voice does, whatever the clip's length.
 */
const HUSH_LEASE_SEC = 1.5;
const HUSH_RENEW_MS = 1000;

const DEMO_PHONE: Phone = { id: 'demo', name: 'Aman', connected: true, micReady: true, words: 'local' };

function cycle<T>(list: T[], current: T, step: number): T {
  const i = list.indexOf(current);
  return list[(i + step + list.length) % list.length];
}

export function nextVenueFor(next: McNote['next'], venue: VenueId): VenueId {
  const i = VENUE_IDS.indexOf(venue);
  if (next === 'up') return VENUE_IDS[Math.min(VENUE_IDS.length - 1, i + 1)];
  if (next === 'down') return VENUE_IDS[Math.max(0, i - 1)];
  return venue;
}

function debriefRequest(s: SetState, record: SetRecord, history: SetRecord[]): DebriefRequest {
  const lines = s.judged.map((j) => {
    const line = s.lines.find((l) => l.id === j.lineId);
    const phrase = s.phrases.find((p) => p.id === j.lineId);
    return { t: line ? line.t0 : phrase ? phrase.from : 0, landed: j.landed, text: line ? line.text : undefined };
  });
  return {
    kind: 'debrief',
    persona: s.config.persona,
    performer: s.config.performer,
    act: s.config.act,
    venue: s.config.venue,
    scorecard: record.scorecard,
    lines,
    reactions: s.reactions,
    history: history.slice(-config.memorySets),
  };
}

function running(s: SetState | null): boolean {
  return !!s && (s.phase === 'armed' || s.phase === 'live');
}

/** An intro belongs to its set: once the set is stopped or replaced it is not heard, even mid-sentence. */
function introOrphaned(clip: VoiceClip, s: SetState | null): boolean {
  return !s || s.config.setId !== clip.setId;
}

/**
 * An intro that has not started by the end of the engine's intro window (t = 4 s, and only before the performer's first
 * word) is dropped: the card it belonged to has passed, and the MC would be talking over the set.
 */
function introLate(clip: VoiceClip, s: SetState | null): boolean {
  if (!s || introOrphaned(clip, s)) return true;
  if (s.phase === 'armed') return false;
  return s.phase !== 'live' || s.now > INTRO_WINDOW_SEC || s.speaking || s.book.firstVoiceAt !== null;
}

/** The MC block of the green room, from what has actually happened. Only `speaking` carries words, the model's. */
function roomMc(room: Room, last: Last | null): RoomMc {
  if (room.promptId) return { kind: 'listening' };
  if (room.heardNothing)
    return { kind: 'notice', text: "The phone didn't catch that. Press OK and say it again, closer to the phone." };
  if (room.answer) {
    if (room.answer.status === 'writing') return { kind: 'writing' };
    if (room.answer.status === 'ready') return { kind: 'speaking', text: room.answer.reply.text };
    return {
      kind: 'notice',
      text: `The MC isn't answering right now (${reasonInWords(room.answer.reason)}). Press OK to try again.`,
    };
  }
  if (last && last.mc.status === 'ready') return { kind: 'speaking', text: last.mc.note.line };
  if (last && last.mc.status === 'writing') return { kind: 'writing' };
  return { kind: 'waiting' };
}

/**
 * The whole TV app: bill → live → cut sheet ⇄ green room → bill, one screen at a time, driven by the engine and
 * the remote (OK/Back/Up/Down/Left/Right). The web preview can replay a recorded set with `?demo=club` or `?demo=arena`;
 * every MC word, demo or not, is asked of the MC service live.
 */
export function EncoreApp({
  crowd3d,
  onAwake,
}: {
  /** Overrides `config.crowd3d`: the TV app turns the live 3D room on from a link for device tests. */
  crowd3d?: boolean;
  /**
   * True while a set is armed or live: the host keeps the screen awake then. Nothing on screen plays video over the 3D
   * room, so without it the TV's screensaver can start in the middle of a set (seen on the Google TV, 2026-10-12).
   */
  onAwake?: (awake: boolean) => void;
} = {}) {
  const demo = useMemo(() => readDemo(), []);
  const staticDemo = demo !== null && (demo.mode === 'cutsheet' || demo.mode === 'greenroom');
  const liveDemo = demo !== null && (demo.mode === 'club' || demo.mode === 'arena');

  const [records, setRecords] = useState<SetRecord[]>(() => (staticDemo ? FIXTURE_RECORDS : loadRecords()));
  const recordsRef = useRef(records);
  recordsRef.current = records;
  // The cut sheet's set number: a counter that only goes up (the records keep only the last six).
  const [setNumbers, setSetNumbers] = useState(() => loadSetNumbers(records));
  // The MC's voice: one clip at a time, in the order the words arrived, except that the intro goes first.
  const [voices, setVoices] = useState<VoiceClip[]>([]);
  /** The clip McVoice reports actually sounding: queued is not playing. */
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const sessionStateRef = useRef<SetState | null>(null);
  const queueVoice = useCallback((clip: VoiceClip) => {
    // Words about the last set that arrive once the next one is armed are never spoken over it.
    if (!clip.live && running(sessionStateRef.current)) {
      traceVoice('dropped', clip, 'a set is running');
      return;
    }
    traceVoice('queued', clip);
    setVoices((q) => {
      if (q.some((c) => c.key === clip.key)) return q;
      // The intro jumps the queue, and nothing left from the last set follows it. The cap drops from the tail, so the
      // clip playing at the head is never cut off by a newer one.
      const next = clip.live ? [clip, ...q.filter((c) => c.live)] : [...q, clip];
      return next.slice(0, VOICE_QUEUE_MAX);
    });
  }, []);
  const session = useSetSession({ history: () => recordsRef.current, onVoice: queueVoice });
  sessionStateRef.current = session.state;
  const mc = useMc();

  const [screen, setScreen] = useState<Screen>(() =>
    demo === null
      ? 'bill'
      : demo.mode === 'cutsheet'
        ? 'cutsheet'
        : demo.mode === 'greenroom'
          ? 'greenroom'
          : liveDemo
            ? 'live'
            : 'bill',
  );
  const [selection, setSelection] = useState<Selection>(() =>
    demo && demo.mode === 'arena'
      ? { act: 'singing', venue: 'arena', persona: 'warm' }
      : { act: 'standup', venue: 'club', persona: 'sarcastic' },
  );
  const [focus, setFocus] = useState<BillRow>(1);
  const [last, setLast] = useState<Last | null>(() =>
    staticDemo ? { state: fixtureClubState(), record: fixtureClubRecord(), mc: { status: 'writing' } } : null,
  );
  const [room, setRoom] = useState<Room>({
    turns: [],
    promptId: null,
    answer: null,
    lastQuestion: null,
    heardNothing: false,
  });
  const recordedRef = useRef<string | null>(null);
  const cancelDemoRef = useRef<(() => void) | null>(null);

  const phone = demo && demo.mode === 'bill-live' ? DEMO_PHONE : session.phone;
  const state = session.state;
  const awake = running(state);
  const onAwakeRef = useRef(onAwake);
  onAwakeRef.current = onAwake;
  useEffect(() => {
    if (onAwakeRef.current) onAwakeRef.current(awake);
  }, [awake]);

  // Whose turn it is to speak. After a set the MC's words wait for the cut (the debrief speaks as the cut sheet comes up,
  // not over the finale), and nothing plays while the phone's mic is open for a green-room question.
  const head = voices.length ? voices[0] : null;
  const listening = screen === 'greenroom' && !!room.promptId;
  const due = !!head && !listening && (head.live || screen !== 'live');
  const voice = due ? head : null;
  const playing = voice && voice.key === playingKey ? voice : null;
  // The clip after the one playing loads paused, so it starts without a fetch; with nothing waiting, the intro written
  // ahead of OK does.
  const nextVoice = (due ? voices[1] : head) || session.warmVoice || null;

  if (demo) {
    (globalThis as unknown as { __encore?: unknown }).__encore = {
      state,
      screen,
      mc: last ? last.mc.status : null,
      room: room.answer ? room.answer.status : room.promptId ? 'listening' : 'idle',
      mcText: session.mcText,
      voice: voice ? voice.key : null,
      voicePlaying: playing ? playing.key : null,
    };
  }

  /** Ask the model for the debrief; the next room follows its `next`, or the measured house rule when it is silent. */
  const askDebrief = useCallback(
    (s: SetState, record: SetRecord, history: SetRecord[]) => {
      setLast({ state: s, record, mc: { status: 'writing' } });
      return mc.debrief({ ...debriefRequest(s, record, history), speak: true }).then((result) => {
        setLast((l) => (l && l.record.setId === record.setId ? { ...l, mc: result } : l));
        if (result.status === 'ready') {
          const clip = voiceClip(result.note.audio, {
            key: `debrief:${record.setId}`,
            text: result.note.spoken || result.note.line,
            live: false,
          });
          if (clip) queueVoice(clip);
        }
        const next = result.status === 'ready' ? result.note.next : measuredNext(record);
        setSelection((sel) => ({ ...sel, venue: nextVenueFor(next, record.venue) }));
      });
    },
    [mc, queueVoice],
  );

  // While the MC's voice sounds during a set (the intro), the phone is hushed on a short lease renewed until it stops,
  // from the moment it is heard, not from when it was queued (session.hush does nothing outside a set).
  const hush = session.hush;
  const playingNow = playing ? playing.key : null;
  useEffect(() => {
    if (!playingNow) return undefined;
    hush(HUSH_LEASE_SEC);
    const lease = setInterval(() => hush(HUSH_LEASE_SEC), HUSH_RENEW_MS);
    return () => clearInterval(lease);
  }, [playingNow, hush]);
  const onVoicePlaying = useCallback((key: string) => setPlayingKey(key), []);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onVoiceDone = useCallback((key?: string) => {
    // Vega's player reports the end without a key: it is always the clip it was given.
    const done = key !== undefined ? key : voiceRef.current ? voiceRef.current.key : null;
    if (done === null) return;
    setVoices((q) => q.filter((c) => c.key !== done));
    setPlayingKey((p) => (p === done ? null : p));
  }, []);

  // An intro that missed its window is dropped before it starts, and one whose set was stopped stops mid-sentence. Words
  // about an earlier set never wait into a running one (arm already cleared them; this catches one that lands meanwhile).
  useEffect(() => {
    const gone = (c: VoiceClip) =>
      c.live ? (c.key === playingNow ? introOrphaned(c, state) : introLate(c, state)) : running(state);
    const dropped = voices.filter(gone);
    if (dropped.length === 0) return;
    dropped.forEach((c) => traceVoice('dropped', c, c.live ? 'intro late or its set gone' : 'a set is running'));
    setVoices((q) => q.filter((c) => !gone(c)));
  }, [voices, state, playingNow]);

  // The web demo: replay the recorded set in real time, optionally fast-forwarded (`&t=180`).
  useEffect(() => {
    if (!liveDemo || !demo) return undefined;
    const arena = demo.mode === 'arena';
    const cfg: SetConfig = arena ? FIXTURE_ARENA : FIXTURE_CLUB;
    const actions = arena ? arenaActions() : clubActions();
    const startedAt = session.serverNow() - demo.t * 1000;
    const { backlog, future } = splitActions(actions, demo.t);
    session.startLocal(cfg, startedAt, backlog);
    const cancel = scheduleActions(future, startedAt, session.serverNow, session.dispatch);
    cancelDemoRef.current = cancel;
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The static demos ask the MC service live about the recorded set (records and numbers are fixtures; words are not).
  useEffect(() => {
    if (!staticDemo) return;
    askDebrief(fixtureClubState(), fixtureClubRecord(), FIXTURE_RECORDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A set just ended: keep its record, remember it for the MC, and ask for the debrief.
  useEffect(() => {
    if (!state || state.phase !== 'done' || recordedRef.current === state.config.setId) return;
    recordedRef.current = state.config.setId;
    const record = setRecord(state, new Date().toISOString());
    // The MC remembers this performer's own earlier sets only.
    const history = memoryFor(records, state.config.performer, config.memorySets);
    const kept = saveRecords([...records, record]);
    setRecords(kept);
    setSetNumbers(saveSetNumber(record.setId, kept));
    askDebrief(state, record, history);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // After the finale plate, the cut sheet.
  const done = !!state && state.phase === 'done';
  useEffect(() => {
    if (screen !== 'live' || !done) return undefined;
    const t = setTimeout(() => setScreen('cutsheet'), FINALE_MS);
    return () => clearTimeout(t);
  }, [screen, done]);

  const mcOnScreen = roomMc(room, last);

  /** Put a question to the MC. The words on screen become the earlier exchange only if they were really said. */
  const ask = useCallback(
    (question: string, retry: boolean) => {
      const persona = last ? last.record.persona : selection.persona;
      // The person asking is the phone at the table; the MC answers from their own sets only.
      const performer = phone ? phone.name : last ? last.record.performer : 'the performer';
      const memory = memoryFor(recordsRef.current, performer, config.memorySets);
      const own = memory.length ? memory[memory.length - 1] : null;
      setRoom((r) => {
        const shown = roomMc(r, last);
        const turns = retry
          ? r.turns
          : [
              ...r.turns,
              ...(shown.kind === 'speaking' ? [{ who: 'MC' as const, text: shown.text }] : []),
              { who: 'You' as const, text: question },
            ];
        return { turns, promptId: null, answer: { status: 'writing' }, lastQuestion: question, heardNothing: false };
      });
      mc.chat({
        kind: 'chat',
        persona,
        performer,
        question,
        history: memory,
        lastScorecard: own ? own.scorecard : null,
        speak: true,
      }).then((answer) => {
        setRoom((r) => (r.lastQuestion === question ? { ...r, answer } : r));
        if (answer.status === 'ready') {
          const clip = voiceClip(answer.reply.audio, {
            key: `chat:${Date.now().toString(36)}`,
            text: answer.reply.spoken || answer.reply.text,
            live: false,
          });
          if (clip) queueVoice(clip);
        }
      });
    },
    [last, mc, phone, selection.persona, queueVoice],
  );

  // Green room: the phone heard something (or nothing).
  const said = session.said;
  useEffect(() => {
    if (!said || !room.promptId || said.promptId !== room.promptId) return;
    const question = said.text;
    if (question === null || question.trim() === '') {
      setRoom((r) => ({ ...r, promptId: null, heardNothing: true }));
      return;
    }
    ask(question.trim(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [said]);

  const goLive = useCallback(
    (sel: Selection) => {
      if (!phone) return;
      const pack = getPack(sel.act);
      // One render for all of it: the key arrives outside React's batching on Android TV and Vega.
      unstable_batchedUpdates(() => {
        // The MC stops talking about the last set: a debrief or reply still playing or queued ends here, and the new
        // set's intro (queued by arm, at once when it was written ahead) is the next thing heard.
        setVoices([]);
        session.arm({
          setId: Date.now().toString(36),
          act: sel.act,
          venue: sel.venue,
          persona: sel.persona,
          durationSec: pack.defaultDurationSec,
          performer: phone.name,
          words: phone.words,
        });
        setScreen('live');
      });
    },
    [phone, session],
  );

  // Wherever OK starts the next set, its intro is written ahead once the selection has rested for a moment: on the bill,
  // and on the cut sheet once the debrief is in (its `next` picks the room). The session keeps it fresh while it rests.
  const warmIntro = session.warmIntro;
  const performer = phone ? phone.name : null;
  const resting = screen === 'bill' || (screen === 'cutsheet' && !!last && last.mc.status !== 'writing');
  useEffect(() => {
    if (!resting || !performer) return undefined;
    const t = setTimeout(() => {
      warmIntro({
        act: selection.act,
        venue: selection.venue,
        persona: selection.persona,
        performer,
        durationSec: getPack(selection.act).defaultDurationSec,
      });
    }, WARM_INTRO_AFTER_MS);
    return () => {
      clearTimeout(t);
      warmIntro(null);
    };
  }, [resting, performer, selection.act, selection.venue, selection.persona, warmIntro]);

  const openGreenRoom = useCallback(() => {
    setRoom((r) => ({ ...r, promptId: null, heardNothing: false }));
    setScreen('greenroom');
  }, []);

  const canAsk = !!phone || (demo !== null && demo.mode === 'greenroom');
  const talk = useCallback(() => {
    if (room.promptId || (room.answer && room.answer.status === 'writing')) return;
    if (room.answer && room.answer.status === 'unavailable' && room.lastQuestion) {
      ask(room.lastQuestion, true);
      return;
    }
    if (phone) {
      // The MC stops talking before the phone opens its mic, so its own voice is never heard as the question (and
      // nothing starts while the mic is open: see `listening`).
      setVoices([]);
      const promptId = Date.now().toString(36);
      session.listen(promptId, LISTEN_SEC);
      setRoom((r) => ({ ...r, promptId, heardNothing: false }));
    } else if (demo && demo.mode === 'greenroom') {
      // No phone in the browser preview: the typed question (`&ask=`) stands in for the phone's transcript.
      ask(demo.ask || EXAMPLE_QUESTIONS[0], false);
    }
  }, [ask, demo, phone, room.answer, room.lastQuestion, room.promptId, session]);

  useRemoteKeys((key) => {
    switch (screen) {
      case 'bill':
        if (key === SupportedKeys.Up) setFocus((f) => (f > 0 ? ((f - 1) as BillRow) : f));
        else if (key === SupportedKeys.Down) setFocus((f) => (f < 2 ? ((f + 1) as BillRow) : f));
        else if (key === SupportedKeys.Left || key === SupportedKeys.Right) {
          const step = key === SupportedKeys.Right ? 1 : -1;
          setSelection((sel) =>
            focus === 0
              ? { ...sel, act: cycle(['standup', 'singing', 'poetry', 'speech'] as Selection['act'][], sel.act, step) }
              : focus === 1
                ? { ...sel, venue: cycle(VENUE_IDS, sel.venue, step) }
                : {
                    ...sel,
                    persona: cycle(
                      ['warm', 'sarcastic', 'strict', 'deadpan'] as Selection['persona'][],
                      sel.persona,
                      step,
                    ),
                  },
          );
        } else if (key === SupportedKeys.Enter || key === SupportedKeys.PlayPause) goLive(selection);
        return;
      case 'live':
        if (key === SupportedKeys.Enter || key === SupportedKeys.PlayPause) {
          if (state && state.phase === 'live') session.finish();
        } else if (key === SupportedKeys.Back) {
          if (cancelDemoRef.current) cancelDemoRef.current();
          session.stop();
          setScreen('bill');
        }
        return;
      case 'cutsheet':
        if (key === SupportedKeys.Enter || key === SupportedKeys.PlayPause) {
          if (phone) goLive(selection);
          else setScreen('bill');
        } else if (key === SupportedKeys.Back) openGreenRoom();
        else if (key === SupportedKeys.Up) setSelection((sel) => ({ ...sel, venue: cycle(VENUE_IDS, sel.venue, 1) }));
        else if (key === SupportedKeys.Down)
          setSelection((sel) => ({ ...sel, venue: cycle(VENUE_IDS, sel.venue, -1) }));
        return;
      case 'greenroom':
        if (key === SupportedKeys.Enter || key === SupportedKeys.PlayPause) talk();
        else if (key === SupportedKeys.Right) setScreen('bill');
        else if (key === SupportedKeys.Back) setScreen(last ? 'cutsheet' : 'bill');
        return;
      default:
        return;
    }
  });

  const lastIndex = last ? records.findIndex((r) => r.setId === last.record.setId) : -1;
  const counted = last ? setNumbers.byId[last.record.setId] : undefined;
  const setNumber = counted !== undefined ? counted : lastIndex >= 0 ? lastIndex + 1 : setNumbers.count + 1;
  const mcSays = last && last.mc.status === 'ready' ? `The MC says ${nextWords(last.mc.note.next)}.` : undefined;

  // The live 3D room, where it runs: one stage under every screen, so the venue never reloads between them. Its WebView
  // is created only after the bill has painted (useStageMount: creating it on the first frame put Chromium's start-up on
  // the window's focus path, and a cold disk made that an ANR), and the screens keep their photographic plates until
  // the page has drawn its first frames, so the wait shows the plate, never black.
  const stageWanted = (crowd3d === undefined ? config.crowd3d : crowd3d) && CROWD_STAGE_AVAILABLE;
  const stageMounted = useStageMount(stageWanted);
  const [stageVisible, setStageVisible] = useState(false);
  const onStageVisible = useCallback(() => setStageVisible(true), []);
  useEffect(() => {
    if (!stageMounted) setStageVisible(false);
  }, [stageMounted]);
  const stage = stageMounted && stageVisible;
  const shown = screen === 'live' ? state : last ? last.state : null;
  // The room ducks under the MC while the voice is heard, not while it is only queued or loading.
  const ducked = !!playing;
  // Frames of the room the page snapshots on each cut, for the cut sheet's strip; only the latest set's are kept.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const onThumb = useCallback((key: string, uri: string) => {
    setThumbs((t) => {
      const setId = key.slice(0, key.lastIndexOf('@'));
      const kept: Record<string, string> = {};
      for (const k of Object.keys(t)) if (k.slice(0, k.lastIndexOf('@')) === setId) kept[k] = t[k];
      kept[key] = uri;
      return kept;
    });
  }, []);
  const scene = useMemo<CrowdScene>(() => {
    if (screen === 'live' && state)
      return { mode: 'live', venue: state.config.venue, act: state.config.act, state, duck: ducked };
    if (screen !== 'bill' && shown)
      return { mode: 'after', venue: shown.config.venue, act: shown.config.act, state: shown, duck: ducked };
    return { mode: 'preview', venue: selection.venue, act: selection.act, state: null, duck: ducked };
  }, [screen, state, shown, selection.venue, selection.act, ducked]);

  return (
    <View style={styles.root}>
      {stageMounted ? <CrowdStage scene={scene} onThumb={onThumb} onVisible={onStageVisible} /> : null}
      {screen === 'bill' && (
        <BillScreen
          selection={selection}
          focus={focus}
          room={session.room}
          phone={phone}
          phones={session.phones}
          link={session.link}
          companionUrl={config.companionUrl}
          stage={stage}
        />
      )}
      {screen === 'live' && state && (
        <LiveScreen
          state={state}
          replay={liveDemo}
          armedIntro={session.armedIntro}
          mcText={session.mcText}
          ducked={ducked}
          onCue={session.hush}
          stage={stage}
        />
      )}
      {screen === 'cutsheet' && last && (
        <CutSheetScreen
          state={last.state}
          record={last.record}
          mc={last.mc}
          setNumber={setNumber}
          nextVenue={selection.venue}
          stage={stage}
          stageThumbs={stage ? thumbsOf(thumbs, last.state.config.setId) : undefined}
        />
      )}
      {screen === 'greenroom' && (
        <GreenRoomScreen
          persona={last ? last.record.persona : selection.persona}
          earlier={room.turns}
          mc={mcOnScreen}
          canAsk={canAsk}
          records={records}
          nextAct={selection.act}
          nextVenue={selection.venue}
          mcSays={mcSays}
          stage={stage}
        />
      )}
      <McVoice clip={voice} next={nextVoice} onPlaying={onVoicePlaying} onDone={onVoiceDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.house, overflow: 'hidden' },
});
