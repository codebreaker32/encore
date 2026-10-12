> **Superseded (2026-10-10):** the team pivoted to Encore; see `docs/concept-encore.md`. Kept for the decision trail.

# Strumble: the Fire TV that hears you play

> Statistics are cited in `docs/track-decision.md`. Anything marked ⚠ is unverified until its spike passes.

**One-liner.** Strumble is a guitar lesson on your Fire TV that can hear you. A phone on the coffee table listens, the TV shows the chords big enough to read from the couch, and when you keep stumbling on the same bar it loops that bar and slows it down until you get it.

**Track:** Fire TV. **Mini challenges:** AWS Builder and Open Source.

## Who it's for

Adult and teen beginners learning open chords at home, who already watch lessons on the TV but get no feedback. MVP scope is acoustic or electric guitar, the open chords G, C, D, Em and Am, and single-note warm-ups. Ukulele is a later instrument.

## The loop

1. **Pair.** The TV shows a QR code and a 4-letter code. The phone opens a web page (no install), allows the microphone, and shows a live tuner. Tuning is the first useful thing, and it doubles as a "can the phone hear you" check.
2. **Arm.** The host presses OK on the remote. The TV sends the segment (bars, tempo, which chords to listen for) to the phone.
3. **Play.** The phone plays the count-in clicks and listens on the same audio clock. Detections stream to the TV about 4 times a second. The TV lane lights each chord **green** (hit), **red** (confident miss) or **grey** (unsure, never counted).
4. **Stumble → loop.** After 3 low passes in a row on a bar, the TV offers to loop just that bar at 90% tempo, stepping back up after 2 clean passes.
5. **Coach.** At the end of a segment (always under 4 minutes, ending on an OK press), the coach agent turns the per-bar scores into one note: what went well, the one bar to fix, and one physical tip. It is shown and spoken.

## Interaction model (10-foot UI)

| Input | Does |
|---|---|
| Remote **OK** | Start / next segment / accept loop (also keeps Vega from killing the app) |
| Remote **Left / Right** | Pick a bar to loop manually |
| Remote **Up / Down** | Tempo ±5% |
| Remote **Back** | Leave loop / back to lesson |
| **Alexa voice labels** (UIController) | "Alexa, select Slower / Loop / Next" via the remote's press-to-talk button. ⚠ Needs a physical stick to demonstrate. |
| Phone | Microphone and tuner only, so it can lie flat on the table |

## Architecture

```
 Phone (browser, HTTPS)                         Fire TV (React Native for Vega)
 apps/companion                                 apps/vega + packages/shared-ui
  getUserMedia (no AGC/NS/EC)                    lesson lane, loop UI, results, coach note
  @strumble/pitch-judge ── detections ──┐   ┌──  @strumble/practice: grading, stumble coach,
  count-in clicks on its own clock      │   │      segments (<4 min), TV↔phone messages
                                        ▼   │
                       couch-link rooms (WebSocket) ── services/relay (dev) | AWS (prod) ⚠
                                                │
                                                ▼
 services/coach-agent   Strands agent on Bedrock AgentCore Runtime → CoachNote (structured)
                        AgentCore Memory: cross-session progress notes (opt-in) ⚠
                        deterministic fallback, so practice never waits on a model
```

**Design invariants** (also in CLAUDE.md; every screen and doc must agree):
1. **The phone is the timing master.** Grading uses the phone's audio clock; the TV is a display. TV, HDMI and soundbar latency never affects grading.
2. **"Unsure" is grey and never counts against the player.** Red only for a confident wrong detection or nothing played.
3. **No audio leaves the phone.** Only detected events (time, chord or note, confidence) are sent.
4. **Every practice segment is under 4 minutes and ends on an OK press** (Vega kills the app after about 5 minutes without input).
5. **The coach never blocks practice.** If the model is slow, fails or refuses, the rule-based coach answers.
6. **Content is original or public domain.** No commercial song catalogue, no brand logos in the video.
7. **No react-native-svg on the TV** (it fails on the SDK 0.24 simulator). Use plain Views and Images.

## Open Source mini challenge
- **`pitch-judge`** (primary): honest real-time note and chord judging in pure JS. It does McLeod pitch tracking, harmonic-aware chroma, and chord matching restricted to a candidate set, and returns `unsure` instead of guessing. Ships with tests and a labelled recording corpus with measured recall and false-accept rates. It is reusable by any practice app on web, React Native or Node.
- **`couch-link`** (secondary): phone-as-controller rooms for React Native for Vega and the web. Room codes, QR join URLs, reconnect with seat resume, server-time sync, and a transport-independent relay core.

## AWS Builder mini challenge
- Coach agent built with the **Strands Agents SDK** and deployed on **Bedrock AgentCore Runtime**, using a Bedrock model with structured output.
- **AgentCore Memory** for opt-in progress across sessions ("last week the G→C change was at 80% tempo").
- Production relay on API Gateway WebSocket ⚠ (or AppSync Events, if Vega's WebSocket supports subprotocol auth).
- Built with Claude Code, which counts as a development tool per [forum 45321](https://amazonappdev2026.devpost.com/forum_topics/45321-aws-builder-does-claude-code-running-on-amazon-bedrock-count-as-a-dev-tool) when run on Bedrock.

## Build plan (17 days, submission due Fri Oct 23, 12:00 PT = 00:30 IST Sat)

| Day | Date | Goal | Exit check |
|---|---|---|---|
| D1 | Oct 7 | Vega SDK + simulator spike on WSL2 (`kvm` group, WSL memory). Hello World on the simulator. Phone tuner on a real phone over LAN. | Sample app on the simulator; phone shows notes |
| D2 | Oct 8 | TV: room QR (View-based) + pairing via couch-link. Confirm who plays on camera. | Phone joins the TV room |
| D3 | Oct 9 | Record corpus: 5 chords × right/wrong/muted × 2 guitars × 2 players at 1.5 m. Bedrock access check. | Corpus in `packages/pitch-judge/corpus/` |
| D4 | Oct 10 | **Go/no-go:** recall ≥90% and false accepts ≤20% on the corpus | Decide chord vs melody grading |
| D5–6 | Oct 11–12 | Phone: count-in + AudioWorklet capture + onset detection + streaming detections | Detections arrive on the TV in time |
| D7–8 | Oct 13–14 | TV: lesson lane, hit/miss/unsure states, results screen | One full segment playable |
| D9 | Oct 15 | Stumble loop + tempo control + OK-press segment endings | Loop triggers after 3 stumbles |
| D10 | Oct 16 | Coach agent on AgentCore Runtime; TV shows and speaks the note | Note appears < 8 s after a segment |
| D11 | Oct 17 | UIController voice labels, focus polish, error and empty states | No dead ends with remote only |
| D12 | Oct 18 | AWS relay deploy; AgentCore Memory | Works off-LAN |
| D13 | Oct 19 | **Office hours (9am PT)**: show the demo, collect feedback | — |
| D14 | Oct 20 | Real practice sessions recorded over several days | Genuine before/after footage |
| D15 | Oct 21 | Video shoot + edit (< 3 min). **AWS credits deadline 12:00 PT** | Video cut v1 |
| D16 | Oct 22 | README, product feedback, friction log, feature requests | Submission draft saved |
| D17 | Oct 23 | Final checks, add reviewers if the repo is private, submit before 12:00 PT | Submitted |

## Demo video (under 3 minutes)
1. **0:00–0:15** "I've tried learning guitar from TV lessons. The TV never knew if I was getting it." (Must be true for whoever says it.)
2. **0:15–0:35** Scan the QR code, the phone tuner lights up, and the TV says "I can hear you."
3. **0:35–1:20** Playing the G–C–D–Em lesson: green, grey and red chords on the TV lane in split screen with the guitar.
4. **1:20–1:50** Stumbling on G→C three times. The TV offers "Loop bar 3 at 90%?", we press OK, nail it, and it speeds back up.
5. **1:50–2:15** The coach note appears and is spoken. A clip from a few days later shows the same bar clean at full tempo.
6. **2:15–2:45** How it works: phone as timing master, `pitch-judge` measured accuracy, Strands on AgentCore, Vega performance on the simulator.
7. **2:45–2:58** Who it's for, and "free, on a stick you already own".
