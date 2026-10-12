/**
 * Strum/pluck onset detection from a stream of frame energies.
 *
 * An onset is a jump well above the recent level. The "floor" tracks the decaying envelope
 * of what was just heard, so the tail of one strum doesn't register as another, and a
 * refractory period stops one strum triggering twice.
 */
export interface OnsetOptions {
  /** Energy must exceed floor × riseRatio. 3 ≈ +4.8 dB on RMS, +9.5 dB on power. */
  riseRatio?: number;
  /** Ignore anything quieter than this (RMS of a float signal). */
  minLevel?: number;
  refractoryMs?: number;
  /** Per-frame decay of the floor; tune to the frame rate (0.9 at ~25 fps ≈ 0.6 s half-life). */
  floorDecay?: number;
}

export function createOnsetDetector(options: OnsetOptions = {}) {
  const { riseRatio = 3, minLevel = 0.01, refractoryMs = 120, floorDecay = 0.9 } = options;
  let floor = 0;
  let lastOnset = -Infinity;

  /** Feed one frame; returns true when this frame starts a new note or strum. */
  return (timeMs: number, level: number): boolean => {
    const isOnset = level >= minLevel && level > floor * riseRatio && timeMs - lastOnset >= refractoryMs;
    floor = Math.max(level, floor * floorDecay);
    if (isOnset) lastOnset = timeMs;
    return isOnset;
  };
}

/** Root-mean-square level of a frame. */
export function rms(frame: Float32Array<ArrayBufferLike>): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}
