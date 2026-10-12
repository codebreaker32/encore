# Handoff: Encore on the Vega Virtual Device (EC2 "vega" box, us-east-1)

Updated 2026-10-12 ~06:50 UTC. **Nothing is running on the box**: the VVD, Xvfb, PulseAudio, the relay and the MC are
stopped, so the idle timer can stop the instance. Resume from here.

**Encore is installed on the VVD** (debug build of the laptop's code as of 06:30 UTC, `CROWDGL = null`).

**Running the crowdgl harness:** set `CROWDGL` (apps/vega/src/crowdgl/CrowdGl.js), then build with the environment
variable: `CROWDGL=1 corepack yarn build:vega:debug`. Without it, Metro maps `encore-crowdgl` to `src/crowdgl/off`, so an
Encore build never bundles prototypes/crowd3d. Today that kept the app building after the prototype started using
`import.meta.url`, which hermesc rejects. A harness build with today's prototype will hit that error until the shim
handles `import.meta` (a Babel rewrite in apps/vega, say). `GL_SPIKE` (src/spike/GlSpike.js) is `false`. `OFFSCREEN` in
CrowdScreen.js is `false`: `true` shows nothing on the VVD.

The setup and commands are in `docs/dev-setup.md`, "Vega on AWS": `vvd.sh up`, then `rm -rf apps/vega/build &&
corepack yarn build:vega:debug`, then `vvd.sh repack && vvd.sh install`. The scripted take is `tools/vvd-take.sh`, with
the relay and the MC started as its header says (`MC_VOICE_REGION=us-east-1 MC_VOICE_PREMIUM_REGION=us-east-1`).
- **`encore-box.sh up` deletes the box-only generated assets:** `apps/vega/assets/crowd`, `crowdgl` and `raw`. `raw`
  comes back with every build, and `crowdgl-prep.sh` regenerates the rest. To keep them, copy one file with
  `encore-box.sh put`, or rsync without `--delete` using the same excludes (done today).

## 2026-10-12 results
- **MC voice (the presigned-URL contract):**
  - `world/McVoice.vega.tsx` plays `clip.uri` through w3cmedia `src`, with a `#.mp3` fragment because the typefinder
    goes by extension. It tries `fallbackUri` once on error, or if nothing sounds within 2.5 s (4.5 s for long-form).
  - It reports `onPlaying` and `onDone`, and preloads `next` in a second AudioPlayer.
  - It traces `[mc-voice] …` with sounds.ts `traceVoice` (keys and engines only).
  - Its end timer is the real duration + 1 s, or the estimate × 1.5 + 1 s while the duration is unknown.
  - The MSE/base64 path is deleted.
- **Intro check after the batching fix (take at 06:36 UTC):**
  - `[mc-voice] loading warm:… generative paused` on the bill, then `queued mv4vqh39:0`, then `playing … +21ms` at OK.
  - The phone got eight 1 s hush renewals, so the intro sounded for about 8 s, and `sink.wav` shows it (−21 to −34 dB
    for 20–27 s).
  - The debrief was written by GLM-5, voiced by Brian on the generative engine (104 characters) and heard on the cut
    sheet (`cutsheet.wav`: −15 to −26 dB for 11 s).
  - The device log drops lines, so the later `[mc-voice]` traces (ended, the debrief's) didn't reach `app.log`.
- **Package size:** the 102 MB came from stale assets in `build/` (rm -rf before building). There is no double bundling:
  - the Babel plugin works, and no mp3 or mp4 file is in the Metro assets;
  - the debug vpkg is 62 MB compressed (85 MB of tar): raw media 38 MB, the WebView crowd page 10 MB, `index.bundle`
    10 MB plus `index.hermes.bundle` 6 MB (debug ships both), and the plate and clip stills 15 MB;
  - the fonts ship twice (`assets/fonts` and Metro's), about 0.6 MB.
- **Packaged media:** works in Debug (plates and cues from `/pkg/assets/raw/media/…`, `VEGA_MEDIA_BASE` on S3 as the
  fallback).
- **Release build:** crashes at launch (SIGABRT in libapmf/liblcm_client, no JS stack; friction log). Not solved.
- **Profiling** (Perf CLI on the VVD; recipe in dev-setup):
  - per-thread CPU over 50 s of the club: expo-gl's UI thread 22.3 s (about 30 ms a frame), the JS thread 16.1 s (about
    22 ms), weston 15.6 s;
  - 740 frames, every one late for vsync;
  - no CPU profile on x86_64, so no hot functions.
- **Worklet:** `runOnUI` runs, but the UI runtime has no `__EXGLContexts`, so a worklet can't draw (expo-gl's Vega view
  ignores `enableExperimentalWorkletSupport`).
- **Depth:** the surface has no depth buffer, and every render-target draw fails (0x506), so `OFFSCREEN` can't fix it on
  the VVD. This blocks a correct native 3D crowd on the simulator.

## Gate 0 results from 2026-10-11 (all on the VVD: software GPU, nested virtualization, debug build; updated above)

### 1. Overlays over the GL surface: a transparent `Modal` works
- **Probe:** `src/crowdgl/OverlayProbe.js`, one GLView with labels. Arrangements:
  - A, a later sibling (from the earlier spike): hidden.
  - B, `zIndex`/`elevation`: hidden.
  - C, the GLView wrapped in its own View: hidden.
  - **D, inside `<Modal transparent visible>`: shows above the GL surface.**
  - E, the control over a `KeplerVideoSurfaceView`: shows.
- **Cause:** expo-gl's `kepler/GLViewComponent.cpp` hard-codes `keepAboveReferenceWindow = true` and registers no props.
  The Volta/GWSI headers needed to rebuild it are not shipped, so only Amazon can change it.
- **The Modal holds up in the real harness:**
  - It stays above a GLView mounted 1.5 s after it.
  - Semi-transparent backgrounds composite correctly over the GL frame.
  - Remote keys still arrive through TVEventHandler while it is open (`key down`, `key select` logged).
  - Screens: `scratchpad` only so far. Copy the CrowdScreen frames with the stats panel into `docs/vega/` next time.
- **Six GLViews on one screen (one inside a scaled View) crash the app natively:** SIGSEGV in `libgwsi.so.2` from
  `libexpo-gl-2.so`; ACRs from `vega device copy-logs -a SYSTEM_TOMBSTONE/acr`. One GLView is fine.
- **Builder Tools `symbolicate_acr`** (gdb mode, deviceId `emulator-5554` or `VirtualDevice`) fails with
  "Failed to copy /tmp/temp_acr_debugFs/acr_libraries.txt". Logged in the friction log.

### 2. The prototype's club running natively under expo-gl (`src/crowdgl/`, crowd.js and its modules unmodified)
- **How:**
  - A shim layer (`env.js`): `location`, a working `URLSearchParams`, `document`, `<img>` with `localUri`, the 2D
    canvases matched by creation order to the Chromium capture (all 4 sizes matched), embedded GLB images through a
    GLTFLoader plugin (13 loaded), a UTF-8 TextDecoder, `navigator.userAgent`, and sound off (sound.js reports
    'unavailable').
  - The host bridge is direct `window.encoreMessage` calls at 10 Hz.
  - `three` maps to `src/crowdgl/three`, which re-exports the vendored r160 with a hookable `WebGLRenderer`.
- **The scene is identical to Chromium's:** 6 front + 70 instanced people, 36 calls, 78,035 triangles, textures ≈24 MB,
  12 programs, 960×540.
- **Load:** ready 1.3–1.5 s after the GL context. Hermes heap 16 MB (13.5 MB allocated). GPU objects: 33 geometries, 41
  textures. Process RSS not measured yet (the developer shell can't see the app's process).
- **Per-phase numbers** (run 2, morphs on, 540p in the bottom-left quarter, nothing filtered; JS ms = the crowd's whole
  frame callback, including endFrameEXP):

  | phase | fps | JS ms/frame avg | p95 | max | frame gap p95 |
  |---|---|---|---|---|---|
  | listen | 17.9 | 38.3 | 130.8 | 184.9 | 147 ms |
  | laugh + close-up | 17.3 | 41.4 | 141.6 | 281.2 | 142 ms |
  | settle | 17.3 | 39.1 | 117.6 | 160.4 | 140 ms |
  | laugh, wide | 15.8 | 46.3 | 157.7 | 224.5 | 165 ms |
  | listen 2 | 17.8 | 43.1 | 146.6 | 276.4 | 160 ms |

  With morphs off (run 3) the figures are the same: 17–18.5 fps, 39–46 ms. The page's own stats say about 8–10 fps EMA.
  These are software-GPU numbers and say nothing yet about a Mali device.
- **Rendering bug found: the expo-gl surface has no depth buffer.** `DEPTH_BITS 0` and `STENCIL_BITS 0`, while
  `getContextAttributes()` claims `depth: true`. So the front people's bodies break into shards, most visibly in the
  close-up (the heads look right). Ruled out on the way:
  - morph targets (run 3, off: same shards);
  - bone data (GPU readback of a float DataTexture and of a live 80-bone texture: 0/1600 values off);
  - capabilities (vertex textures 32, float textures, EXT_color_buffer_float);
  - finite bones and influences;
  - GLB layout.
- **FBOs work:** a three `WebGLRenderTarget` probe reports `checkFramebufferStatus 0x8cd5` (complete) with no GL error.
- **Upscaling 540p to the 1080p surface doesn't work yet:**
  - raw `blitFramebuffer`: nothing shows, and GWSI logs "Failed to create ImageIntl texture[err:00000506] … while creating
    render target";
  - render target plus output pass (half-float RT, ShaderMaterial with tonemapping/colorspace chunks): black;
  - the GWSI errors (about 350–1,400 per run) appear without either, so they may be unrelated. They flood the log, and
    `loggingctl -f` then drops most `[crowdgl]` lines.

  Because of that, the harness writes every result into the Modal panel; read it from a screenshot.
- **Worklet path:** tried 2026-10-12, no GL context in a worklet (above).

### 3. Packaged media without S3: works (forum thread 27642's recipe)
- **Recipe:** files in `apps/vega/assets/raw/…`, played by the plain path `/pkg/assets/raw/<file>`.
  - `/pkg/assets/raw/media/sounds/laugh-big.mp3` played to its end (5.77 s);
  - `/pkg/assets/raw/murmur.mp3` played;
  - both were audible on the null sink (−15 to −28 dB for about 13 s).
- **Fail with MEDIA_ERR_SRC_NOT_SUPPORTED:** `file:///pkg/assets/raw/…`, `asset://raw/murmur.mp3`, `asset://murmur.mp3`.
  The `[[assets]]` manifest entry was not needed (and not tried).
- **Since checked (2026-10-12):** VideoPlate plays clips from `/pkg/assets/raw/media/clips`; the Release build crashes at launch.
- Probe: `src/crowdgl/mediaProbe.js` (runs when the crowd harness mounts).

## Next steps (in order)
1. **Decide the demo route for the crowd:** the VVD can't draw the native crowd correctly (no depth buffer, no render
   targets) and has no WebView. A Fire TV device would be the first place to test either path.
2. **Release crash:** read the ACR with symbols, once `symbolicate_acr` works for the VVD or a device is available. Try a
   Release build without expo-gl and reanimated to bisect.
3. **Harness and `import.meta`:** if the harness is needed again, rewrite `import.meta.url` in an apps/vega Babel plugin
   (to `file:///pkg/assets/crowdgl/`) and add the anim clips to `crowdgl-prep.sh`.
4. **A new capture:** `docs/vega/encore-vvd-take.mp4` is from this morning, before the batching fix. Take 06:36 is in
   `~/shots/take2` on the box if a fresher one is wanted (`vvd-take.sh` writes the mp4).
5. **Stale doc text outside this note:** CLAUDE.md's Vega paragraph still says packaged media fails and the base64 voice
   is silent.

## Files added or changed on 2026-10-12
- `packages/shared-ui/src/encore/world/McVoice.vega.tsx` (URL voice, traceVoice, end timer) and `world/sound.vega.ts`
  (`mediaUris`, the fallback chain over the URLs, no MSE).
- `apps/vega/tools/babel-plugin-raw-media.js`, `tools/copy-media.mjs` (run by `build:debug` and `build:release`),
  `babel.config.js`, `package.json`.
- `apps/vega/metro.config.js` (`encore-crowdgl` by `CROWDGL`); `src/crowdgl/CrowdGl.js`, `harness/`, `off/`,
  `WorkletProbe.js`; `CrowdScreen.js` (`OFFSCREEN` false).
- `apps/vega/tools/vvd.sh` (PulseAudio without the session bus), `vvd-take.sh` (MC voice env, `cutsheet.wav`).
- Docs: dev-setup "Vega on AWS", six friction entries for 2026-10-12, product feedback (Vega, Builder Tools),
  `docs/vega/*.jpg` and the take.

## Files added or changed on 2026-10-11 (beyond the earlier report)
- `apps/vega/src/crowdgl/`: `CrowdGl.js` (switch), `OverlayProbe.js`, `CrowdScreen.js` (harness), `env.js` (browser
  shims), `mediaProbe.js`, and the `three/` package (index, renderer hook, addon re-exports).
- `apps/vega/src/App.tsx` (CROWDGL hook); `apps/vega/metro.config.js` (`three` → `src/crowdgl/three`, watches
  `prototypes/crowd3d`, `glb` assets); `apps/vega/src/spike/three` removed.
- `apps/vega/tools/`: `crowdgl-prep.sh`, `crowdgl-extract.mjs`, `crowdgl-canvases.cjs`.
- `.gitignore`: `apps/vega/assets/crowdgl/`, `apps/vega/assets/raw/`.
- `docs/friction-log.md`: two entries (GL surface over React Native views, only a Modal works, and the native crash with
  several GLViews; symbolicate_acr on the VVD).
- Box scratch tools (not in the repo): `~/tools/crowd-ref.cjs` (Chromium reference frames; `~/shots/ref/` has a clean
  close-up to compare against) and `~/tools/srcmap.cjs` (maps bundle positions through the Metro source map).
