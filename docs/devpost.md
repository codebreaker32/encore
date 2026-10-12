# Devpost submission: Encore

> **Status:** rewritten 2026-10-12 for submission (replaces the 2026-10-11 draft). Track: **Fire TV**. Mini challenges: **AWS Builder**, **Open Source**.
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
- **No wait for speech.** The service returns a presigned Polly URL, signed locally in about a millisecond, and the TV streams the speech itself, so speech synthesis adds nothing to the model's budget. <!-- src: CLAUDE.md, "presigned Polly SynthesizeSpeech HTTPS URL (600 s, signed locally in about 1 ms)" --> On the TV the intro starts 0.25 s after OK, and the debrief starts 2.1 s after the cut sheet appears. <!-- src: docs/tv-test-log.md, round 5 -->

**The content judge, chosen by measurement.** Can a model judge a joke well enough and fast enough to count, even labelled as an estimate? We set a rule before testing: take the best rank agreement with human ratings among judges that answer within 500 ms (p90) on the real path from the TV, and never take a fast one that is no better than chance.
- **The test set.** 1,000 held-out Reddit jokes from the rJokes dataset, with every repost of a training joke removed, scored against their log-upvotes. <!-- src: docs/judge-calibration.md, "The held-out sample" -->
- **The fast LLMs alone were at chance.** Ministral 3 8B, Ministral 3 14B, Qwen3 32B and GLM-4.7 Flash all scored Spearman −0.02 to 0.05, below a "longer punchlines" baseline (0.10). We say so, and we don't use them alone. <!-- src: docs/judge-calibration.md, Results table -->
- **What shipped.** For stand-up, a CPU humour model (RoBERTa-large fine-tuned on rJokes, MIT, int8 ONNX, about 25–60 ms a line on two CPU threads)<!-- src: docs/judge-calibration.md "Serving RoBERTa" (24/37 ms p50/p90 standalone, 41/62 ms inside the service) --> mixed 0.7/0.3 with Ministral 3 8B on Bedrock. It reaches Spearman 0.34 [95% CI 0.28–0.39] on the held-out jokes. It ranks the strong version of a line above a flat version of the same idea in 17 of our 20 pairs. On the TV the verdict arrives at p50 285–315 ms and p90 366–451 ms, with 0–2 late lines per set. <!-- src: docs/judge-calibration.md "Results" and "What shipped" (ρ 0.339 / 0.341 with shipped maps; 17/20); docs/handoff/README.md "Speed" (285–315 / 366–451 ms, 0–2 late); docs/tv-test-log.md round 5 (41 verdicts, p50 285, p90 366, 0 late) -->
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

### Challenges we ran into

- **Honesty is a design constraint, and it costs features.** Every reaction needs a measured reason, every number on screen must be one the phone can actually measure, and with words off, pace and fillers read "not measured", never 0. We removed things that looked good but couldn't be justified, and we kept the dead bits in the demo.
- **A believable crowd on a TV-stick GPU.** On the 32-bit Mali-G31 Google TV, the club, open mic and theatre run at about 20–24 fps (p50 41–47 ms a frame), and the arena at about 15–19 fps. <!-- src: docs/tv-test-log.md, round 5 (APK j): club 41.2, open mic 44.2, theatre 47.2 ms p50; arena 52.8–64.8 ms p50 --> The last two builds added richer people and regressed the club to about 17 fps. <!-- src: docs/handoff/README.md, "Open" item 1 (APK k/l: about 17 fps, min 10) --> Our target is a steady 30, and we're not there yet on the cheapest hardware. On the 720p Android TV emulator we filmed on, a recorded set ran at 28.4 fps on average (min 24). <!-- src: docs/android-emu/720p-test/stats.txt, "set only: 110 reports, mean 28.4 fps (min 24, max 30)" --> **[verify]** Update these with the final build's numbers.
- **The Vega simulator has no WebView on Linux.** The Vega build runs on the Vega Virtual Device: the bill, a live set, the cut sheet, the MC's voice and the packaged media. But Amazon's Linux simulator ships without the WebView our 3D room lives in, and an app that includes it won't even install until we strip the dependency from a simulator-only repack. We also tried rendering the crowd natively with three.js on `@amazon-devices/expo-gl`. It ran (16–19 fps on the simulator's software GPU), but the simulator's GL surface has no depth buffer, so the people break into shards. <!-- src: docs/dev-setup.md "Vega on AWS"; docs/friction-log.md 2026-10-11 and 2026-10-12 --> So on Vega the room falls back to licensed video plates, and the 3D room is filmed on the Android TV emulator, which the hackathon FAQ accepts. Neither path has been tested on a Vega Fire TV device.
- **New-account model access.** On our new AWS accounts, Bedrock's Converse API refused every model with "Operation not allowed". The OpenAI-compatible endpoint served open-weight models, so the MC runs on GLM-5 there and Claude waits behind a setting. <!-- src: docs/friction-log.md 2026-10-11 -->
- **AgentCore blocked by a zero quota.** The MC is packaged and tested for AgentCore Runtime, but creating the runtime fails: this account's applied quota for agents is 0 in every region we checked, Service Quotas won't accept a request at or below the default, and the support case is pending. The MC runs the same code on EC2 meanwhile. <!-- src: docs/friction-log.md 2026-10-12 "AgentCore runtime creation blocked by a zero default quota" --> **[verify]** Update if the case is answered before submission.
- **Latency you can feel.** Our first voice sent base64 audio inside the answer: it added the synthesis time to every reply, and neither Android's player nor Vega's could open `data:` URIs. Presigned Polly URLs fixed both, plus a `#.mp3` fragment for Vega's player, which picks the format from the URL's extension. The content judge was once late on 23 of 37 lines. The cause wasn't the network: a scorecard function grew quadratically with the set's length and stalled the TV's JS thread. The fix took it to 0 late. <!-- src: docs/tv-test-log.md round 5 -->

### Accomplishments that we're proud of

- **A rehearsal room that reacts in real time without sending audio anywhere.** The phone sends events, never sound.
- **An MC whose every word is model-written, checked against the measurements and spoken aloud,** and which stays silent rather than make something up.
- **A content judge we can defend with numbers,** including the result that the fast LLMs alone were no better than chance.
- **A live 3D audience in the TV's own WebView on the cheapest class of TV hardware,** with its frame rate measured on that hardware and its limits published.
- **One codebase on Vega OS and Android TV,** with the Vega simulator's gaps documented: 28 friction-log entries, each with steps, a workaround and a suggestion. <!-- src: docs/friction-log.md (28 dated entries) -->
- **Tests across the stack: the engine, the MC service, couch-link, the relay and the pitch judge.** **[verify]** Insert the counts from `yarn test` and `yarn test:agent` on the final tree. <!-- static count 2026-10-12, not a run: packages/crowd 97 test() calls in 5 files, couch-link 19, pitch-judge 10 (some are .each), services/relay 16, services/mc-agent 155 test functions plus 23 parametrize decorators -->

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
- **Platform:** Encore is a TV-first app built on React Native for Vega (Vega SDK 0.24), with an Android TV build from the same shared UI.
- **Interaction:** the interaction model is the multi-modal flow the track asks for. The D-pad runs the show, the phone's microphone carries the performance, and you speak to the MC in the green room. The TV answers on screen and out loud.
- **The demo video** was filmed on the Android TV emulator at 720p, which the FAQ allows, because the Linux Vega simulator has no WebView for the 3D room. It also shows the Vega build running on the Vega Virtual Device.
- **Not yet on hardware:** we have no Fire TV device. The Vega build's WebView room and Fire OS sticks are untested.

**AWS Builder.**
- **A multi-service pipeline built around measured facts:**
  - the TV's engine produces the facts;
  - a Strands agent turns them into words with GLM-5 on Bedrock;
  - our guard checks every number;
  - Polly voices the result through presigned URLs that the TV streams directly;
  - a second Bedrock path (Ministral 3 8B plus a CPU humour model) judges each line during the set within a 0.35 s model budget.
- **Infrastructure:** S3 holds the act packs and the simulator's media, and EC2 runs the builds, the renders, the Vega simulator and the Android TV emulator.
- **AgentCore:** the service is written for AgentCore Runtime (the AgentCore SDK's app, a direct-code zip, a keyless forwarder), and runtime creation is blocked by the account's zero quota (friction log).
- **Development:** Claude Code agents built the system against fixed contracts.
- **Details:** `docs/product-feedback.md`.

**Open Source.** The repository is MIT-licensed. The two pieces built to be reused are:
- **`couch-link`:** phone-as-controller rooms for React Native for Vega and the web, with no dependencies beyond `WebSocket`, ES2020 and TypeScript 4.8-safe for Vega's Hermes. It includes a reference relay and tests, among them a WebSocket end-to-end run.
- **The crowd engine `packages/crowd`:** a pure, tested reducer that turns phrase timing and words into reactions, camera cuts and an honest scorecard. Its act-pack format is plain JSON.

**[ask]** Fill in the contribution URL, the project repo URL and the GitHub username. Decide whether to publish `couch-link` as its own repository or npm package before submission; a standalone repo makes the contribution easier to judge.

**Product feedback and friction log.** `docs/product-feedback.md` (every tool we used) and `docs/friction-log.md` (28 entries).

---

## Before submitting (not for Devpost)

- [ ] Re-measure on the final APK and replace every **[verify]**: TV frame rates per venue, the emulator take's fps, judge latency, test counts.
- [ ] **[ask]** Team name and members (`docs/brief.md` still has placeholders).
- [ ] **[ask]** The GitHub repo URL; public with `LICENSE` detected in the About box, or private with the reviewers invited within the last 7 days. The repo has no commits yet.
- [ ] **[ask]** `LICENSE` says "Copyright (c) 2026 Strumble contributors". Change it to the team's name or "Encore contributors"?
- [ ] **[ask]** The house names "Prithvi" (Theatre) and "Wankhede" (Arena) are real venues. The rules forbid third-party trademarks in the video. Rename them or keep them out of frame?
- [ ] The YouTube or Vimeo link for the video (public, English, under 3:00).
- [ ] Gallery images per `docs/submission/gallery.md`.
- [ ] Paste the product feedback into Devpost's feedback fields, and the feature requests at the end of `docs/product-feedback.md`.
