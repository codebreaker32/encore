import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gradient } from './Gradient';
import { colors, display, dsp, sp, text, up } from './theme';

/**
 * One line, the MC's voice: the intro, a heckle, the end. On black over the photographic plates. `over` the live 3D room
 * it never blacks the picture out (the user, 2026-10-12: the black cards over the room read as the screen dropping
 * out): the line sits low over the moving room on a dark gradient, and the room stays in view above it.
 */
export const TitleCard = React.memo(function TitleCard({
  line,
  who,
  over = false,
}: {
  line: string;
  who?: string;
  over?: boolean;
}) {
  if (over) {
    return (
      <View style={styles.overRoot} pointerEvents="none">
        <Gradient
          stops={[
            { at: 0, alpha: 0.08 },
            { at: 0.45, alpha: 0.3 },
            { at: 1, alpha: 0.88 },
          ]}
        />
        <Text style={[styles.line, styles.overLine]}>{up(line)}</Text>
        {who ? <Text style={styles.who}>{who}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.root} pointerEvents="none">
      <Text style={styles.line}>{up(line)}</Text>
      {who ? <Text style={styles.who}>{who}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.house,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp(240),
  },
  overRoot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: sp(240),
    // Clear of the live screen's lower third (venue, rule and clock: about 72–215 from the bottom).
    paddingBottom: sp(280),
  },
  line: { ...dsp(88, display.extraBold, 0.04, colors.paper, 1.02), textAlign: 'center' },
  overLine: {
    fontSize: sp(64),
    lineHeight: sp(66),
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: sp(14),
  },
  who: { fontFamily: text.regular, fontSize: sp(28), color: colors.goldDim, marginTop: sp(26), textAlign: 'center' },
});
