import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { KeplerVideoSurfaceView, VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import type { Clip } from './clips';
import { mediaUris } from './sound.vega';
import { Plate, PlateOverlays, usePushIn, type Grade } from './Plate';
import { colors } from './theme';
import type { VideoPlateProps } from './VideoPlate';

/**
 * If the first frame has not arrived this long after mount, the still plate takes over. The poster covers the wait, so
 * a generous grace costs nothing on screen; a stream decoded in software (the Vega Virtual Device) needs a few seconds.
 */
export const VIDEO_GRACE_MS = 4000;

/**
 * Clips that failed to open and clips that played, in this run of the app. When the player never opens a clip (packaged
 * media on the Vega Virtual Device, see `VEGA_MEDIA_BASE` in sound.vega.ts), every cut would create a player, wait for
 * it to fail and flash the empty surface first; after a few failures with no success the plates go straight to stills.
 */
const opened = { ok: 0, failed: 0 };
const VIDEO_GIVE_UP_AFTER = 3;
function videoUnavailable(): boolean {
  return opened.ok === 0 && opened.failed >= VIDEO_GIVE_UP_AFTER;
}

/** Where the clip can be opened, best first: the package's own copy, then the HTTPS copy (`mediaUris`). */
function clipUris(clip: Clip): string[] {
  return mediaUris(clip.clip as number | { uri: string });
}

/**
 * The Vega moving plate: a W3C `VideoPlayer` from @amazon-devices/react-native-w3cmedia rendering into a
 * `KeplerVideoSurfaceView` (the pattern of src/components/player/VideoPlayer.vega.tsx and utils/VideoHandler.kepler.ts),
 * poster until the first frame, and the still `Plate` on error or after VIDEO_GRACE_MS without one.
 * Every player call is guarded so a failure falls back instead of throwing.
 */
export const VideoPlate = React.memo(function VideoPlate({
  clip,
  fallback,
  loop = false,
  push = false,
  pushMs = 300000,
  from = 1,
  to = 1.06,
  grade = 'wide',
  warm = 0,
  grainOpacity = 0.14,
}: VideoPlateProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(videoUnavailable);
  const playerRef = useRef<VideoPlayer | null>(null);
  const surfaceRef = useRef<string | null>(null);
  const key = clip ? clip.id : fallback;
  const scale = usePushIn(push, pushMs, from, to, key);
  // which source of this clip is being tried: a failure moves on to the next before the still takes over
  const [tries, setTries] = useState({ id: key, n: 0 });
  const n = tries.id === key ? tries.n : 0;
  const uris = clip ? clipUris(clip) : [];
  const uri = uris[n];
  const more = n + 1 < uris.length;

  useEffect(() => {
    setReady(false);
    setFailed(videoUnavailable());
    if (!clip || videoUnavailable()) return undefined;
    if (!uri) {
      setFailed(true);
      return undefined;
    }
    let alive = true;
    let isReady = false;
    let counted = false;
    const fail = () => {
      if (more) {
        if (alive) setTries({ id: key, n: n + 1 });
        return;
      }
      if (!counted) {
        counted = true;
        opened.failed += 1;
      }
      if (alive) setFailed(true);
    };
    const onReady = () => {
      if (!isReady && !counted) {
        counted = true;
        opened.ok += 1;
      }
      isReady = true;
      if (alive) setReady(true);
    };
    const grace = setTimeout(() => {
      if (!isReady) fail();
    }, VIDEO_GRACE_MS);
    let player: VideoPlayer | null = null;
    try {
      player = new VideoPlayer();
      playerRef.current = player;
      player
        .initialize()
        .then(() => {
          if (!alive || !player) return;
          try {
            if (surfaceRef.current) player.setSurfaceHandle(surfaceRef.current);
            player.addEventListener('playing', onReady);
            player.addEventListener('loadeddata', onReady);
            player.addEventListener('error', fail);
            player.autoplay = true;
            player.loop = loop;
            player.muted = true;
            player.src = uri;
            player.load();
            player.play();
          } catch (e) {
            fail();
          }
        })
        .catch(fail);
    } catch (e) {
      fail();
    }
    return () => {
      alive = false;
      clearTimeout(grace);
      const p = playerRef.current;
      playerRef.current = null;
      if (p) {
        try {
          p.pause();
          p.deinitializeSync(500);
        } catch (e) {
          // The player is gone either way.
        }
      }
    };
  }, [clip, uri, loop]);

  if (!clip || failed) {
    return (
      <Plate id={fallback} push={push} pushMs={pushMs} from={from} to={to} grade={grade} grainOpacity={grainOpacity} />
    );
  }

  return (
    <View style={styles.fill} pointerEvents="none">
      <Animated.View style={[styles.fill, { transform: [{ scale }] }]}>
        <KeplerVideoSurfaceView
          style={styles.fill}
          onSurfaceViewCreated={(handle: string) => {
            surfaceRef.current = handle;
            const p = playerRef.current;
            if (p) {
              try {
                p.setSurfaceHandle(handle);
              } catch (e) {
                setFailed(true);
              }
            }
          }}
          onSurfaceViewDestroyed={(handle: string) => {
            if (surfaceRef.current === handle) surfaceRef.current = null;
            const p = playerRef.current;
            if (p) {
              try {
                p.clearSurfaceHandle(handle);
              } catch (e) {
                // Already torn down.
              }
            }
          }}
        />
        {!ready && <Image source={clip.poster} resizeMode="cover" fadeDuration={0} style={styles.fill} />}
      </Animated.View>
      <PlateOverlays grade={grade} warm={warm} grainOpacity={grainOpacity} />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.house },
});
