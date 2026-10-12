# TV A/B sweep: where the Mali-G31 frame time goes

The page is packed with `node tools/pack.mjs <out> --tv`; every switch below is in the packed build. Each run is the club
wide shot (`state=listen`), tv preset (960×540), HUD on. With `log=1` the page prints this line every 2 s:

`[crowd] sweep <label> · <fps> fps · p50 <ms> ms · p90 <ms> ms · max <ms> ms · <calls> calls · <tris> tris · <W>x<H>`

The same numbers (fps, ms, p50, p90, max, aa, calls, tris) go out as the `stats` message. The HUD prints p50, p90 and
max over the last 120 frames, top left.

**Where the numbers show up**
- `CrowdTest.tsx` passes `onMessage={() => undefined}` to its WebView, so the stats message is dropped in crowdtest mode.
  The `[crowd] N fps` lines in logcat come from the app's own stage (`CrowdStage.tsx`), not from crowdtest.
- So the sweep prints its own line with `console.log`. Android's WebView normally sends console messages to logcat
  under the tag `chromium` (`[INFO:CONSOLE(…)] "[crowd] sweep …"`): run `adb logcat -s chromium:I | grep "crowd] sweep"`.
- If nothing shows: read the HUD on screen, or have CrowdTest log the stats message (one line, apps/tv-expo, not mine).

**Running it**
- Run each for about 20 s and take the last two lines (the first 120 frames include loading).
- The 30 fps cap is already the tv default (`fps=30`), so `base` is the capped run. `fps0` is optional.
- **Encoding:** the inner URL is fully percent-encoded (`encodeURIComponent`), so its `&` become `%26` and survive
  both `adb shell` and `crowdTestUrl()`'s `[?&]url=([^&]+)`. An unencoded inner URL would be cut at its first `&`.

| Label | Switch | Command |
| --- | --- | --- |
| base | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26label%3Dbase"` |
| res360 | `&res=360` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26res%3D360%26label%3Dres360"` |
| nopost | `&ab=nopost` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnopost%26label%3Dnopost"` |
| nograin | `&ab=nograin` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnograin%26label%3Dnograin"` |
| nofog | `&ab=nofog,nohaze` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnofog%2Cnohaze%26label%3Dnofog"` |
| noinst | `&ab=noinst` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnoinst%26label%3Dnoinst"` |
| nofront | `&ab=nofront` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnofront%26label%3Dnofront"` |
| norim | `&ab=norim` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnorim%26label%3Dnorim"` |
| aces | `&ab=aces` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Daces%26label%3Daces"` |
| noroom | `&ab=noroom` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnoroom%26label%3Dnoroom"` |

**Optional extra runs**

| Label | Switch | Command |
| --- | --- | --- |
| preview | `state=preview` instead of listen (the bill measured on the TV) | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dpreview%26hud%3D1%26log%3D1%26label%3Dpreview"` |
| fps0 | `&fps=0` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26fps%3D0%26label%3Dfps0"` |
| lean | `&res=360&ab=nopost,nofog,nohaze,norim` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26res%3D360%26ab%3Dnopost%2Cnofog%2Cnohaze%2Cnorim%26label%3Dlean"` |

**How to read it**
- `res360` cuts pixels by 2.25×. If its p50 falls close to proportionally, the GPU is fill-bound: fragment shading and
  overdraw.
- `noroom`, `noinst` and `nofront` split the cost by object group.
- `nopost` (the full-screen pass), `nofog`, `norim` and `aces` price single shader terms on every lit pixel.
- `lean` stacks the cheap switches to show the floor.

**Switches (crowd.js header):** `&ab=` takes norim, nopost, nograin, aces, nodither, noorder, nofog, nohaze, nofront,
noinst and noroom; also `&res=360|540|720|1080`, `&fps=`, `&noaa`/`&aa`, `&log=1&label=`. Each one costs nothing when
off.

## Round 2: what costs in the instanced crowd, and candidate fixes (2026-10-12)

Round 1 on the Google TV (p50 / p90 ms):

| Run | p50 / p90 ms |
| --- | --- |
| base | 75.8 / 78.8 |
| res360 | 49.8 / 52.7 |
| nopost | 71.5 / 75.4 |
| nograin | 73.8 / 77.5 |
| nofog (with nohaze) | 64.7 / 67.6 |
| noinst | 41.7 / 45.1 |
| nofront | 70.6 / 72.1 |
| norim | 75.8 / 75.8 |

The six front people (32k triangles) cost about 5 ms. The instanced crowd (37k triangles) costs about 34 ms. Both use
Lambert, but the crowd draws its whole body alpha-tested (a discard on every fragment), which costs early depth
rejection and Forward Pixel Kill on every hidden layer of the rake.

Round 2 separates the fragment cost from the discard cost and tries fixes:
- `vlit` lights the crowd per vertex: same pose, same look on the box; a fragment only samples, tints and tone-maps.
- `noalpha` removes the crowd's alpha mask and discard everywhere. Hair cards draw solid.
- `farsolid` removes them only in the far and xfar bands, where the cards read as hair blobs.
- `halfinst` draws half the instances: if it saves about half of 34 ms, the crowd's cost scales with people, not
  with one heavy pass.
- `fold` puts the vignette and band into the tone map and drops the full-screen pass.
- `nohaze` drops the beam cones alone (round 1 measured them together with fog).
- `combo` is the candidate fix; `combo450` adds 800×450.

| Label | Switch | Command |
| --- | --- | --- |
| base | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26label%3Dbase"` |
| vlit | `&ab=vlit` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dvlit%26label%3Dvlit"` |
| noalpha | `&ab=noalpha` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnoalpha%26label%3Dnoalpha"` |
| farsolid | `&ab=farsolid` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dfarsolid%26label%3Dfarsolid"` |
| halfinst | `&ab=halfinst` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dhalfinst%26label%3Dhalfinst"` |
| vlitnoalpha | `&ab=vlit,noalpha` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dvlit%2Cnoalpha%26label%3Dvlitnoalpha"` |
| fold | `&ab=fold` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dfold%26label%3Dfold"` |
| nohaze | `&ab=nohaze` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dnohaze%26label%3Dnohaze"` |
| combo | `&ab=vlit,farsolid,fold,nohaze` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dvlit%2Cfarsolid%2Cfold%2Cnohaze%26label%3Dcombo"` |
| combo450 | `&ab=vlit,farsolid,fold,nohaze&res=450` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dvlit%2Cfarsolid%2Cfold%2Cnohaze%26res%3D450%26label%3Dcombo450"` |

**Round 2, two more runs: MSAA.** The tv preset draws without anti-aliasing and the TV upscales it 1.33×. Mali resolves
4× MSAA on chip, so it is often cheap. `&aa` asks for an antialiased context; the HUD prints `aa on` when the
WebView grants it. If MSAA costs under 2.5 ms of p90, it becomes the tv default.

| Label | Switch | Command |
| --- | --- | --- |
| aa | `&aa` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26aa%26label%3Daa"` |
| comboaa | `&ab=vlit,farsolid,fold,nohaze&aa` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26ab%3Dvlit%2Cfarsolid%2Cfold%2Cnohaze%26aa%26label%3Dcomboaa"` |

## Round 3: the new tv base (2026-10-12)

Round 2 on the Google TV (p50 / p90 ms):

| Run | p50 / p90 ms |
| --- | --- |
| base | 75.0 / 78.0 |
| vlit | 59.3 / 63.2 |
| noalpha | 62.9 / 66.0 |
| farsolid | 68.0 / 70.8 |
| halfinst | 63.3 / 65.9 |
| vlitnoalpha | 55.4 / 59.6 |
| fold | 74.5 / 78.8 |
| nohaze | 67.9 / 72.0 |
| combo | 47.3 / 66.5–68.5 |
| combo450 | 33.6 / 84.5–87.3 |
| aa | 87.5 / 91.6 |
| comboaa | 57.6 / 61.6 |
| lampfix+clothfix | 76.0 / 79.6 |

**The tv base now** (`P.fast`, every venue):
- the crowd lit per vertex (vlit, with the rim per fragment);
- opaque bodies, with alpha only on the near rows' hair cards (a second group in the same draw);
- the far rows' hair cards dropped;
- no haze beams;
- 800×450, the lamp fix, clothes muted;
- no MSAA, no fold.

To undo them: `&ab=lambert`, `&ab=alpha`, `&ab=haze`, `&res=540`.

**Spikes**
- The p90 gap at 450 lines (p50 33.6, p90 85: one frame in ten takes 4–5 vsyncs) fits the DOM repaints. The page
  rewrote the caption's HTML every 15 frames, and the HUD repainted every 0.5 s: about three text repaints a second.
- The caption is now written only when it changes, and the HUD updates once a second. The sweep runs with `hud=0`;
  `hud` prices the HUD.
- On the box, the JS heap allocates about 1.8 MB/s, with two minor GCs (3 ms) in 15 s, so GC is not the likely cause.
- The log line now adds `over50 N/120` (frames over 50 ms) and `cpu p50 / p90` (the page's own JS per frame, to
  the end of render()). High p90 with low cpu means the GPU or the compositor holds the frame.

**Runs**
- `dynres` starts at 540 lines and steps down on cuts while p90 is above 34 ms. Its run uses `state=cycle`
  (a cut every 10 s), because `state=listen` never cuts.

| Label | Switch | Command |
| --- | --- | --- |
| base | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Dbase"` |
| hud | `hud=1` instead of 0 | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D1%26log%3D1%26label%3Dhud"` |
| res540 | `&res=540` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26res%3D540%26label%3Dres540"` |
| dynres | `&res=540&ab=dynres`, state=cycle (cuts every 10 s) | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26res%3D540%26ab%3Ddynres%26label%3Ddynres"` |
| inst75 | `&ab=inst75` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26ab%3Dinst75%26label%3Dinst75"` |
| nofog | `&ab=nofog` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26ab%3Dnofog%26label%3Dnofog"` |
| lambert | `&ab=lambert` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26ab%3Dlambert%26label%3Dlambert"` |
| alpha | `&ab=alpha` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26ab%3Dalpha%26label%3Dalpha"` |
| preview | `preset=tv&venue=club&state=preview&hud=0&log=1` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dpreview%26hud%3D0%26log%3D1%26label%3Dpreview"` |
| arena | `preset=tv&venue=arena&state=listen&hud=0&log=1` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Darena"` |

## Round 4: the frame cap, the club at tables, the arena's sprites (2026-10-12)

Round 3 on the Google TV, APK f, p50 / p90 ms:
- base 37–39 / 84 (over50 33–39 of 120);
- res540 50.6 / 59;
- dynres 34–36 / 70;
- lambert 48.7 / 66.3;
- alpha 50 / 64–78;
- arena 80.8 / 83.5.

Page JS was 18–24 ms p50.

**The cap.**
- The display runs at 60 Hz, so frames land on 33 / 50 / 67 / 83 ms, and a p90 of 84 means some frames take five
  vsyncs.
- The old cap compares rAF timestamps: it draws when at least 29.3 ms have passed since the last draw's timestamp. If
  a WebView's timestamps follow when the callback ran rather than the vsync, a frame whose own JS ran late makes the
  next on-time callback look early. That callback is skipped, which costs a vsync. With 20 ms of page JS this is
  plausible.
- `&ab=vsync` counts vsyncs instead (`round(dt / period)` per callback): it draws every second one, and at once
  after a late one.
- Every run's log line now ends with three diagnostics:
  - `raf <period>`: the median rAF period. About 16.7 ms means vsync-aligned callbacks.
  - `late p50 / p90`: how long after its own timestamp each callback ran. Large values mean the timestamps are not
    vsync times.
  - `draws in vsyncs 1:… 2:… 3:… 4:… 5+:…`: draw-to-draw spacing since the last line. With the cap, 2 is on time, 3
    is one vsync missed, 5+ is a spike.
- Compare base, `fps=0` (uncapped) and `ab=vsync`, on listen and on cycle (cycle has cuts and close-ups).

**Page JS (render's share).**
- Bone trees are out of the renderer's walk: 480 of the club's 612 nodes are bones.
- A skeleton is recomputed and its bone texture uploaded only on frames where its person was posed or moved, so half
  the time on the TV's half-rate frames.
- Front people dimmed out of focus in a close-up update at a quarter rate.
- The WebGL 2 morph attributes are hidden from the per-frame buffer walk (59 attributes, 1.2 MB of vertex buffers never
  bound).
- On the box at 8×: render 9.7 → 9.0 ms p50, 16.2 → 14–17 ms p90; page JS 16–17 ms p50 (noisy). Person.update (the
  motion agent's) is 5.3 ms of it.
- The card split stays: merging bodies and cards into one draw brings back discard for the whole body, which cost
  12 ms of GPU in round 2.

**The club** is now seated at tables in every row, with a lower wide. On the box: 44 calls, 74k tris, 26.6 MB.

**The arena** (all new switches):
- `spritesort`: the ~7k tier sprites nearest the camera first, so nearer rows write depth before the ones behind are
  shaded. The picture is unchanged.
- `spriteshape`: each sprite is an outline fan (15 triangles a person) with no discard, so Mali can kill hidden pixels
  before shading. Cost: +123k triangles, 188.7k in all.
- `fewtiers`: no upper ring, and lower tiers 12 rows deep (4.1k sprites, from 7.2k).
- Impostor patches (one baked quad per block of people) need the user's OK under the plan's rules, so they are not
  built.

**The look.** The stage's-eye look is the default now (the user approved it on 2026-10-12), so `base` and every run
below use it. `classic` prices the old look.
- Lit faces only in rows 0–1: in the box's face probe (tools/render/faceprobe.mjs), rows 2+ have a median display
  value of 0.03 or less in the theatre and the arena, and 0.03–0.09 in the club and the open mic. The probe also
  catches the haze behind silhouettes there.
- The far level's rim flecks are fixed: back faces no longer take the rim, and the far levels' rim is softer.

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| base | `venue=club state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Dbase"` |
| listen-fps0 | `venue=club state=listen` | `fps=0` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26fps%3D0%26hud%3D0%26log%3D1%26label%3Dlisten-fps0"` |
| listen-vsync | `venue=club state=listen` | `ab=vsync` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26ab%3Dvsync%26hud%3D0%26log%3D1%26label%3Dlisten-vsync"` |
| cycle | `venue=club state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dcycle"` |
| cycle-fps0 | `venue=club state=cycle` | `fps=0` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26fps%3D0%26hud%3D0%26log%3D1%26label%3Dcycle-fps0"` |
| cycle-vsync | `venue=club state=cycle` | `ab=vsync` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dvsync%26hud%3D0%26log%3D1%26label%3Dcycle-vsync"` |
| arena | `venue=arena state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Darena"` |
| arena-sort | `venue=arena state=listen` | `ab=spritesort` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dspritesort%26hud%3D0%26log%3D1%26label%3Darena-sort"` |
| arena-shape | `venue=arena state=listen` | `ab=spriteshape,spritesort` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dspriteshape%2Cspritesort%26hud%3D0%26log%3D1%26label%3Darena-shape"` |
| arena-few | `venue=arena state=listen` | `ab=fewtiers` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dfewtiers%26hud%3D0%26log%3D1%26label%3Darena-few"` |
| arena-shapefew | `venue=arena state=listen` | `ab=spriteshape,spritesort,fewtiers` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dspriteshape%2Cspritesort%2Cfewtiers%26hud%3D0%26log%3D1%26label%3Darena-shapefew"` |
| classic | `venue=club state=listen` | `look=classic` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26look%3Dclassic%26hud%3D0%26log%3D1%26label%3Dclassic"` |

## Round 5: the new tv defaults (2026-10-12, evening)

Round 4 on the Google TV (APK h), p50 / p90 ms:
- base 36.7 / 77.4;
- listen-vsync 33.4 / 70.9 (81% of draws on 2 vsyncs);
- arena 80.8 / 83;
- arena-shape 66.5 / 69.8;
- arena-few 70.2 / 73.5;
- arena-shapefew 51.4 / 54.5;
- classic 35.9 / 72.8.

rAF runs at 16.7 ms; callbacks run 5–11 ms late (p50) and 15–20 ms late (p90).

**New tv defaults**
- The vsync-counting cap (`&ab=timecap` is the old one).
- The arena's outline sprites, nearest first, no upper ring (`&ab=quadsprites`, `&ab=alltiers` undo them).
- In the stage look, the arena's wide stands higher on the stage's camera riser and tilts down into the pit, which is
  lit 20 m and more with falloff. The upper ring stays dark. `tools/render/aliveprobe.mjs` (lit crowd as a share of
  the frame): listen 0.43, after 0.40, preview 0.36 (the room is still filling); it was 0.11 in round 4.
- The mid shots now come from house right and from house left (six compositions). A new reaction during a close-up
  cuts to another setup once the current one has held 1.2 s.
- The laugh mixes are about 6 dB louder against a quieter club and open mic tone, with a limiter at the end.
- v8 people fixes:
  - tv hair at 512², colour dilated, coverage kept;
  - coverage-kept mips for the cards;
  - the coarse levels' insides lit as insides;
  - the open mic's near arcs on the lod level;
  - F02's skirt and F12's shorts weighted to the thighs;
  - warm wrapped skin on the front faces;
  - contact blobs under seats, tables and drinks.

- **Arena impostors (the user approved them for the far stands only):** the stands that the sprites leave out (the upper ring, and lower-tier rows 12–17) are 165 quads, each 3 rows × 12 people, baked at load in eight variants. They sway and shimmer per block, follow the room's reaction level, fill person by person in the preview, and show the odd phone glint. On the box: 39 calls, 115.8k tris, 29.1 MB; aliveprobe listen 0.47, after 0.44. `&ab=noimpostor` is the A/B (the `arena` row is now with impostors).

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| base | `venue=club state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Dbase"` |
| cycle | `venue=club state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dcycle"` |
| timecap | `venue=club state=cycle` | `ab=timecap` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dtimecap%26hud%3D0%26log%3D1%26label%3Dtimecap"` |
| openmic | `venue=openmic state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dopenmic"` |
| theatre | `venue=theatre state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dtheatre"` |
| arena | `venue=arena state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Darena"` |
| arena-cycle | `venue=arena state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Darena-cycle"` |
| arena-quads | `venue=arena state=listen` | `ab=quadsprites` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dquadsprites%26hud%3D0%26log%3D1%26label%3Darena-quads"` |
| arena-classic | `venue=arena state=listen` | `look=classic` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26look%3Dclassic%26hud%3D0%26log%3D1%26label%3Darena-classic"` |
| types4 | `venue=club state=cycle` | `ab=types4` (four avatar types per band: fewer draws, to price page JS per draw) | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dtypes4%26hud%3D0%26log%3D1%26label%3Dtypes4"` |
| arena | `venue=arena state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Darena"` |
| arena-noimpostor | `venue=arena state=listen` | `ab=noimpostor` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnoimpostor%26hud%3D0%26log%3D1%26label%3Darena-noimpostor"` |
| arena-cycle-noimpostor | `venue=arena state=cycle` | `ab=noimpostor` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26ab%3Dnoimpostor%26hud%3D0%26log%3D1%26label%3Darena-cycle-noimpostor"` |

## Round 6: speed recovery (2026-10-12, night)

Builds k and l ran a club set at about 17 fps (minimum 10), against 22–24 on APK j. The changes since then:
- The near rows (club rows 0–1) are on the lod level only in close-ups and mid shots, using a second copy of those
  places that is shown on the cut. The wide is back on sil: the club wide is 43 calls and 79.2k tris (k: 112.5k, APK j
  era: 79k). `&ab=lodalways` puts lod in every shot again (the k behaviour). The theatre stays on sil, and the open mic
  keeps lod (its near arcs are close in the wide too).
- The time cap is the tv default again (round 5: club p90 49.7 ms with it, 60.8 with vsync). `&ab=vsync` is the
  variant.
- `&ab=noverb` turns off the laugh reverb (one ConvolverNode on the audio thread), to price it. `&sound=sprite` plays
  single clips instead of the layered mixes.
- On the build box at 8× throttle (load 5–7 from the motion agent's jobs, so noisy): club cycle page JS p50 is 43 ms
  either way, and render() is 18–20 ms. The box can't separate them; the TV run will.

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| base | `venue=club state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dbase"` |
| listen | `venue=club state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Dlisten"` |
| vsync | `venue=club state=cycle` | `ab=vsync` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dvsync%26hud%3D0%26log%3D1%26label%3Dvsync"` |
| lodalways | `venue=club state=cycle` | `ab=lodalways` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dlodalways%26hud%3D0%26log%3D1%26label%3Dlodalways"` |
| noverb | `venue=club state=cycle` | `ab=noverb` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnoverb%26hud%3D0%26log%3D1%26label%3Dnoverb"` |
| sprite | `venue=club state=cycle` | `sound=sprite` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26sound%3Dsprite%26hud%3D0%26log%3D1%26label%3Dsprite"` |
| types4 | `venue=club state=cycle` | `ab=types4` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dtypes4%26hud%3D0%26log%3D1%26label%3Dtypes4"` |
| openmic | `venue=openmic state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dopenmic"` |
| theatre | `venue=theatre state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dtheatre"` |
| arena | `venue=arena state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Darena"` |
