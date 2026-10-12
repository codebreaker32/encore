import type { TextStyle } from 'react-native';
import { scaledPixels } from '../../hooks/useScale';

/** Every size in the comps is at 1920×1080; `sp` scales it to the device (1280×720 sticks included). */
export const sp = scaledPixels;

/** House-Right Camera palette (direction contract). Secondary text is tinted from the gold, never grey. */
export const colors = {
  house: '#07060a',
  gold: '#ffd79a',
  goldDim: '#b8995f',
  red: '#c81e3a',
  paper: '#f5efe6',
  /** Unselected choices on the bill. */
  paperDim: 'rgba(245,239,230,0.42)',
  /** The earlier exchange in the green room. */
  paperSoft: 'rgba(245,239,230,0.6)',
  /** The phone-is-listening dot on the bill. */
  green: '#2fb463',
  /** "Unsure" is grey and never counts against the performer (pitch trace, unjudged lines). */
  unsure: '#8a8a8a',
  rule: 'rgba(255,215,154,0.18)',
  frame: '#1a1620',
  deadA: '#2a1216',
  deadB: '#1a0c0f',
  deadText: '#ff9aa7',
};

/** Big Shoulders Display: condensed caps for lower-thirds, venue names and verdict words. Static instances by family name. */
export const display = {
  medium: 'BigShouldersDisplay-Medium',
  semiBold: 'BigShouldersDisplay-SemiBold',
  bold: 'BigShouldersDisplay-Bold',
  extraBold: 'BigShouldersDisplay-ExtraBold',
};

/** Atkinson Hyperlegible Next: every sentence, sized for 3 m. */
export const text = {
  regular: 'AtkinsonHyperlegibleNext-Regular',
  medium: 'AtkinsonHyperlegibleNext-Medium',
  bold: 'AtkinsonHyperlegibleNext-Bold',
};

/**
 * Font files by family name. tv-expo loads them with expo-font's `useFonts(fontAssets)` (web and Android).
 * Vega resolves `fontFamily` by file name from `apps/vega/assets/fonts/` (copies of these files), so it needs no loader.
 */
export const fontAssets = {
  'BigShouldersDisplay-Medium': require('../../assets/fonts/BigShouldersDisplay-Medium.ttf'),
  'BigShouldersDisplay-SemiBold': require('../../assets/fonts/BigShouldersDisplay-SemiBold.ttf'),
  'BigShouldersDisplay-Bold': require('../../assets/fonts/BigShouldersDisplay-Bold.ttf'),
  'BigShouldersDisplay-ExtraBold': require('../../assets/fonts/BigShouldersDisplay-ExtraBold.ttf'),
  'AtkinsonHyperlegibleNext-Regular': require('../../assets/fonts/AtkinsonHyperlegibleNext-Regular.ttf'),
  'AtkinsonHyperlegibleNext-Medium': require('../../assets/fonts/AtkinsonHyperlegibleNext-Medium.ttf'),
  'AtkinsonHyperlegibleNext-Bold': require('../../assets/fonts/AtkinsonHyperlegibleNext-Bold.ttf'),
};

/** CSS `letter-spacing: Xem` at a comp size, in scaled pixels. */
export function track(size: number, em: number): number {
  return sp(size * em);
}

/** The comps' `text-shadow: 0 2px 12px rgba(0,0,0,.8)`: keeps type legible over a bright plate. */
export const textShadow: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.8)',
  textShadowOffset: { width: 0, height: sp(2) },
  textShadowRadius: sp(12),
};

/** Condensed display type, uppercase by convention (callers uppercase the string: `textTransform` is not relied on). */
export function dsp(size: number, family: string, em: number, color: string, lineHeight = 1): TextStyle {
  return { fontFamily: family, fontSize: sp(size), letterSpacing: track(size, em), color, lineHeight: sp(size * lineHeight) };
}

/** Sentence type. */
export function txt(size: number, color: string, lineHeight = 1.3, family: string = text.regular): TextStyle {
  return { fontFamily: family, fontSize: sp(size), color, lineHeight: sp(size * lineHeight) };
}

export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** The comps' safe margins. */
export const edge = { x: sp(90), top: sp(54), bottom: sp(72) };

export function up(s: string): string {
  return s.toUpperCase();
}

/** m:ss from seconds (never negative). */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
