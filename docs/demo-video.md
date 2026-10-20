# Demo video: shot list, voiceover and capture plan

**Final plan, 2026-10-19.** It replaces the earlier plan, which had the user performing live on camera. Now the lead records the TV on the Android TV emulator with the scripted test phone, and the user records a voiceover over it.

**Length:** target 2:50; the hard limit is 2:59, because the rules say "less than three minutes".

**Rules for the video:**
- public on YouTube or Vimeo;
- in English;
- no third-party trademarks and no copyrighted music (`docs/brief.md`).

The judges may not run the app, so this video, the Devpost text and the gallery carry the whole score. The script is built to hit each Stage 2 criterion on purpose (the table below).

## Who does what

| Part | Who | Where |
|---|---|---|
| **EMU** clips: every TV shot | the lead | The Android TV emulator, 720p, on `BOX=android`, with the final emulator APK (`~/apk-out/encore-final-emu.apk`). The set is performed by the scripted test phone through `~/emu/qa.sh`. |
| **VO**, the voiceover | the user | Read from the script below, recorded on a quiet mic, and laid over the edit. |
| **GFX**: the title, the problem card, the architecture, the venue ladder, the judge chart, the Appstore card, the end card | the user, in the editor | The sources are named per shot. Every number comes from a doc in the repo. |
| **VVD** insert (optional) | the lead, or reuse | `docs/vega/encore-vvd-take.mp4` (on disk; the repo ignores docs mp4s) or a fresh `apps/vega/tools/vvd.sh record`. |
| **PHONE** insert (optional) | the user | The phone page on the user's own Android phone, if the relay is reachable that day. Otherwise it's left out (see shot 7). |

**Why the emulator.** The FAQ says an "Android TV Emulator or the Fire TV/Vega simulator is fine". We use the Android TV emulator because the Linux Vega Virtual Device has no WebView, and the live 3D room runs in the WebView (`docs/friction-log.md`, 2026-10-11). The Google TV is retired and doesn't appear: it isn't a Fire TV device or an emulator.

## Honesty in this video (rule 6: nothing is faked)

The set in this video is performed by our **scripted test phone** (`services/relay/src/fake-phone.ts` with `services/relay/scripts/standup-demo.json`), not by a person.
- **What it is:** a program that joins the TV's room like a real phone. It sends the same events a real phone sends:
  - voice on and off;
  - each line's timing and levels;
  - the recogniser's words, as in the phone's "service" words mode.
- **How the script shapes its timing:** setups run on; punchlines get a louder ending and a held beat; bits 3 and 4 are delivered "dying" (rushed, no beats).
- **What it decides:** nothing. **The TV's engine decides every reaction, live, from those events**, exactly as for a real phone, and the content judge on Bedrock scores the words live.

So the video must say this, on screen and in the voiceover:
- **A persistent label** in the corner during every set shot: "scripted test phone · reactions computed live".
- **One voiceover sentence** (V4 below) says it plainly.
- **The phone isn't re-voiced.** Nobody reads the script's lines over the take, because that would look like a live performer. The lines appear as subtitles instead, labelled "test phone:", timed from the fake phone's own log (`[phone]` lines).
- **No edits to the room:**
  - no reaction is added, moved, looped, re-timed or sweetened;
  - the dead bits and the heckle stay in;
  - if the MC is unavailable in a take, the screen says why, and we keep that or retake; we never paste a line from another take.
- **The emulator's frame rate is what it is.** Don't speed it up or interpolate it.
- **The video's description** says: "Filmed on the Android TV emulator at 720p (allowed by the hackathon FAQ). The set is performed by a scripted test phone that sends the same events as the phone page; every reaction, caption and MC line is computed live. The Vega insert is the Vega Virtual Device."

## The four criteria, shot by shot

| Criterion | Where the video makes the case |
|---|---|
| **Potential impact** (the customer and the need, an audience beyond the hackathon) | Shot 4 and V2: the problem and the people (comics, open-mic performers, speakers practising a talk, poets, singers). Shot 22 and V9: the route to the Fire TV Appstore. |
| **Quality of the idea** (creative, not obvious) | Shots 5–8 and V3: voice, D-pad and the TV in one flow (the judges' own "creative Fire TV" example). Shots 9–15: a live generated crowd that reacts only to measured moments. Shots 16–18: an honest MC. |
| **Design** (a complete, coherent product, intuitive on a TV) | One unbroken product loop: bill → set → cut sheet → green room, all on OK, Back and the D-pad. Shots 5, 9, 15, 16 and 18 show each remote key doing one obvious thing. |
| **Tech implementation** (incl. AWS Builder) | Shots 19–21 and V8: the pure engine, React Native for Vega plus Android TV, Three.js in the WebView, Strands, Bedrock (GLM-5 on the OpenAI-compatible endpoint), Polly, the honesty guard and the measured judge. Shot 22: the Vega Virtual Device insert. |

## Shot list and voiceover

Times are positions in the finished video. "Real time" means one continuous piece of a take, with no cut inside it. Where we skip forward in a set, the lower-third set clock shows the jump, so the edit is visible. **VO** lines are the user's voiceover (the full read-through script is in the next section). **Never put VO over the MC's voice**: the MC is the product.

### 0:00–0:10 · Cold open

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 1 | 0:00–0:05 | EMU | The club, live. A punchline lands (subtitle "test phone: He didn't say which winter."). After a beat, the director cuts to the floor: the front tables laugh, and the caption top-left gives the reason. Real time from the line's end to the laugh. | The room's laugh, as recorded. |
| 2 | 0:05–0:10 | EMU | A rushed line from a dying bit: the wide holds and nobody laughs. | Room tone, then **V1**. |

### 0:10–0:15 · Title

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 3 | 0:10–0:15 | GFX over EMU | The club wide, dimmed. **ENCORE** in Big Shoulders Display, then "A real audience, honestly scored." Small line: "Fire TV · Amazon Bedrock · Strands Agents · Amazon Polly". | Room tone. |

### 0:15–0:30 · The problem, and who it's for

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 4 | 0:15–0:30 | EMU + GFX | The bill's room preview, empty seats filling. Over it, five words one at a time: **comics · open-mic performers · speakers · poets · singers**. Then "They all rehearse alone." | **V2**. |

### 0:30–0:50 · One flow: the remote, the phone, the TV

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 5 | 0:30–0:38 | EMU | The bill. The D-pad steps the venue Open Mic → Comedy Club → Theatre, and the room behind changes each time (30 seats to 800). Never the Arena: it's cut from the video (user decision, 20 Oct). Then back to the Comedy Club; the MC row set to Sarcastic. Label: "Android TV emulator · 720p". | **V3**, first half. |
| 6 | 0:38–0:44 | EMU | The bill's foot: the QR code and room code, then the phone joins: "Aman's phone is on the table and listening · Press OK to go live". | **V3**, second half. |
| 7 | 0:44–0:47 | PHONE (optional) | The phone page on a real phone: "Start listening", the words toggle, and "Your audio never leaves this phone…". **If it isn't filmed, drop this shot** and hold shot 6. The scripted phone has no screen to show. | No VO. |
| 8 | 0:47–0:50 | EMU | OK. | Room tone. |

Supers during 5–8 (lower left, one at a time): "The remote runs the show." · "The phone is the microphone: it sends timing and levels, never audio."

### 0:50–1:40 · The set at the Comedy Club (about 50 s from one take)

The label "scripted test phone · reactions computed live" stays in a corner throughout. Subtitles carry the script's lines ("test phone: …").

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 9 | 0:50–0:57 | EMU | The MC's intro card over the room, written by GLM-5 for this set. | **The MC's voice** (Brian, Polly). No VO. |
| 10 | 0:57–1:10 | EMU | The first bit: the landlord. The room listens; "He didn't say which winter." lands, with a caption naming the reason ("the punch turns 'winter'" or whatever the take shows). The tag right after it ("This winter, I'm hoping for global warming.") gets a bigger laugh. | **V4** over the listening wide, before the punchline; then the room. |
| 11 | 1:10–1:18 | EMU | A callback or a list of three lands ("Hungry, cricket, and disappointed in me."): different people laugh, and the caption names the pattern. | The room. |
| 12 | 1:18–1:28 | EMU | **The dead bits** (bits 3 and 4 die by script). Rushed lines, no beat; the wide holds. Past the club's patience (3.5 s), the room gets restless, with a murmur caption. | **V5**, then quiet room tone. |
| 13 | 1:28–1:35 | EMU | **The heckle** (the club heckles after two dead bits): the title card with the MC's line, written live, and "HECKLE · 2 dead bits in a row". | Room tone. Heckle cards are text only. |
| 14 | 1:35–1:40 | EMU | The set ends on the script's last line plus 4 s (as if the performer pressed OK). The finale: house lights up, with applause sized by the share of lines the room reacted to. | Applause. |

If a take doesn't heckle, keep its real silence in shot 12 and drop shot 13. Never import a heckle from another take.

### 1:40–2:00 · The cut sheet and the MC's debrief

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 15 | 1:40–1:52 | EMU | The cut sheet. A slow zoom in the edit across the strip: gold cuts are laughs, a striped tile is dead air past 3.5 s. | **The MC's debrief, spoken** (Brian). No VO. |
| 16 | 1:52–2:00 | EMU | The ledger "Measured, not judged": landed per minute, longest dead air and where, pace, fillers, the content row (patterns counted, and "the MC's model read N in time", labelled an estimate). The MC's note, with its source line "written by the MC (GLM-5 on Amazon Bedrock) from the measured set · an opinion". | **V6** (after the debrief ends). |

### 2:00–2:08 · The green room

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 17 | 2:00–2:04 | EMU | Back opens the green room: the sets ledger (laughs per minute per set) and "Hold OK to talk". | **V7**. |
| 18 | 2:04–2:08 | EMU | **Only if captured (see request R4):** OK, the question, then the MC's spoken answer. **Otherwise:** hold on the ledger and the MC's last line. | The MC's voice if shown, else room tone. |

### 2:08–2:34 · How it's built, and why it's honest

| # | Time | Src | Picture | Super |
|---|---|---|---|---|
| 19 | 2:08–2:18 | GFX | The architecture from `README.md`'s Mermaid diagram, built up in three steps: **(1)** the phone → "events, never audio" → the couch-link relay → the TV; **(2)** the crowd engine (pure TypeScript) → the screens, plus `crowdDrive()` at 10 Hz → the live 3D room in the WebView; **(3)** the TV → the MC service (Strands) → Amazon Bedrock (GLM-5) → the honesty guard → Amazon Polly (a presigned URL the TV streams). Side branch: the content judge (Ministral 3 8B on Bedrock plus a CPU humour model). | "One pure engine decides every reaction." · "The MC is the model, or it's silent." |
| 20 | 2:18–2:25 | GFX | The venue ladder, each room's bar: Open Mic 0.42 → Club 0.55 → Theatre 0.66 (the three rooms the video shows; the Arena is cut from the video). One flat line across all three: "house standard 0.55". | "A tougher venue changes the crowd, never the score." |
| 21 | 2:25–2:34 | GFX | The judge chart: Spearman ρ against human ratings on 1,000 held-out jokes. Fast LLMs alone: −0.02 to 0.05 (chance). The "longer punchline" baseline: 0.10. Our mix: 0.34. Small line: "verdict on the TV in about 0.25–0.3 s (p50)". | "We measured our joke judge. Fast models alone were at chance." |

V8 runs across 19–21.

Sources for the numbers:
- shot 20: `docs/concept-encore.md`, Venues;
- shot 21: `docs/judge-calibration.md`, Results, for ρ and the baselines;
- the p50 in shot 21: the emulator's 245 ms (2026-10-13, `docs/handoff/README.md`, "Late update") and the retired Google TV's 285–315 ms (`docs/tv-test-log.md`, round 5). **TODO(lead R2):** replace both with the final take's p50.

### 2:34–2:46 · On Fire TV, and the way to the Appstore

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 22 | 2:34–2:42 | VVD | The same app on the Vega Virtual Device: the bill, then a live set with the MC's voice. Label: "Vega Virtual Device (Vega OS simulator) · the 3D room needs a WebView the Linux simulator lacks, so the room shows licensed video plates there". If no VVD clip is used, show a GFX card with the two builds instead. | **V9**. |
| 23 | 2:42–2:46 | GFX | The Appstore card: "Fire OS build (Android) · Vega OS build (React Native for Vega) · the phone needs no install · acts and venues are JSON packs". Small line: "Not yet tested on a Fire TV device." | **V9**, end. |

### 2:46–2:52 · Close

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 24 | 2:46–2:52 | EMU → GFX | The finale wide, then the end card: "Encore · A real audience, honestly scored". "Open source (MIT): couch-link and the crowd engine". "Amazon Bedrock · Strands Agents · Amazon Polly · Amazon S3 · Amazon EC2". The repo URL **[ask]**. Credits: "Laughter: 'Approx 800 Laughter Only 1' by lonemonk, freesound.org, CC BY 4.0. Avatars and motion: Microsoft Rocketbox (MIT)." | **V10**, then silence. |

**Total: 2:52.**

## Voiceover script (for the user to read)

**Before you read:**
- It's about 330 words, roughly two minutes at an easy pace, which leaves room for the MC and the crowd.
- Read each block inside its window. Pause where you see "…".
- Numbers are written as you say them.

**Words to avoid in the video:**
- "Toastmasters" (a trademark): say "speakers practising a talk" instead.
- Any brand or real venue.

**V1** (0:06–0:10)
> Every laugh in this room was earned. So was every silence.

**V2** (0:16–0:30)
> If you perform, as a comic at an open mic, a speaker practising a talk, a poet, or a singer, you rehearse alone, into silence. A mirror can't laugh. The first time you hear a room react is the night it counts.

**V3** (0:31–0:44)
> Encore turns your TV into that room. Pick the act, the venue and the MC with the remote. Scan the code, and your phone becomes the microphone. No install. It sends timing and levels, never audio.

**V4** (0:57–1:04, over the listening wide, before the punchline)
> This set is played by our scripted test phone. It sends exactly what a real phone sends, and the room decides every reaction live, and tells you why.

**V5** (1:18–1:24, as the dead bits start)
> Dead air counts too. This club's patience is three and a half seconds… and after two dead bits, it heckles.

**V6** (1:52–2:00, after the debrief ends)
> The cut sheet shows only what was measured. The MC writes its note from those numbers. If the model is late, or our guard catches a number the set didn't produce, the MC stays silent and says why.

**V7** (2:00–2:04)
> Between sets, the MC remembers your last six sets.

If shot 18 shows a real question and answer, add: "…and answers you out loud."

**V8** (2:08–2:34)
> Under the hood, one pure TypeScript engine decides every reaction. The TV app is React Native for Vega, with an Android TV build from the same code, and a live 3D crowd drawn in the TV's WebView. The MC is a Strands agent on Amazon Bedrock, using GLM-5, voiced by Amazon Polly. A tougher venue changes the crowd, never the score. And we measured our joke judge against a thousand rated jokes: fast models alone were no better than chance, so we never use them alone.

**V9** (2:34–2:46)
> Fire TV sticks run Fire OS, so our Android build is the road to the Appstore. The same app runs on Vega OS, here in Amazon's simulator. And new acts and venues are data, not code.

**V10** (2:46–2:50)
> Encore. A real audience, honestly scored.

Why each claim is true:
- **V3, "never audio":** CLAUDE.md, honesty rule 4.
- **V4:** `fake-phone.ts`, header comment.
- **V5:** `docs/concept-encore.md`, Venues: Club patience 3.5 s, heckles after 2.
- **V6:**
  - the MC is silent with the reason: rule 5;
  - the guard: `services/mc-agent/src/mc_agent/guard.py`.
- **V7:** memory of the last six records, `storage.ts`.
- **V8:**
  - the pure engine: `packages/crowd`;
  - the two builds: `apps/vega` and `apps/tv-expo`;
  - Three.js in the WebView: `world/CrowdStage.tsx`;
  - the MC: Strands, GLM-5 on Bedrock's OpenAI-compatible endpoint, Polly (`services/mc-agent`);
  - the judge: `docs/judge-calibration.md`.
- **V9:**
  - Fire OS is Android underneath (CLAUDE.md; **untested on a stick**, and the super says so);
  - the Vega build runs on the VVD (`docs/handoff/vega.md`);
  - act packs are JSON (`packages/crowd/src/packs.ts`, `packsAsJson()`).

## Capture plan for the lead (EMU)

**App changes since this plan was written** (`real-v1`, 19–20 Oct; all in the final APK):
- The heckle's MC line now shows. Before, the engine dropped it every time the next bit began at once.
- The LIVE line at the top right wraps within 520 units and no longer runs into the end card.
- No gold flash over the room on a laugh cut (`LightPulse` is off over the 3D room).
- The emulator box's own checkout is synced to `real-v1`: the MC no longer says "Prithvi". The old local changes are stashed (`stash@{0}`, `stash@{1}`).

**Blocker (since 23:17 UTC on 19 Oct):** the AWS account refuses `StartInstances` ("account blocked … account-verification"), so none of E1–E3 or R1/R2/R3/R5 can be captured until the account block is cleared (see the top of `docs/handoff/box-progress.md`).

Use the final emulator APK on the 720p AVD (`~/emu/emu720.sh up`, `wm size` 1280×720, `-gpu host`). Services on the box:
- the relay with `RELAY_DEBUG_ROOMS=1`;
- the MC with the humour model;
- `MC_REGION=us-west-2`, which `~/emu/svc.sh` sets. From ap-south-1 the judge is never in time.

**Check the MC log first** for "judge: humour model loaded" and the warm-up lines.

| Clip | What | How | Takes |
|---|---|---|---|
| **E1** | The bill: a fresh launch, the phone joining, then the D-pad over the Open Mic, the Comedy Club and the Theatre only, never the Arena (about 2 s each), and back to Comedy Club / Sarcastic. | Launch, then `bash ~/emu/qa.sh phone p Aman scripts/standup-demo.json`. Keys: `DPAD_DOWN` to the venue row, from the default Comedy Club: `LEFT` (Open Mic), `RIGHT` ×2 (Club, Theatre), `LEFT` (Club), 2 s gaps; never a third `RIGHT` (the Arena), `DPAD_DOWN` to the MC row (it's already Sarcastic). Record with `~/emu/bk/brec.sh`. | 2 |
| **E2** | **The hero take:** a full stand-up set at the Comedy Club, sarcastic MC, words on, from OK through the finale and the debrief to the green room. | `docs/android-emu/black-2026-10-13/tools/setrun.sh <outdir> standup club standup-demo`. It records the screen and sound, the logcat and the phone log, and walks cut sheet ⇄ green room. Keep the fake phone's default dead bits (3,4) so the heckle can happen. | 2–3 |
| **E3** (optional) | Poetry at the Theatre, for a 3 s "SNAP · … rhymes" cutaway. | `setrun.sh <outdir> poetry theatre poetry-demo`. | 1 |
| **Stills** | The bill, a laugh with its caption, the heckle, the cut sheet, the green room, for the gallery (`docs/submission/gallery.md`). | `adb exec-out screencap -p` during E2. The captions say "scripted test set". | |

**After each take:** save `stats.txt` next to it under `docs/android-emu/<date>-final/`:
- the APK's md5;
- the `[crowd] fps` mean and minimum during the set;
- the MC's model times (intro, between, heckle, debrief) from the MC log;
- the judge's in-time and late counts, with the TV-side p50 and p90;
- the `[mc-voice]` start delays;
- launch to bill, and launch to the 3D room visible.

**Watch every take back once** for crowd glitches (limbs through chairs, a frozen person, a pop, a black frame). If there is one, note its time and pick another take or another moment; never paint over it.

### Measurement requests for the lead (they fill TODOs here and in `docs/devpost.md`)

- **R1 · fps during the hero take (E2).** Report the mean, minimum and p10 of the in-app `[crowd] N fps` lines between OK and the finale, plus the steady state of `crowdtest` per venue on the final APK. The last numbers on record are from 2026-10-19 (pre-final APK, set 23–27 fps while recording; crowdtest 30 fps capped). These go into devpost "Measured".
- **R2 · The judge on the final APK.** Report the in-time count, the late count, and the TV-side p50 and p90 during E2, from the logcat judge lines. The last emulator figure is APK m on 2026-10-13: 41/41 in time, p50 245 ms, p90 288 ms.
- **R3 · The MC and the voice on the final APK.** Report:
  - the model seconds per kind (intro, between, heckle, end, debrief) from the MC log;
  - the `[mc-voice]` delay from OK to the intro playing, and from the cut sheet to the debrief playing;
  - any `unavailable` and its reason.
- **R4 · The green room with a question.** The fake phone answers every `listen` with "nothing heard" (`fake-phone.ts`, `case 'listen'`), so a real spoken question needs a real phone. Two options:
  - film shot 18 with the user's phone, if the relay is reachable;
  - or, if you choose, give the fake phone an `--ask "<question>"` option that answers `listen` with that text. That's a test-tool change, not the app. The video would then label the question "typed by the test phone".

  Until then, shot 18 holds on the ledger.
- **R5 · Load time.** On the final emulator APK, report `am start -W` TotalTime (launch to the first frame) and the time from launch until the 3D room replaces the plate on the bill (the stage's first `ready`/visible in logcat). A warm disk, a second launch. The only figures on record are the Google TV's (historical): a 5.4 s cold start, and the room 12.2 s after launch on APK t.

## Editing rules

- Cut only between pieces of a set, never inside a line-to-reaction moment. The lower-third clock shows every jump.
- No added laughs, no sweetening, no music, no speed changes. Level the mix only (the room, the MC, the VO).
- Keep the VO off the MC's voice and off the moment a reaction lands.
- Every super's number comes from a doc in the repo (listed under each section).
- Burn in English subtitles for the MC, the VO and the test phone's lines ("test phone: …"), and upload an `.srt` too.

## Before upload

- [ ] Runtime ≤ 2:59. English. No third-party marks (including "Toastmasters") and no music. The CC BY laughter credit is on the end card.
- [ ] The label "scripted test phone · reactions computed live" is visible in every set shot.
- [ ] Public on YouTube or Vimeo **[ask: which account]**. Put the link in `docs/devpost.md`.
- [ ] The video's description is the paragraph under "Honesty in this video".

## Plan B: a live take with a real phone (only if there's time)

Optional. A human take is stronger for "a real audience", but the scripted take above is enough and is what we plan for. Signal path:

```
performer's phone (Chrome, https://<laptop LAN IP>:5173/?room=CODE)
   │ Wi-Fi
laptop: yarn dev:companion (:5173) and yarn dev:relay (:8787)     ← light jobs only
   │ ssh -R 8787:localhost:8787   (the box reaches the laptop's relay)
BOX=android: adb reverse tcp:8787 tcp:8787 and tcp:18080 tcp:8080 → the emulator (Encore release APK)
             the MC service on the box (MC_REGION=us-west-2, the humour model)
```

**Before attempting it:**
- **The QR code** points at `config.ts` `LAN_HOST`. It must match the laptop's Wi-Fi address on the day, or the phone can't join; changing it means rebuilding the APK.
- **The room's sound must not reach the phone's mic.** The performer hears the room on headphones, and the video's room audio comes from the emulator's null sink.

**If it's filmed:**
- it replaces shots 10–14;
- V4 becomes "This is a live set into a real phone…";
- the scripted-phone label comes off.
