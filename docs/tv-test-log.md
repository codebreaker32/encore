# TV test log

Times are UTC (the laptop clock); IST is UTC+5:30. Device runs on the Skyworth Google TV (MT5867, Mali-G31, 1.4 GB). How to build and drive one: `docs/dev-setup.md`, "Release build" and "Measuring on the TV".

The TV is a household TV. Never send keys unless Encore is the app in front. Since 2026-10-12 the user allows testing whenever the TV is on, with the scripted phone; still never take over while another app is playing media. The user also allows a wake key, only while the screensaver is showing. From 2026-10-12 ~08:20 UTC "no one is watching TV until I say so": free to take over until the user says otherwise. Stop at once when the physical remote is used: a Bluetooth key shows in logcat as `input_get_disposition:EV_KEY … bus=5`. The measuring script does both.

## 2026-10-11: first release APK

**Build.** Two steps (bundle, then Gradle with the bundle task and release lint disabled), 115 MB APK, Hermes bytecode bundle 2.0 MB, media in `res/`. It contains the live-screen memoization, the intro warmed on the bill, plates decoded at view size, and the `com.strumble.tv://crowdtest` link (react-native-webview). It does not have the pooled crowd sound or the grain fix.

**Results** (a scripted set with `fake-phone`, stopped about a minute in, when someone in the house picked up the remote):
- Cold start to first frame: 5.4 s (`Displayed com.strumble.tv/.MainActivity: +5s396ms`). The bill came up connected to the relay with its room code.
- The intro's words now land at once. The model's line ("Aman, five minutes, first time at the Basement. The house hasn't measured you yet.") was on the armed card 1.2 s after OK. The TV also queued its Polly clip and sent the 5.7 s hush 0.13 s after `arm`. **Correction, 2026-10-11 (voice study):** the hush only shows the clip was queued, not that it played. react-native-video 6.19's Android player rejects `data:` URIs (`Source.kt` `isValidScheme`), so the base64 voice cannot have played on Android at all, then or on the debug build. The fix is a presigned Polly HTTPS URL (in progress).
- The live wide shot played its clip with captions at 0:05.
- **Bug found:** the film grain does not tile on this TV. `resizeMode="repeat"` drew one 512 dp tile, with a seam at x≈682 px, and smeared its edge pixels across the rest of the frame (horizontal streaks). This was visible on the bill and the live screen. Fixed by laying out the 4×3 grid by hand on every platform (`world/Plate.tsx`, `Grain`), as web already did.
- Not measured yet: frame pacing (`gfxinfo`) through a whole set, crowd-cue latency, memory during the live set, the cut sheet with the premium debrief voice.

**Next build** (built 15:10, not installed yet: `~/.cache/encore-apk/encore-release-2026-10-11-b.apk`) adds the pooled crowd sound (one preloaded player per cue, rewound per reaction), the grain fix, and the crowd WebView stage (off by default). To check on it: crowd-cue latency, the grain over a whole frame, `gfxinfo` through a full set, then `com.strumble.tv://crowdtest` with the 3D page.

**15:07, disconnected at the user's request** ("Disconnect from the TV for now. We will test it later."). Encore was force-stopped on the TV and the adb routes removed. Reconnect (`adb connect 192.168.1.4:5555`) only when the user says the TV is free.

**16:03, build c on the AWS build box** (`~/.cache/encore-apk/encore-release-2026-10-11-c.apk`, 134 MB). Same code as build b, plus the 3D crowd page packed into `assets/crowd/` (opened from `file:///android_asset/crowd/`). Clean build 4m47s, incremental 27 s, with no memory workarounds. Not installed yet. This is the one to put on the TV next.

**16:05, the stage end to end in a browser** (on the box, SwiftShader): the TV web app replaying the club set with `?crowd=3d`. The iframe received the drive at about 10 Hz (432 in 42 s) and a `shot` on every cut. On the engine's first laugh ("0.5 s after your line · the room's first tonight · cut to the floor"), the director cut the 3D camera to the front row, which laughed: `docs/mockups/crowd3d-v2-e2e-laugh.png`, and the wide `crowd3d-v2-e2e-wide.png`.

**17:01, build d** (`~/.cache/encore-apk/encore-release-2026-10-11-d.apk`, 120 MB; builds b and c removed). It has the crowd page round 2: per-person gestures, the arena, `preview`/`after` modes, and the room's sound in the page from one WebAudio sprite. The TV feed sends `cue` and `duck`, the native CrowdSound stays silent under the stage but still hushes the phone, and `mediaPlaybackRequiresUserAction={false}` is set. The APK carries the `--tv` pack (10.5 MB) and the `com.strumble.tv://stage?crowd=3d` link that runs the whole app over the 3D room. Browser check on the box: the page received one `cue` per reaction (5 by 146 s) alongside the 10 Hz drive. On the TV, check: `[crowd] … fps` and `[crowd] audio running` in logcat (`ReactNativeJS`), the set's frame pacing, memory.

## 2026-10-12: the URL voice, the 3D room on the TV, and a speed sweep

Times UTC (the TV logs in IST, UTC+5:30). Services ran on the laptop until its WSL ran out of memory at 06:18 (VS Code's server took about 3.7 GB of the 6 GB; there is no swap), then on the build box behind one SSH tunnel (`-L 8787 -L 8080 -L 0.0.0.0:5173`), so `adb reverse` and the phone's Windows port forward are unchanged.

**Build a (05:31)**, the presigned-URL voice and the crowd's Batch 1. A stale JS bundle is possible with `~/build-apk.sh`: Gradle does not watch `packages/*`, so the script now runs `:app:createBundleReleaseJsAndAssets --rerun`. On the bill the room drew at 14–15 fps (68 ms, 35 calls, 77k tris), and it looked blocky and wrongly framed: only the top-left quarter of the stage showed, at 2×.

**Build b (05:42).** Two fixes:
- **The fit.** The page logged `view 961×541 css · dpr 1.33 · inner 1920×1080`: Android's WebView reports `innerWidth` after its own zoom. The stage is now sized from `documentElement.clientWidth`, and the WebView has `scalesPageToFit={false}`. The bill now matches the desktop render.
- **The bill's orange streaks.** They were seams between the View bands of `Gradient` at the fractional density. `Gradient` is now a solid layer plus a stretched, tinted alpha ramp per segment (`ramp-h.png`, `ramp-v.png`).

**Sets.**
- **05:49, scripted phone.** The intro voice was queued and then dropped 22 ms later ("intro late or its set gone").
  - At 05:49:14 someone pressed Home. Encore was reopened from the launcher at 05:49:25, without the `stage?crowd=3d` link, so the rest ran on the photo plates. Android froze the hidden WebView's renderer.
- **05:52:59, the user's own phone.** The intro was dropped again, 19 ms after OK.
  - **The debrief voice played on Android**, the first time the MC has been heard on this TV. Queued, then sounding after 1.85 s, ended at 9.7 s.
  - gfxinfo over the set: 1,417 frames, p50 32 ms, p90 36 ms, 1.9% janky, GPU p50 18 ms.
  - Memory: app PSS 198 MB, graphics 49 MB.
- **The user's notes:** the crowd image didn't fit the frame and was a photo, not the room (the photo plates, after the relaunch); the Polly voice is "way too AI"; no intro. From the bill earlier: the walkers' anatomy (twisted necks, sliding feet), chatter that is out of sync and repeats, the crowd doesn't look real, and the expressions don't vary.

**Build c (06:00).**
- **The intro fix.** A remote key reaches React outside its batching on Android TV (and on Vega's RN 0.72). `arm` queued the intro before the new set's state, so for one render the intro met the bill's state and was dropped. `arm` now sets the state first, and `goLive` runs in `unstable_batchedUpdates`.
- **The 3D room is on by default on Android** (`config.crowd3d`; `stage?crowd=off` turns it off).
- **Crowd test logging.** The crowd test forwards the page's `[crowd]` console lines to logcat.
- **The page's speed switches.**

**Speed sweep (06:24–06:31)**, club, `state=listen`, tv preset, 30 fps cap, through `crowdtest?url=…&log=1`.

| Run | p50 ms | p90 ms | Calls | Tris |
|---|---|---|---|---|
| base | 75.8 | 78.8 | 39 | 80.6k |
| res=360 (640×360) | 49.8 | 52.7 | 39 | 80.6k |
| nopost | 71.5 | 75.4 | 38 | 80.6k |
| nograin | 73.8 | 77.5 | 39 | 80.6k |
| nofog,nohaze | 64.7 | 67.6 | 38 | 80.4k |
| noinst (no instanced crowd) | 41.7 | 45.1 | 26 | 43.1k |
| nofront (no front six) | 70.6 | 72.1 | 21 | 48.4k |
| norim | 75.8 | 75.8 | 39 | 80.6k |

- The instanced crowd is about 34 ms of the 76, far beyond its share of triangles. Fill rate is about 26 ms for 56% of the pixels. Haze and fog are about 11 ms, and the final pass plus grain about 6 ms. The front six are about 5 ms.
- aces, noroom, preview, uncapped and lean were not run: the TV's screensaver started at 06:28 and stopped the sweep. Nothing keeps the screen awake over the 3D room, so the next build holds it awake while a set is armed or live (`EncoreApp onAwake`, `expo-keep-awake`).
- The target is p90 ≤ 34 ms. The crowd owner has the numbers.

**Round 2 (07:3x–07:4x), APK e** (Batch 1.5, hands rebuilt by bone group, Rocketbox motion clips, named face shapes, calmer camera, no black cards over the stage, keep-awake). Same scene and cap; volume keys no longer stop the sweep (the user's OK), any other key does.

| Run | p50 ms | p90 ms |
|---|---|---|
| base | 75.0 | 78.0 |
| vlit (crowd lit per vertex) | 59.3 | 63.2 |
| noalpha (no discard on the crowd) | 62.9 | 66.0 |
| farsolid (no discard in far rows) | 68.0 | 70.8 |
| halfinst (half the crowd, 64.2k tris) | 63.3 | 65.9 |
| vlit + noalpha | 55.4 | 59.6 |
| fold (vignette in the tone map) | 74.5 | 78.8 |
| nohaze | 67.9 | 72.0 |
| combo (vlit, farsolid, fold, nohaze) | 47.3 | 66.5–68.5 |
| combo at 800×450 | 33.6 | 84.5–87.3 |
| aa (MSAA) | 87.5 | 91.6 |
| combo + aa | 57.6 | 61.6 |
| lampfix + clothfix | 76.0 | 79.6 |

The crowd's per-pixel lighting and its alpha test are the two big costs. MSAA costs about 12 ms in this WebView, so it stays off on tv. At 800×450 the typical frame meets 30 fps, but about one frame in ten takes 4–5 vsyncs; the crowd owner is finding that stall before round 3.

**Round 3 (08:05–08:12), APK f.** The new tv base: the crowd lit per vertex, opaque bodies with alpha only on the near rows' hair cards, no beams, 800×450, lampfix and clothfix on. Same club scene, `hud=0`. The page now logs `over50` (frames over 50 ms in the last 120) and its own JS time per frame (`cpu`).

| Run | p50 ms | p90 ms | over50 /120 | cpu p50 / p90 ms |
|---|---|---|---|---|
| base | 37–39 | 84 | 33–39 | 22–24 / 28–33 |
| hud | 37 | 78.6 | 34 | 20 / 25 |
| res540 (960×540) | 50.6 | 59 | 69 | 18.4 / 21.4 |
| dynres (down to 640×360) | 34–36 | 70 | 5/27, 14/75 | 21 / 25.6 |
| inst75 | 36 | 79.4 | 28 | 19.6 / 23 |
| nofog | 37.5 | 77 | 28 | 19.8 / 23 |
| lambert (per-pixel lighting back) | 48.7 | 66.3 | 51 | 18.7 / 21 |
| alpha (alpha test back) | 50 | 64–78 | 60 | 18.3 / 23 |
| preview (bill) | 37 | 73 | 24 | 18.8 / 22 |
| arena | 80.8 | 83.5 | 118–119 | 17.6–18.6 / 20–22.5 |

The GPU savings hold (about 11 ms for per-vertex lighting, about 12 ms for opaque bodies), and the typical club frame is near the 33 ms cap. The page's own JS is now about 20 ms per frame on this CPU (about 1 ms on the build box), mostly the new behaviour layer; it serialises with the GPU into the p90 spikes. The arena is GPU-bound at about 80 ms (the tier sprites). Next: page JS to ≤ 6 ms p50 on the TV (motion owner), the 30 fps cap's vsync quantisation and the arena sprites (crowd owner).

**Round 4 (12:4x UTC), APK h** (the 10:05 tree: stage look default, the anatomy pass, content judge, sound variety). Club listen unless noted. The page now logs the rAF period, how late callbacks run, and the draw spacing in vsyncs.

| Run | p50 ms | p90 ms | page cpu p50 / p90 | draws at 2 vsyncs or less |
|---|---|---|---|---|
| base (first run, warm-up) | 36.7 | 77.4 | 27.6 / 40.3 | 29/46 |
| listen, uncapped | 36.3 | 74.6 | 22.3 / 36.8 | 31/51 |
| listen, vsync cap | 33.4 | 70.9 | 16.9 / 20.6 | 39/50 |
| cycle | 36.3 | 73.7 | 21.3 / 32.1 | 35/48 |
| cycle, vsync cap | 36.7 | 75.1 | 19.2 / 25.1 | 38/48 |
| arena | 80.8 | 83 | 13.7 / 15.4 | 0 |
| arena, outline sprites (shape) | 66.5 | 69.8 | 14.1 / 16.4 | 0 |
| arena, fewer tiers | 70.2 | 73.5 | 13.6 / 15.7 | 0 |
| arena, shape + few | 51.4 | 54.5 | 13.9 / 16.2 | 0 |
| classic look | 35.9 | 72.8 | 16.2 / 19.6 | 38/49 |

The display is 60 Hz (`dumpsys display`). The vsync-counting cap gives the best pacing; the frames that miss line up with page-JS spikes. The arena is GPU-bound on its sprite tiers: outline geometry plus fewer tiers cut it by 37%. The stage look costs about the same as classic.

**Round 5 and a words-mode set (14:41–14:53 UTC), APK j** (the v8 crowd plus the arena impostors with no screen or top strip, the judge fix, the product fixes, the bigger laughs).
- **Content judge on the TV path:** 41 verdicts, round trip p50 285 ms, p90 366 ms, max 455 ms, **0 late**. Before the fix (APK i) it was p90 3.7 s and 23 of 37 late: `scorecard()`'s content counts were quadratic in the set's length and stalled the TV's JS thread.
- **Voice:** the intro played 0.25 s after OK and lasted 5.3 s (the set now starts after it). The debrief started 2.1 s after the cut sheet and ran 10 s.

| Run | p50 ms | p90 ms | over50 /120 | page cpu p50 |
|---|---|---|---|---|
| club (vsync cap) | 41.2 | 60.8 | 21 | 17.1 |
| club cycle | 42.4 | 57.7 | 22 | 21.8 |
| club, old time cap | 43.1 | 49.7 | 11 | 22.0 |
| open mic | 44.2 | 58.3 | 22 | 27.4 |
| theatre | 47.2 | 67.7 | 41 | 24.5 |
| arena (impostors) | 64.8 | 118.1 | 68 | 14.8 |
| arena cycle | 52.8 | 113.6 | 63 | 21.1 |
| arena, quad sprites | 88.4 | 168.7 | 98 | 15.4 |
| arena, classic look | 54.0 | 104.1 | 65 | 14.8 |
| arena, no impostors | 66.0 | 123.1 | 74 | 14.6 |
| types4 | 43.2 | 52.5 | 16 | 22.5 |

The club, open mic and theatre run at about 20–24 fps. The impostors gained little, because the arena's new higher framing (the 2/5-alive rule) makes the lit floor crowd the main cost. With today's page JS, the old time cap paces the club better than the vsync cap.
