import type { ActId, LineEvent, PersonaId, PitchSample, VenueId, WordsMode } from './types';

/**
 * TV ↔ phone messages over couch-link (`send(to, data)`; the relay caps a payload at 256 KB).
 *
 * The PHONE is the timing master: it stamps every event on its own audio clock as seconds since
 * the set started, and reports once, in `started`, when that start happened on the relay clock
 * (couch-link `serverNow()`), so the TV can align its clock. No audio ever leaves the phone;
 * words leave it only when the performer has words on, and the TV says so on screen.
 */
export type TvMessage =
  /** Shown on the phone while nothing is live. */
  | { type: 'idle'; message: string }
  /** Go live. The phone starts listening at `startAt` (relay clock, ms) or at once if that is past. */
  | { type: 'arm'; setId: string; act: ActId; venue: VenueId; persona: PersonaId; durationSec: number; startAt: number }
  | { type: 'stop'; setId: string }
  /**
   * The TV is about to make sound (a crowd cue or the MC's voice) until `untilMs` on the relay clock. The phone ignores
   * its microphone until then plus a short tail, so the room's own laughter or the MC never counts as the performer.
   */
  | { type: 'hush'; setId: string; untilMs: number }
  /** Green room: capture one utterance (speech recogniser, or typed on the phone when words are off). */
  | { type: 'listen'; promptId: string; maxSec: number }
  | { type: 'cancelListen'; promptId: string };

export type PhoneMessage =
  /** Microphone state. `words` says how (and whether) the phone turns speech into text. */
  | { type: 'mic'; ready: boolean; reason?: string; words: WordsMode }
  /** The performer switched words on or off from the phone. */
  | { type: 'words'; mode: WordsMode }
  /** The set is live. `startedAt` is the relay-clock time of t = 0. */
  | { type: 'started'; setId: string; startedAt: number }
  /** Voice activity changed: the performer started or stopped speaking. `at` is seconds since t = 0. */
  | { type: 'voice'; setId: string; at: number; speaking: boolean; level: number }
  /** A phrase ended. Sent the moment the phone decides the line is over (about 300 ms after the last voice). */
  | { type: 'line'; setId: string; line: LineEvent }
  /** Words recognised late for an earlier line (recognisers lag): patch, never a new line. */
  | { type: 'words-for'; setId: string; lineId: number; words: number; text: string; fillers: string[] }
  /** Singing: batched pitch readings, about four batches a second. */
  | { type: 'pitch'; setId: string; samples: PitchSample[] }
  /** The phone stopped listening (clock ran out, or the TV sent stop). */
  | { type: 'finished'; setId: string; at: number }
  /** Green room: what the performer said (null when nothing was recognised or the prompt timed out). */
  | { type: 'said'; promptId: string; text: string | null };
