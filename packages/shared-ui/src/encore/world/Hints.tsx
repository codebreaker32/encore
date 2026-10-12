import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, display, dsp, edge, sp, text, textShadow } from './theme';

/** Remote hints, bottom-right: words, not icons. `[['OK', 'end set'], ['Back', 'stop']]`. */
export const Hints = React.memo(function Hints({ items, bottom = edge.bottom }: { items: [string, string][]; bottom?: number }) {
  return (
    <View style={[styles.root, { bottom }]} pointerEvents="none">
      {items.map(([key, label], i) => (
        <View key={key + label} style={[styles.item, i > 0 && styles.gap]}>
          <Text style={styles.key}>{key}</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', right: edge.x, flexDirection: 'row', alignItems: 'baseline' },
  item: { flexDirection: 'row', alignItems: 'baseline' },
  gap: { marginLeft: sp(32) },
  key: { ...dsp(26, display.bold, 0.1, colors.paper), ...textShadow, marginRight: sp(8) },
  label: { fontFamily: text.regular, fontSize: sp(24), color: colors.goldDim, ...textShadow },
});
