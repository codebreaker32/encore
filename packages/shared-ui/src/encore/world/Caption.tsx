import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, display, dsp, edge, sp, text, textShadow, up } from './theme';

/**
 * Top-left: what the director just did and why, in words. Two voices:
 * - a reaction: "LAUGH" in gold display type over "0.8 s after your line · the room's third tonight · cut to the floor";
 * - the wide: one small condensed line, "WIDE · HELD 14 s · the house is listening".
 */
export const Caption = React.memo(function Caption(props: { what: string; why: string; more?: string } | { small: string; emphasis?: string }) {
  if ('what' in props) {
    return (
      <View style={styles.root} pointerEvents="none">
        <Text style={styles.what}>{up(props.what)}</Text>
        <Text style={styles.why}>
          {props.why}
          {props.more ? <Text style={styles.more}> · {props.more}</Text> : null}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.root} pointerEvents="none">
      <Text style={styles.small}>
        {up(props.small)}
        {props.emphasis ? <Text style={styles.emphasis}> · {props.emphasis}</Text> : null}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', left: edge.x, top: edge.top, right: sp(640) },
  what: { ...dsp(44, display.extraBold, 0.1, colors.gold), ...textShadow },
  why: { fontFamily: text.regular, fontSize: sp(26), lineHeight: sp(34), color: colors.paper, marginTop: sp(10), ...textShadow },
  more: { color: colors.goldDim },
  small: { ...dsp(28, display.semiBold, 0.14, colors.goldDim, 1.2), ...textShadow },
  emphasis: { fontFamily: display.bold, color: colors.paper },
});
