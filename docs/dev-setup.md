# Developer setup (Ubuntu on WSL2)

Tested on this machine: Ubuntu 24.04 on WSL2, Node 22 (nvm), Yarn 4.5 (corepack), Python 3.12+ with uv, about 7 GB of RAM allotted to WSL.

## 1. JavaScript workspaces

```bash
nvm install && nvm use          # reads .nvmrc (Node 22)
corepack enable                 # provides the pinned Yarn 4.5.0
yarn install
yarn test                       # couch-link, pitch-judge, practice, relay (incl. a WebSocket e2e test)
```

## 2. Phone ↔ relay on your LAN

```bash
yarn dev:relay                  # ws://0.0.0.0:8787, health check at http://localhost:8787/health
yarn dev:companion              # https://0.0.0.0:5173 (self-signed cert); /relay is proxied to the relay
```

Open `https://<your-PC-LAN-IP>:5173/?room=ABCD` on the phone and accept the certificate warning once. Phones only grant microphone access on HTTPS pages, which is why the dev server uses TLS and proxies the relay.

**WSL2 networking:** by default WSL2 sits behind NAT, so the phone **cannot** reach ports inside WSL. Pick one:
- **Mirrored networking (recommended):** in `%UserProfile%\.wslconfig` on Windows add
  ```ini
  [wsl2]
  networkingMode=mirrored
  ```
  then run `wsl --shutdown` in PowerShell and reopen the terminal. Allow TCP 5173 in Windows Defender Firewall for private networks.
- **Port proxy:** `netsh interface portproxy add v4tov4 listenport=5173 listenaddress=0.0.0.0 connectport=5173 connectaddress=<WSL-IP>` (elevated PowerShell). The WSL IP changes on every restart.

## 3. Vega SDK and the Vega Virtual Device (simulator)

Amazon documents Windows/WSL as **not tested**; the SDK wants native macOS or Ubuntu ([install docs](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html)). This machine does expose `/dev/kvm`, and other developers report getting it to work, so we try it first (open item, D1):

1. Give your user KVM access, then restart WSL:
   ```bash
   sudo usermod -aG kvm "$USER"     # then in PowerShell: wsl --shutdown
   ls -l /dev/kvm && id | grep kvm  # after reopening: you should be in the kvm group
   ```
2. If the Windows host has 16 GB or more, raise WSL memory (the simulator may crash with < 2 GB free). In `.wslconfig` under `[wsl2]` set `memory=10GB`.
3. Install the Vega SDK following the install docs above, then start the simulator (`vega virtual-device start`; if the GUI fails, try `--no-gl-accel`). On a host without a GPU the screen stays black either way; see "Vega on AWS" below for the headless setup that works (`apps/vega/tools/vvd.sh`).
4. Build and run the TV app:
   ```bash
   yarn build:vega:debug            # react-native build-kepler --build-type Debug (apps/vega)
   yarn dev:vega                    # Metro for the Vega app
   ```
5. Install the **Amazon Devices Builder Tools** MCP server into Claude Code so the coding agent knows Vega specifics ([guide](https://developer.amazon.com/docs/adbt/get-started.html)).

Known limits on the simulator, which we design around:
- **react-native-svg does not render on the SDK 0.24 simulator** ([t/29160](https://community.amazondeveloper.com/t/29160)). Draw the QR code and lanes with Views.
- **W3C media audio is unreliable on the simulator** ([t/29117](https://community.amazondeveloper.com/t/29117)). The phone plays all clicks.
- **No voice key on the simulator.** UIController voice labels can only be demoed on a physical stick.
- **The 5-minute inactivity kill** only happens on hardware, but segments are designed for it anyway.

If the simulator won't run on WSL2, the fallback is a native Ubuntu boot (USB stick or dual-boot), or building on another Ubuntu/macOS machine. Log every step in `docs/friction-log.md`.

For a quick look at the TV UI in a desktop browser (not valid for the demo video), use `yarn dev:tv-web` (port 8082; arrow keys, Enter and Backspace act as the remote). Run `yarn dev:relay` and `yarn dev:mc` alongside it; the MC service allows cross-origin requests for this preview. Add `?demo=club&t=190` or `?demo=arena&t=36` to the URL to replay a recorded set without a phone. A static build for scripted testing: `cd apps/tv-expo && npx expo export --platform web --output-dir <dir>`.

## 4. MC agent (Python, Strands, Bedrock AgentCore)

```bash
cd services/mc-agent
uv sync
uv run pytest -q                 # or from the root: yarn test:agent
aws login                        # console sign-in; the SDK reads it (needs botocore[crt], already a dependency)
# Defaults: MC_PROVIDER=mantle (Bedrock's OpenAI-compatible endpoint), MC_MODEL_ID=qwen.qwen3-235b-a22b-2507,
# MC_REGION=ap-south-1, MC_TIMEOUT_S=8. When Claude is unlocked on the account:
#   export MC_PROVIDER=converse MC_MODEL_ID=global.anthropic.claude-haiku-5-5
uv run python -m mc_agent.app    # serves POST http://localhost:8080/invocations (kinds: debrief, chat)
```

Try it (a debrief; `kind: "chat"` takes `persona`, `performer`, `question`, `history`, `lastScorecard`):
```bash
curl -s localhost:8080/invocations -H 'content-type: application/json' -d '{
  "kind": "debrief", "persona": "sarcastic", "performer": "Aman", "act": "standup", "venue": "club",
  "scorecard": {"act": "standup", "venue": "club", "durationSec": 155, "landed": 5, "candidates": 8, "landedPerMin": 3.1,
    "roomReactions": 3, "longestDeadAirSec": 4.1, "longestDeadAirAt": 125, "wpm": 172, "peakWpm": 196,
    "fillers": {"count": 7, "top": [{"word": "basically", "n": 4}]}, "inTunePct": null, "longestHoldSec": null, "unsure": 1},
  "lines": [{"t": 12.4, "landed": true, "text": "so my landlord texts me"}],
  "reactions": [{"kind": "laugh", "at": 12.9, "strength": 0.6, "why": "0.8 s beat after a 2.1 s line"}],
  "history": []
}'
```

The answer is `{"note"}`, `{"reply"}` or `{"line"}` written by the model, or `{"unavailable": {"reason"}}` (`timeout`, `no-credentials`, `model-error`, `rejected` by the honesty guard, `unreachable`). There are no rule-based answers. On account 911167912118 only open-weight models are available, through the OpenAI-compatible endpoint; Claude needs the pending quota requests and use-case support case. Before relying on Claude:
- Enable model access for the chosen model in the Bedrock console.
- Check quotas. New accounts can start at 0 ([forum 45416](https://amazonappdev2026.devpost.com/forum_topics/45416-bedrock-blocked-on-a-new-aws-account-all-model-quotas-0-not-adjustable-need-escalation)).
- Request the hackathon's $150 AWS credits before Oct 21, 12:00 PT: https://forms.gle/5hyhr1u6x3fuV2aW7

### MC on AgentCore (prepared 2026-10-11; the runtime waits on its IAM role)

The MC can run in the cloud on Amazon Bedrock AgentCore Runtime: the agent `encore_mc`, in ap-south-1 beside GLM-5 and the neural voices. It is a direct code deployment, a zip of arm64 wheels on S3 made with plain AWS CLI calls, with no Docker. Everything is in `services/mc-agent/deploy/` (README: deploy, update, roll back, delete, observability, troubleshooting).

- **The TV never holds AWS keys.** It still calls a local MC service. With `MC_BACKEND=agentcore` and `MC_AGENTCORE_ARN=<runtime ARN>`, that service validates each request and forwards it unchanged with `InvokeAgentRuntime` (`src/mc_agent/forward.py`). It signs with its own host's credentials: `aws login` on the laptop, the instance role on a box. The runtime's answer comes back byte for byte, and any failure becomes an honest `unavailable` whose detail starts with "AgentCore:".
- **Rollback:** restart the service with `MC_BACKEND=local` (the default).
- **Sessions:** one runtime session per forwarder process, so one per TV (`encore-tv-<host>-<32 hex>`, never a performer's name). It is warmed at start and after 300 s idle, and stopped on exit. Its cutoffs, 4.1 s for a line and 8.6 s for a debrief or chat, stay inside the TV's deadlines, so a slow call reads "timed out".
- **Done:** the code, with 76 offline tests (botocore's Stubber against the AgentCore model), passing on the box. The code bucket and a 35.8 MB zip are in S3; rebuild it at deploy time, because it predates the voice's move to presigned Polly URLs. The packaged layout was booted on the box and answered every kind with real GLM-5 and Polly.
- **Waiting:** the execution role `encore-mc-runtime-role` and the box's invoke policy are IAM changes for the account owner (commands in the README). After them: `deploy/agentcore.sh create <S3 version>`, then `update` (turns on MMDSv2, which create can't), a `deploy/smoke.py direct` run and the forwarders.

```bash
cd services/mc-agent
MC_BACKEND=agentcore MC_AGENTCORE_ARN=$(deploy/agentcore.sh arn) PORT=8091 uv run python -m mc_agent.app   # a forwarder
uv run python deploy/smoke.py http --url http://127.0.0.1:8091 line-intro debrief chat                        # one call per kind
```

## 5. Google TV as a development device (not for the demo video)

Aman's living-room TV is a **Skyworth "2K NSTV"**: Android TV 14 (API 34), **32-bit ARM only** (`armeabi-v7a`), **1280×720 @ 213 dpi**, **~1.4 GB RAM**. That is close to a Vega Fire TV Stick's envelope (32-bit, 1 GB, HD UI), so performance problems seen here will show up on a stick too. Fire OS is Android underneath, so the `apps/tv-expo` Android build runs on it.

It is **not** a Fire TV: the demo video must still show the Vega simulator (or a real Fire TV).

Connect (USB debugging is enabled on the TV; adb lives in `~/Android/platform-tools`, on PATH in new shells):
```bash
adb connect 192.168.1.2:5555        # the TV's DHCP address; re-check in Settings → Network if it changes
adb devices                          # should list 192.168.1.2:5555  device
adb -s 192.168.1.2:5555 shell getprop ro.product.model
```
If it shows `unauthorized`, accept the "Allow USB debugging?" dialog on the TV (tick "Always allow").

To run the TV app on it (needs the Android SDK: `cmdline-tools`, `platforms;android-36`, `build-tools;36.0.0`, `platform-tools`, under `ANDROID_HOME=~/Android`):
```bash
yarn dev:android                     # Expo prebuild + Gradle build + install on the connected TV
adb reverse tcp:8081 tcp:8081        # lets the TV reach Metro on the laptop even in WSL NAT mode
```
Expo's Android config targets SDK 34 / compiles against 36, both fine for this TV. Build for `armeabi-v7a`; the TV has no 64-bit ABI.

## 7. AWS: act packs on S3 (done 2026-10-10)

The engine's packs are exported to `packages/crowd/packs/acts.json` (`packsAsJson()`), bundled into the TV at build time, and published at `https://encore-packs-911167912118.s3.ap-south-1.amazonaws.com/packs/v1/acts.json` (public read on the `packs/` prefix only; v1.1 fetches them at launch). To re-publish after a pack change, re-run the `aws s3 cp` line. The full setup, for a new account:

```bash
B=encore-packs-695019458661   # new account since 2026-10-12 (was encore-packs-911167912118)
aws s3api create-bucket --bucket $B --region ap-south-1 --create-bucket-configuration LocationConstraint=ap-south-1
aws s3 cp packages/crowd/packs/acts.json s3://$B/packs/v1/acts.json --content-type application/json --cache-control max-age=300
# Optional public read on the packs prefix only (the file holds venue names and thresholds, nothing private):
aws s3api put-public-access-block --bucket $B --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $B --policy '{"Version":"2012-10-17","Statement":[{"Sid":"PublicReadPacks","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::'$B'/packs/*"}]}'
curl -sI https://$B.s3.ap-south-1.amazonaws.com/packs/v1/acts.json | head -1
```


### Build box on AWS (since 2026-10-11)

Heavy jobs run on an EC2 instance, not the laptop. The laptop's WSL has 6 GB and VS Code takes about 2.2 GB of it. Metro plus a headless browser crashed the VS Code window twice, and once WSL itself.

- **Instance (new account 695019458661, since 2026-10-12):** `i-00d94769515834cc3` (was `i-0df0fe12c061c31e3` in the old account), tag `Name=encore-build`, c7i.2xlarge (8 vCPU, 16 GB), Ubuntu 24.04, 100 GB gp3, ap-south-1a. The account's on-demand quota is 8 vCPUs, so it is the only instance that fits. It costs about $0.40 an hour while running.
- **Other boxes (same key, same helper with `BOX=`):** `BOX=vega` is `i-07d114648efe272ab`, `encore-vega`, us-east-1, c7i.2xlarge with nested virtualization, running the Vega SDK and virtual device (see "Vega on AWS"). `BOX=render` is `i-08db1973236712453`, `encore-render`, us-west-2, c7i.2xlarge, for crowd renders and judging (Playwright in `~/tools/pw`, no Android SDK). `BOX=android` is `i-0d647aedcf418e066`, `encore-android`, ap-southeast-1, c7i.2xlarge with nested virtualization, for the Android TV emulator (the hackathon FAQ accepts it for Fire TV). Each region's on-demand quota is 8 vCPUs, so there is one box per region. All three carry the instance profile `encore-box-profile` (role `encore-box-role`: Bedrock model access and Polly only), so the MC runs on them with real credentials.
- **Access:** SSH key `~/.ssh/encore-build.pem`; security group `encore-build-ssh` (one per region) allows port 22 only from the developer's IPs: 103.212.157.20 and 38.254.176.35 on 2026-10-11. The laptop's traffic leaves through both; `checkip.amazonaws.com` and `ifconfig.me` can disagree. Add a new address with `aws ec2 authorize-security-group-ingress` when one changes. The user approves each change.
- **Idle stop:** a systemd timer (`encore-idle-stop.timer`) stops the instance after 45 minutes with no SSH session and a quiet CPU. Its public IP changes on every start, so always go through the helper.
- **Helper:** `~/.cache/encore-box.sh start | stop | ip | ssh [cmd] | up | get <remote> <local>`. `up` rsyncs the repo to `~/strumble`, without node_modules or the generated android/ folder.
- **Toolchain** (first boot plus `~/setup.sh`): JDK 17, Node 22 with corepack, the Android SDK (platform 36, build-tools 36, NDK 27.1.12297006, CMake 3.22.1), uv, and Playwright Chromium in `~/tools/pw`. Setup took about 3 minutes.
- **Release APK:** `~/build-apk.sh` runs `expo prebuild` once, packs the crowd page into `android/app/src/main/assets/crowd/`, then a plain `assembleRelease` for armeabi-v7a. With 16 GB none of the laptop's memory workarounds are needed. Fetch the APK with `encore-box.sh get strumble/apps/tv-expo/android/app/build/outputs/apk/release/app-release.apk ~/.cache/encore-apk/` and install it from the laptop with adb.
- **Browser tests and renders:** run the Expo web server and Playwright on the box. To look at a page from Windows, forward a port with `ssh -L 8082:localhost:8082`; the browser runs on Windows, not in WSL.

### Vega on AWS: the SDK and the Vega Virtual Device on the Vega box (worked out 2026-10-11)

The laptop's WSL has no KVM access, so the VVD runs on its own instance: `BOX=vega ~/.cache/encore-box.sh` (us-east-1, c7i.2xlarge, nested virtualization on, Ubuntu 24.04, user `ubuntu` in the `kvm` and `libvirt` groups). No GPU: everything renders in software (Mesa llvmpipe), so frame rates and media decode on it are not what a stick does.

**Install (once, about 4 minutes, unattended).** The installer's variables are not on the install page (friction log):
```bash
sudo apt-get install -y jq lz4 xdotool pulseaudio pulseaudio-utils mesa-utils xvfb ffmpeg imagemagick
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh -o get_vvm.sh
NONINTERACTIVE=true SKIP_SDK_INSTALL=true bash get_vvm.sh      # the Vega CLI (1.4.4) into ~/vega
source ~/vega/env && vega sdk list-remote && vega sdk install 0.24.12044   # 6.2 GB with the VVD
vega --version
cd ~/strumble && corepack yarn install
```

**Start the VVD headless.** `vega virtual-device start` boots the device but shows a **black screen** on a GPU-less host (its default `swangle_indirect` mode, and `swiftshader_indirect` with `--no-gl-accel`); the CLI can't choose another GPU mode. `apps/vega/tools/vvd.sh up` starts Xvfb `:99` (1920×1080), a PulseAudio null sink (`vvd`, socket `~/.cache/vvd/pulse.sock`, so the device's sound can be recorded) and the SDK's emulator with the CLI's own arguments plus **`-gpu host`**, which renders correctly. It creates the instance with `vega virtual-device start --no-gui` once if none exists, waits for the launcher (about 90 s), and hides the "nested virtualization" notice. `vvd.sh down` stops it. **A running VVD keeps the load above the idle-stop threshold, so run `vvd.sh down` when done or the box never stops itself.**

**Build, install, launch.**
```bash
cd ~/strumble && corepack yarn build:vega:debug        # react-native build-kepler (deprecated name for build-vega), ~1.5 min, 3 targets
cd apps/vega && tools/vvd.sh repack && tools/vvd.sh install     # install + launch com.strumble.vega.main
```
`repack` exists because the VVD on Ubuntu has no WebView: the build adds `/com.amazon.kepler.webview_3@IWebview_3` to the package's `[needs]` (declaring it under `[wants]` is rewritten), and the install is refused with "Module dependency not found". It copies `build/private/vega/x86_64/Debug`, deletes that need from the copy's `manifest.toml` and runs the SDK's `vpt pack … --validate` into `build/vvd/encore_vvd.vpkg`. The JS is unchanged; the 3D stage stays gated off (`CROWD_STAGE_AVAILABLE`), so the WebView module never loads. Don't use the repacked package on hardware.

**Networking.** The VVD is QEMU with user-mode networking: `10.0.2.2` is the host's loopback, so the relay and the MC running on the same machine answer there with no setup (`config.ts`, `VVD_HOST`). Run them on the box beside the VVD:
```bash
cd ~/strumble && RELAY_DEBUG_ROOMS=1 corepack yarn workspace @strumble/relay start   # :8787
cd services/mc-agent && ~/.local/bin/uv sync && \
  MC_VOICE_REGION=us-east-1 MC_VOICE_PREMIUM_REGION=us-east-1 ~/.local/bin/uv run python -m mc_agent.app   # :8080, credentials from the instance role
corepack yarn workspace @strumble/relay fake-phone --room <CODE>   # the scripted phone; --room when an old room is still open
```
The MC's voice reaches the TV as presigned HTTPS Polly URLs (`McAudio.url`, `fallbackUrl`). The box is in us-east-1, where Polly has the generative and long-form engines, so both the premium voice (`MC_VOICE_PREMIUM_REGION`) and the neural fallback (`MC_VOICE_REGION`) are signed there; `uv sync` again after every `encore-box.sh up`.

**Drive, see, record.**
- `tools/vvd.sh key KEY_ENTER` is OK (React Native for Vega reports `select`); also `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_BACK`, `KEY_HOMEPAGE`. Underneath: `vda shell "inputd-cli button_press KEY_ENTER"` (`vda` is `vega which vda`).
- `tools/vvd.sh shot out.png`: a 1920×1080 screenshot from the emulator console (`screenrecord screenshot <dir>` on port 5554, token in `~/.emulator_console_auth_token`; `tools/vvd-console.py` sends any console command). The on-device `screenshooter` fails in the developer shell.
- `tools/vvd.sh record 90 out.mp4`: the console's `screenrecord start` (VP9 with the device's sound, at most 180 s), converted to H.264/AAC. Recording the null sink directly: `PULSE_SERVER=unix:$HOME/.cache/vvd/pulse.sock parecord -d vvd.monitor x.wav`.
- `tools/vvd-take.sh [dir]`: one scripted, recorded take (fake-phone, OK, about a minute live, OK, cut sheet) with screenshots, the app log and the null sink's audio; converts to `encore-vvd-take.mp4`.
- `tools/vvd.sh log [pattern]`: follows the app's log (`loggingctl log -f -v com.strumble.vega`; `journalctl` is not allowed in the developer shell, and the follow can drop lines under load).

**What runs on the VVD (2026-10-12, SDK 0.24.12044, debug build; VVD-only results on a software GPU):**
- **Works:**
  - The bill, live and cut-sheet screens at 1920×1080, with the custom fonts, the QR code and the relay.
  - The remote keys, and full scripted sets through the engine.
  - **The MC's voice:** presigned HTTPS Polly URLs. The intro and the debrief play on the generative engine with the neural URL as fallback, audible on the null sink. The URL needs a `#.mp3` fragment because w3cmedia types media by extension (`world/McVoice.vega.tsx`).
  - **Packaged media, no S3 needed:** clips and crowd sounds play from `/pkg/assets/raw/media/…`. `tools/copy-media.mjs` runs in `build:debug` and `build:release`, `tools/babel-plugin-raw-media.js` rewrites shared-ui's requires, and `world/sound.vega.ts` `mediaUris` falls back to `VEGA_MEDIA_BASE` on S3. Video decoding is in software, at 7–16 frames a second in the capture.
- **Doesn't work:**
  - The WebView (the Linux VVD has none).
  - **A Release build: it crashes at launch** (SIGABRT, no JS stack; friction log).
  - Smooth cuts: each hard cut's one-frame black lasts about 230 ms (busy JS thread).
  - `build-kepler` keeps stale assets in `build/`: run `rm -rf apps/vega/build` after changing what is packaged.

Captures are in `docs/vega/`: `encore-vvd-take.mp4` (95 s with the device's sound: packaged media and the MC's intro voice; the debrief voice plays on the cut sheet after the capture ends) and the stills.

**Native 3D crowd under expo-gl (`apps/vega/src/crowdgl/`, `CROWDGL` in `CrowdGl.js`; `null` for Encore).** It runs the unmodified `prototypes/crowd3d` modules through a browser shim (`env.js`).
- **Building it:** set `CROWDGL`, then `CROWDGL=1 corepack yarn build:vega:debug`. Without the variable, Metro maps `encore-crowdgl` to `src/crowdgl/off`, so an Encore build never bundles the prototype. A browser-only change there, such as `import.meta.url` (which hermesc rejects), can't break the app.
- **Its assets** come from `apps/vega/tools/crowdgl-prep.sh`, which needs Playwright in `~/tools/pw` with the browsers in `~/.cache/ms-playwright`. Run it after every `encore-box.sh up`, because `up` deletes them.
- **The modes:**
  - `overlay` (OverlayProbe): only a transparent `Modal` draws over a GLView. Remote keys still arrive with the Modal open.
  - `crowd` (CrowdScreen): the club at `?preset=tv`, measured per phase and written into a Modal panel on screen, because the device log drops lines.
  - `worklet` (WorkletProbe): a worklet can't reach the GL context.
- **The club on the VVD:** 6+70 people, 36–39 calls, 78–82k triangles, ready 1.3–3 s after the GL context, Hermes heap 16–20 MB. It runs at 16–19 fps with 38–46 ms of JS per frame (p95 117–158 ms) across listen, laugh, close-up and wide.
- **Blocked on the VVD:**
  - The expo-gl surface has no depth buffer (`DEPTH_BITS 0`), so the skinned front people break up in the close-up.
  - Render targets fail with GL error 0x506, so neither an offscreen depth buffer nor upscaling works.

  Frames are in `docs/vega/crowdgl-*.jpg`, with a Chromium reference close-up for comparison.
- **The spike's earlier numbers:** `src/spike/GlSpike.js` (`GL_SPIKE`) runs a box with 50 or 1,000 instances at 38–50 fps.
- **Profiling on the VVD (Perfetto, no CPU profile).**
  1. Install the Perf CLI's missing library once: `sudo apt install libjpeg62`.
  2. `record` waits for "s" on a terminal, so run it under `script`, with the app launched just after it starts:

     ```bash
     (sleep 20; printf s) | script -q -e -c "vega exec perf record --app-name com.strumble.vega.main --enable-cpu-sched --recording-timeout 45" /dev/null
     ```
  3. Read the trace (`output/<date>/iter_*_vs_trace`) with `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest exec analyze_perfetto_traces --args '{"traceFilePath":…,"appProcessName":"com.strumble.vega.main","queryType":"custom_query","customQuery":…}'`. Per-thread CPU comes from `sched` joined to `thread` and `process`.

  `--record-cpu-profiling` does nothing on x86_64, so `get_app_hot_functions` needs a device.
- **What the trace showed for the club** (50 s, 740 frames, all late for vsync):
  - expo-gl's UI thread (`Toolkit/UI`) used 22.3 s of CPU, about 30 ms a frame;
  - the JS thread used 16.1 s, about 22 ms a frame;
  - the compositor (weston) used 15.6 s.

  The JS frame callback measures about 40 ms, so it seems to wait for the UI thread's GL work. On a device the GPU takes over the rendering, but nobody has tested yet whether the two threads overlap there.

### Building the TV app for the Google TV (worked out 2026-10-11)

- **JDK 17 with a compiler.** The system Java (`/usr/lib/jvm/java-21-openjdk-amd64`) is a runtime only, and Gradle fails with "does not provide the required capabilities: [JAVA_COMPILER]". A Temurin 17 JDK lives in `~/jdks/jdk17` (downloaded from api.adoptium.net, no sudo).
- **Android SDK** in `~/Android`: cmdline-tools, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`, platform-tools.
- **Memory.** The laptop's WSL has 7.6 GB; an uncapped build (12 cores of C++ plus Gradle and Kotlin daemons) took the whole session down once and left truncated cache files behind ("Could not read workspace metadata", "Truncated class file"). Build inside a memory-capped scope on four cores:

```bash
cd apps/tv-expo && EXPO_TV=1 npx expo prebuild --platform android --no-install   # once; android/ is gitignored
cd android && export JAVA_HOME=$HOME/jdks/jdk17 PATH=$HOME/jdks/jdk17/bin:$PATH ANDROID_HOME=$HOME/Android
systemd-run --user --scope -E JAVA_HOME -E PATH -E ANDROID_HOME -p MemoryMax=3G taskset -c 0-3 nice -n 10 \
  ./gradlew assembleDebug -PreactNativeArchitectures=armeabi-v7a --no-daemon --max-workers=3 \
  -Dorg.gradle.java.home=$JAVA_HOME -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m" \
  -Pkotlin.daemon.jvmargs=-Xmx768m -Porg.gradle.parallel=false
```

- **What actually works now (since the WSL cap of 6 GB).** `~/.cache/encore-build.sh` (debug) and `~/.cache/encore-build-release.sh` (release) run Gradle on two cores with `-Xmx1408m`, the Kotlin compiler in-process and no daemon, as a systemd unit capped at 3.2 GB: `systemd-run --user --unit=encore-build -p MemoryMax=3200M -p StandardOutput=append:$HOME/.cache/encore-gradle.log /bin/bash ~/.cache/encore-build-release.sh`. `~/.cache/encore-watchdog3.sh` stops the build if Windows runs short (start it with `-E WSL_INTEROP -E WSL_DISTRO_NAME` so it can call PowerShell). Run one heavy job at a time.
- **Release build (the one to test lag on).** The debug APK streams the JS bundle and every clip and sound from Metro over adb on Wi-Fi, and runs React in development mode. That is most of the lag seen on 2026-10-11. A release APK embeds the Hermes bytecode bundle and the media, and needs only the relay and MC routes (`adb reverse tcp:8787 tcp:8787`, `tcp:18080 tcp:8080`), not Metro. Metro and Gradle together exceed the 3.2 GB cap (the first attempt was OOM-killed), so it is two steps:
  1. `systemd-run --user --unit=encore-bundle -p MemoryMax=2800M /bin/bash ~/.cache/encore-bundle.sh` runs `expo export:embed` (two workers) and `hermesc`, writing to `android/app/build/generated/{assets,res}/createBundleReleaseJsAndAssets/`, the bundle task's own output folders. It also packs the live 3D crowd page into `android/app/src/main/assets/crowd/` (`prototypes/crowd3d/tools/pack.mjs`: one classic script and an XHR fallback for `fetch`, because Chromium refuses ES modules and `fetch()` on `file://`). The app opens it as `file:///android_asset/crowd/index.html` (about 27 MB, most of it the people GLBs). For Vega, `yarn pack:crowd` writes the same page to `apps/vega/assets/crowd/` (gitignored), which the app opens as `file:///pkg/assets/crowd/index.html`.
  2. `~/.cache/encore-build-release.sh` runs `assembleRelease -PencoreSkipBundle=1`. That flag, added to the generated `android/app/build.gradle`, keeps the bundle task in the graph but disabled, and disables release lint (`lintVital*`), which on its own was OOM-killed at the 3.2 GB cap. `-x createBundleReleaseJsAndAssets` does not work: `mapReleaseSourceSetPaths` then fails with "Querying the mapped value … before task has completed".

  The APK is `app/build/outputs/apk/release/app-release.apk`, signed with the debug key; install it with `adb install -r`. Plain HTTP and WS are allowed to localhost only (`plugins/withLocalCleartext.js`, a network security config), because release builds otherwise block cleartext and every service reaches the TV through `adb reverse`. Re-add the `build.gradle` edits (`encoreSkipBundle`, and `extraPackagerArgs = ["--max-workers", "2"]` for a one-step build on a bigger machine) after any `expo prebuild --clean`.
- **Measuring on the TV.** Start the relay with `RELAY_DEBUG_ROOMS=1`, the MC, and `yarn workspace @strumble/relay fake-phone` (a scripted phone that performs a set from the TV's own `arm`). OK on the remote is `adb shell input keyevent KEYCODE_DPAD_CENTER`. Read frames with `dumpsys gfxinfo com.strumble.tv` (`reset` first) and memory with `dumpsys meminfo com.strumble.tv`.
- **If a build is ever killed mid-way**, clear `~/.gradle/caches/8.14.3`, `~/.gradle/caches/jars-9`, `android/.gradle`, `android/build`, `android/app/build` and the `build` / `.gradle` folders of the three Gradle plugins under `apps/tv-expo/node_modules` (`@react-native/gradle-plugin`, `expo-modules-autolinking/android/expo-gradle-plugin`, `expo-modules-core/expo-module-gradle-plugin`). The downloaded libraries in `modules-2` can stay.
- **Networking with WSL in NAT mode.** The TV reaches the laptop through adb: `adb reverse tcp:8787 tcp:8787` (relay), `tcp:8081 tcp:8081` (Metro), and `tcp:18080 tcp:8080` (the MC; the TV itself already listens on 8080, so `config.ts` uses 18080 on Android). The phone reaches the phone page through a Windows port proxy on the laptop's Wi-Fi address (`netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=5173 connectaddress=<WSL IP> connectport=5173` plus an inbound firewall rule for 5173).
- Addresses on 2026-10-11: TV 192.168.1.4, laptop 192.168.1.5 (DHCP; they change).
