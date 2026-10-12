export const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type PitchClass = (typeof PITCH_CLASSES)[number];

const FLATS: Record<string, PitchClass> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

/** Fractional MIDI number for a frequency (A4 = 440 Hz = 69). */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 'E2', 'C#4', ... for an integer MIDI note. */
export function midiToName(midi: number): string {
  const rounded = Math.round(midi);
  return `${PITCH_CLASSES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

/** Parse 'E2', 'F#3' or 'Bb3' into a MIDI number. */
export function nameToMidi(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name.trim());
  if (!match) throw new Error(`Not a note name: ${name}`);
  const [, letter, accidental, octave] = match;
  const pc = toPitchClass(letter + accidental);
  return PITCH_CLASSES.indexOf(pc) + (Number(octave) + 1) * 12;
}

export function toPitchClass(name: string): PitchClass {
  const normalized = FLATS[name] ?? name;
  if (!(PITCH_CLASSES as readonly string[]).includes(normalized)) throw new Error(`Not a pitch class: ${name}`);
  return normalized as PitchClass;
}

export function pitchClassIndex(name: string): number {
  return PITCH_CLASSES.indexOf(toPitchClass(name));
}
