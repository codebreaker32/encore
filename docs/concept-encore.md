# Encore: concept and build spec

Written 2026-10-10 for the Build, Ship, Shape: Amazon Developer Hackathon (Fire TV track; AWS Builder and Open Source mini-challenges). Submission due **2026-10-23 12:00 PT**. Supersedes `docs/concept-strumble.md`; the decision trail is in `docs/ideas-round2.md`.

## The product in one paragraph

Encore turns the living-room TV into a live audience. Your phone lies on the table and listens; the TV is the director of your own comedy special, cutting to a real room that laughs, snaps, applauds or cheers only when your timing earns it, and sits in a silent wide shot when it does not. You choose an act (stand-up, poetry, speech, singing), a venue (Open Mic, Comedy Club, Theatre, Arena: a tougher room each time) and an MC with a personality (warm, sarcastic, strict, deadpan) who introduces you, throws the heckles, debriefs you in character and remembers your last six sets. Afterwards the cut sheet shows the set as an edit timeline with the measured numbers beneath. The room is theatre; the scorecard never lies: it reports the same numbers at every venue.

Positioning: **A real audience, honestly scored.** Product truth lives in `packages/shared-ui/PRODUCT.md`; the design direction (House-Right Camera) in `packages/shared-ui/.impeccable/surfaces/src-strumble.md`; the approved comps in `docs/mockups/tc-*.png` with sources in `docs/mockups/src/`.

## The show

1. **Tonight's bill** (`tc-picker.png`): the room you will face is live on the left (the venue wide shot with its lower-third), the running order on the right: Act, Venue, MC. Until a phone is on the table, the right column's foot shows the QR code and the 4-letter room code; once a phone's microphone is live it says "Aman's phone is on the table and listening" and "Press OK to go live".
2. **Live** (`tc-perform-club.png`, `tc-perform-theatre.png`, `tc-perform-arena.png`): a one-second title card in the MC's voice ("Please welcome…"), then the venue wide shot, slowly pushing in. Top-left: what the director just did and why, in words ("LAUGH · 0.8 s after your line · the room's third tonight"). Top-right: the red LIVE dot, "mic on · Aman's phone", and how words are handled. Bottom-left: the lower-third (house · tier, thin red rule, set clock). Bottom-right: the bit counter and the running measured line. On a landed line: one black frame, a reaction close-up for about two seconds, one black frame, back to the wide. On dead air: the wide holds; past the room's patience, a murmur caption; in tough rooms, a heckle on a title card. OK ends the set; the clock ends it too (Vega closes idle apps after about five minutes, so every slot is five minutes or less).
3. **Cut sheet** (`tc-cutsheet.png`): the set as a strip of shots (wide, gold reaction cuts, striped dead air), the ledger "measured, not judged", and the MC's note in character with the one fix, labelled as spoken by the MC and written from the measured set. OK goes again at the next venue up; Back opens the green room.
4. **Green room** (`tc-greenroom.png`): between sets with the MC. The last exchange small above, the MC's current line in title-card type, "Hold OK to talk" (press OK, the phone listens for one utterance, the MC answers), the sets ledger (laughs per minute per set) and "Next up".

## Acts in v1

| Act | Unit | The room gives | What the room listens for (all measurable on the phone) | Scorecard |
|---|---|---|---|---|
| Stand-up | set | laughs | a beat left after a line, a short line after a longer one (setup → punch), emphasis at the end of the line, no fillers in the line; with words on, also callbacks, wordplay, a list of three, a reversal, a tag, a specific detail | landed per minute, punchlines landed x of y, longest dead air, words per minute (peak), fillers, content patterns (e.g. "callbacks 2") |
| Poetry / spoken word | piece | snaps | held beats, short lines, steady pace, no fillers; with words on, also end and internal rhyme, alliteration, a steady meter, a repeated opening, a turn; the room otherwise stays silent ("the house is listening") | landed per minute, longest silence held, pace, fillers, line ends that rhyme (x of y) |
| Speech / pitch / toast | talk | applause | emphasis plus a beat at the end of a point, pace inside 120–160 wpm, no fillers; with words on, also a triad, a repeated opening, a contrast, a question, a call to action, a short line after a long one | landed per minute, dead air, pace (and peak), fillers, content patterns (e.g. "triads 1") |
| Singing | song | cheers | notes held in tune, clean phrase endings, a long held note, an ending on a held note, range; off-pitch wobbles get silence | in-tune %, longest hold, landed phrases per minute, range in semitones, held notes |

The room hears timing first: pace, emphasis and the beat you leave, which is what a real room reacts to first and what the phone measures exactly. With words on it also judges what you say, in two honest tiers (see "Content judging" below): deterministic patterns in the words (a callback, a rhyme, a list of three), and one fast model estimate per line, labelled as an estimate. It still needs the beat: a line without one is never a candidate, whatever it says. What each act listens for is on the bill under the act.

Singing uses the same four venues with different house names and the phone-light plates; the "Shower → Bar → Choir → Opera House" ladder from the product doc is deferred to a later pack.

## Venues (difficulty)

A tougher venue changes the room, never the score. Thresholds are landing scores (see the engine); the house standard used by the scorecard is fixed at 0.55 everywhere.

| Venue | Seats | Threshold | Patience (dead air before a murmur) | Heckles after N dead bits | Reaction hold | Stand-up house | Poetry house | Speech house | Singing house |
|---|---|---|---|---|---|---|---|---|---|
| Open Mic | 30 | 0.42 | 5.0 s | never | 1.8 s | The Back Room | Tuesday Slam | The Meeting Hall | The Pub Mic |
| Comedy Club | 80 | 0.55 | 3.5 s | 2 | 2.0 s | The Basement | The Cellar | The Lecture Room | The Bar Stage |
| Theatre | 800 | 0.66 | 2.5 s | 2 | 2.3 s | The Playhouse | The Studio | The Auditorium | The Concert Hall |
| Arena | 20 000 | 0.75 | 2.0 s | 1 | 2.6 s | The Bowl | The Dome | The Keynote | The Stadium |

Blurbs (shown on the bill when the venue row is focused) say how the room behaves in one sentence, for example the club: "A dark room of eighty who paid to be here. Generous to a good setup, silent to a weak tag. Hecklers after two dead bits."

## Honesty rules (binding on every screen, doc and the video)

1. **The room reacts to what was measured; the ledger reports what was measured.** Every reaction carries a measured `why` and the cut sheet shows it.
2. **A tougher venue changes the crowd, never the score.** `landed` is counted at the house standard, not at the venue's threshold; the room's own count is shown separately as "what this room gave".
3. **"Unsure" is grey and never counts against the performer.** Lines too quiet or too short to judge are `unsure`; words off means `wpm` and `fillers` are null, never zero.
4. **No audio leaves the phone, and the app never sends audio anywhere.** Words leave the phone only when the performer has words on; the TV shows how words are recognised (`local`, `service`, or `off`). On Android Chrome the browser's speech service may use the network; the phone says so when that is the mode in use. With words on, the room also judges what you say, and the TV may send each line's words to the MC service's content judge (a model on Amazon Bedrock); the phone's words toggle and the TV's mode line say so in one line ("the room judges what you say").
5. **The MC is the model or it is silent.** Every MC word (debrief, green-room answer and the intro, between-bit, heckle and closing cards during the set) is written by the model from measured facts. There are no template or rule-based lines. When the model can't answer in time, or the honesty guard rejects its answer, the MC says nothing and the screen states why; the show never waits for it. AI opinions are labelled as opinions.
6. **Nothing is faked for the demo.** No invented laughs, no scripted reactions; the video shows real sets with their real numbers, including the moments that died.
7. **Content is original or licensed.** Photos per `packages/shared-ui/src/assets/plates/CREDITS.md`; the three CC BY images carry an on-screen credit on the bill's "credits" line. No song catalogue, no brand names in the video.

## The crowd engine (`packages/crowd`, pure TypeScript, tested)

**Inputs** (from the phone, stamped on the phone's audio clock as seconds since t = 0): `voice` (speaking started/stopped, level), `line` (a phrase ended: t0, t1, mean/end/peak level, pause before, optional words/text/fillers), `words-for` (late words for an earlier line), `pitch` (singing: fractional MIDI, clarity, level at ~10 Hz), `finished`. The TV adds `tick` (now) ten times a second.

**Landing score** for a line, decided 0.5 s after the line ends (voice resuming before that cancels the candidate: the performer did not leave the beat):

- `beat` (stand-up 0.30, poetry 0.45, speech 0.30): binary; the performer held ≥ 0.45 s of silence after the line. The pause that is eventually measured (until the next voice) is recorded as `pauseAfter` for the cut sheet.
- `shape` (0.10): duration 0.6–6 s and (when words are on) 2–25 words. A line outside that range scores 0 and serves only as the next line's setup ("a setup, not a punch").
- `setupPunch` (stand-up 0.25, poetry 0, speech 0.05): the previous line was ≥ 1.3× longer than this one AND this line is ≤ 2.5 s.
- `emphasis` (stand-up 0.25, poetry 0.20, speech 0.45): `endLevel / level ≥ 1.1`, or the end level is within 80 % of the peak and above the mean.
- `clean` (stand-up 0.10, poetry 0.25, speech 0.10): no fillers in the line; awarded at half weight when the line could not be checked (words off, or no words arrived for it).

The weights were rebalanced on 2026-10-10 from the first draft (0.35/0.10/0.20/0.20/0.15) so that a flowing, clean, flat line scores 0.50 and does not land at the house standard. Lines with `level` under the noise gate or shorter than 0.4 s are `unsure` and never candidates.

**Content judging** (`packages/crowd/src/content.ts`, decided 2026-10-12: "enhance judging criteria, like jokes, poetry etc. that trigger laughter or applause"). With words on, a candidate's landing score also counts what was said, in two tiers. Content only ever adds (a joke the patterns miss costs nothing), it is capped at `CONTENT_CAP` (0.30; singing 0.20) so timing stays the larger part, it needs the line's words to be in when the room decides, and a line still needs its beat and its shape to score at all. With words off the score is timing only, exactly as above, and the ledger says content was not measured.

- **Tier 1, deterministic patterns** (pure, instant, tested; ASCII spelling rules, no dictionary). Weights per act:
  - Stand-up: `callback` 0.15 (a distinctive word, not one of the few hundred commonest, back from an earlier bit at least 15 s ago, and not the current bit's topic); `wordplay` 0.10 (a homophone pair across setup and punch, or the punch ending on a word from its setup: "by winter" … "which winter"); `triad` 0.10 (a punctuated list of three, "a and b and c", a phrase three times, or the third line in a row with the same opening); `reversal` 0.08 ("turns out", "only to", "not … but", or "but"/"until"/"instead" in the first half of a punch after a setup); `tag` 0.07 (within 3 s of a laugh, on a word of the laughed line); `specific` 0.05 (a number, or a name capitalised mid-line).
  - Poetry: `endRhyme` 0.15 (the line's last word rhymes with one of the two line ends before, by a spelling-to-sound heuristic: "light"/"bite", "rain"/"plane"; spelling is not sound, so it misses some and accepts eye rhymes); `anaphora` 0.08 (the same opening as the line before); `alliteration` 0.07 (three words on one opening sound); `meter` 0.07 (syllables within 15 % of the two lines before, which agree with each other); `volta` 0.06 (a line opening on "but", "yet", "still" … after three lines); `internalRhyme` 0.05. Assonance was evaluated and left out: English vowel spelling is too far from sound.
  - Speech: `triad` 0.12; `contrast` 0.10 ("not … but", "rather than", "ask not", "it's not … it's"); `anaphora` 0.10; `callToAction` 0.08 ("let's", "imagine", "we must", "it's time" …); `quotable` 0.08 (at most 8 words after a line of at least 12 and twice as long); `question` 0.06 (a "?" or a question opening, then the beat).
  - Singing, from the pitch (measured with words on or off): `heldNote` 0.10 (one in-tune note held 1.5 s), `finalNote` 0.08 (the phrase ends on a note held 1 s at or above its mean level; "a big final note" when it closes the song), `range` 0.05 (held notes spanning 7 semitones). They add to the phrase's hold.
- **Tier 2, one model estimate per line** (the MC service's `kind: judge`, only with words on and `SetConfig.judge`, never for singing). The TV asks as soon as a line has words (`judgeRequests(state)`: the line and up to three earlier lines), the phone sends the recogniser's interim words with the line (`LineEvent.interim`) so that is at once, and the service answers with dims by act (stand-up `punch`, `surprise`; poetry `imagery`, `sound`, `turn`; speech `point`, `rhetoric`, `call`) and one `score`. The LLM (`mistral.ministral-3-8b-instruct`, chosen in `docs/judge-calibration.md`) gets 0.35 s. Poetry's and speech's score is the rubric's weighted mean. Stand-up's is on a percentile scale ("where the line would sit among held-out Reddit jokes", 0.5 a typical one): 0.7 × a CPU humour model (`humor.py`, humor-roberta-large int8, about 25–60 ms, MIT) + 0.3 × the LLM's percentile, with a missed LLM counted as 0.5 and the LLM's percentile alone when the humour model isn't installed. The engine adds `JUDGE_WEIGHT` × the part of the score above the act's `JUDGE_FLOOR`, scaled to 0..1 (weights: stand-up 0.20, poetry and speech 0.15; floors: stand-up 0.70, so only about the top fifth of Reddit jokes count and on our pairs 10 of 20 strong lines but 1 of 20 flat ones, poetry and speech 0.5, the rubric's middle), so a line rated as ordinary, or a typical joke, adds nothing. The room waits for the words and the estimate past the beat until `JUDGE_DEADLINE_SEC` (0.9 s after the line ends), or until `JUDGE_ANSWER_SEC` (0.6 s) after the TV received the line if that is later (the line is on the phone's clock and arrives about 0.3 s after it ends), never past `JUDGE_MAX_WAIT_SEC` (1.4 s); voice resuming decides at once, and that is recorded as `early`, not as the model being late. Content counts only with a pattern of the act's own kind or the estimate above its floor: a specific detail (stand-up) or a steady meter (poetry) supports a line but never lifts it alone, and "the punch turns a word" needs a punch-shaped line. Poetry's timing weights are beat 0.30, shape 0.10, emphasis 0.50, clean 0.10 (a flat line with a beat scores 0.50), and its estimate floor is 0.8. Without an estimate in time it decides on timing and patterns and the why says so ("the MC's model was too late (timing and patterns only)"). A room that waited reacts no sooner than it decided. The model and its agreement with human ratings are in `docs/judge-calibration.md`.
- **The why and the caption.** Every reason is measured or labelled: the why lists the timing clauses, then each pattern found ("a callback to "landlord" from your first bit"), then the model's part as an estimate ("the room heard a punchline (the MC's model, an estimate)"). With a content reason the director's caption names the strongest one first: "LAUGH · a callback to your first bit · 0.6 s beat", "SNAP · "tonight" rhymes · 0.5 s beat", "APPLAUSE · three times "we will" · 0.7 s beat".
- **A tougher venue still changes only the threshold.** Content and the estimate are part of the score, which is the same at every venue (tested).

**Room decision**: a candidate with score ≥ venue threshold earns the act's reaction with strength `(score − threshold) / (1 − threshold)` scaled by the venue's size, at `t1 + 0.4 s + (1 − strength) × 0.5 s`: a strong line gets its laugh fast, a marginal one gets a later, smaller laugh, and the caption quotes that real latency ("LAUGH · 0.8 s after your line"). Reactions need 2 s of breath between them, except a tag: a short line (< 2 s) within 3 s of a reaction gets a bigger one. Dead air counts only after the performer's first word; past the venue's patience it earns a `murmur`. Silence has one definition everywhere (2026-10-12): no line the phone reported, no voice still open, no positive reaction being held (`silences`, `silenceSince`). The live murmur, the 3D room's restlessness, the cut sheet's striped tiles (silences past this room's patience, the number its legend shows), the record's summary and the MC's facts all use it, so the murmur never claims more than the ledger measures. A "voice off" stamped before the voice that is on now is ignored (messages can cross). A bit (a run of lines between two pauses ≥ 2 s, closed off the later of the last line and the last voice) that earns nothing is a dead bit; tough rooms heckle after N dead bits with a line from the MC's persona set; a bit that earned something gets a one-second card in the MC's voice (at most once per 45 s).

**Live angles**: during a long wide the director hard-cuts between the venue's wide plates every 8 s (never within 1.5 s of a pending decision or while a card is queued), so the room reads as a multi-camera broadcast even when nothing happens.

**Director**: shots are `wide` (default, slow push-in over the whole set), `reaction` (on a reaction, held `reactionHoldMs`, entered and left through one black frame), `card` (black title card with one line: intro, between bits, heckle, the end), `finale` (the applause plate when the set ends). The director state is part of the engine state and is advanced by `tick`, so it is unit-testable without React.

**The live crowd** (decided 2026-10-11: no photos, clips or pre-drawn frames for the audience): a 3D room rendered live. It is a Three.js page (`prototypes/crowd3d`) in the TV's system WebView, an iframe in the web preview. Its only input from the set is `crowdDrive(state, now)` (`packages/crowd/src/drive.ts`), posted about ten times a second with the venue and every cut:
- `attention`: a resting base, plus the warmth of recent landed reactions, plus speaking; minus restlessness and dead bits.
- `restless`: silence past the venue's patience, from 0 at the patience to 1 at twice it, and never before the first line.
- `warmth`: landed reactions weighted by strength, fading over 24 s.
- Each live reaction's envelope: a 0.25 s rise, the venue's hold, then a tail by kind.
- The heckle, while it is still moving the room.
- After the set, the finale, sized by the share of lines the room reacted to.

The page adds only seeded per-person variation, such as who laughs first and how far a laugh travels down the rows. So the room is never louder, warmer or quicker than the engine measured. Venue designs: `docs/venues-3d.md`.

**Scorecard** (`Scorecard` in `packages/crowd/src/types.ts`): `landed`, `candidates`, `landedPerMin` at the house standard; `roomReactions` for this venue; `longestDeadAirSec` and where; `wpm` over spoken time and `peakWpm` over any 20 s window (null when words are off); `fillers` count and top three (null when words are off); `inTunePct` and `longestHoldSec` for singing (null otherwise); `unsure`; `content` (null when words are off; singing always): lines heard, the count of lines per pattern over every line's final words, poetry's rhymed line ends ("rhymes 5 of 8 line ends"), singing's range in semitones, and the model judge's lines in time and missed (its scores are estimates, never quoted as measurements). Reactions and records carry each line's `features`, so the MC can say which kinds of lines got the room.

**MC moments**: the engine records a `SetMoment` (intro, between bits, heckle, end) with its measured facts wherever the MC speaks; the TV asks the MC service for the words (`kind: line`, 3.5 s budget) and hands them back as an `mc-line` action. A moment whose words don't arrive within its window passes without a card. (Decided 2026-10-11: no template or rule-based MC lines anywhere.)

## The MC (`services/mc-agent`)

A Strands agent on Amazon Bedrock AgentCore Runtime with structured output, one fresh agent per request, the same pydantic contract as the TypeScript `McNote`, `McReply` and `McLine`. Four request kinds on `POST /invocations`: `debrief` (set summary with scorecard, the lines with whether they landed, the room's reactions, and the last six set records) returns `{note}`; `chat` (green-room question with the same memory) returns `{reply}`; `line` (one moment's measured facts) returns `{line}`, 120 characters at most; `judge` (one line's words and up to three earlier lines, during the set) returns `{verdict}`, the content estimate above, from a fast model in one JSON-mode call within 0.6 s (`judge.py`; `MC_JUDGE_MODEL_ID`, `MC_JUDGE_TIMEOUT_S`). The debrief's facts include the content counts and which kinds of lines got the room's reactions, with their spoken forms. Any failure returns `{unavailable: {reason}}` (timeout, no-credentials, model-error, rejected by the honesty guard, unreachable), and the TV shows the MC as unavailable with that reason; there are no rule-based answers. Timeouts: 3.5 s for moment lines during a set, 8 s for the debrief and chat. Memory is the TV's list of the last six `SetRecord`s (kept in app storage; this is what "remembers your last six sets" means, and the screen says so). The model is GLM-5 (`zai.glm-5`) on Bedrock's OpenAI-compatible endpoint (`MC_PROVIDER=mantle`); Claude runs through `MC_PROVIDER=converse` once the account's Claude access is granted. In production the service runs on AgentCore Runtime under an IAM execution role (credentials rotate automatically); the TV never holds AWS keys and reaches it through AgentCore's inbound authentication or a small public front.

## Architecture

```
phone (apps/companion, Vite + React, HTTPS)         TV (apps/vega → Vega OS; apps/tv-expo → Android TV / web preview)
  mic → VAD → lines (level, beats)                     packages/shared-ui/src/encore: screens, world, director view
  speech recogniser → words, fillers (optional)         packages/crowd: engine (reducer), packs, scorecard, MC moments
  pitch-judge → pitch samples (singing)                 couch-link host; relay clock
        │  couch-link player (events only, never audio)         │
        └──────────── services/relay (ws rooms, clock) ─────────┘
                                                              │ HTTPS, after a set / in the green room
                                                     services/mc-agent (Strands on AgentCore; Bedrock when unlocked)
                                                     act packs JSON on S3 (served at build time in v1; fetched in v1.1)
```

- Protocol: `packages/crowd/src/messages.ts` (`TvMessage`, `PhoneMessage`). The phone is the timing master; `started.startedAt` aligns the TV's relay clock with the phone's t = 0.
- The TV keeps the engine state in a reducer hook (`useSetSession`) exactly as the previous `useTvSession` did: phone messages and ticks go in, the screen renders the state, effects go out over couch-link.
- Plates: `packages/shared-ui/src/assets/plates/*.jpg` (1920×1080, q80, ~9 MB total) and `grain.png`; ids are file names without extension; `plates.ts` maps id → `require`. At most three plates mounted at once (1 GB stick). Video plates: `assets/clips/<venue>-<kind>-<n>.mp4` + poster `.jpg`; a `VideoPlate` plays the clip (react-native-video on Android, a `<video>` element on web, `@amazon-devices/react-native-w3cmedia` on Vega) over its poster and falls back to the poster when playback fails or within 1 s of the cut has not started.
- Fonts: static instances in `packages/shared-ui/src/assets/fonts/` (`BigShouldersDisplay-{Medium,SemiBold,Bold,ExtraBold}`, `AtkinsonHyperlegibleNext-{Regular,Medium,Bold}`), referenced by those family names.
- AWS: Bedrock (model behind the MC), AgentCore Runtime (hosting), Strands (agent), S3 (act packs), CloudWatch budget alarm. Expected spend under $15 of the $200 cap.
- Open source: `couch-link` (phone-as-controller rooms for TVs) and the act-pack format are the contributions.

## Build plan

| # | Stream | Owner | Done when |
|---|---|---|---|
| 1 | `packages/crowd`: packs, venues, landing score, room decision, director, scorecard, MC moments, tests | engine agent | `yarn workspace @strumble/crowd test` green; a scripted stand-up set produces the expected reactions and ledger |
| 2 | Phone: join → mic → on-the-table screen; VAD and lines; words via SpeechRecognition with `processLocally` when available; pitch for singing; green-room listen | phone agent | Playwright with a fake microphone produces `voice`, `line`, `pitch` and `finished` messages against the relay; words path verified on Aman's Android phone |
| 3 | TV: world (tokens, fonts, plates, lower-third, cards), Bill, Live, Cut sheet, Green room, `useSetSession`, MC client, set records | TV agent | matches the comps on Expo web at 1920×1080; typechecks via `@strumble/vega` and `@strumble/tv-expo`; one scripted set runs end to end in the browser |
| 4 | `services/mc-agent`: models, persona prompts, debrief, chat and moment lines, honesty guard, tests | MC agent | `yarn test:agent` green; live answers in character for all four personas |
| 5 | Integration: real phone + relay + TV web; Google TV build; Vega simulator spike (`sudo usermod -aG kvm $USER`, `wsl --shutdown`) | Aman + Claude | a full set on the simulator recorded |
| 6 | A living room (decided 2026-10-10 evening: "go video"): licensed crowd VIDEO clips per venue (`packages/shared-ui/src/assets/clips/`, 720p H.264, poster JPGs) as plates, with the stills as fallback; the director cuts between two live angles every 6–10 s and to a reaction clip from its first frame; crowd audio (`assets/sounds/`, CC0 + one CC BY) played by the TV on each reaction, a stage-light pulse on the cut | clips agent, then TV | reactions play as moving, sounding rooms on the web preview and Android; stills on the simulator if video fails |
| 6b | The live 3D crowd (decided 2026-10-11, replaces the clips of row 6 for the audience): Rocketbox people with live ARKit faces and three detail levels, the four venues of `docs/venues-3d.md`, driven by `crowdDrive`, hosted in the TV's WebView (`world/CrowdStage`) behind `config.crowd3d` | crowd agent, then TV | a steady 30 fps on the Google TV (Mali-G31) at the `tv` preset in a release APK; Vega simulator checked; the plates stay as the fallback until then |
| 7 | Finish: Impeccable finish review, DESIGN.md, raster provenance; README, product feedback, friction log, feature requests; video; Devpost | Aman + Claude | submitted before Oct 23 12:00 PT |

Order: 1–4 in parallel (contracts are fixed in `packages/crowd/src/{types,messages}.ts`), then 5, then 6 if time allows, then 7. Video recorded by Oct 21.

## Demo video (under three minutes)

Cold open on the club wide shot: Aman mid-set, a line, a beat, hard cut to the room laughing. Title. Thirty seconds of pairing and the bill. Ninety seconds of a real set at the club with its real reactions, one dead bit kept in. The cut sheet with the numbers, the MC's note (source shown). Fifteen seconds of the green room. Close on "A real audience, honestly scored" and the AWS/open-source line. Recorded on the Vega simulator, phone on the table in frame.

## Risks

- **Speech recognition on the phone**: Chrome on Android may use Google's service; `processLocally` may be unavailable. Mitigation: the words mode is shown on the TV; words off is a first-class path (timing-only room, pace and fillers reported as not measured).
- **VAD in a living room**: TV sound and other voices. Mitigation: calibrated noise floor at arm time, the phone near the performer, a visible level on the phone.
- **Video on the simulator**: W3C media playback is known to be flaky on the Vega Virtual Device; the poster-still path is the fallback and the video is recorded with whichever path actually plays, stated in the README.
- **Vega simulator on WSL2**: unsupported; mitigation: Google TV build for performance, simulator for the video only; if the simulator fails, ask for help in office hours (Oct 19) and record on Google TV with a clear statement.
- **Bedrock lock**: Claude is locked on the account; the MC runs on GLM-5 through Bedrock's OpenAI-compatible endpoint. If Bedrock is unreachable the MC is silent, never replaced by templates.
- **Scope**: four acts share one engine; singing is the odd one and is done last within stream 1.
