import React, { useEffect, useRef } from 'react';
import type { ReactionKind, SetState } from '@strumble/crowd';
import { SOUND_SEC, cueFor, sounds, type SoundId } from './sounds';
import { loadSound, mediaUris, type Sound } from './sound.vega';

/** Room tone plays this quietly under live sets in the small rooms (as on Android). */
const ROOM_TONE_VOLUME = 0.25;
/** …and drops to this while the MC is speaking. */
const ROOM_TONE_DUCKED = 0.06;

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
 * The crowd's sound on Vega, matching the Android version: one cue per new reaction, chosen by kind and strength, and a
 * quiet room-tone loop at the open mic and the club while the set is live. Each sound is a w3cmedia `AudioPlayer`
 * (`sound.vega.ts`). The act's cues are loaded when the set starts and restarted for each reaction; a cue outside that
 * set is loaded on first use and kept. Driven by `state.reactions.length`; reactions already in the state when it
 * mounts are not replayed. Renders nothing.
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
}): null {
  const count = state.reactions.length;
  const seen = useRef(count);
  const cues = useRef<Partial<Record<SoundId, Sound>>>({});
  const kind = state.pack.reaction.kind;

  useEffect(() => {
    if (!audible) return undefined;
    const pool = cues.current;
    cuesFor(kind).forEach((id) => {
      if (!pool[id]) pool[id] = loadSound(mediaUris(sounds[id]));
    });
    return () => {
      (Object.keys(pool) as SoundId[]).forEach((id) => {
        const cue = pool[id];
        if (cue) cue.release();
        delete pool[id];
      });
    };
  }, [kind, audible]);

  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count;
      return;
    }
    seen.current = count;
    const reaction = state.reactions[count - 1];
    const id = cueFor(reaction.kind, reaction.strength);
    if (!id) return;
    if (audible) {
      let cue = cues.current[id];
      if (!cue) {
        cue = loadSound(mediaUris(sounds[id]));
        cues.current[id] = cue;
      }
      cue.play();
    }
    if (onCue && state.phase === 'live') onCue(SOUND_SEC[id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const venue = state.config.venue;
  const roomTone = audible && state.phase === 'live' && (venue === 'openmic' || venue === 'club');
  const tone = useRef<Sound | null>(null);
  const toneVolume = duck ? ROOM_TONE_DUCKED : ROOM_TONE_VOLUME;
  const toneVolumeRef = useRef(toneVolume);
  toneVolumeRef.current = toneVolume;
  useEffect(() => {
    if (!roomTone) return undefined;
    const sound = loadSound(mediaUris(sounds['room-tone-club']), {
      loop: true,
      autoplay: true,
      volume: toneVolumeRef.current,
    });
    tone.current = sound;
    return () => {
      tone.current = null;
      sound.release();
    };
  }, [roomTone]);
  useEffect(() => {
    if (tone.current) tone.current.setVolume(toneVolume);
  }, [toneVolume]);

  return null;
}

/** Re-render only when something audible changes (the engine ticks every 100 ms), as on Android. */
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
