import { currentSilence, type SetPhase, type SetState } from './engine';
import type { ReactionKind } from './types';

/**
 * What the live crowd should be doing right now, derived only from the engine's measured state: the renderer (the 3D
 * crowd on the TV, the browser prototype) turns these numbers into posture, faces and sound, adding only its own seeded
 * per-person variation. Nothing here is random and nothing is invented: every value traces back to the performer's
 * voice timing, the reactions the engine decided and the venue's own patience.
 */

/** How long each kind keeps moving the room after the venue's hold ends (seconds): laughs trail off, heckles linger. */
export const REACTION_TAIL_SEC: Record<ReactionKind, number> = {
  laugh: 1.2,
  applause: 1.5,
  cheer: 1.8,
  snap: 0.4,
  murmur: 2.5,
  heckle: 3,
  silence: 0,
};

/** A reaction reaches full strength this long after it starts (a room never laughs as one on the same frame). */
export const REACTION_RISE_SEC = 0.25;

/** A landed reaction keeps the room warmer for this long, fading linearly. */
export const WARMTH_SEC = 24;

export interface CrowdReaction {
  /** Index in `state.reactions`: stable for the set, so the renderer can keep one animation per reaction. */
  id: number;
  kind: ReactionKind;
  /** 0..1, as the engine decided it (already scaled by the venue's size). */
  strength: number;
  /** Seconds since it started. */
  age: number;
  /** 0..1: strength shaped by a quick rise, the venue's hold and the kind's tail. */
  level: number;
  lineId?: number;
}

export interface CrowdDrive {
  phase: SetPhase;
  /** Seconds since t = 0, at which this drive was computed. */
  now: number;
  speaking: boolean;
  /** Seconds since the performer last spoke; 0 while speaking. */
  silenceSec: number;
  /** 0..1: how far the silence has run past the room's patience (0 until it runs out, 1 at twice the patience). */
  restless: number;
  /** 0..1: recent landed reactions, weighted by strength and fading over WARMTH_SEC. */
  warmth: number;
  /** 0..1: how locked-in the room is (lean, gaze on the stage, stillness). */
  attention: number;
  /** Bits in a row that got nothing: the room's patience with the act as a whole. */
  deadBits: number;
  /** Reactions still moving the room, oldest first. */
  reactions: CrowdReaction[];
  /** The newest heckle while it is still moving the room (the TV's heckle card and the heckler's seat). */
  heckle: CrowdReaction | null;
  /** After the set: the closing reaction, sized by how much of the set the room actually reacted to. */
  finale: { strength: number } | null;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function isPositive(state: SetState, kind: ReactionKind): boolean {
  return kind === state.pack.reaction.kind || kind === 'cheer' || kind === 'applause';
}

/** The envelope of one reaction at `age` seconds: rise, hold for the venue's hold, fall over the kind's tail. */
export function reactionLevel(kind: ReactionKind, strength: number, age: number, holdSec: number): number {
  if (age < 0) return 0;
  const tail = REACTION_TAIL_SEC[kind];
  if (age < REACTION_RISE_SEC) return strength * (age / REACTION_RISE_SEC);
  if (age <= holdSec) return strength;
  if (tail <= 0 || age >= holdSec + tail) return 0;
  return strength * (1 - (age - holdSec) / tail);
}

/**
 * The crowd drive at `now` (seconds since t = 0; defaults to the engine's own clock). Pass a smoother clock from the
 * render loop to animate between the engine's 10 Hz ticks: the drive only reads state, so any `now` at or after the
 * state's is safe.
 */
export function crowdDrive(state: SetState, now: number = state.now): CrowdDrive {
  const holdSec = state.venue.reactionHoldMs / 1000;
  const live = state.phase === 'live';
  // The same silence the murmur and the ledger measure (engine `currentSilence`).
  const silenceSec = currentSilence(state, now);
  const patience = state.venue.patienceSec;
  const restless = live && state.lines.length > 0 ? clamp01((silenceSec - patience) / patience) : 0;

  const reactions: CrowdReaction[] = [];
  let warmth = 0;
  let positive = 0;
  state.reactions.forEach((r, id) => {
    const age = now - r.at;
    if (isPositive(state, r.kind)) {
      positive++;
      if (age >= 0 && age < WARMTH_SEC) warmth += r.strength * (1 - age / WARMTH_SEC);
    }
    const level = reactionLevel(r.kind, r.strength, age, holdSec);
    if (level > 0 || (age >= 0 && age < REACTION_RISE_SEC)) {
      reactions.push({ id, kind: r.kind, strength: r.strength, age, level, lineId: r.lineId });
    }
  });
  warmth = clamp01(warmth);

  let heckle: CrowdReaction | null = null;
  for (const r of reactions) if (r.kind === 'heckle') heckle = r;

  const attention = live
    ? clamp01(0.55 + 0.35 * warmth - 0.5 * restless + (state.speaking ? 0.1 : 0) - 0.08 * state.deadBits)
    : state.phase === 'armed'
      ? 0.5
      : clamp01(0.4 + 0.4 * warmth);

  let finale: CrowdDrive['finale'] = null;
  if (state.phase === 'done') {
    // Share of the set's lines the room reacted to positively: a quiet night gets a polite finish, not an ovation.
    const lines = Math.max(1, state.lines.length);
    finale = { strength: clamp01(0.15 + 0.85 * Math.min(1, positive / (lines * 0.35))) };
  }

  return {
    phase: state.phase,
    now,
    speaking: state.speaking,
    silenceSec,
    restless,
    warmth,
    attention,
    deadBits: state.deadBits,
    reactions,
    heckle,
    finale,
  };
}
