# Demo video: script, shot list and capture checklist

**Target 2:50, hard limit 2:59** (the rules say "less than three minutes"). The video must be public on YouTube or Vimeo, in English, with no third-party trademarks and no copyrighted music. The judges may not run the app, so this video, the Devpost text and the gallery carry the score (`docs/brief.md`).

**Where it's filmed.**
- **The TV:** the Android TV emulator at 720p on `BOX=android`, the Android build of Encore. The FAQ says "Android TV Emulator or the Fire TV/Vega simulator is fine". We use the emulator rather than the Vega simulator because the Linux Vega Virtual Device has no WebView, and the live 3D room runs in the WebView (`docs/friction-log.md`, 2026-10-11).
- **The Vega build:** a short insert from the Vega Virtual Device shows the same app on Vega OS, labelled as such.
- **The Google TV:** it doesn't count as a Fire TV device, so it doesn't appear.

**Honesty (rule 6: nothing is faked).**
- The set is performed live by the user into a real phone. The room reacts only to what the engine measured.
- The dead bit stays in. If a take gets silence where we hoped for a laugh, the silence is what we show.
- No reaction is added, moved, looped or re-timed. The scripted test phone (`fake-phone`) is never used for footage in this video.
- If the MC is unavailable in a take, the screen says why, and we keep it or retake. We never paste in a line from another take.
- The emulator's frame rate is what it is: about 28 fps at 720p (`docs/android-emu/720p-test/stats.txt`). Don't speed up or interpolate it.

## Sources and labels

| Code | Source | How it's captured | On-screen label |
|---|---|---|---|
| **EMU** | Android TV emulator, 1280×720, `encore_tv34_720` (API 34 Android TV x86, `-gpu host`) | `~/emu/emu720.sh rec start/stop`: x11grab of the 1280×720 window at 30 fps plus the PulseAudio null sink (the room, the MC's voice) | "Android TV emulator · 720p", small, bottom-right corner, first time it appears and in the architecture section |
| **PHONE** | The performer's Android phone, Chrome, the phone page | The phone's own screen recorder (no mic audio) | "the phone page" |
| **CAM** | A second phone or camera filming the performer and the phone on the table | 1080p or higher, 30 fps; its mic records the performer's voice | none |
| **VVD** | Vega Virtual Device (Vega SDK 0.24.12044) on `BOX=vega` | `apps/vega/tools/vvd.sh record 60 out.mp4` (VP9 with the device's sound, converted to H.264) | "Vega Virtual Device (Vega OS simulator)" |
| **GFX** | Title, architecture diagram, calibration chart, end card | Made in the editor from `README.md`'s Mermaid diagram and `docs/judge-calibration.md`'s numbers | n/a |

## Script, shot by shot

Times are positions in the finished video. "Real time" means one continuous piece of the take with no cut inside it. Where we skip forward in a set, the lower-third set clock shows the jump, so the edit is visible.

### 0:00–0:10 · Hook

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 1 | 0:00–0:03 | CAM | The performer (the user) in the living room, mid-set, phone face-up on the coffee table. They land a punchline and hold the beat. | The performer's voice (CAM mic). The room tone under it (EMU). |
| 2 | 0:03–0:07 | EMU | Hard cut to the TV: the front row of the club laughs; the director's caption top-left ("LAUGH · … · 0.6 s beat · cut to the floor"). Real time from the line's end to the laugh. | The room's laugh (EMU), not sweetened. |
| 3 | 0:07–0:10 | EMU | The next line gets nothing: the wide holds and nobody moves. Super, centre-low, white: **"It laughs when your timing earns it. Only then."** | Silence: room tone only. |

The hook uses two real moments from the same take; the set clock in the lower-third shows where they sit. If the take has no dead line right after a laugh, use the take's real dead bit from shot 13 here and let the clock show the jump.

### 0:10–0:16 · Title

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 4 | 0:10–0:16 | GFX over EMU | The club wide, dimmed. **ENCORE**, in Big Shoulders Display, then "A real audience, honestly scored." Small line: "Fire TV · Amazon Bedrock · Amazon Polly". | Room tone. |

### 0:16–0:38 · The bill and the phone

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 5 | 0:16–0:24 | EMU | The bill. The D-pad moves down the running order. Venue: Left/Right steps Open Mic → Comedy Club → Theatre → Arena, and the room behind changes with each, from a cafe with 30 seats to an arena. Back to Comedy Club. MC: Sarcastic. Label "Android TV emulator · 720p". | Room tone per venue. |
| 6 | 0:24–0:31 | PHONE | The phone scans the QR code; the page opens: "Your audio never leaves this phone…". Tap Start listening; switch words on, and the toggle's line says the room judges what you say. | None (or a soft tap sound). |
| 7 | 0:31–0:35 | CAM | The phone goes face-up on the coffee table. The performer steps back to their mark. | Living room. |
| 8 | 0:35–0:38 | EMU | The bill's foot: "Aman's phone is on the table and listening · Press OK to go live". | Room tone. |

Super during 5 to 8 (lower left, one line at a time):
1. "Pick the act, the room and the MC with the remote."
2. "The phone is the microphone. It sends timing and levels, never audio."

### 0:38–1:40 · The set at the Comedy Club

About 60 s on screen, taken from one 3–4 minute set. Keep every piece in real time; jump only between pieces.

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 9 | 0:38–0:46 | EMU | OK. The MC's intro card over the room ("Please welcome…", written by GLM-5 for this set). | **The MC's voice** (Brian, Polly generative), from EMU. |
| 10 | 0:46–0:58 | EMU, with CAM inset (lower right, 25%) | The first bit. A line lands, and the director cuts to the floor: one person laughs first, the laugh spreads back. The caption names the reason ("a list of three · 0.7 s beat"). The bit counter ticks. | Performer (CAM) plus room (EMU). |
| 11 | 0:58–1:06 | EMU, CAM inset | A callback lands bigger: caption "a callback to your first bit". Different people, a different laugh. | As above. |
| 12 | 1:06–1:14 | EMU, CAM inset | **The dead bit.** A line with no beat, then another. The wide holds. Past the club's patience (3.5 s) the room gets restless: people shift, glance away, someone checks a phone. A murmur caption appears. | Performer, then quiet room tone and murmur. |
| 13 | 1:14–1:24 | EMU | **The heckle** (the club heckles after two dead bits): the title card with the MC's line, written live from the measured set ("Two bits in a row got nothing…" in the test run; the real take's words will differ). The caption top-left: "HECKLE · 2 dead bits in a row". | Room tone. Heckle cards are text only; the MC doesn't speak them. |
| 14 | 1:24–1:34 | EMU, CAM inset | The recovery: a short tag right after a laugh gets a bigger one. | Performer plus room. |
| 15 | 1:34–1:40 | EMU | OK ends the set. The finale: the house lights come up, and the applause is sized by the share of lines the room reacted to. | Applause (EMU). |

If the club doesn't heckle in a take (it needs two dead bits in a row), keep the take's real silence in shot 12 and drop shot 13. Never import a heckle from another take.

### 1:40–2:02 · The cut sheet

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 16 | 1:40–1:48 | EMU | The cut sheet. A slow zoom in the edit across the strip: gold cuts are laughs the room gave, a striped tile is dead air past 3.5 s. | **The MC's debrief, spoken** (about 10 s, `docs/tv-test-log.md` round 5). |
| 17 | 1:48–2:02 | EMU | The ledger "Measured, not judged": landed per minute, longest dead air and where, pace, fillers, the content row (callbacks, tags, and the MC's model read "N in time" as an estimate). The MC's note on the right, with its source line "written by the MC (GLM-5 on Amazon Bedrock) from the measured set · an opinion". | The debrief continues. |

Super during 17: "Every number on screen is one the phone measured. Words off? Pace and fillers say 'not measured'."

### 2:02–2:17 · The green room

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 18 | 2:02–2:06 | EMU | Back opens the green room: the sets ledger, "Hold OK to talk". | Room tone. |
| 19 | 2:06–2:09 | CAM, PHONE inset | The performer holds OK and asks the phone: "Which bit should I cut?" The phone page shows it's listening for one question. | Performer (CAM). |
| 20 | 2:09–2:17 | EMU | The MC answers in character, from this set and the earlier ones it remembers. | **The MC's voice** (EMU). |

**[verify]** The green-room voice question hasn't been QA'd since the latest changes (`docs/handoff/README.md`, open item 4). Rehearse it before the real take.

### 2:17–2:43 · How it works, and why it's honest (26 s)

| # | Time | Src | Picture | Sound / super |
|---|---|---|---|---|
| 21 | 2:17–2:25 | GFX | The architecture, built up in three steps (from `README.md`'s Mermaid diagram). **1:** Phone (mic → voice activity → phrases) → "events, never audio" → couch-link relay → TV. **2:** TV: the crowd engine (pure TypeScript) → the bill, live, the cut sheet, plus `crowdDrive()` at 10 Hz → the live 3D room in the WebView. **3:** TV → the MC service (Strands) → Amazon Bedrock (GLM-5) → the honesty guard → Amazon Polly (a presigned URL the TV streams) → back to the TV. A side branch: the judge (Ministral 3 8B on Bedrock plus a CPU humour model). | Supers, one per step: "The phone sends events, never audio." · "One pure engine decides every reaction." · "The MC is the model, or it's silent. A guard checks every number." |
| 22 | 2:25–2:31 | GFX | The venue ladder: Open Mic 0.42 → Club 0.55 → Theatre 0.66 → Arena 0.75 (the room's bar), with one flat line across all four: "house standard 0.55". | "A tougher venue changes the crowd, never the score." |
| 23 | 2:31–2:37 | GFX | The judge chart: Spearman ρ against human ratings on 1,000 held-out jokes. Fast LLMs alone: −0.02 to 0.05 (chance). Punchline-length baseline: 0.10. Our mix: 0.34. Small line: "verdict on the TV in about 0.3 s (p50)". | "We measured the content judge. The fast models alone were at chance, so we don't use them alone." |
| 24 | 2:37–2:43 | VVD | The same app on the Vega Virtual Device: the bill, then a live set with the MC's voice. Label "Vega Virtual Device (Vega OS simulator)". | Super: "The same app on Vega OS. The Linux simulator has no WebView, so the room falls back to video there." |

Numbers in shots 22 and 23: `docs/concept-encore.md` (venue thresholds, house standard), `docs/judge-calibration.md` (ρ, baselines), `docs/handoff/README.md` and `docs/tv-test-log.md` (judge latency on the TV: p50 285–315 ms).

### 2:43–2:55 · Close

| # | Time | Src | Picture | Sound |
|---|---|---|---|---|
| 25 | 2:43–2:49 | EMU | The finale wide from the take, house lights up. **"A real audience, honestly scored."** | Applause tail. |
| 26 | 2:49–2:55 | GFX | End card. "Encore". "Open source (MIT): couch-link and the crowd engine". "Amazon Bedrock · Strands Agents · Amazon Polly · Amazon S3 · Amazon EC2". The repo URL **[ask]**. Credit line: "Laughter: 'Approx 800 Laughter Only 1' by lonemonk, freesound.org, CC BY 4.0. Avatars and motion: Microsoft Rocketbox (MIT)." | Silence. |

Total: 2:55.

## Shot list (for the capture day)

| Shot | Source | What to capture | Takes | Status |
|---|---|---|---|---|
| A | EMU + CAM | A full stand-up set at the Comedy Club, sarcastic MC, words on, 3–4 minutes, the user performing live. It must include at least two landed lines with content captions, one dead bit (ideally two in a row, for the heckle) and a tag. Record from the bill to the cut sheet's debrief. | 3 full takes | to capture |
| B | EMU | The bill, stepping through all four venues slowly (about 2 s per venue) and every MC. | 2 | to capture |
| C | PHONE | Scan the QR code → the page → Start listening → words on → "on the table". | 2 | to capture |
| D | CAM | The phone placed on the table; the performer walking to their mark; wide shots of the room for the inset. | 3 | to capture |
| E | EMU + CAM + PHONE | The green room: Back, hold OK, one spoken question, the MC's spoken answer. Right after a take of A, so the memory holds real sets. | 3 | to capture |
| F | VVD | The Vega build: the bill, OK, about 20 s live, the cut sheet with the debrief's voice. `docs/vega/encore-vvd-take.mp4` is a usable fallback, but it predates the intro fix (`docs/handoff/vega.md`, "Next steps" 4). | 1 | retake or reuse |
| G | GFX | Title, the architecture build, the venue ladder, the judge chart, end card. | n/a | to make |
| H | EMU (optional) | A short poetry piece at the Theatre ("SNAP · 'moon' rhymes"), as a 3 s cutaway in shot 21 if time allows. | 1 | optional |

## Signal path for a live take on the emulator box

```
performer's phone (Chrome, https://<laptop LAN IP>:5173/?room=CODE)
   │ Wi-Fi
laptop: yarn dev:companion (:5173) and yarn dev:relay (:8787)     ← light jobs only
   │ ssh -R 8787:localhost:8787   (the box reaches the laptop's relay)
BOX=android: adb reverse tcp:8787 tcp:8787 and tcp:18080 tcp:8080 → the emulator (Encore release APK)
             MC service on the box (:8080, instance role: Bedrock and Polly; MC_HUMOR_MODEL_DIR=~/models/humor-int8)
   │ the emulator's screen and sound: x11grab + the null sink (recorded), plus a live view for the performer
performer watches and hears the room on the laptop (VNC or a low-latency stream) **[verify]**
```

- The QR code points at `config.ts` `LAN_HOST`. Check it matches the laptop's Wi-Fi address on the day, or the phone can't join. Changing it means rebuilding the APK.
- **Room sound must not reach the phone's mic.** The TV hushes the phone while it plays a cue or the MC's voice, but a streamed copy arrives late, so its tail could count as the performer. So the performer hears the room on headphones or one earbud, and the room's audio in the video comes from the null sink. **[verify]** Rehearse it once. If headphones show in shot, that's fine; it's the truth.
- Nothing is exposed publicly: the box reaches the laptop through the reverse tunnel, and the emulator reaches the box through `adb reverse`.

## Capture checklist

**The day before**
- [ ] Build the release APK for the emulator (x86 + x86_64) from the final tree, with the crowd page packed with `--tv`. Note its md5 in the take's `stats.txt`.
- [ ] Smoke-test the crowd page on the build box (`~/tools/pw/smoke-crowd.mjs`): calls, triangles and texture MB per venue.
- [ ] Rename or avoid the house names "Prithvi" and "Wankhede" (real venues; no third-party trademarks in the video). **[ask]**
- [ ] Rehearse the green room (shot E) and the audio path end to end.
- [ ] Pick the material. The performer brings real stand-up with a callback, a list of three and a tag, plus one bit that may well die. The room decides; we don't rig it.

**Before each take**
- [ ] `BOX=android` up (launched from its image in us-west-2 in place of the render box; 8 vCPU per region). `~/emu/emu720.sh up`, then check `wm size` is 1280×720.
- [ ] Relay and phone page on the laptop; the reverse tunnel; MC on the box with the humour model (the log says "judge: humour model loaded") and warm voices for all four personas ("warm-up: voices warm …").
- [ ] Open the app with the 3D stage (it's the default on Android; `com.strumble.tv://stage?crowd=3d` if relaunched).
- [ ] The phone: Chrome on Android (words need it), volume and notifications off, Do Not Disturb, screen recorder ready for shots C and E.
- [ ] CAM: focus on the performer, 30 fps, mic on, the phone on the table in frame.
- [ ] Start the logcat capture, the MC log and `emu720.sh rec start` before OK, so the take keeps its evidence: the `[crowd] fps` lines, `[mc-voice]` traces, judge timings and the phone's event log.
- [ ] One sharp clap in view of CAM before OK, a reference for the editor.

**During the take**
- [ ] Perform the whole set. Don't stop for a dead bit.
- [ ] Don't touch the emulator except with the remote keys the performer would press (OK, Back).
- [ ] If the MC says "unavailable", keep going. That take shows the honest state.

**After each take**
- [ ] `emu720.sh rec stop`, then save `stats.txt` next to the take (the APK md5, mean and min fps, MC timings, judge in-time and late counts) under `docs/android-emu/<date>-final/`.
- [ ] Screenshots of the bill, a laugh with its caption, the heckle, the cut sheet and the green room for the gallery (`docs/submission/gallery.md`).
- [ ] Watch the take back once for crowd glitches (limbs through chairs, a frozen person). If there is one, note its time. Don't paint over it in the edit; pick another take or another moment.

**Editing rules**
- [ ] Align CAM's audio to the emulator recording **once**, for the whole take: the performer's voice must stop where the phone's `line` event ends (from the phone log, through `started.startedAt`), and the clap confirms it. Never slide it per line.
- [ ] Cuts happen only between pieces of a set, never inside a line-to-reaction moment. The lower-third clock shows every jump.
- [ ] No added laughs, sweetening, music or speed changes. Level the mix only (performer and room).
- [ ] Every super's number must come from a doc in the repo (listed under each section above).
- [ ] Burn in English subtitles for the performer and the MC, and upload an `.srt` too.

**Before upload**
- [ ] Runtime ≤ 2:59. English. No third-party marks or music. The CC BY laughter credit is on the end card.
- [ ] Public on YouTube or Vimeo **[ask: which account]**. Put the link in `docs/devpost.md`.
- [ ] The video's description says: "Filmed on the Android TV emulator at 720p (allowed by the hackathon FAQ); the Vega insert is the Vega Virtual Device. Every reaction is live; nothing is scripted."
