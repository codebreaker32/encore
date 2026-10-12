# Handoff: end of 2026-10-12 (about 16:10 UTC / 21:40 IST)

The Google TV has **APK l** (`~/.cache/encore-apk/encore-release-2026-10-12-l.apk`), today's last build. No agent is running. The boxes stop themselves after 45 idle minutes. The laptop's tunnel to the build box is stopped, so the relay and MC there stop with the box. Restart them as described in "Starting again". Nothing is committed (the repo has no commits yet).

## AWS account move (done 2026-10-12, 17:00–18:00 UTC)
- **New account 695019458661** (paid plan; the default CLI profile).
- **Boxes:**
  - **Build:** `i-00d94769515834cc3`, ap-south-1. The relay, the MC and the humour model are checked: GLM-5 answered in 0.48 s and Polly signs.
  - **Render:** `i-0e1c89efaa3435fda`, us-west-2.
  - **Android emulator:** image `ami-036f586604f7ea3f7` in us-west-2. Launch it in place of render when filming, because us-west-2, us-east-1 and ap-south-1 allow 8 vCPUs and every other region only 5.
  - **Vega:** image `ami-044740824cf0cea62`, us-east-1.
  - The build and render images are `ami-0e1015630c94b5a59` and `ami-0125947e4be52017d`.
  - `~/.cache/encore-box.sh` points at the new boxes; the old helper is `encore-box.sh.old-account`.
- **Media:** bucket `encore-packs-695019458661`, with public read on `packs/*` only, and Vega's `VEGA_MEDIA_BASE` updated.
- **IAM and network:** `encore-box-role` and `encore-box-profile` (Bedrock and Polly only), plus the `encore-build` key and SSH-only `encore-build-ssh` groups in ap-south-1 and us-west-2.
- **Budgets:**
  - `encore-usage`, $150/month before credits;
  - `encore-out-of-pocket`, $5/month after credits;
  - the CloudWatch alarm `encore-estimated-charges-150`. The user must confirm the SNS email and turn on CloudWatch billing alerts.
  - The account's own `hackathon-guardrail` budget is $10.
- **Not yet in the new account:** the relay and the phone page haven't been started there; start them as in "Starting again". The APK needs no rebuild for Android (Android bundles its media); Vega's next build picks up the new bucket.
- **Quotas:** GPU and AgentCore are 0 here too. Two Bedrock Claude Haiku quota requests are open, which blocks new quota requests until AWS answers them.
- **The old account 911167912118 is empty:** every instance, disk, image, snapshot, bucket, security group, key pair and the IAM role is deleted (swept in every region). The `encore-old` CLI profile still exists.

## What APK l contains (all verified on the TV unless noted)
- **3D room by default on Android,** with the **stage look** (user-approved): a dark house, lit front rows, silhouettes and haze behind, mid shots instead of face close-ups, wider stage spill in close shots so no big dark figures near the camera. `&look=classic` for A/B.
- **Fit fixed** (the page sizes from `documentElement.clientWidth`; WebView `scalesPageToFit={false}`). **No black screens** over the stage: title cards are translucent, and `Cut` has no black frame on the stage.
- **Camera:** rotating close-ups and mid shots (5–6 setups per venue, by `laughRank`, never the last one), close-ups held ≥ 4.5 s, wides ≥ 8 s, locked off.
- **People:**
  - **Motion:** Rocketbox's own MIT motion captures (walks, seated idles, laughs, claps).
  - **Anatomy validator and clamps:** the sweep, handsweep and bindcheck are all at zero.
  - **Poses:** natural resting hands for all 12 front avatars, per-person posture styles, gaze on the performer, visible chuckles and laughing faces, varied laugh takes, the finale with standing for strong cheers.
  - **Meshes and textures:** hair at 384² (textures ≤ 30 MB per venue), clothing re-weights, contact shadows.
- **Arena:** at least 2/5 of the frame is a lit, living crowd; impostors for the far stands only (user-approved); no big screen; the floor crowd jittered and moving.
- **Sound:** a fresh laugh mix each time from a CC0 pool, and as of l, natural (±1.5% rate, a 96 kbps pool, soft onsets and tails, gentle compression, room reverb per venue, individual laughs, whoops). Samples: `docs/mockups/laugh-mix-v2-{before,after}.mp3`. **l's sound is not yet heard on the TV.**
- **MC:**
  - **Voice:** spoken lines written for the ear (no decimals or clock times); debriefs about 10 s; the intro now ends before the set starts.
  - **Memory:** keyed to the performer.
  - **Engine:** GLM-5 on Bedrock mantle; Polly generative voices Kajal, Brian, Stephen, Matthew.
- **Content judge (words on):**
  - **How it scores:** Tier 1 patterns in `packages/crowd/src/content.ts`, plus the humour model (RoBERTa, CPU) mixed 0.7 / 0.3 with ministral-3-8b.
  - **Speed:** on the TV, p50 285–315 ms, p90 366–451 ms, 0–2 late per set. The earlier lateness was a quadratic `scorecard()` stalling the TV's JS thread; fixed.
  - **Calibration:** `docs/judge-calibration.md`.
- **Product fixes:**
  - Back never exits (Android BackHandler, Vega too).
  - The relay frees a departed name after 3 s.
  - One dead-air definition is used everywhere.
  - Setups and flat poetry lines no longer react.
  - Keep-awake runs during sets.

## Open, in priority order for tomorrow
1. **Speed regressed in k/l:** about 17 fps in a club set (min 10), against about 22–24 on APK j. The likely causes are the club's near rows on the lod mesh (79k → 112k tris) and about +1 ms of motion JS. Get it back: lod only for the people actually in shot, behaviour ticks, and the cap choice (the old time cap paced better in round 5). The arena is about 15 fps; the impostors gained little because the lit floor crowd dominates.
2. **The user's two new features:**
   - **Crowd shouts:** real CC0 recordings of "come on!", "good one!", "woo!", "yes!", whistles, and "boo" or a groan only on dead bits in tough rooms, triggered by engine reactions. For poetry, "wah wah!" and "kya baat hai!" if licensed recordings exist.
   - **More expressive faces:** surprise brows, a one-sided smirk, a wince, reactions that fit the moment.
3. **Crowd realism leftovers** (independent review: club 5, open mic 5, theatre 4, arena 3 before k/l):
   - crossed legs;
   - shins and hands through chairs and tables;
   - F12's hood fin;
   - M17's sleeve, unverified in an arms-up finale;
   - aliasing (MSAA cost +12 ms on the TV, so not an option).
4. **QA of every flow:** singing (untested since the changes), the green room with voice questions, all venues and MCs, the phone page's look; a real-phone check of interim words.
5. **The demo video:** film on the Android TV emulator at 720p on BOX=android (`~/emu/emu720.sh`; about 28–29 fps, measured). The plan is in `docs/demo-video.md`.
6. **Submission:** the GitHub repo (the user creates it), the Devpost write-up and images, product feedback, the friction log (AgentCore's zero quota is logged).

## Waiting on the user
- **GitHub:** a repo, required by the rules.
- **AgentCore:**
  - **The block:** the account's applied quota is 0 in every region, while the AWS default is 1000. Service Quotas refuses the request, and a console Support case hit "quota request limit reached".
  - **Decision:** parked; product first.
  - **Friction log:** the entry is written.
- **Bedrock model access request:** the user filled the form; the text is in today's chat.

## Starting again
- **Boxes:** `BOX=build ~/.cache/encore-box.sh start`, then the relay, MC and phone page on the build box:
  - relay: `RELAY_DEBUG_ROOMS=1 corepack yarn workspace @strumble/relay start`;
  - MC: `MC_HUMOR_MODEL_DIR=$HOME/models/humor-int8 PORT=8080 uv run python -m mc_agent.app`;
  - phone page: `corepack yarn dev:companion`.

  Run each with `nohup … < /dev/null &`. Then `bash ~/.cache/encore-tv/tunnel.sh &` on the laptop.
- **TV:** `source ~/.cache/encore-tv/tv.sh` provides the helpers:
  - `guard` and `applog` start the remote-key guard and the app log;
  - `key` sends a key only when Encore is in front and nobody has used the remote;
  - `wake` sends a wake key only while the screensaver is showing;
  - `set.sh` runs a scripted set with screenshots (`FP_ARGS="--words scripts/standup-demo.json"` for words mode);
  - `sweep.sh` runs the speed sweeps.
- **TV routes:** `adb reverse tcp:8787 tcp:8787` and `tcp:18080 tcp:8080`.
- **Permissions (user, 2026-10-12):** the TV may be used whenever the user says it's free; a wake key only from the screensaver; volume keys don't stop sweeps; any other physical key does.
- **APK builds:** on the build box, `~/build-apk.sh`, which reruns the JS bundle every time. First smoke-test the crowd page with `~/tools/pw/smoke-crowd.mjs`; it prints calls, triangles and texture MB per venue.
- **After any people rebuild,** run `tools/anim/tv_morphs.mjs` (in the motion agent's box setup, which has @gltf-transform) to merge the TV face shapes back to 8. The hair stays at 384² (`tools/hair_tv.mjs`).
- **Records:** test numbers are in `docs/tv-test-log.md` (rounds 1–5); the agents' handoffs are in `docs/handoff/crowd3d.md`.
