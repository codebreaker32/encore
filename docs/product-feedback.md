# Product feedback

The rules require feedback on **every** tool, API and SDK we used, and "Strong Submission Tips" says it is weighted. Each section answers the five questions from the rules:

1. What did we use, and for what?
2. What worked well?
3. What needs work?
4. How was onboarding (zero to hello world)?
5. Would we build with it again?

Every claim points at a measurement or a dated entry in `docs/friction-log.md` (28 entries, each with steps, expected vs actual, a workaround and a suggestion). Paste each section into Devpost's feedback fields as it stands.

**AWS services used (AWS Builder):**
- **Amazon Bedrock:** GLM-5 for the MC and Ministral 3 8B for the content judge, on the OpenAI-compatible endpoint.
- **Strands Agents:** the MC agent.
- **Amazon Bedrock AgentCore:** the SDK's app serves the MC; the runtime deployment is packaged but blocked by a quota.
- **Amazon Polly:** the MC's four voices, as presigned URLs.
- **Amazon S3:** the act packs, and the media the Vega simulator's player needs.
- **Amazon EC2:** build, render, Vega simulator and Android TV emulator boxes.
- **AWS IAM:** a box role limited to Bedrock and Polly.
- **AWS Budgets and Amazon CloudWatch:** spend alarms.
- **Amazon Nova 2 Sonic:** auditioned as a voice, not shipped.

---

## Amazon Bedrock (OpenAI-compatible "mantle" endpoint)

1. **What for.** Every word the MC says, and the content judge's model estimate during a set.
   - **The MC:** GLM-5 (`zai.glm-5`) through `https://bedrock-mantle.<region>.api.aws/v1`, called by Strands' `OpenAIModel` with a SigV4-signing httpx client of our own (`services/mc-agent/src/mc_agent/sigv4.py`).
   - **The judge:** one JSON-mode call to Ministral 3 8B (`mistral.ministral-3-8b-instruct`) within a 0.35 s budget, mixed with a CPU humour model for stand-up.
   - **How we chose the models:** GLM-5 over Qwen3 235B, Kimi K2.5, GLM-4.7, GPT-OSS, Mistral Large 3 and DeepSeek V3.2, for clean English and a persona voice. The judge we chose by measurement: 1,000 held-out rated jokes, with latency timed from the TV (`docs/judge-calibration.md`).
2. **What worked well.**
   - **The OpenAI-compatible endpoint is a pleasure.** It is standard chat completions plus SigV4, so any OpenAI client works, and one region holds many open-weight models side by side, which made a fair bake-off easy.
   - **Latency suits live use.** A GLM-5 moment line took 0.47–0.62 s during a set (`docs/android-emu/2026-10-12-night/stats.txt`). Ministral 3 8B answered at p50 151 ms service-side and p90 243 ms from the TV on a kept connection (`docs/judge-calibration.md`, Results).
   - **Throttling is explicit:** at 8 parallel requests, three models returned HTTP 429, which is easy to back off on.
3. **What needs work.**
   - **New-account access is the biggest problem we hit in the whole project.** On two new accounts the Converse API answered `ValidationException: Operation not allowed` for every model (Nova, Claude, GPT, GPT-OSS) in two regions, with no reason given. Every on-demand quota was 0. `PutUseCaseForModelAccess` said to open a support case. Service Quotas rejected any request at or below the default. Support's reply ("use your current capacity first") is circular when the capacity is 0. It cost two days (friction log, 2026-10-11).
   - **The workaround was found by accident.** The OpenAI-compatible endpoint has its own non-zero quotas and served open-weight models on the same account. Nothing in the Converse error, the console or the quota pages points there.
   - **Model availability is undocumented.** The endpoint refuses Claude and GPT-5.6 with "not available for this account", and no page lists which models a new account can reach there.
   - **`GetFoundationModelAvailability` is AccessDenied** for a role that can invoke the model.
   - **Open quota requests block new ones.** Two Claude Haiku quota requests have been open since 2026-10-11, and they block new requests for other quotas (`docs/handoff/README.md`).
4. **Onboarding.** A first successful model call came on day five, through the mantle endpoint. After that, a Strands agent answering in character took under an hour.
5. **Again?** **Yes.** The mantle endpoint is the fastest way we found to run and compare many models behind one IAM story. New-account model access needs to be a first-run flow, not a support case, and Converse should say why it refuses.

## Strands Agents

1. **What for.** The MC: one fresh `Agent` per request (so no performer's words leak into another's session), with a persona system prompt and `structured_output_model` set to our pydantic `McNote`, `McReply` or `McLine`. It runs through `OpenAIModel` (mantle) or `BedrockModel` (Converse), chosen by one variable (`MC_PROVIDER`).
2. **What worked well.**
   - The API is small. Structured output validates straight into the same contract the TV uses, so a malformed answer becomes an honest `{unavailable: {reason: "model-error"}}` instead of a broken screen, and we wrote no parsing code.
   - `OpenAIModel(client=…)` accepts a pre-built client, which is how our SigV4 signing slots in without forking anything.
   - `invoke_async` ran cleanly on our own long-lived event loop with one warm connection per region.
3. **What needs work.**
   - **No per-call timeout.** A live show needs a hard deadline (3.5 s for a moment line, 8 s for a debrief), so we run every call on our own loop with a future and our own deadline (`mc.py`).
   - **The structured-output result is loosely typed.** We check `isinstance` before trusting it.
   - **SigV4 for the OpenAI-compatible endpoint** is a common Bedrock case, but we had to write the signing client ourselves. A built-in option for the mantle endpoint would replace the 55-line `sigv4.py` every project like ours has to write.
4. **Onboarding.** `uv add strands-agents` and a 30-line agent: under an hour to a structured answer.
5. **Again?** **Yes.** Small, composable, and model-agnostic in practice.

## Amazon Polly

1. **What for.** The MC's voice: Kajal (warm), Brian (sarcastic), Stephen (strict) and Matthew (deadpan) on the generative engine, with the same words on neural as a fallback, read as SSML. Only the intro, the debrief and green-room replies are spoken. The service returns a **presigned SynthesizeSpeech GET URL** (600 s), and the TV streams the MP3 itself (`voice.py`). We ran two audition rounds: 24 voice and engine combinations on the same ear-written lines (`docs/voice-samples/v2/index.md`).
2. **What worked well.**
   - **Presigned URLs are the right shape for a TV.** Signing is local (about 1 ms), so the voice costs the model's budget nothing. Synthesis streams: the first byte arrives in about 0.3 s for generative in ap-southeast-1, and under 0.1 s for neural in ap-south-1. Both the Android player and Vega's w3cmedia can play an HTTPS URL, and neither could play the base64 `data:` URI we started with.
   - **Measured on the TV:** the intro starts 0.25 s after OK, and the debrief 2.1 s after the cut sheet appears (`docs/tv-test-log.md`, round 5).
   - **SSML is well supported.** One voice ID across engines keeps a persona's identity on the fallback, `<break>` works on every engine, and SSML tags aren't billed.
3. **What needs work.**
   - **Region coverage.** Generative isn't in ap-south-1, where the rest of our stack runs (it is in ap-southeast-1), and long-form exists only in us-east-1. From India, generative in us-east-1 took 1.36–2.41 s per line, against 0.27–0.40 s for neural in ap-south-1 (friction log, 2026-10-11).
   - **`<prosody rate>` on generative voices moves in steps, not percentages.** For Matthew, Stephen and Kajal, 86–114% returns byte-identical audio to plain text, 85% is one slow step and 115% one fast step. The docs promise percentages from 20% to 200% (friction log, 2026-10-12).
   - **Brian's generative takes differ from call to call.**
   - **A docs note on writing for the ear would help.** Our "robotic" MC was our own text: Polly faithfully read "1.2 landed a minute … 0:18" as "one point two … zero colon eighteen". A short guide on numbers, times and abbreviations would save others from this.
4. **Onboarding.** Minutes with boto3. Each audition round took about an hour of scripting.
5. **Again?** **Yes.** A generative engine in ap-south-1 would let every line use the best voice.

## Amazon Bedrock AgentCore (Runtime and SDK)

1. **What for.**
   - **The SDK:** `BedrockAgentCoreApp` is the MC service's entrypoint (`POST /invocations`, kinds `debrief`, `chat`, `line` and `judge`), and it runs today on our EC2 boxes.
   - **The runtime:** prepared as a direct-code deployment in ap-south-1 (Python 3.12, arm64 wheels, no Docker; `services/mc-agent/deploy/`).
   - **A forwarding mode** (`MC_BACKEND=agentcore`, `forward.py`) would pass the TV's requests to the runtime with `InvokeAgentRuntime`, so the TV never holds a key.
2. **What worked well.**
   - The local app is a plain Starlette server: CORS for the browser preview and curl tests of every kind took minutes.
   - Direct code deployment is excellent. The zip is built on an x86 box from prebuilt aarch64 wheels in about 8 s, at 35.8 MB (82.9 MB unzipped, against limits of 250 and 750 MB). The same layout booted on the box and answered every kind with real GLM-5 and Polly.
   - The API models are precise. botocore's Stubber checks our forwarder offline (76 tests), and a test validates our create and update inputs against the control-plane model.
3. **What needs work.**
   - **We couldn't create a runtime.** `CreateAgentRuntime` fails with `ServiceQuotaExceededException: maxAgents limit exceeded`. Our account's applied quotas for agents, endpoints and versions are **0** in ap-south-1, us-east-1, us-west-2, ap-southeast-1 and eu-central-1, while the AWS defaults are 1000, 10 and 1000. Service Quotas refuses any value at or below the default, so only a console Support case can restore them, and that case is pending. The error doesn't say the quota is zero, and the quick start doesn't mention quotas (friction log, 2026-10-12). This is why the MC runs on EC2 in our demo, not on AgentCore.
   - **The deploy story for an existing project.** Both CLIs start a new project: the starter toolkit is unsupported, and the new npm CLI deploys through CDK. The plain AWS CLI route is a tab inside that walkthrough (friction log, 2026-10-11).
   - **MMDSv2 is required for invocations, but CreateAgentRuntime can't set it.** The troubleshooting page's fix fails botocore validation as printed (friction log, 2026-10-11).
   - **The docs contradict themselves** on the Transaction Search policy's `SourceArn`, on who needs S3 access to the zip, on runtime tracing, and on RuntimeClientError's status (403 on the page, 424 in the API model) (friction log, 2026-10-11).
   - **Small irritations:** the package emits pydantic and `datetime.utcnow()` deprecation warnings, and local mode has no request/response logging switch.
4. **Onboarding.**
   - **Local hello world:** under an hour.
   - **Cloud:** from the docs to a validated zip in S3, the forwarder, 76 offline tests and the deploy scripts, in one working session.
   - **The runtime:** never created, because of the quota.
5. **Again?** **Yes for the runtime model and direct-code deployment, once the quota is fixed.** New accounts need a non-zero default (or an error that says "your quota is 0, request it here"). Existing projects need one supported AWS CLI or SDK path. We didn't use AgentCore Memory: the TV keeps the last six set records itself.

## Amazon S3

1. **What for.** The act packs (`packs/v1/acts.json`, exported from the engine's `packsAsJson()`), and the licensed clips and crowd sounds the Vega simulator's player fetches over HTTPS (`packs/v1/media/`). The bucket is `encore-packs-695019458661`, with public read on `packs/*` only.
2. **What worked well.** Three CLI calls. The public-access-block granularity (block ACLs, allow a bucket policy) is exactly right for "one public prefix, everything else private".
3. **What needs work.** Nothing in S3 itself. We host media publicly only because Vega's simulator player opens nothing but HTTPS (see Vega).
4. **Onboarding.** Minutes.
5. **Again?** **Yes.**

## Amazon EC2 (build, render and simulator boxes)

1. **What for.** Everything heavy, because the development laptop's WSL has 6 GB and no KVM. All the boxes are c7i.2xlarge (8 vCPU, 16 GB):
   - a **build box** for Gradle, Metro and APKs, the MC, and the humour model;
   - a **render box** for headless-browser renders and checks of the 3D room;
   - a **Vega box** with nested virtualization for the Vega Virtual Device;
   - an **Android box** with nested virtualization for the Android TV emulator we film on.

   An idle-stop timer stops each box after 45 minutes, and an instance role limits the boxes to Bedrock and Polly.
2. **What worked well.**
   - **Nested virtualization on c7i** ran both TV emulators with KVM.
   - **Fast builds:** a clean release APK build took 4m47s, an incremental one 27 s, and the toolchain setup about 3 minutes (`docs/tv-test-log.md`; `docs/dev-setup.md`).
   - **The 720p Android TV emulator** with `-gpu host` (Mesa on the CPU) ran the 3D room at 28.4 fps on average during a recorded set (`docs/android-emu/720p-test/stats.txt`).
3. **What needs work.**
   - **Quotas shaped our architecture.**
     - The account allows 8 on-demand vCPUs in only some regions (5 elsewhere), so we ran one box per region and swap the render box for the emulator box when filming.
     - The GPU quota is 0, so the emulators render in software: 1080p gives about 15 fps, which is why we film at 720p (`CLAUDE.md`).
     - A hackathon builder will hit both limits on day one.
   - **Moving accounts isn't simple.** Moving to a new account on 2026-10-12 meant copying images region by region and re-creating roles, groups, keys and buckets by hand. There is no "copy this project to another account" path.
4. **Onboarding.** Minutes to a running box. About 3 minutes of setup script per box.
5. **Again?** **Yes.** A GPU instance would let the emulators run at 1080p, but a new account can't get one without a quota request.

## Vega SDK, React Native for Vega and the Vega Virtual Device

1. **What for.**
   - **The Fire TV build of Encore** (`apps/vega`, React Native for Vega 0.72, Vega SDK 0.24.12044, Vega CLI 1.4.4), sharing one UI package with the Android build.
   - **Media:** `@amazon-devices/react-native-w3cmedia` for the MC's voice, the crowd cues and the video plates.
   - **The 3D room:** `@amazon-devices/webview` for the live 3D room (written, gated off until it can be tested). `@amazon-devices/expo-gl` for a spike rendering the crowd natively with three.js.
   - **Input:** TVEventHandler for the remote.
   - **The VVD** on an EC2 box with nested virtualization, for testing and capture.
2. **What worked well.**
   - **Our shared React Native code ran unchanged on RN 0.72 / React 18.** That covers the custom fonts, the View-drawn QR code, the Animated cuts, the couch-link WebSocket and fetch to the MC. The first launch showed the bill exactly as on Android.
   - **Installing is quick once you know the variables.** It's unattended with `NONINTERACTIVE=true`: the CLI in seconds, the 6.2 GB SDK with the VVD in about 3 minutes.
   - **No LAN setup.** The VVD's QEMU networking (`10.0.2.2` is the host) means the relay and the MC need none.
   - **Capture works.** The emulator console's `screenrecord` gives video with the device's sound.
   - **HTTPS media plays.** w3cmedia played HTTPS media first time, with audio and video, under our overlays. The MC's presigned Polly URLs play with a `#.mp3` fragment, so the intro and the debrief are heard on the simulator. Packaged media plays from `/pkg/assets/raw/…`.
   - **expo-gl is a real WebGL 2 context.** three.js r160 rendered lighting, instancing and a skinned GLB at 42–50 fps on the simulator's software GPU.
   - **The WebGL best-practices page** was the most useful Vega doc we read: concrete (a 500-draw-call guideline, baked lighting, `antialias: false`) and honest about limits.
3. **What needs work.** In order of impact (each is a friction-log entry with steps):
   - **The x86_64 Linux VVD has no WebView,** and an app can't declare it optional: the build rewrites `[wants]` into `[needs]`. So an app that contains a WebView can't be installed without a repack, and our main visual, the 3D room, can't run on the simulator at all. This is why our demo video is filmed on the Android TV emulator. The limit is stated only on the troubleshooting page, not on the WebView overview.
   - **expo-gl on the VVD has no depth buffer** (`DEPTH_BITS 0`, while `getContextAttributes()` says `depth: true`), and rendering into a framebuffer fails (GL error 0x506). So the native fallback draws overlapping meshes wrongly: our people break into shards.
     - Worklet support isn't wired up (`enableExperimentalWorkletSupport` is ignored), so the render loop shares React's JS thread.
     - The GL surface covers every React Native view except a `Modal`, and six GLViews on one screen crash in `libgwsi.so.2`.
   - **A Release build crashes at launch on the VVD** (SIGABRT in `libapmf`/`liblcm_client`, no JS stack), so we could only measure Debug builds there.
   - **Black screen on a GPU-less host.** The VVD's default renderers give a black screen there. Only the emulator's `-gpu host` renders, and `vega virtual-device start` can't pass it.
   - **w3cmedia's source rules.** It refuses `file://`, `asset://`, `data:` and plain HTTP with `MediaError` code 4 and an empty message. Packaged media plays only from the bare path `/pkg/assets/raw/…`, which only a forum reply documents. It picks the format from the URL's extension, not `Content-Type`, and its native log prints full signed URLs.
   - **Tooling gaps.**
     - `build-kepler` keeps stale assets in `build/`: our package was 102 MB until we deleted the folder by hand (62 MB after).
     - There's no screenshot command.
     - `loggingctl` drops lines when following.
     - The Perf CLI needs `libjpeg.so.62` on Ubuntu 24.04, waits for a key press on a terminal, and records no CPU profile on x86_64.
     - The React Native CLI silently drops an app's Metro `resolveRequest`.
   - **Docs gaps.**
     - Custom fonts are documented across three doc trees.
     - The expo-gl and expo-font version tables stop at SDK 0.23.
     - The injectable key names (OK is `KEY_ENTER`) are undocumented.
4. **Onboarding.** About half a day from a bare Ubuntu box to our app on the VVD:
   - about 10 minutes for the SDK;
   - about 3 hours finding the black screen's cause;
   - about an hour on the WebView install refusal;
   - then about 4 hours over two days on media sources and the voice URL.
5. **Again?** **Yes for React Native for Vega**: one codebase ran on Vega and Android TV with only small platform files (`*.vega.tsx`). **The simulator isn't yet a stand-in for a device for graphics work.** It needs a WebView on x86_64, a depth buffer on expo-gl's surface, headless GPU-less rendering from the CLI, and Release builds that run.

## Amazon Devices Builder Tools (MCP server and Agent Skills)

1. **What for.** Installed with one `init-context` command into Claude Code (the MCP server, the `adbt-dev` agent and 19 skills) and used from the command line on the Vega box (`exec` mode):
   - `search_documentation` and `read_document`, for Vega media, expo-gl, packaging and performance;
   - the Vega skills: build and run, media player, performance;
   - `analyze_perfetto_traces` and `get_app_hot_functions`, to profile the native crowd on the simulator;
   - `symbolicate_acr`, for expo-gl's native crashes.
2. **What worked well.**
   - **The search reaches the community forum as well as the docs,** and the forum held two answers the docs lack: packaged media from `assets/raw`, and recording traces with `vega exec perf record`.
   - **`exec` mode** runs every tool from a shell, which suits a headless box and an agent.
   - **`analyze_perfetto_traces` with a custom PerfettoSQL query** turned an 8 MB trace into a per-thread CPU table in seconds. It showed that each crowd frame cost about 30 ms on expo-gl's UI thread and about 22 ms on the JS thread (`docs/dev-setup.md`, "Vega on AWS").
3. **What needs work.**
   - Every tool, even a documentation search, fails until `set_project_context` has been called.
   - `symbolicate_acr` can't symbolicate a crash from the VVD ("Failed to copy /tmp/temp_acr_debugFs/acr_libraries.txt", with no detail).
   - `get_app_hot_functions` needs a CPU profile that the Perf CLI can't record on the x86_64 simulator, and nothing says so up front.
   - The `ui_fluidity` KPI prints its whole SQL (about 12 KB) before every result.
4. **Onboarding.** One command, then a useful search within minutes.
5. **Again?** **Yes.** It is the fastest route into Vega specifics, especially the forum's answers. The profiling tools should say what works on the simulator.

## Fire TV on Fire OS / Android TV (our Android build, the Android TV emulator)

1. **What for.**
   - **The Android build of Encore:** Expo 54 and react-native-tvos 0.81, from the same shared UI.
   - **Performance testing on the cheapest hardware we have:** a 32-bit Google TV with a Mali-G31 GPU, the same GPU class as the Fire TV Stick Lite.
   - **The demo:** filmed on the **Android TV emulator** at 720p (`system-images;android-34;android-tv;x86`), as the hackathon FAQ allows.
   - **Fire OS:** sticks are Android underneath and should install the same APK. **We have no Fire TV device, so this is untested.**
2. **What worked well.**
   - **The system WebView** gave us Chromium with WebGL 2 for the 3D room, with nothing to bundle.
   - **adb on the TV is solid for measurement.** `adb reverse` reaches the relay and the MC even from WSL in NAT mode. `dumpsys gfxinfo` and `meminfo` worked, and five rounds of A/B speed sweeps measured each rendering cost on the real GPU (`docs/tv-test-log.md`).
   - **The release APK** cold-starts in 5.4 s on the Google TV.
   - **The TV emulator image with `-gpu host`** ran the full app headless on a GPU-less box.
3. **What needs work.**
   - **The Android WebView on the TV reports `innerWidth` after its own zoom** (961×541 CSS px for a 1920×1080 page), so our stage first drew a quarter of itself at 2×. We size from `documentElement.clientWidth` with `scalesPageToFit={false}`.
   - **`resizeMode="repeat"` on this TV** drew one tile and smeared its edges across the frame.
   - **react-native-video's Android player rejects `data:` URIs** (`isValidScheme`).
   - **Remote keys arrive outside React's batching** on Android TV, which once dropped the MC's intro for one render.
   - **The emulator catalogue:** there is no x86_64 Android TV image for API 33 or 34 (only x86 and arm64), and no Fire TV emulator image for Fire OS (`docs/android-emu/stats.txt`).
4. **Onboarding.** A debug build on the TV took one session. A release build that holds up on a 1.4 GB, 32-bit TV needed repeated memory tuning on the 6 GB laptop (`docs/dev-setup.md`), then built without any workarounds on an EC2 box.
5. **Again?** **Yes.** Testing on the weakest GPU first told us exactly where the frames go. A Fire OS emulator image, or a loaner stick for hackathon entrants, would let Fire TV builders test on the real target.

## Amazon Nova 2 Sonic (auditioned for the MC's voice, not shipped)

1. **What for.** Tried as a reader of the MC's checked words: a bidirectional stream with a "read verbatim" system prompt and the line as a text turn (`docs/voice-samples/v2/index.md`).
2. **What worked well.** Natural voices: the en-IN Kiara and Arjun scored the highest predicted naturalness of anything we tried for Meera. First audio arrives in about 1 s, and access worked while the Nova text models were still locked.
3. **What needs work.**
   - A text-only turn is rejected ("must have at least one audio content"), so we streamed silence.
   - boto3 has no bidirectional streaming, so we used the Node SDK.
   - `GetFoundationModelAvailability` is denied to a role that can invoke the model.
   - With a persona style it rewrote 18 of 18 lines instead of reading them; neutral styles read 21 of 21 verbatim.
   - The PCM-over-stream output can't be handed to a TV as a URL.
4. **Onboarding.** About an hour, mostly finding the event sequence.
5. **Again?** For conversation, yes. As a reader of fixed text, not yet; a verbatim TTS mode would change that.

## AmazonAppDev react-native-multi-tv-app-sample (the starter)

1. **What for.** The base of our monorepo: the Vega app's platform plumbing, Metro configuration and the Expo TV app's setup (`d435082`, 2026-10-04).
2. **What worked well.** It gave us a Vega app and an Android TV app sharing one package on day one, which is the architecture we kept. Its Metro mapping of navigation, gesture and reanimated to `@amazon-devices/*` worked unchanged.
3. **What needs work.**
   - **Peer-dependency warnings on a fresh install,** all from the sample's own packages: Expo 54 against config-tv `^51`, react-dom 19 against react-native-web `^18`, and missing Vega peers.
   - **A committed `buildinfo.json`** with the maintainer's absolute paths.
   - **A Vega app that can't typecheck the shared package under its own TypeScript 4.8:** a `types` entry that doesn't exist, and hoisting that hides `react` from the shared package. The Expo app's tsconfig `paths` catch-all silently breaks Expo's web bundling (friction log, 2026-10-06 and 2026-10-10).
4. **Onboarding.** An install in minutes; a correct cross-app typecheck took most of a day.
5. **Again?** **Yes, as a starting point,** after fixing the typecheck so the shared code is really checked against RN 0.72 / React 18.

## Claude Code (development)

1. **What for.** Research and judging rounds for the idea, the design process (product truth, direction, comps rendered with Playwright), and the build. Parallel agents built the engine, the phone listener, the TV screens, the MC, the 3D audience, the Vega port and the calibration, each against fixed TypeScript contracts and tests. Claude Code also drove the boxes, the TV over adb, and the Builder Tools from the command line.
2. **What worked well.** Parallel agents against a written contract (`packages/crowd/src/types.ts`, `messages.ts`) integrated without interface changes. Playwright with a fake microphone verified the phone's listener headless. Scripted A/B sweeps on the TV turned "it feels slow" into per-feature milliseconds.
3. **What needs work.** The auto-mode permission gate blocked an S3 public-read policy and every IAM change until the human ran them, which is right for safety but slowed the AWS steps. Long builds under WSL2 time out the tool and move to the background.
4. **Onboarding.** Already in use.
5. **Again?** **Yes.**

---

## Feature requests (optional; each goes to its product team)

Format: the request · why it matters to Encore · priority.

- **Vega Virtual Device: ship the WebView module in the x86_64 image, or let `[[wants.module]]` survive the build** so apps can degrade · our 3D room, the product's main visual, can't run on the only simulator we have · **Critical**
- **AgentCore: a non-zero default runtime quota for new accounts, and an error that names the quota** · our AgentCore deployment is blocked at `CreateAgentRuntime` · **Critical** for AWS Builder entrants
- **Bedrock: model access as a first-run flow for new accounts** (no support case for the default on-demand quotas), and a Converse error that says why · two days lost · **Critical** for AWS Builder entrants
- **expo-gl on Vega: a depth buffer on the GLView surface, working framebuffer objects, and worklet support** · a native 3D scene needs depth, and a render loop off the JS thread · **Important**
- **`vega virtual-device start --gpu <mode>`, plus `vega device screenshot` and `screenrecord`** · headless CI and demo capture on GPU-less hosts · **Important**
- **w3cmedia: accept the app's own package (`file:///pkg/…`) and `asset://`, type media by `Content-Type`, fill `MediaError.message`, and redact signed URLs in logs** · packaged media and presigned audio are basic TV needs · **Important**
- **A wake lock or "active session" API on Vega** · practice and fitness apps get no remote input for minutes, and Vega closes apps after about 5 minutes ([t/28268](https://community.amazondeveloper.com/t/28268)) · **Important**
- **Polly: generative voices in ap-south-1, and percentage `<prosody rate>` on generative (or a warning when it rounds)** · the best voice for every line, from the region the rest of our stack is in · **Nice-to-have**
- **react-native-svg on the Vega Virtual Device** ([t/29160](https://community.amazondeveloper.com/t/29160)) · we draw the QR code from Views instead · **Nice-to-have**
- **A "Custom fonts" page under the versioned Vega SDK docs** · a morning of doc archaeology · **Nice-to-have**
