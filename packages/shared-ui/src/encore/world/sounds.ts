import { Platform } from 'react-native';
import type { McAudio, ReactionKind } from '@strumble/crowd';
import type { VoiceClip } from './McVoice';

/** react-native-video's web player takes volume on a 0–100 scale (it divides by 100); native players take 0–1. */
export const VOLUME_SCALE = Platform.OS === 'web' ? 100 : 1;

/** Crowd cues (src/assets/sounds/CREDITS.md). `laugh-big` is CC BY (lonemonk, freesound.org) and is credited on the bill. */
export const sounds = {
  'laugh-small': require('../../assets/sounds/laugh-small.mp3'),
  'laugh-medium': require('../../assets/sounds/laugh-medium.mp3'),
  'laugh-big': require('../../assets/sounds/laugh-big.mp3'),
  'applause-small': require('../../assets/sounds/applause-small.mp3'),
  'applause-big': require('../../assets/sounds/applause-big.mp3'),
  snaps: require('../../assets/sounds/snaps.mp3'),
  murmur: require('../../assets/sounds/murmur.mp3'),
  'cheer-big': require('../../assets/sounds/cheer-big.mp3'),
  'room-tone-club': require('../../assets/sounds/room-tone-club.mp3'),
};

export type SoundId = keyof typeof sounds;

/** Each cue's length in seconds (sounds/CREDITS.md), for the phone's hush while the TV is making sound. */
export const SOUND_SEC: Record<SoundId, number> = {
  'laugh-small': 3.34,
  'laugh-medium': 3.81,
  'laugh-big': 5.77,
  'applause-small': 5.02,
  'applause-big': 6.27,
  snaps: 3.08,
  murmur: 7.03,
  'cheer-big': 5.85,
  'room-tone-club': 8.05,
};

function https(url: unknown): url is string {
  return typeof url === 'string' && url.indexOf('https://') === 0;
}

/**
 * The MC's Polly clip as the TV queues it: the presigned URL, its neural fallback and the words it says. Null when the
 * answer carries no playable URL (an older service still sending base64, or anything but HTTPS, which Vega cannot open),
 * so the words still show and the MC is simply not heard.
 */
export function voiceClip(
  audio: McAudio | undefined,
  clip: Pick<VoiceClip, 'key' | 'text' | 'live' | 'setId'>,
): VoiceClip | null {
  if (!audio || !https(audio.url)) return null;
  const engine = audio.engine === 'generative' || audio.engine === 'long-form' ? audio.engine : 'neural';
  return { ...clip, uri: audio.url, fallbackUri: https(audio.fallbackUrl) ? audio.fallbackUrl : undefined, engine };
}

/** When each clip was queued (or first seen, for the intro loaded ahead of OK), for the traces' "+ms". */
const queuedAt = new Map<string, number>();

/**
 * One `[mc-voice]` line for logcat (`adb logcat -s ReactNativeJS`) and the browser console:
 * `[mc-voice] <event> <key> <engine> +<ms since queued> [detail]`. Never the URL (a presigned URL is a credential for
 * ten minutes) and never the words.
 */
export function traceVoice(event: string, clip: Pick<VoiceClip, 'key' | 'engine'>, detail?: string): void {
  const now = Date.now();
  let at = queuedAt.get(clip.key);
  if (at === undefined) {
    at = now;
    queuedAt.set(clip.key, now);
    if (queuedAt.size > 16) {
      const oldest = queuedAt.keys().next();
      if (!oldest.done) queuedAt.delete(oldest.value);
    }
  }
  console.log(`[mc-voice] ${event} ${clip.key} ${clip.engine} +${now - at}ms${detail ? ' ' + detail : ''}`);
}

/** Until a clip reports its own length: about 70 ms per character of speech. */
export function estimateSpeechSec(text: string): number {
  return Math.max(1, text.length * 0.07);
}

/** The cue for a reaction, by kind and strength (0..1). Heckles and silence carry no sound: the MC's card does the work. */
export function cueFor(kind: ReactionKind, strength: number): SoundId | null {
  switch (kind) {
    case 'laugh':
      return strength < 0.35 ? 'laugh-small' : strength < 0.7 ? 'laugh-medium' : 'laugh-big';
    case 'applause':
      return strength < 0.5 ? 'applause-small' : 'applause-big';
    case 'snap':
      return 'snaps';
    case 'cheer':
      return 'cheer-big';
    case 'murmur':
      return 'murmur';
    default:
      return null;
  }
}

/** A Metro media asset as react-native-video wants it: a `{ uri }` with the asset id on native or the served URL on web. */
export function mediaUri(asset: number | { uri: string }): string {
  return (typeof asset === 'object' && asset !== null ? asset.uri : asset) as unknown as string;
}
