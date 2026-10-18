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
| arena-faces | `venue=arena state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Darena-faces"` |
| arena-pillsprites | `venue=arena state=cycle` | `ab=pillsprites` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26ab%3Dpillsprites%26hud%3D0%26log%3D1%26label%3Darena-pillsprites"` |
| arena-pillimpostors | `venue=arena state=cycle` | `ab=pillimpostors` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26ab%3Dpillimpostors%26hud%3D0%26log%3D1%26label%3Darena-pillimpostors"` |
| arena-rows3 | `venue=arena state=cycle` | `ab=rows3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26ab%3Drows3%26hud%3D0%26log%3D1%26label%3Darena-rows3"` |
| arena-allpills | `venue=arena state=cycle` | `ab=pillsprites,pillimpostors,rows3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26ab%3Dpillsprites%2Cpillimpostors%2Crows3%26hud%3D0%26log%3D1%26label%3Darena-allpills"` |

## Round 7: arena (2026-10-13)

Round 6 had the arena at 13–17 fps (p50 55–69 ms, p90 117–159 ms) with CPU p50 at only 21–29 ms. That makes it
GPU-bound on the Mali-G31. The goal is club-like: 20+ fps and p90 under 70 ms, without losing the 2/5-alive rule
(aliveprobe ≥ 0.40) or the faces.

This build's changes since APK m:
- arena motion v1;
- the per-venue laugh coverage (director.js: the arena's `state=cycle` now cuts to the crane, the stands, the pit and
  the floor crowd, as well as the rail);
- the sprites turn to whichever camera is live.

Most rows below use `state=listen`, so they price the wide alone. `a7-cycle` and `a7-combo-cycle` include the reaction
setups.

Already off on tv: the light cones (the arena's sweep beams are named `beams`, which the tv preset hides; `a7-haze`
puts them back to price them).

Switches:
- **Diagnostics** (take one part out to see what it costs): `res=360`, nopost, nofog, nosprites (the sprite crowd on
  the floor and the tiers), noimpostor, noinst (the six 3D rows), nofront (the six skinned people), nostands (the tier
  planes, roof edges and towers), noglows (every glow point, including the floodlight halos), nosky (the sky sphere
  behind everything), nophones, noroom (floor, stage and tiers).
- **Candidate fixes:**
  - nosort: no front-to-back sprite order. This prices the tv default, which sorts.
  - quadsprites: discard cut-out quads instead of the opaque outline fans. This is the reference for "opaque, early-z
    cut-outs", which are already the tv default.
  - fan9: a coarser sprite outline, 9 triangles instead of 16. The sprites are 60k of the arena's 148k triangles; with
    fan9 the arena wide is 124k, and aliveprobe reads 0.50.
  - imphalf: half of the impostor block rows (fewer impostor layers).
  - floor30: the floor sprite crowd ends at 30 m, not 38.
  - rows4 and rows3: four or three 3D rows instead of six.
  - mediump: all shaders at mediump precision (fp16 on Mali).
  - fold: the final pass folded into the tone map.
  - combo: fan9, rows4, nosky, noglows and imphalf together.

Not built yet:
- A lower-res offscreen pass for the far stands: it needs a second render target and a composite. It is next if
  nosprites, noimpostor or nostands show the far bowl is the cost.
- Merging sprite rows into larger quads: the floor crowd as impostor strips. It is next if floor30 or nosprites shows
  the floor is the cost.
- Cheaper fog: the sprites and impostors already fog per vertex. nofog bounds what any cheaper fog could save.

Overdraw on the box (`tools/render/overdraw.mjs`, arena wide). With `&ab=overdraw,nopost`, every surface is added as
a flat 1/16 grey in the real draw order with the depth test on:
- The arena wide shades 1.19 fragments per pixel. 86% of pixels are shaded once, 13% two or three times, and 1% four
  to seven times.
- The sky fills the 25.5% of the frame that nothing else covers (nosky: 0.93).
- quadsprites is the same (1.20).

With `overdrawall` (no depth test), 4.78 fragments are rasterised per pixel, and early-z and the front-to-back order
reject most of them. So overdraw isn't what costs. The suspects are vertex and tiler load (148k triangles: sprites
60k, 3D rows about 56k, front 31k) and the shaders' per-pixel cost.

| Arena wide (box, capture) | calls | tris | sprites |
| --- | --- | --- | --- |
| base | 44 | 148.3k | 3992 |
| nosprites | 43 | 88.4k | (hidden) |
| noinst | 26 | 92.5k | 3992 |
| nofront | 26 | 116.9k | 3992 |
| quadsprites | 44 | 96.4k | 3992 |
| fan9 | 44 | 124.4k | 3992 |
| floor30 | 44 | 141.2k | 3519 |
| rows4 | 42 | 132.0k | 4078 |
| rows3 | 38 | 124.6k | 4121 |
| combo (without fan9) | 40 | 131.4k | 4078 |

aliveprobe on the arena wide: base 0.49, fan9 0.50 (the floor is 0.40).

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| a7-base | `venue=arena state=listen` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26hud%3D0%26log%3D1%26label%3Da7-base"` |
| a7-cycle | `venue=arena state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Da7-cycle"` |
| a7-res360 | `venue=arena state=listen` | `res=360` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26res%3D360%26hud%3D0%26log%3D1%26label%3Da7-res360"` |
| a7-nopost | `venue=arena state=listen` | `ab=nopost` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnopost%26hud%3D0%26log%3D1%26label%3Da7-nopost"` |
| a7-nofog | `venue=arena state=listen` | `ab=nofog` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnofog%26hud%3D0%26log%3D1%26label%3Da7-nofog"` |
| a7-nosprites | `venue=arena state=listen` | `ab=nosprites` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnosprites%26hud%3D0%26log%3D1%26label%3Da7-nosprites"` |
| a7-noimpostor | `venue=arena state=listen` | `ab=noimpostor` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnoimpostor%26hud%3D0%26log%3D1%26label%3Da7-noimpostor"` |
| a7-noinst | `venue=arena state=listen` | `ab=noinst` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnoinst%26hud%3D0%26log%3D1%26label%3Da7-noinst"` |
| a7-nofront | `venue=arena state=listen` | `ab=nofront` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnofront%26hud%3D0%26log%3D1%26label%3Da7-nofront"` |
| a7-nostands | `venue=arena state=listen` | `ab=nostands` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnostands%26hud%3D0%26log%3D1%26label%3Da7-nostands"` |
| a7-noglows | `venue=arena state=listen` | `ab=noglows` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnoglows%26hud%3D0%26log%3D1%26label%3Da7-noglows"` |
| a7-nosky | `venue=arena state=listen` | `ab=nosky` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnosky%26hud%3D0%26log%3D1%26label%3Da7-nosky"` |
| a7-nophones | `venue=arena state=listen` | `ab=nophones` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnophones%26hud%3D0%26log%3D1%26label%3Da7-nophones"` |
| a7-noroom | `venue=arena state=listen` | `ab=noroom` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnoroom%26hud%3D0%26log%3D1%26label%3Da7-noroom"` |
| a7-haze | `venue=arena state=listen` | `ab=haze` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dhaze%26hud%3D0%26log%3D1%26label%3Da7-haze"` |
| a7-nosort | `venue=arena state=listen` | `ab=nosort` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dnosort%26hud%3D0%26log%3D1%26label%3Da7-nosort"` |
| a7-quadsprites | `venue=arena state=listen` | `ab=quadsprites` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dquadsprites%26hud%3D0%26log%3D1%26label%3Da7-quadsprites"` |
| a7-fan9 | `venue=arena state=listen` | `ab=fan9` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dfan9%26hud%3D0%26log%3D1%26label%3Da7-fan9"` |
| a7-imphalf | `venue=arena state=listen` | `ab=imphalf` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dimphalf%26hud%3D0%26log%3D1%26label%3Da7-imphalf"` |
| a7-floor30 | `venue=arena state=listen` | `ab=floor30` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dfloor30%26hud%3D0%26log%3D1%26label%3Da7-floor30"` |
| a7-rows4 | `venue=arena state=listen` | `ab=rows4` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Drows4%26hud%3D0%26log%3D1%26label%3Da7-rows4"` |
| a7-rows3 | `venue=arena state=listen` | `ab=rows3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Drows3%26hud%3D0%26log%3D1%26label%3Da7-rows3"` |
| a7-mediump | `venue=arena state=listen` | `ab=mediump` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dmediump%26hud%3D0%26log%3D1%26label%3Da7-mediump"` |
| a7-fold | `venue=arena state=listen` | `ab=fold` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dfold%26hud%3D0%26log%3D1%26label%3Da7-fold"` |
| a7-combo | `venue=arena state=listen` | `ab=fan9,rows4,nosky,noglows,imphalf` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dlisten%26ab%3Dfan9%2Crows4%2Cnosky%2Cnoglows%2Cimphalf%26hud%3D0%26log%3D1%26label%3Da7-combo"` |
| a7-combo-cycle | `venue=arena state=cycle` | `ab=fan9,rows4,nosky,noglows,imphalf` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Darena%26state%3Dcycle%26ab%3Dfan9%2Crows4%2Cnosky%2Cnoglows%2Cimphalf%26hud%3D0%26log%3D1%26label%3Da7-combo-cycle"` |

## Round 8: club and theatre frame rate (2026-10-14)

On APK r the club ran at about 19 fps (p10 16) and the theatre at 17 (p10 15). The target is a steady 22 or more.

Round 6 put the club wide at 25 fps (p50 38.6 ms, CPU 17 ms) and club cycle at 20–21 fps (p50 43 ms, CPU 22–26 ms). So
the frame is mostly GPU, and the cuts add the close-up crowd copy: 79k → 112k triangles.

The candidates below don't change the look, or change it only slightly:
- **res405**: draw at 720×405, a fifth fewer pixels than 800×450. Also `&res=405`; dynres now steps 450 → 405 → 360.
- **dynres** (from round 2): on a cut, step the size down while p90 is over 34 ms, and back up under 22 ms.
- **fold**: the final pass folded into the tone map, so there is no full-screen pass.
- **nolodclose**: the close-ups keep the wide's crowd levels, with no close-up copy. That is a third fewer triangles on
  a club cut; the near rows in a mid shot are on sil.
- **fartypes3**: the bands from row 2 back, which are silhouettes in the stage look, use three avatar types. Three
  fewer draws (club 43 → 40, theatre 38 → 35).
- **hazelite** (theatre): half the haze points behind the rows, each larger and brighter, so the haze reads the same.
- **combo**: the likely wins together.
- **stagedark**: the theatre's house before today's lift (the lift changes only light levels, so frame time should be
  the same).

The theatre's house is lifted in this build, with a warm, low house light and a gentle depth falloff. The wide's mean
luma goes from 0.068 to 0.081 with near-black from 57% to 51%, the bill from 0.072 to 0.105, and the mid rows read as
people (`docs/mockups/theatre-house-v1.png`). `&look=stagedark` keeps the old theatre.

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| r8-club-base | `venue=club state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr8-club-base"` |
| r8-club-res405 | `venue=club state=cycle` | `ab=res405` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dres405%26hud%3D0%26log%3D1%26label%3Dr8-club-res405"` |
| r8-club-dynres | `venue=club state=cycle` | `ab=dynres` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Ddynres%26hud%3D0%26log%3D1%26label%3Dr8-club-dynres"` |
| r8-club-fold | `venue=club state=cycle` | `ab=fold` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dfold%26hud%3D0%26log%3D1%26label%3Dr8-club-fold"` |
| r8-club-nolodclose | `venue=club state=cycle` | `ab=nolodclose` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnolodclose%26hud%3D0%26log%3D1%26label%3Dr8-club-nolodclose"` |
| r8-club-fartypes3 | `venue=club state=cycle` | `ab=fartypes3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dfartypes3%26hud%3D0%26log%3D1%26label%3Dr8-club-fartypes3"` |
| r8-club-combo | `venue=club state=cycle` | `ab=res405,fold,nolodclose,fartypes3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dres405%2Cfold%2Cnolodclose%2Cfartypes3%26hud%3D0%26log%3D1%26label%3Dr8-club-combo"` |
| r8-theatre-base | `venue=theatre state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr8-theatre-base"` |
| r8-theatre-res405 | `venue=theatre state=cycle` | `ab=res405` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dres405%26hud%3D0%26log%3D1%26label%3Dr8-theatre-res405"` |
| r8-theatre-dynres | `venue=theatre state=cycle` | `ab=dynres` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Ddynres%26hud%3D0%26log%3D1%26label%3Dr8-theatre-dynres"` |
| r8-theatre-fold | `venue=theatre state=cycle` | `ab=fold` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dfold%26hud%3D0%26log%3D1%26label%3Dr8-theatre-fold"` |
| r8-theatre-hazelite | `venue=theatre state=cycle` | `ab=hazelite` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dhazelite%26hud%3D0%26log%3D1%26label%3Dr8-theatre-hazelite"` |
| r8-theatre-fartypes3 | `venue=theatre state=cycle` | `ab=fartypes3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dfartypes3%26hud%3D0%26log%3D1%26label%3Dr8-theatre-fartypes3"` |
| r8-theatre-combo | `venue=theatre state=cycle` | `ab=res405,fold,hazelite,fartypes3` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dres405%2Cfold%2Chazelite%2Cfartypes3%26hud%3D0%26log%3D1%26label%3Dr8-theatre-combo"` |
| r8-theatre-stagedark | `venue=theatre state=cycle` | `look=stagedark` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26look%3Dstagedark%26hud%3D0%26log%3D1%26label%3Dr8-theatre-stagedark"` |

## Round 9: the shapes (2026-10-16)

The user on the TV: "curves are sharp". The tv bodies were 32% of the source (about 1.5k triangles), and the close-ups
showed shoulders and jackets as flat panels. This build changes three things:
- **Full bodies on the cut.** Each `.tv.glb` now carries `<name>_bodyHi`, the full model's body at 3.5–5.3k
  triangles (`tools/tv_body.mjs`). It is swapped in at the cut for the people a close-up or a mid shot frames, and
  swapped back on the wide. `&ab=nohibody` turns it off.
- **The drawn body is unchanged.** `tools/tv_body.mjs` can simplify it again with meshoptimizer's attribute-aware
  simplifier (`NEW_LOW=1`: normals and UVs weighted, seams and group cuts locked, about 2.0k triangles). That is held
  back: the motion code fits its hand and table sections to the drawn body's vertices, and the new body gave 79 anatomy
  findings in the club against 0.
- **FXAA, the tv default.** One full-screen pass that also does the old final pass (vignette, low band, grain);
  `&ab=nofxaa` turns it off. On the box it adds about 1–1.7 ms to a 5–8 ms software frame, which says little about the
  Mali-G31.

dynres is the tv default too (`&ab=nodynres`).

Triangles (box, capture; calls are unchanged, plus one for FXAA):

| Venue | Wide | Worst close-up before → after |
| --- | --- | --- |
| club | 79.7k (unchanged) | 113.0k → 128.1k |
| open mic | 83.8k | 83.8k → 101.5k |
| theatre | 97.3k | 97.3k → 115.1k |
| arena | 148.3k | 148.3k → 165.6k |

`r9-*-old` is the previous build's rendering: no FXAA, no full bodies, fixed 800×450.

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| r9-club-base | `venue=club state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr9-club-base"` |
| r9-club-nofxaa | `venue=club state=cycle` | `ab=nofxaa` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnofxaa%26hud%3D0%26log%3D1%26label%3Dr9-club-nofxaa"` |
| r9-club-nohibody | `venue=club state=cycle` | `ab=nohibody` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnohibody%26hud%3D0%26log%3D1%26label%3Dr9-club-nohibody"` |
| r9-club-nodynres | `venue=club state=cycle` | `ab=nodynres` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnodynres%26hud%3D0%26log%3D1%26label%3Dr9-club-nodynres"` |
| r9-club-old | `venue=club state=cycle` | `ab=nofxaa,nohibody,nodynres` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnofxaa%2Cnohibody%2Cnodynres%26hud%3D0%26log%3D1%26label%3Dr9-club-old"` |
| r9-theatre-base | `venue=theatre state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr9-theatre-base"` |
| r9-theatre-nofxaa | `venue=theatre state=cycle` | `ab=nofxaa` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnofxaa%26hud%3D0%26log%3D1%26label%3Dr9-theatre-nofxaa"` |
| r9-theatre-nohibody | `venue=theatre state=cycle` | `ab=nohibody` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnohibody%26hud%3D0%26log%3D1%26label%3Dr9-theatre-nohibody"` |
| r9-theatre-nodynres | `venue=theatre state=cycle` | `ab=nodynres` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnodynres%26hud%3D0%26log%3D1%26label%3Dr9-theatre-nodynres"` |
| r9-theatre-old | `venue=theatre state=cycle` | `ab=nofxaa,nohibody,nodynres` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnofxaa%2Cnohibody%2Cnodynres%26hud%3D0%26log%3D1%26label%3Dr9-theatre-old"` |

## Round 10: real-v1, the front people's realism (2026-10-18/19, box session)

The box session (`docs/handoff/box-progress.md`) made the front people read less like game assets. Every term is a
switch and costs nothing when off. What changed on the tv preset:
- `realLit` (real.js) on the front people's head and body materials: skin sheen, a narrower warm wrap, eye catchlights
  (one Points draw), baked per-vertex AO (`people/ao/*.json`, a vertex attribute), teeth, hands, a cloth sheen, per-venue
  clothes hues. `&ab=noreal` turns all of it off (it also turns off the side key, candles and hand shadows below).
- The stage key 2.4 m house left and 0.4 m higher (`&ab=nosidekey`); the front fill 0.6.
- The club: candle light on the people at tables (a shader term) and hand contact shadows on the table tops (one
  instanced draw): `&ab=nocandle`, `&ab=nohandshadow`.
- Two-pass hair (`&ab=nohair2`): one more draw per person with hair cards (+8–10 calls, +6k tris).
- Lens: DOF from the FXAA target's depth and mips (`&ab=nodof`: the depth texture, the mip generation each frame, 1–5
  extra reads per pixel) plus bloom from the same mips and a gentle grade (`&ab=nograde`).
- Box costs (software GPU, relative only): calls club 43 → 55, theatre 38 → 47, open mic 48 → 59; triangles +5.7k; DOF
  is the biggest box cost (club wide 3.4 → 5.5 ms, 3.8 with nodof).

**What to decide from it:** for each venue compare `base` with `old` (all of real-v1 off). If `base` is within 1 fps of
`old`, keep everything. If not, read `nodof`, `nohair2`, `noreal` and `nograde` to see which term costs, and make that
term tv-off (its switch inverted) first: DOF, then hair2. The club must not drop under its 23–25 fps.

| Label | Scene | Switches | Command |
| --- | --- | --- | --- |
| r10-club-base | `venue=club state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr10-club-base"` |
| r10-club-old | `venue=club state=cycle` | `ab=noreal,nodof,nograde` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnoreal%2Cnodof%2Cnograde%26hud%3D0%26log%3D1%26label%3Dr10-club-old"` |
| r10-club-nodof | `venue=club state=cycle` | `ab=nodof` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnodof%26hud%3D0%26log%3D1%26label%3Dr10-club-nodof"` |
| r10-club-nohair2 | `venue=club state=cycle` | `ab=nohair2` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnohair2%26hud%3D0%26log%3D1%26label%3Dr10-club-nohair2"` |
| r10-club-noreal | `venue=club state=cycle` | `ab=noreal` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnoreal%26hud%3D0%26log%3D1%26label%3Dr10-club-noreal"` |
| r10-club-nograde | `venue=club state=cycle` | `ab=nograde` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnograde%26hud%3D0%26log%3D1%26label%3Dr10-club-nograde"` |
| r10-club-nocatch | `venue=club state=cycle` | `ab=nocatch` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dclub%26state%3Dcycle%26ab%3Dnocatch%26hud%3D0%26log%3D1%26label%3Dr10-club-nocatch"` |
| r10-theatre-base | `venue=theatre state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr10-theatre-base"` |
| r10-theatre-old | `venue=theatre state=cycle` | `ab=noreal,nodof,nograde` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnoreal%2Cnodof%2Cnograde%26hud%3D0%26log%3D1%26label%3Dr10-theatre-old"` |
| r10-theatre-nodof | `venue=theatre state=cycle` | `ab=nodof` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnodof%26hud%3D0%26log%3D1%26label%3Dr10-theatre-nodof"` |
| r10-theatre-nohair2 | `venue=theatre state=cycle` | `ab=nohair2` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnohair2%26hud%3D0%26log%3D1%26label%3Dr10-theatre-nohair2"` |
| r10-theatre-noreal | `venue=theatre state=cycle` | `ab=noreal` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnoreal%26hud%3D0%26log%3D1%26label%3Dr10-theatre-noreal"` |
| r10-theatre-nograde | `venue=theatre state=cycle` | `ab=nograde` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnograde%26hud%3D0%26log%3D1%26label%3Dr10-theatre-nograde"` |
| r10-theatre-nocatch | `venue=theatre state=cycle` | `ab=nocatch` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dtheatre%26state%3Dcycle%26ab%3Dnocatch%26hud%3D0%26log%3D1%26label%3Dr10-theatre-nocatch"` |
| r10-openmic-base | `venue=openmic state=cycle` | `(none)` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26hud%3D0%26log%3D1%26label%3Dr10-openmic-base"` |
| r10-openmic-old | `venue=openmic state=cycle` | `ab=noreal,nodof,nograde` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26ab%3Dnoreal%2Cnodof%2Cnograde%26hud%3D0%26log%3D1%26label%3Dr10-openmic-old"` |
| r10-openmic-nodof | `venue=openmic state=cycle` | `ab=nodof` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26ab%3Dnodof%26hud%3D0%26log%3D1%26label%3Dr10-openmic-nodof"` |
| r10-openmic-nohair2 | `venue=openmic state=cycle` | `ab=nohair2` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26ab%3Dnohair2%26hud%3D0%26log%3D1%26label%3Dr10-openmic-nohair2"` |
| r10-openmic-noreal | `venue=openmic state=cycle` | `ab=noreal` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26ab%3Dnoreal%26hud%3D0%26log%3D1%26label%3Dr10-openmic-noreal"` |
| r10-openmic-nograde | `venue=openmic state=cycle` | `ab=nograde` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26ab%3Dnograde%26hud%3D0%26log%3D1%26label%3Dr10-openmic-nograde"` |
| r10-openmic-nocatch | `venue=openmic state=cycle` | `ab=nocatch` | `adb shell am start -a android.intent.action.VIEW -d "com.strumble.tv://crowdtest?url=file%3A%2F%2F%2Fandroid_asset%2Fcrowd%2Findex.html%3Fpreset%3Dtv%26venue%3Dopenmic%26state%3Dcycle%26ab%3Dnocatch%26hud%3D0%26log%3D1%26label%3Dr10-openmic-nocatch"` |
