import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CLARITY_GATE, IN_TUNE_CENTS, NOISE_GATE, centsOff, type PitchSample } from '@strumble/crowd';
import { Gradient } from './Gradient';
import { colors, display, dsp, edge, sp, text, textShadow } from './theme';

const WINDOW_SEC = 12;
const WIDTH = 1740;
const HEIGHT = 90;
/** A dot per sample, sp(4) square, placed by pitch: the centre note sits mid-band, ±6 semitones span the 90 px. */
const DOT = 4;
const RANGE_SEMITONES = 12;
/** The scrim starts this far above the legend, so it is already dark where the legend's words sit. */
const LEAD = 70;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi: number): string {
  const n = Math.round(midi);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/**
 * Singing: the last 12 s of pitch as a row of thin bars (one 4 px bar per sample, placed by its distance from the
 * window's centre note). Gold where the note sat within 25 cents, paper where it was confidently off, grey where the
 * phone could not tell. Views only; no SVG on the simulator.
 */
export function PitchTrace({ samples, now, measured }: { samples: PitchSample[]; now: number; measured?: string }) {
  const start = now - WINDOW_SEC;
  const recent: PitchSample[] = [];
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t < start) break;
    recent.push(samples[i]);
  }
  recent.reverse();
  const voiced = recent.filter((s) => s.midi !== null && s.clarity >= CLARITY_GATE && s.level >= NOISE_GATE);
  const midis = voiced.map((s) => s.midi as number).sort((a, b) => a - b);
  const ref = midis.length ? midis[Math.floor(midis.length / 2)] : null;
  const last = voiced.length ? voiced[voiced.length - 1] : undefined;
  const lastMidi = last && last.midi !== null ? last.midi : null;
  const cents = lastMidi !== null ? (lastMidi - Math.round(lastMidi)) * 100 : 0;
  const status =
    lastMidi === null || now - (last ? last.t : 0) > 1
      ? 'listening'
      : `${noteName(lastMidi)} · ${Math.abs(cents) <= IN_TUNE_CENTS ? 'in tune' : cents > 0 ? 'sharp' : 'flat'}`;

  const bars: React.ReactNode[] = [];
  let lastY = HEIGHT / 2;
  recent.forEach((s, i) => {
    const x = ((s.t - start) / WINDOW_SEC) * WIDTH;
    const ok = s.midi !== null && s.clarity >= CLARITY_GATE && s.level >= NOISE_GATE;
    if (ok && ref !== null) {
      const midi = s.midi as number;
      const inTune = centsOff(midi) <= IN_TUNE_CENTS;
      const y = Math.max(DOT, Math.min(HEIGHT - DOT, HEIGHT / 2 - ((midi - ref) / RANGE_SEMITONES) * HEIGHT));
      lastY = y;
      bars.push(
        <View
          key={i}
          style={{ position: 'absolute', left: sp(x), top: sp(y - DOT / 2), width: sp(DOT), height: sp(DOT), backgroundColor: inTune ? colors.gold : 'rgba(245,239,230,0.45)' }}
        />,
      );
    } else if (s.level >= NOISE_GATE || s.midi !== null) {
      // Unsure: grey, at the last known pitch so the trace keeps its place.
      bars.push(<View key={i} style={{ position: 'absolute', left: sp(x), top: sp(lastY - DOT / 2), width: sp(DOT), height: sp(DOT), backgroundColor: colors.unsure }} />);
    }
  });

  return (
    <View style={styles.root} pointerEvents="none">
      {/* Starts above the legend and holds dark behind it and the trace: at 0.55 the legend ran across the crowd (QA 2026-10-12). */}
      <Gradient style={styles.band} stops={[{ at: 0, alpha: 0 }, { at: 0.3, alpha: 0.72 }, { at: 0.85, alpha: 0.72 }, { at: 1, alpha: 0.35 }]} />
      <Text style={styles.lab}>
        your pitch · last 12 seconds · gold within 25 cents · grey where the phone couldn't tell{measured ? ` · ${measured}` : ''}
      </Text>
      <Text style={styles.now}>{status}</Text>
      <View style={styles.trace}>{bars}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: sp(210 - 30), height: sp(LEAD + HEIGHT + 60 + 30) },
  band: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  lab: { position: 'absolute', left: edge.x, top: sp(LEAD + 24), fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, ...textShadow },
  now: { position: 'absolute', right: edge.x, top: sp(LEAD + 22), ...dsp(30, display.medium, 0.1, colors.gold), ...textShadow },
  trace: { position: 'absolute', left: edge.x, top: sp(LEAD + 60), width: sp(WIDTH), height: sp(HEIGHT) },
});
