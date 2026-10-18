# Box session brief: extremely real people (open mic, club, theatre), 18–19 Oct 2026

You are a Claude Code session on the AWS build box (`~/strumble`), started so work continues while the user's laptop is closed. **Work independently until 08:00 IST on Mon 19 Oct (02:30 UTC). Don't stop to ask questions:** make sensible decisions, record them, keep going. Read `CLAUDE.md`, `docs/handoff/README.md` and `docs/handoff/crowd3d.md` first (crowd3d.md has the latest notes from the two agents that worked on this before you).

## Mission
**The user's words (18 Oct):** "make the shorter venues' people extreme real."

**Scope:** the **open mic, club and theatre**. The arena is out of scope: the user found Arena v3 "nothing real" on the TV and may remove the arena. Arena v3 is parked on branch `arena-v3`; don't merge it and don't work on the arena.

**Earlier verdicts to never regress:**
- "people look handicapped, movements abnormal, curves are sharp". Fixed on 16 Oct by full-detail bodies in close-ups, FXAA, dynres, and motion v2.1 (correction layers removed, the Rocketbox captures played naturally).
- "laughs look the same". Fixed by per-venue laugh characters, casting and per-person styles.

### A. How they look (rendering and materials of the front people)
1. **Audit first:** what makes them read as CG at TV resolution (800×450 drawn, shown at 1280×720) in close-ups and mids.
   - skin: flat, plastic;
   - eyes: dead, no catchlight;
   - hair: cards, aliasing, sorting;
   - clothes: no folds or normal detail;
   - contact: no AO under the chin, collar or arms; a floating feel;
   - light: a flat key, no bounce, no rim separation.
2. **Fix within the TV budget** (Mali-G31; the club is about 23–25 fps today, and must not get slower):
   - use the Rocketbox normal and specular maps if the .glbs carry them;
   - skin: wrap lighting or a cheap subsurface approximation, a hemispheric bounce, a stage rim;
   - eye catchlights and wetness;
   - hair: alpha-to-coverage, or sorted cards;
   - AO on the front people;
   - a gentle grade, and a cheap close-up depth of field only if affordable.

   Each fix gets an `&ab=` switch, and becomes a TV default only where it's cheap.

### B. How they behave (faces and life), building on motion v2.1
1. **Faces:**
   - natural blinks, 2–10 s apart, occasional doubles, slower when attentive, with lids following the gaze;
   - saccades and fixations between the performer, neighbours and the room;
   - micro-expressions while listening (a faint smile, a brow raise at a setup, a lip press);
   - laugh faces that build and decay with the measured laugh envelope (cheeks up, eyes narrowing, the mouth opening with each "ha");
   - never a frozen face.
2. **Life while listening:**
   - breathing in the chest and shoulders;
   - small weight shifts;
   - head tilts and turns;
   - touching the face, drinking, adjusting clothes;
   - pairs who whisper or exchange a look after a bit.

   Use the Rocketbox captures where possible; otherwise small procedural layers that fade in and out. Never in sync with a neighbour.
3. **Reactions:** keep the laugh variety, with onsets following the measured reaction moment and per-person delays.

## Gates (every merge into shared code)
- The anatomy sweep, handsweep, bindcheck and handocc read **0** in all four venues.
- Packcheck is clean. The brightness gate and the edge checks pass.
- **No stiffness:** check the motion-v2 compare strips; corrections must stay minimal.
- **Texture budget:** 30 MB per venue or less.
- **Cost:** report draw calls and triangles for each venue's wide and worst close-up, before and after. Any per-frame cost increase must come with a reason and a switch.

## Where you are
- **Box:** `~/strumble` (synced from the laptop on 18 Oct, everything included). Playwright is in `~/tools/pw`. The render tools are in `prototypes/crowd3d/tools/render/`: motionstrip, layers, handocc, anatomy, handsweep.sh, bindcheck, packcheck, setupsheet, lumaall, edgeall, ttff.
- **The box is an m7i.xlarge (4 vCPUs, 16 GB)** for now, because of the account's quota. Run one heavy render job at a time, at nice 10.
- **Emulator:** `emu-box.sh start|stop|state|ip|ssh|put|get` drives the Android TV emulator box in us-west-2 (see `~/.local/bin/emu-box.sh`; build the x86 APK with `APK_NAME=<name>-emu.apk bash ~/build-apk-emu.sh`). Use it for one end-to-end check near the end (a scripted set in the club, frames and fps), then **stop it**.
- **No TV:** it's on the user's home network. Write any TV checks you want as ready-to-run commands in `prototypes/crowd3d/tools/render/tv-sweep.md`.

## Rules
- CLAUDE.md applies: the honesty rules, licensed assets only, no photos, video or flipbooks for the audience.
- **Git:** never deploy, never push to `main`. Commit each working step on a local branch `real-v1` in `~/strumble`.
- **Shell:** never `pkill -f` a pattern that's in your own command line. Never print credentials.
- **Blocked actions:** if an action is blocked, note it under "Needs the user" in the progress log and carry on.
- **Subagents and workflows:** fine, minding the 4 vCPUs.

## Deliverables (in docs/mockups)
- `real-v1-<venue>.png`: rendering, before and after; three close or mid setups plus one face close.
- `life-v1-<venue>.{png,mp4}`: a 6 s mid shot, listening then a laugh, before and after; plus a face close.
- Judge them as a skeptical viewer: does it read as a real person on a TV, or as a game character? Write that verdict honestly in the progress log.
- **Before 08:00 IST:** build a TV APK (`bash ~/build-apk.sh`; copy the result to `~/apk-out/encore-release-2026-10-19-real-arm.apk`) and the emulator APK. Write the TV checks to run.

## Progress log
Keep `docs/handoff/box-progress.md` current after every step. At the top, a 5-line status: where you are, the last result, the next step, "Needs the user", and the time (UTC). Below it, one dated entry per step, with numbers and image paths.

## The strict judge (generator and discriminator loop), added by the user 18 Oct
You are the **generator**. After every round of changes, run an independent **judge panel**, and don't count anything as done until it passes.
1. **What the judges get:**
   - **Frames:** render a fixed judge set per venue at TV resolution (800×450 drawn, shown at 1280×720): the wide, two mids, one face close, and a 6-frame strip at 0.2 s through a laugh.
   - **A held-out set:** add one randomly chosen setup and moment per venue that you did not tune on, picked fresh each round from a seed you log.
   - **Files:** save them to `docs/mockups/judge/round-NN/`.
2. **Three fresh subagents** (the Agent tool, new each round, with no memory of earlier rounds and never shown your notes or claims) get only the images plus this rubric.
   - **Their instruction:** "You are a strict visual-effects supervisor. Decide whether these frames could pass as real camera footage of a live audience on a TV. Default to 'fake' unless proven otherwise."
   - **Each judge scores 0–10:** skin, eyes and face, hair, clothes, contact and grounding, lighting, motion and life (from the strip), and overall "real footage?". Each also lists the 5 biggest tells, ranked, with the image and the region.
   - **Each judge has a distinct lens:** (a) a VFX and compositing supervisor; (b) a film director of photography; (c) an animator or motion-capture lead.
3. **Scoring:**
   - A venue's score per category is the **minimum** of the three judges, not the average.
   - **Pass** means every category is 7 or more and "real footage?" is 7 or more for that venue.
   - Log every score and the top tells in `docs/handoff/box-progress.md` (one table per round), with the image paths.
4. **The generator's next round:** fix the highest-ranked tells first, re-render the same set plus a new held-out pick, and judge again.
   - **Never game the judge:** don't crop, darken or blur to hide problems; don't change the camera to avoid a tell; don't drop the held-out set. Make sure the performance and anatomy gates still pass.
   - **Stop for a venue** when it passes twice in a row, or when two rounds in a row improve its minimum score by less than 0.5. Then move to the next venue or the weakest category.
5. **The judges can't see the TV's speed.** Keep the GPU cost honest (calls, tris, texture MB, box 8× frame time), and write the TV checks for the user in tv-sweep.md. The TV decides whether a change becomes a default.

## Judge retuned (the user, 18 Oct, about 16:00 UTC)
The "could pass as real camera footage" bar is unreachable with Rocketbox-class avatars on the TV's GPU. Rounds 00–05 held "real?" at 1–2. The user agreed to change the bar. **From the next round:**
- **The question for the judges:** "Is this a believable, alive live audience in a TV app, seen at living-room distance (a 43–55" TV, 720p, 2–3 m away)? Would a viewer accept these as real people reacting to the performer, or be pulled out by something?" Stay strict and default to "not believable" unless the frames prove otherwise.
- **The categories** (each 0–10, the venue's score being the minimum of three judges):
  1. **Life and individuality:** nobody frozen, nobody in sync, varied resting poses.
  2. **Reactions:** the timing reads as caused by the line; the laugh builds and decays; the people laughing differ from laugh to laugh.
  3. **Posture and anatomy:** natural, not stiff or twisted, no clipping.
  4. **Faces at TV distance:** expressions readable, eyes alive.
  5. **Light and mood:** coherent, flattering, depth separation, the stage look.
  6. **Artefacts:** popping, shimmer, halos, dithering, black or empty frames, aliasing. Scored as 10 minus their severity.
  7. **Overall: a believable audience?**
- **Pass:** every category 7 or more. The same held-out pick, the same no-gaming rules, the same stop rules.
- **Where the effort goes:** behaviour and light, which carry believability. The stage look may push further, with lit front faces, silhouettes and haze behind, to hide the asset limits, as long as at least the front rows read as clearly lit people. Stop spending time on skin and hair micro-detail unless a judge names it as a top tell.
- **Keep** the old "real footage?" score as one extra column for reference only. It doesn't gate anything.
- **Freeze:** as before, stop new features at 02:30 UTC on 19 Oct. Leave a clean, gated, packed tree with the TV and emulator APKs built and the final judge round logged.
