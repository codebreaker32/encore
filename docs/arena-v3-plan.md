# Arena v3 plan (from the arena-redesign workflow, 2026-10-16)

Produced by a workflow: a map of the current arena, a visual audit and a technique survey; four competing designs (realism, budget, cinematography, delivery risk); three judges; a prototype measured on the build box (`prototypes/crowd3d/spikes/arena-v1/`, strip `docs/mockups/arena-spike-v1.png`); three adversarial critics; and this final revision. **Status: awaiting the user's approval of the direction (gate G0).**

## Arena v3 (final): a seated comedy-special bowl of live 3D people, shot from the stage, under light that answers the room

The arena becomes what an arena comedy special actually looks like: a seated floor of 1,822 chairs in straight rows with aisles, a 3D end stand and a dim upper ring, all seen from the stage. The home shot (S1, 30 mm from the stage lip) looks down about 1,320 3D floor people and 1,045 3D tier people, receding row by row into steel-blue air. No sky shows, and no impostor is nearer than 30 m. Every visible person is one of our own Rocketbox avatars, skinned on the GPU every frame from a 1.3 s ring of live poses that 70 puppets write 20 times a second. The puppets take their decisions from people.js Person.response, with the same castShare, castU, VOCAB.stadium and VENUE_LAUGH.arena as the six. They take their motion from the Rocketbox seated and laugh captures, and their gestures from key poses baked through the motion agent's own rig, IK and anatomy fixes. Each person reads their puppet through their own time-warped delay, mirroring, amplitude, arm angles, 'ha' rhythm, glances, turns to a friend and jaw. So neighbours never move in step, each laugh starts on each person's own reaction time (median 0.25 s) rather than as a stadium wave, and mouths open on laughs. While the performer talks the room is never still: each person rides one of 16 captured life events (touching the face, scratching the head, looking around, shrugging) every 14 s or so, glances and shifts posture, and the camera rotates between three moving wides. Every light has a source the viewer can see, and lights change only on measured moments: the house brightens 8-12% with a laugh, the blinders fire once on a measured cheer, and the floods follow the house lights. This version follows the spike: the detail levels are the sizes that looked right, re-costed layer by layer from Mali-G31 cycle counts times measured coverage. At planning rates every wide shot comes to 21-24 ms p50, 29.5-32 ms pessimistic, against 74 ms today. A TV bench measures the real cost per vertex before the floor is built. The user sees the work three times before anything becomes the default: a direction clip on Saturday, the floor alone on Sunday, and the MVP on the TV on Tuesday.

## Components

### C1. Pose engine: 70 puppets, live pose ring, person-state texture (new arena2/puppets.js, posering.js, lanes.js)

**Puppets (70, invisible):**
- 48 reaction puppets (24 female, 24 male). Each is a rig-less people.js Person (new Person(null, null, {seed, row, x, ...}), as instances.js:473 does). One adapter feeds them the same room state InstancedCrowd.update reads. Their decisions come from response(): castShare and castU for each reaction id, take, style, gestures, haHz and clapHz, with VOCAB.stadium and VENUE_LAUGH.arena.
- 6 twins of the six, built with the six's own constructor options (seed, row, x, avatar name, neighbour links), so they make the same decisions. A trace test checks this.
- 16 event lanes (8 per gender) that only play captured life events.

**Motion.** A 21-bone sampler (the spike's 20 crowd bones plus MJaw) over the read-only ANIM.clips, about 5 times cheaper than anim.js sample(). It plays:
- the seated captures: sit_chair_idle_neutral (18 s), breathe (12 s), look_around, touch_face, touch_hair, scratch_head, cough, yawn, roll_head, shrug, thoughtful;
- the standing laughs (low, loud, extreme), torso only, on the seated body, composed the way people.js composes them;
- talk clips at half strength on the head and torso;
- sit_stand_up and sit_down for ovations.
Each puppet has its own phase and a rate of 0.92-1.08. Half the takes are mirrored.

**Gestures.** About 20 key poses per gender, baked on the box by floorlods.mjs through the motion agent's current Rig, IK and anatomy armFix, and stored in floor_lods.bin:
- seated claps, open and shut, at chest, high and overhead;
- both arms up, one arm up, a fist pump, a whistle;
- a hand to the mouth, a knee slap, an armrest slap, hands on the head, arms folded;
- a point, a snap, a phone at the chest and a phone raised.
They blend per bone by nlerp on minimum-jerk curves (rise 0.35-0.6 s, fall 0.6-0.9 s). Claps alternate their open and shut poses at the Person's own clapHz. The poses are re-baked at every integration point. IK runs only for puppets that are gesturing.

**Left to the shader, per person:** the 'ha' pulse (the puppet writes only the laugh level and the bout envelope) and the turn to a friend (the puppet writes only how far, not the bone turn).

**Ring:**
- allocated as RGBA16F and uploaded from Float32 with type FLOAT, so the conversion runs off the JS thread;
- 1,610 x 52 texels, 0.67 MB: 35 puppets x 46 texels per row, and 26 slots x 2 rows, so 1.3 s at 20 Hz;
- per bone, 2 texels: the quaternion and the translation;
- per puppet, 4 summary texels: laugh level and bout, clap weight and phase, arms up, friend turn, standing, both shoulder pivots, hand position and phone state;
- one texSubImage2D of a 1,610 x 2 strip per tick (52 KB of Float32 in, 26 KB on the GPU), at frame start, through renderer.state.
A build assert keeps every read delay plus interpolation 3 slots clear of the slot being written.

**Ticks:** 20 Hz, staggered so a puppet updates at most once a frame. Each pose is computed for its slot's exact time. No arrays are allocated per tick.

**Person-state texture** (RGBA8, 64 x 96): one texel per person, holding the lane and the ride start, an alternate or override puppet, and flags. The CPU writes it only when something changes, about 10-20 texels a frame.

**Life-event scheduler:**
- Each person has their own schedule: exponential, mean 14 s, at least 5 s apart. It runs x0.6 when measured attention is high and x1.5-2 with measured restlessness.
- At an event, the person picks a lane whose cycle starts within 0.8 s and rides one cycle, with 0.4 s crossfades through the lanes' idle stretches.
- A reaction that casts the person ends the ride in 0.3 s.
- The yawn lane runs only while measured deadBits is 2 or more.
- Between reactions, while near idle, 30% of people swap to their alternate puppet (chosen by a hash of the reaction id, inside the neighbour rules). So the set of people sharing a puppet changes from laugh to laugh.

**People:** Draws nothing itself. It drives every 3D floor and tier person (1,816 floor seats and 3,546 lower-tier places), the six's twins and every impostor cell. In S1 that is about 2,360 3D people and about 1,300 cells.

**Animation:** **Inputs, all measured:** room.events with their levelAt envelopes, murmur and restless, attention, deadBits, heckle, finale, act and room.house.

**Temperament** comes from each Person's seeded traits. Seeds are picked so each gender has about 6 big laughers, 6 laughers, 4 chucklers, 3 who turn to a friend, 2 clappers, 1 phone person, 1 still listener and 1 sceptic.

**Casting:** every reaction recasts the room through castU, and the arena share follows castShare(strength). There is no shared clock.

**Validation:** a sheet compares each puppet with a full headless Person.update rig on the same seed.

**Cost:** **CPU, box at 8x:**
- puppets: 2.4 ms p50 and 3.5 ms p90 a frame. About 47 updates land in a 30 fps frame; the spike measured 14-17 us per puppet unthrottled and 40-100 us at 8x.
- ring and state uploads, JS side: 0.3 ms p50, 0.6 ms p90.

**GPU:** 0 draws. Textures 0.69 MB. The key poses add 0.1 MB to floor_lods.bin.

### C2. Live 3D seated floor and lower tiers (new arena2/floor.js; meshes from new tools/render/floorlods.mjs into people/floor/floor_lods.bin)

**Layout:**
- seated rows at 0.52 m seat pitch and 0.85 m row pitch, from z 3.0 to 36;
- a 25-seat centre block and two 12-seat side blocks, with 1.4 m aisles and a cross-aisle at z 17.4-19.2;
- a hole for the mixing-desk riser (FOH, z 26-30.5, |x| under 3.2);
- 1,822 seats, 6 of them the six's; about 3% empty, near the aisles;
- 40% in friend clumps of 2-4 adjacent seats;
- lower tiers seated on the rake: the sides 18 rows (2,520 places) and the end 18 rows (1,026).
The rows in front hide everything below the chest, so the vertices go to heads, shoulders and arms.

**Levels,** chosen by head height on screen at the live drawing height. None is rigid, and none is the 16-triangle figure or the eye band:
- **L0, 22 px or more** (M and S5 only): the far mesh cut below the chest with a thigh stub, 320 vertices or fewer, with head, neck, shoulders and arms locked during simplification, and MJaw.
- **L1, 13-22 px** (up to 28 px at a frame edge): about 160 vertices, a skin-aware simplification of the far and xfar meshes that keeps the UV seams. It includes a low opaque hair shell built from the hair cards, is cut chest-up with a thigh stub, and has MJaw.
- **L2, 7-13 px:** about 60 vertices: the avatar's own head (about 22 vertices, painted face UVs, hair shell), shoulders and chest, and 4-sided tube arms with an elbow ring, skinned to 2 bones at the elbow.
- **L3, 4-7 px:** about 26 vertices: a textured head, a chest wedge, 3-sided tube arms with elbows, and a lower-body stub.
- **L4, under 4 px** (tiers only): about 14 vertices, with arms as 2-segment camera-facing strips that never go edge-on.

**Vertex format:** 20 B; normal.w holds the vertex class (hair, skin, head, arm).

**Per instance,** one interleaved buffer:
- x, z, and the sine and cosine of yaw;
- person id, puppet, base delay d0, build;
- palette, hair tint, skin shift;
- flags: mirror, friend side, edge, twin.

**Vertex shader** (explicit precision highp float, int and sampler2D):
1. Fetch the person-state texel, which picks the puppet or lane and the crossfade.
2. Read time = now - (d0 + A sin(2 pi t / T + phi)), with A 0.08-0.15 s and T 3-8 s. This time warp lets local playback speed drift 10-20%.
3. Slot pair, with uFrac from the CPU; 2 bones x 2 slots x 2 texels; mirroring by swapping left and right bones.
4. Amplitude 0.75-1.2 on the spine, neck and head.
5. Arm variation: a symmetric clap-height pitch of +/-15° always, so the hands still meet; independent offsets of +/-12-20° only while the arms are up.
6. The 'ha' pulse at the person's own haHz and phase: shoulders 2-4 cm, spine 2-4°, and the jaw.
7. Glances of +/-25° for 2-4 s every 6-20 s, more often with measured murmur and less often with high attention.
8. The turn to a friend, towards the actual friend side; the heckler look.
9. Posture resets every 8-20 s; head width and jaw +/-5%.
10. Light: one light-texture fetch at the base position, plus key N.L, hemisphere x house, the pools' top term and the rim; then fog; and, in wide-lit shots, the vignette and the lower-third band per vertex.

**Fragment:** atlas x vMul + vAdd, with the hair and skin tint by vertex class, then Hejl.

**Materials and programs:** one material per level, with shared uniforms and uCol/uPal in a data texture. L3 and L4 share one program. Programs compile through KHR_parallel_shader_compile before the floor is shown.

**Variety:**
- all 12 types at L0/L1 wherever the six are hidden; no cast type within 4 m of the six's seats;
- hair tint: black 35%, dark brown 30%, brown 15%, grey 10%, blonde 8%, red 2%;
- skin +/-4%; no distinctive type above 6% of people;
- clothes albedo 0.08-0.25 across hues.

**Neighbour rules,** asserted at build:
- no same puppet within 2 m, with a mirrored pair counted as the same stream;
- within 2-3.5 m, the same puppet only with d0 at least 0.25 s apart and a different warp phase;
- no same (type, hair) within 2 m;
- friend clumps on different puppets, with linked onsets.

**People:** Counted by scratch arithmetic over this layout and each camera, before the caps:

| Shot | Floor | 3D tiers | Cells |
|---|---|---|---|
| S1 | 1,319 (L1 155, L2 303, L3 861) | 1,045 (L4 1,026, L3 19) | 258 far side, plus the upper ring |
| W-B | 1,478 (L1 110 incl. the six's twins, L2 413, L3 955) | 1,026 | 315, plus the upper ring |
| M | 830 (L0 73, L1 175, L2 425, L3 157) | 113 | 94 |
| M' | 839 | 85 | 68 |
| S5 background | 88 (capped) | 0 | 0 |

**Animation:** **Each person's onset is their own:** the puppet's reaction time (Person.rt, 0.12-0.37 s) plus d0, drawn from a lognormal with median 0.25 s and 10-90% at 0.12-0.6 s.
- Friends join within 0.1-0.2 s of the first in their clump.
- Laughs have no distance term.
- Applause and cheers may build from the front over 0.3 s at most.
- The tiers read 0.15 s later.

**Targets in S1, at 800x450 with the camera frozen:**
- laugh 0.9: heads move 3-10 px and hands 10-35 px;
- listening: L0/L1 heads move 1.5 px/s or more at p50 and 5 px/s or more at p90;
- in every 3 s window, 25% or more of visible people move 2 px or more.

**Cost:** **S1 at its 78k-vertex cap** (80k before the cap):
- vertex 14.2 ms planning, 17.9 pessimistic;
- fragment 3.2 ms planning, 5.5 pessimistic.

**Rates** come from the spike's malioc cycle counts:
- planning: L0/L1 about 51 cycles (0.215 us), L2 40 (0.17 us), L3/L4 39 (0.165 us);
- pessimistic, if the light-texture saving never comes: 0.27, 0.215 and 0.21 us.

**Draws:** 22 or fewer in S1 (L1 12, L2 6, L3/L4 2+2; no L0 in S1).

**Memory:** floor_lods.bin 0.8 MB or less; about 2.5 MB of vertex buffers; no new texture (lod_atlas_1k is shared).

### C3. Per-setup allocation, precomputed instance buffers and lensguard (new arena2/alloc.js, tools/render/lensguard.mjs)

**At load, after the first frame,** for each setup:
- sample the camera move at 5 points, plus the extents of the first-minute push-in, the finale pull-back and the laugh punch-in;
- give each person the level their largest sample needs, at the live drawing height. Dynres is off in the arena; lensguard also runs at 405 and 360 for the emulator preset;
- apply the setup's vertex cap by demoting the farthest people, never past the pixel limits (L3 9 px or less, L2 16, L1 28);
- pack people nearest first into one InstancedBufferGeometry per (setup, group), sharing the level's vertex and index buffers;
- do this for three cap rungs (default, x0.8, Rung B);
- upload everything once, and warm it with one draw of each setup into a 16x16 target.

**At a cut** (hook H4, before the shot's first frame): swap mesh.geometry and instanceCount for each group, hide empty groups and rebake the light texture. No instance bytes are uploaded.

**lensguard.mjs** checks every setup and sample on the box:
- sky at most 3%;
- the six's heads outside the frame in every setup that hides them;
- cells only 30 m or more away with heads of 6 px or less, never on the floor or the end tier;
- the pixel limits and the caps;
- no group change within a hold.

**People:** Covers every place: 1,822 on the floor, 3,546 on the lower tiers, about 2,000 upper-ring and far-side cells, and the six.

**Animation:** Levels change only on cuts. Within a hold every level is chosen for the whole move, so nothing pops.

**Cost:** About 2 MB of per-setup instance buffers for the three rungs. About 150 ms once at 8x, after the first frame. About 0.6 ms of CPU per cut at 8x. Nothing per frame.

### C4. The front six, seated in row 0, and their twins (the crowd agent's and motion agent's pipeline is unchanged; arena2 owns only the layout and the visibility rule)

**Unchanged:** people.js Persons with live ARKit faces, the crowd agent's full bodies on cuts, and FXAA in close-lit setups.

**Layout (ARENA2):**
- the six sit in row-0 chairs: standing false, seatH 0.45, the theatre's seat geometry copied into arena2/shell.js;
- they sit behind a low barrier 1.4 m from the stage lip, with the pit cameras in between;
- presets.tv = {rows: 1, front: 6, inst: []}. With no InstancedCrowd in the arena there is no M-1, no M-2 and no dependency on instances.js, and every other person has one decision source in every setup.

**Visibility (hook H5):**
- drawn only in close-lit setups (S5, H);
- everywhere else visible=false, because with frustumCulled=false they cost about 9 ms of vertex work even out of frame (front-10.vert, 54 + 70.5 cycles);
- in S5, full bodies only for the featured pair (S.fullBodies, at most 2);
- in W-B their seats are drawn by C2 at L1 through the 6 twins.

**People:** 6, at the centre of row 0 (x within +/-1.3 m, z 3.0). Their faces carry S5 and H.

**Animation:** Person.update on the same measured moments. The twins make the same decisions at the same times, so a cut from W-B to S5 keeps who is laughing and how.

**Cost:** **GPU:**
- 0 in S1, W-B and M;
- in S5, about 12-15 ms with 2 full bodies, from the per-layer model (16-21 ms with 4).

**CPU:** people.js's 3 Hz unseen rate in the wides, about 1.5 ms at 8x.

### C5. Upper ring and far side tiers: live impostor cells (new arena2/cells.js; replaces the 12 x 3 blocks)

**One instanced quad per person** (4 vertices), using the approved baked avatar pictures (people/arena_sprites.png, downsampled at load to 256 px square).

**Per person:** a seated puppet, a delay and a mirror, chosen by hash.

**Vertex shader:** fetches the puppet's summary texel at that delay and moves the quad: a 1-2 px bob, a lean, a 30% lift while standing, and sway.

**Fragment shader:** one atlas tap with a +1.5 mip bias, the clothes and hair tint, fog and Hejl, in 12 cycles or fewer. The upper ring is at 30% light.

**Removed:** the 12-person row strips sliding as one, the 18% flicker, and the canvas texture.

**Kept from the old stands:**
- head heights jittered +/-6%;
- clustered empty seats (5% lower, 12% upper);
- aisle stairs with step lights;
- closed corners.

**Where:** only where a person is 30 m or more away with a head of 6 px or less, on the upper ring and the far side tiers.

**People:** About 1,300 in S1 (the upper ring about 1,040, the far side tiers 258) and about 1,350 in W-B.

**Animation:** Per person, never per block, a beat later (+0.2 s): they bob and lean on laughs and lift on an ovation.

**Cost:** About 5k vertices and about 10% coverage: 2.3 ms planning, 3.2 pessimistic. 1 draw. 0.35 MB of texture, 1.05 MB less than today's atlas.

### C6. Light: the MVP rig and the light texture (new arena2/light.js)

**Light texture:** a 64 x 64 RGBA16F map over the bowl's floor plan, rebaked on each cut and each cue (0.5 ms of CPU at 8x). It holds:
- the stage spill's cone and falloff, from crowd.js's key light read from the scene;
- the front audience wash;
- 4 static pools;
- the key attenuation in alpha.
C2 and C5 read it once per vertex. This is the spike's item 1, which saves about 20-25 cycles per vertex.

**Uniforms:** house wash, blinder, rim, fog lift.

**Fixture glows,** in the existing glow draw: the blinder lamps, the front and FOH truss, exit signs and step lights.

**Floods** follow room.house.

**People:** Lights every arena2 layer. The six keep people.js's light; the floor matches them because it reads the same key.

**Animation:** Changes only on measured moments. The cues are in the lighting section.

**Cost:** Under 0.3 ms of GPU, already counted in the per-vertex rates. 32 KB of texture.

### C7. Venue shell (new arena2/shell.js, merged into 2 room draws)

- **Stage deck,** lowered from 1.8 m to 1.5 m so the front rows show from the stage: lip lights, 6 two-lamp blinder units, wedge monitors and a mic-stand base.
- **Barrier:** low, 1.4 m from the lip.
- **Chairs:** seat-back strips along each row, with chair ends at the aisles and at empty seats.
- **Floor-mass plane** at y 0.9: textured from a 64 px square noise with the body-colour palette and lit by the light texture, so the gaps read as packed bodies, not black.
- **Tiers:** planes with seat stripes, aisle stairs with amber step lights, vomitories with exit signs.
- **FOH riser** with a desk glow.
- **Roof edge** with the front and FOH truss and their lamp glows.
- **Sky** only as a backstop that no setup frames.
- No stars, no text, no logos.

**People:** None.

**Animation:** Static. The glows follow C6.

**Cost:** About 4k triangles; 2.0-2.4 ms in S1 (today's 'everything else' measures about 5 ms).

### C8. Shots, moves and coverage (new arena2/director.js, through hooks H2-H5)

**Setups:** S1, W-B, M, M', the three front-row setups (S5) and H. Positions and lenses are in the shots section.

**Moves:**
- seeded stop-start operator moves: eased segments of 0.3-0.9 m at 0.04-0.08 m/s, with holds of 3-9 s between them, never periodic;
- a 0.05° operator noise on top;
- S5 and H locked off, or at most 0.03 m/s.

**Listening rotation:** S1 for 18-25 s, then M or M' for 12-16 s, then S1, then W-B for 12-16 s, on a seeded timer. It is constant production and makes no caption.

**Coverage:** the policy runs through hook H3. Each cut's move samples go to C3.

**People:** None.

**Animation:** Parallax: near heads slide over far ones, the floor slides against the stands, and in W-B the deck slides against the rows.

**Cost:** No GPU cost.

### C9. Integration: the ARENA2 venue module (new arena2/venue.js) and hooks H1-H8 (crowd.js only, about 25 lines)

**ARENA2** takes ARENA's look fields by spread (fog, grade, exposure, the cast, the stadium vocabulary, tone, light). It overrides:
- layout, build and cam (S1);
- presets.tv = {rows: 1, front: 6, inst: []};
- setups, director, frontVisible, postFor, and noDynres: true.
It is imported statically, so it survives the IIFE pack.

**Hooks:**
- **H1:** the import, and VENUES.arena = ARENA2 under &arena=2.
- **H2:** setups = V.setups ? V.setups(ctx) : buildSetups(ctx).
- **H3:** V.director.host(latest.shot, hist, api) in hostShot, where api is cut(name, idx, {quiet}), shot, cutAt and room.
- **H4:** venue.onCut(setup, shot) in cut(), before placeCamera; and S.move(t, pos, look) in placeCamera.
- **H5:** venue.frontVisible(setup) applied to the six in cut(); setBodyDetail reads S.fullBodies.
- **H6:** V.postFor(setup, shot) chooses between FXAA.render and renderer.render.
- **H7:** DYNRES && !V.noDynres.
- **H8:** room.front = people, read-only.

Nothing in director.js, arena.js, look.js, sound.js, venue.js or the motion agent's files. &arena=1 stays exactly as it is.

**People:** None.

**Animation:** None.

**Cost:** No runtime cost. The bundle grows by about 60 KB.

### C10. Measurement kit (new arena2/bench.html; tools/render/tv-round10.sh and tv-round11.sh; motionprobe, desync, echo, clonecheck, mouths, gpumem, lumaline and bonestretch .mjs)

**The bench** is the spike, packed for file:// through a second esbuild entry in tools/pack.mjs (a file neither agent owns). Its sweep mode runs about 22 configurations from one URL, 20 s each:
- uncapped (fps=0, nodynres, hud=0), at a fixed 800x450;
- on a base load that keeps every frame above 33 ms;
- logging frame p50 and p90, the vsync histogram and program link times;
- logging whether EXT_disjoint_timer_query_webgl2 exists, and if it does, per-pass GPU times.

**gpumem** counts bytes per texel by type and format, plus the colour and depth of every render target, and reports the back buffer separately.

**Probes,** with the camera frozen:
- motion: per-person head and hand px/s, and life events;
- desync: the maximum lagged cross-correlation over +/-1.2 s of 0.5 Hz high-passed head and hand paths, for pairs within 3 m, in the 2 s after onset;
- echo: the same hand path anywhere inside a 200 x 112 px patch;
- clones, mouths, aliveprobe, the luma timeline, anatomy on ring poses, and bone stretch.

**People:** None.

**Animation:** None.

**Cost:** Runs on the box only. On the TV: two one-command rounds, about 15 and 25 minutes of the user's time.

### C11. Pull list (started only after the user approves the MVP on the TV on Tuesday, in this order)

1. **Phones riding the hands:** GL_POINTS, 2 draws, 0.5 ms or less. Screens at the chest in measured dead air, raised to film at the finale.
2. **FOH followspots:** glare and a back rim; spot B finds a heckler.
3. **Moving pools** for the walk-on, cheers and the finale only.
4. **Arrivals in the preview:** 4 walk lanes ending in sit_down.
5. **A floor heckler:** one more Person at z 10-20; needs a crowd.js hook.
6. **Comedic-beat settle,** per person; needs a room.speaking hook.
7. **Boo pocket:** needs sound.react to return {kind, pan}.
8. **S3,** the pit Steadicam.
9. **S2,** the jib, only after an L2/L3 arm sheet from its angle passes.
10. **Haze cards and beams:** at the walk-on and finale only, on 25% of the screen or less, nothing within 12 m of the lens.
11. **Confetti** at a finale of 0.85 or more.
12. **Arms-up quads** for the cells.

**People:** Adds to the existing layers.

**Animation:** Each fires only on its measured trigger. Any item without its hook stays off.

**Cost:** Each is priced on the box before it ships, and each is a switch.

## Shots

All setups sit behind &arena=2, in arena2/director.js. The frame bands and counts are scratch arithmetic over the seated layout, using crowd.js's lens model (vertical field of view = 2 atan(10.125 / mm)) at 800x450, with the deck at 1.5 m.

**S1, the comic's-eye wide** (the home shot, lit like the wide; V.cam)
- **Camera:** [0.9, 4.0, -0.6], 2.5 m above the lip, looking at [0, 1.0, 18], 30 mm.
- **Bands, from the bottom of the frame:**
  - the bottom edge cuts rows 2-3 at about z 4.7, heads 22-28 px (L1);
  - z 10 at 35% (14 px heads);
  - z 22 at 55% (6.7 px);
  - the back of the floor (z 36) at 62%, with the FOH desk glow;
  - the 3D end lower tier from 62% to about 86%;
  - the dim upper ring to the top edge.
- No sky: the roof edge is above the frame.
- **In frame:** 1,319 floor people, 1,045 tier people in 3D, about 1,300 cells.
- The six (row 0, z 3.0) are below the frame in every sample, including the finale pull-back (asserted). They are hidden, not merely off screen.
- **Move:** stop-start lateral segments within +/-1.0 m with the pan following; crowd.js's first-minute push-in (+0.5 m) and finale pull-back (-0.7 m); a 0.25 m operator punch-in over 3 s on measured laughs of 0.4 or more. All of these are in the samples.

**W-B, the house from upstage** (lit like the wide)
- **Camera:** [0.6, 3.2, -7.0], looking at [0, 1.0, 30], 35 mm.
- **Bands:**
  - the dark deck with lip lights and blinder units fills 0-19%, under the lower third;
  - row 0 heads at 26% (17.7 px). The six's seats are drawn by their twins at L1;
  - z 10 at 40%, z 22 at 48%, the back of the floor at 52%;
  - the end tier, then the upper ring to the top. No sky.
- **In frame:** 1,478 floor people, 1,026 tier people, about 1,350 cells.
- **Move:** stop-start +/-0.35 m; a 1.5 m push over 10 s on the walk-on; a 0.7 m pull-back at the finale.
- **Used for:** the walk-on, cheers and applause of 0.6 or more, the finale, after the set, and the listening rotation.

**M and M', the floor mids** (lit like the wide; this is where the faces are)
- **M:** from the stage-left wing at [-3.5, 3.8, -0.5], looking at [2.0, 0.9, 10], 45 mm, on the house-right blocks.
- **M':** the mirror from stage right, [3.8, 3.6, -0.4], looking at [-1.5, 0.8, 9.5].
- The top of the frame sits 1.5° below the horizon, so there is no sky, roof or stage. The six are below the frame.
- **In frame:** 830-839 floor people, including about 180 faces at 13-35 px (L0/L1 after the cap), each laughing in their own way, plus about 100 tier people in 3D.
- **Move:** slow stop-start pans of 3-5° over 6-10 s.
- **Used for:** listening, laughs of 0.55-0.8, murmur and dead air, and the shot after H.

**S5, the front-row setups** (lit like a close-up; FXAA)
- Built with the director's pair() for the seated front row, with the cameras in the pit between the barrier and row 0: group at 40 mm, the front from house left at 30 mm, a two-shot at 65 mm.
- Locked off, or pushing 0.03 m/s at most.
- The six are drawn, with full bodies for the featured pair only.
- The floor behind is capped at 20k vertices (L0 only within 5 m of the lens) and dimmed to 0.4-0.7 in the close-up fog.

**H, the heckler shot:** unchanged, 85 mm. It cuts to M or M', where the turned heads show, then to S1.

**Dropped:** S2 (the jib) and S3 (the pit Steadicam), both now on the pull list; S4 (M covers it); the two 50 mm stand shots; the static 13.5 m crane; 'floor level from the pit'; the 38 mm 'floor crowd'; the 20 mm big wide.

**Coverage** (H3; PACE.arena stays at 5 s close and 8.5 s wide; never the same setup twice in a row)

| Moment | Coverage |
|---|---|
| Listening | The rotation: S1 18-25 s, then M or M' 12-16 s, then S1, then W-B 12-16 s |
| Laughs under 0.55 | Stay on the current wide; on S1, the punch-in |
| Laughs 0.55-0.8 | Alternate S5 with M or M'; W-B every third time |
| Laughs 0.8 or more | W-B or M first, then S5 for the next one |
| Applause | W-B or S5 |
| Cheer of 0.7 or more | W-B, with the blinder hit 0.1 s after the cut |
| Murmur and dead air | Hold S1 or M, moves at half speed |
| Heckle | H, then M or M', then S1 |
| Finale | W-B push, then M, then S5, then the W-B pull-back |
| After the set | W-B, floods at 100% |

**Hidden or framed out,** asserted by lensguard and setupsheet on the box:
- sky at most 3%;
- the stage and the performer as seen from the house;
- the six in any setup that doesn't feature their faces;
- legs inside the seated floor;
- any cell nearer than 30 m or with a head above 6 px;
- any person above their level's limit;
- any level change within a hold.

## Lighting

**Concept:** a comedy special shot in an arena.
- The house is lit so the cameras catch reactions: a soft, even audience wash.
- The stage spills warm light onto the front rows.
- The back of the bowl falls into steel-blue air.
- Every light comes from a source visible in the frame. Nothing moves unless a measured moment moves it.

This keeps the approved grammar (a dark house, warm spill on the front rows, rims and air behind), while the arena runs brighter, as the rules allow.

**Fixtures (MVP)**
1. **Stage spill:** crowd.js's key light (0xfff0e0), read from the scene each frame. Its cone and falloff are baked into the light texture at every cut; N.L is computed per vertex. Faces in rows 1-6 sit at display values of 0.35-0.5.
2. **Front audience wash** from the front truss (its lamps glow in frame): warm-neutral 0xffe6cc, reaching torsos as (0.55 + 0.45 N.F). The mid floor sits at 0.15-0.25.
3. **Four static pools** from the truss, 4-6 m across: warm at the front, steel blue at the back. They add up to 25% on heads and shoulders through the top-facing term. They hold still during the set; moving pools for the walk-on, cheers and the finale are on the pull list.
4. **House wash:** hemisphere x house.
5. **Back rim** from the FOH truss lamps at the back of the floor: cool white, pow(1 - |N.V|, 3) on heads and shoulders, to separate people on the far floor.
6. **Blinders:** 6 two-lamp units on the stage lip, warm 0xffc070, 0.12 s attack, 1.0 s decay.
7. **Flood banks** on the roof ring, through room.house: 8% during the set, 60% in the preview and walk-on, 40% at the finale, 100% after the set.
8. **Practicals:** exit signs, aisle step lights, the FOH desk glow, phone glints in the cells.
9. **Air:** the fog colour lifted to 0x0f1320 from 18 m to 120 m, so the end stand sits 35-45% in fog.

**Palette and grade**
- Clothes albedo varies from 0.08 to 0.25 across hues: navy, charcoal, denim, burgundy, olive, camel and grey, with cream or white at 6% and brights at 2%. Nothing is uniformly dark, and there is no pink speckle.
- Hair tints follow the C2 distribution; skin varies +/-4%.
- The arena's Hejl grade, with slightly cooler shadows.

**Looks**

| Region | Display value |
|---|---|
| Near faces (M, S5) | 0.35-0.5 |
| Mid floor | 0.15-0.25 |
| Far floor | 0.10-0.18 |
| End tier | 0.08-0.14 |
| Upper ring | 0.04 or less, apart from glints |
| Frame mean while listening | 0.18-0.24 |

**Cues** (each scaled by the measured level)
- **Laugh at level L:** the house rises 8-12% x L, with a 0.4 s attack and a 2.5 s decay. Nothing flashes.
- **Applause:** the house rises 15%; one blinder hit, only at a peak of 0.85 or more.
- **Cheer at 0.7 or more:** one blinder hit, sized by strength, back to base within 2 s.
- **Murmur and dead air:** the house falls 15-25% over 3 s, floored so aliveprobe stays at 0.45 or more.
- **Finale at strength f:** floods to 40%; a blinder hit at onset when f is above 0.7.
- **After the set:** floods at 100%, key at 0.35.
- **Heckle and singing:** no light change in the MVP. The followspot that finds a heckler is on the pull list.

**Close-lit setups (S5, H):** crowd.js's close-up lighting on the six. The light texture is rebaked with the widened key at the cut. The floor behind dims to 0.4-0.7 and takes the close-up fog.

**Safety:** at most one large-area flash every 2 s (WCAG 2.3.1), checked by the luma timeline on the box.

**The 2/5 rule:** aliveprobe must read 0.45 or more on S1, W-B and M at the darkest cue. S1 is about 85% crowd, W-B about 70% and M about 95%. At G2 the user judges the levels on the TV in its default picture mode.

## Reactions

**Who and when (every layer)**
- Who takes part comes from castShare and castU for each reaction id, at the arena share.
- When comes from each person's own reaction time: lognormal, median 0.25 s, 10-90% between 0.12 and 0.6 s. Friends join within 0.1-0.2 s of the first in their clump.
- No wave crosses the floor on a laugh.
- Tiers react 0.15 s later, cells 0.2 s later.
- The six run on their own Person; their twins make the same decisions.

**Laugh (level L, strength s)**
- **Floor and tiers:**
  - Puppets in the cast lay the captured standing laugh's torso over the seated body: low below 0.55, loud from 0.55 to 0.8, extreme above 0.8 for the big laughers.
  - Takes: head thrown back 15-25°; doubled forward (the spine, not just the head); a hand to the mouth; a knee slap or an armrest slap; turning to the friend actually beside them; above 0.8, a few arms up and whistles (VENUE_LAUGH.arena).
  - Each person's 'ha' heave runs at their own haHz. The jaw opens with FACE_TAKE plus the bouts.
  - People outside the cast who get smileOnly from Person lift their head slightly and open their jaw a little.
- **Cells:** bob and lean.
- **The six:** their own takes; laughRank picks the cutaway.
- **Light:** the house rises 8-12% x L. No flashes, no blinders.
- **Camera:** per the coverage table; under 0.55 on S1, the punch-in.

**Applause**
- **Floor:** clap key poses alternate at each puppet's own clapHz (1.8-3.2 Hz), at chest height, high or overhead by temperament. Each person's clap-height offset and time warp keep neighbours out of phase. At 0.6 or more, 15% raise one arm and 8% whistle.
- **Tiers:** the same, a beat later.
- **Cells:** bob.
- **Light:** the house rises 15%; one blinder hit only at a peak of 0.85 or more.

**Cheer**
- **Floor:** 40% both arms up, 20% one arm, 15% fist pumps, 25% clapping high. At 0.85 or more, pockets of 5-15% stand through sit_stand_up at their own times and clap standing.
- **Tiers:** arms up on L3, strips on L4.
- **Cells:** lift for the people standing.
- **Light:** one blinder hit at 0.7 or more, sized by strength, back to base within 2 s.
- **Camera:** W-B.

**Murmur and dead air** (measured restlessness and deadBits)
- **Floor:**
  - A chatty subset, sized by restless, rides the talk clips turned to their friend, so pairs face each other.
  - Life-event schedules run 1.5-2x faster and glances 3x more often.
  - Yawns only at deadBits of 2 or more.
  - Phones at the chest arrive with the pull list.
- **Light:** the house falls 15-25% over 3 s, floored.
- **Camera:** holds S1 or M, with moves at half speed.

**Boo:** the engine has no boo kind. In the arena nobody boos unless the sound.react hook (on the pull list) reports a boo that sound.js actually played.

**Heckle**
- **Floor:** heads within 25 m turn to room.hecklerPos over 0.4-0.8 s, each at their own delay; nearby bodies turn part of the way. 20% of puppets lean back, point or put a hand to their mouth.
- **Camera:** H, then M or M' (where the turned heads read sideways), then S1.

**Finale (measured strength f)**
- **0.15-0.4:** about 40% clap at chest height.
- **0.4-0.75:** applause, plus about 20% arms up.
- **0.75 or more, a standing ovation:**
  - It starts in pockets around the laughers and spreads. Each person rises through the captured sit_stand_up at their own delay (0.3-2.5 s, friends together), then claps standing, with whistles and arms up.
  - The tiers rise in 3D and the cells lift.
  - Blinders fire at onset when f is above 0.7; floods go to 40%.
- **Camera:** W-B push, M, S5, then the W-B pull-back.
- **After the set:** applause fades with the measured afterLevel. People sit back down through sit_down at their own times. Floods go to 100%.

**Beat**
- **Singing:** room.beat is the venue's constant 1.5 Hz, not a measured tempo, so arena2 never uses it. While singing, about 40% sway at their own 0.3-0.6 Hz with a random phase, sized by the measured cheer level. Claps come only on measured cheers.
- **The comedic beat** (the performer stops after a line): the per-person settle is on the pull list, waiting for its room.speaking hook. Until it lands nothing global happens, so the room never slows down in sync.

**Snap (poetry):** 35-70% snap at shoulder height, by strength. The listen_accept nods play once and are never looped.

**Silence (held attention):** each person leans in 4-6° at their own time. A per-person chance thins out glances and life events. Breathing continues; nothing slows globally.

**Listening idle**
- Captured seated idles run at each puppet's own phase.
- Each person rides a life event about every 14 s: touching the face or hair, scratching the head, looking around, rolling the head, shrugging, thinking, coughing.
- Glances every 6-20 s; posture resets every 8-20 s.
- The camera rotates between the wides.

**Preview (the bill)**
- The house is at 60%.
- Every seat except the 3% left empty is filled from the start, so nobody pops in.
- 35% are chatting to friends, some look around, and phones at the chest come with the pull list.
- Nothing reacts, because nothing is being measured.

## Frame budget

**Method** (critic 1's fix): each layer costs its vertices x effective cycles per vertex / k, plus its fragments x cycles per fragment / k.
- k = 237k Mali-G31 cycles per ms: the spike's model fitted to a7-base (range 227-247k).
- Effective cycles per vertex = position + 0.6 x varying, from malioc on the spike's shaders, adjusted by -13 cycles (the light texture and precomputed yaw, the spike's item 1) and by +6 to +10 cycles (the per-person layers).
- **Planning rates:** L0/L1 0.215 us, L2 0.17, L3/L4 0.165, cells 0.10.
- **Pessimistic rates** (the item-1 saving never comes): 0.27, 0.215, 0.21, 0.12.
- **Crowd fragments:** 2.5 cycles (4 pessimistic), at an overdraw of 1.3-1.5.
- Every number carries the model's +/-8 ms band: it missed nofront by 7 ms and nosprites by 3-6 ms. So no go decision rests on the model; round 10 measures the real slopes.

**Targets.** On a 60 Hz panel with the 30 fps cap, 30 fps means a p90 of 33 ms or less.
- **Wide-lit setups (S1, W-B, M):** p50 at most 27 ms, p90 at most 32 ms, and at least 90% of draws on 2 vsyncs.
- **Close-lit setups (S5, H):** p50 at most 36 ms, p90 at most 42 ms, with the camera locked off so mixed cadence doesn't show.
- fps is reported as 60 / mean(vsyncs per draw).

**Per setup, p50 ms (planning / pessimistic)**

| Setup | Crowd vertex cap | Crowd vertex | Crowd fragment | Cells | Shell | Glows | Post | Six | Misc | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | 78k | 14.2 / 17.9 | 3.2 / 5.5 | 2.3 / 3.2 | 2.0 / 2.8 | 0.8 / 1.2 | 0 (vignette per vertex) | 0 | 1.0 / 1.5 | **23.5 / 32.1** |
| W-B | 76k | 13.5 / 17.1 | 2.7 / 4.6 | 2.3 / 3.2 | 2.4 / 3.2 | 1.0 / 1.4 | 0 | 0 (twins) | 1.0 / 1.5 | **22.9 / 31.0** |
| M, M' | 72k | 13.9 / 17.5 | 4.0 / 6.8 | 0.6 / 0.9 | 1.4 / 2.0 | 0.5 / 0.8 | 0 | 0 | 1.0 / 1.5 | **21.4 / 29.5** |
| S5 group | 20k (background) | 4.3 / 5.4 | 1.5 / 2.1 | 0.5 / 0.8 | 1.5 / 2.0 | 0.5 / 0.8 | FXAA 10 / 12 | 12-15 / 16-19 (2 full bodies) | 1.0 / 1.5 | **31-34 / 41-44** |
| H | 15k | 3.2 / 4.0 | 1.0 / 1.5 | 0.4 / 0.6 | 1.2 / 1.6 | 0.4 / 0.6 | FXAA 10 / 12 | 8-10 / 11-13 | 1.0 / 1.5 | **25-27 / 33-35** |

- Today's arena runs 74 ms (12 fps).
- S5 at pessimistic rates misses its target. Its rung: FXAA off in S5 (-10 ms), or one full body.

**Draw calls:** about 28 in S1 (floor 22, cells 1, shell 2, glows 1, sky 1, misc 1), against 44 today. About 50 in S5, including the six's 21.

**CPU** (box at 8x, per frame, p50 / p90; the TV's page JS today is 16-30 ms, with 273 InstancedCrowd Persons and 44 draws)

| Item | ms |
|---|---|
| Puppets: 70 at 20 Hz, staggered, IK only while gesturing | 2.4 / 3.5 |
| Ring and person-state uploads, JS side | 0.3 / 0.6 |
| Arena2 frame logic and uniforms (shared materials) | 0.3 / 0.5 |
| Floor and cells render submission: about 24 draws, about 0.12 ms each (spike) | 3.0 / 5.5 |
| The six at people.js's 3 Hz unseen rate (wides) | 1.5 / 3.0 |
| InstancedCrowd | removed (about 3-5 today) |
| crowd.js and the rest: engine room, sound, director, room draws | about 6 / 9 |

- **Wide-lit total:** about 13.5 ms p50. The p90s don't add up linearly.
- **Cut frames:** +0.6 ms for the geometry swap and the light-texture rebake.
- **S5 and H:** about +4 ms for the six at full rate, still under the GPU frame.
- **Gates:** box at 8x, p90 at most 20 ms in the wides. TV cpu p90 at most 22 ms, which leaves room for the 5-11 ms rAF lateness.

**Memory**
- **GPU textures,** measured with the fixed ruler. Today reads 25.71 MB as counted, a ruler that undercounts float formats and skips render targets.
- **Changes:** -0.3 MB impostor canvas, -1.05 MB cell atlas downsampling, +0.67 MB ring, +0.06 MB state, light and noise textures, +2.88 MB FXAA colour and depth targets (already in every venue).
- **Total:** about 28 MB, under 30.
- **Other:** floor_lods.bin at 0.8 MB or less; about 2.5 MB of vertex buffers; about 2 MB of per-setup instance buffers across the three rungs. One WebGL context.

**Load**
- One .bin through the pack's XHR shim.
- Layout, assignment and per-setup allocation: about 150 ms at 8x, after the first frame.
- Programs compile asynchronously before the floor is shown.
- **Gates:** ttff at most 10 s on the TV, floor visible within 12 s.

**Decision rules after round 10** (the TV slopes)
- **L1 at 0.22 us per vertex or less:** default caps.
- **0.22-0.30:** caps x0.8 (S1 62k, W-B 61k, M 58k), and L1 at 130 vertices.
- **Above 0.30, or an f16 ring frame-time delta above 1.5 ms:** Rung B.
- **FXAA delta of 5 ms or less:** FXAA in every setup (H6 unused). Otherwise FXAA in close-lit setups only.
- **Timer query available:** per-pass GPU times replace the model.

**Rung B** (shippable Wed)
- Caps: S1 52k, W-B 50k, M 48k.
- No L0 outside S5; L1 at 120 vertices, L2 at 44.
- The end tier drawn as live cells; ring at 10 Hz; 32 + 6 + 8 puppets.
- It still shows about 1,200 3D floor people in S1.
- **Go/no-go:** if the TV measures S1 above 33 ms p50 on the default rung, Rung B ships.

## Constraint check

**No pre-recorded or pre-drawn frames for the visible crowd**
- Every visible person is 3D geometry from our own Rocketbox avatars, skinned every frame: the whole floor, the end tier, the six, and the lower tiers wherever a setup brings them within 30 m. In S1 that is about 2,360 3D people.
- Their poses are solved live every 50 ms from three sources:
  - the engine's measured moments, through people.js Person.response;
  - the approved Rocketbox MIT captures, sampled live at each puppet's own phase and rate;
  - key poses (poses, not frames) baked through the motion agent's rig.
- The ring is a 1.3 s delay line of those live poses, overwritten continuously. Nothing animated is loaded or replayed.
- The rejected floor and tier sprites are deleted.
- Baked avatar pictures survive only as the approved far-stand impostors: per-person cells on the upper ring and the far side tiers, 30 m or more away, with heads of 6 px or less. Each one moves per person from the live ring. lensguard asserts all of this.
- No photos, video or flipbooks anywhere.

**Honesty**
- Every reaction-related movement, light cue (house breathe, blinders, floods), cut and cast follows from measured inputs. Participation follows castShare.
- Each person starts on their own reaction time, so the room never runs ahead of the measured moment.
- Constant production, documented in docs/venues-3d.md: idle life events, glances, posture resets, the listening rotation, camera moves and the static pools.
- Chat, yawns and phones follow the measured restlessness and deadBits.
- room.beat is never used, in the preview too. Singing has no shared bounce, because no tempo is measured.
- The boo pocket and the comedic-beat settle stay off until their hooks exist.
- The arena changes the crowd's style, never the score.
- Box harness: 60 s of listening gives 0 blinders, 0 laugh slots, 0 raised arms and 0 people standing.
- The twins and puppets vote through the same castTally. The share stays a ratio, within +/-0.05 of &arena=1 on scripted laughs.

**Licensed and unbranded:** Rocketbox avatars and clips (MIT), meshoptimizer (MIT, build tool only) and procedural geometry. floor_lods.bin gets CREDITS lines. No text or logos anywhere.

**Stage look and the 2/5 rule:** the other venues are untouched. The arena keeps the approved grammar (dark house, warm spill on the front rows, rims and air behind) while it is lit like a comedy special. aliveprobe must read 0.45 or more on S1, W-B and M at the darkest cue. S1 is about 85% crowd.

**TV budget**
- Wide-lit setups: 21-24 ms p50 at planning rates, 29.5-32 pessimistic. Close-lit setups: 25-34 ms at planning rates.
- Gated on the TV: p90 at most 32 ms, at least 90% of draws on 2 vsyncs.
- Textures about 28 MB with the fixed ruler. One WebGL context. file:// loading through the pack. First frame within 10 s.

**Process**
- Heavy work runs only on BOX=build, through encore-box.sh. The emulator checks need the orchestrator's OK for BOX=android, since the constraints name only BOX=build.
- Agents never touch the TV: rounds 10 and 11 go to the user as one script each.
- No commits. No pkill -f.
- New files only:
  - arena2/*;
  - tools/render/{floorlods, lensguard, motionprobe, desync, echo, clonecheck, mouths, gpumem, lumaline, bonestretch}.mjs;
  - the tv-round scripts;
  - people/floor/floor_lods.bin;
  - plus a second esbuild entry in tools/pack.mjs, a file neither agent owns.
- people.js, anim.js and arena.js are only read.
- Hooks H1-H8 are about 25 lines in crowd.js only. The crowd agent or the orchestrator applies them, never this work.
- &arena=1 stays one switch away.

**How each critique is resolved**

**Critic 1**
- **The budget doesn't close:** re-costed per layer at the sizes that looked right, with seated chest-up levels, the light texture, a per-vertex vignette in the wides, and p90 targets. Go/no-go and Rung B are written out.
- **Impostors:** per-person cells, with motion in the vertex shader and a fragment shader of 12 cycles or fewer, on the upper ring and far sides only (about 10% coverage).
- **FXAA:** close-lit setups only, budgeted at 10-12 ms. Wides render straight to the canvas. Round 10 prices nofxaa on the G31.
- **Dynres:** off in the arena (H7). The allocator uses the live height; lensguard runs at 450, 405 and 360.
- **The bench:**
  - uncapped sweep over a GPU-bound base;
  - regression over N, a coverage split and NOFETCH;
  - ring modes as frame-time deltas, plus the timer query and link times;
  - the old a7 switches are dropped.
- **The six's cost:** hidden in every wide, twins in W-B, at most 2 full bodies in S5, priced from the per-layer model.
- **Cut uploads:** per-setup geometries prebuilt; a cut swaps them with 0 bytes uploaded. A cut-frame p95 gate.
- **CPU:**
  - render submission is included;
  - at most one tick per puppet per frame, and IK only while gesturing;
  - shared materials, with palettes in a data texture;
  - the TV gate is p90 at most 22 ms.
- **Cadence:** p90 and vsync-share gates; S5 and H locked off.
- **Minor:**
  - the f16 ring uses a FLOAT upload at frame start;
  - the memory ruler is fixed, precision is explicitly highp, and link times are logged;
  - a 5-minute soak;
  - the move extents are in the samples.

**Critic 2**
- **Static listening:** 16 life-event lanes on per-person schedules, glances and posture resets. Absolute gates with the camera frozen. The listening rotation and stop-start moves. Locked-camera clips at G0 and G1.
- **Clones:**
  - 48 reaction puppets plus the twins plus the lanes;
  - per-person time warp, arm offsets and 'ha' rhythm;
  - a mirrored pair counts as the same stream;
  - the gate is the lagged correlation of high-passed paths in the reaction windows, plus an echo probe.
- **Detail levels:** seated, cut chest-up; L1 skin-aware with a hair shell; tube arms with elbows, so no level is rigid; textured heads at every level. The contact sheet at panel scale goes to the user.
- **Faces:** MJaw on L0/L1, gated at 60% open mouths.
- **The ripple:** lognormal onsets and friend contagion; no distance term for laughs; an A/V gate.
- **Seating:** adopted.
- **Light levels:** raised, with a front fill, varied albedo, a back rim and a textured mass plane. The TV's picture mode is checked at G2.
- **Stands:** the end lower tier is 3D from the first build, with live cells elsewhere. Static impostors are never a cut-list item.
- **Singing:** no shared bounce.
- **The jib:** dropped.
- **The emulator:** checked on Day 1.
- **Identity:** all 12 types, with hair, skin and head variation.
- **The user loop:** G0, G1 and G2, with the work ordered by the user's complaints.
- **Minor:**
  - the beat settle and the floor heckler are on the pull list, with their hooks;
  - the turn to a friend is a summary value;
  - the pools are static and nothing flashes on laughs;
  - one decision source (no InstancedCrowd);
  - the delay is asserted against the ring;
  - counted numbers are used throughout.

**Critic 3**
- **Schedule:** the MVP is the committed scope and everything else is a pull list. MVP on the box Mon, TV and user Tue, default flip Wed, filming Thu.
- **User gates:** G0 Sat, G1 Sun, G2 Tue.
- **Listening numbers:** adopted as gates.
- **Re-budget:** done.
- **Desync window:** measured in the 2 s after each onset.
- **Low-detail arms:** tubes with elbows, L4 strips and a contact sheet, with lowarms0 as the fallback.
- **M-2:** gone, with InstancedCrowd.
- **Hooks:** one venue module with a static import; about 25 lines in crowd.js only; dated Sun 18:00 PT, with a minimal fallback set.
- **Decision layer:** the adapter and its trace test come first in step 2; puppetfull is time-boxed; smoke tests at each integration point.
- **Emulator:** checked Sat and Tue.
- **Preview:** specified, and the user is asked about the video segment.
- **Fallback:** Rung B, shippable Wed; &arena=1 only as a last resort.
- **Laugh delay:** fixed (see critic 2, the ripple).
- **Bench:** the spike is the bench. One combined round with round 9's leftovers, run by one script.
- **Minor:**
  - p90 gates tightened;
  - hooks checked on against a no-op stub;
  - identity variety;
  - key poses baked on the box;
  - programs compiled before the floor is shown;
  - room.beat ignored in the preview.

## Plan

1. **Step 0. Coordination** (Fri 10-16 evening PT; orchestrator; 1 h)
- **To the crowd agent:**
  - hooks H1-H8, in crowd.js only, about 25 lines (as listed in C9). Applied by them or by the orchestrator by Sun 10-18 18:00 PT.
  - optional: &ab=frontdepth (an occupancy-preserving price for the six);
  - optional: FXAA in mediump, with green-channel luma, a noise-texture grain and a depth invalidate.
- **To the motion agent:** nothing required. Just a note when their Rig, IK or anatomy changes land, so the key poses can be re-baked.
- **To the user:**
  1. Run `aws login`.
  2. Which build was on the TV (APK t?), and which venue looked worst?
  3. Is a seated, comedy-special floor right for the arena? (The G0 clip comes tomorrow.)
  4. Does the arena get its own segment in the demo video, or only the 2 s on the bill?
- **To the orchestrator:** approve BOX=android for the emulator checks.
- **Accept:**
  - the hook list is confirmed in writing;
  - with the hooks in and a no-op ARENA2 stub, a box setupsheet of &arena=1 differs by 0 px from hooks-off (same tree, same seed, &still&t=).
2. **Step 1. Measurement kit and TV round 10** (Sat 10-17 AM; 0.5 day; new files plus a second entry in tools/pack.mjs)
- **Bench:** the spike page becomes arena2/bench.html, packed for file:// through a second esbuild entry in tools/pack.mjs. It gets:
  - a seated-layout option;
  - L1-L4 prototypes;
  - NOFETCH;
  - ring modes: static, f32 at 30 Hz, and f16 with FLOAT upload at 20 Hz and at 10 Hz;
  - live cells at S1 coverage.
- **Sweep mode:** one URL runs about 22 configurations, 20 s each, at fps=0 with nodynres and hud=0, a fixed 800x450, and a base load that keeps every frame above 33 ms:
  - L1 at N = 1k, 2k and 3k near, and 2k far (coverage / 4);
  - L2 at 2k; L3 at 2k and 4k; L4 at 4k;
  - L1 NOFETCH at 2k;
  - the four ring modes at 2k;
  - cells;
  - the full S1 stack at caps 78k, 62k and 50k, with and without an FXAA pass.
  Each prints a `[crowd] bench` line with p50, p90, the vsync histogram, link times and whether a timer query is available.
- **APK v** = APK u plus the bench.
- **tools/render/tv-round10.sh**, one command for the user (about 15 minutes in all):
  - the sweep;
  - round 9's leftovers: r10-arena1-base, r10-arena1-nofxaa, r10-club-cycle and r10-club-nofxaa, 30 s each;
  - logcat grepped into one table.
- **Emulator** (BOX=android, if approved): the bench's S1 stack and the spike page at 720p; log the fps.
- **Accept:**
  - packcheck passes;
  - the sweep runs end to end from file:// on the box and prints every line;
  - tv-round10.sh parses a box log into the table;
  - the emulator fps is recorded.
- **TV:** the user runs round 10 after aws login. The budget's decision rules are applied Sun at noon.
- **Fallback:** if round 10 hasn't run by Sun noon, ship the x0.8 caps on box evidence and fold the bench into round 11.
3. **Step 2. Pose engine v2** (Sat PM to Sun AM; 1 day; arena2/puppets.js, posering.js, lanes.js; harness page arena2/harness.html)
- **First,** the Person.response adapter and its trace test:
  - casts, takes, gestures and delays per reaction id match a rig-less Person on the same room.events;
  - the twins match the six's Persons over a scripted cycle.
- **Then:**
  - 48 reaction puppets plus 6 twins;
  - the 21-bone sampler, with MJaw;
  - the seated clip set, with the laugh torso layered on the seated body;
  - key poses baked on the box through the motion agent's current Rig, IK and anatomy;
  - 16 event lanes and the per-person scheduler;
  - the ring: RGBA16F with FLOAT upload, 26 slots, one strip upload at frame start;
  - the person-state texture;
  - 20 Hz staggered ticks, IK only while gesturing, no allocations.
- **G0** (Sat 18:00 PT): a 30 s, 720p box clip of the spike floor re-laid as seated rows on the new puppets (the old detail levels are fine). It shows S1 with the camera locked, then moving, beside today's arena, and goes to the user with the seated-floor question.
- **Accept** (box at 8x):
  - anatomy.mjs reads 0 over 60 s of each reaction kind, on ring poses applied to a headless rig;
  - puppets cost at most 2.6 ms at p50 and 3.5 ms at p90 per frame;
  - upload p90 at most 0.6 ms;
  - allocprof reads 0 per frame;
  - both trace tests pass;
  - the orchestrator finds the puppet sheet natural: every puppet x (listen, laugh 0.5 and 0.9, applause, cheer, murmur, heckle, finale 0.3 and 0.9 with the ovation), beside a headless Person.update on the same seeds.
- **Fallbacks:**
  - if anatomy isn't 0, or G0 says the motion is wrong: a 0.25-day time-box of &ab=puppetfull (16 full headless seated Person.update rigs at 10 Hz feeding the ring, with the shader's fast layers on top), decided by Sun 12:00 PT;
  - if the user wants a standing floor: the standing layout (+0.5 day, caps lowered), decided Sat night.
4. **Step 3. Floor v2** (Sun 10-18; 1 day; arena2/floor.js, alloc.js, cells.js v0, light.js v0, floorlods.mjs, the probes)
- **floorlods.mjs** on the box writes floor_lods.bin (0.8 MB or less, with a CREDITS line):
  - L0-L4 as specified, with MJaw, vertex classes, thigh stubs and hair shells;
  - the key poses.
- **floor.js:**
  - the seated layout and the tiers;
  - assignment with primary and alternate puppets, and the neighbour rules;
  - shader v2: every per-person layer, explicit highp, the vignette per vertex;
  - shared materials, with palettes in a data texture.
- **light.js v0:** the key, the wash and 4 static pools.
- **alloc.js:** prebuilt per-setup geometries for S1, W-B, M, M' and the S5 samples, at three cap rungs.
- **Probes:** motion, desync, echo, clones, mouths, bone stretch, lensguard.
- **G1** (Sun 20:00 PT), sent to the user as the go/no-go before integration:
  - 30 s, 720p clips of the floor alone (listen, laugh 0.5, laugh 0.9, applause, cheer, the finale ovation), camera locked and moving, with the stands rendered;
  - a contact sheet at panel scale: every level x type, in arms up, clap shut, head back, doubled over and standing.
- **Accept** (box):
  - vertex counts within 10% of target;
  - the contact sheet shows no fins and no detached or collapsed limbs; bone stretch under 1.3;
  - listening, camera frozen:
    - 25% or more move 2 px or more in every 3 s window;
    - 3 or more life events per 100 people per 10 s;
    - L0/L1 heads at 1.5 px/s or more at p50 and 5 px/s or more at p90;
    - 15% or more of L0/L1 mid-action;
  - laugh 0.9:
    - the motion probe reads 3 or more at 0.4 s;
    - half the cast is rising by 0.5 s;
    - the envelope peak lands within 0.3 s of the sound mix's;
    - 60% or more of laughing L0/L1 people have open mouths;
  - desync: at least 95% of pairs below 0.5, for laughs, applause and cheers;
  - the echo probe finds 0 repeats;
  - clonecheck finds no identical (type, hair) pair within 2 m;
  - aliveprobe reads 0.45 or more on S1.
- **Round 10:** its decision rules were applied Sun noon.
- **Fallbacks:**
  - desync fails: 64 reaction puppets;
  - fins on L3/L4: &ab=lowarms0 (they clap and bounce, but arms never go above the shoulder).
5. **Step 4. Integration behind &arena=2** (Mon 10-19; 1 day; hooks landed Sun 18:00 PT)
- **arena2/venue.js (ARENA2):** the six seated in row 0; presets with no InstancedCrowd.
- **shell.js.**
- **director.js:**
  - the setups and their stop-start moves;
  - samples including the move extents;
  - the coverage policy and the listening rotation.
- **Twins,** wired to the six's visibility.
- **Cells v1.**
- **Light MVP:** house breathe, blinders, floods, rim, front fill, fog lift.
- **The Rung B switch.**
- **Accept** (box):
  - &arena=1 unchanged (0 px);
  - lensguard reads 0 for every setup and sample; sky at most 3%;
  - aliveprobe 0.45 or more on S1, W-B and M at the darkest cue;
  - the luma timeline:
    - +8-12% on a 0.8 laugh;
    - the blinder at +40-70% on a 0.9 cheer, back to base within 2 s;
    - -15 to -25% in murmur;
    - at most one large flash every 2 s;
  - the honesty harness: 0 blinders, 0 laugh slots, 0 raised arms and 0 people standing in 60 s of listening;
  - cut frames upload 0 bytes of instance data;
  - ttff at 8x no more than today's + 0.5 s; the floor shown within 2 s of the first frame;
  - gpumem at most 30 MB;
  - anatomy, bindcheck and handsweep at 0 with the six seated;
  - a laughcuts strip of 8 laughs uses 4 or more setups and never the same one twice in a row;
  - a 60 s state=cycle capture shows every reaction reaching its coverage;
  - cast share within +/-0.05 of &arena=1;
  - Rung B built and captured.
- **APK w:** built Mon end of day.
- **Fallbacks:**
  - hooks late: the orchestrator applies the minimal set H1+H2+H5+H7 by Mon 09:00 PT (S1 as the wide, the arena2 setups through pickSetup, the six hidden in house setups);
  - the seated six fail anatomy: the six stand at the barrier (a layout flag), with the floor seated behind.
6. **Step 5. TV round 11, the user's review, and fixes** (Tue 10-20; 1 day)
- **tools/render/tv-round11.sh,** one command (about 25 minutes):
  - a11-s1, a11-wb, a11-m, a11-front;
  - a11-cycle (60 s);
  - a11-soak (5 minutes of the cycle);
  - a11-rungB, a11-cap80, a11-nofxaa;
  - a11-v1 (&arena=1);
  - a 2x still crop of the far floor, to check for swimming.
- **Gates:**
  - S1, W-B and M: p50 at most 27 ms, p90 at most 32 ms, at least 90% of draws on 2 vsyncs;
  - S5: p50 at most 36 ms, p90 at most 42 ms;
  - the cycle: mean 24 fps or more, no frame over 100 ms, cut-frame p95 at most 67 ms;
  - the soak: the last 30 s within 10% of the first 30 s;
  - ttff at most 10 s, the floor visible within 12 s;
  - cpu p90 at most 22 ms;
  - gpumem at most 30 MB.
- **G2:** the user watches a 5-minute stand-up set on the TV in its default picture mode, with the before/after pack against today's arena (stills, 3 s strips and 30 s captures for each reaction), and gives a go or no-go.
- **Emulator:** &arena=2 in S1, W-B and the cycle, plus a capture of the bill preview, at 720p. 24 fps or more; otherwise the &ab=emu preset.
- **Fixes** go in through switches.
- **Pull list:** items start only after G2 approves, in C11's order. Each is priced on the box and must hold the gates.
- **Fallbacks:**
  - a gate fails: step down the cap rungs (x0.8, then Rung B);
  - the soak declines: dyncap (on a cut, step down one rung while fewer than 85% of draws land on 2 vsyncs).
7. **Step 6. Default flip and the filming build** (Wed 10-21)
- Make &arena=2 the default only after G2 approves and the round 11 gates pass.
- Update the arena sections of docs/venues-3d.md and docs/handoff/crowd3d.md. Include the honesty notes: idle life, the listening rotation, camera moves and the static pools are constant production; room.beat is unused.
- Build the emulator release APK from the final tree by Wed end of day. Arena changes then freeze for the video build.
- **Fallback:** if G2 is a no-go, ship Rung B if the user prefers it to &arena=1. Otherwise &arena=1 stays the default and the arena appears only on the bill.
8. **Step 7. Film and freeze** (Thu 10-22)
- Film on the emulator at 720p, following docs/demo-video.md.
- Fixes only.
- Final arena freeze Thu 12:00 PT.

## Risks

- **The TV's vertex rate.** The design rests on the floor's cost per vertex on the G31 in this WebView, with RGBA16F vertex fetches. The per-layer model carries a +/-8 ms band.
- **Proof first:** round 10's regression.
- **Fallback:** the x0.8 caps rung, then Rung B, which still shows about 1,200 3D floor people in S1. Both are precomputed switches.
- **Ring uploads.** A Mali driver may copy or stall on a texture that frames still in flight are reading, and a JS timer can't see that.
- **Proof:** round 10's frame-time deltas for the static, f32 and f16 rings, at 20 and 10 Hz.
- **Fallback:** the ring at 10 Hz. The fast motion ('ha', glances, the time warp, arm offsets) lives in the shader, so 10 Hz loses little. After that, two ping-pong rings.
- **Puppet motion.** The puppets' blending and IK re-implement what the motion agent is fixing in people.js, so they could bring back the 'handicapped, abnormal' look.
- **Mitigations:**
  - raw captures;
  - key poses baked through the motion agent's own rig and anatomy fixes, re-baked at each integration point;
  - an anatomy gate at 0;
  - a sheet against headless Person.update;
  - G0.
- **Fallback:** &ab=puppetfull, decided Sun 12:00 PT.
- **Clones and echo.** 48 reaction puppets drive about 5,400 people.
- **Mitigations:** per-person warp, arm offsets and 'ha' rhythm; the neighbour rules; alternate-puppet swaps; the lagged-correlation and echo gates.
- **Fallback:** 64 reaction puppets (+1 ms CPU, +0.25 MB), a warp of up to 0.2 s, and 50% alternate swaps.
- **The listening wide still reads static.** The spike's idles barely registered at 15-30 m.
- **Mitigations:** the life lanes, the absolute gates, the listening rotation, and G1 with a locked camera.
- **Fallback:** 24 lanes, a 10 s mean between events, bigger glances, and M more often in the rotation.
- **The user rejects the seated direction at G0.**
- **Fallback:** the standing layout on the same pose engine. L0/L1 keep their legs and the caps drop about 25%. Decided Sat night; costs +0.5 day.
- **The seated six.** They sit in arena chairs while the motion agent is reworking seated motion.
- **Mitigations:** the theatre's seat geometry and seatH; the anatomy, bindcheck and handsweep gates.
- **Fallback:** the six stand at the barrier, with the floor seated behind.
- **FXAA and the six in close-ups.** Neither has been measured on the G31. S5 comes to 31-34 ms at planning rates and 41-44 ms pessimistic.
- **Mitigations:** 2 full bodies, a locked camera, and round 10's nofxaa price.
- **Fallback:** S5 without FXAA (-10 ms) or with 1 full body; the crowd agent's optional FXAA optimisations.
- **Hooks.** About 25 lines in crowd.js, while the crowd agent is mid-task.
- **Mitigations:** steps 1-3 need no hooks (they run on harness pages); the list is frozen and dated Sun 18:00 PT.
- **Fallback:** the orchestrator applies the minimal set H1+H2+H5+H7 by Mon 09:00 PT.
- **CPU on the A55s.** Page JS above about 22 ms at p90 makes the frame CPU-bound.
- **Mitigations:** no InstancedCrowd; the six at 3 Hz in the wides; staggered 20 Hz puppets; shared materials.
- **Fallback:** lanes at 10 Hz and reaction puppets at 15 Hz.
- **The emulator,** which carries the video. llvmpipe has never run vertex-texture skinning.
- **Mitigation:** checks on Day 1 and Tue (they need BOX=android approval).
- **Fallback:** an &ab=emu preset (caps -30%, ring at 10 Hz) that looks the same in stills. Its use goes in the take's stats.txt.
- **Precision.** Skinning in fp16 would make the far floor swim. The box's SwiftShader computes in fp32, so it can't catch this.
- **Mitigations:**
  - explicit highp in every arena2 vertex shader, and in every fragment shader that reads the ring;
  - &ab=mediump never used with arena2;
  - a 2x crop on the TV in round 11.
- **Shader linking and first-cut hitches.** The new programs use 62-64 registers.
- **Mitigations:** link times logged in round 10; at most 8 new programs (L3/L4 merged); compiled before the floor is shown; geometries warmed at load.
- **Fallback:** show the floor at the first cut after the compiles finish.
- **Texture memory.** About 28 MB of the 30 MB limit, with the fixed ruler.
- **Fallback:** a 128 px cell atlas, and the ring at half height with 10 Hz.
- **Thermal throttling** over a 5-minute set.
- **Proof:** a11-soak.
- **Fallback:** dyncap, which steps down a cap rung at a cut while fewer than 85% of draws land on 2 vsyncs.
- **Seams in S5.** The six (lit per fragment) sit beside C2's L0 neighbours (lit per vertex).
- **Mitigations:** the same key read from the scene; matched rim and hemisphere constants; side-by-side crops in step 4.
- **Sound against picture.** The laugh mix starts at the reaction moment, but the floor's median onset is 0.25 s later.
- **Gate:** envelope peaks within 0.3 s.
- **Fallback:** ask the crowd agent to delay the arena mix by 0.1 s (sound.js, pull list).
- **The user's time and access.** Every TV number needs aws login and two scripts, and G0, G1 and G2 need the user's eyes.
- If round 10 slips past Sun noon, the x0.8 caps ship on box evidence.
- If G2 slips, the default doesn't flip: Rung B or &arena=1 stays.
- **Honesty edges.**
- Listening-rotation cuts could read as reactions, so they make no caption and never land within 3 s of a reaction's end.
- The boo and beat behaviours stay off without their hooks.
- Idle life is documented as constant production.