import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors } from './theme';

const RAMP_H = require('../../assets/plates/ramp-h.png');
const RAMP_V = require('../../assets/plates/ramp-v.png');

export interface GradientStop {
  /** 0..1 along the axis. */
  at: number;
  alpha: number;
}

/**
 * A gradient of one colour at changing opacity (no LinearGradient library on Vega). Each straight stretch between two
 * stops is a solid layer at the lower opacity plus a stretched, tinted alpha ramp (`ramp-h.png`/`ramp-v.png`, 256
 * steps) over the same area, so it is smooth and has no inner edges. The bands of solid Views used before left a bright
 * seam at every band edge on the Google TV's fractional density (1.33), where the picture behind showed through.
 * Fills its parent unless `style` positions it.
 */
export function Gradient({
  stops,
  color = colors.house,
  horizontal = false,
  style,
}: {
  stops: GradientStop[];
  color?: string;
  horizontal?: boolean;
  style?: ViewStyle;
}) {
  const parts = segments(stops);
  const box = [style ? styles.placed : StyleSheet.absoluteFill, horizontal ? styles.row : styles.column, style];
  if (parts.length === 1) {
    return (
      <View pointerEvents="none" style={box}>
        <Segment from={parts[0].from} to={parts[0].to} color={color} horizontal={horizontal} />
      </View>
    );
  }
  return (
    <View pointerEvents="none" style={box}>
      {parts.map((p, i) => (
        <View key={i} style={{ flex: p.length }}>
          <Segment from={p.from} to={p.to} color={color} horizontal={horizontal} />
        </View>
      ))}
    </View>
  );
}

/** Opacity `from` at the start of the axis to `to` at its end: the lower one solid, the difference as a ramp over it. */
function Segment({ from, to, color, horizontal }: { from: number; to: number; color: string; horizontal: boolean }) {
  const base = Math.min(from, to);
  const ramp = base >= 1 ? 0 : Math.abs(to - from) / (1 - base);
  const flip = to < from ? (horizontal ? styles.flipX : styles.flipY) : null;
  return (
    <>
      {base > 0.002 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: base }]} /> : null}
      {ramp > 0.002 ? (
        <Image
          source={horizontal ? RAMP_H : RAMP_V}
          resizeMode="stretch"
          fadeDuration={0}
          style={[StyleSheet.absoluteFill, styles.fit, { tintColor: color, opacity: ramp }, flip]}
        />
      ) : null}
    </>
  );
}

/** The stops as straight stretches covering 0..1, holding the first and last opacity out to the ends. */
function segments(stops: GradientStop[]): { from: number; to: number; length: number }[] {
  const s = stops.slice().sort((a, b) => a.at - b.at);
  if (s.length === 0) return [{ from: 0, to: 0, length: 1 }];
  if (s[0].at > 0) s.unshift({ at: 0, alpha: s[0].alpha });
  if (s[s.length - 1].at < 1) s.push({ at: 1, alpha: s[s.length - 1].alpha });
  const out: { from: number; to: number; length: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    const length = s[i].at - s[i - 1].at;
    if (length > 0.001) out.push({ from: s[i - 1].alpha, to: s[i].alpha, length });
  }
  return out.length ? out : [{ from: s[0].alpha, to: s[0].alpha, length: 1 }];
}

const styles = StyleSheet.create({
  placed: { position: 'absolute' },
  column: { flexDirection: 'column' },
  row: { flexDirection: 'row' },
  fit: { width: '100%', height: '100%' },
  flipX: { transform: [{ scaleX: -1 }] },
  flipY: { transform: [{ scaleY: -1 }] },
});
