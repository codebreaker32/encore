# Encore live crowd: a ranked plan to make the room look real and alive (tv preset first)

This plan merges the five reviews (art direction, lighting and rendering, characters, motion, feasibility). I checked their claims against the code, the vendored three.js r160 build and the Rocketbox repository. Nothing has been measured on a TV yet, so every GPU cost below is an estimate until the Google TV A/B test at the end of each batch.

**Files** (short names used below):
- **The page:** `crowd.js`, `people.js`, `instances.js`, `venue.js`, `rooms.js`, `arena.js`, `traffic.js`, `index.html` in `/home/aman/projects/adh/strumble/prototypes/crowd3d/`.
- **The asset pipeline:** `build_people.mjs`, `textures.py`, `fetch_rocketbox.sh`, `avatars.json` in `/home/aman/projects/adh/strumble/prototypes/crowd3d/tools/`.
- **Render scripts:** `shots.mjs`, `batch-v3.sh`, `measure.sh`, `bindcheck.mjs`, `video.mjs`, `hosttest.mjs` in `/home/aman/projects/adh/strumble/prototypes/crowd3d/tools/render/`.
- **Host:** `/home/aman/projects/adh/strumble/packages/shared-ui/src/encore/world/CrowdStage.tsx`.
- **Docs:** `venues-3d.md`, `devpost.md`, `tv-test-log.md` in `/home/aman/projects/adh/strumble/docs/`.

**Why it reads as an engine demo, not a night out.** All five reviews agree, and the code confirms it:
1. **A bug lights about half of the instanced people from behind.** Mirroring a person flips their triangles, and the double-sided material then inverts their normals.
2. **The light comes from the lens.** The key sits about 14° from the lens and fades slowly (decay 1.5). The cool "rim" light cannot reach any surface the camera sees under Lambert shading. Every room is lit evenly to the back wall, and the red seats are brighter than the people in them.
3. **The lens makes a class photo.** The lenses are 19–22 mm full-frame equivalent, square-on, from the performer's eyes, and everyone stares into the lens.
4. **The same six people sit in front in every venue,** one of them twice, with hue-swapped "costumes" behind them.
5. **Laughs move only the front six.** In the club's laugh gestures, 88% of the instanced people make nothing visible at 540p. Everyone follows one envelope, and while the room listens, nobody moves.
6. **It looks like a game on a big screen.** The image is 960×540 with no anti-aliasing, upscaled 2×. The grain is a static CSS layer. The faces are matte Lambert with 8 face shapes and eyes fixed in the skull.

**Fix before the plan starts:** `docs/mockups/crowd3d-v3-tv-bill.png` (Devpost screenshot 3) shows four people in the arms-out bind pose; it came from the old web `low` preset. Retake it after Batch 1. Replace screenshots 2 and 4 (`v3-club-laugh-wide`, `v3-arena-laugh-wide`) once Batch 1 passes.

---

## 0. Ground rules and the device gate

- **Where to run things.** Renders, FBX conversion, builds and ffmpeg run only on the EC2 build box (a static server for `prototypes/crowd3d` on :8091, Playwright in `~/tools/pw`). The laptop is for editing and light checks.
- **Shared files.** Another agent is editing `prototypes/crowd3d`. Find code by function name, not line number, and merge with their changes.
- **Every new GPU cost gets an off switch** in `crowd.js`: `&ab=norim,nophong,nowrap,noa2c,nosplit,nograin,aces`, plus the existing `&noaa` and a new `&aa`. The Google TV A/B tests run on these.
- **Instrumentation is the first task:**
  - Keep the last 120 frame intervals. Add their p50, p90 and maximum, plus `aa: renderer.getContextAttributes().antialias`, to the HUD and to the `stats` message.
  - Never call `getParameter`, `getError` or `readPixels` every frame (Vega's WebGL guide).
  - Add the debug flags `&false=1` (false colour, item R2) and `&mirror=0` (R1).
- **Step 0: baseline on the slowest device.** Do this when the user frees the Google TV; connect adb only with their OK, as `tv-test-log.md` says.
  - Open `com.strumble.tv://crowdtest` with `?preset=tv&hud=1` for: club `state=cycle` for 60 s, theatre `state=listen`, and arena `state=laugh&shot=wide`.
  - Log the p50, p90 and maximum frame times, `dumpsys gfxinfo` and `dumpsys meminfo` in `tv-test-log.md`.
  - Repeat this at the end of every batch.
- **Planning assumption until there are device numbers** (from the feasibility review): the G31 is limited by pixel shading at 960×540, at roughly 1M shaded fragments per frame with today's draw order. Adding 10 ops to every lit fragment costs about 1–2 ms. Each extra draw call costs about 50–100 µs of main-thread time. That is why Batch 1 takes the free savings before anything adds cost.

**tv budget gates** (the HUD counts are exact even on SwiftShader):

| | Today | Ceiling during this plan |
|---|---|---|
| Draw calls | 32–36 | ≤ 55 (arena ≤ 50); Vega's guideline is < 500 |
| Triangles | 60–79k | ≤ 95k |
| Textures (HUD "tex") | 20–25 MB | ≤ 30 MB before KTX2, ≤ 12 MB after |
| Skinned faces | 6 | 6 |
| Frame time on the Google TV | unmeasured | p90 ≤ 34 ms with the 30 fps cap; no frame over 50 ms at a cut |

## 1. Where the reviews disagreed, and what to do

| Topic | Positions | Decision |
|---|---|---|
| Fix for the mirror bug | Art: patch `faceDirection` using a `vMirror` varying. Feasibility: pre-flip the normal in the vertex shader | Pre-flip it: one line and no varying. Both are identical while the material is double-sided, and it has to stay double-sided anyway. |
| The `rim` DirectionalLight | Art: reuse it as a warm fill. Lighting and feasibility: delete it | Delete it on every preset. Rim and fill become shader terms on people only, which also saves about 12 ops on every lit pixel. |
| Does the rim fade with depth? | Art: no. Lighting: multiply by the row-depth factor | Multiply by the square root of row depth. Back rows stay as rimmed silhouettes without becoming a wall of outlines. |
| Which side the key light comes from | Both reviews put it house-right | House-left. The reaction camera moves to house-right (the locked "House-Right Camera" design direction). With the key on the other side, the camera sees the shadowed side of the face, which gives it shape (short lighting) instead of flattening it. |
| tv tone mapping | ACES plus a grade (art); Khronos Neutral plus a grade (lighting); the Hejl curve with built-in gamma (feasibility) | Hejl plus a per-venue grade, with output colour space Linear. At today's exposure of 1.15, mid-grey lands at 0.54, the same as today. It is about 25–30 ops cheaper per fragment than ACES plus the sRGB curve. AgX is an optional look on the high preset only. |
| Seat colour | 0x3a0e12 (art); 0x5a1216 or 0x5a1418 (lighting, feasibility) | 0x4a1014, multiplied by the row-depth factor, in the theatre. The club loses its red seats entirely. |
| Wide-shot lens | 35 mm (`venues-3d.md`); 28, 32 and 24 mm (art) | 28/32/24 mm from 1.2–1.5 m further upstage gives the framing that 35 mm at the stage lip was meant to. Update the doc. |
| Head material on tv | Phong on every part plus 256² normal maps (lighting); Phong on heads only (art, characters); wrap lighting plus Blinn on heads, no normal maps (feasibility) | Phong with wrap lighting on heads only, and no normal maps at runtime: bake cavity shading into the face texture. Bodies stay Lambert with a soft wrap. |
| Catchlights | Painted into the iris (characters); computed from an eye mask (lighting, feasibility) | Computed. The eyes will now move, and a painted dot would move with the iris and glow in shadow. |
| How far the jaw opens in a tv laugh | Cap at 0.35 (art); up to 0.8 in bursts (motion) | Tie it to the smile: `min(0.3 + 0.5·smile, …)`, pulsing with each "ha". The "singing O" came from a jaw opening without eye squint or a raised upper lip, which R4 adds. |
| Jaw for instanced people | Add a jaw-open offset (characters); delete mouth interiors from crowd LODs (feasibility) | No instanced jaw on tv: it is under a pixel at 540p and costs a vertex attribute. Delete the mouth interiors. |
| How instanced poses are stored | A half-float pose texture (motion); half-float vertex attributes (feasibility) | The pose texture. It frees 5 of the 14 vertex attributes in use, which the new social poses and the palette need. |
| Which side of the body split is drawn | Lighting: draw only the body's front faces (FrontSide) | Keep it double-sided. Mirroring is done per instance in the shader and flips triangle winding, so FrontSide would turn mirrored people inside out. The saving that matters is removing the alpha test. |
| Theatre detail levels (LOD bands) | Rows 2–3 at "far" (characters); rows 2–4 (feasibility) | Rows 2–3 at "far" and 4+ at "xfar" on tv. Try 2–4 only if Batch 2 measures headroom. |
| Arena wave and beat | `venues-3d.md`: a wave on big reactions and a constant beat sway. Motion review: crowds do waves in lulls, and stand-up has no beat | Follow realism, the user's direction: sway on the beat only for singing and in preview, the wave only in preview, and no arms raised for laughs. Update `venues-3d.md`. |
| Arena light falloff distance | 22 m (art); 16 m (feasibility) | 18 m, as a uniform tuned on the render. |
| Hair alpha resolution | 512² single-channel (R8) for every front avatar (lighting); only for the two close-table seats (characters) | Only the two close-table seats (+0.7 MB). Everything else stays at 256², unquantized and dilated, with alpha-to-coverage. |

---

## 2. Ranked improvements

Ranked by visible gain for the cost, with free items first. "Batch" says when to do each one (section 3). The "today" counts come from the HUD.

### R1. Mirrored instances are lit from behind (bug) — Batch 1
- **Change.** In `instances.js` `VERT_HEAD`, inside `crowdPose()`, replace `n.x *= sign(aShape.x);` with:
  ```glsl
  // Mirroring flips the winding, so a mirrored person's outside is back-facing, and DoubleSide
  // negates its normal in normal_fragment_begin. Pre-flip y and z: after that negation the
  // normal is the mirror image of n (-x).
  n *= vec3(1.0, sign(aShape.x), sign(aShape.x));
  ```
  Bump `customProgramCacheKey` to `crowd-instances-v5-…`. Keep `side: THREE.DoubleSide` on every crowd material while mirroring lives in the vertex shader.
- **Prove it.** `&mirror=0` sets `variety().mirror = false`. Render club listen with `&mirror=0` and again with the fix. Neither may show blue-lit or black faces among warm ones. Today these appear in rows 2–5 of `v3-club-listen` and `v3-theatre-listen`, and as the black figures at the ends of `v3-openmic-laugh-wide`.
- **Gain:** high, in every room. **tv cost:** none. **Presets:** all.

### R2. Light the room from the stage, not from the lens — Batch 1
**a) The key light.** Each venue's `light.key` lives in `venue.js` (`CLUB`), `rooms.js` (`THEATRE`, `OPENMIC`) and `arena.js` (`ARENA`). In `crowd.js`, pass `K.penumbra ?? 0.75` to the SpotLight instead of the hard-coded 0.75.

| Venue | Position → target | Angle / penumbra / decay | Starting intensity |
|---|---|---|---|
| Club | (−2.4, 3.4, −0.6) → (0.8, 1.1, 5.0) | 1.1 / 1 / 2 | 170 |
| Theatre | (−2.8, 6.0, −1.0) → (0.5, 0.6, 6.0) | 1.0 / 1 / 2 | 550 |
| Open mic | The clip-on spot: (0.2, 2.5, −0.9) → (0, 0.6, 3.0) | 1.0 / 1 / 2 | 90 |
| Arena | (−6, 12, −4) → (2, 1.2, 10) | 0.9 / 1 / 2 | 1,750 |

- The starting intensities keep row 0 at today's brightness. The arena is the exception: it starts at about 40% of today, because today's arena clips to white.
- With decay 2, distance alone darkens the club by about 1.8 stops at row 3 and 2.7 stops at row 6.
- In the club the key light now sits outside the frame (about 49° off the new lens axis).

**b) Delete `rim`.** In `crowd.js`, remove the DirectionalLight, its target and the `rim.intensity` line in `frame()`. `&rim=` now scales the shader rim term.

**c) Rim and fill on people only.** Add these to `prepFront()` materials and to `crowdMaterial()`, so no scene light is added:
```js
// crowd.js: one set of uniform objects shared by every people material
const peopleLight = { uRimColor: { value: new THREE.Color() }, uRimDir: { value: new THREE.Vector3() },   // view space, towards the source
                      uFillColor: { value: new THREE.Color() }, uFillDir: { value: new THREE.Vector3() } };
const PEOPLE_PARS = 'uniform vec3 uRimColor; uniform vec3 uRimDir; uniform vec3 uFillColor; uniform vec3 uFillDir;';
const PEOPLE_LIGHT = /* glsl */ `
  float rimF = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.directDiffuse += uRimColor * ( rimF * rimF * rimF ) * saturate( dot( geometryNormal, uRimDir ) + 0.35 )
                                * ( 0.25 + diffuseColor.rgb ) * RIM_SCALE;
  reflectedLight.indirectDiffuse += uFillColor * ( 0.5 + 0.5 * dot( geometryNormal, uFillDir ) ) * BRDF_Lambert( diffuseColor.rgb );`;
// onBeforeCompile: Object.assign(sh.uniforms, peopleLight); after '#include <common>' add PEOPLE_PARS plus
//   '#define RIM_SCALE 1.0' (front) or '#define RIM_SCALE sqrt( vTint.w )' (crowd, after vTint is declared);
//   replace '#include <lights_fragment_end>' with itself + PEOPLE_LIGHT.
// frame(), after the camera has moved and camera.updateMatrixWorld():
//   peopleLight.uRimDir.value.copy(V.light.rimFrom).transformDirection(camera.matrixWorldInverse); the same for uFillDir.
```
I checked these against r160: `geometryNormal`, `geometryViewDir` and `BRDF_Lambert` are all in scope after `lights_fragment_end`.

| Venue | Rim comes from (world direction towards the source) | Rim colour | Fill |
|---|---|---|---|
| Club | The truss over row 2: (0, 0.64, 0.77) | Warm, 0xffb070 | Bounce from the stage floor (0, −0.3, −0.95), warm |
| Theatre | The balcony-front lamps: (0, 0.21, 0.98) | Cool white, 0xd8e0ff | Same, dimmer |
| Open mic | The bulbs on the beam: (0, 0.43, 0.9) | Warm, 0xffc080 | A top fill from the house lights |
| Arena | The far floodlight towers: (0, 0.55, 0.83) | Cool, 0xb8c8ff | Low |

Set the strengths by ratio:
- The rim's peak is about half a key-lit cheek.
- The fill on row-0 faces is about a quarter of the key.
- `room.house` raises the fill and tilts `uFillDir` towards straight up.

**d) Furniture follows the same falloff as the people.**
- Pass a `depthFor(s)` function into `V.build()` and on to `addSeats()`. It is `variety().depth` without its random factor. Multiply each seat colour by it.
- Halve `variety()`'s artificial darkening (slope 0.2 → 0.1 per row, floor 0.16 → 0.3), because decay 2 now does most of the work.
- Lower the walls' basic-material colour by about 30% (for example club 0xa89888 → 0x7a6e62). The back wall then sits below row-0 faces except in the sconce pools. The house lights still brighten it.

**e) Seat colours.** Theatre and theatre-lite seats go from 0x9a1c20 to 0x4a1014. The club's raked rows switch from theatre seats to `'chair'` in 0x1a1210 now; the full club re-seat is R11.

**f) Exposure per shot.** This is a uniform, so changing it needs no shader recompile:
```js
// cut(); e.g. CLUB.exposure = { wide: 1, close: 0.9, heckler: 0.9 }; EXPOSURE = num('exposure', 1.15)
renderer.toneMappingExposure = EXPOSURE * (V.exposure?.[name] ?? 1);
```

**g) House-light states in `frame()`.** Replace `hemi.intensity = V.light.hemi + 1.9 * room.house` with:
- The hemisphere light at a lower base (club 0.55 → 0.3), with a cool sky (0x2a3040) and a warm ground (0x1a0e08), plus `0.6 × house`.
- The people fill raised by `0.5 × house`.
- The key multiplied by 0.12 in preview (stage dark, "doors open"), 0.35 after the set, and 1 in the finale.
- A gain uniform on the glow points, so sconces and bar brighten by `1 + house`.
- After the set, a cooler hemisphere sky (0x6a7488), for "last call". In the finale, house lights at 0.4 with the key on.

**h) Props and lamps that fight the light.**
- Move the table glasses from the unlit `'basic'` collector to `'lambert'`. They are the floating grey squares in `v3-club-listen`.
- Make each truss lens disc at least as wide as its 0.1 m housing, and raise its core glow size from 0.3 to 0.45.
- Add a wide, dim glare point (size about 2.5, colour × 0.1) to every lamp facing the lens: the club truss and the theatre balcony lamps. This replaces the "eyeball" look.

**i) Exposure targets.** These are display values, checked with `&false=1`, which bands the output inside the tone-map function: below 0.03 shows blue; 0.16–0.20 green; 0.45–0.55 grey; 0.65–0.75 yellow; above 0.92 red.

| Where | Target (display value) |
|---|---|
| Row-0 lit cheeks, light skin | 0.65–0.75 |
| Row-0 lit cheeks, medium and dark skin | 0.45–0.55 |
| Row-3 faces | about 0.45–0.55 |
| Row 6 and back | at most 0.2, with rims brighter than the faces |

Seats, tables and walls must never be brighter than row-0 faces. The brightest pixels in frame must be the visible lamps, candles and the bar.

- **Gain:** the largest single step, visible in every frame. **tv cost:** no draws, triangles or memory; about −12 ops on every lit fragment (one light fewer) and about +30 on people fragments. **Presets:** all.

### R3. Lens, framing and a camera that moves — Batch 1 (the background mip blur in Batch 2)
**Separate the camera from what people look at.**
- `SHOTS.wide.pos` comes from a new `V.cam`, no longer from `PERFORMER`.
- Keep `PERFORMER` as the gaze target and for seat yaw.
- Rebuild `wideCam` (used by `visibleFromWide`) from `V.cam`. Extend the visibility test to the close and heckler cameras, or those shots will see empty seats.
- Arena: update the sprites' `uCam` to the new camera position.

**Set lenses by focal length.** Set `camera.fov` directly. `setFocalLength()` depends on the aspect ratio, which the view offset below changes.
```js
const fovFor = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(10.125 / mm)); // full-frame lens, 16:9 frame:
// 24 mm → 45.7°, 28 → 39.8°, 32 → 35.1°, 75 → 15.4°, 85 → 13.6°
```
- **Lenses:** 28 mm for the club and open mic, 32 mm for the theatre, 24 mm for the arena.
- **Positions:** 1.2–1.5 m upstage of `PERFORMER`, 0.2 m higher and 0.5 m house-right (+X).
- **Club example:** position (0.75, 2.25, −3.2), looking at (−0.35, 1.05, 7.5). I checked the art review's numbers: front-row eyes land 62% of the way down the frame, table tops at 79%, and the truss lamps about 23% down, below the caption and the LIVE mark.
- **Arena example:** (0.8, 5.0, −3.0) looking at (0, 3.0, 40). The barrier drops out of frame.

**Safe zones in every shot:**
- No face in the bottom 22% (lower-third, set stats, hints) or in the top 15% corners (caption, LIVE).
- No bright source within 10% of the frame from any text.
- The vanishing point is off-centre, and the front row is framed from the chest or knees up, not down to the shoes.

**The reaction shot.**
- Shoot it house-right at a three-quarter angle. Place the camera at the midpoint of the pair's eyes plus (1.4, 0.1, −2.1), aim at their eyes, and use a 75 mm lens. People keep looking at the performer, 25–30° off the lens.
- The heckler shot comes from the same side at 85 mm, aimed at the heckler's eyes.
- In close shots, dim the crowd colour behind the subjects from 0.55 to 0.25 in `cut()`; the rim term then draws them as silhouettes.
- After Batch 2 widens the atlas gutters, add a `uBgBias` mip-level bias to the crowd material's texture read: 0 in the wide, 1.5 in close shots. This blurs the background like a long lens.

**Scale the glow points with the lens.** Use `scale = 0.7 · RH / (2·tan(fov/2))` in place of `540*(RH/720)*(close ? 1.6 : 1)`. The 0.7 reproduces today's size at today's 50° lens, so lamps no longer shrink in the long lenses.

**Movement.**
- A 0.5 m push-in, eased in from the start of live, and a pull back for the finale (`venues-3d.md`).
- A drift driven by `noise()`: ±0.12° in yaw and pitch at 0.1–0.3 Hz plus ±5 mm, re-seeded on every cut. Double it in the open mic.
- On the close-up: ±0.25° of drift and a 2% zoom-in over the hold.
- r160 updates a camera's world matrix itself when it has no parent, so movement is free. Update the rim and fill view-space directions after the camera moves.

**The bill, where the menu covers the right side** (host mode, `mode === 'preview'`):
```js
camera.setViewOffset(1.3 * RW, RH, 0.3 * RW, 0, RW, RH); // also sets aspect to 1.3·16/9 (checked in r160); room centred at 35% of the width
// back to live: camera.clearViewOffset(); camera.aspect = RW / RH; camera.updateProjectionMatrix();
```
- **Gain:** high. **tv cost:** none. **Presets:** all.

### R4. Close-up faces that laugh, look around and catch the light — Batch 2
Every landed laugh cuts to this shot.

**More face shapes.**
- Add `EyeSquintLeft`, `EyeSquintRight`, `MouthUpperUpLeft` and `MouthUpperUpRight` to `TV_KEEP` in `build_people.mjs`, for 12 morph targets. `people.js` already drives these four, but today they do nothing on tv.
- On tv, lower `laughEyes` from 0.28·lb to 0.12·lb, so the squint closes the eyes instead of a blink.

**The jaw.**
```js
// people.js face block: the jaw opens only as far as the smile allows (no singing "O"), pulsing with each "ha"
face.set('jawOpen', Math.min(0.3 + 0.5 * sm, jaw * 1.6));
// where today's `if (b.jaw && !face?.ok)` line is (before rig.model.updateMatrixWorld): the bone adds the last few mm
rig.euler(b.jaw, face?.ok ? (0.05 + 0.09 * ha) * lb * (1 - vocal) : jaw * 0.32, 0, 0);
```

**Moving eyes.** Today nothing rotates the eye bones.
```js
// people.js Rig: aim an eye bone at a target in the seat frame. Call it after the head is posed, so the eyes
// counter-rotate against the head for free.
aimEye(eye, target, mY = 0.5, mP = 0.32) {
  const h = this.b.head, r = this.rest.get(h);
  const rel = worldQuat(this.seat, _q[0]).invert().multiply(worldQuat(h, _q[1])).multiply(_q[2].copy(r.P).multiply(r.local).invert());
  const d = this.seat.worldToLocal(worldPos(eye, _v[0])).negate().add(target).applyQuaternion(rel.invert()).normalize();
  this.euler(eye, THREE.MathUtils.clamp(-Math.asin(d.y), -mP, mP), THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -mY, mY), 0);
}
```
- Choose a new look target every 0.6–3 s among the performer's face, the mic and the hands. The eyes move first and the head follows over about 0.25 s. Any gaze shift over 33° comes with a blink.
- **Blinks:**
  - Close in 80 ms and open in 170 ms, replacing the symmetric 0.16 s sine.
  - 8–12 a minute while the performer speaks, 20 or more in dead air.
  - A 40% chance of a blink 0.25–0.5 s after a line ends. This needs `room.speaking` and `lineEndAt`, which `applyDrive()` throws away today.
- **Check** in `&view=avatar&name=…&zoom` that the eyeballs follow the bones. 146 head vertices are skinned to the two eye bones.

**Skin and eyes.**
- In `prepFront()`, give the `_head` material `MeshPhongMaterial({ map, specular: 0x1a1612, shininess: 22 })`.
- Add wrap lighting to the head and to the clothes, plus an eye mask for catchlights:
```js
const wrapped = (chunk) => THREE.ShaderChunk[chunk].replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  'reflectedLight.directDiffuse += saturate( ( dot( geometryNormal, directLight.direction ) + uWrap ) / ( 1.0 + uWrap ) ) * directLight.color * BRDF_Lambert( material.diffuseColor );');
// head (Phong):  '#include <lights_phong_pars_fragment>'  → wrapped('lights_phong_pars_fragment'),  uniform vec3 uWrap = (0.5, 0.24, 0.14)
// body (Lambert): '#include <lights_lambert_pars_fragment>' → wrapped('lights_lambert_pars_fragment'), uWrap = (0.2, 0.2, 0.2)
```
```glsl
// head fragment, after #include <lights_phong_fragment>. vEye comes from attribute aEye: the sum of each
// vertex's skin weights on Bip01_LEye and Bip01_REye, computed at load in prepFront.
material.specularColor     = mix( material.specularColor, vec3( 0.6 * uEyeSpec ), vEye );   // uEyeSpec: 0 in the wide, 1 in close-ups
material.specularShininess = mix( material.specularShininess, 60.0, vEye );                // at most 60 at 540p, or the glint goes sub-pixel
material.diffuseColor     *= 1.0 - 0.25 * vEye;                                            // the whites sit in the lids' shadow
```
- **Club only:** the candle on the close table lights the faces just above it, as a term on people only. It uses the flicker the candle code already computes (lighting review, item 9).

**Offline, in the pipeline:**
- In `textures.py person()`, multiply the head texture by a rough cavity mask taken from the normal map: remap the blue channel from 0.55–1 to 0.7–1 and mix it in at 30%.
- Darken the inside of the mouth: write `COLOR_0` = 0.45 on its UV island, and set `vertexColors: true` on the head material. Check that all Rocketbox heads share one layout.

**Low and high presets:** keep the Standard material with normal maps. Set roughness to 0.5 on heads and 0.85 on clothes (today 0.75 everywhere), add the same wrap in `lights_physical_pars_fragment`, and use roughness about 0.1 inside the eye mask.

- **Gain:** high. Compare `v3-club-laugh` with the low-preset `v2-e2e-laugh`. **tv cost:** no draws; one more shader program; about +60 ops on head pixels compared with Lambert (roughly 0.3–0.5 ms in a close-up); +0.17 MB of morph data per avatar (about 1 MB for six). Eye bones are CPU only. **Presets:** tv, with the variant above for low and high.

### R5. Life while listening, in dead air and in groups — the wide shot's screen time — Batch 1 (one-line fixes), Batch 3 (the rest)
**One-line fixes (Batch 1).**
- **Stop the bobbleheads.** "Restless" multiplies both the speed and the size of the same noise; in full dead air, front heads swing ±38°. Keep the sizes constant: in `people.js` change the gaze yaw noise from `*0.18*restless` to `*0.18`, and treat shift and sway the same way. In `instances.js` change the yaw noise from `*0.16*restless` to `*0.16`. Cap the speed factor at 1.6.
- **Smooth every switch.** Use `w += (target - w) * (1 - Math.exp(-dt / 0.3))` on:
  - the idle weights, so hands no longer jump to the phone or chin;
  - instanced yaw, pitch and lean, so heads no longer turn 0.72 rad in the frame where murmur crosses 0.5.
- **Release the stuck glances.** The 7% of instanced heads turned 52° for the whole show (`t.glance > 0.93`) should come and go, gated by noise, for 5–20 s at a time.

**Discrete fidgets (Batch 3), stateless like `this.blinks`.**
```js
for (let t = r() * 3; t < 900; t += -Math.log(1 - r()) / 0.2) this.fidgets.push({ t, u: r(), k: r() });
// an event fires if u < λ/0.2, decided when it starts. λ = 0.012 + 0.1·restless + 0.03·min(deadBits, 3), +0.02 in a pause.
// Face touches alone happen about 23 times an hour (Kwok 2015).
```
- **Activities.** Each is a hand-made 0.6–6 s curve: shift weight, re-cross legs, touch face or hair, sip, look around the room, check phone, whisper to a partner (who tilts in), cough, stretch the neck.
- **Mix by state.**
  - Listening favours touches and shifts.
  - Dead air favours the phone, whispers, looking around and coughs.
  - Preview and after favour talk, phones, sips, stretches and coats.
- **Follow the performer.** `applyDrive()` stores `speaking` and `lineEndAt`. Nods and blinks land at line ends; sips, touches and glances fall in pauses.

**Groups.**
- **Parties at layout time.** Sizes 1, 2, 3 or 4 at 15/45/20/20%, and a club table is one party.
  - Partners face each other to talk, whisper or glance.
  - 30% of couples lean together, and singles never "talk".
  - Party members share 50% of their temperament and laugh threshold. The second member reacts 0.1–0.25 s after the first.
- **The heckle.** Each person glances over and back:
  - The glance starts 0.15 s plus 0.06 s per metre of distance and lasts 0.8–1.6 s, then they turn back to the stage for the comeback.
  - The heckler's party looks embarrassed or laughs, and about 20% of the room goes "ooh".
- **A hush at go-live.** People finish talking and put phones away over a seeded 0.3–4 s. Today everything stops in one frame.

**Phones in dead air.**
- Instances use the phone pose from R8, plus one additive Points draw for the screens (≤ 150 points).
- Front people get a cool emissive glow on the head material while on the phone.

**Garbage collection.** Move the per-call closures and arrays out of `Person.response()`, which allocates per instance, per event, per frame.

- **Gain:** high, because the wide shot is on screen most of the set. **tv cost:** CPU (about +30% on the behaviour step) and +1 draw. **Presets:** all.

### R6. Casting and clone rules (runtime) — Batch 1
- **Shuffle per venue.** In `buildRoom()`, shuffle `order` with `rng(SEED ^ hashStr(VENUE_ID))`, where `hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0`. Keep the other uses of `R`.
- **No twins in front.** `PRESETS.tv.frontDistinct` 5 → 6. Low already uses 8. High gets 12 meshes plus 4 re-toned variants after R14.
- **A mixed front row.** At least two women and two men in the front six.
- **Keep the front out of the rows behind.**
  - The sil band draws only the avatars that are not in front: 6 today, 10 after the recast.
  - Far and xfar may use all 12 until the recast; with R7's palette, clones at that size are invisible. After the recast, use the 10 non-front avatars everywhere.
  - Types per band on tv: sil 6, far 8.
- **Replace the repeating stride.** `types[(i*3 + s.row) % types.length]` repeats every five seats in a diagonal lattice. Use a constrained greedy assignment instead:
```js
const aR = rng(SEED + 31), near = [];
const typeFor = (s, types) => {
  let best = types[0], bc = Infinity;
  for (const t of types) {
    const c = near.reduce((a, q) => a + (q.t === t ? 1 / (0.15 + Math.hypot(q.x - s.x, q.z - s.z)) : 0), 0) + aR() * 0.01;
    if (c < bc) { bc = c; best = t; }
  }
  near.push({ t: best, x: s.x, z: s.z });
  return best;
};
```
  Rules on top:
  - Never the same type within two seats in a row, or directly in front or behind.
  - Never a mirrored twin next to its original.
  - Never mirror the front people.
- **Bar standers** come from the venue's pool instead of the hard-coded list.
- **Gain:** high. Switching venue on the bill finally changes the faces. **tv cost:** one more distinct front avatar (about +2.5 MB of GPU memory, +0.35 MB download) and +3 draws. **Presets:** all.

### R7. Clothes, skin and hair from a palette, not a hue wheel — Batch 2
Today 60% of instances are hue-rotated by up to ±1.3 rad. The "cloth" mask covers the whole body tile, so forearms, necks and legs take the clothing hue (the yellow forearms, green suits and magenta hoodies).

**An RGB mask in the alpha atlas** (`textures.py atlas()`). The atlas's alpha PNG becomes RGB:
- **R = skin:** a YCbCr test (Cb 77–127, Cr 133–173), blurred 1.5 px.
- **G = hair alpha:** three.js reads `.g`, so this stays as it is.
- **B = garment code:** 0 keep, 0.5 bottoms, 1 tops. In the head tile, B marks painted hair, brows and beard.

The garment regions come from UV triangles that `build_people.mjs` labels by bone weight and writes to a JSON file:
- Spine, clavicle and arm bones: tops.
- Pelvis, thigh and calf: bottoms.
- Feet: keep.

`textures.py` fills those triangles with `ImageDraw.polygon`. GPU memory does not change, because three.js already uploads the PNG as RGBA8.

**Per-person palette indices.**
- Pack them into `aVar`: x = top + 16·bottom; y = ±(skin + 8·hair + 1), keeping today's sign trick for folded arms.
- Resolve them in the vertex shader from uniform arrays `uTop[16]`, `uBot[8]`, `uSkin[5]`, `uHair[6]` into the varyings `vTop`, `vBot`, `vSkin`, `vHair` and `vShade`.
- Write each avatar type's mean texel brightness (`uInvMean`) to `people.json`.

**The fragment shader** replaces `FRAG_TINT`. Replace `<alphamap_fragment>` too, so the mask is fetched once:
```glsl
vec4 mk = texture2D( alphaMap, vAlphaMapUv ); diffuseColor.a *= mk.g;
vec2 q = step( 0.5, fract( vMapUv * 4.0 ) );                       // x: head half of the tile, y: hair row
float bodyQ = ( 1.0 - q.x ) * ( 1.0 - q.y ), headQ = q.x * ( 1.0 - q.y );
float top = bodyQ * smoothstep( 0.7, 0.9, mk.b ) * ( 1.0 - mk.r );
float bot = bodyQ * clamp( 1.0 - abs( mk.b - 0.5 ) * 4.0, 0.0, 1.0 ) * ( 1.0 - mk.r );
float hair = max( q.y, headQ * mk.b );
vec3 c = diffuseColor.rgb; float L = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
c = mix( c, vTop * min( L * uInvMean.x, 2.5 ), top );             // the palette colour, keeping the texel's own folds
c = mix( c, vBot * min( L * uInvMean.y, 2.5 ), bot );
c = mix( c, c * vSkin, mk.r );                                     // skin: a ratio towards this person's tone
c = mix( c, vHair * min( L * uInvMean.z, 3.0 ), hair );
diffuseColor.rgb = c * vShade;                                     // vShade = baked occlusion × row depth
```

**Palettes (relative weights):**

| Slot | Colours and weights |
|---|---|
| Tops | black 15, white 12, navy 11, charcoal 8, light-blue shirt 7, grey marl 6, cream kurta 6, olive 5, maroon 5, mustard 4, teal 4, rust 4, indigo print 4, rani pink 3, emerald 3, saffron 3 |
| Bottoms | denim #2B3A55 35, black 20, dark denim 15, khaki #A89A7C 10, grey 8, white pajama #DDD8CC 5, olive 4, brown 3 |
| Hair | #0F0D0C 55, #1C1714 20, #2E2119 12, henna #4A2218 5; grey only on older types |
| Skin | ±1 step around each type's base tone |

- **Gain:** high: no more costume swaps, yellow forearms or green suits. **tv cost:** no draws or memory; about 12 ALU, roughly what the YIQ hue rotation it replaces costs. **Presets:** all.

### R8. Reactions that read in the wide — Batch 3
They show in the tail of a laugh after the cut back, behind the close-up pair, and in the applause and the finale.

**One threshold per person, on the measured level.** The share of the room that laughs then follows the measurement (Granovetter's threshold model).
```js
this.theta = r() < 0.06 ? 0.97 : 0.05 + 0.9 * r();   // about 6% "stone faces"; buildRoom pulls party members 50% towards a shared value
this.rt = 0.12 + 0.23 * r();                          // reaction time, s
// response(ev): onset = the first age where ev.levelAt(age) >= theta (cache it per person and reaction id), plus this.rt.
// Laughing while ev.levelAt(age) >= 0.7 * theta. Applause and cheers use 0.6 * theta, so more people join.
// Inside that window: body = laughShape(age - onset).
```
Demo events have no `levelAt`; build one from the same trapezoid `soundTick()` uses.

**A per-person laugh shape.**
- **Breath in** (150–200 ms): clavicles up 0.06, head back 0.05, jaw 0.1, inner brows up 0.2.
- **Burst:** the first 0.6–1 s is the strongest.
- **Bouts** of 4–5 "ha"s, about 0.11 s each with 0.12 s gaps, and gasps of 0.2–0.35 s between bouts. Each bout is about 70% of the last and 10–15% slower.
- **Aftershock:** for strengths above 0.6, one more bout at 50%, while the drive's tail is still running.
- **Settle:** breathe out, two head shakes, and a wipe of the eyes above 0.7. Then re-draw slouch, lean and hands from (seed, reaction id), so nobody returns to the exact same pose.

**Social poses on the instanced people (the pose texture).**
```js
// bakeType(): every pose delta in one RGBA16F texture per type and level; row block k = pose k.
// This frees 5 of the 14 vertex attributes.
const W = 1024, rowsPer = Math.ceil(n / W), data = new Uint16Array(W * rowsPer * POSES.length * 4);
POSES.forEach((pose, k) => { for (let i = 0; i < n; i++) { const o = ((k * rowsPer + Math.floor(i / W)) * W + (i % W)) * 4;
  for (let c = 0; c < 3; c++) data[o + c] = THREE.DataUtils.toHalfFloat(pose[i * 3 + c] - rest[i * 3 + c]); } });
const tex = new THREE.DataTexture(data, W, rowsPer * POSES.length, THREE.RGBAFormat, THREE.HalfFloatType);
tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
```
```glsl
uniform highp sampler2D uPoses; uniform int uRowsPer;
vec3 poseD( int k ) { return texelFetch( uPoses, ivec2( gl_VertexID % 1024, gl_VertexID / 1024 + k * uRowsPer ), 0 ).xyz; }
// p += poseD(4)*stand + mix(poseD(1), poseD(0), clapOsc)*clap + poseD(2)*cheer + poseD(3)*fold;
// if (aSoc.z > 0.001) p += poseD(5)*aSoc.z;   if (aSoc.w > 0.001) p += poseD(6)*aSoc.w;
```
- **Poses:**
  - 0 and 1: clap open, and clap closed with the palms touching.
  - 2: cheer. 3: folded arms. 4: stand.
  - 5: hand to the mouth (it doubles as cough, sip and chin rest; mirrored people use the other hand).
  - 6: phone in both hands, baked with the head pitch zeroed.
  - 7: forward fold.
  - 8 and 9: standing clap, open and closed.
- **Keep the old attributes as the WebGL 1 fallback.**
- **`Person.summary()` also returns** `face` (mouth, wipe, chest), `side` (turn and neighbour, towards the partner) and `fold` (over, knee, slap).
- **Add a per-instance vec4 `aSoc`:** side lean of 0.12–0.18 rad towards the partner, head roll ±0.15, hand-to-face weight, and phone weight. These amplitudes survive at 540p. The forward fold is 0.45 rad with the head down 0.35.
- **The side sway (`crZ`) stops being gated by `uBeat`.**

**Smaller rules.**
- **Never half-rate a laugher.** `crowd.js` may skip a front person's update only while their laugh and clap weights are both at most 0.05.
- **The director picks the pair that reacted.** Precompute one close shot per front pair (2–3 per venue). Cut to the pair with the lowest mean threshold among those laughing, never the same pair twice running, and move `p.focus` with it.

**Claps.** Today the palms never meet: they stay at least 12 cm apart with the fingers crossing, at slow, synchronised rates.
```js
// people.js clap block: the palms meet, contact is sharp, the dominant hand travels
const g = Math.pow(Math.abs(Math.sin(Math.PI * (C.a ?? now) * C.rate + C.phase)), 0.6);
const tR = V(chest.x - 0.024 - 0.06 * g, cy - 0.01, cz + 0.02), tL = V(chest.x + 0.024 + 0.025 * g, cy + 0.01, cz);
```
```glsl
float clapOsc = pow( abs( sin( uTime * rate * 3.14159 + ph ) ), 0.6 );   // re-bake the closed pose with the palms touching
```
- Aim the fingers roughly parallel and forward, and flatten them while clapping.
- Rate 2.6–4.5 Hz, slowing as the level falls.
- People start and stop by their own thresholds, with one to three slower last claps before the hands drop.

**Finale.**
- Each person gets their own timing and pose.
- At strength 0.75 or more, a standing ovation runs as a threshold cascade: the front and eager people stand first, then the neighbours of anyone standing (Miller & Page).
- Optional, for long finales: rhythmic synchronised clapping at about 2 claps per second (Néda).

**Warmth unfolds arms.**
- Pass a `uWarmth` uniform, smoothed on the CPU over about 3 s.
- In the shader: `fold *= 1.0 - smoothstep(thr - 0.08, thr + 0.08, uWarmth)`, with `thr = 0.25 + 0.6 * fract(aPose.z * 0.173)`.
- Arms then open one by one as laughs land and refold after dead bits ("arms folded until they're won over"). Do the same for the front people.

- **Gain:** high. **tv cost:** no draws or triangles; the pose texture is about +0.6 MB, offset by dropping five vertex buffers; 1–3 texel fetches and about 15 ALU per instanced vertex; CPU as in R5. **Presets:** all.

### R9. Anti-aliasing that survives the 2× upscale — Batch 2
**MSAA on tv, decided by GPU.**
```js
// crowd.js, before creating the renderer: MSAA where the A/B allowed it (one throwaway context reads the GPU name)
const gpuName = (() => { try { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info');
  const s = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; gl.getExtension('WEBGL_lose_context')?.loseContext(); return s; } catch { return ''; } })();
const AA = Q.has('noaa') ? false : Q.has('aa') ? true : P.aa === 'auto' ? !NO_MSAA.test(gpuName) : P.aa;   // NO_MSAA comes from the Google TV result
```
- Use the default framebuffer only. Chromium resolves its MSAA inside tile memory (`EXT_multisampled_render_to_texture`).
- Never use `WebGLRenderTarget({ samples })` on tv: that needs an explicit resolve and costs memory bandwidth.
- Chromium uses up to 4 samples; 2× cannot be requested.
- The Fire TV Stick Lite's PowerVR GE8300 is a known risk for 4× MSAA.

**Alpha-to-coverage** with MSAA on, for front hair and lashes (`_opacity`), the crowd's hair-card material (R13) and the arena sprites.
```js
// r160 gotcha: an opaque Lambert with NormalBlending defines OPAQUE and forces alpha to 1, hence NoBlending
Object.assign(mat, { alphaToCoverage: true, alphaTest: 0, blending: THREE.NoBlending });
// onBeforeCompile replaces '#include <alphatest_fragment>' with the lines below
// (UV = vMapUv for front hair, vAlphaMapUv for crowd cards; SIZE = the texture width)
```
```glsl
vec2 tc = UV * SIZE; vec2 dx = dFdx( tc ), dy = dFdy( tc );
diffuseColor.a *= 1.0 + max( 0.0, 0.5 * log2( max( dot( dx, dx ), dot( dy, dy ) ) ) ) * 0.25;            // keeps coverage in lower mips
diffuseColor.a = clamp( ( diffuseColor.a - 0.5 ) / max( fwidth( diffuseColor.a ), 1e-4 ) + 0.5, 0.0, 1.0 );  // sharpen to about 1 px
if ( diffuseColor.a <= 0.0 ) discard;
// Without MSAA: alphaToCoverage false, keep the mip line, then `if ( diffuseColor.a < 0.4 ) discard;`
```
- In arena `SPRITE_FS`, write `gl_FragColor = vec4(col, 1.0 - smoothstep(-aa, aa, d))` and set `alphaToCoverage: true`. A ShaderMaterial needs nothing more. Drop the 0.5 discard when MSAA is on.

**Texture fixes in `textures.py`.**
- **Dilate colour by about 8 px into fully transparent texels,** in the opacity PNGs and the atlas's hair quadrant. This removes the dark seams across the afro.
- **Stop quantizing alpha to a 256-colour palette.**
- **512² alpha for the close table only.** Give the two close-table seats a 512² alpha map with `format: THREE.RedFormat`, and patch the alpha-map chunk to read `.r`.

- **Gain:** high, most of all in motion. **tv cost:** no draws; MSAA adds roughly 5–25% to pixel work along edges, which has to be measured; alpha-to-coverage costs about the same as a discard. **Presets:** tv set to auto; low and high already have MSAA.

### R10. The film look inside the WebGL frame — Batch 1
**Tone mapping and grade.** Patch this before any material compiles; the page reloads on every venue change, so the grade can be compile-time constants.
```js
const G = { wb: [1, 1, 1], sat: 0.92, lift: [0, 0, 0], ...(V.grade || {}) };
const v3 = (a) => `vec3( ${a.map((x) => x.toFixed(4)).join(', ')} )`;
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
     color *= toneMappingExposure * ${v3(G.wb)};
     float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
     color = max( mix( vec3( l ), color, ${G.sat.toFixed(3)} ), 0.0 );
     vec3 x = max( vec3( 0.0 ), color - 0.004 );
     vec3 c = ( x * ( 6.2 * x + 0.5 ) ) / ( x * ( 6.2 * x + 1.7 ) + 0.06 );   // Hejl–Burgess-Dawson; the output is display-encoded
     return c + ${v3(G.lift)} * ( 1.0 - c );
   }`);
renderer.toneMapping = THREE.CustomToneMapping;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the curve already writes display values
```
- **Per-venue grade:**

| Venue | White balance | Saturation | Shadow lift |
|---|---|---|---|
| Club | (1.03, 1, 0.95) | 1.0 | (0.002, 0.003, 0.006), slightly cool |
| Theatre | (1, 1, 1.02) | 0.85 | none |
| Open mic | (1.02, 1, 0.92) | 0.9 | (0.002, 0.005, 0.004), slight green-cyan |
| Arena | (0.97, 1, 1.04) | 0.9 | (0.001, 0.002, 0.006) |

- **The Linear-output gotcha.** I checked r160's code for this. The fog and clear colours are uploaded unconverted in the output colour space, so set them as display values:
  ```js
  const display = (h) => new THREE.Color().setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, THREE.LinearSRGBColorSpace);
  ```
  Any future material with `toneMapped: false` loses its sRGB encoding. The glow points, beams and phone lights are raw shaders and do not change.
- **`&false=1`** adds the false-colour bands from R2 inside this function.

**Fog and haze.**
- **Near-black fog,** set as display values: club 0x0b0706, open mic 0x120d08, theatre 0x07080b, arena 0x06070d.
- **Haze only where light crosses it.**
  - Beam strength 0.22 → 0.4, with slow noise along `vA`.
  - Move the club's four back-wall haze glows to sit just behind the last row's heads (y ≈ lastY + 1.2–1.6), so the heads stand out as silhouettes against them.
  - Do the same in the theatre, under the balcony lamps.

**Grain, vignette and lower-third band in one full-screen triangle.** This replaces the static CSS grain; its `mix-blend-mode: overlay` makes Chromium composite an extra full-screen surface every frame.
```js
const post = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)),
  new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      void main() {
        float vig = 1.0 - 0.66 * clamp( ( length( ( vUv - vec2( 0.5, 0.54 ) ) / vec2( 0.78, 0.72 ) ) - 0.58 ) / 0.42, 0.0, 1.0 ); // was .vig
        float low = 1.0 - 0.6 * clamp( ( 0.28 - vUv.y ) / 0.28, 0.0, 1.0 );                                                   // was .lowband
        float g = ( hash( gl_FragCoord.xy + fract( uTime ) * 91.0 ) - 0.5 ) * 0.05;                                            // new every frame
        gl_FragColor = vec4( vec3( 0.5 * vig * low + g ), 1.0 ); }`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor }));   // out = 2·src·dst
post.frustumCulled = false; post.renderOrder = 1000; scene.add(post);
```
- Delete `.grainov`, `.vig` and `.lowband` from `index.html`. The TV app's lower-third gets its dark band back.
- Set `dithering: true` on floor and wall materials; 8-bit TV panels band in dark gradients.

- **Gain:** medium-high. **tv cost:** the tone map is about 25–30 ops cheaper per fragment; the final pass is +1 draw and about 15 ops per pixel (roughly 0.5–1 ms), minus one compositor pass. **Presets:** all (Hejl everywhere; AgX optional on high).

### R11. Four rooms that read as four places — Batch 1 (quick fixes), Batch 4 (full)
**Club** (`layoutSeats`, `buildVenue`), to match `venues-3d.md`:
- Three rows of two- and four-top tables (two exist).
- Then three rows of bar stools at drink rails on the risers, with feet on a foot rail. Reuse the 0.45 m seated bake, raised 0.3 m.
- A banquette along the house-left wall.
- Seats black or dark wood (0x1a1210), banquette oxblood (0x3a1012).
- **Red only in the light:** the baked brick uplights plus one unlettered red neon line (an emissive strip and three glow points).
- A candle on every table, in the same Points draw.
- **Varied table props merged into `room`:** 0–4 glasses, a bottle, a face-down phone, a coat on a chair.
- **Quick fix in Batch 1:** dark chairs in the raked rows.

**Theatre** (`buildTheatre`):
- Velvet seats 0x4a1014 × depth, with darker tops.
- Every seat in the lit area filled: move the `empty` seats to where depth is below 0.4.
- The balcony-front lamps are the main visible lights, with glare and beams at 0.4.
- Aisle step lights slightly bigger, as leading lines into the room.
- House black.

**Open mic** (`buildOpenMic`):
- House lights half up, because pubs don't black out: hemisphere sky 0xffc890, ground 0x2a1a10, at about 0.35, plus a people fill of 0.3.
- Mixed colour temperatures: tungsten bulbs, the green exit sign, and a cool spill from the door or bar fridge as a cool glow point plus a fill tint.
- Low pub tables with pints in front of row 0.
- Chair yaw jitter 0.12 → 0.35, and double camera drift.
- **Quick fix in Batch 1:** the house-light change and the yaw jitter.

- **Gain:** high; the club stops reading as the theatre. **tv cost:** +3–8k triangles in the merged meshes (drop furniture no camera sees); no draws; no memory. **Presets:** all.

### R12. The arena as a crowd, not a seat map — Batch 1 (look), Batch 3 (behaviour), Batch 4 (layout and cost)
**Look (`SPRITE_VS` and `SPRITE_FS`).**
- **Clothing:** a weighted palette at about half the instanced tops' lightness: 35% black, 15% navy, 12% charcoal, 10% white or cream, 10% denim, 15% muted maroon, olive or mustard, 3% saturated.
- **Skin and hair:**
  - Skin from five tones in the measured proportions, as `const vec3 SKIN[5]`.
  - Hair 85% near-black, 8% dark brown, 5% grey, 2% henna, and no blonde. About 45% long hair.
  - Skin only where `abs(hp.x) < 0.78 - 0.2*max(hp.y, 0.0)`, so hair frames the face.
- **Light:**
  - Distance falloff: multiply `lit` by `1.0/(1.0 + pow(dist/uFall, 2.0))`, with `uFall` = 18 m.
  - Faces only where stage light reaches: `mix(hair*0.5, skin, vNear)` in the face oval, so distant heads become backlit silhouettes.
  - Beams light an edge band instead of multiplying clothing: `col*1.6 + beam*0.12` in place of `col*3`.

**Clashes with the UI (Batch 1).**
- Barrier tube and posts 0x2a2a2e and 0x111114, panel 0x16161a.
- Big screen moved to mid-left at 35–45% of the frame height, at 0.6 brightness.
- Remove or move the near floodlight towers (z = 3) out of the top-right corner; the far towers stay as the rim source.
- Bowl corners closed, or framed out by the 24 mm camera.

**Layout and cost (Batch 4).**
- ±0.1 m row jitter, 3–5% empty seats, and a 2 m entrance-tunnel gap every 10 m or so.
- **Fix the cardboard cut-outs** (`v4-arena-preview`): start the floor sprites at z ≥ 10 m and fill the gap with a fifth standing 3D row at xfar (about +11k triangles).
- **Sort the sprite instances front to back at build.** Early depth testing then rejects most hidden sprites even though the shader discards.
- **Simplify small sprites.** Sprites under about 12 px skip the arm, collar and eye shapes (about −30 ops), and the quad's top shrinks when no arms are up.

**Behaviour.**
- **Sway:** locked to the beat only when `room.act === 'singing'` or in preview, with ±0.3 rad of phase jitter and 30% of people not swaying.
- **The wave:** only in preview, at 12 m/s and 6–12 m wide, never on a laugh.
- **Gestures:** remove arms-up and one-arm-up from `VOCAB.stadium.laugh`; add pointing at the stage, short claps and doubling over. `uArms` only for cheers and the finale; `uBounce` only for sung cheers, on the beat.
- **Sprites laugh by threshold,** with a 4–5.5 Hz shoulder shake:
  ```glsl
  float th = fract( ph * 0.377 );                          // a hash that uFill does not already use
  float on = smoothstep( th - 0.05, th + 0.05, uLaugh );   // uLaugh = the venue's current laugh level
  ```
- **Dead air:** add `0.15 × restless` to the phone lights (`uOn`). Head turns only if the G31 measures them under 1 ms; otherwise low and high only.

- **Gain:** high for the arena. **tv cost:** roughly zero, or cheaper (sprite pixel work about −30–50%), plus about 11k triangles for the fifth row. **Presets:** all.

### R13. Detail where the camera looks — Batch 2
**Detail-level bands.**
- `THEATRE.presets.tv.inst`: rows 0–1 sil (6 types), rows 2–3 far (8), rows 4+ and the balcony xfar (8). Today rows 2–6 are xfar: heads of 84–144 triangles at 40–90 px tall, which is why they look like masks.
- `ARENA.presets.tv.inst`: row 0 sil, row 1 far, rows 2+ xfar.

**Split the instanced bodies from their hair cards** (`bakeType`, `InstancedCrowd`).
- Split the index buffer by atlas quadrant into two groups. A triangle is a hair card when `fract(u·4) < 0.5 && fract(v·4) ≥ 0.5`, the same test as the cloth mask.
- Draw them as `new THREE.Mesh(g, [bodyMat, cardMat])`:
  - The body stays double-sided, with no alpha test; it keeps the mask fetch for R7.
  - The cards are double-sided, with alpha-to-coverage.
- At far and xfar, the cards stay in the body group. After R9's dilation they render as hair-coloured blobs, which is fine at 15–30 px.
- On Mali, alpha-testing the whole body forces late depth testing and defeats Forward Pixel Kill on every hidden layer of the rake. This split is probably the largest pixel-shading saving available.

**Pipeline (`build_people.mjs`).**
- **Hands get triangles back.** Simplify the `.tv` body per bone group before `simplifyPrimitive`: hands 0.6, legs 0.15, the rest 0.25, for the same total of about 1.5–1.9k. Today the close-up hands are flat paddles.
- **Crowd levels:**
  - Delete teeth, tongue and mouth interior.
  - Legs get at most 5% of the far and xfar budgets; seat backs hide them.
  - Head simplification error at most 0.02, and the xfar head ratio 0.03 → 0.05.
- **Thin the hair cards at far and xfar.** Keep the outer ~40% of cards by distance from the head bone. Long-haired women cost 335–536 card triangles at xfar today, which is why the cheap types were mostly men.
- **Wider atlas gutters.** `PAD` 2 → 12 at 2048 in `textures.py quad()`, with the matching UV span in `build_people.mjs`. Mip bleed is what puts clothing colours on far faces.

- **Gain:** high for theatre and arena faces and close-up hands; it also allows a 50/50 gender mix in the far rows. **tv cost:** about +9k triangles in the theatre and +6.5k in the arena, partly repaid by the card thinning; +1 draw per sil type for the split; no memory. **Presets:** all.

### R14. An Indian metro audience (recast) — Batch 2 if confirmed, else Batch 4
- **Why:** the bill names the theatre "Prithvi" and the arena "Wankhede" (`packages/crowd/src/packs.ts`), and the warm MC is Meera, voiced by Polly's en-IN voice. Today's cast is twelve people aged 20–40 in Western streetwear; all six women are light-skinned and three are blonde.
- **Confirm with the user before fetching.** This changes who is in the room.
- **What to fetch** and the per-venue casts are in section 4.
- **Spectacles on two of each front six:** two torus rims plus bridge and temples (about 200 triangles), a child of the head bone at the midpoint between the eyes, 1.4 cm forward. +1 draw each, or none if Business_Female_02 covers it.
- **Optional:** a dupatta strip merged into the body mesh; a block-print kurti on Female_Adult_11; a pallu band drawn on instanced women (low and high).
- **Gain:** high for product fit, plus more women and older faces. **tv cost:** no draws (16 avatars fill the 4×4 atlas); about +0.35 MB download per new `.tv.glb`; one rebuild on the box. **Presets:** all.

### R15. Bodies and hands — Batch 3
- **Legs** through the existing leg IK: ankles crossed, knee over knee, one foot tucked back, and a heel bounce when restless.
- **Fingers** posed per gesture (flat for claps, a fist, a grip for a glass or phone). Today they are set once at load.
- **Contact points:**
  - Offset each contact target by the palm (about 8 cm) and aim the palm at the face, chest or thigh.
  - Bring the "mouth" target to 0.09 m from the face; today it is 14 cm, so hands hover.
  - Use standing-aware heights for neighbour, knee and slap.
- **Raised hands:** with arms up, `rig.aim` the hands towards world up with weight `upW`. This fixes the wrists flipped back in `v4-arena-close`.
- **Glasses:** the front tables' glasses become one InstancedMesh that follows the hand during sips (+1 draw).
- **Walking** (`traffic.js`): a stride of 1.3 m per cycle (about 1.8–2 steps a second instead of 3.4), foot swing ±0.33 m, and side-stepping along rows.
- **Gain:** medium. **Cost:** CPU and +1 draw. **Presets:** all.

### R16. Compressed textures (KTX2) — Batch 4, or earlier if the Google TV shows memory pressure
- **Encode on the box** with toktx or basisu:
  - Faces: UASTC, which transcodes to ASTC 4×4 on Mali.
  - Bodies, hair colour and the atlas: ETC1S, which transcodes to ETC2.
- **Load them** inside the GLBs through `KHR_texture_basisu` (gltf-transform with toktx), using r160's `KTX2Loader` and `GLTFLoader.setKTX2Loader`. Transcode in a worker.
- Update `textureMB()` to count compressed formats correctly.
- **Gain:** club tv textures drop from about 24 MB to about 10 MB, or about 6 MB if the canvas-drawn walls and floor are baked too. That matters on a TV with about 300 MB free and for texture bandwidth on the G31, and leaves room for six distinct front people and 512² hair. **Cost:** about 0.56 MB of transcoder download and 0.2–0.5 s of transcoding at load. **Presets:** tv (all benefit).

### E. Budget enablers (no visible change; do first, in Batch 1)
- **Draw order.**
  ```js
  // buildRoom(), at the end: draw opaque objects front to back (r160 sorts opaque by renderOrder, then material id,
  // and the venue's materials were created first)
  const ORDER = { sprites: 3, room: 5, 'room-emissive': 5, floor: 6, walls: 7, sky: 7, screen: 7 };
  scene.traverse((o) => { if (o.isMesh && !o.material.transparent) o.renderOrder = o.name.startsWith('instances-') ? 1 : (ORDER[o.name] ?? 0); });
  ```
  The feasibility review estimates 4–10 ms saved on the G31.
- **A 30 fps cap on tv.** It gives steady pacing on the G31 and halves the load on the G310:
  ```js
  let lastDraw = 0;
  const loop = (t) => { if (!STILL || frames < 3) requestAnimationFrame(loop); if (P.fps && frames > 3 && t - lastDraw < 1000 / P.fps - 4) return; lastDraw = t; frame(clock()); };
  ```
- **Small settings:**
  - `stencil: false` on the renderer.
  - `renderer.compileAsync()` during load, with the hidden phones and glasses made visible for the call, so the first cut never compiles a shader.
  - Texture `anisotropy` 4 → 1 on tv for floor, walls and the crowd atlas.
- **Optional later:**
  - If the G31 profile shows the vertex stage is the bottleneck: per-instance head and torso rotations computed on the CPU, replacing 8 sin/cos matrices per vertex.
  - On the G310: resolution switches on hard cuts only (854×480, 960×540, 1152×648, 1280×720), chosen from the p90 with hysteresis, with point sizes rescaled.

### L. Low and high presets only
- Standard material with head normal maps (already there), roughness by body part, and wrap lighting in the physical chunk.
- **High only:**
  - Key-light shadows from the front people (1024² PCF).
  - Bloom (`UnrealBloomPass` at half resolution, threshold about 1.0, plus `OutputPass`) and close-up depth of field (`BokehPass`). Vendor r160's `examples/jsm/postprocessing/`.
  - 2–4 point lights for the visible lamps (candles, bar).
  - AgX with a gentle contrast look, optionally.
  - 16 front people, with re-toned variants.
  - The better silhouette level for arena row 1.

---

## 3. Implementation batches (one engineer, in order)

If time runs short: finish Batches 1 and 2 before filming. From Batch 3, do at least the thresholds, fidgets and smoothing, claps that meet, and the ovation. In Batch 4, do the club re-seat first.

### Batch 1: light, lens and the free fixes (runtime only, about 2 days)
**Do:**
1. Instrumentation, the `&ab=`, `&false=1` and `&mirror=0` flags, and the step-0 baseline.
2. E: draw order, the 30 fps cap, `stencil: false`, `compileAsync`, anisotropy.
3. R1, proven with `&mirror=0`.
4. R2, all of it.
5. R10: tone map and grade, fog and haze, the final pass; remove the CSS layers.
6. R3: lenses, positions, safe zones, the house-right reaction and heckler shots, drift and push-in, the bill's view offset, glow-point scaling, background dimmed to 0.25.
7. R6: per-venue seed, `frontDistinct` 6, the sil pool without the front six, 6 sil and 8 far types, greedy assignment, bar standers from the pool.
8. Quick fixes:
   - R5: constant-amplitude noise, smoothed switches, glances that release.
   - R11: dark club chairs; the open mic's house lights and chair angles.
   - R12: UI clashes, key light, and the palette, skin, hair, falloff and faces-in-light changes in `SPRITE_FS`; the beat, wave and arms-up rules.

**Verify.** On the box, copy `tools/render/batch-v3.sh` to `batch-v5.sh` with the prefix `crowd3d-v5-` and the base URL `index.html?still&preset=tv&hud=1`.

Renders:
- For each venue (club, theatre, openmic, arena):
  - `listen` (t=3)
  - `laugh` (t=1.5, the close-up)
  - `laugh-wide` (t=1.8, `&shot=wide`)
  - `preview` (t=14)
  - `after` (t=13)
- `club-listen&false=1`, `theatre-listen&false=1` and `club-listen&mirror=0`.
- `hosttest.mjs` → `crowd3d-v5-host-finale.png`.
- The bill retaken from the TV web app with `?crowd=3d`, replacing `crowd3d-v3-tv-bill.png`.
- Then `measure.sh` and `bindcheck.mjs`.

A judge checks:
1. No blue-lit or black faces among warm ones at the same depth, and `&mirror=0` looks the same.
2. In false colour, every target in R2(i) is met: front, row 3, back rows, furniture never brighter than front faces, lamps brightest.
3. Faces have a lit side and a shadow side. The shadow side is not pure black, and the key comes from house left.
4. Back rows read as dark heads against haze with thin rims, warm in the club and cool in the theatre. Lamps facing the lens glow; there are no "eyeball" discs.
5. The blacks are black: the darkest areas are at most 0.05, with no brown fog floor.
6. The safe zones hold, the front row is not shown down to the shoes, the vanishing point is off-centre, and eyelines pass just off the lens.
7. The close-up is a three-quarter view from house right: the pair look past the lens, the background is dim silhouettes, and there are no empty seats.
8. The front six differ between the four venues, with no twin in any front row. There are no red seat backs in the club's rows.
9. Moods: preview reads "doors open", after reads "last call", and the finale has the house at 40% with the stage lit.
10. Arena:
    - The barrier is dark and clear of the lower third.
    - Nothing bright sits under the caption or LIVE.
    - The tiers are dark with falloff, not confetti or a field of egg heads.
    - The laugh shows no raised arms and no wave.
11. `bindcheck.mjs` reports nobody in the bind pose, and the new bill shows no arms-out poses.

Budgets:
- Draw calls: club ≤ 40, theatre ≤ 38, open mic ≤ 36, arena ≤ 38.
- Triangles within +3k of today; textures ≤ 27 MB.
- On the Google TV, p90 no worse than step 0 (it should improve) and ≤ 34 ms.

### Batch 2: faces and edges, with one asset rebuild (about 3 days)
**Do:**
1. **Pipeline, on the box:**
   - The four extra morphs in `TV_KEEP`.
   - In `textures.py`: colour dilation, unquantized alpha, the cavity bake, the RGB mask atlas, and `PAD` 12.
   - In `build_people.mjs`: hand rebalancing, crowd-level clean-up, card thinning, mouth `COLOR_0`, garment labels, and `uInvMean` in `people.json`.
   - Include the recast if the user has confirmed it (section 4). Rebuild every avatar.
2. **R13:** the body/card split and the detail-level bands.
3. **R9:** MSAA set to auto, alpha-to-coverage and its fallback, and 512² alpha for the close table.
4. **R4:** Phong heads with wrap and the eye mask, the candle term, the body wrap, the jaw rule, and eye movement with saccades and blinks (`applyDrive` keeps `speaking` and `lineEndAt`).
5. **R7:** the palette shader, `aVar` packing and the uniform arrays.
6. **R3:** the leftover close-shot background blur (`uBgBias`).

**Verify (prefix v6).**

Renders:
- Close-ups of each venue at t = 1.2, 1.8 and 2.6.
- Club laugh and arena listen, each with and without `&noaa`.
- `&view=avatar&name=<each front avatar>&zoom&preset=tv&state=laugh&t=1`, and the same avatars at `state=listen` at t = 0.5 and 2.5, to see the gaze move.
- Club listen, theatre listen and arena laugh-wide.
- A 2 s `video.mjs` clip of club listen, to check for shimmer.
- `measure.sh` and `bindcheck.mjs`.

A judge checks:
1. No 2-px stair-steps on jackets, hands or the rail.
2. Soft hair edges, and no dark seams through the afro.
3. The laugh reads as laughter: eyes narrowed, cheeks up, upper lip raised, a smile, and never a round "O".
4. Eyes are on the performer and move between frames, with a 1–2 px catchlight in close-ups only.
5. Skin has a soft highlight, not plastic.
6. Hands have fingers.
7. Theatre rows 2–3 read as faces.
8. Clothes are mostly dark neutrals and denim: no yellow forearms, green suits or magenta hoodies. Most instanced hair is near-black.
9. Far faces don't pick up clothing colours, and hair cards don't crawl in the clip.

Budgets:
- Draw calls: club ≤ 48, theatre ≤ 46, open mic ≤ 44, arena ≤ 42.
- Triangles ≤ 88k in the theatre and ≤ 80k elsewhere; textures ≤ 30 MB.
- On the Google TV, MSAA stays on only if p90 grows by at most 2.5 ms. Otherwise `aa: 'auto'` turns it off on that GPU and the discard path stays.
- Phong heads add at most 1 ms of p90 in the close-up.

### Batch 3: a room that listens and laughs (about 3 days)
**Do:**
1. **Pose texture:** move the five pose deltas into the RGBA16F texture and add poses 5–9; `aSoc`; ungate the side sway; `uWarmth`.
2. **R8:** thresholds, laugh shapes, the `summary()` extension, the director's pair choice, claps, finale and ovation.
3. **R5:** fidgets, speaking-aware events, parties, the heckle glance, the go-live hush, dead-air phones (a Points draw), chat after the set, and the garbage-collection fix.
4. **R15:** bodies and hands; the walking stride.
5. **R12 behaviour:** sprite thresholds, the shoulder shake, phones. Head turns only if cheap.

**Verify (prefix v7).** Videos with `video.mjs` at 25 fps, using `&capture=1&preset=tv&hud=0`:
- Club, theatre and arena `state=cycle` from 2.6 to 12.6 s.
- Club `state=murmur` from 0 to 20 s.
- A `hosttest.mjs` run (preview → live → laugh → heckle → finale → after), with frames every 0.5 s.
- Finales at strength 0.9 and 0.5.

Stills: club laugh-wide at `&s=0.3`, `0.6` and `0.9` (t = 1.8), each with a pixel diff against club listen.

A judge checks:
1. The share of people visibly laughing follows the strength: about a third at 0.3, most at 0.9.
2. Laughers in rows 2 and back change their silhouette by at least 3 px at 540p.
3. No two neighbours move in step.
4. Laughs come in bouts and end in a settle with re-drawn postures.
5. While listening, a 70-person room shows 2–4 small actions every 10 s. No bobbleheads, and no jumps (instanced head yaw changes by at most 0.1 rad per frame).
6. In dead air: phones, whispers, people looking around.
7. On a heckle, heads turn and come back within about 2 s.
8. Claps: palms meet, rates differ, and people stop one by one.
9. At 0.9 the room stands from front to back; at 0.5 it stays seated.
10. In the arena, no raised arms or wave on a laugh, and sway only for singing.

Budgets:
- At most 2 more draws (phone points, glasses).
- The behaviour step (`cpuMs` in the HUD) at most 1.3× its Batch 2 value on the box.
- On the Google TV, p90 ≤ 34 ms and no main-thread task over 16 ms.

### Batch 4: places, people and memory (about 2–3 days)
**Do:**
1. **R11:** the club re-seat and props; the theatre and open-mic dressing.
2. **R12:** layout, sprite cost, and the fifth arena row.
3. **R14:** the recast if it wasn't done in Batch 2, the per-venue casts, and spectacles.
4. **R16:** KTX2.
5. **L:** the low and high extras; optional resolution switching.
6. **Docs:**
   - `venues-3d.md`: lenses and arena behaviour.
   - `people/CREDITS.md`.
   - `devpost.md`: screenshots.

**Verify (prefix v8).**
- **Renders:**
  - The full set: four venues × five states on tv.
  - Club and arena laugh-wide on low and high.
  - The host finale.
  - The TV app's bill, cut sheet and green room.
- **Checks:** `measure.sh` on every preset, and `bindcheck.mjs`.

A judge checks:
1. The club reads as a comedy club: tables, stools at rails, a banquette, and red only in the light.
2. The theatre reads as a dark theatre: velvet rows and glaring balcony lamps.
3. The open mic reads as a pub back room: house lights half up, mixed colour temperatures, pints.
4. The arena reads as a bowl: dark tiers, phone lights, faces only near the stage, no cardboard cut-outs behind the barrier.
5. The casts read as Indian metro audiences with each venue's ages.
6. No front face repeats within a venue, and any two venues share at most two front faces.
7. Compressed faces show no blocking or banding.

Final budgets on tv:
- At most 55 draws (arena 50), 95k triangles, and 12 MB of textures with KTX2.
- On the Google TV: p90 ≤ 34 ms across a whole set, no frame over 50 ms at a cut, and load time at most step 0 + 1 s.

**Estimated budget ledger for the club on tv** (confirm against `measure.sh`):

| | Draws | Triangles | Textures |
|---|---|---|---|
| Today | 36 | 78.0k | 24 MB |
| After Batch 1 | about 40 (+1 final pass, +3 types) | about 79k | about 26.5 MB (sixth distinct front person) |
| After Batch 2 | about 47 (+6 card groups, +1 standing type) | about 77k | about 28 MB (+4 morphs, close-table hair) |
| After Batch 3 | about 49 (phones, glasses) | about 77k | about 28.6 MB (pose textures) |
| After Batch 4 | about 49 | about 84k (furniture) | about 10–12 MB (KTX2) |

---

## 4. Assets

**Recommended: 12 more Microsoft Rocketbox avatars**, bringing the cast to 16, the most the atlas holds (4×4 tiles; 4 are empty today).
- **Source:** https://github.com/microsoft/Microsoft-Rocketbox, MIT licence (© 2020 Microsoft; the licence text is already in `people/CREDITS.md`).
- **Checked on 2026-10-11:** each pick has `Export/<Name>_facial.fbx` (the face shapes this pipeline uses), and I read the texture prefixes from each `Textures/` folder.

| Avatar | Folder | Texture prefix | Look | Use |
|---|---|---|---|---|
| Female_Adult_11 | Adults | f011 (+opacity) | dark bun, medium skin | club and arena front |
| Female_Party_02 | Adults | f022 (+opacity) | dark curls | club and open mic front |
| Business_Female_01 | Professions | f014 (+opacity) | short dark hair, medium-dark skin, suit | club front |
| Female_Adult_05 | Adults | f005 (+opacity) | dark bob, blazer | theatre and arena front |
| Female_Adult_08 | Adults | f008 (+opacity) | long dark hair, tee | open mic and arena front |
| Female_Adult_06 | Adults | f202 (+opacity) | white headscarf, long tunic | theatre; at most one per room |
| Business_Female_02 | Professions | f015 (+opacity, plus a glasses set) | in her 50s, grey-blonde, spectacles | theatre front |
| Male_Adult_15 | Adults | m204 | beard, white kurta, skullcap | theatre; at most one per room |
| Business_Male_05 | Professions | m016 | brown skin, suit | club front |
| Business_Male_06 | Professions | m025 | white shirt, office-goer | theatre and arena front |
| Male_Adult_08 | Adults | m014 (+opacity) | light-blue shirt | open mic front |
| Male_Adult_03 | Adults | m004 (+opacity) | white-haired, blazer | theatre front |

- **Keep:** Female_Adult_03, Male_Adult_04, Male_Adult_12, Male_Adult_17.
- **Retire:**
  - Female_Adult_04, 13 and 17 (blonde; recolouring would mean repainting brows, lashes and scalp).
  - Male_Adult_06 and 07.
  - Female_Adult_02, Female_Adult_12 and Male_Adult_10, to make room.
- **Alternate for the theatre:** Male_Adult_14 (m012, balding, no opacity map).
- **Minimum if time is short:** 6 new avatars (Female_Adult_11, Female_Party_02, Business_Female_01, Business_Male_05, Male_Adult_15 or Business_Male_06, Male_Adult_03). They replace the three blondes and Male_Adult_06, 07 and 10, keeping 12 in total.

**Pipeline changes for them:**
- `fetch_rocketbox.sh`: take the folder (Adults or Professions) from `avatars.json` instead of hard-coding `Adults/`. Add each avatar's texture list to `avatars.json`.
- `build_people.mjs`: route Business_Female_02's `f015_glasses_*` material through the opacity path (alpha-tested, double-sided) on the front model, and drop it at far and xfar. `suffixOf()` and `quadrant[kind]` must not throw on unknown suffixes.
- `textures.py`:
  - Re-tone skin offline: a YCbCr mask blurred 1.5 px, then a per-channel ratio in linear light through one 256-entry table per channel (`Image.point`), then `Image.composite`.
  - Only re-tone avatars lighter than their target group.
- **Skin targets.** The source is Pawar et al. 2024: 368 Indian adults, measured at the cheek, in three clusters: light 15%, medium 61%, dark 24%. The characters review's hex approximations are #AF9379, #967557 and #654C3F, with in-between steps #A28367 and #7D604B. Use these for the re-tone, `uSkin[5]` and the arena's `SKIN[5]`.
- **Per-venue casts** go in the venue specs as `cast: { front: [6], pool: [10] }`. Each front is three women and three men, and no two venues share more than two front faces:

  | Venue | Front six |
  |---|---|
  | Club | F11, M17, FP02, M04, BF01, BM05 |
  | Theatre | BF02, M03, F06, M15, F05, BM06 |
  | Open mic | F08, M12, F03, M08, FP02, M17 |
  | Arena | F05, M04, F11, M12, F03, BM06 |

  Abbreviations: F = Female_Adult, FP = Female_Party, BF = Business_Female, M = Male_Adult, BM = Business_Male.

- `people/CREDITS.md`: add a row per avatar, with the Professions paths.

**Textures to make (owned; nothing to fetch):**
- The RGB mask atlas.
- Dilated, unquantized opacity maps.
- Cavity-baked head colour.
- 512² single-channel alpha for the two close-table seats.
- Optionally, a block-print or bandhani tile drawn in Python for one kurti.
- The KTX2 encodes.

**Tools and libraries:**
- On the build box: KTX-Software `toktx` or `basisu` (Apache-2.0).
- Vendor from three.js r160 itself:
  - `examples/jsm/loaders/KTX2Loader.js` and `examples/jsm/libs/basis/` (the basis transcoder) for KTX2.
  - `examples/jsm/postprocessing/` for low and high only.

**Don't use:**
- Mixamo: its raw files can't be redistributed in a public repo.
- Ready Player Me: the service shut down at the end of January 2026, after Netflix bought it.
- MetaHuman: it needs an Unreal export, it is too heavy for the TV, and redistributing it in an open repo is unclear.
- Quaternius and Kenney: stylised, so they would clash with the realistic people.

After the hackathon, MakeHuman/MPFB2 (CC0) could supply older and heavier bodies; it needs Blender on the box.

---

## 5. What not to do

1. **No real-time shadows on tv.** The shadow pass re-runs the skinning and face shapes. High preset only.
2. **No post-processing pass on tv** (bloom, depth of field, SSAO, FXAA/SMAA, LUT). Each needs a render target and several full-screen passes; bloom alone is about 3–5 ms and 4–6 MB, and loses the in-tile MSAA resolve. The additive glow sprites are tv's bloom.
3. **No MSAA through `WebGLRenderTarget({ samples })` on tv.** Use the default framebuffer only.
4. **No AgX or MeshStandard/Physical on tv without measuring.** They cost about +85 ops per pixel (AgX) and +60–100 ops per covered pixel (Standard).
5. **No runtime normal maps on tv heads.** r160 derives the tangent frame from derivatives (about +30 ops and a texture read) for detail that barely shows at 540p. Bake cavity shading instead.
6. **No extra scene lights on tv** (candles, bar, practicals). r160 has no light culling, so every lit pixel pays about 40 ops per light. Use the people-only shader terms.
7. **No `alphaHash`, dithered alpha or sorted alpha blending for hair.** Without temporal accumulation, they sparkle on moving people at 540p.
8. **Don't set `side: FrontSide` on the instanced body** while mirroring lives in the vertex shader: mirrored people would turn inside out.
9. **No BatchedMesh in r160.** It fetches a matrix per vertex, copies vertices, has no per-instance attributes and has no `addInstance` before r165. Revisit past about 70 draws on r166 or later.
10. **No more than 6 skinned people on tv,** no 22-morph GLB there, and no 1024² faces (no visible gain at 540p, +3 MB each).
11. **Don't fake "alive" with bigger random noise.** It reads as bobbleheads. Use discrete, timed events.
12. **Don't move the room on one envelope or one rate.** The share of people reacting must follow the measured level, and nothing reacts in preview or after.
13. **No Mexican waves or raised arms on punchlines, and no beat sway during stand-up.**
14. **Don't recolour blondes by hue,** and don't hue-rotate whole body tiles; skin turns with the clothes. Swap the avatar, and mask the garments.
15. **Don't widen the lens to "show more crowd."** Nothing wider than about 46° vertical (24 mm), and that only in the arena.
16. **No impostor or pre-rendered sprites of people without the user's explicit OK,** since they rejected pre-drawn frames for the audience. No photos or clips.
17. **No readable signage or brand names in the rooms.** Unlettered neon only.
18. **Nothing that stalls the GPU pipe, and no device-pixel-ratio scaling on tv.** No `getParameter`, `getError` or `readPixels` every frame, and no `setPixelRatio(devicePixelRatio)` on tv.
19. **No resolution switches mid-shot.** Only on hard cuts.
20. **No CSS blend layers over the canvas.** No `mix-blend-mode` overlays over the WebGL canvas again.
21. **No renders, builds, headless browsers or ffmpeg on the laptop.**

---

## Sources

- **How real specials light and shoot a crowd:**
  - [Chortle: Come into the light](https://www.chortle.co.uk/correspondents/2011/07/06/13593/come_into_the_light....)
  - [Reaction: Ginnetty on online comedy clubs](https://www.reaction.life/p/online-comedy-clubs-are-a-joy-just-make-sure-you-mute-the-dog)
  - [Intensity Advisors: Ravitz on Bill Maher's special](https://intensityadvisors.com/news-archive/ravitz-designs-bill-maher-hbo-special/)
  - [LSi: Reazione a Catena](https://lsionline.com/news/robe-for-latest-reazione-a-catena-series-9dqayf)
  - [ALPD: Janowitz on Jimmy O. Yang's special](https://www.thealpd.org.uk/news/242100/marc-janowitz-finds-the-look-with-elation-for-jimmy-o-yang-stand-up-comedy-special)
  - [DGA Quarterly: stand-up directors](https://www.dga.org/craft/dgaq/issues/1802-spring-2018/standup-comedy)
- **GPU, WebGL and rendering:**
  - [Vega WebView WebGL best practices](https://developer.amazon.com/docs/vega/0.24/webview-webgl-best-practices.html) (Mali-G310 on Panfrost, < 500 draws, ASTC/ETC, sample code with `antialias: false`)
  - [Chromium drawing_buffer.cc](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/graphics/gpu/drawing_buffer.cc)
  - [Chromium review 188173002](https://codereview.chromium.org/188173002/)
  - [Mesa Panfrost MR 24321](https://gitlab.freedesktop.org/mesa/mesa/-/merge_requests/24321)
  - [Arm: hidden surface removal on Mali](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/hidden-surface-graphics-removal-methods-in-mali-gpus)
  - [Imagination: MSAA performance](https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/msaa-performance.html)
  - [CNX: Fire TV Stick SoC and GPU](https://www.cnx-software.com/2020/09/25/the-new-amazon-fire-tv-stick-is-powered-by-mediatek-mt8695d-soc/)
  - [Golus: anti-aliased alpha test](https://bgolus.medium.com/anti-aliased-alpha-test-the-esoteric-alpha-to-coverage-8b177335ae4f)
  - [Castaño: alpha mipmaps](https://ludicon.com/castano/blog/articles/computing-alpha-mipmaps/)
  - [Wyman & McGuire: hashed alpha](https://research.nvidia.com/sites/default/files/pubs/2017-02_Hashed-Alpha-Testing/Wyman2017Hashed.pdf)
  - [Filmic tone-mapping operators (Hejl)](https://filmicworlds.com/blog/filmic-tonemapping-operators/)
  - [GPU Gems ch. 16 (wrap lighting)](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-16-real-time-approximations-subsurface-scattering)
  - [three.js r160 release notes](https://github.com/mrdoob/three.js/releases/tag/r160)
  - [BatchedMesh instancing PR #28404](https://github.com/mrdoob/three.js/pull/28404)
- **Crowd and face behaviour:**
  - [Provine on laugh timing](https://www.mentalfloss.com/article/30329/lab-worlds-leading-laugh-scientist)
  - [Laugh bout figures (Bachorowski, via a review)](https://arxiv.org/pdf/1010.5602)
  - [Mann et al. 2013, applause contagion](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4043176/)
  - [Néda et al. 2000, synchronised clapping](https://arxiv.org/abs/cond-mat/0003001)
  - [Farkas et al. 2002, Mexican waves](https://www.nature.com/articles/419131a)
  - [Nakano et al. 2009, synchronised blinking](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2817301/)
  - [Nakano & Kitazawa 2010, blinks at speech pauses](https://doi.org/10.1007/s00221-010-2387-z)
  - [Kwok et al. 2015, face touching](https://pmc.ncbi.nlm.nih.gov/articles/PMC7115329)
  - [Granovetter 1978, threshold models](https://sociology.stanford.edu/publications/threshold-models-collective-behavior)
  - [Miller & Page, the standing ovation model](https://jasss.org/12/1/6/appendixB/MillerPage2004.html)
  - [McDonnell et al. 2008, "Clone attack!"](https://research.gold.ac.uk/id/eprint/15203)
  - [McDonnell et al. 2009, "Eye-catching crowds"](https://tara.tcd.ie/items/9ffa2d7e-2a7a-4da5-8082-071b60ca0471)
- **People and licences:**
  - [Microsoft Rocketbox (MIT)](https://github.com/microsoft/Microsoft-Rocketbox)
  - [Pawar et al. 2024, Indian facial skin shades](https://pmc.ncbi.nlm.nih.gov/articles/PMC11614129/) ([DOAJ record](https://doaj.org/article/527e19f1c33a44bbb0f955b1c74d9e7c))
  - Ready Player Me shutdown: [ryanschultz.com](https://ryanschultz.com/tag/ready-player-me/), [Avatar SDK 2026 roundup](https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/)
  - [Mixamo FAQ](https://helpx.adobe.com/en/creative-cloud/faq/mixamo-faq.html)
  - [MetaHuman licence](https://www.metahuman.com/en-US/license)