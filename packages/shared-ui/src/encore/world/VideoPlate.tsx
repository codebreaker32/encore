import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, View } from 'react-native';
import Video from 'react-native-video';
import type { Clip } from './clips';
import { Plate, PlateOverlays, usePushIn, type Grade } from './Plate';
import { mediaUri } from './sounds';
import { colors } from './theme';

/**
 * If the first frame has not arrived this long after mount, the still plate takes over. The poster is on screen until
 * then, so on web (dev server, cold first loads, a busy main thread while the bundle starts) the grace is generous; a
 * 1 GB stick gets its memory back sooner.
 */
export const VIDEO_GRACE_MS = Platform.OS === 'web' ? 8000 : 1500;

export interface VideoPlateProps {
  /** The moving plate; without one the still `fallback` plate is shown. */
  clip?: Clip;
  /** The still plate the pack names for this slot. */
  fallback: string;
  /** Wides loop; reactions and the finale play once and hold their last frame. */
  loop?: boolean;
  push?: boolean;
  pushMs?: number;
  from?: number;
  to?: number;
  grade?: Grade;
  /** A gold wash over cool footage (the open-mic clips). */
  warm?: number;
  grainOpacity?: number;
}

/**
 * A moving plate (Expo web and Android, react-native-video): the clip plays muted under the same grade, vignette and grain
 * as a still, with the poster shown until the first frame. On error, or if nothing has loaded within VIDEO_GRACE_MS,
 * it renders the still `Plate` instead. One video and one poster at a time: mount it only for the current shot.
 */
export const VideoPlate = React.memo(function VideoPlate({ clip, fallback, loop = false, push = false, pushMs = 300000, from = 1, to = 1.06, grade = 'wide', warm = 0, grainOpacity = 0.14 }: VideoPlateProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);
  const key = clip ? clip.id : fallback;
  const scale = usePushIn(push, pushMs, from, to, key);

  useEffect(() => {
    readyRef.current = false;
    setReady(false);
    setFailed(false);
    if (!clip) return undefined;
    const t = setTimeout(() => {
      if (!readyRef.current) setFailed(true);
    }, VIDEO_GRACE_MS);
    return () => clearTimeout(t);
  }, [clip]);

  const onReady = useCallback(() => {
    readyRef.current = true;
    setReady(true);
  }, []);
  const onFail = useCallback(() => setFailed(true), []);

  if (!clip || failed) {
    return <Plate id={fallback} push={push} pushMs={pushMs} from={from} to={to} grade={grade} grainOpacity={grainOpacity} />;
  }

  return (
    <View style={styles.fill} pointerEvents="none">
      <Animated.View style={[styles.fill, { transform: [{ scale }] }]}>
        <Video
          source={{ uri: mediaUri(clip.clip) }}
          style={styles.fill}
          resizeMode="cover"
          muted
          volume={0}
          repeat={loop}
          paused={false}
          controls={false}
          playInBackground={false}
          disableFocus
          onLoad={onReady}
          onReadyForDisplay={onReady}
          onError={onFail}
        />
        {!ready && <Image source={clip.poster} resizeMode="cover" resizeMethod="resize" fadeDuration={0} style={styles.fill} />}
      </Animated.View>
      <PlateOverlays grade={grade} warm={warm} grainOpacity={grainOpacity} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
});
