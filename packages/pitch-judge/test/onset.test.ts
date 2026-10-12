import { describe, expect, it } from 'vitest';
import { createOnsetDetector, rms } from '../src/onset';

/** Frame levels at 40 ms steps: a strum is a jump followed by an exponential tail. */
function envelope(strumsAtMs: number[], totalMs: number, peak = 0.3, stepMs = 40): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t <= totalMs; t += stepMs) {
    let level = 0.002; // room noise
    for (const s of strumsAtMs) if (t >= s) level += peak * Math.exp(-(t - s) / 400);
    out.push([t, level]);
  }
  return out;
}

describe('onset detector', () => {
  it('finds each strum once, not its tail', () => {
    const detect = createOnsetDetector();
    const onsets = envelope([200, 1000, 1800], 2600).filter(([t, level]) => detect(t, level)).map(([t]) => t);
    expect(onsets).toEqual([200, 1000, 1800]);
  });

  it('hears a strum that lands while the previous one is still ringing', () => {
    const detect = createOnsetDetector();
    const onsets = envelope([200, 600], 1400).filter(([t, level]) => detect(t, level)).map(([t]) => t);
    expect(onsets).toEqual([200, 600]);
  });

  it('ignores room noise and slow swells', () => {
    const detect = createOnsetDetector();
    let count = 0;
    for (let t = 0; t < 4000; t += 40) if (detect(t, 0.002 + 0.00005 * t)) count++;
    expect(count).toBe(0);
  });

  it('computes RMS', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
