# Handoff: end of 2026-10-12 (about 16:10 UTC / 21:40 IST)

## Sat 17 Oct: the user's decisions after seeing Arena v3 on the TV
1. **"The arena looks nothing real."** The user is leaning towards **removing the arena** and putting the time into the smaller venues (open mic, club, theatre), which "could come out pretty good". **Not removed yet**; confirm before deleting the venue (the app, the packs, the MC prompts, the docs).
2. **"Enhance and make the smaller venues' people extremely real."** This is the next priority.
- **Arena v3 (standing) is saved on branch `arena-v3`** (fetched from the box bundle; clips and the box log in `~/encore-box-save-1017/`). It's not merged into the working tree.
  - **On the TV (APK w):** &arena=2 cycle ran 21 fps (p50 47, p90 89) against the old arena's 14 fps (69 / 133); the a2cap 62k variant ran 23 fps.
  - **The box session's own G1 verdict** was "better in life", but the user's eye says not real.
- **The box Claude session is stopped;** its conversation is saved on the box (`claude --continue` in ~/strumble).
  - Claude Code is installed there, and the idle-stop counts a `claude` process as busy.
  - `~/.local/bin/emu-box.sh` drives the emulator box: IAM `emu-box-control` on `encore-box-role`, plus the SSH key `~/.ssh/emu_ed25519`.
  - The build box has the Elastic IP 13.200.70.11, allowed to SSH to the emulator box's security group.
  - Release the EIP if the project ends (it costs about $3.6 a month).
- **APKs:** the TV has APK w (arena2 in crowdtest only; the app's default is still &arena=1). APK v is the people fixes without arena2.
- **Boxes:** all stopped.

## Wrap-up, Fri 16 Oct (about 18:20 UTC / 23:50 IST)
- **User feedback (16 Oct):**
  - "people look handicapped, movements abnormal, curves are sharp";
  - "I didn't like arena at all: way too unreal, stale, a static figure of badly animated people".
- **APK v** (`~/.cache/encore-apk/encore-release-2026-10-16-v.apk`, built 18:18 UTC) has both fixes below. It's **not on the TV yet**; install it first next time and get the user's verdict on the people. (The TV still has APK t.)
- **Sharp curves** (crowd agent; `docs/mockups/shapes-v1-<venue>.png`):
  - full-detail bodies swap onto the people framed in close and mid shots at each cut (`&ab=nohibody` turns it off);
  - FXAA and dynres are the TV defaults (`&ab=nofxaa`, `&ab=nodynres`);
  - Male_Adult_17's sleeve weights are fixed at the source;
  - the "jacket shards" were the test camera's near plane;
  - close-ups now carry +9–18k tris, so watch close-up fps on the TV (round 9 in tv-sweep.md).
- **Abnormal motion** (motion agent; `docs/mockups/motion-v2-<venue>-compare2.png`):
  - Our correction layers made people stiff and twisted. Removed: the seat turns, scoot, table lean minimum, the stacked laugh layer and head-back to 30°.
  - Approved rule changes: handocc on a hand-area verdict, no "knees 10 cm under the top", crossed ankles allowed, looser resting shoulders and elbows.
  - Laughs now start phase-matched.
  - All gates at 0.
- **Arena redesign workflow** (`wf_1ebd83fc-f7e`): understand, 4 designs, 3 judges, a prototype on the box (`prototypes/crowd3d/spikes/arena-v1/`, `docs/mockups/arena-spike-v1.png`), 3 critics, final plan. Its result goes to the user for approval before any building.
- **Boxes:** all stopped.
- **Commits:** none since `d1892ff`; 44 files changed.

## Wrap-up, Wed 14 Oct (about 18:00 UTC / 23:30 IST)
- **APKs:**
  - **On the TV: APK t** (`~/.cache/encore-apk/encore-release-2026-10-14-t.apk`).
  - **Built, not yet on the TV: APK u** (`…-u.apk`). It adds `ready` only after the front people are drawn, for the user's "Playhouse front people not rendered for a few seconds". Install u first tomorrow and check the Playhouse start and venue changes.
- **APK t on the TV:** the room shows 12.2 s after launch (page first frame 7.8 s, front people 11.1 s; was 14.4 s).
- **Round 8 and round 7 on the TV (APK t):** results in `~/.cache/encore-tv/round87-results.txt` and `round7b-results.txt`.

  | Switch | fps | p50 | p90 |
  | --- | --- | --- | --- |
  | Club base | 23 | 43.8 | 62.8 |
  | Club dynres | 25 | 39.3 | 47.5 |
  | Club combo | 25 | 38.8 | 50.7 |
  | Theatre base | 19 | 45.9 | 85.1 |
  | Theatre dynres | 21 | 42.7 | 66.4 |
  | Theatre combo | 20 | 46.8 | 72.5 |
  | Arena base | 12 | 74 | 146 |
  | Arena nosprites | 23 | 40 | 65 |
  | Arena noinst | 21 | 52 | 80 |
  | Arena res360 | 17 | 59 | 121 |
  | Arena nofront | 15 | | |

  - The other arena terms (nopost, nofog, noimpostor, nostands, noglows, noroom, haze) gained 0–1 fps.
  - **Decisions:**
    - make `dynres` the tv default (the crowd agent's job);
    - the arena's cost is the floor sprites (about 60k tris) plus the instanced rows.
  - **Not yet run on the TV:** the arena candidate fixes a7-nosort, quadsprites, fan9, imphalf, floor30, rows4, rows3, mediump, fold, combo and combo-cycle. The run stopped when the user took the TV back. Run them first next TV window.
- **Club plan B merged:** hands on the table tops, 80 cm tables. handocc is 0 flickers everywhere; anatomy, handsweep and bindcheck are 0.
  - **Follow-ups for the motion agent:** walkers are now exempt from the table checks (a walk-out clips the post by about 2 cm), so make them path around it instead. The table-rim tolerance went from 2% to 5% of section depth.
- **Theatre house lifted** (`docs/mockups/theatre-house-v1.png`; `&look=stagedark` gives the old look). The user hasn't confirmed it on the TV yet.
- **The motion agent's JS cut:** unmeasured, because the box was busy. The 10 Hz calm face is in its box copy only (`~/m/stage2`).
- **AWS:**
  - the 16-vCPU Mumbai request is `CASE_OPENED`;
  - the user has a reply drafted to AWS Account Management (Kartiki Chaudhari) covering it, AgentCore quotas at 0, Claude access on Bedrock, and credits;
  - all boxes are stopped.
- **TV reminders:** 18:00, 21:00 and 22:30 IST (session-only crons; they expire after 7 days or with the session).
- **Committed:** `d1892ff` and earlier. Today's work isn't committed yet.

## Evening wrap-up (about 19:00 UTC / 00:30 IST, Wed 14 Oct)
- **The TV has APK r** (`~/.cache/encore-apk/encore-release-2026-10-13-r.apk`): q plus app-side `[crowd] page load start` and `[crowd] page …` load-breakdown logging. Encore is closed on the TV.
- **Black screens** (report: `docs/android-emu/black-2026-10-13/report.md`):
  - **Bill and launch:** `stageGate.ts` keeps the plate up until a page built for the wanted venue is ready. Verified on the TV: the plate shows from 3.5 s.
  - **Venue changes:** one reload per change (700 ms settle). The new room is ready 4.5–7 s after the key on the TV, with the plate meanwhile.
  - **Intro card:** shown over the plate.
  - **Renderer loss:** remounts the stage.
  - **The user's "black after a laugh"** was the Theatre fly-gallery wide lit as a close-up. Fixed by the crowd agent, plus a brightness gate (every setup at least 0.9 × its venue's wide).
  - **Right/bottom edge bands:** fixed (the stage fills each axis).
  - **Mid-set camera:** placed at once.
  - **Still to do:** the 2-frame plate blip on venue keys; prefetch the plates.
- **Load on the TV (no screen recording; screenrecord inflates everything):**
  - the 3D room shows about 14.4 s after launch (app about 4.7 s, page 10.8 s on APK r);
  - the crowd agent's later pack draws the room first, prefetches, and builds the front people after the first frame. It isn't measured on the TV yet.
- **Theatre set on APK r:** judge 40/41 in time; voices fine; fps p50 17, p10 15. The theatre wide stays very dark (70–80% near-black). The user said "display is not full"; not clarified yet.
- **MC venue names:** `personas.py` still had Prithvi, Wankhede and Toastmasters' Hall, and the MC said "Prithvi" on a card. They now match the packs. The new test `tests/test_houses_in_step.py` fails on any drift, and the MC on the build box was restarted.
- **Vanishing hands** (`tools/render/handocc.mjs`):
  - **Theatre:** fixed with lower armrests.
  - **Open mic and arena:** 0 flickers.
  - **Club:** in progress. Tables were moved closer (0.47) and the glasses moved to the outer sides; the motion agent owns the next step (top radius 0.31 → 0.40 in `venue.js cabaretTables`, lap hands under the top). The crowd agent holds off venue.js until that merges.
  - **Checkpoint club4: not merged.** The WIP is in `~/encore-motion-wip-club4.tgz` and the box's `~/m/stage`: TABLE_R 0.40, TABLE_D 0.40, glasses ±0.32.
  - **Knee hands under the top: 588 flickers.** The knees push the hands up through the near edge.
  - **Plan B: both hands resting on the table top: 37 flickers.** **Approved by the user (2026-10-14):** club sitters rest their hands on the table top. Next:
    1. bring the remaining 37 flickers (hands dipping in turn and shake) to 0;
    2. run anatomy, handsweep and bindcheck, plus a by-eye check;
    3. merge;
    4. the crowd agent re-runs its brightness and edge checks.
  - Three sitters' knees are still under 10 cm into the top.
- **Motion s19 merged:**
  - head-to-neighbour contact check;
  - laugh styles don't repeat;
  - seated-leg caching: Person.update about 8.2 ms at 8× (target 6, not met);
  - anatomy, handsweep and bindcheck at 0.
- **1080p filming:** a 16-vCPU Mumbai quota request is pending for our account (request id 63a2e593…). The friend's account was dropped; the user is undoing its role and image share.
- **AWS CLI:** it failed at the end with a login-cache error (`'4b85d1cc…'`). Run `aws login` before any box work. The agents reached the build box by IP (15.206.68.78); the boxes stop themselves after 45 idle minutes.
- **Nothing committed since `1222f9d`:** 97 files changed.

## Afternoon update (Tue 13 Oct)
- **Demo filming stays at 720p** on the Android TV emulator in our account (28–29 fps measured). For 1080p, a 16-vCPU box (`c7i.4xlarge`, nested virtualisation) is needed:
  - Our Mumbai standard-vCPU quota is 8.
  - New quota requests are blocked by two open Bedrock Claude Haiku cases; the user is closing them, then request 16 in ap-south-1.
  - A friend's account (with a 16 quota) was tried and dropped. The safety checks block operating there, and the user is undoing the role and the share.
- **The emulator image is copied to Mumbai:** `ami-0ebb22a63ccee7cf2` (from `ami-036f586604f7ea3f7`, snapshot `snap-0a6c54c49c98230f1`, unencrypted, 120 GB).
- **Black screens on the real TV (APK o):**
  - the bill is plain black (not the plate) until the page's first ready, which took 77 s, likely the sound pool decoding;
  - every venue change is black for 7–8 s until the next ready.

  The fixes are with the crowd agent (page) and the black-screen agent (shell). The crowdtest recordings had no black frames.
- **Motion s18 is merged and packed:**
  - anatomy, handsweep and bindcheck at 0;
  - per-person and per-venue laughs;
  - `laughCast()`;
  - 9 face shapes.

  The JS reduction didn't hold (page JS level with s17).

## Morning update (04:50 UTC / 10:20 IST, Tue 13 Oct)
- **The TV has APK n** (`~/.cache/encore-apk/encore-release-2026-10-13-n.apk`): m plus arena motion v1. Encore is closed on the TV.
- **Round 6 sweep** (APK m; `~/.cache/encore-tv/round6-results.txt`):
  - club cycle 20–21 fps (p50 43 ms); club listen 25; open mic 21–24; theatre 21.
  - **The arena is 12–17 fps** (p50 55–69 ms, p90 101–158) and GPU-bound (cpu p50 23–29 ms). The pill variants are no faster, so the arena itself is the cost. rows3 trims p90 to 101 ms.
- **Words-on club set on APK n:**
  - judge 39/41 in time (p50 308 ms, p90 483);
  - set fps p50 19, p10 16;
  - intro voiced +330 ms, debrief voiced (10.7 s);
  - no crash or black screen in the logs.
- **The user's feedback, given to the agents:**
  - Laughs look the same in every venue and every time. The cause is that everyone shares 3 Rocketbox laugh families × 2 genders.
  - **The motion agent's task 5:** a per-person repertoire of 3–5 takes, per-laugh casting by strength, a laugh character per venue, faces matched to the take, and a `laughCast()` getter for the sound pass.
  - **The crowd agent, in order:**
    1. 8–10 reaction setups per venue with a coverage style per venue, never one of the last 3, sizes varied;
    2. laugh sounds per venue and per laugh, following the cast;
    3. arena speed (round 7 A/B switches).
- **Caution: the crowd agent's half-done camera work is in the laptop tree, unpacked and partly unverified.** That's `prototypes/crowd3d/director.js` (new: 9 setups per venue, never one of the last 3, varied sizes, holds per venue) plus its `crowd.js` changes (`&ab=oldsetups` gives the old six). Finish and verify it before the next APK build: an APK built now would include it. The backup is `~/encore-crowd-wip-1013.tgz`.
- **On the build box:**
  - the relay and the MC were started for the TV (`~/svc/`);
  - the laptop tunnel is `~/.cache/encore-tv/tunnel.sh`;
  - stopped at wrap-up.

## Late update (21:05 UTC / 02:35 IST, Tue 13 Oct)
- **New APK m** (not yet on the TV): `~/.cache/encore-apk/encore-release-2026-10-12-m.apk` for the TV, and `-m-emu.apk` for the emulator. It contains the 7 emulator-QA fixes, the arena faces (v2), crowd shouts, and the club wide back on its lighter model. Install it on the TV in round 6.
- **The launch-ANR fix is verified on the emulator.** `useStageMount` mounts the stage after the bill has painted. Test: launch with the WebView's files cold and the disk capped at 3 MB/s (a cgroup cap; `~/emu/coldtest.sh` and `coldab.sh` on BOX=android), pressing D-pad keys at +2 s and +8 s:
  - l: ANR 2/2;
  - m: 0/2, first frame 0.86–1.0 s.
  - Not a valid test: with everything cold (including the app's own dex), both builds ANR before JS starts. A disk that slow fails any RN app.
- **The judge from the emulator box, with the MC in us-west-2, on APK m:**
  - **Stand-up:** 41/41 in time (TV-side p50 245 ms, p90 288 ms); the first 3 lines used the humour model alone while the LLM connection warmed.
  - **Poetry:** 8/11 in time; the 3 misses are `model-error` (unparseable JSON), not timeouts. Next: log the error detail and fix the parse or prompt.
  - **Speech:** not re-checked. My D-pad press changed the venue, so that set ran as stand-up.
  - Cut sheets: `docs/android-emu/qa-2026-10-12/after-fix/`.
- **New small bug:** after a poetry set the MC said "Take it to The Studio" while the action line said "PRESS OK TO GO AGAIN AT THE THEATRE · the MC says go up a room". The action line should say "go up" and use the act's own venue name.
- **Still open from QA:** the room goes black for 1.3–4 s after a venue change on the bill.
- **User feedback (02:30 IST):** the arena crowd's slight synced movement looks unreal.
  - **Cause:** every sprite shared one sway and shake frequency.
  - **Fix (arena motion v1, packed at 21:03 UTC into `apps/vega/assets/crowd`, not in APK m):**
    - rare per-person idle moves instead of a continuous sway;
    - laughs that ripple out from the stage with per-person delay, rate and size;
    - row-level events for the impostor blocks.
  - **Checks:** aliveprobe 0.49; anatomy 0. Strips are in `docs/mockups/arena-motion-v1-*`.
  - **Next:** judge it on a recorded clip; the instanced 3D rows may still need per-person idle variation (the motion code).
- **Faces, elbows and knees, and the JS reduction: work in progress, not merged.** The shared people.js, anim.js and .tv.glb are still build k.
  - **Where it is:** the work is on BOX=build in `~/m/stage` (frozen copy `~/m/motion-wip-1012/`), plus the laptop's `~/encore-motion-wip-1012.tgz`.
  - **Done there:**
    - Person.update is about 10 ms at 8× (s17: 16.5 ms).
    - Expressions by moment and temperament; 9 TV morph shapes, all venues ≤ 30 MB.
    - Limb validator findings are down from 1,884 to 0 in targeted re-checks.
  - **Blocking the merge:** the full anatomy sweep isn't at zero yet (new: Female_Adult_13's hand in her thigh, three floating hands, a few small ones), handsweep has 1 of 20 invalid, and bindcheck hasn't run.
  - **Then:**
    - an 8× A/B to decide between 9 and 8 face shapes;
    - render the limbs-v1 and faces-v1 sheets;
    - merge and pack.
  - Steps and commands: the end of `docs/handoff/crowd3d.md`.
- **Boxes:** all three are stopped (build, render, android).

The Google TV has **APK l** (`~/.cache/encore-apk/encore-release-2026-10-12-l.apk`), today's last build. No agent is running. The boxes stop themselves after 45 idle minutes. The laptop's tunnel to the build box is stopped, so the relay and MC there stop with the box. Restart them as described in "Starting again". The code is in the private GitHub repo `codebreaker32/encore` (initial commit `0e977e9`, branch `main`). Agents' later edits are not committed yet.

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
- **GitHub:** the private repo `codebreaker32/encore` exists. Still to decide: going public, judge or reviewer access, the LICENSE holder and the team name.
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
