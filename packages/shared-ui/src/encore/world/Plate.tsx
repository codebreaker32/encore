import React, { useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import { Gradient } from './Gradient';
import { plateSource } from './plates';
import { colors, sp } from './theme';

const vignette = require('../../assets/plates/vignette.png');
const grain = require('../../assets/plates/grain.png');

export type Grade = 'wide' | 'reaction' | 'arena' | 'flat' | 'none';

const GRADES: Record<Grade, { top: number; bottom: number }> = {
  wide: { top: 0.15, bottom: 0.55 },
  reaction: { top: 0.22, bottom: 0.6 },
  arena: { top: 0.2, bottom: 0.65 },
  flat: { top: 0, bottom: 0 },
  none: { top: 0, bottom: 0 },
};

/** The slow push-in: scale `from` → `to` over `pushMs` (the whole set), restarted whenever `key` changes. */
export function usePushIn(push: boolean, pushMs: number, from: number, to: number, key: string): Animated.Value {
  const scale = useRef(new Animated.Value(from)).current;
  useEffect(() => {
    scale.setValue(from);
    if (!push) return undefined;
    const anim = Animated.timing(scale, {
      toValue: to,
      duration: pushMs,
      easing: (t) => t,
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [scale, push, pushMs, from, to, key]);
  return scale;
}

/**
 * Film grain over the frame: a 4×3 grid of the 512 px tile (the frame is 1920×1080 design pixels), one decode shared by
 * all twelve Images. Laid out by hand on every platform: react-native-web draws a single tile for `resizeMode: 'repeat'`,
 * and on the test Google TV `repeat` drew one tile and smeared its edge pixels across the rest of the frame (a seam at
 * 682 px and streaks to its right).
 */
function Grain({ opacity }: { opacity: number }) {
  const tiles: React.ReactNode[] = [];
  const size = sp(512);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      tiles.push(
        <Image
          key={`${r}-${c}`}
          source={grain}
          resizeMode="stretch"
          fadeDuration={0}
          style={{ position: 'absolute', left: c * size, top: r * size, width: size, height: size }}
        />,
      );
    }
  }
  return (
    <View style={[styles.layer, { opacity }]} pointerEvents="none">
      {tiles}
    </View>
  );
}

/** The grade (top/bottom darkening), the vignette, optional house-black and tungsten-gold washes and the grain, over any shot. */
export const PlateOverlays = React.memo(function PlateOverlays({
  grade = 'wide',
  darken = 0,
  warm = 0,
  grainOpacity = 0.14,
}: {
  grade?: Grade;
  darken?: number;
  /** A gold wash (0..1) that pulls cool footage into the tungsten palette. */
  warm?: number;
  grainOpacity?: number;
}) {
  const g = GRADES[grade];
  return (
    <>
      {warm > 0 && <View style={[styles.layer, { backgroundColor: colors.gold, opacity: warm }]} />}
      {grade !== 'none' && (
        <>
          {g.top > 0 && (
            <Gradient
              style={styles.top}
              stops={[
                { at: 0, alpha: g.top },
                { at: 1, alpha: 0 },
              ]}
            />
          )}
          {g.bottom > 0 && (
            <Gradient
              style={styles.bottom}
              stops={[
                { at: 0, alpha: 0 },
                { at: 1, alpha: g.bottom },
              ]}
            />
          )}
          <Image source={vignette} resizeMode="stretch" fadeDuration={0} style={styles.layer} />
        </>
      )}
      {darken > 0 && <View style={[styles.layer, { backgroundColor: colors.house, opacity: darken }]} />}
      {grainOpacity > 0 && <Grain opacity={grainOpacity} />}
    </>
  );
});

/**
 * A full-bleed photographic shot: the plate, a slow push-in, the grade (top/bottom darkening), the vignette and film grain.
 * Keep at most three mounted at once (1 GB stick). On Android `resizeMethod="resize"` decodes each 1920×1080 JPEG at the
 * view's size (1280×720 on the test TV, 3.7 MB instead of 8.3 MB), which matters on a TV with 300 MB free.
 */
export const Plate = React.memo(function Plate({
  id,
  push = false,
  pushMs = 300000,
  from = 1,
  to = 1.06,
  grade = 'wide',
  darken = 0,
  grainOpacity = 0.14,
}: {
  id: string;
  /** Animate scale `from` → `to` over `pushMs` (the whole set). Otherwise hold at `from`. */
  push?: boolean;
  pushMs?: number;
  from?: number;
  to?: number;
  grade?: Grade;
  /** Extra house-black over the plate (0..1): the cut sheet and green room sit on a darkened room. */
  darken?: number;
  grainOpacity?: number;
}) {
  const scale = usePushIn(push, pushMs, from, to, id);
  return (
    <View style={styles.fill} pointerEvents="none">
      <Animated.Image
        source={plateSource(id)}
        resizeMode="cover"
        resizeMethod="resize"
        fadeDuration={0}
        style={[styles.fill, { transform: [{ scale }] }]}
      />
      <PlateOverlays grade={grade} darken={darken} grainOpacity={grainOpacity} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
  layer: { ...StyleSheet.absoluteFillObject },
  top: { position: 'absolute', left: 0, right: 0, top: 0, height: '30%' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' },
});
