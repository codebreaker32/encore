/**
 * Filler words, counted from the recogniser's text for one line.
 *
 * Deliberately simple: a filler counts only as a standalone token; "like" and "so" count only as
 * the first or last token of a line (mid-line they are usually real words). The browser's
 * recogniser tends to leave "um" and "uh" out of its transcripts, so this undercounts rather
 * than overcounts; the scorecard's "fillers" means "fillers the recogniser wrote down".
 */
const ANYWHERE: ReadonlySet<string> = new Set([
  'um',
  'uh',
  'er',
  'erm',
  'basically',
  'literally',
  'actually',
  'right',
  'okay',
]);
const EDGES: ReadonlySet<string> = new Set(['like', 'so']);
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['you', 'know'],
  ['i', 'mean'],
];
const ALIASES: Record<string, string> = { ok: 'okay', umm: 'um', uhm: 'um', uhh: 'uh' };

export interface WordsSummary {
  words: number;
  text: string;
  fillers: string[];
}

/** Lower-cased word tokens; punctuation dropped, apostrophes kept ("don't"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ALIASES[w] ?? w);
}

/** Every filler occurrence, in order, so the TV can count them and rank the top three. */
export function findFillers(tokens: string[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    const pair = PAIRS.find(([a, b]) => a === word && tokens[i + 1] === b);
    if (pair) {
      found.push(`${pair[0]} ${pair[1]}`);
      i++;
      continue;
    }
    if (ANYWHERE.has(word) || (EDGES.has(word) && (i === 0 || i === tokens.length - 1))) found.push(word);
  }
  return found;
}

export function describeWords(text: string): WordsSummary {
  const tokens = tokenize(text);
  return { words: tokens.length, text: text.trim(), fillers: findFillers(tokens) };
}
