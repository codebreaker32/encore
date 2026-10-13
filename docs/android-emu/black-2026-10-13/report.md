# Black screens: hunt on the Android TV emulator, 2026-10-13

The user reported black screens on the Google TV. On the 720p Android TV emulator (BOX=android) we recorded every flow at 30 fps and scanned each frame. A frame was flagged when its mean luma was under 12, when more than 85% of its pixels were under luma 20, or when it had a flat band at the right edge.

**Builds:**
- APK o was the baseline (`encore-release-2026-10-13-o-emu.apk`).
- `…-o-blackfix2-emu.apk` is the same build plus the shell fixes below.

**What we ran:**
- launch, then 6 venue changes;
- venue keys pressed during the first load;
- 7 scripted sets: stand-up in all four venues, poetry at the Theatre, speech at the Arena, singing at the Open Mic;
- each set went bill → live → finale → cut sheet ⇄ green room → bill;
- every reaction setup in every venue, forced through crowdtest.

No logcat showed a crash, ANR, renderer loss, lmkd kill or JS error.

Evidence is in this folder: `frames/` (12 jpgs), `clip-*.mp4` (git-ignored), `setups-theatre-sheet.jpg`, `evidence.txt`, and `tools/` (the scanner and drivers).

| # | What | Black for (emulator / TV) | Owner | Severity | Status |
|---|---|---|---|---|---|
| 1 | A venue reload shows the WebView's empty black page | 1.3–2.7 s / 7–8 s, 14 s or more with keys pressed mid-load | app shell | High | fixed |
| 2 | "Black after a laugh": a cut to the Theatre fly-gallery wide | 6.3–7.4 s | crowd page | High | crowd agent |
| 3 | The intro card is plain black while the next room loads | 4.5 s / 7–8 s | app shell | Medium | fixed |
| 4 | A page loaded during a set draws with no camera placed | 2.8 s after ready | crowd page | Medium | crowd agent |
| 5 | A dark flat band at the right edge (the Arena also at the bottom) | the whole shot | crowd page | Medium | fixed by the crowd agent, edge fill |
| 6 | A lost WebView renderer would leave the stage black for good | not seen | app shell | Medium (latent) | fixed, untested |
| 7 | A 66 ms blip when the bill's plate changes | 2 frames | app shell | Low | proposed: prefetch the four plates |

## 1. Venue change: black until the page rebuilds (High, fixed)

**When:**
- Left or Right on the bill's venue row;
- green room → bill, when the debrief moved the selection to another room;
- OK on the cut sheet, when the next set is in another room.

**Cause:**
- The page reloads itself for the new room (`crowd.js` `location.replace` with the new `venue=`).
- The shell set `stageVisible` once, on the first `ready`, and never cleared it. So the bill dropped its plate over a black WebView.
- A venue posted while a page is still loading is lost. On the TV, three Right presses during the first load each restarted a load of more than 25 s, which explains the 77 s first appearance.

**Fix:** `world/stageGate.ts` (new, pure, 7 vitest tests).
- `pageVenueOf(url)` and `stageShows(readyFor, wanted)` decide visibility.
- `VENUE_SETTLE_MS = 700`.
- `CrowdStage.tsx`: `onLoadStart` records the room being loaded and clears readiness. `onVisible(visible)` stays false until a page built for the wanted room says ready.
- `EncoreApp.tsx`: `onStageVisible(visible)` can now clear the flag, so the wanted room's plate shows meanwhile.
- `crowdFeed.ts`: on the bill, the venue message waits for 700 ms of rest, so a scroll through the venues reloads the page once.

**Verified on the fix build:**
- no black interval in 6 venue changes, nor in a fast 3-key scroll;
- the scroll reloaded the page once, not three times.

## 2. "Black screen follows after laugh": the Theatre fly-gallery wide (High)

**When:** right after a reaction at the Theatre.
- Stand-up set: a laugh, then mean luma 12 for 7.2 s (21 before the laugh).
- Poetry set: a snap, then 1.1 s plus 6.3 s of black.
- No other venue went under mean luma 15 during a set.

**Cause:**
- The setup: `director.js` "high wide from the fly gallery: the ripple" uses `'close'` lighting and lists no seats.
- The lighting: close lighting dims every crowd member to 20%, and the front people to 12% unless they are in frame. From 3.9 m up almost everyone is dimmed, so the ripple the setup was made to show is in the dark.
- The picker favours setups without seats on big laughs, and the shot then holds for the Theatre's 6.5 s minimum.

**Forced setups, mean luma:**
- Theatre setup 3 is the darkest at 16.8 (median luma 3); setups 4, 5 and 7 are 18.6–20.
- Club setup 8 is at 23.
- Nothing in the Open Mic or Arena reads as black.

**Fix proposed:**
- light the setups with no seats as `'wide'` (`director.js`), or treat them as wide in `applyShotLight`;
- add a minimum-brightness gate to the setup harness.

## 3. The intro card is plain black while the next room loads (Medium, fixed)

**When:** OK on the cut sheet starts the next set in another room.

**Cause:** with the stage hidden, `LiveScreen` drew its plain black intro card.

**Fix:** while the 3D room isn't showing, `LiveScreen.tsx` puts the armed intro card over the room's wide plate, in its translucent style. Verified on the fix build.

## 4. A page loaded during a set draws with no camera (Medium)

**What:** the page starts in live mode with no shot and `cutAt = 0`.

**Cause:**
- `hostShot` holds back the wide for `CLOSE_MIN_SEC`.
- `placeCamera` returns early meanwhile, leaving the camera at the origin, under the floor.
- On the fix build that showed as mean luma 13.8 for 2.8 s after ready.

**Fix proposed:** in `hostShot`, `if (!shot) return cut(want);` before the hold check.

## 5. Dark band at the right edge (Medium)

**Where:**
- **Arena:** a flat dark band over the right ~13% and the bottom ~7% of the live wides.
- **Theatre:** about 4%.
- **Club:** none.

**Cause and fix:** the crowd agent found that the band is the page background, showing when the WebView viewport is wider than 16:9. The stage now fills each axis on its own; see `docs/mockups/edge-fill-v1.png`. The Arena's bottom band needs to be confirmed as gone with that fix.

## 6. A lost renderer would leave the stage black for good (latent, fixed)

**Cause:** `CrowdStage` had no `onRenderProcessGone` handler, so a renderer killed for memory would have left a black stage until the app restarted.

**Fix:** the handler logs `[crowd] renderer gone (crashed|killed): a new stage`, clears readiness so the plate shows, and remounts the WebView (`key={life}`). It isn't exercised: the emulator is a user build without root.

**Memory:**
- Encore's PSS on the emulator: 164–191 MB.
- The renderer at the club bill: 266 MB RSS.
- The Google TV on APK o: Encore 128 MB PSS, with 479 MB available.

## 7. A short blip when the bill's plate changes (Low)

Each venue key gives a 2-frame dark blip while the plate shows, as the new plate decodes. Fix proposed: prefetch the four bill plates.

## Checked and clean

- launch;
- title cards over the room (the darkest was the club intro at mean luma 17);
- the finale;
- live → cut sheet, and cut sheet ⇄ green room;
- singing.

## Emulator-only note

The emulator crashed once: the host's OOM killer took `qemu-system-x86` at 14.6 GB. qemu's host memory grows about 170 MB per app relaunch and about 25 MB per in-app venue reload, which is a host GPU-emulation leak. Restart the emulator before long filming sessions.
