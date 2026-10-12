# Devpost gallery: 8 images

Devpost shows the first image as the project's thumbnail, so image 1 has to read at card size. Use 1920×1080 (16:9) PNG or JPG for every image.

**Honesty rules for the gallery.**
- Every TV image comes from the app running on the Android TV emulator or the Vega Virtual Device, never from a browser render, unless it's labelled as one.
- No image comes from a "test cue": the `crowd3d-v10-*` renders say "test cue, strength 0.85" on screen, which is an injected reaction, so they're out (rule 6).
- Frames from a set run by the scripted test phone (`fake-phone`) are real engine output but not a human performance. Prefer frames from the filmed take (`docs/demo-video.md`, shot A). If a scripted frame is used, its caption says "scripted test set".

**Status key:** **ready** means it can be uploaded as is. **Retake** means a usable file exists but has a problem, listed with it. **To capture** means no file exists yet.

| # | Image | Caption for Devpost | Existing file | Status |
|---|---|---|---|---|
| 1 | **The hero: the club laughing, with the director's reason.** The live 3D room, the LAUGH caption and its reason ("a list of three · 0.7 s beat"), the lower-third and the LIVE line. | "The room laughs only when your timing earns it, and says why." | `docs/android-emu/2026-10-12-night/03-standup-laugh-list-of-three.jpg` (1080p emulator, APK h, scripted test phone); at 720p, `docs/android-emu/720p-test/03-laugh.jpg` ("the punch turns 'winter'", same build and phone) | **Retake** from the filmed set on the final APK. The current frame is from the scripted phone and an older build. |
| 2 | **Tonight's bill.** The running order (Act, Venue, MC), the room previewed behind it, "Aman's phone is on the table and listening", the credits line. | "Pick the act, the room and the MC with the remote. The phone on the table is the microphone." | `docs/android-emu/720p-test/01-bill.jpg` (720p emulator, APK h) | **Ready.** It's 1280×720, so upscale to 1920×1080 or upload as is. **[ask]** Rename "Prithvi"/"Wankhede" first? They don't appear in this frame. |
| 3 | **The dead bit and the heckle.** The heckle card over the club after two dead bits: "HECKLE · 2 dead bits in a row". | "Dead air is measured too. A tough club heckles after two dead bits, in the MC's words, written live." | `docs/android-emu/2026-10-12-night/04-standup-heckle.jpg` (scripted test phone) | **Retake** from the filmed set (only if the real take heckles; otherwise use its restless wide with the murmur caption). |
| 4 | **Words on: poetry at the theatre.** "SNAP · 'moon' rhymes · 0.6 s beat", with the words mode on the LIVE line ("the room judges what you say"). | "With words on, the room also hears what you say: rhymes, callbacks, a list of three." | `docs/android-emu/2026-10-12-night/08-poetry-snap-moon-rhymes.jpg` (scripted test phone) | **Retake.** The frame has an uncovered strip down its right edge (x ≈ 1440 to 1920) at the 1080p emulator's density, and `11-speech-arena-wide.jpg` shows the same. **[verify]** whether it's a stage-fit bug at dpr 2 or a capture artefact, before using either. |
| 5 | **The cut sheet.** The strip of shots (gold laughs, striped dead air), the ledger "Measured, not judged", and the MC's note with its source line. | "Afterwards: your set as an edit timeline, the measured numbers, and the MC's one fix." | `docs/android-emu/2026-10-12-night/06-standup-cutsheet.jpg` and the 720p `docs/android-emu/720p-test/05-cutsheet.jpg` (both scripted test phone, APK h) | **Retake.** These frames say the judge was "16 in time, 11 late" and "21 in time, 6 late", from before the judge fix (APK j: 0 late; `docs/tv-test-log.md` round 5). Take it from the filmed set on the final APK. |
| 6 | **The green room.** The MC's current line, "Hold OK to talk", the sets ledger (laughs per minute per set) and "Next up". | "Between sets, ask the MC anything. It answers out loud and remembers your last six sets." | none current. `docs/mockups/crowd3d-v3-tv-greenroom.png` is an old browser render (v3 look), and `docs/screenshots/tc-greenroom.png` is the earlier photo-plate design. Neither is usable. | **To capture** on the emulator after a real set (demo shot E). |
| 7 | **The phone page.** The performer's phone: the room code, "Start listening", the words toggle, and "Your audio never leaves this phone…". Show the phone alone, or the phone on a coffee table with the TV behind it. | "No install: scan the QR code and the phone is the microphone. It sends timing and levels, never audio." | none | **To capture:** a screenshot from the Android phone in Chrome, plus optionally a photo of it on the table. |
| 8 | **How it works.** The architecture diagram from `README.md` (phone → couch-link → TV engine → 3D room; TV → MC service (Strands) → Bedrock → guard → Polly URL → TV; the judge branch). Add a small strip of three numbers beneath: "judge ρ 0.34 vs human ratings · fast LLMs alone: chance · verdict on the TV ~0.3 s (p50)". | "One pure engine decides every reaction. The MC is the model, or it's silent. A guard checks every number." | the Mermaid source in `README.md` | **To capture:** export it to PNG (Mermaid CLI or mermaid.live), then lay it out at 1920×1080 with the numbers strip. The numbers are from `docs/judge-calibration.md` and `docs/handoff/README.md`. |

## Alternates (if one of the 8 can't be made in time)

| Image | File | Note |
|---|---|---|
| The Vega build on the Vega Virtual Device | `docs/vega/vvd-02-live.jpg` (live screen), `vvd-01-bill.jpg`, `vvd-05-cutsheet.jpg` | **Ready.** Caption: "The same app on the Vega Virtual Device (Vega OS). The Linux simulator has no WebView, so the room falls back to licensed video plates there." It's strong for the Fire TV track and could replace image 4 or 8. |
| The arena from the stage | `docs/android-emu/2026-10-12-night/11-speech-arena-wide.jpg` | **Retake** (the same right-edge strip as image 4). It shows the scale: 20,000 seats, impostors in the far stands. |
| Venue ladder | the bill stepping through the four venues (demo shot B), as a 2×2 grid | **To capture.** "A tougher room changes the crowd, never the score." |
| Laugh variety | `docs/mockups/motion-v2-club-3laughs-after.jpg` | A browser render on the build box, not a device capture. Caption it as a render, if used. |

## Capture notes

- Take every TV frame with `adb exec-out screencap -p` on the emulator (lossless PNG), not from the video, so the type stays sharp.
- 720p frames are what we film; upscale them with a sharp filter (Lanczos) to 1920×1080. The 1080p emulator runs at about 15 fps, which doesn't matter for stills, but its frames must match the shipped look.
- Before uploading, check each frame for:
  - limbs through chairs;
  - a person stuck in the bind pose;
  - a black band at a frame edge;
  - any brand or real-venue name.
