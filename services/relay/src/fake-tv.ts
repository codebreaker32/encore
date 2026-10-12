/**
 * A stand-in for the TV app while the real screens are being built, and the phone's test harness.
 *
 * Hosts a couch-link room on the relay, prints the code and join URL for the phone, and when a
 * phone reports its microphone ready, arms one set (stand-up at the club, 20 s, by default). Every
 * phone message is logged with a timestamp; after `finished` a one-line tally is printed.
 *
 *   yarn workspace @strumble/relay fake-tv [--act standup|singing|poetry|speech] [--venue club]
 *     [--persona warm] [--duration 20] [--arm-delay 1500] [--hush-at <s> --hush-for <s>]... [--listen] [--exit]
 *
 *   --hush-at   set time (s) at which to send `hush`, as the TV does before it plays a reaction or the
 *               MC; --hush-for (default 2 s) is how long the TV's sound lasts. Repeat the pair for more.
 *   --listen    after the set, send a green-room `listen` and log what the phone `said`
 *   --exit      quit once the tally (and the `said`, with --listen) is in
 *   --arm-delay ms to wait after the phone's `mic` before arming (lets it settle its noise floor)
 *
 * Env: RELAY_URL (ws://localhost:8787), PUBLIC_HOST (localhost), COMPANION_URL.
 * On a terminal, type `go`, `stop`, `hush [seconds]` or `listen` to drive a real phone by hand.
 */
import WebSocket from 'ws';
import { createInterface } from 'node:readline';
import { CouchLinkClient, joinUrl, type SocketLike } from 'couch-link';
import type { ActId, PersonaId, PhoneMessage, TvMessage, VenueId } from '@strumble/crowd';

interface Options {
  act: ActId;
  venue: VenueId;
  persona: PersonaId;
  durationSec: number;
  armDelayMs: number;
  hushes: { at: number; for: number }[];
  listen: boolean;
  exit: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = {
    act: 'standup',
    venue: 'club',
    persona: 'warm',
    durationSec: 20,
    armDelayMs: 1500,
    hushes: [],
    listen: false,
    exit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '--act') o.act = next() as ActId;
    else if (a === '--venue') o.venue = next() as VenueId;
    else if (a === '--persona') o.persona = next() as PersonaId;
    else if (a === '--duration') o.durationSec = Number(next());
    else if (a === '--arm-delay') o.armDelayMs = Number(next());
    else if (a === '--hush-at') o.hushes.push({ at: Number(next()), for: 2 });
    else if (a === '--hush-for') {
      const last = o.hushes[o.hushes.length - 1];
      if (!last) {
        console.error('--hush-for needs a --hush-at before it');
        process.exit(2);
      }
      last.for = Number(next());
    } else if (a === '--listen') o.listen = true;
    else if (a === '--exit') o.exit = true;
    else {
      console.error(`unknown option ${a}`);
      process.exit(2);
    }
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const relayUrl = process.env.RELAY_URL ?? 'ws://localhost:8787';
const publicHost = process.env.PUBLIC_HOST ?? 'localhost';
const companionUrl = process.env.COMPANION_URL ?? `https://${publicHost}:5173/`;

const tv = new CouchLinkClient({
  url: relayUrl,
  role: { kind: 'host' },
  socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
});

const send = (to: 'all' | string, msg: TvMessage) => tv.send(to, msg);

interface Tally {
  setId: string;
  startedAt?: number;
  lines: number;
  voice: number;
  pitch: number;
  voiced: number;
  midis: number[];
  wordsFor: number;
  linesWithWords: number;
  words: string;
  /** Hush windows sent, in set seconds (the phone adds a 250 ms tail). */
  hushes: { from: number; to: number }[];
  /** Voice and line events whose time falls inside a hush window (should stay 0). */
  inHush: number;
}

let phone: string | undefined;
let wordsMode = 'unknown';
let setNo = 0;
let tally: Tally | undefined;
let armTimer: ReturnType<typeof setTimeout> | undefined;
let promptNo = 0;
let hushTimers: ReturnType<typeof setTimeout>[] = [];

const AFTER_SET_MS = 1500;
const stamp = () => new Date().toISOString().slice(11, 23);
const log = (line: string) => console.log(`${stamp()} ${line}`);

function arm(): void {
  if (!phone) return log('[tv] no phone to arm');
  setNo++;
  const setId = `set-${Date.now().toString(36)}-${setNo}`;
  tally = {
    setId,
    lines: 0,
    voice: 0,
    pitch: 0,
    voiced: 0,
    midis: [],
    wordsFor: 0,
    linesWithWords: 0,
    words: wordsMode,
    hushes: [],
    inHush: 0,
  };
  const startAt = tv.serverNow() + 500;
  const msg: TvMessage = {
    type: 'arm',
    setId,
    act: opts.act,
    venue: opts.venue,
    persona: opts.persona,
    durationSec: opts.durationSec,
    startAt,
  };
  log(`[tv] arm ${JSON.stringify(msg)}`);
  send(phone, msg);
}

function stop(): void {
  if (!phone || !tally) return log('[tv] nothing to stop');
  log(`[tv] stop ${tally.setId}`);
  send(phone, { type: 'stop', setId: tally.setId });
}

/** Tell the phone the TV is about to make sound for `forSec`, starting now. */
function hush(forSec: number): void {
  if (!phone || !tally) return log('[tv] no live set to hush');
  const untilMs = tv.serverNow() + forSec * 1000;
  if (tally.startedAt !== undefined) {
    const from = (tv.serverNow() - tally.startedAt) / 1000;
    tally.hushes.push({ from, to: from + forSec + 0.25 });
  }
  log(`[tv] hush ${tally.setId} for ${forSec} s (until relay ${Math.round(untilMs)})`);
  send(phone, { type: 'hush', setId: tally.setId, untilMs });
}

function insideHush(t: Tally, at: number): boolean {
  return t.hushes.some((h) => at >= h.from && at <= h.to);
}

function listen(): void {
  if (!phone) return log('[tv] no phone to listen to');
  const promptId = `prompt-${++promptNo}`;
  log(`[tv] listen ${promptId} (8 s)`);
  send(phone, { type: 'listen', promptId, maxSec: 8 });
}

function printTally(t: Tally, at: number): void {
  const sorted = [...t.midis].sort((a, b) => a - b);
  const midi = sorted.length ? sorted[Math.floor(sorted.length / 2)].toFixed(2) : 'n/a';
  console.log(
    `[tally] set=${t.setId} finishedAt=${at}s lines=${t.lines} voice=${t.voice} pitch=${t.pitch} voiced=${t.voiced} medianMidi=${midi} words=${t.words} linesWithWords=${t.linesWithWords} wordsFor=${t.wordsFor} hushes=${t.hushes.length} eventsInHush=${t.inHush}`,
  );
}

tv.on('status', (status) => log(`[tv] ${status}`));
tv.on('session', ({ room }) => {
  console.log(`\n  Room code:  ${room}`);
  console.log(`  Phone URL:  ${joinUrl(companionUrl, room)}\n`);
  console.log(
    `Set: ${opts.act} at ${opts.venue}, ${opts.durationSec} s, MC ${opts.persona}. Waiting for a phone to join…`,
  );
});
tv.on('presence', (playerId, name, connected) => {
  log(`[tv] ${name} (${playerId}) ${connected ? 'joined' : 'disconnected'}`);
  if (connected) {
    phone = playerId;
    send(playerId, { type: 'idle', message: `Hi ${name}, the TV sees your phone.` });
  }
});
tv.on('message', (from, data) => {
  const msg = data as PhoneMessage;
  // How late the phone's events reach us, against its own clock: (relay now − startedAt) − at.
  let lag = '';
  if (tally?.startedAt !== undefined && 'at' in msg && typeof msg.at === 'number') {
    lag = ` lag=${Math.round(tv.serverNow() - tally.startedAt - msg.at * 1000)}ms`;
  }
  log(`[phone]${lag} ${JSON.stringify(msg)}`);

  switch (msg.type) {
    case 'mic':
      wordsMode = msg.words;
      if (msg.ready) {
        send(from, {
          type: 'idle',
          message: `Your microphone is live. Words: ${msg.words}. Arming in ${opts.armDelayMs} ms.`,
        });
        if (armTimer) clearTimeout(armTimer);
        armTimer = setTimeout(arm, opts.armDelayMs);
      } else {
        send(from, { type: 'idle', message: `Mic problem: ${msg.reason ?? 'unknown'}` });
      }
      break;
    case 'words':
      wordsMode = msg.mode;
      if (tally) tally.words = msg.mode;
      break;
    case 'started':
      if (tally && tally.setId === msg.setId) {
        tally.startedAt = msg.startedAt;
        for (const h of opts.hushes) {
          const delay = msg.startedAt + h.at * 1000 - tv.serverNow();
          hushTimers.push(setTimeout(() => hush(h.for), Math.max(0, delay)));
        }
      }
      break;
    case 'voice':
      if (tally) {
        tally.voice++;
        if (insideHush(tally, msg.at)) tally.inHush++;
      }
      break;
    case 'line':
      if (tally) {
        tally.lines++;
        if (msg.line.words !== undefined) tally.linesWithWords++;
        // A line may end at a hush's start (cut off by it), but must never begin inside one.
        if (insideHush(tally, msg.line.t0)) tally.inHush++;
      }
      break;
    case 'words-for':
      if (tally) tally.wordsFor++;
      break;
    case 'pitch':
      if (tally) {
        tally.pitch += msg.samples.length;
        for (const s of msg.samples) {
          if (s.midi !== null) {
            tally.voiced++;
            tally.midis.push(s.midi);
          }
        }
      }
      break;
    case 'finished':
      if (tally && tally.setId === msg.setId) {
        hushTimers.forEach(clearTimeout);
        hushTimers = [];
        printTally(tally, msg.at);
        tally = undefined;
        // A real TV shows the cut sheet first; give the phone its "Done · look at the TV" moment.
        setTimeout(() => {
          if (opts.listen) listen();
          else if (opts.exit) finishUp();
        }, AFTER_SET_MS);
      }
      break;
    case 'said':
      log(`[tv] the phone said: ${msg.text === null ? '(nothing)' : JSON.stringify(msg.text)}`);
      if (opts.exit) finishUp();
      break;
  }
});
tv.on('error', (code, message) => console.error(`[tv] error ${code}: ${message}`));

function finishUp(): void {
  tv.close();
  process.exit(0);
}

tv.connect();

if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const cmd = line.trim();
    if (cmd === 'go') arm();
    else if (cmd === 'stop') stop();
    else if (cmd === 'listen') listen();
    else if (cmd === 'hush' || cmd.startsWith('hush ')) hush(Number(cmd.slice(5)) || 2);
    else if (cmd) console.log('commands: go, stop, hush [seconds], listen');
  });
}

process.on('SIGINT', finishUp);
