import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isValidRoomCode, normalizeRoomCode, sanitizeName } from 'couch-link';
import type { WordsMode } from '@strumble/crowd';
import { SetListener, type Meter, type SetStatus } from './set/listener';
import { Words, type WordsState } from './set/words';
import { actName, clock, houseName } from './set/labels';
import { useMicrophone } from './useMicrophone';
import { usePhoneConnection, type PhoneConnection } from './useCouchLink';

const PRIVACY =
  "Your audio never leaves this phone. The TV only gets timing, levels and, if you switch words on, the words: then the room also judges what you say, with the MC's model on Amazon Bedrock.";

export function App() {
  const [joined, setJoined] = useState<{ room: string; name: string } | null>(null);
  const conn = usePhoneConnection(joined);

  if (!joined || conn.error) {
    return <JoinScreen error={conn.error?.message} onJoin={setJoined} />;
  }
  if (conn.status !== 'ready') {
    return <Centered title={conn.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting to your TV…'} />;
  }
  if (!conn.tvOnline) {
    return <Centered title="The TV lost connection" subtitle="Keep this page open. It picks up where it left off." />;
  }
  return <TableScreen conn={conn} />;
}

function JoinScreen({ error, onJoin }: { error?: string; onJoin: (j: { room: string; name: string }) => void }) {
  const [room, setRoom] = useState(() => normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? ''));
  const [name, setName] = useState('');
  const ready = isValidRoomCode(room) && sanitizeName(name).length > 0;

  return (
    <main className="screen">
      <h1>Encore</h1>
      <p className="lede">This phone is the microphone. The TV is the room.</p>
      <label>
        TV code
        <input
          value={room}
          onChange={(e) => setRoom(normalizeRoomCode(e.target.value).slice(0, 4))}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          placeholder="ABCD"
        />
      </label>
      <label>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          placeholder="Stage name"
          autoComplete="nickname"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button disabled={!ready} onClick={() => onJoin({ room, name: sanitizeName(name) })}>
        Connect to the TV
      </button>
      <p className="fine">{PRIVACY}</p>
    </main>
  );
}

function TableScreen({ conn }: { conn: PhoneConnection }) {
  const mic = useMicrophone(2048);
  const { send, serverNow, onCommand } = conn;
  const [wordsOn, setWordsOn] = useState(() => Words.supported());
  const [wordsState, setWordsState] = useState<WordsState>(() =>
    Words.supported()
      ? { mode: 'off', reason: 'not started yet' }
      : { mode: 'off', reason: 'this browser has no speech recogniser' },
  );
  const [status, setStatus] = useState<SetStatus>({ kind: 'idle' });
  const [meter, setMeter] = useState<Meter>({ level: 0, floor: 0, speaking: false, t: 0, lines: 0, hushed: false });
  const [tvNote, setTvNote] = useState<string>();
  const rig = useRef<{ words: Words; listener: SetListener } | null>(null);
  const wordsOnRef = useRef(wordsOn);
  const reported = useRef<WordsMode | undefined>(undefined);

  // The rig (recogniser + set listener) lives as long as the microphone does.
  useEffect(() => {
    if (mic.state.status !== 'on') return;
    const { context, analyser } = mic.state;
    const words = new Words({ now: () => context.currentTime });
    words.setEnabled(wordsOnRef.current);
    words.onState = setWordsState;
    const listener = new SetListener({
      context,
      analyser,
      words,
      send,
      serverNow,
      onStatus: setStatus,
      onMeter: setMeter,
    });
    rig.current = { words, listener };
    let cancelled = false;
    void words.probe().then((state) => {
      if (cancelled) return;
      setWordsState(state);
      reported.current = words.mode;
      send({ type: 'mic', ready: true, words: words.mode });
    });
    return () => {
      cancelled = true;
      listener.destroy();
      rig.current = null;
      reported.current = undefined;
    };
  }, [mic.state.status]);

  useEffect(() => {
    if (mic.state.status === 'error') send({ type: 'mic', ready: false, reason: mic.state.message, words: 'off' });
  }, [mic.state.status]);

  // Tell the TV whenever the words mode changes after the mic report (toggle, or a recogniser that failed later).
  // A recogniser can start and fail within a few ms, so a change is reported once it has held for a moment.
  const effectiveWords: WordsMode = wordsOn ? wordsState.mode : 'off';
  useEffect(() => {
    if (reported.current === undefined || reported.current === effectiveWords) return;
    const timer = setTimeout(() => {
      reported.current = effectiveWords;
      send({ type: 'words', mode: effectiveWords });
    }, 600);
    return () => clearTimeout(timer);
  }, [effectiveWords]);

  // Keep the screen on while the phone lies on the table (a locked screen suspends the audio clock).
  useEffect(() => {
    if (mic.state.status !== 'on') return;
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        lock = l;
      })
      .catch(() => {});
    return () => {
      void lock?.release();
    };
  }, [mic.state.status]);

  useEffect(
    () =>
      onCommand((command) => {
        const r = rig.current;
        switch (command.type) {
          case 'idle':
            setTvNote(command.message);
            break;
          case 'arm':
            r?.listener.arm(command);
            break;
          case 'stop':
            r?.listener.stop(command.setId);
            break;
          case 'hush':
            r?.listener.hush(command);
            break;
          case 'listen':
            r?.listener.listen(command);
            break;
          case 'cancelListen':
            r?.listener.cancelListen(command.promptId);
            break;
        }
      }),
    [onCommand],
  );

  const toggleWords = () => {
    const next = !wordsOn;
    setWordsOn(next);
    wordsOnRef.current = next;
    const r = rig.current;
    if (!r) return;
    r.words.setEnabled(next);
    if (next) void r.words.probe().then(setWordsState);
  };

  if (mic.state.status !== 'on') {
    const starting = mic.state.status === 'starting';
    return (
      <main className="screen centered">
        <p className="eyebrow">Encore</p>
        <h2>Put the phone on the table, between you and the TV</h2>
        <p className="lede">Screen up. After this you won't need to look at it.</p>
        <button onClick={mic.start} disabled={starting}>
          {starting ? 'Starting…' : 'Start listening'}
        </button>
        {mic.state.status === 'error' && <p className="error">{mic.state.message}</p>}
        <p className="fine">{PRIVACY}</p>
      </main>
    );
  }

  const listener = rig.current?.listener;
  return (
    <main className={`screen table ${status.kind}${meter.hushed ? ' hushed' : ''}`}>
      <section className="status" aria-live="polite">
        {status.kind === 'live' && <span className="live-dot" aria-hidden="true" />}
        <h2 className="headline">{headline(status, meter, effectiveWords)}</h2>
        {status.kind === 'listening' && listener && (
          <ListenPanel key={status.promptId} status={status} wordsOn={effectiveWords !== 'off'} listener={listener} />
        )}
        {status.kind === 'idle' && tvNote && <p className="note">TV: {tvNote}</p>}
      </section>

      <LevelBar meter={meter} />
      <p className="measure">
        noise floor {db(meter.floor)} dB · level {db(meter.level)} dB
        {status.kind === 'live' && ` · ${meter.lines} ${meter.lines === 1 ? 'line' : 'lines'}`}
      </p>

      <button className="toggle" onClick={toggleWords} disabled={!Words.supported()} aria-pressed={wordsOn}>
        {wordsLabel(wordsOn, wordsState)}
      </button>
      {wordsOn && wordsState.mode === 'off' && wordsState.reason && (
        <p className="fine">No recogniser: {wordsState.reason}.</p>
      )}
      <p className="fine">{PRIVACY}</p>
    </main>
  );
}

function headline(status: SetStatus, meter: Meter, words: WordsMode): string {
  if (meter.hushed) {
    const left = status.kind === 'live' ? ` · ${clock(status.set.durationSec - meter.t)} left` : '';
    return `Hush · the TV is making noise, not listening${left}`;
  }
  switch (status.kind) {
    case 'idle':
      return 'Listening · say something to check the level';
    case 'armed':
      return `Stand by · ${actName(status.set.act)} · ${houseName(status.set.act, status.set.venue)}`;
    case 'live':
      return `LIVE · ${actName(status.set.act)} · ${houseName(status.set.act, status.set.venue)} · ${clock(status.set.durationSec - meter.t)} left`;
    case 'listening':
      return words === 'off' ? 'The MC is listening… type your question' : 'The MC is listening… say your question';
    case 'done':
      return 'Done · look at the TV';
  }
}

function wordsLabel(on: boolean, state: WordsState): string {
  if (!on || state.mode === 'off') return "Words: off (the room hears timing only; pace and fillers won't be measured)";
  return state.mode === 'local'
    ? 'Words: on-device · the room judges what you say'
    : 'Words: via browser service (may use the network) · the room judges what you say';
}

function ListenPanel({
  status,
  wordsOn,
  listener,
}: {
  status: Extract<SetStatus, { kind: 'listening' }>;
  wordsOn: boolean;
  listener: SetListener;
}) {
  const [typing, setTyping] = useState(!wordsOn);
  const [text, setText] = useState('');
  if (!typing) {
    return (
      <>
        <p className="transcript">{status.transcript || '…'}</p>
        <button className="secondary" onClick={() => setTyping(true)}>
          Type it instead
        </button>
      </>
    );
  }
  return (
    <form
      className="typed"
      onSubmit={(e) => {
        e.preventDefault();
        listener.answerTyped(status.promptId, text);
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type it instead" autoFocus />
      <button type="submit" disabled={text.trim().length === 0}>
        Send to the MC
      </button>
    </form>
  );
}

function LevelBar({ meter }: { meter: Meter }) {
  return (
    <div
      className={`level${meter.speaking ? ' speaking' : ''}${meter.hushed ? ' hushed' : ''}`}
      aria-label="microphone level"
      role="img"
    >
      <div className="fill" style={{ width: `${pct(meter.level)}%` }} />
      <div className="floor" style={{ left: `${pct(meter.floor)}%` }} />
    </div>
  );
}

/** 0..100 across −70 dB … 0 dB. */
function pct(level: number): number {
  return Math.max(0, Math.min(100, ((db(level) + 70) / 70) * 100));
}

function db(level: number): number {
  return Math.round(20 * Math.log10(Math.max(level, 0.00001)));
}

function Centered({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <main className="screen centered">
      <h2>{title}</h2>
      {subtitle && <p className="lede">{subtitle}</p>}
      {children}
    </main>
  );
}
