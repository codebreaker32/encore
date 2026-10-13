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
