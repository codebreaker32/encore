import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, display, dsp, edge, sp, tabular, text, textShadow, up } from './theme';

/**
 * The lower-third: one line over the room ("THE BASEMENT · COMEDY CLUB"), a thin red rule, the clock. Never a box.
 */
export const LowerThird = React.memo(function LowerThird({
  house,
  tier,
  clock,
  note,
  red = false,
  bottom = edge.bottom,
}: {
  house: string;
  tier: string;
  clock: string;
  /** Small text after the clock: "of a 5:00 set". */
  note?: string;
  /** The last 30 s of a set turn the clock red. */
  red?: boolean;
  bottom?: number;
}) {
  return (
    <View style={[styles.root, { bottom }]} pointerEvents="none">
      <Text style={[styles.venue, styles.venueShadow]} numberOfLines={1}>
        {up(house)} · <Text style={styles.tier}>{up(tier)}</Text>
      </Text>
      <View style={styles.rule} />
      <View style={styles.clockRow}>
        <Text style={[styles.clock, red && styles.clockRed]}>{clock}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', left: edge.x },
  venue: { ...dsp(52, display.bold, 0.08, colors.paper) },
  venueShadow: { ...textShadow, textShadowRadius: sp(18), textShadowColor: 'rgba(0,0,0,0.7)' },
  tier: { color: colors.gold },
  rule: { width: sp(420), height: sp(4), backgroundColor: colors.red, marginTop: sp(14), marginBottom: sp(12) },
  clockRow: { flexDirection: 'row', alignItems: 'baseline' },
  clock: { ...dsp(44, display.medium, 0.06, colors.gold), ...tabular },
  clockRed: { color: colors.red },
  note: { fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, marginLeft: sp(16) },
});
