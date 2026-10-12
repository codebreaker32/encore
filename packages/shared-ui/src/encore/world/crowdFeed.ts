import { useEffect, useRef } from 'react';
import { crowdDrive, type ActId, type CrowdDrive, type SetState, type ShotKind, type VenueId } from '@strumble/crowd';
import { cueFor, type SoundId } from './sounds';

/** What the room is doing: arriving before the set (the bill), the set itself, or emptying after it. */
export type CrowdMode = 'preview' | 'live' | 'after';

/**
 * The messages the TV sends the live 3D crowd page (prototypes/crowd3d, `?host=1`): the mode and venue, the camera on
 * every cut, the crowd drive on every engine tick (about 10 Hz), and the room's sound. The page animates between
 * drives on its own clock and plays the cues from one sprite in time with the faces; the TV still picks each cue
 * (`cueFor`) and still hushes the phone for it.
 */
export type CrowdMessage =
  | { type: 'mode'; mode: CrowdMode }
  | { type: 'venue'; venue: VenueId; act: ActId }
  | { type: 'shot'; kind: ShotKind; focus?: number }
  | { type: 'drive'; drive: CrowdDrive }
  /** A reaction's sound starts: gain from its strength, then it follows the drive's level for that reaction. */
  | { type: 'cue'; id: SoundId; strength: number }
  /** The MC is speaking: the page ducks the room about 10 dB, and lifts it when the voice ends. */
  | { type: 'duck'; on: boolean }
  /** Snapshot the frame now (the cut has settled) and send it back as a `thumb` under this key. */
  | { type: 'snap'; key: string };

/**
 * What the page reports back: `ready` once its scene can take messages, `stats` every 2 s (frame time and load),
 * `audio` when its sound starts, is held by an autoplay policy, or cannot play.
 */
export type CrowdReport =
  /** `view`: the page's viewport, density and canvas size, logged once so a mis-fitted stage shows in logcat. */
  | { type: 'ready'; view?: string }
  | { type: 'stats'; fps: number; ms: number; calls: number; tris: number }
  | { type: 'audio'; state: 'running' | 'suspended' | 'unavailable' }
  /** A frame of this set's room, as a small JPEG data URI, for the cut sheet's strip. */
  | { type: 'thumb'; key: string; uri: string };

export function parseReport(data: unknown): CrowdReport | null {
  let msg: unknown = data;
  if (typeof data === 'string') {
    try {
      msg = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const m = msg as { type?: unknown } | null;
  if (!m || typeof m !== 'object') return null;
  return m.type === 'ready' || m.type === 'stats' || m.type === 'audio' || m.type === 'thumb'
    ? (m as CrowdReport)
    : null;
}

/** A cut is snapshotted this long after it starts, when the camera has settled and a reaction is under way. */
const SNAP_AFTER_MS = 700;

/** The key of a snapshot: the set and the time its shot started (seconds since t = 0). */
export function thumbKey(setId: string, from: number): string {
  return `${setId}@${from.toFixed(2)}`;
}

/** The snapshots of one set, by the time their shot started, oldest first. */
export function thumbsOf(thumbs: Record<string, string>, setId: string): { at: number; uri: string }[] {
  const out: { at: number; uri: string }[] = [];
  for (const key of Object.keys(thumbs)) {
    const i = key.lastIndexOf('@');
    if (i > 0 && key.slice(0, i) === setId) out.push({ at: Number(key.slice(i + 1)), uri: thumbs[key] });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The reaction a reaction shot cuts to, by its index in `state.reactions` (the page picks the seats that reacted). */
function focusOf(state: SetState): number | undefined {
  const r = state.shot.reaction;
  if (!r) return undefined;
  const i = state.reactions.indexOf(r);
  return i >= 0 ? i : undefined;
}

/** Where the stage is and what it shows: `state` is the set on screen (null on the bill). */
export interface CrowdScene {
  mode: CrowdMode;
  venue: VenueId;
  act: ActId;
  state: SetState | null;
  /** The MC's voice is playing. */
  duck: boolean;
}

/**
 * Feeds the page while `ready`: the mode and venue when they (or readiness) change, the shot on each cut and the drive
 * on each new engine state while a set is on screen. `epoch` changes when the page reloads or says `ready` again, so
 * it gets everything afresh.
 */
export function useCrowdFeed(
  scene: CrowdScene,
  ready: boolean,
  epoch: number,
  post: (msg: CrowdMessage) => void,
): void {
  const { mode, venue, act, state } = scene;
  useEffect(() => {
    if (ready) post({ type: 'mode', mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, epoch, mode]);
  useEffect(() => {
    if (ready) post({ type: 'venue', venue, act });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, epoch, venue, act]);
  const shotKey = state ? `${state.config.setId}:${state.shot.kind}:${state.shot.from}` : '';
  useEffect(() => {
    if (!ready || !state) return undefined;
    post({ type: 'shot', kind: state.shot.kind, focus: focusOf(state) });
    if (mode !== 'live' || state.shot.kind === 'card') return undefined;
    // Once the camera has settled on the cut, ask for a frame of it: the cut sheet shows this set's own room.
    const key = thumbKey(state.config.setId, state.shot.from);
    const t = setTimeout(() => post({ type: 'snap', key }), SNAP_AFTER_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, epoch, shotKey]);
  useEffect(() => {
    if (ready && state) post({ type: 'drive', drive: crowdDrive(state) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, epoch, state]);
  useEffect(() => {
    if (ready) post({ type: 'duck', on: scene.duck });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, epoch, scene.duck]);
  // One cue per new reaction during the set. Reactions already there when the page became ready (or when this set
  // first came on screen) are not replayed.
  const heard = useRef<{ setId: string; count: number } | null>(null);
  const count = state ? state.reactions.length : 0;
  useEffect(() => {
    if (!state) return;
    const setId = state.config.setId;
    const was = heard.current;
    if (!ready || !was || was.setId !== setId) {
      heard.current = { setId, count };
      return;
    }
    if (mode === 'live') {
      for (let i = was.count; i < count; i++) {
        const r = state.reactions[i];
        const id = cueFor(r.kind, r.strength);
        if (id) post({ type: 'cue', id, strength: r.strength });
      }
    }
    heard.current = { setId, count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, count, state ? state.config.setId : '']);
}
