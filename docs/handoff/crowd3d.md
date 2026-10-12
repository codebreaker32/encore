# Handoff: 3D crowd (prototypes/crowd3d): Batch 1.5, the TV speed work, the v7 fixes

Updated 2026-10-12, about 10:00 UTC. Nothing is committed. All .js/.mjs files pass `node --check`.
- **Ownership:** a motion agent owns traffic.js, anim.js, and the behaviour, gesture and face code in people.js and
  instances.js. I own crowd.js, venue.js, rooms.js, arena.js, sound.js, look.js, the material and lighting terms,
  textures.py and the tools.
- **Services:** the render box's servers are stopped (start :8091 with `python3 -m http.server 8091` in
  ~/strumble/prototypes/crowd3d). The box stops itself after 45 idle minutes; `encore-box.sh start`, then `up`.

## Latest (v7, 2026-10-12)
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
