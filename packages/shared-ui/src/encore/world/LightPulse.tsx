import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import { colors } from './theme';

const PEAK = 0.18;
const DECAY_MS = 400;

/** On every reaction cut the stage light hits the room: a tungsten-gold wash at 0.18 decaying to 0 over 400 ms. */
export const LightPulse = React.memo(function LightPulse({ pulseKey }: { pulseKey: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    opacity.setValue(PEAK);
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: DECAY_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [opacity, pulseKey]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.gold, opacity }]} />;
});
