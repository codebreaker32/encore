import { Image } from 'react-native';
import { AudioContentType, AudioPlayer, AudioUsageType } from '@amazon-devices/react-native-w3cmedia';

/**
 * The fallback copy of shared-ui's `assets/clips/` and `assets/sounds/` (same names) on HTTPS. w3cmedia opens HTTPS,
 * and `/pkg/assets/raw/<file>`, but not Metro's bundle assets, `file://`, `data:`, `asset://` or plain `http:` (the VVD,
 * SDK 0.24; friction log). The package's own copy comes first (`RAW`); this is tried when it fails. Empty: no fallback.
 */
export const VEGA_MEDIA_BASE = 'https://encore-packs-695019458661.s3.ap-south-1.amazonaws.com/packs/v1/media/';

/** Where apps/vega/tools/babel-plugin-raw-media.js points shared-ui's clip and sound requires (tools/copy-media.mjs). */
const RAW = '/pkg/assets/raw/media/';
const PACKAGED = '/assets/__packages/shared-ui/src/assets/';

/** Where a clip or sound can be opened, best first: the package's own copy, then the HTTPS copy. */
export function mediaUris(asset: number | { uri: string }): string[] {
  if (typeof asset === 'object' && asset !== null) {
    const u = asset.uri;
    return u.indexOf(RAW) === 0 && VEGA_MEDIA_BASE ? [u, VEGA_MEDIA_BASE + u.slice(RAW.length)] : [u];
  }
  // a Metro asset (the Babel plugin not applied): only the HTTPS copy can play
  const resolved = Image.resolveAssetSource(asset);
  if (!resolved) return [];
  const at = resolved.uri.indexOf(PACKAGED);
  return VEGA_MEDIA_BASE && at >= 0 ? [VEGA_MEDIA_BASE + resolved.uri.slice(at + PACKAGED.length)] : [resolved.uri];
}

/** One loaded sound: restartable, with a live volume, released when its owner unmounts. */
export interface Sound {
  /** From the start, or as soon as the player is ready. */
  play(): void;
  setVolume(volume: number): void;
  release(): void;
}

interface SoundOptions {
  loop?: boolean;
  volume?: number;
  autoplay?: boolean;
  /** The MC's voice is speech; the crowd's cues and room tone are sonification. */
  speech?: boolean;
  onDuration?: (sec: number) => void;
  /** Fired once, when the sound is actually playing (not when play() was called): the MC's voice hushes the phone then. */
  onPlaying?: () => void;
  onEnded?: () => void;
  onError?: () => void;
}

/**
 * A sound from the first source that opens (`mediaUris` order): each one that fails hands over to the next, keeping the
 * volume and whether it was asked to play; `onError` comes only when the last one fails.
 */
export function loadSound(source: string | string[] | undefined, options: SoundOptions = {}): Sound {
  const uris = Array.isArray(source) ? source : source ? [source] : [];
  let wantPlay = !!options.autoplay;
  let volume = options.volume === undefined ? 1 : options.volume;
  const openAt = (k: number): Sound =>
    playerFor(uris[k], {
      ...options,
      volume,
      autoplay: wantPlay,
      onError: () => {
        if (k + 1 < uris.length) {
          current.release();
          current = openAt(k + 1);
        } else if (options.onError) options.onError();
      },
    });
  let current = openAt(0);
  return {
    play() {
      wantPlay = true;
      current.play();
    },
    setVolume(v: number) {
      volume = v;
      current.setVolume(v);
    },
    release() {
      current.release();
    },
  };
}

/**
 * A W3C `AudioPlayer` from @amazon-devices/react-native-w3cmedia (initialize → src → load, then play), the audio twin of
 * the video plates' `VideoPlayer`. Every call is guarded: a player that fails reports `onError` once and the show goes on
 * without that sound. Usage is `USAGE_GAME` for every sound, so the cues, the room tone and the MC's voice mix instead of
 * taking media focus from one another.
 */
function playerFor(uri: string | undefined, options: SoundOptions = {}): Sound {
  let player: AudioPlayer | null = null;
  let ready = false;
  let released = false;
  let failed = false;
  let pending = !!options.autoplay;
  let volume = options.volume === undefined ? 1 : options.volume;
  let durationSent = false;
  let playingSent = false;
  let poll: ReturnType<typeof setInterval> | null = null;
  const stopPoll = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };
  const fail = () => {
    stopPoll();
    if (released || failed) return;
    failed = true;
    if (options.onError) options.onError();
  };
  const sounding = () => {
    if (released || playingSent || !options.onPlaying) return;
    playingSent = true;
    stopPoll();
    options.onPlaying();
  };
  const start = () => {
    const p = player;
    if (!p) return;
    try {
      // rewind only a replay: seeking a player that has not loaded yet fails ("seek: MPB Call failed with code: 50004")
      if (p.currentTime > 0) p.currentTime = 0;
      p.play().catch(fail);
    } catch {
      fail();
      return;
    }
    // Which events w3cmedia delivers for audio is not documented: the clock moving is proof the sound is under way.
    if (options.onPlaying && !playingSent && !poll) {
      poll = setInterval(() => {
        const q = player;
        if (!q || released) return stopPoll();
        if (q.currentTime > 0) sounding();
      }, 250);
    }
  };
  const duration = () => {
    const p = player;
    if (durationSent || !p || !options.onDuration) return;
    const sec = p.duration;
    if (typeof sec === 'number' && isFinite(sec) && sec > 0) {
      durationSent = true;
      options.onDuration(sec);
    }
  };
  if (!uri) {
    setTimeout(fail, 0);
  } else {
    try {
      player = new AudioPlayer(
        options.speech ? AudioContentType.CONTENT_TYPE_SPEECH : AudioContentType.CONTENT_TYPE_SONIFICATION,
        AudioUsageType.USAGE_GAME,
      );
      player
        .initialize()
        .then(() => {
          const p = player;
          if (released || !p) return;
          try {
            p.addEventListener('loadedmetadata', duration);
            p.addEventListener('durationchange', duration);
            p.addEventListener('playing', sounding);
            p.addEventListener('timeupdate', () => {
              if (player && player.currentTime > 0) sounding();
            });
            p.addEventListener('ended', () => {
              stopPoll();
              if (!released && options.onEnded) options.onEnded();
            });
            p.addEventListener('error', fail);
            p.autoplay = false;
            p.loop = !!options.loop;
            p.volume = volume;
            p.src = uri;
            p.load();
            ready = true;
            if (pending) start();
          } catch {
            fail();
          }
        })
        .catch(fail);
    } catch {
      fail();
    }
  }
  return {
    play() {
      if (ready) start();
      else pending = true;
    },
    setVolume(v: number) {
      volume = v;
      if (ready && player) {
        try {
          player.volume = v;
        } catch {
          // A volume change is not worth failing the sound for.
        }
      }
    },
    release() {
      released = true;
      stopPoll();
      const p = player;
      player = null;
      if (!p) return;
      try {
        p.pause();
      } catch {
        // Already stopped.
      }
      // The async teardown: deinitializeSync would block the JS thread for every player at the end of a set.
      p.deinitialize().catch(() => undefined);
    },
  };
}
