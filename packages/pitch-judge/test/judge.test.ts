import { describe, expect, it } from 'vitest';
import {
  chordTemplate,
  createChromaAnalyzer,
  createPitchTracker,
  judgeChord,
  midiToHz,
  midiToName,
  nameToMidi,
  parseChord,
} from '../src';

const SR = 48_000;

/** A plucked-string-like tone: fundamental plus decaying harmonics. */
function pluck(frequencies: number[], length: number, seed = 1): Float32Array {
  const out = new Float32Array(length);
  let rand = seed;
  const noise = () => ((rand = (rand * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
  for (let i = 0; i < length; i++) {
    let s = 0;
    for (const f of frequencies) for (let h = 1; h <= 5; h++) s += Math.sin((2 * Math.PI * f * h * i) / SR) / h ** 1.5;
    out[i] = s / frequencies.length + noise();
  }
  return out;
}

const hz = (note: string) => midiToHz(nameToMidi(note));
// Open-position voicings (low → high strings).
const OPEN = {
  G: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'],
  C: ['C3', 'E3', 'G3', 'C4', 'E4'],
  D: ['D3', 'A3', 'D4', 'F#4'],
  Em: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'],
  Am: ['A2', 'E3', 'A3', 'C4', 'E4'],
};

describe('notes', () => {
  it('round-trips names and frequencies', () => {
    expect(nameToMidi('A4')).toBe(69);
    expect(nameToMidi('E2')).toBe(40);
    expect(nameToMidi('Bb3')).toBe(nameToMidi('A#3'));
    expect(midiToName(64)).toBe('E4');
    expect(midiToHz(69)).toBeCloseTo(440);
  });

  it('parses chord symbols', () => {
    expect(parseChord('Em')).toEqual({ root: 4, intervals: [0, 3, 7] });
    expect(parseChord('F#m7').root).toBe(6);
    expect(() => parseChord('H')).toThrow();
  });
});

describe('pitch tracker', () => {
  const track = createPitchTracker(4096);

  it.each(['E2', 'A2', 'G3', 'B3', 'E4'])('hears a plucked %s', (note) => {
    const reading = track(pluck([hz(note)], 4096), SR);
    expect(reading?.name).toBe(note);
    expect(Math.abs(reading!.cents)).toBeLessThan(10);
  });

  it('returns null for noise instead of guessing', () => {
    let rand = 7;
    const noise = Float32Array.from({ length: 4096 }, () => ((rand = (rand * 16807) % 2147483647) / 2147483647) - 0.5);
    expect(track(noise, SR)).toBeNull();
  });
});

describe('chord judge', () => {
  const analyze = createChromaAnalyzer(8192);
  const lessonChords = Object.keys(OPEN);

  it.each(Object.entries(OPEN))('recognises an open %s among the lesson chords', (symbol, notes) => {
    const { chroma, energy } = analyze(pluck(notes.map(hz), 8192), SR);
    const judgement = judgeChord(chroma, lessonChords, energy);
    expect(judgement.best).toBe(symbol);
    expect(judgement.verdict).toBe('match');
  });

  it('is unsure, not wrong, when the sound fits no candidate well', () => {
    // A cluster of adjacent semitones resembles none of the lesson chords.
    const { chroma, energy } = analyze(pluck(['C4', 'C#4', 'D4', 'D#4'].map(hz), 8192), SR);
    expect(judgeChord(chroma, lessonChords, energy).verdict).toBe('unsure');
  });

  it('builds normalised templates', () => {
    const t = chordTemplate('C');
    expect(Math.hypot(...t)).toBeCloseTo(1);
  });
});
