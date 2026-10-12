import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WordsMode } from '@strumble/crowd';
import { colors, display, dsp, edge, sp, text, textShadow } from './theme';

/** How words are recognised, and what that means for the room: with words on it judges what you say as well. */
const WORDS: Record<WordsMode, string> = {
  off: 'words off · timing only',
  local: 'words on the phone · the room judges what you say',
  service: 'words via a speech service · the room judges what you say',
};

/**
 * Top-right: the red dot, LIVE, whose phone is the microphone, and how words are handled.
 * A replay (the web demo) says REPLAY · recorded set with the red dot off: nothing shows LIVE over a recording.
 */
export const Live = React.memo(function Live({ performer, words, replay = false }: { performer: string; words: WordsMode; replay?: boolean }) {
  return (
    <View style={styles.root} pointerEvents="none">
      {!replay && <View style={styles.glow} />}
      <View style={[styles.dot, replay && styles.dotOff]} />
      <Text style={[styles.live, replay && styles.liveOff]}>{replay ? 'REPLAY' : 'LIVE'}</Text>
      <Text style={styles.small}>{replay ? `recorded set · ${WORDS[words]}` : `mic on · ${performer}'s phone · ${WORDS[words]}`}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', right: edge.x, top: edge.top, flexDirection: 'row', alignItems: 'center' },
  glow: { position: 'absolute', left: -sp(9), width: sp(36), height: sp(36), borderRadius: sp(18), backgroundColor: colors.red, opacity: 0.35 },
  dot: { width: sp(18), height: sp(18), borderRadius: sp(9), backgroundColor: colors.red, marginRight: sp(14) },
  dotOff: { backgroundColor: colors.goldDim },
  live: { ...dsp(30, display.semiBold, 0.14, colors.paper), ...textShadow, marginRight: sp(14) },
  liveOff: { color: colors.goldDim },
  small: { fontFamily: text.regular, fontSize: sp(24), letterSpacing: 0, color: colors.goldDim, ...textShadow },
});
