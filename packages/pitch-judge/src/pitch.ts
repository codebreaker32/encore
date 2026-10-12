import { PitchDetector } from 'pitchy';
import { hzToMidi, midiToName } from './notes';

export interface PitchReading {
  hz: number;
  /** 0..1 — how periodic the signal is; low values mean noise, not a note. */
  clarity: number;
  midi: number;
  name: string;
  /** Deviation from the nearest equal-tempered note, -50..50. */
  cents: number;
}

export interface PitchTrackerOptions {
  /** Below this clarity the reading is reported as null. */
  minClarity?: number;
  /** Guitar range: low E2 ≈ 82 Hz (drop-D 73 Hz) up to ~1.3 kHz on the high frets. */
  minHz?: number;
  maxHz?: number;
}

/**
 * Monophonic pitch tracking (McLeod Pitch Method via pitchy) for single-note melodies and tuning.
 * Create once per frame size and reuse; findPitch allocates nothing per call.
 */
export function createPitchTracker(frameSize: number, options: PitchTrackerOptions = {}) {
  const detector = PitchDetector.forFloat32Array(frameSize);
  const { minClarity = 0.9, minHz = 70, maxHz = 1400 } = options;

  return (frame: Float32Array<ArrayBufferLike>, sampleRate: number): PitchReading | null => {
    const [hz, clarity] = detector.findPitch(frame, sampleRate);
    if (!Number.isFinite(hz) || clarity < minClarity || hz < minHz || hz > maxHz) return null;
    const midi = hzToMidi(hz);
    return { hz, clarity, midi, name: midiToName(midi), cents: Math.round((midi - Math.round(midi)) * 100) };
  };
}
