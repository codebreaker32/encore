import React, { useEffect, useRef } from 'react';
import type { VoiceClip } from './McVoice';
import { estimateSpeechSec, traceVoice } from './sounds';
import { loadSound, type Sound } from './sound.vega';

/** A clip must be sounding this long after its turn comes, or its fallback is tried (and after that, it is skipped). */
const START_MS = 2500;
/** Long-form Polly is the slowest engine to start. */
const LONG_FORM_START_MS = 4500;
/**
 * If a playing clip never reports its end, the queue moves on this long after its real duration, or after 1.5 times the
 * text's estimate while the duration is unknown (docs/voice-plan.md).
 */
const END_GRACE_SEC = 1;
const ESTIMATE_FACTOR = 1.5;

type Timer = ReturnType<typeof setTimeout>;

/**
 * Vega's media player picks the format from the URL's extension ("typefinder No matching content type for
 * file:https://polly…/v1/speech?…" on the VVD), and a presigned Polly URL has none. A query parameter would break its
 * signature, so the type rides in the fragment, which is never sent to the server.
 */
const typed = (url: string) => (/\.mp3(?:$|[?#])/.test(url) ? url : `${url}#.mp3`);

/** The clip is on its neural fallback (for the trace; never the URL itself: it carries a signature). */
const onFallback = (v: Voice) => v.src !== v.clip.uri;

/** One clip with its player: the one whose turn it is, or the next, loaded paused. */
interface Voice {
  clip: VoiceClip;
  /** What the player is opening: the clip's URL, or its neural fallback after a failure. */
  src: string;
  sound: Sound;
  started: boolean;
  /** Its URL and fallback both failed: it is skipped when its turn comes. */
  failed: boolean;
  durationSec: number | null;
}

interface Callbacks {
  playing: (key: string) => void;
  done: (key: string) => void;
}

/**
 * The queue's state outside React: two w3cmedia AudioPlayers at most (sound.vega.ts), recognised by URL like the two
 * players of McVoice.tsx, so the intro loaded ahead of OK is the intro queued at OK under another key.
 */
function makeVoices(cb: Callbacks) {
  let voices: Voice[] = [];
  let headUri: string | null = null;
  let headKey: string | null = null;
  let deadline: Timer | null = null;
  let endTimer: Timer | null = null;

  const isHead = (v: Voice) => headUri !== null && v.clip.uri === headUri;
  const clearTimers = () => {
    if (deadline) clearTimeout(deadline);
    if (endTimer) clearTimeout(endTimer);
    deadline = null;
    endTimer = null;
  };
  /** The head ended, failed on both URLs or never started: the queue moves on. */
  const finish = () => {
    clearTimers();
    const key = headKey;
    headUri = null;
    headKey = null;
    if (key !== null) cb.done(key);
  };
  const armDeadline = (v: Voice) => {
    if (deadline) clearTimeout(deadline);
    const ms = !onFallback(v) && v.clip.engine === 'long-form' ? LONG_FORM_START_MS : START_MS;
    deadline = setTimeout(() => {
      if (!isHead(v) || v.started) return;
      traceVoice('deadline', v.clip, `${ms}ms`);
      fail(v);
    }, ms);
  };
  const armEnd = (v: Voice) => {
    if (endTimer) clearTimeout(endTimer);
    const sec = v.durationSec !== null ? v.durationSec : estimateSpeechSec(v.clip.text) * ESTIMATE_FACTOR;
    endTimer = setTimeout(
      () => {
        if (!isHead(v)) return;
        traceVoice('end-timer', v.clip, `${sec.toFixed(1)}s`);
        finish();
      },
      (sec + END_GRACE_SEC) * 1000,
    );
  };
  const open = (v: Voice, src: string, autoplay: boolean) => {
    v.src = src;
    v.started = false;
    traceVoice(onFallback(v) ? 'fallback' : 'loading', v.clip, autoplay ? 'now' : 'paused');
    v.sound = loadSound(typed(src), {
      speech: true,
      autoplay,
      onPlaying: () => {
        if (v.src !== src || v.started) return;
        v.started = true;
        if (!isHead(v)) return;
        if (deadline) clearTimeout(deadline);
        deadline = null;
        armEnd(v);
        traceVoice('playing', v.clip, onFallback(v) ? 'fallback' : undefined);
        if (headKey !== null) cb.playing(headKey);
      },
      onDuration: (sec) => {
        if (v.src !== src) return;
        v.durationSec = sec;
        if (isHead(v) && v.started) armEnd(v);
      },
      onEnded: () => {
        if (v.src !== src || !isHead(v)) return;
        traceVoice('ended', v.clip);
        finish();
      },
      onError: () => {
        if (v.src !== src) return;
        traceVoice('error', v.clip, onFallback(v) ? 'fallback' : undefined);
        fail(v);
      },
    });
  };
  /** `src` failed or never started: the neural fallback once, then the clip is marked failed. */
  function fail(v: Voice) {
    if (v.failed) return;
    const fallback = v.clip.fallbackUri;
    v.sound.release();
    if (!onFallback(v) && fallback) {
      open(v, fallback, isHead(v));
      if (isHead(v)) armDeadline(v);
      return;
    }
    v.failed = true;
    if (!isHead(v)) return;
    traceVoice('skipped', v.clip);
    finish();
  }
  const create = (clip: VoiceClip, autoplay: boolean): Voice => {
    const v: Voice = {
      clip,
      src: clip.uri,
      sound: { play() {}, setVolume() {}, release() {} },
      started: false,
      failed: false,
      durationSec: null,
    };
    voices.push(v);
    open(v, clip.uri, autoplay);
    return v;
  };

  return {
    update(clip: VoiceClip | null, next: VoiceClip | null) {
      const wanted = [clip, next];
      voices = voices.filter((v) => {
        if (wanted.some((c) => !!c && c.uri === v.clip.uri)) return true;
        // a clip taken off the queue stops, mid-sentence if it was playing (its set was stopped)
        v.sound.release();
        if (isHead(v)) {
          clearTimers();
          headUri = null;
          headKey = null;
        }
        return false;
      });
      if (clip && headUri !== clip.uri) {
        clearTimers();
        headUri = clip.uri;
        headKey = clip.key;
        const v = voices.find((x) => x.clip.uri === clip.uri) || create(clip, true);
        // the clip loaded ahead may be the same words queued under another key: trace them under the queued one
        v.clip = clip;
        if (v.failed) {
          traceVoice('skipped', clip, 'failed while preloading');
          finish();
        } else {
          v.sound.play();
          armDeadline(v);
        }
      } else if (clip) {
        headKey = clip.key;
        const v = voices.find((x) => x.clip.uri === clip.uri);
        if (v) v.clip = clip;
      }
      if (next && !voices.some((v) => v.clip.uri === next.uri)) create(next, false);
    },
    dispose() {
      clearTimers();
      voices.forEach((v) => v.sound.release());
      voices = [];
      headUri = null;
      headKey = null;
    },
  };
}

/**
 * The MC's voice on Vega, with McVoice.tsx's contract: the presigned HTTPS Polly URL plays through w3cmedia's `src`
 * (w3cmedia opens HTTPS only), the next clip loads paused in a second player, `onPlaying(key)` fires when the clip is
 * actually sounding, and `onDone(key)` when it ends. A clip that fails, or is not sounding 2.5 s after its turn comes
 * (4.5 s for long-form), gets its neural fallback once and is then skipped. Each step is traced as `[mc-voice] …`, as
 * on Android (sounds.ts `traceVoice`: keys and engines, no URLs). Renders nothing.
 */
function McVoiceInner({
  clip,
  next = null,
  onPlaying,
  onDone,
}: {
  clip: VoiceClip | null;
  next?: VoiceClip | null;
  onPlaying?: (key: string) => void;
  onDone: (key: string) => void;
}): null {
  const callbacks = useRef({ onPlaying, onDone });
  callbacks.current = { onPlaying, onDone };
  const voices = useRef<ReturnType<typeof makeVoices> | null>(null);
  if (!voices.current) {
    voices.current = makeVoices({
      playing: (key) => {
        const f = callbacks.current.onPlaying;
        if (f) f(key);
      },
      done: (key) => callbacks.current.onDone(key),
    });
  }
  const latest = useRef({ clip, next });
  latest.current = { clip, next };
  const clipUri = clip ? clip.uri : null;
  const clipKey = clip ? clip.key : null;
  const nextUri = next ? next.uri : null;
  useEffect(() => {
    if (voices.current) voices.current.update(latest.current.clip, latest.current.next);
  }, [clipUri, clipKey, nextUri]);
  useEffect(
    () => () => {
      if (voices.current) voices.current.dispose();
    },
    [],
  );
  return null;
}

/** EncoreApp re-renders on every engine tick; the players only need to when the queue changes. */
export const McVoice = React.memo(McVoiceInner);
