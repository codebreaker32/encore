/**
 * Tier 1 of content judging: what the performer SAID, measured deterministically from the recogniser's words.
 *
 * Every feature here is a pattern in the text (or, for singing, in the pitch), never an opinion: a word that comes back
 * from an earlier bit, a line end that rhymes by spelling, three items in a row. They only ever ADD to a line's landing
 * score (a joke the patterns miss costs nothing), they are capped per act (`CONTENT_CAP`), and they apply only when
 * words are on and the line's words were in when the room decided. Singing's features come from the pitch, which is
 * measured with words on or off.
 *
 * Pure and deterministic: no clock, no randomness, ES2020 and TypeScript 4.8 clean, ASCII-only text handling.
 */
import type { ActId, ContentFeature, LineEvent, PitchSample } from './types';
import { ordinal } from './format';

// ---------------------------------------------------------------------------------------------
// Weights (documented in docs/concept-encore.md, "Content judging")

/** What each feature adds to a line's landing score, per act. Features an act does not list are never looked for. */
export const CONTENT_WEIGHTS: Record<ActId, Partial<Record<ContentFeature, number>>> = {
  standup: { callback: 0.15, wordplay: 0.1, triad: 0.1, reversal: 0.08, tag: 0.07, specific: 0.05 },
  poetry: { endRhyme: 0.15, anaphora: 0.08, alliteration: 0.07, meter: 0.07, volta: 0.06, internalRhyme: 0.05 },
  speech: { triad: 0.12, contrast: 0.1, anaphora: 0.1, callToAction: 0.08, quotable: 0.08, question: 0.06 },
  singing: { heldNote: 0.1, finalNote: 0.08, range: 0.05 },
};

/** The most that content (Tier 1 plus the model's estimate) may add to one line. Timing stays the larger part. */
export const CONTENT_CAP: Record<ActId, number> = { standup: 0.3, poetry: 0.3, speech: 0.3, singing: 0.2 };

/**
 * The model judge's weight per act (Tier 2: one estimate per line from the MC service, `kind: judge`). Its score
 * counts only above the act's JUDGE_FLOOR, scaled to 0..1 from there: a line rated as ordinary adds nothing.
 */
export const JUDGE_WEIGHT: Record<ActId, number> = { standup: 0.2, poetry: 0.15, speech: 0.15, singing: 0 };

/**
 * Where the estimate starts to count, on each act's own scale (docs/judge-calibration.md). Stand-up's score is a
 * percentile among held-out Reddit jokes (0.7 humour model + 0.3 LLM), so a typical joke is about 0.5; at 0.70 only
 * about the top fifth of Reddit jokes count, and on our stand-up pairs 10 of 20 strong lines against 1 of 20 flat ones
 * (0.60 would let in 14 strong and 7 flat). Content only adds, so this favours precision. Poetry and speech use the
 * LLM's rubric scale. Speech's 0.5 is the rubric's middle. The poetry rubric rates nearly every competent line 0.8 or
 * more (on the Android TV emulator, 2026-10-12, eleven lines of one poem scored 0.80-1.00, the flat one 0.80), so
 * poetry's floor is 0.8: only a line the model marks above that counts.
 */
export const JUDGE_FLOOR: Record<ActId, number> = { standup: 0.7, poetry: 0.8, speech: 0.5, singing: 1 };

/**
 * Patterns that support a line but never lift it alone: a specific detail is good stand-up craft, not a punchline, and
 * a steady meter is the norm in a poem, not a moment. Content counts toward the score only when the line also has a
 * pattern of its own kind (a callback, wordplay, a triad, a reversal, a tag; a rhyme, a turn …) or the MC model's
 * estimate is above its floor; otherwise it adds nothing and the why does not claim it.
 */
export const SUPPORT_ONLY: Record<ActId, ContentFeature[]> = {
  standup: ['specific'],
  poetry: ['meter'],
  speech: [],
  singing: [],
};

/** The hits that count toward a line's score, given the model's bonus: none without a primary pattern or the model. */
export function countingHits(act: ActId, hits: ContentHit[], modelBonus: number): ContentHit[] {
  const support = SUPPORT_ONLY[act];
  const primary = hits.some((h) => support.indexOf(h.feature) < 0);
  return primary || modelBonus > 0 ? hits : [];
}

/** The bonus a judge score earns: JUDGE_WEIGHT × the part of the score above the act's floor, scaled to 0..1. */
export function judgeBonus(act: ActId, score: number): number {
  const floor = JUDGE_FLOOR[act];
  if (floor >= 1) return 0;
  const above = (Math.min(1, Math.max(0, score)) - floor) / (1 - floor);
  return JUDGE_WEIGHT[act] * Math.max(0, above);
}

// Feature thresholds.
/** A callback returns to a word from an earlier bit at least this long ago. */
export const CALLBACK_MIN_GAP_SEC = 15;
/** Meter: a line's syllables within this share (or one syllable) of the mean of the two lines before. */
export const METER_TOLERANCE = 0.15;
export const METER_MIN_SYLLABLES = 4;
/** A quotable line: at most this many words, after a line at least twice as long and at least QUOTABLE_AFTER_WORDS. */
export const QUOTABLE_MAX_WORDS = 8;
export const QUOTABLE_AFTER_WORDS = 12;
/** Singing: one note held this long in a phrase ... */
export const HELD_NOTE_SEC = 1.5;
/** A punch-shaped line for the "the punch turns a word" wordplay: this short, or at most eight words. */
export const PUNCH_SHAPE_SEC = 2.5;
/** ... the phrase ending on one note held this long, at or above the phrase's mean level ... */
export const FINAL_NOTE_SEC = 1.0;
/** ... notes held at least NOTE_MIN_SEC spanning this many semitones in one phrase. */
export const RANGE_MIN_SEMITONES = 7;
export const NOTE_MIN_SEC = 0.3;

// ---------------------------------------------------------------------------------------------
// What a hit looks like

export interface ContentHit {
  feature: ContentFeature;
  /** The measured reason, for the cut sheet: 'a callback to "landlord" from your first bit'. */
  why: string;
  /** The short form for the live caption: 'a callback to your first bit'. */
  caption: string;
}

/** What the features may know about the set so far. */
export interface ContentContext {
  act: ActId;
  /** Earlier lines, oldest first, each with the 1-based bit it belongs to. */
  earlier: { line: LineEvent; bit: number }[];
  /** The bit this line belongs to. */
  bit: number;
  /** The last line the room reacted to (positively), with when the reaction came: for a tag. */
  lastReacted?: { line: LineEvent; at: number };
}

/** The features found in a line, strongest first (by this act's weights). Empty without text. */
export function contentHits(line: LineEvent, ctx: ContentContext): ContentHit[] {
  const weights = CONTENT_WEIGHTS[ctx.act];
  if (ctx.act === 'singing' || !line.text || !line.text.trim()) return [];
  const words = tokens(line.text);
  if (words.length === 0) return [];
  const hits: ContentHit[] = [];
  const add = (h: ContentHit | null) => {
    if (h && weights[h.feature] !== undefined && !hits.some((x) => x.feature === h.feature)) hits.push(h);
  };
  const withText = ctx.earlier.filter((e) => !!e.line.text && tokens(e.line.text).length > 0);
  const sameBit = withText.filter((e) => e.bit === ctx.bit);
  const prev = withText.length ? withText[withText.length - 1] : undefined;
  const prevInBit = sameBit.length ? sameBit[sameBit.length - 1] : undefined;

  if (weights.callback !== undefined) add(callback(line, words, ctx, withText, sameBit));
  if (weights.wordplay !== undefined) add(wordplay(line, words, prevInBit ? prevInBit.line : undefined));
  if (weights.triad !== undefined) add(triad(line.text, words, sameBit));
  if (weights.reversal !== undefined) add(reversal(words, !!prevInBit));
  if (weights.tag !== undefined) add(tag(line, words, ctx.lastReacted));
  if (weights.specific !== undefined) add(specific(line.text, words));
  if (weights.endRhyme !== undefined) add(endRhyme(words, withText));
  if (weights.internalRhyme !== undefined) add(internalRhyme(words));
  if (weights.alliteration !== undefined) add(alliteration(words));
  if (weights.meter !== undefined) add(meter(words, withText));
  if (weights.anaphora !== undefined) add(anaphora(words, prev ? prev.line : undefined));
  if (weights.volta !== undefined) add(volta(words, withText.length));
  if (weights.contrast !== undefined) add(contrast(words, prevInBit ? prevInBit.line : undefined));
  if (weights.question !== undefined) add(question(line.text, words));
  if (weights.callToAction !== undefined) add(callToAction(words));
  if (weights.quotable !== undefined) add(quotable(words, prevInBit ? prevInBit.line : undefined));
  return hits.sort((a, b) => (weights[b.feature] ?? 0) - (weights[a.feature] ?? 0));
}

/** The sum of the hits' weights for this act (uncapped; the engine caps content with the judge at CONTENT_CAP). */
export function contentWeight(act: ActId, hits: ContentHit[]): number {
  return hits.reduce((n, h) => n + (CONTENT_WEIGHTS[act][h.feature] ?? 0), 0);
}

// ---------------------------------------------------------------------------------------------
// Words

const STOP = new Set(
  (
    "a an the and or but so if then than that this these those there here it its it's is am are was were be been being " +
    'i me my mine we us our you your yours he him his she her hers they them their what which who whom whose when ' +
    'where why how all any both each few more most other some such no nor not only own same too very can will just ' +
    "don't should now of at by for with about against between into through during before after above below to from " +
    'up down in out on off over under again further once do does did doing have has had having would could might must ' +
    "shall i'm you're he's she's we're they're i've you've we've they've i'd you'd he'd she'd we'd they'd i'll you'll " +
    "he'll she'll we'll they'll isn't aren't wasn't weren't hasn't haven't hadn't doesn't didn't won't wouldn't can't " +
    "cannot couldn't shouldn't let's that's who's what's here's there's when's where's why's how's oh um uh er erm like " +
    'yeah okay ok well really actually basically literally right know mean got get gets getting go goes going gonna ' +
    'wanna gotta one ones thing things stuff way said say says told tell also even still back just much many lot lots'
  ).split(' '),
);

/**
 * Common enough in any talk that their return is not a callback or a tag: discourse words and the few hundred most
 * frequent English words. A callback has to come back on a word that is distinctive in ordinary speech.
 */
const GENERIC = new Set(
  (
    'people person thing things time times day days year years guy guys man men woman women kid kids life world ' +
    'today tonight night morning good great little big whole kind sort place work home friend friends family ' +
    'think thought want wanted make made take took come came look looked something nothing everything anything ' +
    'someone everyone anyone always never ever maybe probably pretty first last next other another every ' +
    'anyway whatever honestly seriously totally obviously sure alright guess kinda sorta definitely exactly ' +
    'absolutely apparently suddenly finally usually already almost quite rather enough else instead though ' +
    'yesterday tomorrow week weeks month months hour hours minute minutes second seconds moment while ' +
    'new old long short high low small large young bad best better worse worst real true same different ' +
    'right left last hard easy full free open close early late whole able sure clear strong nice fine ' +
    'find found give gave given keep kept feel felt leave left call called need needed seem seemed help ' +
    'show showed try tried start started turn turned move moved live lived believe bring brought happen ' +
    'happened write wrote read sit sat stand stood lose lost pay paid meet met include continue learn ' +
    'change changed lead understand watch watched follow stop stopped create speak spoke spend spent grow ' +
    'open walk walked offer remember love loved consider appear buy wait waited serve die send sent expect ' +
    'build stay fall fell reach kill remain suggest raise pass sell require report decide pull ask asked ' +
    'talk talked tell told hear heard play played run ran put mean meant work worked use used let ' +
    'house room water money point hand hands eye eyes head face door car side part case story fact ' +
    'question problem number word words name names school state country city group company area idea ' +
    'body back line lines end way ways night food phone video picture music movie show game book job ' +
    'everybody somebody nobody yourself myself himself herself ourselves themselves itself ' +
    'lot bit stuff whole half couple bunch mom dad mum mother father brother sister wife husband ' +
    'girlfriend boyfriend baby kid child children parents son daughter friend boss dude bro ' +
    'funny weird crazy stupid cool awesome amazing literally actually basically totally super ' +
    'yes yeah yep nope okay alright hello hey thanks thank please sorry wow'
  ).split(' '),
);

/** Lower-cased word tokens: letters, digits and inner apostrophes ("don't"); everything else splits. */
export function tokens(text: string): string[] {
  const hit = TOKEN_CACHE.get(text);
  if (hit) return hit;
  const out = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 0);
  remember(TOKEN_CACHE, text, out);
  return out;
}

/**
 * Caches for the per-line work, keyed by the text itself (deterministic, invisible to callers; the arrays and sets
 * are shared, so callers never mutate them). The screens ask for the scorecard on every tick, and every line's
 * patterns are checked against every earlier line, so without these a set's later minutes re-tokenised the same text
 * thousands of times: on the Google TV that work stalled the JS thread by seconds (2026-10-12).
 */
const TOKEN_CACHE = new Map<string, string[]>();
const STEM_CACHE = new Map<string, string>();
const STEM_SET_CACHE = new Map<string, Set<string>>();
const CACHE_MAX = 4000;

function remember<V>(cache: Map<string, V>, key: string, value: V): void {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, value);
}

/** The stems of a text's words, cached. */
function stemsOf(text: string): Set<string> {
  const hit = STEM_SET_CACHE.get(text);
  if (hit) return hit;
  const out = new Set(tokens(text).map(stem));
  remember(STEM_SET_CACHE, text, out);
  return out;
}

function content(w: string): boolean {
  return w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);
}

/** A light suffix stemmer, enough to match "landlord" with "landlords" and "drive" with "driving". */
export function stem(word: string): string {
  const hit = STEM_CACHE.get(word);
  if (hit !== undefined) return hit;
  const out = stemOf(word);
  remember(STEM_CACHE, word, out);
  return out;
}

function stemOf(word: string): string {
  let s = word.replace(/'s$/, '').replace(/'/g, '');
  if (s.length > 5 && /ies$/.test(s)) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && /(sses|shes|ches|xes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && /s$/.test(s) && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && /ing$/.test(s)) s = s.slice(0, -3);
  else if (s.length > 4 && /ed$/.test(s)) s = s.slice(0, -2);
  if (s.length > 3 && /([^aeiouls])\1$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && /e$/.test(s)) s = s.slice(0, -1);
  return s;
}

function quote(w: string): string {
  return `"${w}"`;
}

// ---------------------------------------------------------------------------------------------
// Stand-up

function callback(
  line: LineEvent,
  words: string[],
  ctx: ContentContext,
  withText: { line: LineEvent; bit: number }[],
  sameBit: { line: LineEvent; bit: number }[],
): ContentHit | null {
  const inBit = new Set<string>();
  for (const e of sameBit) stemsOf(e.line.text || '').forEach((x) => inBit.add(x));
  for (const w of words) {
    if (!content(w) || w.length < 4 || GENERIC.has(w)) continue;
    const s = stem(w);
    if (inBit.has(s)) continue; // still the topic of this bit, not a return to an old one
    for (const e of withText) {
      if (e.bit >= ctx.bit || line.t0 - e.line.t1 < CALLBACK_MIN_GAP_SEC) continue;
      if (stemsOf(e.line.text || '').has(s)) {
        return {
          feature: 'callback',
          why: `a callback to ${quote(w)} from your ${ordinal(e.bit)} bit`,
          caption: `a callback to your ${ordinal(e.bit)} bit`,
        };
      }
    }
  }
  return null;
}

/** Pairs that sound alike and are spelled apart, so a recogniser writes both only when both were said. */
const HOMOPHONES: string[][] = [
  ['knight', 'night'],
  ['son', 'sun'],
  ['whole', 'hole'],
  ['piece', 'peace'],
  ['flour', 'flower'],
  ['mail', 'male'],
  ['sale', 'sail'],
  ['weight', 'wait'],
  ['break', 'brake'],
  ['steal', 'steel'],
  ['meet', 'meat'],
  ['week', 'weak'],
  ['dear', 'deer'],
  ['hair', 'hare'],
  ['pair', 'pear'],
  ['plain', 'plane'],
  ['bare', 'bear'],
  ['blew', 'blue'],
  ['buy', 'bye'],
  ['cell', 'sell'],
  ['cent', 'scent'],
  ['die', 'dye'],
  ['fair', 'fare'],
  ['flew', 'flu'],
  ['groan', 'grown'],
  ['heal', 'heel'],
  ['higher', 'hire'],
  ['made', 'maid'],
  ['missed', 'mist'],
  ['moose', 'mousse'],
  ['morning', 'mourning'],
  ['pain', 'pane'],
  ['pole', 'poll'],
  ['pray', 'prey'],
  ['principal', 'principle'],
  ['rain', 'reign'],
  ['road', 'rode'],
  ['role', 'roll'],
  ['root', 'route'],
  ['seam', 'seem'],
  ['sole', 'soul'],
  ['stair', 'stare'],
  ['tail', 'tale'],
  ['threw', 'through'],
  ['vain', 'vein'],
  ['waist', 'waste'],
  ['weigh', 'way'],
  ['bored', 'board'],
  ['cereal', 'serial'],
  ['desert', 'dessert'],
  ['grate', 'great'],
  ['idle', 'idol'],
  ['lessen', 'lesson'],
  ['medal', 'meddle'],
  ['naval', 'navel'],
  ['patience', 'patients'],
  ['presence', 'presents'],
  ['rap', 'wrap'],
  ['ring', 'wring'],
  ['sight', 'site'],
  ['suite', 'sweet'],
  ['symbol', 'cymbal'],
  ['tide', 'tied'],
  ['wail', 'whale'],
  ['holy', 'wholly'],
  ['aloud', 'allowed'],
  ['ball', 'bawl'],
  ['berry', 'bury'],
  ['birth', 'berth'],
  ['border', 'boarder'],
  ['ceiling', 'sealing'],
  ['chili', 'chilly'],
  ['coarse', 'course'],
  ['colonel', 'kernel'],
  ['council', 'counsel'],
  ['days', 'daze'],
  ['dual', 'duel'],
  ['feat', 'feet'],
  ['flea', 'flee'],
  ['foul', 'fowl'],
  ['guessed', 'guest'],
  ['heard', 'herd'],
  ['hoarse', 'horse'],
  ['isle', 'aisle'],
  ['jeans', 'genes'],
  ['loan', 'lone'],
  ['minor', 'miner'],
  ['muscle', 'mussel'],
  ['pause', 'paws'],
  ['peak', 'peek'],
  ['pedal', 'peddle'],
  ['poor', 'pour'],
  ['profit', 'prophet'],
  ['rose', 'rows'],
  ['sauce', 'source'],
  ['scene', 'seen'],
  ['soar', 'sore'],
  ['stake', 'steak'],
  ['wade', 'weighed'],
  ['warn', 'worn'],
  ['whine', 'wine'],
  ['yoke', 'yolk'],
  ['cheap', 'cheep'],
  ['knead', 'need'],
  ['seller', 'cellar'],
  ['bean', 'been'],
];
const HOMOPHONE_OF: Record<string, string> = {};
for (const [a, b] of HOMOPHONES) {
  HOMOPHONE_OF[a] = b;
  HOMOPHONE_OF[b] = a;
}

/**
 * Wordplay, where a pattern can show it: a pair of homophones across the setup and the punch, or the punch ending on
 * a word from its setup (the classic turn: "by winter" ... "which winter"). Senses are not detectable; the repeat is.
 */
function wordplay(line: LineEvent, words: string[], setup: LineEvent | undefined): ContentHit | null {
  const setupWords = setup && setup.text ? tokens(setup.text) : [];
  const pool = new Set(setupWords.concat(words));
  for (const w of words) {
    const twin = HOMOPHONE_OF[w];
    if (twin && pool.has(twin)) {
      return {
        feature: 'wordplay',
        why: `wordplay: ${quote(twin)} and ${quote(w)}`,
        caption: `wordplay on ${quote(w)}`,
      };
    }
  }
  if (setupWords.length === 0 || words.length < 3) return null;
  // The turn is a punch's move: a short line after a longer setup. A long line ending on a setup word is just talk.
  const punchShaped = words.length < setupWords.length && (line.t1 - line.t0 <= PUNCH_SHAPE_SEC || words.length <= 8);
  if (!punchShaped) return null;
  const last = lastContent(words);
  if (!last || GENERIC.has(last) || last.length < 4) return null;
  const s = stem(last);
  if (stemsOf(setup ? setup.text || '' : '').has(s)) {
    return {
      feature: 'wordplay',
      why: `the punch turns ${quote(last)} from the setup`,
      caption: `the punch turns ${quote(last)}`,
    };
  }
  return null;
}

function lastContent(words: string[]): string | undefined {
  for (let i = words.length - 1; i >= 0; i--) if (content(words[i])) return words[i];
  return undefined;
}

const TURNS = ['turns out', 'turned out', 'only to', 'then again', 'which means', 'the problem is', 'except'];
const TURN_WORDS = new Set(['but', 'until', 'instead', 'unless', 'apparently', 'though', 'although']);

function reversal(words: string[], hasSetup: boolean): ContentHit | null {
  if (!hasSetup) return null;
  const text = ` ${words.join(' ')} `;
  for (const t of TURNS) if (text.indexOf(` ${t} `) >= 0) return turnHit('reversal', t);
  const notBut = notThenBut(words);
  if (notBut) return { feature: 'reversal', why: 'a reversal ("not ... but")', caption: 'a reversal' };
  // A turn word counts in the first half of the line: that is where a punch pivots.
  for (let i = 0; i < Math.max(1, Math.ceil(words.length / 2)); i++) {
    if (TURN_WORDS.has(words[i])) return turnHit('reversal', words[i]);
  }
  return null;
}

function turnHit(feature: ContentFeature, marker: string): ContentHit {
  return { feature, why: `a reversal (${quote(marker)})`, caption: 'a reversal' };
}

function notThenBut(words: string[]): boolean {
  const n = words.indexOf('not');
  if (n < 0) return false;
  for (let i = n + 2; i < words.length; i++) if (words[i] === 'but') return true;
  return false;
}

function tag(line: LineEvent, words: string[], last: ContentContext['lastReacted']): ContentHit | null {
  if (!last || !last.line.text || last.line.id === line.id) return null;
  if (line.t0 < last.at - 0.5 || line.t0 - last.at > 3) return null; // the tag window after a laugh
  const earlier = stemsOf(last.line.text);
  for (const w of words) {
    if (content(w) && !GENERIC.has(w) && earlier.has(stem(w))) {
      return { feature: 'tag', why: `a tag on the ${quote(w)} laugh`, caption: `a tag on the ${quote(w)} laugh` };
    }
  }
  return null;
}

const NUMBER_WORDS = new Set(
  (
    'two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen ' +
    'eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen'
  ).split(' '),
);

/** Specificity: a number, or a name the recogniser capitalised mid-line. */
function specific(text: string, words: string[]): ContentHit | null {
  for (const w of words) {
    if (/^\d/.test(w) || NUMBER_WORDS.has(w))
      return { feature: 'specific', why: `specific (${quote(w)})`, caption: 'a specific detail' };
  }
  // A capital counts only mid-sentence: not the first word, nor one after . ! ? : ; or a quote (a sentence start).
  const word = /[A-Za-z0-9']+/g;
  let m: RegExpExecArray | null;
  let first = true;
  while ((m = word.exec(text)) !== null) {
    const w = m[0];
    const before = text.slice(0, m.index).replace(/\s+$/, '');
    const starts = first || before.length === 0 || /[.!?:;"\u201c\u201d(]$/.test(before);
    first = false;
    if (starts || !/^[A-Z][a-z]{2,}/.test(w)) continue;
    const low = w.toLowerCase();
    if (/^(I|I'm|I'd|I'll|I've|OK|Okay)$/.test(w) || STOP.has(low) || GENERIC.has(low)) continue;
    return { feature: 'specific', why: `specific (${quote(w)})`, caption: 'a specific detail' };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Shared: triads and anaphora

/** Very common openings that are not a figure of speech when they repeat once. */
const PLAIN_OPENERS = new Set([
  'the',
  'a',
  'an',
  'and',
  'so',
  'but',
  'um',
  'uh',
  'like',
  'then',
  'well',
  'oh',
  'okay',
  'ok',
  'yeah',
  'i',
  'it',
  'you',
  'we',
  'he',
  'she',
  'they',
  'my',
  'this',
  'that',
  'there',
  'is',
  'was',
  'and',
  'or',
]);
const FUNCTION = new Set([
  'of',
  'the',
  'a',
  'an',
  'in',
  'on',
  'to',
  'and',
  'at',
  'for',
  'is',
  'it',
  'was',
  'i',
  'that',
]);

/** A list of three: "a, b and c" (when the recogniser punctuates), "a and b and c", a phrase said three times, or the
 * third line in a row with the same opening. */
function triad(text: string, words: string[], sameBit: { line: LineEvent; bit: number }[]): ContentHit | null {
  if (/\b[\w']+(?:\s+[\w']+){0,4},\s*[\w']+(?:\s+[\w']+){0,4},?\s+(?:and|or)\s+[\w']+/i.test(text)) {
    return { feature: 'triad', why: 'a list of three', caption: 'a list of three' };
  }
  const ands: number[] = [];
  words.forEach((w, i) => {
    if (w === 'and' || w === 'or') ands.push(i);
  });
  for (let k = 0; k + 1 < ands.length; k++) {
    const a = ands[k];
    const b = ands[k + 1];
    const first = a - (k > 0 ? ands[k - 1] + 1 : 0);
    if (first >= 1 && first <= 4 && b - a - 1 >= 1 && b - a - 1 <= 4 && b + 1 < words.length) {
      return { feature: 'triad', why: 'a list of three ("... and ... and ...")', caption: 'a list of three' };
    }
  }
  const counts: Record<string, number> = {};
  for (let i = 0; i + 1 < words.length; i++) {
    if (FUNCTION.has(words[i]) && FUNCTION.has(words[i + 1])) continue;
    const bigram = `${words[i]} ${words[i + 1]}`;
    counts[bigram] = (counts[bigram] || 0) + 1;
    if (counts[bigram] >= 3) {
      return { feature: 'triad', why: `three times ${quote(bigram)}`, caption: `three times ${quote(bigram)}` };
    }
  }
  if (sameBit.length >= 2) {
    const a = tokens(sameBit[sameBit.length - 2].line.text || '');
    const b = tokens(sameBit[sameBit.length - 1].line.text || '');
    const opening = sharedOpening(words, b);
    if (opening && sharedOpening(b, a) === opening) {
      return { feature: 'triad', why: `the third line opening ${quote(opening)}`, caption: 'a list of three' };
    }
  }
  return null;
}

/** The opening two lines share: their first two words, or their first word when it is not a plain one. */
function sharedOpening(x: string[], y: string[]): string | null {
  if (x.length >= 2 && y.length >= 2 && x[0] === y[0] && x[1] === y[1]) return `${x[0]} ${x[1]}`;
  if (x.length >= 1 && y.length >= 1 && x[0] === y[0] && !PLAIN_OPENERS.has(x[0])) return x[0];
  return null;
}

function anaphora(words: string[], prev: LineEvent | undefined): ContentHit | null {
  if (!prev || !prev.text) return null;
  const opening = sharedOpening(words, tokens(prev.text));
  if (!opening) return null;
  return { feature: 'anaphora', why: `a repeated opening (${quote(opening)})`, caption: `${quote(opening)} again` };
}

// ---------------------------------------------------------------------------------------------
// Poetry

/**
 * A rough sound of a word from its spelling (ASCII rules, no dictionary): long vowels as capitals, common digraphs
 * folded ("light" and "bite" both end "It"). Good enough to hear most end rhymes; spelling is not sound, so it misses
 * some ("love" / "of") and accepts some eye rhymes ("love" / "move").
 */
export function sound(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length > 3 && /[^s]s$/.test(w) && !/(us|is|ous)$/.test(w)) w = w.slice(0, -1);
  if (w === 'they' || w === 'grey' || w === 'prey' || w === 'obey' || w === 'hey') return `${w.slice(0, -2)}A`;
  w = w
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^wh/, 'w')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/mb$/, 'm')
    .replace(/(t|s)ion$/, 'shun')
    .replace(/eigh/g, 'A')
    .replace(/igh/g, 'I')
    .replace(/ee|ea/g, 'E')
    .replace(/ai|ay/g, 'A')
    .replace(/oa/g, 'O')
    .replace(/oo|ew$|ue$/g, 'U')
    .replace(/oi|oy/g, 'Y')
    .replace(/au|aw/g, 'R')
    .replace(/ow$|oe$/g, 'O')
    .replace(/ou/g, 'W');
  if (/^[^aeiouAEIOUWYR]+ie$/.test(w)) w = `${w.slice(0, -2)}I`;
  else if (/ie$/.test(w)) w = `${w.slice(0, -2)}E`;
  if (/ey$/.test(w)) w = `${w.slice(0, -2)}E`;
  if (/[^aeiouAEIOUWYR]y$/.test(w))
    w = w.length <= 4 && !/[aeiouAEIOU]/.test(w.slice(0, -1)) ? `${w.slice(0, -1)}I` : `${w.slice(0, -1)}E`;
  // A silent e makes the vowel before it long: "bite", "hope", "plane".
  const silent = /([aeiou])([^aeiouAEIOUWYR]{1,2})e$/.exec(w);
  if (silent && !/le$/.test(w)) w = `${w.slice(0, silent.index)}${silent[1].toUpperCase()}${silent[2]}`;
  else if (/^[^aeiou]{1,2}e$/.test(w) && w !== 'the') w = `${w.slice(0, -1)}E`;
  else if (/^[^aeiou]{1,2}o$/.test(w)) w = `${w.slice(0, -1)}${/^(d|t|w|tw)o$/.test(w) ? 'U' : 'O'}`;
  return w;
}

/** The part of a word that rhymes: from its last vowel sound to the end. Null when there is no vowel. */
export function rhymeKey(word: string): string | null {
  const s = sound(word);
  for (let i = s.length - 1; i >= 0; i--) {
    if (/[aeiouAEIOUWYR]/.test(s[i])) {
      let j = i;
      while (j > 0 && /[aeiou]/.test(s[j - 1]) && /[aeiou]/.test(s[i])) j--;
      return s.slice(j);
    }
  }
  return null;
}

/** Whether two different words rhyme by rhymeKey (and are not the same word with an ending). */
export function rhymes(a: string, b: string): boolean {
  if (a === b || stem(a) === stem(b)) return false;
  const ka = rhymeKey(a);
  const kb = rhymeKey(b);
  return ka !== null && kb !== null && ka === kb && (ka.length >= 2 || /[AEIOUWYR]/.test(ka));
}

function lastWord(words: string[]): string | undefined {
  for (let i = words.length - 1; i >= 0; i--) if (/[a-z]/.test(words[i])) return words[i];
  return undefined;
}

/** End rhyme: this line's last word rhymes with the last word of one of the two lines before. */
function endRhyme(words: string[], withText: { line: LineEvent; bit: number }[]): ContentHit | null {
  const end = lastWord(words);
  if (!end) return null;
  for (let k = withText.length - 1; k >= Math.max(0, withText.length - 2); k--) {
    const other = lastWord(tokens(withText[k].line.text || ''));
    if (other && rhymes(end, other)) {
      return {
        feature: 'endRhyme',
        why: `an end rhyme (${quote(other)} / ${quote(end)})`,
        caption: `${quote(end)} rhymes`,
      };
    }
  }
  return null;
}

/** Whether a line's end rhymes with one of the two line ends before it (the scorecard's "rhymes x of y line ends"). */
export function endRhymes(line: LineEvent, before: LineEvent[]): boolean {
  return (
    !!line.text &&
    endRhyme(
      tokens(line.text),
      before.map((l) => ({ line: l, bit: 0 })),
    ) !== null
  );
}

function internalRhyme(words: string[]): ContentHit | null {
  const pool = words.filter((w) => w.length >= 3 && !STOP.has(w));
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (rhymes(pool[i], pool[j]) && (rhymeKey(pool[i]) || '').length >= 2) {
        return {
          feature: 'internalRhyme',
          why: `an internal rhyme (${quote(pool[i])} / ${quote(pool[j])})`,
          caption: 'an internal rhyme',
        };
      }
    }
  }
  return null;
}

/** The first consonant sound of a word, for alliteration (null for a vowel). */
function onset(word: string): string | null {
  const w = word
    .replace(/^(kn|gn)/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^ph/, 'f')
    .replace(/^wh/, 'w')
    .replace(/^ps/, 's')
    .replace(/^c(?=[eiy])/, 's')
    .replace(/^c/, 'k')
    .replace(/^q/, 'k');
  const m = /^(sh|ch|th|[b-df-hj-np-tv-z])/.exec(w);
  return m ? m[1] : null;
}

/** Alliteration: three or more words of three letters or more, not function words, opening on the same sound. */
function alliteration(words: string[]): ContentHit | null {
  const groups: Record<string, string[]> = {};
  for (const w of words) {
    if (w.length < 3 || STOP.has(w)) continue;
    const o = onset(w);
    if (!o) continue;
    const g = groups[o] || (groups[o] = []);
    if (g.indexOf(w) < 0) g.push(w);
    if (g.length >= 3) {
      return {
        feature: 'alliteration',
        why: `alliteration (${g.slice(0, 3).map(quote).join(', ')})`,
        caption: 'alliteration',
      };
    }
  }
  return null;
}

/** Syllables by vowel groups, less a silent final e: an estimate, good to about one per line. */
export function syllables(words: string[]): number {
  let n = 0;
  for (const w of words) {
    const letters = w.replace(/[^a-z]/g, '');
    if (!letters) continue;
    let k = (letters.match(/[aeiouy]+/g) || []).length;
    if (k > 1 && /[^aeiouyl]e$/.test(letters)) k--;
    n += Math.max(1, k);
  }
  return n;
}

function meter(words: string[], withText: { line: LineEvent; bit: number }[]): ContentHit | null {
  if (withText.length < 2) return null;
  const s = syllables(words);
  if (s < METER_MIN_SYLLABLES) return null;
  const a = syllables(tokens(withText[withText.length - 1].line.text || ''));
  const b = syllables(tokens(withText[withText.length - 2].line.text || ''));
  const mean = (a + b) / 2;
  const tol = Math.max(1, METER_TOLERANCE * mean);
  if (Math.abs(a - b) <= tol && Math.abs(s - mean) <= tol) {
    return {
      feature: 'meter',
      why: `a steady meter (${s} syllables, like the two lines before)`,
      caption: 'a steady meter',
    };
  }
  return null;
}

const VOLTA = ['and yet', 'but', 'yet', 'still', 'until', 'instead', 'except', 'though', 'although', 'now', 'however'];

/** A turn (volta): a line that opens on a turn word, after at least three lines of the piece. */
function volta(words: string[], linesBefore: number): ContentHit | null {
  if (linesBefore < 3) return null;
  const opening = words.slice(0, 2).join(' ');
  for (const v of VOLTA) {
    if (opening === v || words[0] === v) return { feature: 'volta', why: `a turn (${quote(v)})`, caption: 'a turn' };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Speech

function contrast(words: string[], prev: LineEvent | undefined): ContentHit | null {
  const text = ` ${words.join(' ')} `;
  if (notThenBut(words)) return { feature: 'contrast', why: 'a contrast ("not ... but")', caption: 'a contrast' };
  for (const p of [' rather than ', ' instead of ', ' as opposed to ', ' ask not ', ' not because ']) {
    if (text.indexOf(p) >= 0)
      return { feature: 'contrast', why: `a contrast (${quote(p.trim())})`, caption: 'a contrast' };
  }
  if (/ (it's|it is|this is|that's) not .+ (it's|it is|this is|that's) /.test(text)) {
    return { feature: 'contrast', why: `a contrast ("it's not ... it's")`, caption: 'a contrast' };
  }
  if (prev && prev.text && words[0] === 'but' && /\b(not|never|no)\b/.test(tokens(prev.text).join(' '))) {
    return { feature: 'contrast', why: 'a contrast ("not ...", then "but ...")', caption: 'a contrast' };
  }
  return null;
}

const WH = new Set(['what', 'why', 'how', 'who', 'when', 'where', 'which']);
const AUX = new Set([
  'do',
  'does',
  'did',
  'is',
  'are',
  'was',
  'were',
  'can',
  'could',
  'would',
  'should',
  'will',
  'have',
  'has',
  "isn't",
  "aren't",
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "won't",
  "wouldn't",
  "shouldn't",
  "haven't",
]);
const SUBJECT = new Set([
  'you',
  'we',
  'i',
  'it',
  'they',
  'he',
  'she',
  'the',
  'a',
  'this',
  'that',
  'there',
  'any',
  'anyone',
  'anybody',
  'someone',
  'our',
  'your',
  'everyone',
  'anything',
]);

/** A question: a "?" from the recogniser, or a question opening ("why do we", "what if", "do you", "is it"). */
function question(text: string, words: string[]): ContentHit | null {
  if (words.length > 20) return null;
  const asked =
    /\?\s*$/.test(text) ||
    (WH.has(words[0]) &&
      words.length > 1 &&
      (AUX.has(words[1]) || ['if', 'many', 'much', 'here'].indexOf(words[1]) >= 0)) ||
    (AUX.has(words[0]) && words.length > 1 && SUBJECT.has(words[1]));
  return asked ? { feature: 'question', why: 'a question, then the beat', caption: 'a question' } : null;
}

const CALL_OPENERS = [
  'let us',
  "let's",
  'join',
  'imagine',
  'remember',
  'stand',
  'vote',
  'choose',
  'ask yourself',
  'think about',
  'start',
  'stop',
  'come',
];
const CALL_PHRASES = [
  'we must',
  'we need to',
  'we will',
  'we can',
  'we have to',
  'you can',
  'you must',
  "it's time",
  'it is time',
  'together we',
  'i ask you',
  'i urge you',
  'we shall',
];

function callToAction(words: string[]): ContentHit | null {
  const opening = words.slice(0, 2).join(' ');
  for (const c of CALL_OPENERS) {
    if (opening === c || words[0] === c)
      return { feature: 'callToAction', why: `a call to action (${quote(c)})`, caption: 'a call to action' };
  }
  const text = ` ${words.join(' ')} `;
  for (const c of CALL_PHRASES) {
    if (text.indexOf(` ${c} `) >= 0)
      return { feature: 'callToAction', why: `a call to action (${quote(c)})`, caption: 'a call to action' };
  }
  return null;
}

function quotable(words: string[], prev: LineEvent | undefined): ContentHit | null {
  if (!prev || !prev.text || words.length > QUOTABLE_MAX_WORDS || words.length < 2) return null;
  const before = tokens(prev.text).length;
  if (before >= Math.max(QUOTABLE_AFTER_WORDS, 2 * words.length)) {
    return {
      feature: 'quotable',
      why: `a short line after a long one (${words.length} words after ${before})`,
      caption: 'a short line after a long one',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Singing (pitch, not words)

/** One in-tune note per sample, or null (unvoiced, unclear or off pitch). The engine passes its own gates. */
export type NoteOf = (sample: PitchSample) => number | null;

interface Run {
  note: number;
  from: number;
  to: number;
  level: number;
}

/** Runs of one in-tune note: consecutive samples on the same rounded note. */
function runs(samples: PitchSample[], noteOf: NoteOf): Run[] {
  const out: Run[] = [];
  let cur: (Run & { n: number }) | null = null;
  for (const p of samples) {
    const note = noteOf(p);
    if (note !== null && cur && cur.note === note) {
      cur.to = p.t;
      cur.level += p.level;
      cur.n++;
    } else {
      if (cur) out.push({ note: cur.note, from: cur.from, to: cur.to, level: cur.level / cur.n });
      cur = note === null ? null : { note, from: p.t, to: p.t, level: p.level, n: 1 };
    }
  }
  if (cur) out.push({ note: cur.note, from: cur.from, to: cur.to, level: cur.level / cur.n });
  return out;
}

/**
 * A sung phrase's features: a note held HELD_NOTE_SEC, an ending on a note held FINAL_NOTE_SEC at or above the
 * phrase's mean level ("a big final note" when it closes the song), and notes held NOTE_MIN_SEC spanning
 * RANGE_MIN_SEMITONES. `samples` are the phrase's own.
 */
export function phraseHits(samples: PitchSample[], noteOf: NoteOf, closesSong: boolean): ContentHit[] {
  const hits: ContentHit[] = [];
  const rs = runs(samples, noteOf);
  if (rs.length === 0) return hits;
  const longest = rs.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  if (longest.to - longest.from + 1e-9 >= HELD_NOTE_SEC) {
    const sec = (longest.to - longest.from).toFixed(1);
    hits.push({ feature: 'heldNote', why: `one note held ${sec} s`, caption: `a note held ${sec} s` });
  }
  const voiced = samples.filter((p) => noteOf(p) !== null);
  const mean = voiced.reduce((n, p) => n + p.level, 0) / Math.max(1, voiced.length);
  const last = rs[rs.length - 1];
  const lastVoiced = voiced.length ? voiced[voiced.length - 1].t : last.to;
  if (last.to + 1e-9 >= lastVoiced && last.to - last.from + 1e-9 >= FINAL_NOTE_SEC && last.level + 1e-9 >= mean) {
    const sec = (last.to - last.from).toFixed(1);
    hits.push(
      closesSong
        ? { feature: 'finalNote', why: `a big final note (${sec} s)`, caption: 'a big final note' }
        : { feature: 'finalNote', why: `ended on a held note (${sec} s)`, caption: 'ended on a held note' },
    );
  }
  const span = noteSpan(rs);
  if (span !== null && span >= RANGE_MIN_SEMITONES) {
    hits.push({ feature: 'range', why: `a range of ${span} semitones`, caption: `a range of ${span} semitones` });
  }
  const w = CONTENT_WEIGHTS.singing;
  return hits.sort((a, b) => (w[b.feature] ?? 0) - (w[a.feature] ?? 0));
}

/** Semitones between the lowest and highest notes held at least NOTE_MIN_SEC; null when fewer than two such notes. */
export function rangeSemitones(samples: PitchSample[], noteOf: NoteOf): number | null {
  return noteSpan(runs(samples, noteOf));
}

function noteSpan(rs: Run[]): number | null {
  const held = rs.filter((r) => r.to - r.from + 1e-9 >= NOTE_MIN_SEC).map((r) => r.note);
  if (held.length < 2) return null;
  return Math.max(...held) - Math.min(...held);
}
