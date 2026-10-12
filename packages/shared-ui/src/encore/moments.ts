import type { MomentFacts, SetAction, SetMoment, SetState } from '@strumble/crowd';

/**
 * MC moments: the engine records where the MC may speak (`state.moments`, with the measured facts) and takes the words
 * back as `mc-line`, or `mc-silent` when the model could not answer. This module is the TV's one view of that contract.
 */
export type MomentAction = Extract<SetAction, { type: 'mc-line' } | { type: 'mc-silent' }>;

export function momentsOf(state: SetState | null): SetMoment[] {
  return state ? state.moments : [];
}

export function momentAction(action: MomentAction): SetAction {
  return action;
}

/** The intro is asked for when OK is pressed, with the facts the engine will record at t = 0. */
export function introFacts(): MomentFacts {
  return { at: 0, landed: 0, candidates: 0, roomReactions: 0, longestDeadAirSec: 0, elapsedSec: 0 };
}
