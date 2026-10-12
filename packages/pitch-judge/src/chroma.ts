import FFT from 'fft.js';
import { hzToMidi } from './notes';

export type Chroma = Float64Array; // 12 bins, C..B, L2-normalised

export interface ChromaOptions {
  /** Analysis band. Guitar fundamentals start at 82 Hz; above ~2 kHz is mostly pick noise. */
  minHz?: number;
  maxHz?: number;
}

/**
 * Chroma (pitch-class energy) from one time-domain frame.
 *
 * Use long frames (8192 samples at 48 kHz ≈ 5.9 Hz per bin) — short frames cannot separate the
 * low strings. A Hann window limits leakage; each bin's magnitude is credited to the nearest
 * pitch class only when the bin lies within ±35 cents of a note, which suppresses noise between notes.
 */
export function createChromaAnalyzer(frameSize: number, options: ChromaOptions = {}) {
  if ((frameSize & (frameSize - 1)) !== 0) throw new Error('frameSize must be a power of two');
  const fft = new FFT(frameSize);
  const out = fft.createComplexArray() as number[];
  const windowed = new Array<number>(frameSize);
  const hann = Float64Array.from({ length: frameSize }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  const { minHz = 70, maxHz = 2000 } = options;

  return (frame: Float32Array<ArrayBufferLike>, sampleRate: number): { chroma: Chroma; energy: number } => {
    for (let i = 0; i < frameSize; i++) windowed[i] = frame[i] * hann[i];
    fft.realTransform(out, windowed);

    const chroma = new Float64Array(12);
    const binHz = sampleRate / frameSize;
    const first = Math.max(1, Math.floor(minHz / binHz));
    const last = Math.min(frameSize / 2 - 1, Math.ceil(maxHz / binHz));
    let energy = 0;
    for (let k = first; k <= last; k++) {
      const re = out[2 * k];
      const im = out[2 * k + 1];
      const magnitude = Math.sqrt(re * re + im * im);
      energy += magnitude * magnitude;
      const midi = hzToMidi(k * binHz);
      const nearest = Math.round(midi);
      if (Math.abs(midi - nearest) > 0.35) continue;
      chroma[((nearest % 12) + 12) % 12] += magnitude;
    }
    normalize(chroma);
    return { chroma, energy };
  };
}

export function normalize(v: Float64Array): Float64Array {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both are L2-normalised
}
