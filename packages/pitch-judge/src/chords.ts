import { cosine, normalize, type Chroma } from './chroma';
import { pitchClassIndex } from './notes';

const QUALITIES = {
  '': [0, 4, 7], // major
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
} as const;

/** Parse 'G', 'Em', 'A7', 'F#m', 'Bbmaj7' into a root pitch-class index and intervals. */
export function parseChord(symbol: string): { root: number; intervals: readonly number[] } {
  const match = /^([A-G][#b]?)(maj7|m7|sus2|sus4|m|7)?$/.exec(symbol.trim());
  if (!match) throw new Error(`Unsupported chord symbol: ${symbol}`);
  const quality = (match[2] ?? '') as keyof typeof QUALITIES;
  return { root: pitchClassIndex(match[1]), intervals: QUALITIES[quality] };
}

/**
 * Harmonic-aware template: each chord tone also contributes its 2nd–4th harmonics
 * (octave, fifth above the octave, double octave) with decaying weight, because a real
 * guitar's chroma is dominated by overtones, not just the three or four chord tones.
 */
export function chordTemplate(symbol: string): Chroma {
  const { root, intervals } = parseChord(symbol);
  const template = new Float64Array(12);
  const harmonics = [
    { semitones: 0, weight: 1 },
    { semitones: 12, weight: 0.6 },
    { semitones: 19, weight: 0.4 },
    { semitones: 24, weight: 0.25 },
  ];
  for (const interval of intervals) {
    for (const h of harmonics) template[(root + interval + h.semitones) % 12] += h.weight;
  }
  return normalize(template);
}

export type Verdict = 'match' | 'unsure';

export interface ChordJudgement {
  /** Best candidate, present even when unsure (for debugging/telemetry, never for red marks). */
  best: string;
  score: number;
  /** Score gap between best and runner-up; small gaps mean the candidates are confusable. */
  margin: number;
  verdict: Verdict;
}

export interface JudgeOptions {
  minScore?: number;
  minMargin?: number;
  /** Frames quieter than this (FFT energy) are treated as silence. */
  minEnergy?: number;
}

/**
 * Pick the best of the chords the lesson expects right now. Restricting candidates to the
 * lesson's chord set is what makes judging reliable enough for beginners. Returns 'unsure'
 * rather than a wrong answer whenever the evidence is weak or ambiguous.
 */
export function judgeChord(
  chroma: Chroma,
  candidates: readonly string[],
  energy = Infinity,
  options: JudgeOptions = {},
): ChordJudgement {
  const { minScore = 0.8, minMargin = 0.04, minEnergy = 0 } = options;
  const scored = candidates
    .map((symbol) => ({ symbol, score: cosine(chroma, chordTemplate(symbol)) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best) throw new Error('judgeChord needs at least one candidate');
  const margin = second ? best.score - second.score : 1;
  const confident = energy >= minEnergy && best.score >= minScore && margin >= minMargin;
  return { best: best.symbol, score: best.score, margin, verdict: confident ? 'match' : 'unsure' };
}
