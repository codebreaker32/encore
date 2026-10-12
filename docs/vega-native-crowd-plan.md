# Plan: shipping the live 3D crowd on Vega through expo-gl

This plan was written read-only on 2026-10-11 at about 20:30 UTC. It draws on:
- the two study reports;
- the spike (`GlSpike.js`);
- the probes another agent is running on the VVD right now, in `apps/vega/src/crowdgl/`: `OverlayProbe.js`, `CrowdScreen.js` with its `env.js` shim, and `mediaProbe.js`;
- today's friction-log entries;
- the shipped sources of `@amazon-devices/expo-gl` 2.0.9000000001: `build/GLView.kepler.js`, `kepler/*.cpp` and `common/*.cpp`.

Each claim below carries one of these tags:
- **[VVD]**: seen on the Vega Virtual Device (SDK 0.24.12044, debug build, Mesa virgl over llvmpipe, no GPU).
- **[SRC]**: read in shipped code (the expo-gl package or three r160), not yet seen running.
- **[LIKELY]**: follows from the above, but hasn't been run.
- **[UNKNOWN]**: needs an on-device test. **(running)** means the other agent's probes are answering it now.

## 1. Decisions

| Area | Decision | Basis |
|---|---|---|
| Stage | One full-screen `GLView` for the whole life of the app, under every screen, as the WebView stage is today. Never a second GLView and never a remount. | One GLView per screen works; six on one screen crashed (SIGSEGV in libgwsi) [VVD] |
| Overlays | **Plan A:** all four screens' UI goes inside one transparent `Modal` above the GL. **Plan B**, only if the pending Modal tests fail: the live screen's overlays are drawn in GL, and the other screens use plates. | A Modal is the only arrangement that draws over the GL surface [VVD] |
| Render loop | React's JS thread. The host owns the loop: 30 fps on the live screen, 24 fps elsewhere, paused in the background, with one `gl.flushEXP()` per frame to bound the GL backlog. | There is no worklet path on Vega [SRC] |
| Crowd code | `prototypes/crowd3d/stage.js` exports `createCrowd(env)`, with no DOM, no globals and no loop of its own. `crowd.js` becomes its browser adapter, so `index.html`, `pack.mjs` and the WebView stages don't change. | Venue changes need code that can run again; global DOM shims leak into the app |
| Bridge | Direct calls, with `useCrowdFeed`, `CrowdMessage` and `CrowdReport` unchanged | Same thread, no JSON |
| Assets | `pack.mjs --tv --native` into `apps/vega/assets/crowd/`: the GLBs' images as files, plus the room canvases baked to PNG | No Canvas 2D on Vega, and React Native can't make a Blob from bytes [VVD] |
| Sound | Stays in `CrowdSound.vega.tsx` (w3cmedia playing the HTTPS copies on S3). The crowd core gets `sound: null`. | w3cmedia opens only HTTPS [VVD] |
| Ship gate | On a release build: club and theatre at ≥ 24 presented fps (target 30), JS p95 ≤ 28 ms (target 20), flat memory, overlays readable and keys working | §9 |

## 2. What today's evidence adds to the reports

1. **React Native over GL now has a route** [VVD]. In `OverlayProbe.js`:
   - A label as a later sibling (A), the same label with `zIndex`/`elevation` 10 (B), and a label next to a GLView wrapped in its own View (C) are all hidden.
   - A label in a transparent `Modal` (D) draws over the GL surface.
   - A label over a `KeplerVideoSurfaceView` (E) shows.
   
   The cause [SRC]: `kepler/GLViewComponent.cpp` creates its surface with `keepAboveReferenceWindow = true` hard-coded, and `aggregatePropSetters` registers no props. No app-side prop can change this (friction log, "An expo-gl view covers every React Native view; only a Modal draws over it").
2. **Worklets are fully closed** [SRC]. On top of the wrapper dropping the prop, nothing in Vega's `kepler/` sources calls `EXGLContextPrepareWorklet`, so a worklet `gl` object is never created.
3. **Snapshots need a workaround** [SRC]. Vega's `GLContext::takeSnapshot`:
   - looks up the requested `framebuffer` but never binds it before `glReadPixels`, so it reads whatever is bound when its GL job runs;
   - writes to ApplicationData, not the cache directory the docs name;
   - returns a plain path as `uri`;
   - defaults to PNG and ignores `compress`.
   
   Expo documents `framebuffer` as the framebuffer it reads from (https://docs.expo.dev/versions/latest/sdk/gl-view/).
4. **The EXGL warning prints on every frame, about two dozen lines** [SRC].
   - `pixelStorei` calls JS `console.log` for `UNPACK_PREMULTIPLY_ALPHA_WEBGL` and `UNPACK_COLORSPACE_CONVERSION_WEBGL`.
   - three r160's `Skeleton.update` marks every bone texture for upload each frame.
   - `SkeletonUtils.clone` gives each skinned mesh its own skeleton, and each of the six front people has two skinned meshes. That makes about 24 log lines per frame.
   - The probe's `env.js` doesn't filter this. Read the running `CrowdScreen` JS times as an upper bound, and its fps as JS loop iterations, not presented frames.
5. **The Vega app currently boots the overlay probe, not Encore.** `CROWDGL = 'overlay'` in `apps/vega/src/crowdgl/CrowdGl.js`, and App.tsx shows it when set. It must be set to `null` before any Encore take.

## 3. TV overlays

### Plan A (default): a transparent Modal carries the UI

- **Structure.** `EncoreApp` keeps `<CrowdStage>` as its first child and wraps the four screens in a new `StageOverlay`.
  - On Vega, `StageOverlay` is `<Modal transparent visible animationType="none">` around a full-screen `pointerEvents="none"` View.
  - On other platforms it is a fragment, so Android and web don't change.
  - `McVoice` renders nothing and stays outside.
- **Why it can work** [LIKELY]. All input is global keys through `TVEventHandler` (`RemoteControlManager.kepler.ts`), and no screen has focusable controls, so the Modal never needs focus.
- **Open questions (running):**
  - (a) Does the Modal stay above when the GL surface is created after it? If not, show the Modal (or toggle `visible`) after the stage's first frame.
  - (b) Do OK, Back and the arrows still reach `TVEventHandler` while the Modal is up? If only Back is consumed by `onRequestClose`, re-emit it with `RemoteControlManager.emitKeyDown(SupportedKeys.Back)`. If all keys are lost, use Plan B.
  - (c) Are the Modal's transparent areas blended over the GL? The bill's house panel and the cut sheet's 74% darken depend on it. [LIKELY from probe D; confirm on its screenshot.]
  - (d) What does the second window cost? Measure UI fluidity (§9).
- **One fix needed either way** [LIKELY]. `Cut`'s one-frame black is a React Native View in a different window from the GL camera cut, so the two can disagree; on the VVD that black already stretches to about 230 ms. On the native stage, draw the black frame in GL on the frame the camera cuts, and keep `Cut` only for title cards.

### Plan B (only if Plan A fails): overlays drawn inside GL on the live screen

- **What gets drawn:** the lower-third (house · tier, red rule, clock, note), the caption (what, why, more), the LIVE mark, the bit counter with the measured line, the hints and the title cards. The pitch trace becomes instanced bars.
- **Text:** a bitmap font atlas for each of the two OFL faces (Big Shoulders Display, Atkinson Hyperlegible Next). It is baked on the build box with a Chromium canvas plus a metrics JSON, and drawn as quads at surface resolution after the upscale.
- **Wording stays in React.** `LiveScreen` computes the same strings and posts one `{type:'overlay', …}` message at most 10 times a second, so the honesty wording isn't written twice.
- **Other screens use plates.** The cut sheet still shows the GL snapshots taken during the set. The GLView then exists only on the live screen. A scene build takes seconds and the arm lead is 1.5 s (`useSetSession.ts`), so OK on the bill mounts the stage first and sends `arm` when the stage reports `ready`.
- **Cost:** 8–12 h, against 2–3 h for Plan A.
- **Not pursued:**
  - A GLView in a sub-rectangle: it breaks the full-bleed rooms.
  - React Native content behind GL cleared to alpha 0: untested, and it puts the UI under the room.

## 4. Render loop: on the JS thread, owned by the host

**Why not a worklet:**
- [SRC] The Vega wrapper passes only `style` and `surfaceCreated` to the native view, has no `getWorkletContext`, and its native side never prepares a worklet context (§2).
- The Vega page still lists `enableExperimentalWorkletSupport` (https://developer.amazon.com/docs/vega-api/0.24/expo-gl.html).
- Expo's docs say "Third-party libraries like Pixi.js or Three.js won't work inside the worklet" (https://docs.expo.dev/versions/latest/sdk/gl-view/).
- [SRC] `gl` exists only in the main runtime (`kepler/ExpoGL.cpp` takes the React Native instance's JS context), so a headless-JS runtime can't drive it either.
- RN 0.83 has no expo-gl ("Not supported in this release": https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html).

**One frame** (the crowd core never calls `requestAnimationFrame` itself):
```js
function tick(ts) {
  raf = requestAnimationFrame(tick);
  if (ts - last < 1000 / cap - 2) return;              // cap 30 live, 24 bill/after, loop stopped when AppState is background
  last = ts;
  crowd.update(ts / 1000);                             // people, instances, uniforms: JS only, overlaps the GL thread's previous frame
  const t = now(); gl.flushEXP(); glWait = now() - t;  // wait for the previous frame's GL work: backlog bounded to one frame
  crowd.render();                                      // three into the default framebuffer, 960×540 viewport (tone mapping and sRGB stay in three)
  present();                                           // copy + scale to the surface, vignette/grain quad, then gl.endFrameEXP()
}
```

- **Why `flushEXP`** [SRC]: `endFrameEXP` only queues the batch, and the GL thread drains its backlog with no backpressure. A JS loop that runs faster than the GL thread builds a queue, and the room drifts behind the engine. `flushEXP` blocks until everything queued so far has run (`EXWebGLMethods.cpp`, `EXGLNativeContext.cpp`). The wait it measures is the "GL-bound" signal in the stats.
  - [UNKNOWN] Whether `prepareToDraw` also paces the GL thread to vsync.
- **Rules:**
  - Animate by time, so a late frame still shows the right pose.
  - No `setState` and no `console.log` per frame.
  - `Animated` stays on the native driver (LightPulse and Plate already use it).
  - Run `renderer.compile()` for both shots during the build.
  - Set `renderer.debug.checkShaderErrors = false` in release, because each check is a blocking call.
- **Budget at 30 fps on the VVD (33 ms per frame):**
  - crowd update ≤ 10 ms;
  - render and present ≤ 10 ms;
  - each 10 Hz engine tick plus React re-render ≤ 10 ms;
  - the rest is slack.
  
  The engine, couch-link and the crowd all share this one thread.

## 5. Shim and adapter layer

- **Core and adapter split (inside prototypes/crowd3d).**
  - `stage.js` holds the scene, the people, the director and the snapshot hook.
  - The browser-only parts move into `crowd.js`, which becomes the browser adapter: the HTML overlays, `fitStage`, the HUD, `dataset.ready`, the demo keys and audio unlock, WebAudio, the pixel-pack and fence snapshot path, `location.replace`, and the `window.__*` debug globals.
  - `canvasTex(w, h, draw, srgb, key)` resolves textures through `env.texture(key)`.
  - The front-model file extension becomes a parameter.
  - `performance.getEntriesByType` gets a guard.
- **Vega polyfills** (`apps/vega/src/crowd/polyfills.js`, built from `crowdgl/env.js` minus the DOM):
  - a UTF-8 `TextDecoder` [VVD];
  - `navigator.userAgent` [VVD];
  - an image loader that returns `{localUri, width, height}` from a size manifest. expo-gl decodes `file://` URIs with stb_image in the 7-argument `texSubImage2D` that three r160's WebGL2 path calls [SRC];
  - a `gl.pixelStorei` filter that passes only `UNPACK_FLIP_Y_WEBGL` and `UNPACK_ALIGNMENT`, as expo-three does (https://github.com/expo/expo-three). gl methods live on the prototype, so an own property shadows them [SRC];
  - a `gl.canvas` stub, with the size taken from `Dimensions × PixelRatio` (expo-gl reports 300×150) [VVD];
  - the existing `expo-modules-core` shim [VVD].
- **Present** (Vega side): keep the probe's same-size copy plus scaling blit (being measured now), then one blended full-screen quad for the vignette and grain. That matches `index.html`'s `.vig` and `.grainov`, which stay visible in host mode.
- **Dropped from the probe harness:**
  - the global `document`, `location`, `URLSearchParams`, `addEventListener` and `ReactNativeWebView`;
  - the global `requestAnimationFrame` wrapper (it also wraps Animated's);
  - matching canvases by creation order;
  - hashing GLB image bytes at runtime;
  - the hookable `WebGLRenderer` subclass.
  
  Metro's `three` alias becomes a plain re-export of the vendored r160 plus `three/addons/*` (the RN CLI drops `resolveRequest` [VVD]).

## 6. Asset packaging

**`node prototypes/crowd3d/tools/pack.mjs apps/vega/assets/crowd --tv --native`:**
- The `--tv` people set as today (about 8.4 MB, including the 1K atlas).
- The 12 `.tv.glb` front models (4.2 MB, with embedded body, head and opacity images) written as `.tv.gltf` + `.bin` + image files with gltf-transform, which is already a crowd3d dependency. GLTFLoader then requests the images by URI. Until that exists, the probe's content-hash extraction is the stopgap (running).
- The room canvases baked per venue and key on the build box (headless Chromium, `toDataURL`). They are deterministic from the seed: floors, walls, the arena screen, glow and blob. Plus a `textures.json` with each file's size.
- Leave out `sounds/` (w3cmedia reads S3). Keep `index.html` and `crowd.bundle.js` only for the WebView variant.
- Keep the GLBs free of Draco, meshopt and KTX2 [SRC]: Hermes 0.72 has no WebAssembly (https://github.com/facebook/hermes/issues/395), and `compressedTexImage2D`/`3D` are unimplemented. Textures stay uncompressed RGBA, about 20–25 MB per venue on the GPU.
- Total size: about 13–18 MB.

**Paths and loading:**
- Runtime path is `file:///pkg/assets/crowd/…` for both `fetch` and `localUri` [UNKNOWN, running: the spike proved only `/pkg/bundle/assets/…`].
- Fallback: Metro assets. A generated module `require()`s every file (add glb, bin and png to `assetExts`), and URIs come from `Image.resolveAssetSource` [VVD for GLB and JPEG].
- The Vega box deletes untracked files on every `encore-box.sh up`, so one prep script runs before each `build:vega:*` (today's `crowdgl-prep.sh`, generalised).
- Texture decoding happens on the JS thread inside the GL call [SRC], so all uploads finish before a set starts.

## 7. Host bridge

```ts
// prototypes/crowd3d/stage.js
createCrowd(env): Promise<{ message(m: CrowdMessage): void; update(t: number): void; render(): void; dispose(): void }>
env = { gl, renderer, width, height, params: { preset: 'tv', venue, act, seed }, assetBase: 'file:///pkg/assets/crowd/',
        texture: (key) => url, report: (r: CrowdReport) => void, snapshot: (key: string) => void, sound: null, debug: false }

// packages/shared-ui/src/encore/world/CrowdStage.vega.tsx (native; the WebView stage moves to CrowdStageWebView.vega.tsx behind VEGA_STAGE)
const post = useCallback((m: CrowdMessage) => stage.current && stage.current.message(m), []);
useCrowdFeed(scene, ready, epoch, post);                                    // unchanged
<GLView style={StyleSheet.absoluteFill} onContextCreate={(gl) => { stage.current = startStage(gl, onReport); }} />
```

| Message | Native path |
|---|---|
| mode, shot | `stage.message(obj)` runs the existing `onMessage` logic |
| drive (10 Hz) | The same object with no JSON. It runs on the same thread, so the drive and the frame can't race. |
| venue | Same venue: nothing happens. Different venue: rebuild in the same context (rules below). |
| cue, duck | No-ops (`sound: null`); `CrowdSound.vega.tsx` plays them |
| snap | 320×180 blit, then `takeSnapshotAsync` (see the snapshot procedure below), then `thumb` with a `file://` URI |
| reports | `ready`, `stats` every 2 s (adding JS ms p50/p95/max, the GL wait p95 and the heap), `thumb`. No `audio`. |

**Venue rules:**
- Rebuild only after `scene.venue` has been stable for 600 ms, because Up/Down on the bill cycles venues.
- A rebuild disposes geometries, materials, textures and targets, and keeps the renderer, the compiled programs and a cache of parsed GLBs and people textures.
- On `ready`, call `setReady(true)` and bump `epoch`; `useCrowdFeed` then re-sends everything, as after a WebView reload.
- Never rebuild during an armed or live set. If OK lands inside the 600 ms window, or comes from the cut sheet with a different venue, `goLive` switches the stage first and sends `arm` on `ready`. (A build blocks the JS thread; its length is [UNKNOWN, running: the probe's "ready after".])

**Snapshot procedure** [LIKELY]:
1. Blit the frame to a 320×180 framebuffer.
2. Bind it with raw GL.
3. End the batch with `gl.endFrameEXP()`.
4. Call `GLView.takeSnapshotAsync(gl, {rect: {x: 0, y: 0, width: 320, height: 180}, format: 'jpeg'})`.
5. Bind framebuffer 0 again, so three's state cache stays correct.

The native read job joins the same first-in, first-out GL queue right after that batch, provided the TurboModule call runs synchronously on the JS thread. [UNKNOWN] Check that the thumbnail shows its own shot, the right way up (Vega flips by default), and that `<Image source={{uri: 'file://' + path}}>` displays it. Files pile up in ApplicationData; pruning them with expo-file-system (listed as supported on Vega) is optional.

## 8. Sound

- [VVD] w3cmedia plays the HTTPS copies (`VEGA_MEDIA_BASE` → S3); `docs/vega/encore-vvd-take.mp4` has room tone and cues. Packaged files, `data:` and `http:` fail.
- Export `CROWD_STAGE_PLAYS_SOUND` from each stage file: true for the Android and web WebView pages, false for Vega native. Change `LiveScreen.tsx:195` to `audible={!stage || !CROWD_STAGE_PLAYS_SOUND}`. Hushing the phone (`onCue`) is unchanged.
- **What's lost compared with the page:**
  - the cue gain following each reaction's envelope;
  - the page's 10 dB duck (`CrowdSound.vega.tsx` ducks only the room tone).
  
  An optional volume follow driven from the drive costs 2–3 h.
- [UNKNOWN] w3cmedia's start latency against the faces. Measure it in a recording; cues already preload at set start.
- [UNKNOWN, running] Packaged media under `/pkg/assets/raw/` (`mediaProbe.js`). If it plays, the cues can ship inside the package.

## 9. Performance targets and how to measure them on the VVD

All numbers are on a release build, with a 1920×1080 surface and the tv preset rendering 960×540 and upscaling.

| Measure | Target | Floor | Source |
|---|---|---|---|
| Presented fps, live (club, theatre, open mic / arena) | 30 / 30 | 24 / 20 | Frame marker in a `vvd.sh record` capture |
| JS per frame (update + render + present) | p95 ≤ 20 ms | p95 ≤ 28 ms, max ≤ 60 ms after warm-up | In-app timers in `stats` |
| GL wait in `flushEXP` | p95 ≤ 8 ms, no drift over 5 min | — | In-app |
| Engine tick interval during a set | p95 ≤ 120 ms | max ≤ 300 ms | Timestamped ticks |
| Cut on screen after the `shot` message | ≤ 2 frames | ≤ 150 ms | Frame index vs. message time |
| Venue ready: cold / switch with cache | ≤ 8 s / ≤ 4 s | ≤ 15 s | The `ready` report |
| Memory | Hermes heap and `renderer.info.memory` back to baseline after 4 switches and 3 sets; foreground < 400 MiB | — | `HermesInternal.getInstrumentedStats`; `vega exec perf kpi-visualizer --kpi foreground-memory` (KPIs: https://developer.amazon.com/docs/vega/latest/measure-app-kpis.html) |
| Overlay (Plan A) | UI fluidity ≥ 99% | — | `kpi-visualizer --kpi ui-fluidity` |
| Remote keys | Acted on within 200 ms | — | Log timestamps |

**How to measure.** Everything runs on the Vega box, never the laptop.
1. **In-app logs.** `[crowd] stats` lines go to `vvd.sh log crowd`. Run the probe's scripted timeline (warm-up, listen, laugh with close-up, settle, laugh wide, listen) per venue, then real sets with the fake phone (`vvd-take.sh`).
2. **Presented frames.**
   - Add a debug-only 16×16 corner marker whose grey level steps on every rendered frame (off in demo builds; no HUD).
   - Record with `vvd.sh record 60`.
   - Count distinct marker values per second with ffmpeg crop plus `signalstats`.
   - The JS iteration count alone over-reports.
3. **Vega tools.**
   - `vega exec perf activity-monitor --app-name com.strumble.vega.main --record-cpu-profiling`, then the Builder Tools `get_app_hot_functions` and `analyze_perfetto_traces`.
   - The `kpi-visualizer` runs from the table.
   - [UNKNOWN] Whether these run against the VVD (`symbolicate_acr` already fails there), and whether the GL window's presents show up in traces.
4. **Build type.** Use the release build for numbers; debug React is slower. [LIKELY] The repack works for Release as well.

**Hardware: [UNKNOWN].**
- The Fire TV Stick 4K Select has 4× Cortex-A55 up to 1.7 GHz, a Mali-G310 v2 and 1 GB (https://developer.amazon.com/docs/device-specs/device-specifications-fire-tv-streaming-media-player.html).
- Hermes interprets bytecode with no JIT (https://engineering.fb.com/2019/07/12/android/hermes/), while the VVD runs JS on an x86 server core. Expect the stick's JS cost to be several times the VVD's.
- The scenes use 23–36 draw calls, far under Amazon's 500 guideline (https://developer.amazon.com/docs/vega/0.24/webview-webgl-best-practices.html).
- Make no hardware claims in the submission.

## 10. Fallbacks and gates

| If | Then |
|---|---|
| The Modal loses keys or z-order | Plan B (§3) |
| JS p95 > 28 ms or < 24 presented fps | Scope down in this order, re-measuring each time: instance state at 15 Hz, one skeleton per person, a 24 fps cap, 4 front people, fewer arena sprites |
| Still failing at the Sat 17 Oct go/no-go | Ship Vega with plates (`CROWD_STAGE_AVAILABLE = false`), which already work on the VVD with HTTPS video and sound. Optionally film the 3D room on the Android TV emulator through the WebView stage, which the hackathon FAQ accepts (`docs/brief.md`) [UNKNOWN: WebGL speed on a GPU-less emulator]. Say in the description which device recorded each part. |
| Never | Prerecorded crowd frames or video (the user rejected them) |

**Gates and dates:**
- Gate 0, Mon 12 Oct: the running probes answer the Modal questions and give the club numbers.
- Gate 1, Wed 14 Oct: Encore with the native stage, end to end at the club on the VVD.
- Gate 2, Fri 16 Oct: all four venues at the floor, memory flat, venue switching working.
- Go/no-go: Sat 17 Oct.
- Office hours, Mon 19 Oct, 9:00 PT. Ask about:
  - a GLView stacking prop;
  - wiring for `enableExperimentalWorkletSupport`;
  - the snapshot `framebuffer` bug;
  - the `pixelStorei` logging;
  - the 300×150 drawing buffer, the missing `gl.canvas` and the undeclared `expo-modules-core` import;
  - the crash with several GLViews;
  - expo-gl on RN 0.83.
- Freeze Tue 20 Oct; film 20–22 Oct; submit by Fri 23 Oct, 12:00 PT.

## 11. Proven, likely, unknown

| Claim | Status | Evidence or test |
|---|---|---|
| three r160 renders through expo-gl: WebGL2/GLES 3.0, instancing, a skinned GLB parsed in 14 ms, a JPEG via `{localUri}` in 4–6 ms (needs FLIP_Y), a GLB fetched from `/pkg/bundle/assets` in 8–100 ms | [VVD] | Spike; friction log |
| 42–50 fps at 7–12 ms JS (small scene); 38–43 fps at 12–16 ms with 1,000 instances moved from JS. These are JS iterations. | [VVD] | Spike |
| Required fixes: `expo-modules-core` shim, 300×150 buffer, no `gl.canvas`, TextDecoder, userAgent, `resolveRequest` dropped | [VVD] | Friction log |
| GL covers sibling, zIndex and wrapped views; a transparent Modal and a video surface draw above or with it | [VVD] | OverlayProbe |
| One GLView works; six crash | [VVD] | Friction log |
| w3cmedia plays HTTPS only; plates work as the fallback | [VVD] | Take, dev-setup |
| Stacking hard-coded; no props; no worklet context; `gl` only in the main runtime | [SRC] | `GLViewComponent.cpp`, `ExpoGL.cpp`, `GLView.kepler.js` |
| `endFrameEXP` has no backpressure; `flushEXP` blocks | [SRC] | `EXWebGLMethods.cpp`, `EXGLNativeContext.cpp` |
| `takeSnapshotAsync` ignores `framebuffer`, writes to ApplicationData, returns a plain path | [SRC] | `kepler/GLContext.cpp` |
| `pixelStorei` logs on every upload; bone textures re-upload every frame | [SRC] | `EXWebGLMethods.cpp`, vendored three |
| Fence/sync, `getBufferSubData`, multisample and compressed-texture calls unimplemented; `readPixels` takes typed arrays only | [SRC] | Expo docs list; source |
| expo-gl not supported on RN 0.83 | Docs | https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html |
| The tv scenes render correctly with the shims | [LIKELY] | CrowdScreen (running) |
| 30 fps fits on the VVD for club and open mic; theatre and arena tighter | [LIKELY] | CrowdScreen (running), §9 |
| Plan A covers all screens, since input is global keys | [LIKELY] | Key test (running) |
| An in-place rebuild is safer than remounting the GLView | [LIKELY] | Multi-GLView crash; wrapper leak |
| The snapshot workaround gets the right frame | [LIKELY] | Bring-up |
| `\|\|=` in venue.js parses | [LIKELY] | The probe bundle builds |
| Modal mount order, keys while it is up, transparency, cost of the second window | [UNKNOWN] (running) | OverlayProbe, CrowdScreen |
| Club numbers with the unmodified page; theatre and arena | [UNKNOWN] (running) | CrowdScreen |
| `/pkg/assets/crowd` readable by fetch and `localUri`; packaged media | [UNKNOWN] (running) | CrowdScreen, mediaProbe |
| Morph faces (`texSubImage3D`) and GPU skinning look right. The spike's person looks stretched, probably from the spike's own bounding-box scaling; not verified. | [UNKNOWN] | Side by side with a Chromium frame at the same seed and time |
| sRGB, mipmaps, flipY and alpha masks through `texStorage2D` + `localUri` | [UNKNOWN] | Bring-up |
| Presented vs. JS fps; vsync pacing; Home and resume; Vega perf tools on the VVD; cue/face sync; hardware | [UNKNOWN] | §9 |

## 12. Ordered task list

"In" means inside prototypes/crowd3d (the crowd3d owner); "Out" means apps/vega and shared-ui (the Vega owner). Hours are estimates.

0. **Finish the running probes** (Vega owner, about half a day, on the box). Before reading any numbers, add the `pixelStorei` filter, the `flushEXP` wait and the frame marker to `CrowdScreen`. Then:
   - test Modal z-order when the GLView mounts after it;
   - test OK, Back and arrows with the Modal up;
   - check probe D's screenshot for transparency;
   - capture canvases, then run club, theatre and arena;
   - run `mediaProbe`;
   - grep the device log for `EXGL:` lines.
   
   This is **Gate 0**: Plan A or B, and whether performance is in range.
1. **Core split (In, 6–9 h)**, one agent holding `crowd.js` throughout, since nothing is committed and it was edited at 20:01. Create /home/aman/projects/adh/strumble/prototypes/crowd3d/stage.js and turn /home/aman/projects/adh/strumble/prototypes/crowd3d/crowd.js into the browser adapter. This includes:
   - `canvasTex` keys in /home/aman/projects/adh/strumble/prototypes/crowd3d/venue.js, rooms.js and arena.js;
   - the snapshot hook;
   - the front-model extension parameter;
   - `dispose()`.
2. **Page regression on the build box (In, 1–2 h):** hosttest, shots, bindcheck, and the cut sheet in the TV web app.
3. **`--native` pack (In and Out, 3–4 h)** in /home/aman/projects/adh/strumble/prototypes/crowd3d/tools/pack.mjs:
   - the gltf split;
   - canvases baked per venue and key;
   - `textures.json`;
   - a box prep script replacing /home/aman/projects/adh/strumble/apps/vega/tools/crowdgl-prep.sh.
4. **Polyfills and present (Out, 2–3 h):** /home/aman/projects/adh/strumble/apps/vega/src/crowd/polyfills.js and present.js (copy + scale, vignette and grain, frame marker in debug).
5. **Metro and TypeScript wiring (Out, 1–2 h):**
   - plain `three` and `three/addons` aliases plus a crowd-core alias in /home/aman/projects/adh/strumble/apps/vega/metro.config.js;
   - stubs in /home/aman/projects/adh/strumble/apps/vega/src/types/modules.d.ts;
   - expo-gl types on the laptop (a light `yarn install`, or a stub).
6. **Native stage (Out, 4–5 h):**
   - /home/aman/projects/adh/strumble/packages/shared-ui/src/encore/world/CrowdStage.vega.tsx: loop, bridge, venue rules including arm-after-ready, snapshots, AppState handling, stats;
   - move the WebView stage to CrowdStageWebView.vega.tsx behind `VEGA_STAGE`;
   - export `CROWD_STAGE_PLAYS_SOUND` from CrowdStage.tsx and CrowdStage.web.tsx too;
   - make the `audible` change in /home/aman/projects/adh/strumble/packages/shared-ui/src/encore/screens/LiveScreen.tsx;
   - the `goLive` change in /home/aman/projects/adh/strumble/packages/shared-ui/src/encore/EncoreApp.tsx;
   - the Vega `crowd3d` switch, with `CROWDGL = null`, in /home/aman/projects/adh/strumble/apps/vega/src/crowdgl/CrowdGl.js and /home/aman/projects/adh/strumble/apps/vega/src/App.tsx.
7. **Overlay layer (Out).**
   - Plan A, 2–3 h: StageOverlay.vega.tsx and StageOverlay.tsx in /home/aman/projects/adh/strumble/packages/shared-ui/src/encore/world/, Back re-emit and mount order if needed, the cut's black drawn in GL.
   - Plan B instead, 8–12 h.
8. **VVD bring-up (Out, 6–10 h).** Work through:
   - `file://` asset reads;
   - texture orientation, sRGB, mipmaps and alpha masks;
   - skinning and morph faces compared with Chromium;
   - shader compile time;
   - no `EXGL:` lines;
   - thumbnails correct and displayed;
   - memory across venue switches;
   - Home and resume;
   - overlays on all four screens, and keys.
   
   This is **Gate 1**.
9. **Performance pass (In, 3–6 h):**
   - instance state at 15 Hz, or on drive arrival, with the shader interpolating;
   - remove allocations from `response()` and `Person.update`;
   - one skeleton per front person;
   - caps per mode.
   
   Re-measure all four venues; this is **Gate 2**.
10. **End-to-end takes (Out, 2–3 h):** `vvd-take.sh` with the stage: bill venue cycling, a set with a dead bit and a heckle, cut-sheet thumbnails, green room. Check cue sync in the recording. Then the go/no-go.
11. **Docs and feedback (1–2 h):**
    - friction-log entries for the snapshot `framebuffer` bug, the `pixelStorei` log flood and the missing worklet path, in /home/aman/projects/adh/strumble/docs/friction-log.md;
    - /home/aman/projects/adh/strumble/docs/product-feedback.md;
    - /home/aman/projects/adh/strumble/docs/dev-setup.md;
    - the crowd and Vega sections of /home/aman/projects/adh/strumble/CLAUDE.md;
    - the office-hours questions.
12. **Optional:** cue volume follow (2–3 h); packaged sounds if `mediaProbe` passes (1 h); an expo-gl proxy in tv-expo on the Google TV to estimate JS cost on A55 cores (3–5 h, off the critical path).

**Total:** about 31–49 h with Plan A, split between the two owners; Plan B adds 6–9 h.