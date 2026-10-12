/**
 * Words scripts for the scripted phone (`fake-phone.ts --words <file>`): a set written as bits of lines, turned into
 * the timed phrases a real phone would send, with their words. Pure and seeded, so a run (and its test) repeats exactly.
 *
 * The timing model is the one `fake-phone.ts` always used, now driven by what each line is for:
 * - `setup`: spoken at the script's pace, a normal ending, a short pause after (no real beat);
 * - `punch`: a louder ending and a held beat after it (where the laugh lives), shorter when a `tag` follows;
 * - `tag`: a short follow-up right after the laugh, with its own beat;
 * - `flat`: delivered flat, a pause just long enough to be judged and nothing else;
 * - `line` (poetry, speech, the default): a held beat after, a louder ending when `strong`;
 * - a bit marked `dead` is rushed: no beats, flat endings, and it trails off on a short "uh" right after its last line
 *   (too short to judge), so even the pause that closes the bit is no beat: the room gets nothing from it.
 * Duration comes from the words at the script's pace (`wps`, words a second) with a little seeded jitter, so beats and
 * setup-to-punch shapes still come from timing, as on a real phone. The words are what the script says: the fake
 * recogniser hears every word as written.
 *
 * Two formats. JSON: `{ "act": "standup", "wps": 2.6, "bits": [{ "name": "...", "dead": false, "lines": [{ "text":
 * "...", "role": "punch", "beat": 2.5 }] }] }`. Text: a `## name` heading per bit (`## name (dead)` for a dead bit),
 * then one line per line, optionally prefixed `setup:`, `punch:`, `tag:`, `flat:`, `line:` or `strong:`; `#` comments.
 */
import { tokens, type ActId, type LineEvent } from '@strumble/crowd';

export type Role = 'setup' | 'punch' | 'tag' | 'flat' | 'line' | 'strong';
export const ROLES: Role[] = ['setup', 'punch', 'tag', 'flat', 'line', 'strong'];
/** The phrase kinds performed: the script's roles, plus the trailing "uh" that ends a dead bit. */
export type PhraseRole = Role | 'trail';

export interface ScriptLine {
  text: string;
  role?: Role;
  /** Seconds of silence after the line, overriding the role's beat. */
  beat?: number;
}

export interface ScriptBit {
  name?: string;
  /** Rushed and flat: the room should give it nothing. */
  dead?: boolean;
  lines: ScriptLine[];
}

export interface WordsScript {
  act?: ActId;
  title?: string;
  /** Speaking pace in words a second (stand-up about 2.6, poetry about 2.1, speech about 2.3). */
  wps?: number;
  bits: ScriptBit[];
}

/** One phrase to perform: when, how loud, and what was said. */
export interface ScriptedPhrase {
  t0: number;
  t1: number;
  level: number;
  endLevel: number;
  peakLevel: number;
  text: string;
  role: PhraseRole;
  bit: number;
}

export function parseScript(source: string): WordsScript {
  const trimmed = source.trim();
  const script = trimmed.startsWith('{') ? (JSON.parse(trimmed) as WordsScript) : parseText(trimmed);
  return validate(script);
}

function parseText(source: string): WordsScript {
  const bits: ScriptBit[] = [];
  let act: ActId | undefined;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('##'))) {
      const m = /^#\s*act:\s*(\w+)/.exec(line);
      if (m) act = m[1] as ActId;
      continue;
    }
    if (line.startsWith('##')) {
      const head = line.slice(2).trim();
      const name = head.replace(/\(dead\)\s*$/i, '').trim();
      bits.push(/\(dead\)\s*$/i.test(head) ? { name, dead: true, lines: [] } : { name, lines: [] });
      continue;
    }
    if (bits.length === 0) bits.push({ lines: [] });
    const m = /^(setup|punch|tag|flat|line|strong):\s*(.+)$/i.exec(line);
    bits[bits.length - 1].lines.push(m ? { role: m[1].toLowerCase() as Role, text: m[2] } : { text: line });
  }
  return { act, bits };
}

function validate(script: WordsScript): WordsScript {
  if (!script || !Array.isArray(script.bits) || script.bits.length === 0) throw new Error('a words script needs bits');
  script.bits.forEach((bit, i) => {
    if (!Array.isArray(bit.lines) || bit.lines.length === 0) throw new Error(`bit ${i + 1} has no lines`);
    for (const l of bit.lines) {
      if (typeof l.text !== 'string' || !l.text.trim()) throw new Error(`bit ${i + 1} has an empty line`);
      if (l.role !== undefined && ROLES.indexOf(l.role) < 0) throw new Error(`bit ${i + 1}: unknown role ${l.role}`);
    }
  });
  return script;
}

/** Small seeded generator, so a run can be repeated exactly. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const DEFAULT_WPS: Record<ActId, number> = { standup: 2.6, poetry: 2.1, speech: 2.3, singing: 2 };
/** When the set opens and how long a bit's closing pause is (over BIT_PAUSE_SEC, so the engine closes the bit). */
const FIRST_LINE_SEC = 2.4;
const BIT_GAP_SEC = 2.2;

/** Seconds of silence after a line, by its role, its bit and what follows it. */
function beatAfter(
  line: ScriptLine,
  role: Role,
  dead: boolean,
  next: ScriptLine | undefined,
  rand: () => number,
): number {
  if (line.beat !== undefined) return line.beat;
  // Runs on, but over the phone's 0.3 s voice hangover (closer, a real phone would hear one line) and under the
  // 0.45 s beat: no pause for the room to answer.
  if (dead) return 0.32 + rand() * 0.1;
  switch (role) {
    case 'punch':
      return next && next.role === 'tag' ? 1.1 + rand() * 0.3 : 2.3 + rand() * 0.9;
    case 'tag':
      return 2.2 + rand() * 0.8;
    case 'flat':
      return 0.6 + rand() * 0.3;
    case 'strong':
      return 1.8 + rand() * 0.6;
    case 'line':
      return 1.1 + rand() * 0.5;
    default:
      return 0.32 + rand() * 0.12;
  }
}

/** The script as timed phrases, from t = 0, ending no later than `endSec` (lines past it are dropped). */
export function timeline(script: WordsScript, rand: () => number, endSec = Infinity): ScriptedPhrase[] {
  const act: ActId = script.act ?? 'standup';
  const wps = script.wps ?? DEFAULT_WPS[act];
  const out: ScriptedPhrase[] = [];
  let t = FIRST_LINE_SEC;
  script.bits.forEach((bit, b) => {
    const dead = !!bit.dead;
    bit.lines.forEach((line, i) => {
      const role: Role = line.role ?? (act === 'standup' ? 'setup' : 'line');
      const n = Math.max(1, tokens(line.text).length);
      // Rushed in a dead bit; otherwise the script's pace with about 8 % jitter.
      const len = Math.max(0.9, (n / (wps * (dead ? 1.25 : 1))) * (0.92 + rand() * 0.16));
      if (t + len > endSec) return;
      const level = 0.45 + rand() * 0.1;
      const loud = !dead && (role === 'punch' || role === 'tag' || role === 'strong');
      out.push({
        t0: round3(t),
        t1: round3(t + len),
        level: round3(level),
        endLevel: round3(loud ? level * 1.3 : level * 0.95),
        peakLevel: round3(level * (loud ? 1.45 : 1.15)),
        text: line.text.trim(),
        role,
        bit: b + 1,
      });
      t += len + beatAfter(line, role, dead, bit.lines[i + 1], rand);
      if (dead && i === bit.lines.length - 1) {
        // Trailing off: a 0.3 s "uh" right after the last line takes its beat away. It starts after the phone's 0.3 s
        // voice hangover (sooner, a real phone would hear one line) and before the beat is decided (0.5 s).
        const from = out[out.length - 1].t1 + 0.38;
        out.push({
          t0: round3(from),
          t1: round3(from + 0.3),
          level: 0.3,
          endLevel: 0.27,
          peakLevel: 0.33,
          text: 'uh',
          role: 'trail',
          bit: b + 1,
        });
        t = Math.max(t, from + 0.3);
      }
    });
    t += BIT_GAP_SEC + rand() * 0.8;
  });
  return out;
}

const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'basically', 'literally', 'actually', 'right', 'okay']);
const EDGE_FILLERS = new Set(['like', 'so']);

/** Fillers as the phone counts them (apps/companion/src/set/fillers.ts: anywhere, or "like" / "so" at an edge). */
export function fillersIn(text: string): string[] {
  const words = tokens(text).map((w) => (w === 'ok' ? 'okay' : w));
  const found: string[] = [];
  words.forEach((w, i) => {
    if (w === 'you' && words[i + 1] === 'know') found.push('you know');
    else if (w === 'i' && words[i + 1] === 'mean') found.push('i mean');
    else if (FILLERS.has(w) || (EDGE_FILLERS.has(w) && (i === 0 || i === words.length - 1))) found.push(w);
  });
  return found;
}

/**
 * The line event the phone sends about 300 ms after a phrase ends: times and levels, plus the words. They go as the
 * recogniser's interim guess (`interim: true`), as the real listener sends them when its final result is not in yet;
 * `fake-phone.ts` follows with the final words as `words-for`.
 */
export function lineEvent(p: ScriptedPhrase, id: number, prev: ScriptedPhrase | undefined): LineEvent {
  return {
    id,
    t0: p.t0,
    t1: p.t1,
    level: p.level,
    endLevel: p.endLevel,
    peakLevel: p.peakLevel,
    pauseBefore: round3(prev ? p.t0 - prev.t1 : p.t0),
    words: tokens(p.text).length,
    text: p.text,
    fillers: fillersIn(p.text),
    interim: true,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
