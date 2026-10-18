# Handoff: 3D crowd (prototypes/crowd3d): Batch 1.5, the TV speed work, the v7 fixes

Updated 2026-10-12, about 10:00 UTC. Nothing is committed. All .js/.mjs files pass `node --check`.
- **Ownership:** a motion agent owns traffic.js, anim.js, and the behaviour, gesture and face code in people.js and
  instances.js. I own crowd.js, venue.js, rooms.js, arena.js, sound.js, look.js, the material and lighting terms,
  textures.py and the tools.
- **Services:** the render box's servers are stopped (start :8091 with `python3 -m http.server 8091` in
  ~/strumble/prototypes/crowd3d). The box stops itself after 45 idle minutes; `encore-box.sh start`, then `up`.

## Latest (v7, 2026-10-12)
- **Arena motion v1 (21:00 UTC):** the user called the crowd's synced sway unreal, so no two sprites or impostor rows
  share a rhythm now (arena.js shaders, no new draws):
  - Each sprite is mostly still. It has a rare idle event of its own: a weight shift or lean of about 1 s in every
    6–14 s, with its own phase, size and direction.
  - A laugh reaches each person after their own delay, 0–0.4 s, nearer people first, counted from `uLaughT`. Each one
    then bobs and shakes at their own rate (±40%) and size.
  - Sung bounces sit near the beat, not on it.
  - Impostor rows move in their own rare events, with an unsynced flicker while the room reacts.
  - Not changed: the instanced 3D rows' motion belongs to the motion agent.
  - Checks: aliveprobe 0.49/0.49/0.45; anatomy (arena) 0. Strips: docs/mockups/arena-motion-v1-{before,after}-{wide,laugh}.png.
  - Remaining plan: a recorded clip on the emulator to judge the motion (stills can't show it); per-person head turns
    for the 3D rows (motion agent).
- **Close-ups rotate** (crowd.js):
  - The setups (CLOSES): three 75 mm pairs (centre, house left, house right, never across the aisle) and two 50 mm
    groups of four.
  - pickClose() takes laughRank into account and never repeats the last setup (nor the one before it, with four or
    more). useClose() moves the camera and sets p.focus.
  - When a reaction is held on the wide, it cuts to a 40 mm half-room variant of the wide (useWide).
  - Check: `tools/render/laughstrip.mjs` (6 host-mode laughs, a snap 700 ms after each cut) plus `phash.py`.
    Neighbouring pHash distances: [38, 32, 36, 36, 38] after, [24, 4, 8, 4, 4] before.
- **The club at tables** (venue.js):
  - Two-tops in every row: the first three rows on the floor, the rest on 20 cm risers. Pairs turn 13–22° towards each
    other.
  - The wide is lower: [0.7, 1.55, -2.9] → [-0.3, 1.3, 8], 28 mm.
  - The truss lamps are flagged.
  - Stills: docs/mockups/crowd3d-v7-*.png.
- **Sound mixes** (sound.js, on by default; `&sound=sprite` turns them off):
  - Each reaction layers 2–4 recordings at random offsets, ±5% rate, with stereo spread and a thinning tail. The same
    set never plays twice running.
  - The pool: sounds/crowd-pool.mp3 (tools/build_pool.mjs, 7 CC0 recordings, credits in sounds/CREDITS.md).
  - Checks: `tools/render/mixcheck.mjs`; a sample at docs/mockups/crowd3d-v7-laugh-mixes.mp3.
- **Stage's-eye look** (look.js): the default on every venue and preset since the user approved it.
  `&look=classic` brings back the old look.
  - Lit faces only in rows 0–1:
    - the spill's cone ends by row 2;
    - behind row 1 the row depth is 0.15 then 0.1, so the house and fill light are about 1–2%;
    - the skinned people and the merged rows sit in rows 0–1 only;
    - no bar point lights;
    - the arena's key also falls with row depth behind the rail.
  - Far levels get a soft rim, and back faces get no rim (the theatre's flecks).
  - Check: `tools/render/faceprobe.mjs` (display value at each face by row).
  - Pairs: docs/mockups/stagepov-v2-pair-tv-*.png (classic left). First mockups: stagepov-*.png. References:
    stagepov-references.md.
- **v8 review fixes (2026-10-12):**
  - **TV hair:** the hair textures are now 512² and full RGBA (they were a 256² palette PNG), with the colour dilated into
    the transparent texels and the alpha's coverage kept at the 0.5 cut (textures.py `opacity_tv`). The 12 .tv.glb are
    rebuilt. Front hair cuts at 0.4 on tv.
  - **Instanced cards:** the atlas colour is dilated in the opacity quadrants, and coverage is kept in the smaller
    alphas. The R8 alpha gets coverage-kept mips at load (coverageMips).
  - **Instanced shards:** vlit lights the inside faces as insides (vLitB, picked by facing and mirror). The open mic's
    near arcs use the lod level on tv.
  - **Fronts:** every avatar is in exactly two venues' fronts, three women and three men each. F02's skirt and F12's
    shorts are re-weighted from the pelvis to the thighs (build_people clothFit; their models are rebuilt). M17 is only
    in seated venues. The lit instanced rows skip F02 and F12.
  - **Round 4 defaults:** the vsync cap on tv (`&ab=timecap` undoes it). Arena outline sprites, nearest first, no upper
    ring (`&ab=quadsprites`, `&ab=alltiers`).
  - **Arena 2/5 alive:** the wide is higher and tilts into the pit, the pit and tiers are lit with falloff, the washes
    caught per sprite. aliveprobe.mjs: listen 0.43, after 0.40.
  - **Arena impostors** (the user approved them for the far stands only; arena.js `impostors`): 165 baked blocks
    (3 rows × 12 people, eight canvas-baked variants) fill the far stands the sprites leave out. Each sways on its own
    phase, follows the room's reaction level, fills in the preview, and shows phone glints. `&ab=noimpostor` drops
    them.
  - **Sound:** MIX_GAIN 1.7 with a steeper strength curve, the club and open mic tone quieter, a limiter at the end.
  - **Close-ups:** mid shots come from both sides (six setups). A new reaction during a close-up re-cuts after 1.2 s.
  - **Skin:** the front faces get a wrapped, warm terminator (skinLit).
  - **Contact:** seat blobs are stronger, turned with the seat and reach the feet; there are blobs under tables and
    drinks.
- **CPU:**
  - Bone trees are out of the renderer's walk.
  - Skeletons update only when posed or moved (p.skelDirty).
  - Dimmed front people in a close-up update at a quarter rate.
  - Morph attributes are hidden from the per-frame buffer walk.
  - Box at 8×: render 9.7 → 9.0 ms p50. Profiling tools: `tools/render/cpuprof.mjs` (INCL=1, LINES=file) and the
    motion agent's jsperf.mjs.
- **The frame cap:**
  - `&ab=vsync` counts vsyncs instead of comparing rAF times.
  - The log line adds the rAF period, callback lateness and draw spacing in vsyncs.
- **Arena switches:** spritesort, spriteshape (outline fans, no discard), fewtiers.
- **Round 4 of the TV sweep** is in tools/render/tv-sweep.md. The coordinator is running it.

## Done
- **TV sweep:**
  - Round 1 ran on the Google TV. Round 2 is written up in `tools/render/tv-sweep.md` and waiting for the
    coordinator's APK.
  - New switches: `&res=360|450`, and `&ab=` nopost, nograin, nofog, nohaze, nofront, noinst, noroom, vlit, noalpha,
    farsolid, fold, halfinst and dynres.
  - `&log=1&label=` prints `[crowd] sweep …` lines.
- **Round 1, Mali-G31 (ms):**

  | Run | Before | Change |
  | --- | --- | --- |
  | base | 75.8 | |
  | res360 | | −26 |
  | noinst | | −34 |
  | nofront | | −5 |
  | fog + haze | | −11 |
  | nopost | | −4 |

  The instanced crowd is the cost. The suspect is its whole-body alpha test (discard defeats early-Z and Forward Pixel
  Kill on Mali).
- **Speed candidates in code:**
  - `vlit`: `crowdMaterialVlit()` in instances.js, the crowd lit per vertex.
  - `noalpha` / `farsolid`: no discard on the crowd, or on the far bands only.
  - `fold`: vignette and band in the tone map, no full-screen pass.
  - `dynres`: steps the resolution on cuts. It turns `fold` off.
  - `pack.mjs` copies `anim/`. crowd.js awaits `initMotion()` first in `main()`.
- **Batch 1.5, items a–h and j:**
  - (a) Fill and hemisphere on the crowd scale by depth² (`FILL_SCALE`, the `PEOPLE_LIGHT.hemi` chunk); rows darken
    from row 3 (`depthFor`).
  - (b) Crowd rim ×2.5. Lamp lenses are full emissive discs; the core glow is 0.45 with a glare point. The beams fade in
    over their first fifth: they were the "half-moon" across the lenses. Theatre balcony lamps are hung lower.
  - (c) Club camera cuts at the knees. The arena camera sits at the back of the stage, so the stage floor fills the
    bottom fifth. Open mic aimed 1 m house left. Close-up composition guard (`guard()` in buildRoom).
  - (d) Walls ×(1 + 8·house); fog thins with the house lights; glows ×(1 + 2·house); stronger cool hemisphere after the
    set; preview fill at 2× listen.
  - (e) Open mic: exposure 0.8, bulb filaments at 0.95, one sil band of six pool types.
  - (f) Front people behind the subject are dimmed in close-ups (`frontBgMats`).
  - (g) Arena: beams masked below the lower third (`uMaskY`); sprites at 0.25 with no face oval in close-ups; far
    floodlight towers pushed out of frame.
  - (h) Fixed casts in the venue specs: each avatar in two venues' fronts, six sil types from the non-front pool, and
    row 0 always from the pool.
  - (j) tv alpha as one 8-bit channel (`people/lod_alpha_512.r8`, `tools/textures.py r8`), which brings textures to
    26.2–26.9 MB.
- **Renders:**
  - `docs/mockups/crowd3d-v6-pre-*.png`: 24 renders plus 20 `crowd3d-v6-pre-pair-*` pairs against v5.
  - Numbers in `tools/render/v6-pre-numbers.md` and `v6-pre-stats/`.
  - `bindcheck`: no one in the bind pose.
- **tv numbers, listen shot:** club 39 calls / 80.6k triangles / 26.2 MB; theatre 38 / 78.2k / 26.9; open mic 34 /
  58.4k / 26.9; arena 38 / 72.8k / 22.3.
- **R14 recast:** the asset plan is in `tools/recast-plan.md`. Not started.

## Next
1. Read the round-2 TV numbers. Make the winning switches the tv default, keeping the others in step:
   - probably `vlit` + `farsolid` + `fold` + no beams on tv;
   - plus a body/card split for the near band if noalpha wins (R13).
2. Re-run the v6 renders and the sweep base after making them default.
3. Then Batch 2 (with the recast) when the coordinator says go.

## Later on 2026-10-12
- The coordinator edited crowd.js for the user: hostShot holds close-ups for at least 4.5 s and wides for at least
  8 s, and the close-ups are locked off. Keep those edits.
- New default-off switches, waiting for the round-2 sweep before they become the defaults:
  - `&ab=lampfix`: lamp glows 8 cm in front of the lenses. A point sprite has one depth, so the tilted lens hid half
    the glow; that was the "split disc".
  - `&ab=clothfix`: the crowd's clothes compressed towards dark, muted tones, which hides the white bibs and kites on
    far LODs.
- Textures are up about 1.2 MB since the motion agent's latest changes (club 27.4 MB). Reported to the coordinator.
- **Hands:** `tools/build_people.mjs` has `rebalanceBody` (tv body simplified by bone group: hands 0.42, legs 0.18,
  rest 0.33, with locked seams) and `ONLY=tv`. The 12 .tv.glb files are rebuilt on the render box (old copies in
  /tmp/tvbak there).
  - The render box now has the Rocketbox cache, FBX2glTF in ~/.cache/encore-tools, node_modules in
    prototypes/crowd3d, and a Pillow venv at ~/pyenv. Run with `PATH=$HOME/pyenv/bin:$PATH`.
  - bindcheck passes on tv. Two low-preset after-set flags are the motion agent's.
- **Grain** is about a third as strong in the frame's centre (the blotchy faces on the TV).
- **Sweep:** `aa` and `comboaa` added to tv-sweep.md. The pack is ready for the coordinator's round-2 run.

## Round 3 of the TV sweep (2026-10-12, about 07:40 UTC)
- **tv defaults (`P.fast`):** vlit with a per-fragment rim; opaque bodies plus a near-band card split (`t.cardParams`
  in InstancedCrowd); far cards dropped (`t.dropCards`); no beams; 800×450; lampfix and clothfix always on.
  - Undo with `&ab=lambert`, `alpha`, `haze`, `oldlamps`, `oldcloth` and `&res=540`.
- **Spikes:** the caption is written only on change and the HUD updates once a second. The log line has `over50` and
  `cpu p50/p90`.
- **New box tools:** `tools/render/gctrace.mjs` (GC and main-thread trace) and `tools/render/allocprof.mjs`
  (allocation sites).
- **Theatre:** `depthSlope` 0.2.
- **Sweep:** round-3 commands are in `tools/render/tv-sweep.md`, sent to the coordinator; waiting for the TV numbers.
- **Checks:** bindcheck and handcheck pass.

## Motion agent: faces, JS and elbows/knees (2026-10-12 night, checkpoint 21:20 UTC). NOT merged
None of this round is in the shared tree or the pack. The shared people.js, anatomy.js, instances.js, anim.js,
traffic.js and the 12 people/*.tv.glb are still at s17 (build k), unchanged. Sheets in docs/mockups/faces-v1-*.png come
from the box copy (below) and show what is waiting, not what ships.

**Where the work is**
- Box copy (BOX=build, ap-south-1): `~/m/stage` (shared tree overlaid with my files, served at
  `http://127.0.0.1:8093/stage/index.html`); a frozen copy of my files only in `~/m/motion-wip-1012/`.
- Laptop: `~/encore-motion-wip-1012.tgz` (my overlay `stage/`, the base it was cut from `stage-base/`, the probes, and
  `stage-sync.sh`). Files: people.js, anatomy.js, instances.js, traffic.js, anim.js, tools/render/{anatomy,limbstats,
  limbsheet,facesheet}.mjs, tools/anim/tv_morphs.mjs, people/*.tv.glb (9 shapes).
- `stage-base` matched the shared tree at 20:10 UTC (people.js, anatomy.js, instances.js, traffic.js, anim.js,
  anatomy.mjs, tv_morphs.mjs). Diff the shared files against it again before merging.

**Done and measured (box copy)**
- JS:
  - Rig.upd updates a bone subtree without the fingers; they're refreshed once at the end of the update.
  - Still people pose on a staggered 5 Hz tick of their own and hold in between; a new reaction, heckle or dead bit
    wakes everyone.
  - People the last frame's camera didn't see pose at 3 Hz. This is about 45% of the fronts in close shots, through a
    frustum test on the camera taken from a mesh's onBeforeRender. crowd.js is untouched.
  - Measured with jsperf at 8×, club tv, box load 0.8–5:

    | build | Person.update p50 / p90 | page JS p50 / p90 |
    |---|---|---|
    | s17 | 16.5 / 26.8 ms | 41 / 58 ms |
    | box copy, before the limb fixes | 10.1 / 20.2 ms | 31 / 47 ms |
    | a6 (reference) | 9.6 / 13.9 ms | 33 / 44 ms |

  - The new box is about 2× slower than the old one, so 10 ms here is about 6 ms on the old box's scale.
  - **Not yet re-measured** after the limb fixes. They add the elbow circle search and the leg passes; the reach search
    is cached for 8 calls.
- Faces:
  - Every moment has an expression, by temperament (people.js `moodAt`):
    - dead air: sceptical, with one brow up and the lips pressed;
    - a heckle or a dead bit: a wince, then each temperament's own reaction (amused, sympathetic, embarrassed);
    - chuckles: amused in each temperament's way;
    - listening: attentive brows.
  - The TV models have 9 shapes (tools/anim/tv_morphs.mjs). eyeSquint and cheekSquint are merged into `duchenne`
    (0.8 squint + cheeks); `browOuterUpLeft` and `mouthPress` are new. On the TV, one brow up is always the left brow.
  - Textures with 9 shapes: club 29.53, theatre 28.56, open mic 29.79 and arena 25.71 MB (all ≤ 30). With 8 shapes the
    club was 29.34.
  - The coordinator asked for 9 only if the 8× run shows no cost. **Not yet measured**: `~/m/stage8` on the box is the
    same code with s17's 8-shape models, ready for that A/B.
  - Laughers no longer draw the 5% stone face.
  - Sheets: docs/mockups/faces-v1-<Avatar>.png (11 avatars: Male_Adult_17 didn't finish) and faces-v1-temperaments.png.
    They were rendered before the last limb fixes, so faces are as they'll ship, but bodies may differ slightly.
- Elbows and knees:
  - A validator with numbers (anatomy.js `limbMetrics`/`limbs`, in `window.__anatomy().limbs`, `__limbMetrics()`,
    the anatomy sweep and the instanced bake audit). The anatomy sweep fails on any limb finding.
  - What it measures:
    - elbows, in the chest's frame: out beyond the shoulder (a chicken wing is judged relative to the hand), tucked
      behind, inside the torso or the other arm, the angle at rest (thighs/knees/thighKnee 80–145°, clasped 70–150°),
      and symmetry at rest;
    - knees and legs: knee over ankle, shin tilt, thigh slope (as level as the body allows), feet flat, knee and ankle
      gaps and crossing, clearance to the neighbours' legs, the club table post and top, the theatre seat in front,
      occupied chairs in front, and the arena barrier;
    - standing: knees soft (2–28°, 45° when bouncing), feet 10–50 cm apart, and the weight over the feet.
  - Fixes:
    - fixArms and a final `guardElbows` place each elbow at the best point of its circle;
    - resting reach is equalised (0.78–0.9 of arm length), and the shoulders are squared to the hips at rest;
    - ankles are uncrossed by hip rotation, knees turn away from the neighbours', and feet come under the knees;
    - seated and standing legs are kept out of the pelvis and spine lean (the thighs hang from Spine);
    - standing feet stay under the hips, and the standing laugh lean is clamped;
    - hands stay behind the arena barrier;
    - the instanced bake keeps the thighs in its laugh frames.
  - A real bug fixed on the way: the leg passes read stale pelvis and spine matrices (now `rig.updChain`).
  - limbstats (all venues, 7 states): 1,884 findings at the start, then 4, then 0 on the targeted re-checks.
  - The full anatomy sweep, run 2, was stopped at 21:04 for the checkpoint, 89 lines in. **Not at zero.** What it
    showed:
    - Female_Adult_13 R own-thigh collision in every club state. This is new with these changes, and the next thing
      to fix.
    - Hand floating: Female_Adult_02 (club dead air), Male_Adult_12 and Female_Adult_12 (open mic).
    - A chair finding (theatre after, a person leaving: check that the z-range rule fix took effect).
    - One theatre clap with palms 9 mm too close, and one theatre finale with the weight off the feet (0.172).
    - Open mic listen: Male_Adult_12 R elbow tucked (−0.11).
  - handsweep run 2: 1 invalid, arena after t=5, Female_Adult_04's fingertips 1 mm too close in a standing clap (19 of
    20 runs clean).
  - limbs-v1 sheets: the tool works (tools/render/limbsheet.mjs; a test sheet for Male_Adult_07 only). The 12 sheets
    are **not rendered yet**.
- Sprites and impostor blocks have no joints, so the limbs pass excludes them.

**Next steps (in order)**
1. Fix the regressions above until both are at zero: `node anatomy.mjs <base>` and `bash handsweep.sh <base>`. The
   own-thigh collision and the floating hands most likely come from the rest-reach equalisation, or from guardElbows on
   resting arms.
2. Run bindcheck: `BASE=http://127.0.0.1:8093/stage/index.html node bindcheck.mjs <outdir>`.
3. Freeze `~/m/s18`. Run jsperf at 8× on s17, s18, s18 with 8 shapes (copy s18 and drop in s17's people/*.tv.glb, as
   ~/m/stage8 does) and a6. Note the box load. Keep 9 shapes only if they cost nothing.
4. Render the sheets:
   - `node limbsheet.mjs <base> <out>` for all 12 (about 1 h; look at every tile, arena tiles included);
   - `node facesheet.mjs <base> <out>` again on s18.
   Copy them to docs/mockups.
5. Merge into the shared tree after checking it against stage-base: people.js, anatomy.js, instances.js and
   tools/render/*.mjs, plus the 9-shape .tv.glb from `~/m/fx/people` (or stage/people in the tarball) if kept. Then
   pack (`node tools/pack.mjs ... --tv`) and pack-check.

**Commands to resume**
- Box: `IP=$(~/.cache/encore-box.sh ip)`, then
  `ssh -i ~/.ssh/encore-build.pem -o UserKnownHostsFile=~/.ssh/encore-build.known ubuntu@$IP`.
  The page server is python http.server on 8093 serving ~/m.
- Restore the laptop overlay: `mkdir -p <scratch> && tar xzf ~/encore-motion-wip-1012.tgz -C <scratch>`. Edit
  `<scratch>/stage-sync.sh`'s SP path, run it to push the shared tree plus the overlay to `~/m/stage`, and then run
  `node loadcheck.mjs http://127.0.0.1:8093/stage/index.html "venue=club&preset=tv" …` from ~/m/stage/tools/render.
- Targeted checks: `ONLY=listen,preview node limbstats.mjs <base> club openmic`, and
  `node dbg2.mjs <base> <venue> <state> t:Name,...` (per-stage elbow trace).
- Rebuild the TV shapes: in `~/m/fx` (node_modules is a symlink to ~/m/after/node_modules), run
  `node tools/anim/tv_morphs.mjs`.

## 2026-10-13 (morning): per-venue laugh coverage, per-venue laugh sound, arena round 7 switches (packed)

**Camera cuts**
- `director.js`: each venue has 9 reaction setups (camera poses only) and its own pacing (`PACE`):

  | Venue | Close hold | Wide hold |
  | --- | --- | --- |
  | club | 4.5 s | 8 s |
  | open mic | 5.5 s | 9 s |
  | theatre | 6.5 s | 11 s |
  | arena | 5 s | 8.5 s |

- `pickSetup` rules:
  - never one of the last 3;
  - laughRank, damped for people featured in the last 4 cuts;
  - unused setups first;
  - a change of shot size;
  - big laughs only lean to the house setups.
- `crowd.js`:
  - per-setup light (`lit`: close or wide), with every front person in frame lit;
  - per-setup fog;
  - track, roll and drift;
  - wide variants from the venue's wide setups.
- The arena sprites now turn to the live camera (`room.camPos`).
- Strips: `docs/mockups/laugh-cuts-v1-{club,openmic,theatre,arena}.png`, 8 consecutive laugh cuts each, 7 distinct setups per venue. Built with `tools/render/laughcuts.sh`; `tools/render/setupsheets.sh` shows every setup.
- Costs are unchanged: the build follows the wide and the close-lit setups only.

**Sound**
- New packs, built by `tools/build_pool.mjs --voices <dir>`:
  - `sounds/crowd-voices` (32 single laughs: f/m × roar, giggle, exhale);
  - `sounds/crowd-{club,theatre,arena,openmic}` (thumps; theatre chuckles and applause; arena roar and whistling; open mic sparse room);
  - all licences checked per clip on 2026-10-13, credited in `sounds/CREDITS.md`, with the CC BY names added to the bill line in `BillScreen.tsx`.
- `sound.js` `VENUE_SOUND`: per-venue reverb, crowd layer counts, voice range and touches.
- Voices follow the cast, from `castFn` = `laughCastNow()` in crowd.js: `PEOPLE.laughCast()` or `window.__laughCast()` when the motion agent's getter lands, else an estimate of the same shape.
- No clip or layer set from the last 3 laughs is reused.
- `feature()` puts a matching voice forward 0.6–2.5 s into a reaction shot whose laugher scores ≥ 0.45.
- Renders: `docs/mockups/laugh-venues-v1-<venue>.mp3`, via `tools/render/laughvenues.sh`.
- Extra decoded audio is about 100 s (about 20 MB at 48 kHz).

**Arena round 7**
- Switches and rows are in `tools/render/tv-sweep.md` "Round 7: arena", including the overdraw findings and the tri table.
- Shaded overdraw is 1.19 per pixel, so the cost is triangles and shaders, not fill.
- `fan9` cuts the sprites from 60k to 36k triangles, with aliveprobe at 0.50.
- `tools/render/overdraw.mjs` measures overdraw; `tools/render/packcheck.mjs` checks the packed build from file://.

**Pending**
- The TV run of round 7.
- When laughCast merges, check that the voices follow it (`window.__mixes()` shows `cast.named`).
- Arena candidates still to build if the TV points at them: a half-res far-stands pass, floor impostor strips.

## Motion agent: s18 MERGED (2026-10-13, about 14:45 UTC; not committed)
- **In the shared tree now:**
  - people.js, anatomy.js and instances.js;
  - tools/render/{anatomy, limbstats, limbsheet, facesheet, laughsheet}.mjs;
  - tools/anim/tv_morphs.mjs;
  - people/*.tv.glb (9 shapes).
- **Backup:** the s17 versions are in `~/encore-premerge-s17/` on the laptop, and the overlay in `~/encore-motion-s18.tgz`.
- **Verified on s18:**
  - anatomy 0 in all four venues, limb rules included;
  - handsweep 0 of 20 runs;
  - bindcheck: no one in the bind pose;
  - loadcheck clean;
  - `pack --tv` (18.0 MB) loads from file:// in all four venues with no errors;
  - laughCast is exported and resolves for crowd.js's `PEOPLE.laughCast`.
- **Rule fixes made in the final pass:** these false positives were fixed in the rule, not by raising thresholds.
  - The elbow tucked-behind and winged rules skip people walking, sitting down or standing up, whose arms swing behind the body. In those states fixArms only keeps the elbows out of the body. Frames that showed it:
    - club after t=44.5 (F13);
    - theatre preview t=20 (F03);
    - theatre after t=36.5 and 38.5 (F17), t=40.5 (F04);
    - open mic after t=34.5 (M12), t=38.5 (M04).
  - The chair-in-front check measures only at the chair's back (−0.4 < z < −0.1 in that chair's frame). It uses the chair's home seat when its owner is up, and only for seated people. Frames that showed it: theatre after t=10.5, open mic after t=28.5.
- **Pose fixes in the final pass:**
  - unreachable rest targets are drawn in to 95% of the arm;
  - the table hand is used only within 92% of the arm;
  - the elbow guard is off during claps and in traffic;
  - claps are 5–8 mm wider (more for the low clap and when standing);
  - two-handed phone hands sit 8 mm further apart.
- **8×, box quiet:**

  | Build | Person.update p50 / p90 | page JS p50 / p90 |
  |---|---|---|
  | s17 | 8.9 / 19.1 ms | 20.0 / 32.7 ms |
  | s18 | 9.8 / 16.7 ms | 20.3 / 32.1 ms |
  | s18 with 8 shapes | 9.6 / 18.4 ms | 20.5 / 34.0 ms |
  | a6 | 4.9 / 10.3 ms | 15.9 / 25.0 ms |

  - The 9th shape costs nothing.
  - A full pose costs 0.26 ms against s17's 0.19 (bench.mjs, stepped). The live holds win that back, so page JS is level with s17. The 6–7 ms target is **not** met.
  - Next: cache the seated leg fixes and the elbow guard between calls, since the seated legs barely move.
- **Sheets:** rendering on the box into `~/sheets/{limbs,faces,laughs}`, to be copied into docs/mockups as limbs-v1-*, faces-v1-* and laughs-v1-*.

## 2026-10-13 (afternoon): APK o fixes (packed)

- **Right-edge band.** The page background showed down the right because the WebView's viewport in the app is wider
  than 16:9: reproduced at 1018×541 css, where the APK o pack leaves a 74 px band (5.5%). `fitStage` (crowd.js) and
  an inline copy in `index.html` now scale each axis on its own when the viewport is within 12% of 16:9, refit every
  2 s and on visualViewport resizes, and the stats message carries `view` and `fit`.
  - Proof: `tools/render/edgecheck.mjs` and `edgeall.sh` cover the bill, the wide, every setup and the cut sheet in all
    4 venues at 962×541 and 1018×541. Every frame reads band 0. Sheet: `docs/mockups/edge-fill-v1.png` (top row: APK o).
  - The bill's credit line also had no right edge (it ran off screen); it now wraps (`BillScreen.tsx`, `right: edge.x`).
- **Audio after the first frame.**
  - `sound.js` decodes nothing until crowd.js calls `sound.go()` 0.8 s after the first frame, then one file at a time
    with pauses: sprite, pool, shouts, this venue's pack, voices. Cues play from whatever is decoded so far.
  - The context runs at 32 kHz: decoded audio is 36.1 MB in all, against about 54 MB at 48 kHz. `window.__audioMB()`
    reports it.
- **Venue change.** The page still reloads, but the last frame of the old room is kept in sessionStorage
  (`encore-hold`), shown as `#hold` by an inline script before the bundle parses, and removed at the new room's first
  frame. On the box at 8× the next room was ready in 5.9 s, against 9.8 s before, with the held frame on screen the
  whole time.
- **Dark setups.** `tools/render/setupsheet.mjs` (`lumaall.sh`) reports mean luma and the share of near-black pixels for
  every setup and state.
  - Changes:
    - the theatre's high wides and side angles get the spill opened wider (`keyWiden`, a setup field), and were re-aimed;
    - the composed mid is lit like a close-up;
    - the stage lip's bright line is gone from the side angles;
    - the arena's close-up sprite dim goes from 0.11 to 0.18;
    - in preview the key is at 0.45 instead of 0.12.
  - The stage-look wides are about 0.06–0.07 mean with 55–57% near-black, by design. Every setup is now at or above its
    venue's wide.
- **Sound cast.** It now reads `laughCast()` from people.js. The TV's cue plays at once (the reaction's timing is
  measured), with the voice count from its strength. The cast's own voices (`sound.castArrived`: count, genders,
  laugh types) join when the people first see the reaction, usually a frame later. The standalone demo reads the cast
  with the cue, since it is decided in the same frame.
- **Sheets (s18, in docs/mockups):**
  - limbs-v1-<Avatar>.png for all 12 avatars: avatar-view states and the rest poses, plus a front and side tile in each venue. Arena tiles are included; their front views are partly hidden by the barrier panel.
  - faces-v1-<Avatar>.png for all 12, plus faces-v1-temperaments.png.
  - laughs-v1-{openmic,club,theatre,arena}.png: four laughs at strengths 0.5, 0.9, 0.7 and 0.9, the room's wide view and one person close. Plus laughs-v1-venues.png, one big laugh per venue side by side.
  - The cast shares at 0.5 / 0.9: open mic 0.28 / 0.38, club 0.31 / 0.78, theatre 0.34 / 0.70, arena 0.39 / 0.86.
- **Known, not fixed:**
  - Open mic laugh 4 (laughs-v1-openmic, close tile): Male_Adult_06 throws his head back while the neighbour turned towards him, and their heads and shoulders overlap. There is no head-to-neighbour check yet; it needs a new rule plus a fix.
  - limbs-v1-Female_Adult_03, open mic tile with preset=high (the tv cast doesn't include her): one "knees through each other". The high preset isn't swept.
  - A take's "doubled over" is demoted to "head back" on a laugh that isn't big, so two consecutive laughs can show the same style even though the take changed.
  - The JS target isn't met (see above).

## 2026-10-13 (evening): black-screen hunt fixes and load timing (packed)

- **#2, house setups lit as the wide.** A setup with no front people of its own (the theatre's high wides and composed
  mid, the arena's house shots) is lit as the wide, keeping the reaction shot's wider spill (`houseShot`, `litNow`).
  - The arena's close-ups keep the floor and the stands: sprite fog to 70 m, sprite dim 0.7, closeDim 0.7 in look.js.
    Before, the rail shots had a black top third.
  - The pit shot was re-aimed.
  - `setupsheet.mjs` now gates on brightness: every setup's mean luma must be at least 0.9 × its venue's wide, measured
    at t 2.0 in a laugh. `lumaall.sh` runs it for all venues and states.
- **#4, page loaded mid-set.** `hostShot` cuts at once when no shot is set yet; the camera was at the origin under the
  floor. `tools/render/resizecheck.mjs` covers this and a WebView resized after load (no band at any edge).
- **#5.** The bands at all four edges are 0 px in all venues at 962×541 and 1018×541 (`edgecheck.mjs`, `edgeall.sh`).
- **Load timing.**
  - At the third frame the page posts a `[crowd] load …` line: phase marks in seconds since start (script, setups,
    venue geometry, front glbs, front people and textures, room built, scene ready, shaders compiled, first frame,
    third frame) and each GLB's fetch and parse.
  - It goes to the console and to the host (`type: 'load'`, and `load` on the ready message). `window.__load()` has
    the raw numbers.
  - The audio decode posts its own `[crowd] load audio …` line.
  - The motion clips now load in parallel with the room, and the crowd atlas in parallel with the front GLBs.
- **Prefetch and streamed front people (later the same evening).**
  - `people/prefetch-tv.json` lists each venue's GLBs and crowd textures, room first and front `.tv.glb` last. It is
    generated by `tools/render/manifest.mjs` on the box; re-run it when casts, bands or files change.
  - On preset=tv the page fetches the whole list from script start, five at a time. Every `load()`, the atlas and the
    alpha take their bytes from that one map, so nothing is fetched twice; the map is cleared once the front people are
    in.
  - Live tv pages draw the room first. `addFront` builds the front people when their files arrive, compiles them off
    the scene, then shows them and reapplies the shot light; `document.body.dataset.front = '1'` marks it. Capture,
    still, the low and high presets and `&frontfirst` keep the old order. `&noprefetch` turns the prefetch off.
  - Box at 8×, club: first frame 4.5–5.4 s against 5.8 s on APK o; the front people are in by 4.5–5.8 s. A venue
    change is ready in 4.9–5.2 s against 9.8 s. The `.tv.glb` files parse in 1.3–1.5 s each at 8×.
- **Bills.** `previewKey` and `previewWiden` (venue fields) set the stage key and spill while the room fills.
  - Theatre: key 0.8, widen 2.6, and `hemiHouse` 3.6, which takes its bill from 0.047 to 0.072 mean luma.
  - Club: widen 2.2, from 0.059 to 0.071.
  - Open mic 0.101 and arena 0.125, unchanged.
- **AWS.** The laptop's AWS token expired at about 16:20 UTC, so encore-box.sh can't find the box. Its IP was
  15.206.68.78; ssh with the usual key until the login is renewed.
- **Off the critical path (after the APK r TV line, where the room showed 10.0 s from script start).**
  - The front people's `.tv.glb` parses wait until after the first frame and run one at a time, with a frame between.
  - The club's close-up lod copy (`addLod`) is built after the first frame too, compiled off the scene.
  - Finer marks: `crowd types N` (parse and bake) and `crowd built N`, plus summed `crowd bake` and `crowd build` times.
  - Box at 8×: first frame 3.0 s from script start (club) and 3.5 s (arena); front people in by 5.4–5.5 s; venue change
    ready in 4.6 s. With the parses no longer interleaved, the summed parse is 1.6 s instead of 8 s, so the TV's
    2.5–4.6 s per file was largely contention.

## Motion agent: s19 MERGED (2026-10-13, about 17:00 UTC; not committed)
Merged on top of the crowd agent's pack: people.js, anatomy.js and tools/render/anatomy.mjs, plus the new tools/render/secbench.mjs.

**What's in it**
- **Heads and shoulders between neighbours:**
  - Check: `headContact` in anatomy.js. Heads must stay 2 cm apart at their fitted radii, and a head must stay out of a neighbour's torso sections widened by 0.8 of the head's radius. Findings are flagged as "head against …" in the limbs rules.
  - Fix: `clearHeads` runs after the spine clamps and tips the upper body away at Spine1, up to three steps. The legs hang from Spine, so they don't move.
  - The open mic laugh-4 case (Male_Adult_06) now reads clear, and the head check finds nothing in any venue on tv.
- **Laugh styles:** when a downgrade ("doubled over" → "head back", nose or giggle → roar on a big laugh) lands on the person's previous style, the next style their repertoire allows here is used instead.
- **Seated legs:**
  - The leg passes are worked out on one call in four and held between (`_legC`). Stepped views compute every call.
  - Knees stay at least 12 cm apart, centre to centre (each thigh turned out at the hip). This removed the high preset's "knees through each other": theatre 291 → 0, open mic 86 → 4.
- **Debug switch:** `&sec=1` records per-section timings of Person.update in `window.__sec`; `tools/render/secbench.mjs` reads them.

**Validators on s19 (tv)**
- Anatomy: 0 in all four venues.
- Handsweep: 0.
- Bindcheck: no one in the bind pose.
- Pack: `pack --tv` loads from file:// in all four venues with no errors.

**High preset, swept once.** It is not the TV's preset and was never swept before: 133 findings.

| Venue | Findings | Mostly |
|---|---|---|
| Theatre | 55 | legs and arms into neighbours, which sit closer with 12 front avatars; 4 "head against" |
| Open mic | 61 | 24 asymmetric elbows, 13 floating hands, legs through neighbours |
| Arena | 10 | barrier, own torso |
| Club | 7 | own thigh, legs through neighbours |

**JS (8×, club, box quiet)**

| Build | Person.update p50 / p90 | Page JS p50 / p90 |
|---|---|---|
| s17 | 9.1 / 16.0 ms | 20.4 / 31.1 ms |
| s18 | 8.7–10.0 / 17.1–17.6 ms | 20.3–20.6 / 32.5–33.4 ms |
| s19 | 8.2–8.3 / 16.4–16.6 ms | 19.1–19.6 / 29.5–33.4 ms |
| a6 | 4.6 / 6.4 ms | 15.8 / 22.7 ms |

- Live listen, unthrottled: 0.80 ms of update a frame, against 0.95 for s18 and 1.03 for s17.
- **The 6 ms target is not met.** Where a full pose goes (secbench, µs a call, listen):

  | Section | µs |
  |---|---|
  | armFix (the anatomy pass) | 31 |
  | body (lean, eulers and the full matrix update) | 20–23 |
  | legs (still computed every call in stepped views; cached live) | 18–25 |
  | IK and gestures | 12–14 |
  | spine clamps | 8 |
  | face | 7–8 |
  | matrices | 5–7 |
  | clip | 6–8 |

- Next levers:
  - extend the arm-fix reuse to people laughing, with a 2–3 call hold for slow parts;
  - avoid the full `rig.upd(model)` at the body step (update only the spine chain);
  - hold the face at 10 Hz while it is calm.

## Motion agent: "a hand vanishes" (TV, theatre), 2026-10-13 ~17:40 UTC
- **Cause: the theatre seats' armrests occlude the hands.** venue.js `SEAT_GEOS.theatre` has armrests 0.22 m tall at y 0.56, so their tops are at 0.67 m. A resting hand on the thigh sits at about y 0.62 and |x| 0.10–0.13. From the low, side-on close-ups the armrest top cuts the line of sight to the hand. A laugh or clap moves the hand 1–3 cm, so it pops in and out between consecutive frames.
- **Ruled out:**
  - Frustum culling: every skinned front and mid mesh is `frustumCulled = false`. The hands are part of the body mesh, not separate meshes or primitives in the .tv and .lod GLBs.
  - The near plane: it's 0.05 m, and the nearest camera-to-hand distance over all director setups is 1.37–1.87 m.
  - Broken bones: `handvanish.mjs` read every front bone on every frame of the live page (cycle and after, four venues) and found no non-finite matrices or torn hands.
- **Measured** with `tools/render/handocc.mjs`: rays from every setup camera to every front palm, every 0.1 s, through a laugh, a clap and the finale.
  - Theatre: 176 of 22,800 samples hidden, 8 hidden-between-visible flickers. Setups: along the front row from house left and right, the stalls two-shot, the high wide from the stage box.
  - Club: 87 flickers. These are hands passing under the table top's edge, which is real occlusion.
  - Arena: the barrier panel, which is intended.
  - Open mic: 0.
- **Fix:** venue.js belongs to the crowd agent, so I haven't touched it. Change the two theatre armrests to `box(0.05, 0.12, 0.46, ±0.27, 0.51, 0)`, which puts their tops at 0.57 m. Tested in a throwaway box copy: theatre 0 hidden and 0 flickers. The before/after strip is docs/mockups/hands-v1-theatre-armrest.png (top row before, bottom row after).

## Motion agent: club table hands, in progress (2026-10-13 ~18:30 UTC; NOT merged)
- **What it is:** the club's resting hands sit in the lap, with the palms at y 0.67–0.73 m, just under the 0.75 m table top. From the stage-side cameras, every few centimetres of a laugh's movement takes a hand across the table edge's sightline.
- **Club flickers so far:** at the start, 87 flickers and 5,981 hidden samples.
- **Attempt (box copy only, `~/encore-motion-wip-club.tgz`):**
  - Table sitters rest their hands on the top, palms about 0.80, using tableBoth, forearmsTable and tableOne with both hands on the table. The positions are fitted to the actual table, on the near-edge band, pushed clear of the glasses and the jar. "Knee" gestures are off at tables, and slaps land on the top.
  - Result: 38 flickers and 1,573 hidden.
  - The hands on the top are hidden behind the glasses and the candle jar from the cameras across the table: the rays hit at y 0.81–0.89, the glasses' height.
  - The new rules (5 cm clear of the glasses and the jar; no resting hand within −5…+3 cm of the top) find 155 hands at the glasses and 6 at the table edge. On-table poses also raise 43 floating hands and 36 hand or arm contacts between the two tablemates.
  - None of this is merged; the shared tree is still s19.
- **Ways forward:**
  - (a) Lap hands lowered well under the top (onto the knees, under the table's footprint), so they stay hidden from every camera rather than flickering; only some sitters put a hand on the table, at its near edge.
  - (b) The crowd agent moves the two glasses and the jar off the line between the cameras and the sitters' hands (towards the sitters' sides, or to the stage-side rim).
  - (c) handocc stops counting a hand hidden behind a glass on the table as a flicker, since that is real occlusion.
- **Club, 19:30 UTC (box copy `~/encore-motion-wip-club3.tgz`; NOT merged):**
  - Changes on the new 0.47 layout:
    - anatomy.js's table band (seat z 0.19–0.77) and post (src.z − 0.47) moved by 0.09;
    - a hand pushed out of the table slab from below goes back down under the top, not up onto its edge;
    - the phone is held 6 cm higher at a table;
    - the club2 work stays in: knee rests, nothing at table height, a 0.12 forward lean at tables.
  - handocc club: 400 flickers and 311 occlusions. Most are lap and knee hands at y 0.60–0.68 toggling as the body rocks in a laugh.
  - tools/render/tablegeo.mjs measures where the table is in each sitter's own frame:
    - the centre is 0.52–0.60 m from the sitter, not 0.47, because the table is 0.31 to the side of each sitter and the seats are jittered and turned;
    - the nearest edge is 0.21–0.29 m away;
    - the knees sit −0.16 to +0.09 m from the edge, so right on it.
  - The top therefore doesn't cover the laps, and a lap hand sits right on the edge's sightline.
  - Fix needed in venue.js (the crowd agent's file), one of:
    - a top of about 0.40 m radius;
    - the table about 0.15 m nearer each pair's midpoint line, so the centre is about 0.40 from each sitter;
    - the pair seated closer together.

## Motion agent: club table fix, checkpoint club4 (2026-10-13 ~19:10 UTC; NOT merged)

State: the work is in the box copy `~/m/stage` and on the laptop in `~/encore-motion-wip-club4.tgz` (mo/stage, probes, stage-sync.sh). None of it is in the shared tree. venue.js in the shared tree is unchanged by me.

venue.js changes, in the WIP copy only:
- a module-level `export const TABLE_R = 0.4, TABLE_D = 0.4` (was a 0.31 top and a 0.47 distance);
- the `cabaretTables` push uses `z: r.z - TABLE_D`;
- the top is `CylinderGeometry(TABLE_R, TABLE_R, 0.03, 22)` (was 0.31 with 18 segments);
- the glasses moved to t.x ± 0.32 (were ± 0.25);
- the centre contact blob is scaled 1.0 (was 0.8), and the glass blobs moved to ± 0.32.

TABLE_D 0.40 goes against "keep the distance". At 0.47 the knees weren't covered. At 0.40, tablegeo puts the knees −0.05 to +0.22 under the top, so the 10 cm rule still fails for Female_Adult_03, Male_Adult_17 and Male_Adult_10.

anatomy.js (WIP):
- `TABLE_R` is used in the table bands and posts;
- the post is at `src.z - 0.4`;
- the glass and jar things are at ± 0.32;
- the fixArms table push now only lifts from above (0.735–0.76 → 0.785);
- new rules: 'table edge (a resting hand)' and 'table rim (own body)'.

handocc, club only, on the 0.5 s / 0.3 s flicker rule:

| Variant | Flickers | Occlusions | Hidden |
|---|---|---|---|
| Lap ('knees') rests at tables | 588 | 267 | — |
| Plan B, both hands on the top ('tableBoth'/'forearmsTable', palms about 0.80–0.82) | 37 | 45 | 1096 |

- In the lap variant, palmh shows many "knee" palms at 0.77–0.84. They aren't under the top: the knee target sits under the table's near edge, and the arm or thigh fix lifts them through it. Only a few reach 0.59–0.67.
- Plan B's remaining 37 flickers are stance transitions (`st:turn` / `st:shake`), where a resting hand dips to about 0.63 and comes back.
- Plan B departs from the coordinator's "lap hands under the top, only a few on the edge", so it needs sign-off.
- The Plan B people.js is saved as `mo/stage/people.planB.js.txt`. The live stage people.js is the lap variant.

Not run this round: tablegeo after the latest changes, handocc in theatre, open mic and arena, anatomy, handsweep, bindcheck, the by-eye check, pack.

Next steps:
1. Choose between lap and Plan B, or a mix with most on the top.
2. For lap: put the knee targets at u ≥ 0.85 with palm y ≤ 0.68, and stop fixArms or the thigh push from lifting hands at 0.70–0.76 up through the top.
3. For Plan B: keep resting hands on the top through stance turns and shakes (hold the rest weight, or blend over the table, not under it).
4. Settle TABLE_D: 0.47 with a radius of about 0.40–0.42 if the distance must stay; otherwise justify 0.40.
5. Re-run tablegeo, handocc ×4, anatomy, handsweep and bindcheck, then the by-eye check, merge, pack --tv and pack-check.

Box: the page server on 8093 is stopped (PID 1936). The 8092 server and the relay aren't mine and are still running.

## 2026-10-14: frame-rate switches (round 8) and the theatre's house (packed)

- **Round 8 switches** (crowd.js; rows in `tools/render/tv-sweep.md`, "Round 8"):
  - `res405`, or `&res=405`, draws at 720×405; dynres now steps 450 → 405 → 360.
  - `fartypes3`: the bands from row 2 back use three avatar types.
  - `hazelite`: half the theatre's haze points behind the rows, larger and brighter.
  - `nolodclose`: no close-up crowd copy.
  - Plus the existing `dynres` and `fold`.
- **The theatre's house** (look.js), lifted in the stage look:
  - The theatre's settings are now depthSlope 0.12, depthFloor 0.7, hemi ×14 with a warm house light (sky 0x7a6a5e),
    fill ×1.2, and fog wide [6, 40].
  - The hemisphere needs a large multiplier: its colour is dim against the key's 200 at a few metres.
  - Results: the wide's mean luma 0.068 → 0.081 (near-black 57% → 51%), the bill 0.072 → 0.105, and every setup up
    with the brightness gate passing. Sheet: `docs/mockups/theatre-house-v1.png`.
  - `&look=stagedark` brings back the old theatre: a venue's `dark` overrides in look.js.

## Motion agent: club plan B, 2026-10-14 (NOT merged; blocked on the box)

**Where the work is:** only on the build box, in `~/m/stage2` (people.js, anatomy.js, venue.js and the tools/render probes: plant.mjs, tr.mjs, gl.mjs, tgt.mjs, tablegeo.mjs and handocc.mjs with multi-key dumps). A restart wiped the local scratchpad. The box became unreachable (13.232.190.82 times out) and `encore-box.sh` needs a fresh `aws login`. The shared tree has none of this round's changes.

**Plan B (hands planted on the table top):**
- Targets are fitted once per rest and kept: a hand stays fixed on the top while the body moves.
  - Each hand starts ahead of its own shoulder and slides onto the top, 8 cm inside the rim.
  - It stays on its sitter's own half of the top, at least 7 cm from the centre line.
  - The wrist stays a hand's length clear of the glasses and the jar.
  - The two hands are 15–19 cm apart.
  - Reach is held at or under 74% of the arm, measured from a smoothed shoulder.
  - Each hand stays within ±25 cm of the seat's centre line.
- Fidgets never take the hands at a two-top.
- Arm-pass reuse is off for table rests.
- guardElbows and the straight-arm fallback leave planted wrists where they are.
- armsOffBind turns the elbow and keeps the wrist.
- Lean at a table is +0.22 and smoothed. Turn, shrug and the laugh capture are damped there.
- A hand leaving the top for a gesture arcs 9 cm up.
- After the arm passes, palms and tips are cleared of the glasses and the jar.
- Forearms may lie across the rim's outer 6 cm, in both fixArms and the validator.

**Knees:**
- Each seat now keeps its table as `twoTop`; people.js and anatomy.js use the real table centre.
- Sitters set further back than the rest of their row sit forward up to 3.5 cm.
- The body turns on the seat towards the table, up to 23°, eased out in traffic.
- The knee gap is measured across the body's own hips, in both the leg pass and the validator.
- The knee-gap pass runs again, outer knee only, after the neighbour pass.

**venue.js, stage2 copy only:**
- The comment on the TABLE_R/TABLE_D constants is rewritten.
- `cabaretTables` keeps `a.twoTop = b.twoTop = t`.
- The table position, glasses and blobs are as in club4.

**Last numbers on stage2, before the final edit (the outer hand going further in instead of crossing the body):**
- handocc: club 0 flickers, 10 occlusions; theatre, open mic and arena 0 / 0 (those three not re-run after the late edits).
- tablegeo, sitters seated through listen at 9 times: knees under the top by 0.09–0.16. Female_Adult_02 is still at 0.09.
- Rim into the body: all at or under 0.
- Anatomy club: 4 findings, all in 'after':
  - elbow tucked behind (Female_Adult_03, Male_Adult_04);
  - table post (Female_Adult_13 while walking);
  - one glass.
- The last edit was mid-check when the session dropped.

**Not done:** handsweep and bindcheck on this version, the by-eye check, merge, pack.

**Next steps:**
1. With the box back, read `/tmp/ho-club.txt`, `/tmp/an-club.txt` and `/tmp/tg.txt` from the interrupted check.
2. Copy `~/m/stage2/{people,anatomy,venue}.js` and the probes back to the laptop.
3. Finish the 4 anatomy findings and Female_Adult_02's knee.
4. Run handocc ×4, anatomy, handsweep and bindcheck, then the by-eye check, merge, pack and pack-check.

## Motion agent: club plan B MERGED (2026-10-14 ~13:25 UTC; not committed)

Merged into the shared tree:
- people.js, anatomy.js and venue.js;
- tools/render: handocc.mjs (KEY dumps), tablegeo.mjs (`[state] [t,t,…]`, seated sitters only), plant.mjs (planted-palm motion) and gl.mjs (hands against the glasses).

**Verified on the box, stage2 = shared tree + these files:**

| Check | Result |
|---|---|
| handocc club | 0 flickers, 10 occlusions |
| handocc theatre, open mic, arena | 0 / 0 |
| tablegeo, every seated club front sitter, 9 times | knees under the top by 0.11 or more; rim into the body ≤ 0 |
| anatomy, all venues × all states (tv) | TOTAL 0 |
| handsweep | 0 invalid of 20 runs |
| bindcheck | no one in the bind pose |
| pack `--tv` (/tmp/packtv) | builds, 18.0 MB |
| packcheck from file://, 4 venues | ready, no errors (6 people posed with debug) |

**By eye:** the club bill, the wide and the candle close-ups (edgecheck shots on the box in /tmp/edge). Hands rest on the tops. The 80 cm table doesn't read as oversized.

**venue.js lines:**
- L53–56: the TABLE_R/TABLE_D comment and constants.
- L63–67 (`cabaretTables`): `t = {x: mid, z: r.z - TABLE_D, …}`, then `a.twoTop = b.twoTop = t`.
- L443: the table top is `CylinderGeometry(TABLE_R, TABLE_R, 0.03, 22)`.
- L452–453: glasses at `t.x ∓ 0.32`.
- L466–467: centre contact shadow scaled 1.0; glass shadows at `∓ 0.32`.

**people.js highlights:**
- Plan B planting, as recorded in the club5 notes above.
- The table sitter's talk capture is head-only at a two-top.
- A knee that strays from under the top turns both thighs back towards the table's middle (up to 17°).
- The knee gap is measured across the hips and aims for 12.5 cm.
- Sitters set back from their row sit forward on the seat (up to 3.5 cm) and turn on it towards the table (up to 23°), eased out in traffic.
- Fingertips are cleared of the glasses and jar last.

**anatomy.js:**
- `tableAt` / `overTop` use the table disc; forearms may lie across the rim's outer 6 cm.
- `guardElbows` leaves planted wrists alone.
- The knee gap is measured across the hips.
- The rim-into-body tolerance is 5%.
- The table furniture checks are skipped for walkers (`_inTraffic`).

**Backups on the laptop:** ~/encore-motion-wip-club5.tgz (box stage2) and ~/encore-motion-wip-club6.tgz (the merged work).

**After the merge:**
- **Fix, merged:** the table-lean smoothing had reused `this._lsT`, which is the laugh score's clock, so the club table sitters' laughRank stopped easing. It now has its own `_leanT` / `_leanS`.
  - Re-checked after the fix: club handocc 0, club anatomy 0, knees 11 cm or more under the top.
  - Re-packed `--tv` (18.0 MB) and pack-checked all 4 venues: ready, no errors.
- **JS cut, started in the box copy only (`~/m/stage2/people.js`, not merged):** the face is held at 10 Hz while a person is calm (never in stepped views).
  - Not measurable today. The box is running other jobs (load average 14), and Person.update at 8× reads 16–18 ms for both s19 and the merged build, so the numbers are noise.
  - On a quiet box, the merged build measured no slower than s19 (14.6–15.9 vs 16.3–18.3 ms).
- **Next:** on a quiet box, run jsperf at 8× for the face hold, arm reuse for laughers and the spine-chain update, then the validators, then merge.
- **Host `ready` waits for the front people** (APK t: "front people are not rendered for a few secs").
  - In host mode `ready` goes out only once the streamed front people have been drawn. The first frame now posts
    `{ type: 'first', load }` for timing.
  - After a venue reload, the held frame of the old room also stays until then, and a page loaded mid-set takes the
    same path.
  - If the front fails or takes over 20 s, `ready` goes out anyway. `body.dataset.ready` (the box harnesses) still
    marks the first frame.
  - Box at 8× (`ttff.mjs` now reports both times): theatre first frame 5.1 s and ready 6.9 s; club 3.4 s and 5.6 s.
    A venue change: first 4.4–5.3 s, ready 5.8–7.3 s.

## 2026-10-16: the shapes ("curves are sharp"), packed

- **Full bodies in close-ups.** Each `.tv.glb` carries `<name>_bodyHi`, the full model's body (3.5–5.3k triangles
  against the drawn body's 1.3–1.6k), written by `tools/tv_body.mjs`.
  - `prepFront` takes it out at load. `setBodyDetail` (from `applyShotLight`, so only on a cut) swaps it onto the people
    a close-lit shot frames, and onto the heckler in theirs; it swaps back on the wide.
  - `&ab=nohibody` turns it off; `window.__bodyDetail(on)` is for harnesses.
  - The drawn body stays as `build_people` made it. `NEW_LOW=1` regenerates it with meshoptimizer's attribute-aware
    simplifier, but that moved the anatomy fits (79 findings in the club against 0).
- **Male_Adult_17** (the blue and white hoodie, which the TV reports called Male_Adult_04) has softer sleeve weights in
  `build_people.mjs` `limbFit`.
  - Before, every arm-owned vertex went all arm, cutting the shoulder off the spine. Now the shoulder keeps its blend:
    only the sleeve more than 14 cm from the upper arm's root drops its body weights, and only the side below the armpit
    drops its forearm and hand weights.
  - It was rebuilt with `ONLY=front`, then `tv_morphs`, `hair_tv` and `tv_body`.
  - The jagged shards in laughs-v1 came from that harness's close camera, whose near plane at 1.2 m cut the person
    between it and its subject open. `shapesheet.mjs` uses 5 cm.
  - The white panel on his back in the close-ups is the hoodie's texture.
- **Shading.** The front people were already lit per pixel (MeshLambertMaterial is per-fragment in r160); only the
  instanced crowd uses vlit.
- **FXAA, the tv default** (`&ab=nofxaa` turns it off). The scene renders into a target marked `isXRRenderTarget`, so it
  is tone-mapped as on the canvas, then one pass does FXAA and the final pass's vignette, band and grain.
- **dynres** is the tv default (`&ab=nodynres`).
- **Gates.** Brightness gate pass, edge bands 0, anatomy 0 in all venues, packcheck OK.
- **Size.** The pack is 20.1 MB (was 18.0); per-venue textures are unchanged (29.5 / 29.8 MB ≤ 30).
- **Sheets.** `docs/mockups/shapes-v1-<venue>.png` (before | after; rows are three setups and one person close).
  Round 9 is in `tools/render/tv-sweep.md`.
- **Build box.** The Rocketbox source for Male_Adult_17 and FBX2glTF are on BOX=build now (`~/.cache/encore-rocketbox`,
  `~/.cache/encore-tools`), with a Pillow venv at `~/pyenv`.

## Motion agent: motion v2, the captures first (2026-10-16 ~17:45 UTC; merged, not committed)

User feedback from the TV: "people are looking like handicapped; movements are abnormal". I tested whether the stack of correction layers over the Rocketbox captures was the cause, then took most of them back out.

**New switches (people.js):**
- `&raw=1`: the captures as authored, with every correction layer off.
- `&off=look,lean,shrug,rest,gest,legs,clamps,fix`: one layer at a time off.

**New tools (tools/render):**
- `motionstrip.mjs`: a 4 s strip, 10 fps, of the front pair in a mid shot. It covers 1.5 s of listening and a big laugh, with the same seed every run.
- `layers.mjs`: how far each bone group turns away from the raw capture, in degrees, plus the anatomy findings, per configuration.
- `who.mjs`: each front person's laugh style and gestures, the chest's lean, bend and twist, and the head's pitch, yaw and tilt.
- `handocc.mjs`: a second, hand-area verdict. It casts 5 rays (the palm and four points 3 cm round it), with hysteresis at 40% and 60% seen.

**Sheets (docs/mockups):**
- `motion-v2-<venue>-raw.png`, `-current.png` and `-after.png`: 5 × 8 frames each.
- `motion-v2-<venue>-compare.png`: 5 moments, with raw, current and after as rows.

**What each layer does.** Mean turn away from the raw capture across the front people and 6 moments, in degrees, for head / chest / pelvis / arms / legs:

| Venue | Current | After |
|---|---|---|
| Club | 21 / 28 / 17 / 50 / 17 (anatomy 6) | 14 / 9 / 1 / 45 / 7 (0) |
| Open mic | 20 / 21 / 3 / 33 / 7 (3) | 13 / 14 / 2 / 30 / 6 (0) |
| Theatre | 15 / 20 / 3 / 28 / 9 (2) | 10 / 13 / 2 / 32 / 9 (0) |
| Arena | 23 / 10 / 1 / 45 / 5 (0) | 14 / 5 / 0 / 43 / 5 (0) |

**Layers that made people look stiff or wrong** (each was turned off in turn on the current build):
- **Turning on the seat at a two-top** (up to 23°), the scoot forward and the knee turn: pelvis 17°, legs 17°. These were removed. They existed only for the "knees 10 cm under the top" rule.
- **Procedural lean, turn and side bend:** 13–15° of chest on their own.
  - At the table, the +0.22 lean and its 0.12 minimum made the hunch over the top. Now +0.06, with no minimum.
  - The posture styles' leans are halved, and the attention lean is cut from 0.18 to 0.08.
  - The laugh styles were stacked on top of the laugh captures. Now:
    - head back 0.21–0.35 → 0.1–0.16;
    - rocking 0.14 → 0.06;
    - "ha" bounce halved;
    - turn style 0.25 → 0.06;
    - neighbour gesture 0.3 → 0.08;
    - knee slap 0.3 → 0.12.
  - Whatever the laugh block still adds is halved while a capture plays.
- **Head:**
  - The gaze pitched the face fully up at the stage; now half of it, within ±4.6°.
  - The laugh's head-back limit is 16° (was 30°), and 12° otherwise (was 20°).
  - The new `clampRoll` eases a head tilted past 16° back by three quarters of the excess. The laugh captures alone tilt some heads 25–35°.
- **Damping at the tables:** the laugh capture went from 0.45 to 0.8 of its strength, and the shrug from 0.35 to 0.5.
- **Laugh bouts** now ease in and out over 0.2 s (was 0.08 s), so the body no longer snaps between "ha"s.

**Layers that are needed** (anatomy findings with the layer off, current build):
- The arm fix: 24–37 hands or forearms into thighs and torsos.
- The seated leg passes: 18 "ankles crossed" and 6–12 legs through neighbours.
- The rest poses:
  - At the club, without them, 13 table collisions.
  - Elsewhere the capture's own arms pass, but the fix then lifts hands to hover beside the knee, as the sheets showed. So they are kept.
- The clamps: a few shoulders off level and spine twists.

**Fixes found on the way:**
- At a two-top an elbow rule no longer draws the wrist in. bestElbow's 95% draw-in made a resting hand hop 2 cm off the top.
- A standing person's knees are softened before the arms are posed. The softened thigh came forward into a hanging hand after the arm pass (arena, after).

**Gates on the merged build:**
- anatomy: TOTAL 0, all venues and states.
- handsweep: 0 invalid.
- bindcheck: no one in the bind pose.
- handocc: theatre, open mic and arena 0 / 0.
  - Club single-ray: 2 flickers, 8 occlusions. Both flickers are Male_Adult_17's left palm grazing a glass's silhouette edge 4 m away. The palm drifts 0.4 mm and the ray flips.
  - Club hand-area: 0 flickers, 5 occlusions.
- Pack `--tv`: 20.1 MB. packcheck: 4 venues ready, no errors, 6 people posed.

**Rules I propose changing** (I haven't changed them):
1. **handocc:** judge on the hand-area verdict, not the single ray. A ray at a silhouette edge flips on sub-millimetre motion, a flicker no one can see.
2. **tablegeo's "knees 10 cm under the top":** drop it. With the hands on the top it serves nothing, and it forced the seat turns and knee twists. The anatomy table checks (post, top, rim, glasses) still guard against intersections. After the change some outer knees sit out from under the edge, by up to 5 cm.
3. **"ankles crossed" (limbs):** flag only shin or foot interpenetration. Crossed ankles are a natural seated pose, and the women's seated capture has them. Today the leg pass uncrosses every one.
4. **clampSpine while resting:**
   - Allow 12–15° of shoulder turn against the hips (now 7°) and of shoulder tilt (now 6°). Resting people never shift or turn their shoulders, which reads rigid.
   - Relax the "elbows alike within 25°" evening, which keeps resting arms symmetric.

**Not done:**
- Phase-matched clip transitions. Laughs start at a seeded point of the capture; the crossfades are rest poses 1.0 s, fidgets 0.5 / 0.6 s, busy hands 0.3 s, laugh bouts 0.2 s.
- The JS cut is paused.

## Motion agent: motion v2.1, the approved rule changes (2026-10-16 ~18:30 UTC; merged, not committed)

The four rule changes the coordinator approved are in:
1. **handocc judges on the hand-area verdict.** `flickers` and `occlusions` now come from five rays (the palm and four points 3 cm round it), seen at 60% or more and hidden at 40% or fewer. The single ray is kept as `flickersRay` and `occlusionsRay`.
2. **"Knees 10 cm under the top" is dropped.** tablegeo is a report only now. The dead knee-to-table pass and the seat turn and scoot code are removed from people.js. The anatomy table checks (post, top, rim, glasses) stay.
3. **Crossed ankles are allowed.**
   - The limbs rule is now "shins through each other": the two shins' centre lines nearer than 7 cm. It used to flag any ankle gap under 10 cm.
   - The new `Person.shinsApart()` turns only shins that interpenetrate apart (under 7.5 cm), each away from the other where they are nearest, by what that point needs. It runs after the leg passes and again after the spine clamps, since the thighs hang from Spine and a clamp swings them.
   - The capture's own crossed ankles now play.
4. **Resting shoulders:**
   - clampSpine allows 13° of turn and of tilt against the hips (was 7° and 6°).
   - "Shoulders not level" fires past 15° (was 10°).
   - "Elbows not symmetric" fires past 45° or 15 cm (was 30° or 10 cm).
   - The people's elbow evening and the straight-arm fallback act past about 43° (was 24°).

**Also this round:**
- **Phase-matched laugh starts.** `quietStart()` picks, once per clip, the moments of each laugh capture nearest its own mean pose (the quietest quarter, sampled every 0.1 s). A take's seeded start now chooses only among those, so a laugh grows out of the pose the body is already in.
- **Seated rest poses.** The theatre and open mic sheets still showed both hands out on the knees with the arms near straight.
  - Rest weights: thighs 3 (was 2.2), knees 0.6 (was 1.6), thighKnee 1.2 (was 2), clasped 0.8.
  - A resting hand may come in to 0.72 of the arm's length (was 0.78), an elbow of about 92°.
- **Claps.** keepHandsOut runs again after the wrists' joint limits, which had turned the fingertips through each other (theatre, clap). If it moves an arm, fixArms runs once more for the elbows.

**Gates on the merged build:**

| Check | Result |
|---|---|
| anatomy, all venues and states | TOTAL 0 |
| handsweep | 0 invalid |
| bindcheck | no one in the bind pose |
| handocc club (area / single ray) | 0 / 0 flickers, 7 / 9 occlusions |
| handocc theatre, open mic, arena | 0 |
| Pack `--tv` | 20.1 MB |
| packcheck, 4 venues | ready, no errors, 6 people posed |

**Sheets:**
- `docs/mockups/motion-v2-<venue>-after2.png`.
- `docs/mockups/motion-v2-<venue>-compare2.png`: the same five moments, with raw, current, after and after2 as rows.

## Motion agent: life-v1, stopped at hand-over (2026-10-18 ~13:15 UTC; NOT merged)
- **Box copy:** `~/m/stage2` on 13.200.70.11 is motion v2.1 as merged, plus probes. Today's edits were never synced to it. The shared tree is motion v2.1.
- **Laptop WIP:** `~/encore-life-v1-wip.tgz` holds people.js (`mo/stage/people.js`). It has not been gate-checked. It contains:
  - a third seeded stream (r3) that leaves the existing draws untouched;
  - blinks 2–10 s apart, 10% doubles, some skipped while rapt;
  - saccades to the performer, to a neighbour (`nb` flag, on the friend's side) and to the room;
  - upper lids following a downward gaze;
  - `faceTick()`, which drives the blink morphs on a calm person's held 5/3 Hz frames, so the face is never frozen.
- **Next, not started:**
  - breathing in clip mode: Spine2 pitch and the clavicles, at `breathHz`, about 0.012 / 0.022 rad;
  - slow side, turn and head-roll drift from `lifeSeed`;
  - a look between partners 1.6–3.4 s into a laugh (`this.side`, `this.partner`), plus rare whispers during listening;
  - touch_face, touch_hair and scratch_head added to the FIDGETS listen list at low weight, with a slightly higher listening rate;
  - gates, then the life-v1 strips and mp4.

## 2026-10-18: realism pass, stopped early (handed to the box session)

- **Audit** (club, TV resolution, `tools/render/realsheet.mjs <page> <venue> <out> <beforeQ> <afterQ>`: three setups, a
  person close and a face close):
  - skin is flat orange plastic with no sheen;
  - the eyes have no catchlight;
  - the clothes have no normal detail; the `.tv.glb` files carry no normal maps;
  - there is no AO under the chin or collar, and the hands on the table have no contact shadow.
- **New hooks in crowd.js:** `window.__renderWith(cam)` renders one frame through FXAA from a harness camera, which
  realsheet uses.
- **Prepared, not wired:** 256² normal maps from the Rocketbox sources (head and body, all 12 avatars) are in
  `tools/render/nmap256/`, from the 2048 TGAs; Rocketbox has no specular maps. The club's textures are 29.5 MB:
  - the crowd atlas 5.3 MB, the walls 3.3 MB (1024×640: drop to 512×320 for tv), the floor 1.3 MB;
  - per front person 1.33 MB head plus 0.75 MB body plus 0.75 MB hair.
  So shrinking the walls and floor makes room for the normal maps within 30 MB.
- **Next:**
  1. embed the normal maps into the `.tv.glb` files and set them on the Lambert materials (`&ab=nonormals`);
  2. add a skin spec/sheen term to `skinLit`;
  3. add eye catchlights as a Points draw at the LEye/REye bones toward the key, close and mid shots only, hidden
     while blinking;
  4. add DOF in close-ups in the FXAA pass, from a DepthTexture and the setup's focus distance;
  5. bake per-vertex AO into the `.tv.glb` files.
  Each as an `&ab=` switch; the sheet is `docs/mockups/real-v1-<venue>.png`.
