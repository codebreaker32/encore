# Devpost submission: Encore

> **Status:** rewritten 2026-10-12 for submission; sharpened 2026-10-19 for the judging criteria (impact, the creative case, measured numbers, the AWS Builder pipeline). Track: **Fire TV**. Mini challenges: **AWS Builder**, **Open Source**. **TODO(lead R1–R5)** marks numbers the lead is re-measuring on the final emulator APK (the requests are in `docs/demo-video.md`, "Measurement requests").
>
> **How to use this file.** Everything between the two rules below is the Devpost text, section by section. The `<!-- src: … -->` comments name the measurement behind each number; Devpost's editor hides HTML comments, but strip them if a preview shows them. **[verify]** marks a number or claim that has not been measured yet or must be re-checked on the final build. **[ask]** marks a question for the team. The gallery plan is in `docs/submission/gallery.md`, the video script in `docs/demo-video.md`.

---

## Encore

### Tagline

**Your TV becomes a live audience that reacts to your timing, and an honest scorecard tells you what landed.**

(Short form, for the title card and the gallery: "A real audience, honestly scored.")

### Inspiration

Anyone who performs (an open-mic comic, a slam poet, a best man with a toast, someone giving their first conference talk) rehearses alone, into silence. A mirror can't laugh. A recording can't tell you where the room would have gone cold. The first time you hear a room react is the night it counts.

The TV is the biggest screen in the house and it faces the spot where you'd stand. We wanted it to be the room: a crowd that leans in, laughs on the beat you leave, gets restless in dead air and heckles you in a tough club. We also wanted it to be honest. A crowd that laughs at everything is easy to build and useless for practice. So every reaction had to come from something the app actually measured, and the score had to be the same whether you played a forgiving open mic or a twenty-thousand-seat arena.

**[ask]** Add one or two sentences of the team's own reason here (who performs, what you were rehearsing). A real first-person line is stronger than the general case above.

### Who it's for, and why on a TV

**The people.** Encore is for anyone who has a slot coming and nowhere to rehearse it in front of people:
- the comic with five minutes at Thursday's open mic;
- the member of a public-speaking club (Toastmasters-style) with a timed speech to give;
- the slam poet;
- the best man with a toast;
- the singer working up their own material.

Each act has its own pack: stand-up gets laughs, poetry gets snaps, a speech gets applause and singing gets cheers. What the room listens for is the craft of that act: the beat after a punchline, a list of three in a speech, a rhyme at a line's end, a note held in tune. A second audience comes free: a family on a game night taking turns in front of the same room.

**What they have today.** Each existing tool covers one piece of the job, and none of them gives you a room:
- **a mirror or a phone recording:** no reaction at all;
- **karaoke apps:** they score a song;
- **speech coaches:** they grade a transcript;
- **party games:** they entertain a group.

None puts a reacting audience on the wall with an honest ledger beside it. The thing a performer can't get at home is the room's reaction to their timing, and timing is exactly what a phone's microphone can measure honestly.

**Why a TV, and why Fire TV.**
- **It's the right screen.** The TV is the biggest screen in the house, and it faces the spot where you'd stand to perform. A life-size crowd at living-room distance feels like a room in a way a phone screen can't.
- **Nothing to buy.** The remote is already in your hand, and the phone already in your pocket becomes the microphone. The phone side is a web page reached by a QR code, so there's no second app to install.
- **The Appstore audience.** The Fire TV Appstore reaches living rooms that already run Fire TV, and Encore is built for both of its operating systems from one codebase:
  - a React Native for Vega build for Vega OS;
  - an Android build, since Fire OS sticks are Android underneath.

  Neither has run on a Fire TV device yet (see "Track answers").
- **Shipping new content is cheap.** New acts and venues are data, not code: the act packs are JSON (`packsAsJson()`), already published on S3.

**Why it would be used more than once.** Several features are built for coming back:
- the MC remembers your last six sets;
- the MC's debrief compares this set with your earlier ones;
- the measured "next room" rule tells you to go again or move up a venue;
- four venues of rising difficulty give a performer a ladder to climb.

### Why it's creative

- **Voice, D-pad and picture in one flow.** This is the judges' own example of a creative Fire TV app, and here it's the whole product. During a set:
  - the D-pad sets up the show and ends it;
  - your voice, through the phone on the table, is the input;
  - the TV answers with a crowd, a camera director and an MC who speaks.

  In the green room you hold OK and talk to the MC. Every state is reachable with OK, Back and the D-pad.
- **A generated crowd that reacts only to measured moments.** The crowd uses no photos, no video loops and no canned laugh track. The audience is rendered live in the TV's WebView, and every movement is computed from what the engine measured. A laugh comes after the beat you left, sized by how far the line cleared the room's bar. In dead air past the room's patience, the house fidgets. The laugh you hear is a fresh mix of CC0 recordings each time.
- **An honest MC.** Most AI hosts flatter you. Ours is checked:
  - a guard rejects any number the set can't produce;
  - it rejects any pattern the engine didn't count, and any advice that contradicts the measured "next room" rule;
  - when the model is late or wrong, the MC is silent, and the screen says why.
- **Honesty as a design rule.** It decides what's on screen:
  - a tougher venue changes the crowd, never the score;
  - "not measured" is never shown as a zero;
  - the content judge's opinion is labelled an estimate;
  - we kept the result that the fast LLMs alone judge jokes at chance level.

### What it does

You put your phone on the coffee table, pick an act, a venue and an MC on the TV with the remote, and press OK. The TV is now the director of your own comedy special.

- **Four acts, one engine.** Stand-up gets laughs, poetry gets snaps, a speech gets applause and singing gets cheers. Each act is a pack: what the room listens for, how it answers, and which rooms you can play.
- **Four venues, one honest score.** Open Mic (30 seats), Comedy Club (80), Theatre (800) and Arena (20,000). <!-- src: docs/concept-encore.md, Venues table (packages/crowd/src/packs.ts) --> A tougher venue is a tougher crowd: a higher bar before it reacts, less patience with dead air, hecklers after fewer dead bits. The scorecard counts the same things against the same house standard everywhere, so a better room never flatters you and a harder one never punishes you.
- **A room that hears your timing.** It reacts to what a live room reacts to first: the beat you leave after a line, a short punch after a longer setup, emphasis at the end of a line, a clean line without fillers, a note held in tune. Every reaction carries its measured reason, and the TV's director captions it on screen: "LAUGH · a list of three · 0.7 s beat · cut to the floor".
- **…and your words, when you allow it.** With words on, the room also judges what you say, in two labelled tiers. It counts patterns a stage writer would name: a callback to an earlier bit, wordplay, a list of three, a rhyme, a contrast, a call to action. Then a content judge on Amazon Bedrock adds one estimate per line, shown as an estimate. Content can only add to a line's score, and it is capped, so a line still needs its beat. <!-- src: docs/concept-encore.md "Content judging"; CONTENT_CAP 0.30 -->
- **A live 3D audience.** No photos and no looping clips. The room is rendered live in the TV's WebView: Microsoft Rocketbox people with motion-captured idles, laughs and claps, faces that smile and blink, and a room that fills before your set and empties after it. Every movement is driven by what the engine measured: a laugh spreads from the front rows, the house fidgets in dead air, the finale is sized by how much of your set landed. Each laugh is a fresh mix of real CC0 crowd recordings, so no two sound the same.
- **An MC, not a chatbot.** Choose warm Meera, sarcastic Vik, strict Mr. Rao or deadpan Dev. The MC introduces you, throws the heckle cards, debriefs you out loud from the measured numbers, remembers your last six sets, and answers questions in the green room: hold OK and speak into the phone. A model on Amazon Bedrock writes every word, and Amazon Polly speaks it. If the model is late, or our honesty guard rejects its answer, the MC stays silent and the screen says why. There are no canned lines.
- **The cut sheet.** After the set you see it as an edit timeline: gold cuts where the room gave you something, striped tiles where the dead air ran past this room's patience, and the measured ledger beneath it ("measured, not judged").
- **Your audio never leaves your phone.** The phone sends only events: voice on and off, phrase timings and levels, pitch for singing, and words only if you switch them on. The TV always shows which mode is active.

### How we built it

**One pure engine at the centre.** `packages/crowd` is the product's brain: pure TypeScript with no clock, no randomness and no React, so every decision the room makes is reproducible and unit-tested. The phone streams events, the TV feeds them plus a tick ten times a second into one reducer, and the reducer decides the reactions, the camera cuts, the title cards, the heckles and the scorecard. A line's landing score adds up timing features (beat, shape, setup-punch, emphasis, clean). The room reacts when that score clears the venue's threshold, but the scorecard counts a line as landed only at one fixed house standard (0.55) everywhere. <!-- src: docs/concept-encore.md "Landing score", "Room decision"; CLAUDE.md honesty rule 2 --> A reaction's size and latency come from how far the score cleared the threshold, and the caption quotes the real latency.

**The TV apps (Fire TV on Vega OS, and Android TV).** One shared UI package renders the whole show in React Native for both a React Native for Vega build (Vega SDK 0.24, RN 0.72) and an Expo / react-native-tvos build for Android TV. It's a remote-first screen machine (bill → live → cut sheet ⇄ green room) with hard cuts, a broadcast lower-third and no game HUD. Everything is readable from 3 m, and every state is reachable with OK, Back and the D-pad.

**The live 3D audience.** A Three.js r160 page runs in the TV's own system WebView, packed for `file://` and fed by `crowdDrive()`: the engine state turned into attention, restlessness, warmth, each reaction's envelope, the heckle and the finale, posted ten times a second. The page adds only seeded per-person variation (who laughs first, how far a laugh travels), so the room is never louder, warmer or quicker than the engine measured.
- **Built for the cheapest TV hardware we could find.** That's a 32-bit Google TV with a Mali-G31 GPU, the same GPU class as the Fire TV Stick Lite. The front rows are skinned Rocketbox people, the rows behind are instanced bodies lit per vertex, and the arena's far stands are baked impostors. A club frame is about 77k triangles in 44 draw calls, with textures under 30 MB per venue. <!-- src: docs/android-emu/720p-test/stats.txt ("44 calls · 77499 tris"); docs/handoff/README.md ("textures ≤ 30 MB per venue") -->
- **Measured, not guessed.** Five rounds of speed sweeps on the TV traced the cost to the crowd's per-pixel lighting and its alpha test. Moving to per-vertex lighting and opaque bodies saved about 11 ms and 12 ms a frame. <!-- src: docs/tv-test-log.md, rounds 1–3 -->
- **Bodies that don't break.** The motion is Rocketbox's own MIT motion-capture library, so no retargeting was needed. An anatomy validator checks every avatar against its own fitted body volumes, joint limits, neighbours and furniture; our sweeps for limbs through bodies and chairs, hands and bind poses all read zero. <!-- src: docs/handoff/README.md "Anatomy validator and clamps"; CLAUDE.md -->
- **Variety you can check.** The camera rotates through five or six setups per venue and never repeats the last one. Perceptual-hash distances between neighbouring laugh shots went from 4–24 to 32–38. <!-- src: docs/handoff/crowd3d.md, v7 "Close-ups rotate" -->

**The phone (a web page, no install).** Scan the QR code on the bill and the phone becomes the microphone: a 20 ms level poll, voice activity with hangover, phrase detection with end emphasis, a McLeod pitch tracker for singing, and the browser's speech recogniser, which reports honestly whether it runs on the device or through a service. The phone is the timing master. The TV hushes it while the room or the MC is making noise, so the room's own sound never counts as the performer.

**Couch-link (open source).** Jackbox-style phone-as-controller rooms for React Native for Vega and the web: four-letter codes readable from the sofa, a QR join, seat resume after a Wi-Fi drop, and a shared clock, so the TV and the phone start the set at the same instant. It has no dependencies beyond `WebSocket` and is safe for RN 0.72's Hermes and TypeScript 4.8. The relay's routing is transport-independent.

**The MC (`services/mc-agent`, Python).** It's a Strands agent with structured output into the same contract the TV uses, one fresh agent per request, and four request kinds: the debrief, a green-room reply, a moment line (intro, between bits, heckle, the end) and the content judge.
- **The model.** GLM-5 on Amazon Bedrock writes every word, through Bedrock's OpenAI-compatible endpoint with SigV4 signing. A moment line takes about half a second. <!-- src: docs/android-emu/2026-10-12-night/stats.txt (line/intro 0.47 s, between 0.48 s, heckle 0.62 s) -->
- **The honesty guard.** It never writes words. It rejects any answer that quotes a number the measurements can't produce, in digits or in words, or that hedges the wrong way ("nearly fifteen" for 14.7 passes, "just over fifteen" doesn't). It also rejects an answer that drops a required "not measured", or that puts a clock time on a card. The model gets one retry with the reason; after that the MC is silent and the screen says "rejected".
- **Written for the ear.** The spoken version of each answer uses numbers in words with honest hedges and moments in words ("about twenty seconds in"), while the screen keeps the exact figures. Our first voice read "1.2 landed a minute … 0:18" aloud as "one point two … zero colon eighteen", and that, not the voice, was what sounded robotic.
- **The voice.** Amazon Polly gives each persona its own voice: Kajal, Brian, Stephen and Matthew, on the generative engine, with the same words on neural as a fallback. We chose them in two audition rounds of 24 voice and engine combinations. <!-- src: docs/product-feedback.md, Polly -->
- **No wait for speech.** The service returns a presigned Polly URL, signed locally in about a millisecond, and the TV streams the speech itself, so speech synthesis adds nothing to the model's budget. <!-- src: CLAUDE.md, "presigned Polly SynthesizeSpeech HTTPS URL (600 s, signed locally in about 1 ms)" --> On the Android TV emulator the intro started 39–72 ms after OK (it is written and loaded while the bill rests), and each debrief started 0.4–1.2 s after it was queued. <!-- src: docs/android-emu/qa-2026-10-12/qa-report.md "What passed"; historical Google TV: intro 0.25 s after OK, debrief 2.1 s after the cut sheet, docs/tv-test-log.md round 5 -->

**The content judge, chosen by measurement.** Can a model judge a joke well enough and fast enough to count, even labelled as an estimate? We set a rule before testing: take the best rank agreement with human ratings among judges that answer within 500 ms (p90) on the real path from the TV, and never take a fast one that is no better than chance.
- **The test set.** 1,000 held-out Reddit jokes from the rJokes dataset, with every repost of a training joke removed, scored against their log-upvotes. <!-- src: docs/judge-calibration.md, "The held-out sample" -->
- **The fast LLMs alone were at chance.** Ministral 3 8B, Ministral 3 14B, Qwen3 32B and GLM-4.7 Flash all scored Spearman −0.02 to 0.05, below a "longer punchlines" baseline (0.10). We say so, and we don't use them alone. <!-- src: docs/judge-calibration.md, Results table -->
- **What shipped.** For stand-up, a CPU humour model (RoBERTa-large fine-tuned on rJokes, MIT, int8 ONNX, about 25–60 ms a line on two CPU threads)<!-- src: docs/judge-calibration.md "Serving RoBERTa" (24/37 ms p50/p90 standalone, 41/62 ms inside the service) --> mixed 0.7/0.3 with Ministral 3 8B on Bedrock. It reaches Spearman 0.34 [95% CI 0.28–0.39] on the held-out jokes. It ranks the strong version of a line above a flat version of the same idea in 17 of our 20 pairs. On the Android TV emulator the verdict arrived at p50 245 ms and p90 288 ms, 41 of 41 lines in time (on the retired Google TV: p50 285–315 ms, p90 366–483 ms, 0–2 late lines a set). <!-- src: docs/judge-calibration.md "Results" and "What shipped" (ρ 0.339 / 0.341 with shipped maps; 17/20); docs/handoff/README.md "Speed" (285–315 / 366–451 ms, 0–2 late); docs/tv-test-log.md round 5 (41 verdicts, p50 285, p90 366, 0 late) -->
- **Poetry and speech** have no rated dataset, so their rubric is checked only on pairs we wrote ourselves, and the write-up says exactly that.

**AWS end to end.**
- **Amazon Bedrock:** GLM-5 for the MC and Ministral 3 8B for the judge, both on the OpenAI-compatible endpoint.
- **Strands Agents:** the agent and its structured output.
- **Amazon Polly:** four voices, served as presigned URLs.
- **Amazon S3:** the act packs as JSON (`packs/v1/acts.json`), and the licensed media the Vega simulator's player needs over HTTPS.
- **Amazon EC2:** build, render and emulator boxes, including nested virtualization for the Vega Virtual Device and the Android TV emulator.
- **IAM:** a box role limited to Bedrock and Polly.
- **AWS Budgets and CloudWatch:** spend alarms.
- **The MC code is AgentCore-ready.** It is served by the AgentCore SDK's `BedrockAgentCoreApp`, packaged as a direct-code zip (35.8 MB, arm64 wheels, no Docker), with a keyless forwarder so the TV never holds AWS keys. <!-- src: docs/product-feedback.md, AgentCore -->

**Built with Claude Code.** Parallel agents built the engine, the phone listener, the TV screens, the MC, the 3D audience and the Vega port, each against fixed TypeScript contracts (`packages/crowd/src/types.ts`, `messages.ts`) and their tests. Heavy jobs ran on EC2 boxes. The Amazon Devices Builder Tools (MCP server and Vega skills) answered Vega questions and profiled the simulator from the command line.

### Measured: the numbers behind the claims

Every figure below comes from a log in the repository. The Google TV rows are **historical**: that 32-bit Mali-G31 TV was our performance floor until 2026-10-19, then it was retired, and every later check runs on the Android TV emulator.

**Speed of the AI parts (emulator):**

| What | Value | Where and when |
|---|---|---|
| Content judge, verdict on the TV | **p50 245 ms, p90 288 ms, 41 of 41 lines in time** (stand-up, words on) | Android TV emulator, MC in the same region (us-west-2), APK m, 2026-10-13 <!-- src: docs/handoff/README.md "Late update" --> **TODO(lead R2):** final APK |
| MC moment line (intro, between bits), model time | **0.47–0.96 s** (GLM-5 on Bedrock) | Android TV emulator box, 2026-10-12 <!-- src: docs/android-emu/2026-10-12-night/stats.txt, MC service lines --> **TODO(lead R3)** |
| MC debrief, model time | **1.4–5.3 s** (2026-10-12 night test); 1.2–2.5 s in-region (QA) | <!-- src: docs/android-emu/2026-10-12-night/stats.txt (1.42, 2.94, 5.26 s); docs/android-emu/qa-2026-10-12/qa-report.md issue 2 and 9 --> |
| MC voice start | **the intro 39–72 ms after OK** (written ahead while the bill rests); **the debrief 0.4–1.2 s after it's queued** | Android TV emulator QA, 2026-10-12 <!-- src: docs/android-emu/qa-2026-10-12/qa-report.md "What passed" --> **TODO(lead R3)** |
| Polly signing | about 1 ms (a presigned URL, signed locally) | <!-- src: CLAUDE.md, MC service --> |

**Frame rate and load time (emulator):**

| What | Value | Where and when |
|---|---|---|
| 3D room, steady state | **30 fps (the cap)** in the club, theatre and open mic; dips to 26–29 at cuts | Android TV emulator 720p, `-gpu host`, the 2026-10-19 real-v1 APK (before the final build) <!-- src: docs/handoff/box-progress.md "final APKs and emulator check" --> |
| 3D room during a recorded set | **23–27 fps** (club, a 3:39 scripted set, recording the screen) | Android TV emulator, pre-final APK, 2026-10-19 <!-- src: docs/handoff/box-progress.md "emulator check (pre-final APK…)" --> **TODO(lead R1):** final APK |
| Launch to first frame, launch to the 3D room | **TODO(lead R5)** | final emulator APK |

**The retired Google TV (historical):**

| What | Value | Where and when |
|---|---|---|
| Content judge on the TV | p50 285–315 ms, p90 366–483 ms, 0–2 late lines a set | Google TV, APK j to n, 2026-10-12/13 <!-- src: docs/tv-test-log.md round 5 (285 / 366, 0 late); docs/handoff/README.md "Speed" and "Morning update" (APK n: 39/41, p50 308, p90 483) --> |
| 3D room on the Mali-G31 | about 22–23 fps (club 23, open mic 22, theatre 22) with today's default rendering | crowdtest cycles, TV round 10, 2026-10-19 <!-- src: docs/handoff/box-progress.md, 2026-10-19 10:27 UTC entry (noreal) --> |
| Load | release APK cold start 5.4 s; the room 12.2 s after launch | 2026-10-11 and APK t, 2026-10-14 <!-- src: docs/tv-test-log.md; docs/handoff/README.md "Wrap-up, Wed 14 Oct" --> |

**Quality and cost:**

| What | Value | Where and when |
|---|---|---|
| Content judge quality | Spearman **0.34** [0.28–0.39] against human ratings on 1,000 held-out jokes. Fast LLMs alone: −0.02 to 0.05 | `docs/judge-calibration.md` |
| Scene cost | club wide about 46 draw calls / 80k triangles; textures ≤ 30 MB per venue; Amazon's guideline is 500 draw calls | 2026-10-19 <!-- src: docs/handoff/box-progress.md --> |
| Tests | **163 TypeScript tests** (crowd engine 109, couch-link 19, pitch-judge 19, relay 16) and **391 Python tests** (MC service, 1 skipped), all passing | run 2026-10-19 on `05afe85` |

### Challenges we ran into

- **Honesty is a design constraint, and it costs features.** Every reaction needs a measured reason, every number on screen must be one the phone can actually measure, and with words off, pace and fillers read "not measured", never 0. We removed things that looked good but couldn't be justified, and we kept the dead bits in the demo.
- **A believable crowd on a TV-stick GPU.** Our performance floor was a 32-bit Google TV with a Mali-G31, the GPU class of the Fire TV Stick Lite. Ten rounds of A/B speed sweeps there measured each rendering cost on the real GPU. With today's default rendering, the club, open mic and theatre ran at about 22–23 fps (TV round 10, 2026-10-19). <!-- src: docs/tv-test-log.md rounds 1–5; docs/handoff/README.md round 6–8 tables; docs/handoff/box-progress.md, 2026-10-19 10:27 UTC entry (round 10: club 23, open mic 22, theatre 22 with noreal) --> A richer rendering pass (skin, catchlights, depth of field) cost 2–5 fps there, so it ships off by default. The arena is the hardest room, at about 12–17 fps (TV round 6). <!-- src: docs/handoff/README.md "Morning update" (round 6, APK m); a standing-crowd redesign reached 21 fps but isn't merged (branch arena-v3) --> Our target is a steady 30, and we're not there yet on the cheapest hardware. On the 720p Android TV emulator we film on, the room holds its 30 fps cap in a steady state and ran at 23–27 fps through a recorded set. <!-- src: docs/handoff/box-progress.md, 2026-10-19 emulator checks --> **TODO(lead R1):** the final APK's set fps.
- **The Vega simulator has no WebView on Linux.** The Vega build runs on the Vega Virtual Device: the bill, a live set, the cut sheet, the MC's voice and the packaged media. But Amazon's Linux simulator ships without the WebView our 3D room lives in, and an app that includes it won't even install until we strip the dependency from a simulator-only repack. We also tried rendering the crowd natively with three.js on `@amazon-devices/expo-gl`. It ran (16–19 fps on the simulator's software GPU), but the simulator's GL surface has no depth buffer, so the people break into shards. <!-- src: docs/dev-setup.md "Vega on AWS"; docs/friction-log.md 2026-10-11 and 2026-10-12 --> So on Vega the room falls back to licensed video plates, and the 3D room is filmed on the Android TV emulator, which the hackathon FAQ accepts. Neither path has been tested on a Vega Fire TV device.
- **New-account model access.** On our new AWS accounts, Bedrock's Converse API refused every model with "Operation not allowed". The OpenAI-compatible endpoint served open-weight models, so the MC runs on GLM-5 there and Claude waits behind a setting. <!-- src: docs/friction-log.md 2026-10-11 -->
- **AgentCore blocked by a zero quota.** The MC is packaged and tested for AgentCore Runtime, but creating the runtime fails: this account's applied quota for agents is 0 in every region we checked, Service Quotas won't accept a request at or below the default, and the support case is pending. The MC runs the same code on EC2 meanwhile. <!-- src: docs/friction-log.md 2026-10-12 "AgentCore runtime creation blocked by a zero default quota" --> **[verify]** Update if the case is answered before submission.
- **Latency you can feel.** Our first voice sent base64 audio inside the answer: it added the synthesis time to every reply, and neither Android's player nor Vega's could open `data:` URIs. Presigned Polly URLs fixed both, plus a `#.mp3` fragment for Vega's player, which picks the format from the URL's extension. The content judge was once late on 23 of 37 lines. The cause wasn't the network: a scorecard function grew quadratically with the set's length and stalled the TV's JS thread. The fix took it to 0 late. <!-- src: docs/tv-test-log.md round 5 -->

### Accomplishments that we're proud of

- **A rehearsal room that reacts in real time without sending audio anywhere.** The phone sends events, never sound.
- **An MC whose every word is model-written, checked against the measurements and spoken aloud,** and which stays silent rather than make something up.
- **A content judge we can defend with numbers,** including the result that the fast LLMs alone were no better than chance.
- **A live 3D audience in the TV's own WebView on the cheapest class of TV hardware,** with its frame rate measured on that hardware and its limits published.
- **One codebase on Vega OS and Android TV,** with the Vega simulator's gaps documented: 32 friction-log entries, each with steps, a workaround and a suggestion. <!-- src: docs/friction-log.md (32 dated entries on 2026-10-19) -->
- **Tests across the stack:** 163 TypeScript tests (the crowd engine 109, couch-link 19, pitch-judge 19, and the relay 16, including a WebSocket end-to-end run) and 391 Python tests for the MC service and its honesty guard, all passing. <!-- src: `yarn test` and `yarn test:agent`, run 2026-10-19 on 05afe85 (391 passed, 1 skipped) -->

### What we learned

A room's reaction is mostly timing. The beat you leave after a line matters more than the line itself, and that's exactly what a microphone can measure honestly. Words help when you let the room hear them, and the devices a stage writer would name (the callback, the rule of three, the rhyme) can be counted. Judging whether a line is funny is the hard part. A model can rank jokes somewhat better than chance, but not well, so its opinion stays labelled as an estimate. A small, fast LLM that sounds confident was no better than a coin flip at ranking, and we only found that out because we measured it. An MC that remembers your last six sets feels much more like a coach than one that only sees tonight. On a TV, every millisecond of JavaScript per frame is shared with the GPU, so profile on the weakest device first.

### What's next

- **A steady 30 fps on a Fire TV Stick Lite-class GPU:** level of detail only for the people in shot, fewer behaviour ticks, and the frame cap that paces best on the TV. Then test the WebView room on a Vega Fire TV device. Our Linux simulator can't run it.
- **Ship on the Fire TV Appstore.** The act packs are already JSON on S3, so new acts and venues can arrive without an app update.
- **Move the MC onto AgentCore Runtime** once the account's quota is restored. The zip, the role and the forwarder are ready.
- **A louder, more expressive room:** shouts from real CC0 recordings ("woo!", whistles, a groan on a dead bit in a tough room), and faces with surprise, smirks and winces.
- **More acts** (improv, a karaoke duet with your own material), **and household play:** several phones on one couch as the heckling front row.

### Built with

React Native for Vega · Vega SDK 0.24 · Vega Virtual Device · `@amazon-devices/react-native-w3cmedia` · `@amazon-devices/webview` · `@amazon-devices/expo-gl` · Amazon Devices Builder Tools (MCP and Vega skills) · Expo / react-native-tvos · Android TV emulator · TypeScript · Three.js · WebGL 2 · WebAudio · Web Speech API · Microsoft Rocketbox avatars and animations (MIT) · Amazon Bedrock (GLM-5 and Ministral 3 8B on the OpenAI-compatible endpoint) · Strands Agents · Amazon Bedrock AgentCore SDK · Amazon Polly · Amazon S3 · Amazon EC2 · AWS IAM · AWS Budgets · Amazon CloudWatch · Python · uv · pydantic · ONNX Runtime · humor-roberta-large (MIT) · Node.js · ws · Vite · Vitest · pytest · Claude Code

### Track answers

**Fire TV.**
- **Platform:** Encore is a TV-first app built on React Native for Vega (Vega SDK 0.24). An Android TV build, the route to Fire OS sticks, shares the same UI package.
- **Fire TV SDKs at runtime in the Vega build:**
  - `@amazon-devices/react-native-w3cmedia` plays the MC's Polly voice, the crowd cues and the video plates;
  - the remote's keys come through TVEventHandler;
  - `@amazon-devices/webview` hosts the 3D room. It's written, but gated off on Vega until it can be measured, because the Linux simulator has no WebView.
  - The Vega build ran a full set on the Vega Virtual Device: the bill, live, the cut sheet and the MC's voice. <!-- src: docs/handoff/vega.md; docs/dev-setup.md "Vega on AWS" -->
- **Interaction:** the multi-modal flow the track asks for:
  - the D-pad runs the show;
  - the phone's microphone carries the performance;
  - you speak to the MC in the green room;
  - the TV answers on screen and out loud.
- **The demo video:**
  - **Where it was filmed:** on the Android TV emulator at 720p, which the FAQ allows, because the Linux Vega simulator has no WebView for the 3D room.
  - **Who performs:** our scripted test phone performs the set, and the video says so. It sends the same events as the phone page, and every reaction is computed live.
  - **The Vega insert:** the video also shows the Vega build on the Vega Virtual Device.
- **The road to the Fire TV Appstore:**
  - **Vega OS:** the Vega build is the app for Vega OS sticks.
  - **Fire OS:** Fire OS sticks are Android underneath and should take the Android APK.
  - **Still to do:** host the relay and the MC for the public (the MC is packaged for AgentCore Runtime), then submit.
- **Not yet on hardware:** we have no Fire TV device. Neither the Vega build's WebView room nor the APK on a Fire OS stick has been tested.

**AWS Builder: a multi-service pipeline around measured facts.**
- **Amazon Bedrock, two paths:**
  - **The MC:** GLM-5 (`zai.glm-5`) writes every MC word, through Bedrock's OpenAI-compatible endpoint with our own SigV4-signing client.
  - **The judge:** during a set, Ministral 3 8B scores each line's words within a 0.35 s model budget, mixed with a CPU humour model. That verdict reaches the TV at p50 245 ms on the emulator. <!-- src: docs/handoff/README.md "Late update" -->
- **Strands Agents:**
  - one fresh agent per request, with a persona prompt;
  - structured output straight into the pydantic mirror of the TV's TypeScript contract;
  - four request kinds: the debrief, a green-room chat, a moment line, and the judge.
- **The honesty guard:** our code between the model and the screen. It rejects any answer that:
  - quotes a number the measurements can't produce;
  - hedges the wrong way;
  - names a pattern that wasn't counted;
  - contradicts the measured next-room rule.

  The model gets one retry; after that, the MC is silent and the screen says why.
- **Amazon Polly:**
  - four persona voices on the generative engine, with neural as a fallback, read as SSML;
  - each delivered as a presigned URL that the TV streams itself, signed in about 1 ms, so speech adds nothing to the model's time.
- **Amazon Bedrock AgentCore:**
  - the service is already served by the AgentCore SDK's `BedrockAgentCoreApp`;
  - it's packaged as a direct-code arm64 zip (35.8 MB, no Docker);
  - it has a keyless forwarder (`MC_BACKEND=agentcore`), so the TV never holds AWS keys.

  Creating the runtime is blocked by this account's agent quota of 0 in every region we checked. The Support case is pending, and it's logged in the friction log. Until then, the same code runs on EC2. **[verify]** Update if the case is answered before submission.
- **The rest:**
  - **S3:** the act packs as JSON, and the simulator's media over HTTPS;
  - **EC2 with nested virtualization:** the build box, plus the Vega Virtual Device and the Android TV emulator;
  - **IAM:** a box role limited to Bedrock and Polly;
  - **AWS Budgets and CloudWatch:** spend alarms.
- **Development:** Claude Code agents built the system against fixed contracts.
- **Details:** `docs/product-feedback.md`.

**Open Source.** The repository is MIT-licensed. The two pieces built to be reused are:
- **`couch-link`:** phone-as-controller rooms for React Native for Vega and the web, with no dependencies beyond `WebSocket`, ES2020 and TypeScript 4.8-safe for Vega's Hermes. It includes a reference relay and tests, among them a WebSocket end-to-end run.
- **The crowd engine `packages/crowd`:** a pure, tested reducer that turns phrase timing and words into reactions, camera cuts and an honest scorecard. Its act-pack format is plain JSON.

**[ask]** Fill in the contribution URL, the project repo URL and the GitHub username. Decide whether to publish `couch-link` as its own repository or npm package before submission; a standalone repo makes the contribution easier to judge.

**Product feedback and friction log.** `docs/product-feedback.md` (every tool we used) and `docs/friction-log.md` (32 entries).

---

## Before submitting (not for Devpost)

- [ ] Replace every **TODO(lead R1–R5)** with the final emulator APK's numbers (fps in the set, judge p50/p90 and in-time count, MC and voice timings, load time), and every remaining **[verify]**. Re-run `yarn test` and `yarn test:agent` if the tree changes after 05afe85.
- [ ] **[ask]** Team name and members (`docs/brief.md` still has placeholders).
- [ ] **[ask]** The GitHub repo URL; public with `LICENSE` detected in the About box, or private with the reviewers invited within the last 7 days. The repo has no commits yet.
- [ ] **[ask]** `LICENSE` says "Copyright (c) 2026 Strumble contributors". Change it to the team's name or "Encore contributors"?
- [ ] The YouTube or Vimeo link for the video (public, English, under 3:00).
- [ ] Gallery images per `docs/submission/gallery.md`.
- [ ] Paste the product feedback into Devpost's feedback fields, and the feature requests at the end of `docs/product-feedback.md`.
