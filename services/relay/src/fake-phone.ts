/**
 * A scripted phone, for testing the TV without a person: joins the TV's room, reports a ready microphone, and when the
 * TV arms a set it performs one, sending what the real phone would (started, voice on/off, a line ~300 ms after each
 * phrase ends, finished). The engine on the TV decides every reaction from those timings, as it does for a real set.
 * Without --words the lines carry no words (`words` off), so the cut sheet shows timing only.
 *
 *   RELAY_DEBUG_ROOMS=1 yarn workspace @strumble/relay start     # the relay, with /rooms on
 *   yarn workspace @strumble/relay fake-phone [--room ABCD] [--name Aman] [--seed 7] [--dead-bits 3,4]
 *   yarn workspace @strumble/relay fake-phone --room ABCD --words scripts/standup-demo.json
 *
 * With --words <file> (JSON or the text format in fake-script.ts) the phone performs that script with words on, as the
 * real phone does in its "service" mode: `mic` and `words` say so, each line goes with the recogniser's interim words
 * (`interim: true`) and the final words follow as `words-for` half a second later, so the TV's content judging runs on
 * it end to end. Timing still comes from each line's role (setups run on, punchlines get a louder ending and a held
 * beat, dead bits are rushed), and the set ends four seconds after the script's last line, as if the performer pressed
 * OK (or on the clock, if the script is longer than the slot). Scripts: services/relay/scripts/.
 * Without --room it takes the only room open on the relay (http://<relay>/rooms). The set's length comes from the TV's
 * `arm`. Bits alternate "landing" (a held beat after the punchline, a short line after a long one, a louder ending) and,
 * for the bits named in --dead-bits, "dying" (rushed lines, no beats), so laughs, silences and heckles all occur.
 * Env: RELAY_URL (ws://localhost:8787).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import WebSocket from 'ws';
import { CouchLinkClient, type SocketLike } from 'couch-link';
import type { LineEvent, PhoneMessage, TvMessage, WordsMode } from '@strumble/crowd';
import { lineEvent, parseScript, timeline, type WordsScript } from './fake-script';

interface Options {
  room?: string;
  name: string;
  seed: number;
  deadBits: number[];
  words?: string;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { name: 'Aman', seed: 7, deadBits: [3, 4] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '--room') o.room = next().toUpperCase();
    else if (a === '--name') o.name = next();
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--dead-bits') o.deadBits = next().split(',').filter(Boolean).map(Number);
    else if (a === '--words') o.words = next();
    else {
      console.error(`unknown option ${a}`);
      process.exit(2);
    }
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));

/** The words script, resolved from the workspace (yarn's cwd) or from where the command was typed. */
function loadScript(file: string): WordsScript {
  const candidates = [resolve(process.cwd(), file), resolve(process.env.INIT_CWD ?? process.cwd(), file)];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error(`no words script at ${candidates.join(' or ')}`);
  return parseScript(readFileSync(path, 'utf8'));
}

const words: WordsScript | null = opts.words ? loadScript(opts.words) : null;
const wordsMode: WordsMode = words ? 'service' : 'off';
/** The final words follow the interim ones by about this much (the recogniser's final lag). */
const FINAL_WORDS_SEC = 0.5;
/** A scripted set ends this long after its last line, as if the performer pressed OK. */
const END_AFTER_LAST_SEC = 4;
const relayUrl = process.env.RELAY_URL ?? 'ws://localhost:8787';
const stamp = () => new Date().toISOString().slice(11, 23);
const log = (line: string) => console.log(`${stamp()} ${line}`);

/** Small seeded generator, so a run can be repeated exactly. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

interface Phrase {
  t0: number;
  t1: number;
  level: number;
  endLevel: number;
  peakLevel: number;
}

/** The set as phrases: bits of 4–6 lines; a landing bit ends on a short, louder punchline followed by a held beat. */
function script(durationSec: number, rand: () => number, deadBits: number[]): Phrase[] {
  const out: Phrase[] = [];
  let t = 2.4;
  let bit = 1;
  const end = durationSec - 4;
  while (t < end) {
    const dead = deadBits.includes(bit);
    const lines = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < lines && t < end; i++) {
      const punch = i === lines - 1 || (!dead && i === 2);
      const len = punch && !dead ? 2.2 + rand() * 1.2 : 5 + rand() * 2.5;
      const level = 0.45 + rand() * 0.1;
      const loud = punch && !dead;
      out.push({
        t0: t,
        t1: Math.min(t + len, end),
        level,
        endLevel: loud ? level * 1.3 : level * 0.95,
        peakLevel: level * (loud ? 1.45 : 1.15),
      });
      t += len;
      // A landing punchline gets a held beat (where the laugh lives); everything else runs on.
      t += loud ? 2.4 + rand() * 1.2 : dead ? 0.25 + rand() * 0.15 : 0.35 + rand() * 0.4;
    }
    t += 1.5 + rand();
    bit++;
  }
  return out;
}

async function findRoom(): Promise<string> {
  if (opts.room) return opts.room;
  const http = relayUrl.replace(/^ws/, 'http');
  const res = await fetch(`${http}/rooms`);
  if (!res.ok)
    throw new Error(`${http}/rooms answered ${res.status}: start the relay with RELAY_DEBUG_ROOMS=1, or pass --room`);
  const { rooms } = (await res.json()) as { rooms: string[] };
  if (rooms.length !== 1)
    throw new Error(`expected one open room, found ${rooms.length} (${rooms.join(', ')}): pass --room`);
  return rooms[0];
}

const room = await findRoom();
const phone = new CouchLinkClient({
  url: relayUrl,
  role: { kind: 'player', room: room as never, name: opts.name },
  socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
});
const send = (msg: PhoneMessage) => phone.send('host', msg);
let timers: ReturnType<typeof setTimeout>[] = [];
const clear = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

function perform(setId: string, startAt: number, durationSec: number): void {
  clear();
  if (words) return performWords(setId, startAt, durationSec, words);
  const phrases = script(durationSec, rng(opts.seed), opts.deadBits);
  const at = (sec: number, fn: () => void) =>
    timers.push(setTimeout(fn, Math.max(0, startAt + sec * 1000 - phone.serverNow())));
  at(0, () => {
    send({ type: 'started', setId, startedAt: startAt });
    log(`[phone] live: ${phrases.length} phrases over ${durationSec} s`);
  });
  phrases.forEach((p, i) => {
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    at(p.t0, () => send({ type: 'voice', setId, at: r3(p.t0), speaking: true, level: r3(p.level) }));
    at(p.t1 + 0.3, () => {
      send({ type: 'voice', setId, at: r3(p.t1), speaking: false, level: 0 });
      const line: LineEvent = {
        id: i + 1,
        t0: r3(p.t0),
        t1: r3(p.t1),
        level: r3(p.level),
        endLevel: r3(p.endLevel),
        peakLevel: r3(p.peakLevel),
        pauseBefore: r3(i ? p.t0 - phrases[i - 1].t1 : p.t0),
      };
      send({ type: 'line', setId, line });
    });
  });
  at(durationSec, () => {
    send({ type: 'finished', setId, at: durationSec });
    log('[phone] finished');
  });
}

/** The words script, performed: the same messages as a real phone with words on. */
function performWords(setId: string, startAt: number, durationSec: number, script: WordsScript): void {
  const phrases = timeline(script, rng(opts.seed), durationSec - 1);
  const at = (sec: number, fn: () => void) =>
    timers.push(setTimeout(fn, Math.max(0, startAt + sec * 1000 - phone.serverNow())));
  const last = phrases.length ? phrases[phrases.length - 1].t1 : 0;
  const end = Math.min(durationSec, Math.round((last + END_AFTER_LAST_SEC) * 10) / 10);
  at(0, () => {
    send({ type: 'started', setId, startedAt: startAt });
    const title = script.title ? `"${script.title}", ` : '';
    log(`[phone] live: ${title}${phrases.length} lines, ends at ${end} s of a ${durationSec} s slot`);
  });
  phrases.forEach((p, i) => {
    const line = lineEvent(p, i + 1, phrases[i - 1]);
    at(p.t0, () => send({ type: 'voice', setId, at: p.t0, speaking: true, level: p.level }));
    at(p.t1 + 0.3, () => {
      send({ type: 'voice', setId, at: p.t1, speaking: false, level: 0 });
      send({ type: 'line', setId, line });
      log(`[phone] ${p.role.padEnd(6)} bit ${p.bit} · ${p.text}`);
    });
    at(p.t1 + 0.3 + FINAL_WORDS_SEC, () =>
      send({
        type: 'words-for',
        setId,
        lineId: line.id,
        words: line.words ?? 0,
        text: line.text ?? '',
        fillers: line.fillers ?? [],
      }),
    );
  });
  at(end, () => {
    send({ type: 'finished', setId, at: end });
    log('[phone] finished');
  });
}

phone.on('status', (s) => log(`[phone] ${s}`));
// A phone that just left under this name keeps its seat for a few seconds (the relay's resume window); try again.
let nameRetries = 0;
phone.on('error', (code, message) => {
  log(`[phone] error ${code}: ${message}`);
  if (code === 'name-taken' && nameRetries++ < 5) setTimeout(() => phone.connect(), 3500);
});
phone.on('session', (s) => {
  log(`[phone] joined room ${s.room} as ${opts.name}`);
  send({ type: 'mic', ready: true, words: wordsMode });
  if (words) send({ type: 'words', mode: wordsMode });
});
phone.on('message', (_from, data) => {
  const msg = data as TvMessage;
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'arm':
      log(`[tv] arm ${msg.act} at ${msg.venue}, ${msg.durationSec} s, persona ${msg.persona}`);
      if (words && words.act && words.act !== msg.act)
        log(`[phone] note: the script is ${words.act}, the TV armed ${msg.act}`);
      perform(msg.setId, msg.startAt, msg.durationSec);
      return;
    case 'stop':
      log('[tv] stop');
      clear();
      return;
    case 'hush':
      log(`[tv] hush for ${((msg.untilMs - phone.serverNow()) / 1000).toFixed(1)} s`);
      return;
    case 'listen':
      log(`[tv] listen ${msg.promptId}: answering with nothing heard`);
      timers.push(setTimeout(() => send({ type: 'said', promptId: msg.promptId, text: null }), 1500));
      return;
    default:
      log(`[tv] ${msg.type}`);
  }
});
phone.connect();
