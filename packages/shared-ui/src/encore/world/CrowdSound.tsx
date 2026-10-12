import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import type { ReactionKind, SetState } from '@strumble/crowd';
import { SOUND_SEC, VOLUME_SCALE, cueFor, mediaUri, sounds, type SoundId } from './sounds';

/** Room tone plays this quietly under live sets in the small rooms. */
const ROOM_TONE_VOLUME = 0.25;
/** …and drops to this while the MC is speaking. */
const ROOM_TONE_DUCKED = 0.06;

type Listen = (type: string, fn: () => void, options?: unknown) => void;
const page = globalThis as unknown as { addEventListener?: Listen; removeEventListener?: Listen };

/**
 * Browsers block sound until the viewer's first click or key press, and a blocked element never retries by itself.
 * On web this counts that first gesture so the looping room tone can remount and start; reaction cues mount fresh on
 * each reaction and already play once the page has been touched. Native players need no unlock.
 */
function useAudioUnlock(): number {
  const [unlocked, setUnlocked] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || !page.addEventListener || !page.removeEventListener) return undefined;
    const add = page.addEventListener;
    const remove = page.removeEventListener;
    const onGesture = () => {
      setUnlocked(1);
      remove('pointerdown', onGesture, true);
      remove('keydown', onGesture, true);
    };
    add('pointerdown', onGesture, true);
    add('keydown', onGesture, true);
    return () => {
      remove('pointerdown', onGesture, true);
      remove('keydown', onGesture, true);
    };
  }, []);
  return unlocked;
}

/** What a pooled cue needs from its player (react-native-video's ref on both the Expo and the Vega versions). */
interface Seekable {
  seek(time: number): void;
}

/** The cues a set can need: its act's own reaction at every strength, plus the murmur every room makes. */
function cuesFor(kind: ReactionKind): SoundId[] {
  const ids: SoundId[] = ['murmur'];
  for (const strength of [0.2, 0.5, 0.9]) {
    const id = cueFor(kind, strength);
    if (id && ids.indexOf(id) < 0) ids.push(id);
  }
  return ids;
}

/**
 * The crowd's sound (Expo web and Android): one cue per new reaction, chosen by kind and strength, and a quiet room-tone
 * loop at the open mic and the club while the set is live. Audio-only react-native-video elements of zero size.
 * The act's cues are loaded once when the set starts and rewound for each reaction: creating a player per laugh cost a
 * visible beat on the TV. A cue outside that set is loaded on first use and kept.
 * Driven by `state.reactions.length`; reactions already in the state when it mounts are not replayed.
 */
function CrowdSoundInner({
  state,
  duck = false,
  onCue,
  audible = true,
}: {
  state: SetState;
  /** The MC is speaking: the room tone ducks under the voice. */
  duck?: boolean;
  /** A cue started during the live set, with its length: the phone is told to ignore its mic that long. */
  onCue?: (sec: number) => void;
  /** False while the live 3D room plays the sound itself: no players, but the phone is still hushed for each cue. */
  audible?: boolean;
}) {
  const count = state.reactions.length;
  const seen = useRef(count);
  const unlocked = useAudioUnlock();
  const players = useRef<Partial<Record<SoundId, Seekable | null>>>({});
  const [pool, setPool] = useState<SoundId[]>(() => cuesFor(state.pack.reaction.kind));
  /** The cues sounding now (by id), each with the reaction count that started it. */
  const [playing, setPlaying] = useState<Partial<Record<SoundId, number>>>({});

  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count;
      return;
    }
    seen.current = count;
    const reaction = state.reactions[count - 1];
    const id = cueFor(reaction.kind, reaction.strength);
    if (id) {
      setPool((p) => (p.indexOf(id) >= 0 ? p : [...p, id]));
      const player = players.current[id];
      if (player) player.seek(0);
      setPlaying((p) => ({ ...p, [id]: count }));
      if (onCue && state.phase === 'live') onCue(SOUND_SEC[id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const stop = (id: SoundId) =>
    setPlaying((p) => {
      if (p[id] === undefined) return p;
      const next = { ...p };
      delete next[id];
      return next;
    });

  const live = state.phase === 'live';
  const roomTone = live && (state.config.venue === 'openmic' || state.config.venue === 'club');
  if (!audible) return null;

  return (
    <>
      {pool.map((id) => (
        <Video
          key={`cue-${id}`}
          ref={(r: Seekable | null) => {
            players.current[id] = r;
          }}
          source={{ uri: mediaUri(sounds[id]) }}
          style={styles.silent}
          paused={playing[id] === undefined}
          muted={false}
          volume={VOLUME_SCALE}
          controls={false}
          playInBackground={false}
          disableFocus
          onEnd={() => stop(id)}
          onError={() => stop(id)}
        />
      ))}
      {roomTone ? (
        <Video
          key={`room-tone-${unlocked}`}
          source={{ uri: mediaUri(sounds['room-tone-club']) }}
          style={styles.silent}
          paused={false}
          muted={false}
          volume={(duck ? ROOM_TONE_DUCKED : ROOM_TONE_VOLUME) * VOLUME_SCALE}
          repeat
          controls={false}
          playInBackground={false}
          disableFocus
        />
      ) : null}
    </>
  );
}

/**
 * Re-render only when something audible changes: a new reaction, the phase, the venue or the duck. The engine ticks every
 * 100 ms, and re-rendering the zero-size players that often is wasted work on a TV stick.
 */
export const CrowdSound = React.memo(
  CrowdSoundInner,
  (a, b) =>
    a.state.reactions.length === b.state.reactions.length &&
    a.state.phase === b.state.phase &&
    a.state.config.venue === b.state.config.venue &&
    a.duck === b.duck &&
    a.onCue === b.onCue &&
    a.audible === b.audible,
);

const styles = StyleSheet.create({
  silent: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});
