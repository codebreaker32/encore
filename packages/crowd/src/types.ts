/**
 * Encore: shared vocabulary for the phone, the TV and the MC service.
 *
 * Everything here must stay ES2020-safe (Hermes on Vega) and compile under TypeScript 4.8
 * (apps/vega) as well as 5.x. No `satisfies`, no `const` type parameters, no Node or DOM types.
 */

export type ActId = 'standup' | 'singing' | 'poetry' | 'speech';
export type VenueId = 'openmic' | 'club' | 'theatre' | 'arena';
export type PersonaId = 'warm' | 'sarcastic' | 'strict' | 'deadpan';

export const ACT_IDS: ActId[] = ['standup', 'singing', 'poetry', 'speech'];
export const VENUE_IDS: VenueId[] = ['openmic', 'club', 'theatre', 'arena'];
export const PERSONA_IDS: PersonaId[] = ['warm', 'sarcastic', 'strict', 'deadpan'];

/**
 * What a room can do. `laugh`, `snap`, `applause` and `cheer` are the act's positive reaction
 * (one per act pack); `murmur` is the room losing patience; `heckle` is a line thrown from the
 * floor (tough venues only); `silence` is a held wide shot after a line that did not land.
 */
export type ReactionKind = 'laugh' | 'snap' | 'applause' | 'cheer' | 'murmur' | 'heckle' | 'silence';

/** How the phone turned words into text, so the TV can say so on screen. */
export type WordsMode = 'off' | 'local' | 'service';

/**
 * One spoken phrase as the phone heard it. All times are seconds since the set started, on the
 * phone's audio clock (the phone is the timing master). Levels are RMS in 0..1.
 */
export interface LineEvent {
  /** Increasing per set, starting at 1. */
  id: number;
  t0: number;
  t1: number;
  /** Mean level over the whole line. */
  level: number;
  /** Mean level over the last 400 ms: emphasis at the end of the line. */
  endLevel: number;
  peakLevel: number;
  /** Silence before this line began (seconds); 0 for the first line. */
  pauseBefore: number;
  /** From the speech recogniser; absent when words are off or nothing was recognised for this line. */
  words?: number;
  text?: string;
  /** Filler words recognised in this line, lower-cased ("um", "like", "basically"). */
  fillers?: string[];
  /**
   * True when `text` is the recogniser's interim guess, sent with the line so the room can judge the words at the
   * beat; the final words follow as `words-for` and replace it. Absent when the text is final (or there is none).
   */
  interim?: boolean;
}

/** A pitch reading for singing: ~10 per second. `midi` is fractional (69 = A4); null when unvoiced. */
export interface PitchSample {
  t: number;
  midi: number | null;
  /** 0..1 from the pitch tracker; readings under the tracker's clarity gate come through as null. */
  clarity: number;
  level: number;
}

export interface SetConfig {
  setId: string;
  act: ActId;
  venue: VenueId;
  persona: PersonaId;
  /** The slot length; the set ends on OK or when the clock runs out. */
  durationSec: number;
  /** Display name of the person at the mic (from the phone's couch-link seat). */
  performer: string;
  /** Whether the phone is sending words (the performer can switch it off). */
  words: WordsMode;
  /**
   * Whether the TV asks the MC service's model for one content estimate per line (`kind: judge`) while words are on.
   * When true the room waits up to JUDGE_DEADLINE_SEC after a line for it; absent or false, it never waits.
   */
  judge?: boolean;
}

/** A plate is a photographic shot the TV can show; ids are resolved to images by the TV app. */
export type PlateId = string;

export interface Venue {
  id: VenueId;
  /** Tier name shown after the house name: "Comedy Club". */
  name: string;
  /** The named room: "The Basement". */
  house: string;
  seats: number;
  /** One line about how this room behaves, in the picker and on the title card. */
  blurb: string;
  /** Landing score (0..1) a line needs before this room reacts. Higher is tougher. */
  threshold: number;
  /** Dead air the room tolerates before it murmurs. */
  patienceSec: number;
  /** Heckle after this many bits in a row that got nothing; 0 = this room never heckles. */
  hecklesAfterDeadBits: number;
  /** How long the director holds a reaction shot. */
  reactionHoldMs: number;
  plates: {
    wide: PlateId[];
    reaction: PlateId[];
    finale: PlateId[];
  };
}

export interface ActPack {
  id: ActId;
  name: string;
  /** What a landed line earns in this act: the kind, the noun ("laugh") and the verb ("laughed"). */
  reaction: { kind: 'laugh' | 'snap' | 'applause' | 'cheer'; noun: string; plural: string; verb: string };
  /** What one performance is called: "set", "song", "piece", "talk". */
  unit: string;
  defaultDurationSec: number;
  /** Lines the MC can use between bits and as heckles, per persona, when the model is unavailable. */
  venues: Venue[];
  /** Short, honest explanation of what the room listens for in this act, shown on the bill. */
  listensFor: string;
}

/**
 * What the room listens for in the words (or, for singing, the pitch), beyond timing. Each is a deterministic pattern
 * (packages/crowd/src/content.ts), never an opinion:
 * - stand-up: `callback` (a word back from an earlier bit), `wordplay` (homophones, or the punch turning a word from its
 *   setup), `triad`, `reversal` ("turns out", "but"), `tag` (a follow-up on the last laugh's topic), `specific` (a number
 *   or a name);
 * - poetry: `endRhyme`, `internalRhyme`, `alliteration`, `meter` (steady syllables), `anaphora` (a repeated opening),
 *   `volta` (a turn);
 * - speech: `triad`, `anaphora`, `contrast` ("not ... but"), `question`, `callToAction`, `quotable` (a short line after a
 *   long one);
 * - singing (pitch): `heldNote`, `finalNote`, `range`.
 */
export type ContentFeature =
  | 'callback'
  | 'wordplay'
  | 'triad'
  | 'reversal'
  | 'tag'
  | 'specific'
  | 'endRhyme'
  | 'internalRhyme'
  | 'alliteration'
  | 'meter'
  | 'anaphora'
  | 'volta'
  | 'contrast'
  | 'question'
  | 'callToAction'
  | 'quotable'
  | 'heldNote'
  | 'finalNote'
  | 'range';

/** What the room did, when, and why (the why is shown on the cut sheet, so keep it measurable). */
export interface Reaction {
  kind: ReactionKind;
  /** Seconds since the set started. */
  at: number;
  /** 0..1, scaled by the venue's size. */
  strength: number;
  lineId?: number;
  /** Measured reason, e.g. "0.8 s beat after a 2.1 s line, louder at the end". */
  why: string;
  /** Text for heckles and cards. */
  text?: string;
  /** The content features the line showed (words on), strongest first; absent when none or not measured. */
  features?: ContentFeature[];
  /** The MC model's content estimate for the line (0..1) when it arrived in time; absent otherwise. An estimate. */
  judge?: number;
}

/**
 * What the words (or, for singing, the pitch) showed across the set. Counts are lines, over every line whose words
 * arrived (the final words, not only those the room had at the beat). `null` on the scorecard means not measured.
 */
export interface ContentMeasures {
  /** Lines whose words were checked (singing: phrases). */
  lines: number;
  /** Lines showing each feature this act listens for, e.g. { callback: 2, triad: 1 }; a listed 0 is a measured zero. */
  features: Partial<Record<ContentFeature, number>>;
  /** Poetry: line ends that rhyme with one of the two before, of the line ends checked; null for other acts. */
  rhymedEnds: { rhymed: number; of: number } | null;
  /** Singing: semitones between the lowest and highest notes held; null for other acts or under two held notes. */
  rangeSemitones: number | null;
  /**
   * The MC model's estimates (an opinion of the words, not a measurement): candidate lines it judged in time, ones it
   * missed (too late, or the service could not answer), ones decided before it answered because the next line began
   * (`early`: the performer went on, nothing was late), and the mean estimate of those in time. null when not used.
   */
  judge: { inTime: number; missed: number; early: number; meanScore: number | null } | null;
}

/**
 * The difficulty-independent ledger. Everything is measured; `null` means "not measured" (words
 * off, or the act has no pitch). Nothing here depends on the venue: `landed` counts lines that
 * cleared the house standard, not the lines this particular room reacted to.
 */
export interface Scorecard {
  act: ActId;
  venue: VenueId;
  durationSec: number;
  /** Lines that cleared the house standard. */
  landed: number;
  /** Lines that were candidates (ended with a beat). */
  candidates: number;
  /** `landed` per minute of the set; the headline number. */
  landedPerMin: number;
  /** What this room actually gave (depends on the venue; shown as the room's count, never as the score). */
  roomReactions: number;
  longestDeadAirSec: number;
  longestDeadAirAt: number | null;
  /** Words per minute over spoken time; null when words are off. */
  wpm: number | null;
  /** Peak pace over any 20 s window; null when words are off. */
  peakWpm: number | null;
  fillers: { count: number; top: { word: string; n: number }[] } | null;
  /** Singing only: share of voiced time within 25 cents of a semitone. */
  inTunePct: number | null;
  longestHoldSec: number | null;
  /** Lines the detector could not judge (too quiet, too short); never counted against the performer. */
  unsure: number;
  /**
   * What the words showed (stand-up, poetry, speech with words on) or the pitch (singing). null when not measured
   * (words off); absent on records from before content judging.
   */
  content?: ContentMeasures | null;
}

/** One of the room's moments, kept on a `SetRecord` so the MC can say "the landlord line at 0:08". */
export interface RecordedReaction {
  kind: ReactionKind;
  /** Seconds since the set started. */
  at: number;
  strength: number;
  lineId?: number;
  /** The line's key word when words were on ("landlord"). */
  word?: string;
  /** The content features the line showed, when words were on ("callback"). */
  features?: ContentFeature[];
}

/** One past set, kept on the TV for the MC's memory and the green-room ledger. Newest last. */
export interface SetRecord {
  setId: string;
  /** ISO date-time of the set's end. */
  endedAt: string;
  act: ActId;
  venue: VenueId;
  persona: PersonaId;
  performer: string;
  scorecard: Scorecard;
  /** One measured sentence about the set, for the ledger: "bit 3 went quiet at 196 wpm". */
  summary: string;
  /** What the room did and when (optional: records from before this field was added lack it). */
  reactions?: RecordedReaction[];
}

/** What the MC says after a set. Opinions are labelled as opinions on screen. */
export interface McNote {
  /** The verdict in the MC's voice, 60 chars max. */
  headline: string;
  /** The in-character line, 180 chars max, quoting the measured numbers. */
  line: string;
  /** The one thing to fix, concrete and measurable. */
  fix: string;
  /** What the MC says out loud: up to four short sentences written for the ear (numbers in words, no clock times). */
  spoken: string;
  /** The MC's suggestion for the next venue. */
  next: 'again' | 'up' | 'down';
  /** Every MC word is written by the model; there are no template or rule-based lines anywhere. */
  source: 'ai';
  /** The `spoken` text in the persona's voice, when the request asked for it. */
  audio?: McAudio;
}

/** A green-room exchange. */
export interface McReply {
  text: string;
  spoken: string;
  source: 'ai';
  audio?: McAudio;
}

/**
 * A moment in the set where the MC speaks on a title card. The engine records the moment with its measured facts; the
 * TV asks the MC service for the words and hands them back to the engine. No text exists until the model writes it,
 * and a moment whose words do not arrive in time simply passes without a card.
 */
export type McMoment = 'intro' | 'between' | 'heckle' | 'end';

/** What the MC may know at a moment: measured facts only. */
export interface MomentFacts {
  /** Seconds since t = 0 when the moment happened (0 for the intro). */
  at: number;
  /** 1-based number of the bit that just closed (between, heckle). */
  bit?: number;
  /** Positive reactions the room gave in that bit (between). */
  bitReactions?: number;
  /** Bits in a row that got nothing (heckle). */
  deadBits?: number;
  /** The set so far, measured at the moment. */
  landed: number;
  candidates: number;
  roomReactions: number;
  longestDeadAirSec: number;
  elapsedSec: number;
}

/** A moment the engine has recorded, waiting for (or past) its words. */
export interface SetMoment {
  /** Increasing per set, starting at 1. */
  id: number;
  kind: McMoment;
  facts: MomentFacts;
}

/**
 * The MC's voice: Amazon Polly reads the `spoken` text (or a line's `text`) in the persona's voice. Requests ask for it
 * with `speak: true`. Audio is optional: when signing fails the words still arrive, silently.
 *
 * The service signs a Polly request instead of synthesising, so the words never wait for the voice: the TV fetches the
 * URL and Polly streams the MP3 as it speaks (HTTP 200, audio/mpeg, chunked). It is a URL rather than inline audio
 * because neither TV player opens `data:` (react-native-video on Android, w3cmedia on Vega), and Vega only opens HTTPS.
 */
export interface McAudio {
  format: 'mp3';
  /** A presigned Polly SynthesizeSpeech GET URL (HTTPS, valid for 600 s). It carries a signature: never log it. */
  url: string;
  /** The same words on the neural engine, when `url` is a premium engine: the TV tries it once if `url` fails or stalls. */
  fallbackUrl?: string;
  /** The Polly voice used, shown in the credits ("voice: Amazon Polly, Kajal"). */
  voice: string;
  /** The engine behind `url`. Long-form takes longest to start, so the TV waits longer before it falls back. */
  engine: 'neural' | 'generative' | 'long-form';
}

/** POST /invocations with kind 'line': the words for one moment's title card. */
export interface McLineRequest {
  kind: 'line';
  moment: McMoment;
  persona: PersonaId;
  performer: string;
  act: ActId;
  venue: VenueId;
  durationSec: number;
  facts: MomentFacts;
  /** The performer's last sets, newest last, at most six. */
  history: SetRecord[];
  /** Ask for the MC's voice as well (Amazon Polly). Debrief and chat requests accept the same flag. */
  speak?: boolean;
}

/** The MC's words for a moment: one short line, 120 characters at most. */
export interface McLine {
  text: string;
  source: 'ai';
  audio?: McAudio;
}

/** The acts whose lines the model judge reads (singing is judged by its pitch only). */
export type JudgeAct = 'standup' | 'poetry' | 'speech';

/**
 * POST /invocations with kind 'judge': one model estimate of a line's words, asked by the TV as soon as the line has
 * text (words on only). The room waits for the answer at most JUDGE_DEADLINE_SEC after the line ends.
 */
export interface JudgeRequest {
  kind: 'judge';
  act: JudgeAct;
  lineId: number;
  /** The line as the recogniser heard it (possibly its interim guess). */
  text: string;
  /** Up to three earlier lines, oldest first: the setup. */
  context: string[];
}

/**
 * The model's estimate for one line: an opinion of the words, labelled as an estimate on screen, never a measurement.
 * `dims` by act: stand-up punch, surprise (and `humor`, the CPU humour model's percentile, when it answered); poetry
 * imagery, sound, turn; speech point, rhetoric, call. `score`: for stand-up a percentile among held-out Reddit jokes
 * (0.7 humour model + 0.3 LLM; 0.5 is a typical joke), for poetry and speech the rubric's weighted mean
 * (services/mc-agent judge.py). The engine weighs it above the act's JUDGE_FLOOR.
 */
export interface JudgeVerdict {
  lineId: number;
  act: JudgeAct;
  score: number;
  dims: Record<string, number>;
  /** A few of the model's words, no numbers. */
  reason?: string;
  model: string;
  /** How long the judge took on the service. */
  ms: number;
  source: 'ai';
}

/** Why the MC could not answer. The screen says so in plain words instead of showing a substitute line. */
export type McUnavailableReason = 'timeout' | 'model-error' | 'rejected' | 'no-credentials' | 'unreachable';

export interface McUnavailable {
  reason: McUnavailableReason;
  detail?: string;
}

/**
 * Every MC service response is exactly one of these: `{ note }` for a debrief, `{ reply }` for a green-room question,
 * `{ line }` for a moment, `{ verdict }` for a line's content estimate, or `{ unavailable }` when the model could not
 * answer in time or its answer was rejected.
 */
export type McResponse =
  | { note: McNote }
  | { reply: McReply }
  | { line: McLine }
  | { verdict: JudgeVerdict }
  | { unavailable: McUnavailable };
