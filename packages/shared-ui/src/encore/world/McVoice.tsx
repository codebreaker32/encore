import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Video from 'react-native-video';
import type { McAudio } from '@strumble/crowd';
import { VOLUME_SCALE, estimateSpeechSec, traceVoice } from './sounds';

/** One MC utterance to play: the model's words in Amazon Polly's voice (`voiceClip()` in sounds.ts builds it). */
export interface VoiceClip {
  key: string;
  /** The presigned HTTPS Polly URL (`McAudio.url`). The two players recognise a clip by it, whatever its key. */
  uri: string;
  /** The same words on the neural engine (`McAudio.fallbackUrl`): tried once if `uri` fails or does not start in time. */
  fallbackUri?: string;
  /** The engine behind `uri`. */
  engine: McAudio['engine'];
  text: string;
  /** Spoken during a set (the intro): the phone must ignore its mic while it plays. */
  live: boolean;
  /** The set an intro belongs to: it is dropped when that set stops, or when the intro's window passes before it starts. */
  setId?: string;
}

const WEB = Platform.OS === 'web';
/** A clip must be sounding this long after its turn comes, or its fallback is tried; after the fallback it is skipped. */
const START_MS = 2500;
/**
 * The browser holds a chunked MP3 until it has about 32 KB (or the whole clip): measured in Chromium (2026-10-12), a
 * generative clip started 1.0–2.0 s after the MC's answer on the build box in Mumbai (Brian slowest, at Polly's
 * 19 KB/s; 2.2 s from us-west-2) and neural ones in 0.2–0.3 s. 2.5 s left Brian half a second or less, so on web a
 * generative clip gets longer before its fallback.
 */
const WEB_GENERATIVE_START_MS = 4000;
/** Long-form Polly is the slowest engine to start. */
const LONG_FORM_START_MS = 4500;
/** If a playing clip never reports its end, the queue moves on this long after its expected end. */
const END_GRACE_SEC = 2;
/**
 * ExoPlayer waits for 2.5 s of audio before it starts a stream (5 s after a stall). Polly streams the clip chunked with
 * no length, so with the defaults a short line would wait for most of itself; a quarter second is enough for speech.
 */
const BUFFER = { bufferForPlaybackMs: 250, bufferForPlaybackAfterRebufferMs: 1000 };

/** How long `src` may take to sound once its turn has come. */
function startMs(clip: VoiceClip | null, src: string | null): number {
  if (!clip || src !== clip.uri) return START_MS; // the fallback is neural
  if (clip.engine === 'long-form') return LONG_FORM_START_MS;
  return WEB && clip.engine === 'generative' ? WEB_GENERATIVE_START_MS : START_MS;
}

interface Slot {
  /** The clip loaded in this player; null when it is free. */
  clip: VoiceClip | null;
  /** What the player is opening: the clip's URL, or its fallback after a failure. */
  src: string | null;
  /**
   * Android reported opening `src` (`onLoadStart`). Until then a reused player can still deliver its previous clip's last
   * events (a progress tick from a clip stopped mid-sentence), which must not count for this one. The web player has no
   * such event and needs none: each source gets its own element.
   */
  opened: boolean;
  /** The clip has sounded while it was the one to play. */
  started: boolean;
  /** Its URL and fallback both failed: the clip is skipped when its turn comes. */
  failed: boolean;
  /** Its real length, once the player knows it (a chunked stream often never says). */
  durationSec: number | null;
}

const FREE: Slot = { clip: null, src: null, opened: false, started: false, failed: false, durationSec: null };

/** Same audio: the intro loaded ahead of OK is the intro queued at OK, under another key. */
function same(a: VoiceClip | null, b: VoiceClip | null): boolean {
  return !!a && !!b && a.uri === b.uri;
}

/**
 * Give each wanted clip a player, leaving a loaded clip where it is. A new clip takes a player that was already free
 * before this pass when there is one, rather than one just vacated by a clip stopped mid-sentence.
 */
function assign(slots: Slot[], wanted: (VoiceClip | null)[]): Slot[] {
  let changed = false;
  const next = slots.map((s) => {
    if (!s.clip || wanted.some((c) => same(c, s.clip))) return s;
    changed = true;
    return FREE;
  });
  for (const clip of wanted) {
    if (!clip || next.some((s) => same(s.clip, clip))) continue;
    let i = next.findIndex((s, j) => !s.clip && !slots[j].clip);
    if (i < 0) i = next.findIndex((s) => !s.clip);
    if (i < 0) continue;
    next[i] = { ...FREE, clip, src: clip.uri };
    changed = true;
  }
  return changed ? next : slots;
}

/** One player: a zero-size, audio-only react-native-video element. */
function VoiceSlot({
  src,
  paused,
  onOpen,
  onDuration,
  onSounding,
  onEnd,
  onError,
}: {
  src: string | null;
  paused: boolean;
  onOpen: () => void;
  onDuration: (sec: number) => void;
  onSounding: () => void;
  onEnd: () => void;
  onError: () => void;
}) {
  // A stable source object: a new one each render would reach the native player as a new prop.
  const source = useMemo(() => (src ? { uri: src, type: 'mp3', bufferConfig: BUFFER } : undefined), [src]);
  // The web player says `isPlaying` as soon as play() is called, before any sound (and not at all when autoplay is
  // blocked). Sound is under way once it is playing with data in hand (`canplay`), or once its clock moves; the clock
  // alone ticks only every quarter second, which would leave the phone unhushed for the clip's first words.
  const web = useRef({ playing: false, ready: false });
  return (
    <Video
      source={source}
      style={styles.silent}
      paused={paused}
      muted={false}
      volume={VOLUME_SCALE}
      controls={false}
      playInBackground={false}
      disableFocus
      onLoadStart={onOpen}
      onLoad={(e: { duration?: number }) => {
        if (e && typeof e.duration === 'number' && isFinite(e.duration) && e.duration > 0) onDuration(e.duration);
      }}
      onBuffer={(e: { isBuffering?: boolean }) => {
        if (!WEB || !e || e.isBuffering !== false) return;
        web.current.ready = true;
        if (web.current.playing) onSounding();
      }}
      onPlaybackStateChanged={(e: { isPlaying?: boolean }) => {
        if (!e) return;
        if (!WEB) {
          if (e.isPlaying) onSounding();
          return;
        }
        web.current.playing = !!e.isPlaying;
        if (e.isPlaying && web.current.ready) onSounding();
      }}
      onProgress={(e: { currentTime?: number }) => {
        if (e && typeof e.currentTime === 'number' && e.currentTime > 0) onSounding();
      }}
      onEnd={onEnd}
      onError={onError}
    />
  );
}

/**
 * The MC's voice (Expo web and Android): two zero-size audio-only players. The clip whose turn it is plays in one; the
 * next loads paused in the other, so it starts without a fetch when its turn comes. On Android the players keep fixed
 * keys and swap sources, so ExoPlayer is created once rather than per clip. On web each source gets a fresh element:
 * react-native-web applies a new source one render after `paused`, so a reused element would replay its old clip for an
 * instant. A clip that fails, or is not sounding 2.5 s after its turn comes (4.5 s for long-form, 4 s for generative on
 * web), gets its neural fallback once and is then skipped, which also moves the queue on when a browser blocks sound
 * before the first gesture. Each step is traced as `[mc-voice] …` (sounds.ts `traceVoice`: keys and engines, no URLs).
 */
function McVoiceInner({
  clip,
  next = null,
  onPlaying,
  onDone,
}: {
  /** The clip whose turn it is: it plays now. */
  clip: VoiceClip | null;
  /** The clip after it, or the intro written ahead of OK: it loads paused. */
  next?: VoiceClip | null;
  /** `clip` started to sound: the room ducks and the phone is hushed from now, not from when it was queued. */
  onPlaying?: (key: string) => void;
  /** `clip` ended, failed on both URLs, or never started: the queue moves on. */
  onDone: (key: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(() => [FREE, FREE]);
  // Assigned during render (React re-renders at once, before committing), so a clip whose turn comes never spends a
  // commit without its player, and a clip loaded paused starts in the player that loaded it.
  const assigned = assign(slots, [clip, next]);
  if (assigned !== slots) setSlots(assigned);

  const clipRef = useRef(clip);
  clipRef.current = clip;
  const playingRef = useRef(onPlaying);
  playingRef.current = onPlaying;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  /** Update a player's state, unless it has moved on from `src` since the event or timer was set up. */
  const patch = useCallback((i: number, src: string | null, change: Partial<Slot>) => {
    setSlots((prev) => {
      const s = prev[i];
      if (!s.clip || s.src !== src) return prev;
      return prev.map((x, j) => (j === i ? { ...x, ...change } : x));
    });
  }, []);

  /** `src` failed or never started: the neural fallback once, then the clip is marked failed. */
  const fail = useCallback((i: number, src: string | null) => {
    setSlots((prev) => {
      const s = prev[i];
      if (!s.clip || s.src !== src || s.failed) return prev;
      const fallback = s.clip.fallbackUri;
      const now: Slot =
        src === s.clip.uri && fallback ? { ...FREE, clip: s.clip, src: fallback } : { ...s, failed: true };
      return prev.map((x, j) => (j === i ? now : x));
    });
  }, []);

  const h = clip ? assigned.findIndex((s) => same(s.clip, clip)) : -1;
  const head = h >= 0 ? assigned[h] : null;
  const playKey = clip && head ? clip.key : null;
  const headSrc = head ? head.src : null;
  const headStarted = !!head && head.started;
  const headFailed = !!head && head.failed;
  const headDuration = head ? head.durationSec : null;

  // `[mc-voice] loading` once per URL a player opens: now (its turn) or paused (loaded ahead), and whether it is the
  // neural fallback.
  const traced = useRef<string[]>([]);
  useEffect(() => {
    assigned.forEach((s, i) => {
      if (!s.clip || !s.src || traced.current.indexOf(s.src) >= 0) return;
      traced.current = [...traced.current.slice(-3), s.src];
      const fallback = s.src !== s.clip.uri;
      traceVoice(fallback ? 'fallback' : 'loading', s.clip, `slot ${i} ${i === h ? 'now' : 'paused'}`);
    });
  }, [assigned, h]);

  useEffect(() => {
    if (!playKey || !headStarted) return;
    const c = clipRef.current;
    if (c) traceVoice('playing', c, headSrc !== c.uri ? 'fallback' : undefined);
    if (playingRef.current) playingRef.current(playKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, headStarted]);

  // Until the playing clip sounds: the start deadline, then the fallback, then a skip. A clip that failed while it was
  // loading paused is skipped as soon as its turn comes.
  useEffect(() => {
    if (!playKey) return undefined;
    if (headFailed) {
      const c = clipRef.current;
      if (c) traceVoice('skipped', c);
      doneRef.current(playKey);
      return undefined;
    }
    if (headStarted) return undefined;
    const ms = startMs(clipRef.current, headSrc);
    const t = setTimeout(() => {
      const c = clipRef.current;
      if (c) traceVoice('deadline', c, `${ms}ms`);
      fail(h, headSrc);
    }, ms);
    return () => clearTimeout(t);
  }, [playKey, h, headSrc, headStarted, headFailed, fail]);

  // Once it sounds: its expected end plus a grace, so a player that never reports the end does not hold the queue.
  useEffect(() => {
    if (!playKey || !headStarted) return undefined;
    const c = clipRef.current;
    const sec = headDuration !== null ? headDuration : estimateSpeechSec(c ? c.text : '') * 2;
    const t = setTimeout(
      () => {
        if (c) traceVoice('end-timer', c, `${sec.toFixed(1)}s`);
        doneRef.current(playKey);
      },
      (sec + END_GRACE_SEC) * 1000,
    );
    return () => clearTimeout(t);
  }, [playKey, headStarted, headDuration]);

  return (
    <>
      {assigned.map((s, i) =>
        WEB && !s.src ? null : (
          <VoiceSlot
            key={WEB ? `mc-voice-${i}-${s.src}` : `mc-voice-${i}`}
            src={s.src}
            paused={i !== h}
            onOpen={() => patch(i, s.src, { opened: true })}
            onDuration={(sec) => patch(i, s.src, { durationSec: sec })}
            onSounding={() => {
              if (i === h && !s.started && (WEB || s.opened)) patch(i, s.src, { started: true });
            }}
            onEnd={() => {
              if (i !== h || !clip || !(WEB || s.opened)) return;
              traceVoice('ended', clip);
              doneRef.current(clip.key);
            }}
            onError={() => {
              if (!(WEB || s.opened)) return;
              if (s.clip) traceVoice('error', s.clip, `slot ${i}`);
              fail(i, s.src);
            }}
          />
        ),
      )}
    </>
  );
}

/** EncoreApp re-renders on every engine tick; the players only need to when the queue or their own state changes. */
export const McVoice = React.memo(McVoiceInner);

const styles = StyleSheet.create({
  silent: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});
