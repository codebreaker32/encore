# Box session progress: extremely real people (open mic, club, theatre)

**Status (2026-10-20 02:44 UTC):** working to the user's final plan (`docs/handoff/box-*.txt`). Final deadline 18:29 UTC on 20 Oct; new work stops 16:30 UTC on 20 Oct (checklist in the log).
- **BLOCKER, needs the user (since 23:17 UTC on 19 Oct):** AWS refuses to start the emulator box: `StartInstances` (us-west-2, account 695019458661) returns *"This account is currently blocked and not recognized as a valid account … account-verification"*. Read-only calls work. A retry runs every 45 minutes (`.box/aws-check.log`); still blocked at the last try. Until it clears, nothing can run on the emulator: the final clips, the video captures (E1–E3), R1/R2/R3/R5 and the final emulator check. The judge rounds use headless stand-in clips meanwhile (15 fps, the live page's held poses).
- **Risk, needs the user:** the build box is on the same account and `real-v1` exists only here (nothing pushed; `origin` = github.com/codebreaker32/encore). Pushing the `real-v1` branch (not main) would keep a copy; that needs your go-ahead.
- **Latest gated tree:** `93dc39e` (all gates pass). Candidate APKs: `~/apk-out/encore-candidate-ef12b38-{emu,arm}.apk`, with `93dc39e`'s pair building. `004e114` (no touch-to-face fidget) is gating now.
- **Judge:** round 22 is the best so far: no glitch found in the club or open mic clips by any judge; overall 5 / 4 / 5 (club / theatre / open mic). Nothing passes the 7 bar: faces (an asset limit) and the laugh's size hold it down.
- **Needs the user:** whether `real-v1` merges to main. The demo video uses the scripted phone, disclosed on screen and in the voiceover (honesty rule 6; `docs/demo-video.md`).

**Updated:** 2026-10-20 02:44 UTC.

## Decisions
- Branch `real-v1` holds a baseline commit (`e0f6cf8`) of the tree as synced from the laptop (motion v2.1, shapes v1, the realism audit tools), so every later step diffs cleanly against it. `~/strumble-base` is a worktree of that commit, served at :8092, for "before" renders; the working tree is served at :8091.
- The motion work (brief B) runs in a subagent in its own worktree (`~/strumble-life`, :8093, branch `real-v1-life`), so its edits never disturb my renders; I merge its people.js when it gates clean. I own the rendering (brief A): crowd.js, look.js, a new real.js, the tools.
- The judge set: `tools/render/judgeset.mjs <page> <venue> <outdir> <seed>` (wide, two mids, face close, a 6-frame laugh strip at 0.2 s, a held-out setup and moment from the seed mixed with the venue). The judges' instruction and rubric are in `docs/mockups/judge/rubric.md`; each round's frames and the three judges' JSON are in `docs/mockups/judge/round-NN/`.
- All gates in one command: `tools/render/gates.sh <page> <outdir>`.

## Log

### 2026-10-18 13:05 UTC: round 00, the baseline (seed 1000)
Frames `docs/mockups/judge/round-00/` (from the baseline at :8092). Judges: (a) VFX, (b) DoP, (c) animator; scores are the minimum of the three.

| Venue | skin | eyes/face | hair | clothes | contact | lighting | motion | real? | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 2 | 2 | 2 | 3 | 2 | 4 | 3 | 2 | no |
| theatre | 2 | 1 | 2 | 2 | 1 | 2 | 2 | 1 | no |
| openmic | 3 | 2 | 2 | 3 | 2 | 3 | 3 | 2 | no |

Top tells (all three judges agree):
1. Face closes (`*-4-face.png`): waxy orange diffuse-only skin, no specular; flat painted eyes with no wet catchlight; polygonal collars; flat teeth.
2. Hands: pale white "gloves", brighter than the faces, the same cupped pose on everyone (`*-2-mid.png`, `*-3-mid.png`).
3. Motion (`*-5-strip.png`): a laugh onset moves two or three heads; no breathing, no shoulder heave, no staggered onsets; one identical resting pose per venue (hands on the table, hands on the knees).
4. Back rows: black cut-out silhouettes with no rim (the approved stage look; out of the front-people scope, noted).
5. No lens character (everything equally sharp, no bloom on practicals); speckle on skin and denim (the grain reads as dither); people float in front of the theatre's seats; the same cast in every venue and twice in a frame.

Cost (draw calls / triangles, tv): club wide 43 / 79.7k, mids 43 / 128.0k; theatre wide 38 / 97.3k, mids 38 / 112.7–115.1k; open mic wide 48 / 83.8k, mids 48 / 101.5k.

### 2026-10-18 13:19 UTC: round 01 (seed 1001): skin, eyes, hands, lens
Changes (real.js, crowd.js; each a switch):
- `realLit` on the front people's head and body materials (`&ab=noreal`): the wrapped warm terminator on skin (only where the albedo reads as skin, so caps and beanies don't get it) plus a two-lobe normalized Blinn sheen with Schlick Fresnel (F0 0.028); hands found from the hand and finger bone weights (`aReal`, computed at load) get the skin term and an albedo pulled towards the face's tone (they read as white gloves). `&ab=nospec` drops only the specular.
- Catchlights (`&ab=nocatch`): one Points draw; each eye bone sits at the eyeball's centre (checked: vertex distances 1.47–1.61 cm, constant), so a 2.5 mm point goes on the eyeball where the normal halves the directions to the key and the lens, scaled by the key's cone and the cornea's side; the lids hide it by depth. A shader-only catchlight on the 73-vertex eyeballs fell under the lids, so it was dropped.
- Lens (`&ab=nodof`): the FXAA target keeps depth as a texture and its colour gets mips; an autofocus (the front head nearest the frame's centre) and a Super 35 f/2.4 circle of confusion pick one mip level per pixel (4 taps). A gentle grade (`&ab=nograde`): 14% less saturation, a slightly cooler balance.
- Cost (draw calls / tris): +1 call (catchlights), triangles unchanged: club 44 / 79.7k wide, 44 / 128.0k mids; theatre 39 / 97.3k, 39 / 112.7–115.1k; open mic 49 / 83.8k, 49 / 101.5k. Box software GPU, wide, median ms (rendercost, relative only): club 3.4 → 5.5 (DOF off: 3.8), theatre 5.0 → 5.6 (5.1), open mic 6.7 → 5.4 (4.1, noisy). So DOF is the cost (depth texture, mips, 4 taps); it needs a TV measurement before it becomes a default on the TV (tv-sweep round, below).

| Venue | skin | eyes/face | hair | clothes | contact | lighting | motion | real? | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 2 | 2 | 2 | 3 | 3 | 4 | 2 | 1 | no |
| theatre | 2 | 1 | 2 | 3 | 2 | 3 | 2 | 1 | no |
| openmic | 3 | 2 | 2 | 3 | 3 | 4 | 3 | 2 | no |

Top tells now: (1) motion: laughs are head turns only, hands frozen (the motion agent's, in progress); (2) mouth interiors as flat grey bars, smiles without cheek lift; (3) flat, unmotivated frontal light and candles that light nothing; (4) hair cards with moire; (5) no contact shadows or AO (chin, collar, hands on tables); plus concrete bugs: a stray pink diagonal strap across a theatre seat (`theatre-2-mid.png` ~760,380), a hard rectangular light edge round a back-left figure (`theatre-6-held.png`), a half-ghosted blonde at the open mic's right edge. Held-out picks: club "tables: group house right" t 16.1; theatre "stalls: group house right" t 8.8; open mic "from the side wall" t 12.5. Frames and judges' JSON in `docs/mockups/judge/round-01/`.

### 2026-10-18 13:40 UTC: round 02 (seed 1002): AO, candles, two-pass hair, per-venue clothes
Changes (each a switch; real.js, crowd.js, tools/bake_ao.mjs):
- Per-vertex AO baked offline in the bind pose (`tools/bake_ao.mjs`: 48 cosine rays, 12 cm, against the head plus that body; 0.6–0.9 s per avatar; `people/ao/<name>.json`, 124 KB for all 12), loaded beside each .tv.glb (`&ab=noao`). The shader maps it through smoothstep(0.12, 0.92) so open skin is untouched and cavities go dark: the mouth's inside, nostrils, eye sockets, inside hoods and collars. All of the fill, 85% of the key.
- Table candles light the people at them in the club (`&ab=nocandle`, `&candle=` strength, default 0.2): a wrapped inverse-square point term in the front people's shaders, the candle's view-space position and flicker set per frame; no scene light.
- Two-pass hair (`&ab=nohair2`): the cards' core alpha-tested at 0.55, then blended at alpha > 0.02 without depth writes. Cost: one draw per front person with hair cards (+10 calls and +5.7k tris in the club, +8–10 elsewhere).
- Each avatar's clothes take a seeded hue turn of 25–55° per venue (`&ab=nocloth`), weighted by saturation, never on hands or skin-toned texels (a hue test on the albedo), so the two venues an avatar sits in show different outfits. A first try at 40–140° made lime hoodies and green jeans; narrowed.
- Test knobs: `&frontfill=` (the front people's fill), `&keypos=x,y,z` (the key's position). A house-left key and half the fill changed the faces little; not adopted.
- Cost (calls / tris): club 54 / 85.4k wide, 54 / 133.7k mids; theatre 47 / 102.9k, 47 / 118.3–120.8k; open mic 59 / 90.0k, 59 / 107.7k. Textures unchanged (the AO is a vertex attribute: about 3 KB a person on the GPU).

| Venue | skin | eyes/face | hair | clothes | contact | lighting | motion | real? | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 2 | no |
| theatre | 2 | 2 | 2 | 3 | 2 | 2 | 2 | 1 | no |
| openmic | 3 | 2 | 2 | 3 | 2 | 3 | 3 | 2 | no |

Top tells: identical hands-on-knees / hands-on-table poses and laughs that move only heads (motion agent, told); waxy faces; open mouths now "black holes with no teeth" (the AO overshoots); a bright fringe where the DOF meets the subject; people floating in front of seats with no contact; the theatre's stretched pink arms on a row-2 instance (found with `&ab=nofront`: an instanced near-band body; passed to the motion agent, who owns the bake) and a translucent row-2 torso. Held-out: club "tables: group house right" t 15.2; theatre "stalls: group house right" t 17.9; open mic "from the side wall" t 11.6. `docs/mockups/judge/round-02/`.

Honest reading: three judges agree these are Rocketbox-class game assets, and shading alone moves them by about a point at most; the 7/10 bar needs better source assets (scans, real hair) or real shadows, neither of which fits the TV's budget tonight. I keep fixing the named tells in order and say so plainly in the verdict.

### 2026-10-18 14:00 UTC: round 03 (seed 1003): teeth, DOF taps, bloom, film toe; life-v1 step 1 merged
Changes:
- Teeth keep at least 0.6 of the light (the bake had blacked them out behind the closed lips).
- DOF: four taps spread over the circle at a finer mip, taps that land on something much nearer left out (the bright fringe), the pixel's own blurred colour in the average (a dark ring when the gather was one-sided). The FXAA taps read mip 0 explicitly: implicit derivatives inside FXAA's edge-only branch picked wrong mips once the target had mips (a dark edge on every silhouette).
- Bloom from the DOF's mips (two coarse reads, thresholded) and a film toe in the grade (blacks lifted 1%, warm).
- Merged the motion agent's life-v1 step 1 (blinks 2–10 s with doubles and rapt skips, saccades to the performer, a neighbour and the room, lids following the gaze; gated by the agent: anatomy, handsweep, bindcheck, handocc 0).
- Tried and dropped: Rocketbox body normal maps at 256² (`tools/render/nmap256`): no visible fold detail at TV framing, not worth 2.1 MB of a 30 MB budget. A club `depthFloor` lift: no visible change on the silhouettes.
- The judge set's held-out picker used a weak LCG (consecutive seeds gave the same pick); now mulberry32. Round 03 was rendered after the fix.

| Venue | skin | eyes/face | hair | clothes | contact | lighting | motion | real? | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 2 | 2 | 2 | 3 | 3 | 3 | 2 | 1 | no |
| theatre | 2 | 2 | 2 | 3 | 2 | 2 | 2 | 1 | no |
| openmic | 2 | 2 | 2 | 3 | 2 | 3 | 3 | 2 | no |

Top tells: the laugh "switches on" at 12.8 s with only heads and mouths (motion); identical hands-on-knees and hands-on-table poses; faces lit flat from the lens's own direction with no source ("a softbox that isn't there"); waxy skin; back rows as cardboard silhouettes; a dark outline at the theatre jacket's edge (the model's own inner lining, not the DOF). Held-out: club "tables: group house left, from house left" t 9.8; theatre wide t 12.6; open mic wide t 16.3.

### 2026-10-18 14:35 UTC: round 04 (seed 1004): a side key, narrower skin wrap, less front fill, hand contact shadows
Changes (all switchable):
- The stage key moved 2.4 m house left and 0.4 m up from each venue's look position (the club, theatre and open mic; `&ab=nosidekey`), so faces have a lit and a shadow side from a source a viewer can place, not a flat light from the lens's direction. The skin wrap is 0.15 (was 0.35; the wide wrap flattened faces), the front people's fill 0.6 (`&wrap=`, `&frontfill=` knobs).
- Hand contact shadows on the club's table tops (`&ab=nohandshadow`): one instanced draw of soft discs where the key throws each palm's shadow, darker and tighter as the palm nears the top, gone above 15 cm (+1 call).
- After the round: DOF taps reject only *sharp* taps (a nearer person who is blurred too now spreads over what's behind, as through a lens: this was the "dark matte halo" round blurred heads), and less blur right next to the sharp subject; a cloth sheen and soft wrap on garments (`&ab=nosheen`), since Lambert falls to a dark line at a garment's outline where real fibres brighten.
- Cost: club 55 / 85.4k wide, 55 / 133.7k mids; theatre and open mic unchanged from round 03 (47, 59 calls).

| Venue | skin | eyes/face | hair | clothes | contact | lighting | motion | real? | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 2 | 2 | 2 | 3 | 3 | 4 | 2 | 1 | no |
| theatre | 2 | 2 | 2 | 3 | 2 | 3 | 2 | 1 | no |
| openmic | 3 | 3 | 2 | 3 | 3 | 4 | 3 | 2 | no |

Top tells (unchanged in substance): the laugh as a mouth swap on still bodies; identical hands-on-knees and hands-on-table poses (both the motion agent's); waxy faces; the DOF's dark halo (fixed after this round); back rows as cut-outs; theatre bodies floating above seats. Held-out: club "low across the candles: centre table" t 12.1; theatre "stalls: group house right" t 17.7; open mic "the chairs: group house right" t 13.0.

Gates: a first run meant for the merged commit actually hit port 8094, which the motion agent's dev server held (my server never bound), so its findings (openmic clap anatomy 1, club handocc 1 flicker) describe the agent's working copy, not real-v1; the agent was told. Rerun on my own frozen copy at :8191 (below).

### 2026-10-18 14:50 UTC: after round 04 (cost decision, hair, seats)
- **TV cost decision:** DOF, bloom and the hair's blended second pass run only in close and mid shots (and a harness camera). The wide, the TV's frame-rate floor, is back to the baseline's cost plus 2 calls (club wide 45 calls / 79.8k tris against 43 / 79.7k). The target makes its mips once after each allocation (a mipmapped target with none samples black: caught on the first wide), then only while the lens is on. `&ab=lenswide`, `&ab=hair2wide` put them back on the wide. The cheap shader terms stay on everywhere.
- Hair: a Kajiya-Kay strand highlight (`&ab=nohairspec`), kept faint (a stronger one read as grey hair).
- Pores: a procedural bump, invisible at 800×450 even at 25× its first strength; off by default (`&pores=`).
- Theatre seats: per-seat colour and wear (vertex colours) and a velvet sheen on red upholstery (`&ab=novelvet`); subtle at TV size.
- TV sweep round 10 written (`tools/render/tv-sweep.md`): base, old (all of real-v1 off), nodof, nohair2, noreal, nograde, nocatch per venue, with the rule for which term to drop first.
- A wiring bug: the sheen and pore switches were never passed from crowd.js, so an earlier pore A/B compared identical builds; fixed and re-tested.

### 2026-10-18 15:45 UTC: gates pass on round 04's code; life-v1 step 2 merged; round 05 (seed 1005)
- **Gates on e3271e4** (rendering through round 04 plus life step 1; frozen copy at :8191): anatomy TOTAL 0, handsweep 0, bindcheck clean, handocc 0 flickers in all four venues, brightness gate pass ×4, pack 20.2 MB, packcheck ready ×4, edge bands 0 at 962×541 and 1018×541 in all four venues.
- **Merged life-v1 step 2** (8605ace, the motion agent: breathing in the chest and shoulders, slow drift and weight shifts, laugh onsets squeezed to 0.1–0.6 s with an intake of breath and a heave on each "ha", looks between partners 1.6–3.4 s into a laugh, rare whispers, listening micro-expressions, face/hair touches, varied resting hands, and the theatre's stray arms fixed in the instanced bake; the agent's gates: all 0). Gates on the merge (6941f34) are running.
- After the round: the hair's blended pass writes depth (the DOF had read its strands as background and smeared them), and when the fringe is hidden (wides) the core's cut goes back to 0.4; harness cameras show the fringe.

| Venue | skin | eyes/face | hair | clothes | contact | lighting | motion | real? | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 1 | no |
| theatre | 2 | 2 | 1 | 3 | 2 | 2 | 3 | 1 | no |
| openmic | 2 | 2 | 2 | 3 | 2 | 3 | 4 | 1 | no |

The motion step lifted motion to 3–4 but not "real?" (1–2); judges still see laughs carried by heads and jaws, hands parked on knees or tables, and the Rocketbox faces. New concrete tells: the open mic face close's hair edge "dithered" (the fringe-depth bug above), a few remaining dark matte edges at the DOF boundary, the theatre's back stands as a grid of identical figures. Held-out: club "low across the candles" t 13.1; theatre "two-shot, centre" t 9.3; open mic "low from the riser" t 10.2.

### 2026-10-18 16:25 UTC: gates on the merge with life-v1 step 2 (6941f34, frozen copy :8191)
anatomy TOTAL 0; handsweep 0; bindcheck clean; handocc 0 flickers (area verdict) in all four venues; pack 20.2 MB; packcheck ready ×4; brightness gate pass ×4; edge bands 0 at both viewports in all four venues. One warning for the motion agent: "Person.update used 114 scratch vectors of 112" (theatre).

### 2026-10-19 04:20 UTC: round 06 (seed 1006), the retuned judge (believable audience at TV distance)
Frames from the tree at 9139949 (rendering through round 05 plus life-v1 step 2). Columns are the new categories; "real footage" is for reference only.

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 3 | 5 | 4 | 6 | 5 | 4 | 1 | no |
| theatre | 4 | 4 | 3 | 3 | 4 | 4 | 3 | 1 | no |
| openmic | 5 | 5 | 4 | 4 | 5 | 4 | 4 | 1 | no |

Top tells: the club's back of house as flat black cut-outs; laughs too small (most people hold their rest pose through the laugh, mostly heads and jaws); the theatre's rows behind the front two as standing mannequins with no seats or rake; the theatre laugh's black "hole" mouths reading as pain; open mic bodies interpenetrating in the packed rows and a back-row face smeared; identical hands-on-knees and forearms-on-table rest poses; a dark outline where the DOF meets clothing; the theatre's left block hot red under the side key. Held-out: club "tables: group house right" t 15.5; theatre "track along the front row" t 12.0; open mic "the chairs: the front from house left" t 10.8.

The box was stopped by the usage limit at about 17:00 UTC on 18 Oct (the motion agent mid step 3, uncommitted) and restarted at 04:15 UTC on 19 Oct; the user set a new freeze, 16:30 UTC 19 Oct, and the order of fixes above.

### 2026-10-19 04:35 UTC: round 07 (seed 1007): the club's house, the theatre's depth, mouths; life-v1 step 3
Changes:
- **Club back of house (the user's item 1).** The cut-outs were the haze: at 3–20 m (and 3.5–12 m in close-ups) it painted everyone behind row 2 its own colour, and no rim or house-light setting reached them through it (tested: `&rim=10`, `&hemik=40`, depth floors: no change until the fog went). Now (look.js club): haze 4–34 m wide and 4–24 m in close-ups (`fogClose`, new per-venue), a warm low house glow (hemi 21, sky 0x6a4a36), the rows falling 0.2 a row to 0.65, and the close-ups' crowd dim 0.4 (was 0.12). The rows behind read as a full room of dimly lit people in the wide and the mids; the bar crowd stays backlit. `&look=stagedark` gives the old club. (Round 07 had the first step, 0.3 / 0.45, which still left the far band black; the second step came after the round.)
- **Theatre depth (item 3, the light half):** the rows fall 0.25 a row to 0.35 (was 0.12 to 0.7, the flat lifted house) under haze at 6–32 m. The side key's shift is halved in the theatre (its house-left block ran hot red).
- Head cavities never below 0.3 of the light (laughing mouths read as black holes: "pain").
- Merged life-v1 step 3 (9bed258, the motion agent: fewer hands on the knees, more clasped; life-v1 strips).
- Test knobs (crowd.js, after the look): `&depthfloor=`, `&depthslope=`, `&hemik=`, `&sky=`, `&fogwide=`, `&fstop=`.

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 4 | 3 | 5 | 4 | 6 | 5 | 4 | 1 | no |
| theatre | 3 | 3 | 3 | 3 | 5 | 4 | 3 | 1 | no |
| openmic | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 1 | no |

Top tells: laughs carried by one to three people while the rest hold their pose (motion agent); clasped-hands-round-the-candle now the repeated club pose; theatre front rows "a police line-up" and row 2 sitting so high it reads as standing; the theatre held frame's low-LOD bodies (white chest panels, untextured grey arms on the far left); open mic bodies colliding and a face blob in row 2; the open mic's hoodie woman hanging her head "asleep"; the dark halo at DOF edges; the same avatars twice in a theatre row. Held-out: club "tables: over…" t ~; theatre "along the front row"; open mic "the chairs: …".

### 2026-10-19 05:25 UTC: gates on 61986f3 (life step 3 + the round-07 house changes before the second club step)
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, pack 20.2 MB, packcheck ready ×4, brightness pass ×4, edges 0 in club/open mic/theatre at both viewports and the arena at 962×541; the arena's 1018×541 edge run errored (an empty result under load: rerun on the final tree). The scratch-vector warning is fixed in life step 4 (pool 144). Merged life-v1 step 4 (9bc4307: laughs 40% more in the body, shoulders up at onset, theatre heads back not down, hands over faces front row only, more varied resting hands; the agent's gates all 0). Round 08 frames (seed 1008) being judged.

### 2026-10-19 05:20 UTC: round 08 (seed 1008): life-v1 step 4, the club's house in the mids
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 4 | 3 | 5 | 4 | 6 | 5 | 4 | 1 | no |
| theatre | 4 | 4 | 4 | 3 | 4 | 4 | 3 | 1 | no |
| openmic | 5 | 5 | 4 | 5 | 5 | 3 | 4 | 1 | no |

Flat against round 07 (overall 4 / 3–4 / 4). Top tells: the club laugh still "never builds" in the strip (a sip, a hand, head turns); the wide and the held frame near-identical in pose; the theatre's back half still read as cut-outs and its front row bolt upright; the DOF's dark halos round every in-focus person and comb streaks in hair (named by all three judges, every round); open mic bodies packed and overlapping.
- **Decision:** the DOF blur is off by default (`&ab=dofblur` restores it). With it off the halos and the hair streaks are gone and the faces behind read as people (compared on the open mic's held and face frames); it was also the lens's main TV cost. Bloom still uses the mips in close and mid shots.
- judgeset: the strip now holds its shot with one cut (a probe showed the camera static either way; no change in the frames).

### 2026-10-19 05:30 UTC: round 09 (seed 1009): DOF blur off, theatre and open mic close-ups keep the rows behind
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 4 | 5 | 5 | 6 | 5 | 4 | 2 | no |
| theatre | 4 | 4 | 3 | 4 | 4 | 4 | 3 | 1 | no |
| openmic | 4 | 5 | 4 | 5 | 4 | 4 | 3 | 2 | no |

Halos are no longer a top tell; hair edges in the open mic face close still are. Top tells: laughs carried by one to three people (the rest hold one pose); listening life too still (the open mic's held frame at t 10.7 "pixel-identical" to the wide at 11.8); everyone front-on and upright; the theatre's front rows under a flat flood dropping to black silhouettes behind; the open mic muddy and underexposed; blue "sparkles" (the phone glints) read as artefacts in close shots; a smeared hand near the lens in face closes. Sent the motion tells (1, 2, posture, open mic knees) to the motion agent.

### 2026-10-19 06:00 UTC: round 10 (seed 1010): the open mic's house; life-v1 step 5 merged
Changes: the open mic's house (warm glow hemi ×20, haze 4–24 m, depth fall 0.25 to 0.6, the wide at exposure 1.0, `&look=stagedark` for the old one); merged life-v1 step 5 (8300b47: the instanced seated bake leans back, elbows bent; scratch pool 256).

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 3 | 5 | 4 | 6 | 5 | 4 | 2 | no |
| theatre | 4 | 3 | 3 | 3 | 4 | 2 | 3 | 1 | no |
| openmic | 5 | 5 | 4 | 5 | 5 | 3 | 4 | 2 | no |

**Regression:** step 5's bent-elbow bake leaves detached flesh-coloured shards beside the theatre's rows 1–2 (all three judges; artefacts 2–3). `&bake=old` removes them (checked on theatre-3-mid). Sent to the motion agent as the first fix; if it isn't fixed by the final merge, I set the old bake as the default. Other tells: laughs read as turning to talk rather than laughing at the stage; front rows one pose; forearms into club tables; open mic hair stipple in the face close and a pale floating hand.

### 2026-10-19 06:22 UTC: gates on a440a7c (lighting through the open mic's house; life step 4)
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, pack 20.2 MB, packcheck ready ×4, brightness pass ×4, edge bands 0 at both viewports in all four venues.

### 2026-10-19 07:05 UTC: round 11 (seed 1011): life-v1 step 6 (shards fixed, livelier listening, laughs at the stage); edge grain lowered
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 4 | 3 | 5 | 4 | 5 | 4 | 4 | 1 | no |
| theatre | 4 | 4 | 3 | 4 | 5 | 3 | 3 | 1 | no |
| openmic | 6 | 6 | 5 | 5 | 5 | 4 | 5 | 2 | no |

The shards are gone (theatre artefacts 2 → 3–4); the open mic reaches reactions 6–7 and life 6–7 from two judges. Top tells: the club laugh still carried by one person in the strip and its wide and held frames near-identical; theatre rows 2–3 "paper dolls" at standing height and the front row in one pose; the people behind a face close read as faceted game bodies "not defocus" (the blur was off); open mic legs through legs in the packed rows, a hair seam on the afro man, a floating hand in the face close; the downlights and candles light nothing.
- After the round: the DOF blur back on at f/6 (a third of the old circle): softens the people behind a face close without the halos (checked on the club and open mic face closes and mids).

### 2026-10-19 07:33 UTC: round 12 (seed 1012): DOF at f/6, candle pools, life-v1 step 7
Changes: DOF blur back at f/6; candle pools on the club's table tops (one additive instanced draw) and the candle face term at 0.6; merged life-v1 step 7 (a22069d: heads back with the laugh, the body's share ×1.7, two-top shoulders 0.75, a cast front-row laugher at least 0.55 of a full laugh).

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 4 | 3 | 5 | 4 | 6 | 5 | 4 | 2 | no |
| theatre | 4 | 5 | 3 | 4 | 4 | 4 | 3 | 1 | no |
| openmic | 6 | 6 | 5 | 5 | 6 | 5 | 5 | 2 | no |

Flat. The club's laugh still "one person" in the strip (a probe at t 13.0 with the judge's drive: every front person has a take, but the laugh's size per person is 0–0.54 for five of six; sent to the motion agent with the numbers). New light tells: the bar's backlit shelf clips as the brightest thing in the club (dimmed to 0.6 after the round), the open mic's flat door panel and black ceiling band, laugh mouths with dark flat insides ("grimaces"), the open mic's same forward slump ten times over.

**Stop rule (brief §4):** every venue's minimum has moved less than 0.5 for two rounds in a row (rounds 10–12: club 4/4/4, theatre 3/3/3, open mic 4/5/5 overall). By the rule each venue stops as a whole; the remaining time goes to the weakest categories, which are motion (club reactions 3, theatre posture 3: the motion agent's) and artefacts, plus the end-of-session items (gates, APKs, the emulator check, the deliverables).

### 2026-10-19 07:50 UTC: emulator check (pre-final APK, tree e4ded1a + candle pools and the bar glow)
APK `~/apk-out/encore-real-v1-pre-emu.apk` (x86) on the Android TV emulator box (720p, -gpu host), then the box stopped.
- **crowdtest, club cycle, steady state:** 30 fps (the cap), p50 33.3 ms, p90 34–37 ms with every real-v1 term on; the same with `&ab=nodof`, `nohair2`, `noreal`, `nograde` and all of them off. dynres steps to 640×360 after the load jank in every variant, real-v1 on or off (the one run that held 800×450 was a warm second run), so the emulator shows no cost from real-v1; the TV decides (tv-sweep round 10).
- **Scripted club set** (a fake phone with scripts/standup-demo.json, Vik): bill → live → 3:39 set, 43 lines → cut sheet with the MC's debrief. In-app `[crowd]` fps during the set while recording the screen: 23–27 fps (46 calls / 79.8k tris on the wide, 56 / 134k on close-ups). Frames and a 60 s clip: `docs/android-emu/real-v1-2026-10-19/`.

### 2026-10-19 07:54 UTC: round 13 (seed 1013): life-v1 step 8 (the club's tables laugh with their hands), the bar glow
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 6 | 5 | 5 | 4 | 6 | 6 | 5 | 2 | no |
| theatre | 4 | 4 | 4 | 3 | 4 | 5 | 3 | 1 | no |
| openmic | 6 | 6 | 5 | 4 | 4 | 4 | 4 | 2 | no |

The club's reactions rose to 5 (3 for six rounds) and its life to 6; club light 6–7. Top tells: the club's laugh gestures read as distress (hand over an eye, hand to the temple) rather than amusement; the theatre still the weakest (a step-like laugh at t 12.6, the class-photo front row, the house as cut-outs); open mic hair dither and teeth "like braces"; a red bokeh dot and a hard diagonal line at the right edge of the club's "from the stage wing" setup. Gesture and theatre notes sent to the motion agent.

### 2026-10-19 08:28 UTC: round 14 (seed 1014): life-v1 step 9 (harder front-table laughs, no facepalms, a rippling theatre laugh); the theatre's house softened
Changes: the theatre's house (rim 0.4, was 0.85, which haloed the rows into cut-outs; falloff 0.15 a row to 0.55; haze 6–40 m); merged life-v1 step 9.

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 2 | no |
| theatre | 4 | 4 | 4 | 4 | 5 | 4 | 4 | 1 | no |
| openmic | 6 | 6 | 5 | 5 | 5 | 5 | 5 | 2 | no |

Top tells: a club man doubled over face-down on a table ("passed out"; a two-top laugh take, sent to the motion agent); theatre mouths opening in the same shape in the same frame; a row-2 instanced head reading as a flat card between front people (a LOD limit); open mic hair hatching in the face close; waxy faces; front rows square to camera.

### 2026-10-19 09:14 UTC: round 15 (seed 1015): life-v1 steps 10–11 (instanced heads turn while listening; no folding over at two-tops; each laugh its own mouth)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 5 | 5 | 4 | 6 | 6 | 4 | 1 | no |
| theatre | 3 | 4 | 3 | 3 | 5 | 5 | 3 | 1 | no |
| openmic | 5 | 6 | 5 | 5 | 5 | 4 | 4 | 1 | no |

Within the judges' noise of round 14 (one judge a point lower everywhere). The face-down man is gone. Remaining tells, all known: the theatre's rows behind read as standing; laugh mouths open without cheek raise or eye squint (the Rocketbox face rig's limit: eyeBlink and duchenne are the only upper-face morphs on the .tv models); the front rows' shared rest pose; open mic hair-card dither.

### 2026-10-19 09:19 UTC: gates on 7c44c06 (life step 9, the theatre house)
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, pack 20.2 MB, packcheck ready ×4, brightness pass ×4, edge bands 0 at both viewports in all four venues.

### 2026-10-19 09:41 UTC: deliverables rendered (tree 42c44b9)
- `docs/mockups/real-v1-<venue>.png`: before (the 18 Oct baseline) | after, five rows (three setups at the laugh's peak, a person close, a face close).
- `docs/mockups/life-v1-<venue>.mp4` (on disk only: the repo ignores docs/**/*.mp4): 6 s, listening from t 10 then a big laugh at t 12, mid shot (top) and face close (bottom), before | after, 25 fps. Frames from it: `life-v1-<venue>-frames.png` (t 11 listening, t 13 laughing). The motion agent's strips: `life-v1-<venue>.png`.
- The emulator clip `docs/android-emu/real-v1-2026-10-19/club-set-60s.mp4` is on disk only too.

## Verdict (skeptical viewer, 19 Oct)
**Does it read as real people on a TV, or as game characters?** Still as game characters, honestly, but now as a lively, well-lit game crowd rather than a frozen one. Over 16 rounds three independent judges never rated any venue above 5/10 "believable" or above 3/10 "real footage", so nothing passes the user's 7/10 bar.
- **What moved:** motion and life (club reactions 3 → 5–6; theatre 3 → 4–5; open mic 5 → 6), the rooms' light (the club's and open mic's houses read as rooms full of people, not cardboard), and the artefacts the judges caught on the way (theatre "strap" arms and shards, DOF halos, the black-hole mouths, a face-down "passed out" laugh, the blown bar backlight).
- **What didn't, and why:** the faces (waxy Rocketbox skin, mouths that open without the cheeks and eyes: the .tv models' face rig has only eyeBlink and a "duchenne" morph for the upper face), the hair cards' hatched edges in face closes, the same twelve avatars in every venue, and the theatre's raked rows reading as standing. Those are the asset class, not tuning; the next real step is better source assets (a face rig with cheek and squint shapes, strand-card hair, more avatars) or fewer face closes.
- **What a viewer will notice first on the TV:** the club and open mic look like busy, warm rooms that laugh; the theatre looks like a lit front block in front of a dark rake. Face closes are the weakest shots in every venue.

### 2026-10-19 10:20 UTC: final gates on 99a5956 (all life-v1 steps, all rendering changes)
anatomy TOTAL 0; handsweep 0; bindcheck clean; handocc 0 flickers in all four venues; pack 20.2 MB; packcheck ready ×4; brightness gate pass ×4; edge bands 0 at 962×541 and 1018×541 in all four venues (the arena's 1018 run rerun alone after an empty result under load). Textures: club 29.5, theatre 28.6, open mic 29.8, arena 25.7 MB (≤ 30).

### 2026-10-19 10:27 UTC: final APKs and emulator check (tree 99a5956)
- TV: `~/apk-out/encore-release-2026-10-19-real-arm.apk` (armeabi-v7a, 128 MB; the packed crowd page carries real.js, the AO files and the candle pools). Emulator: `~/apk-out/encore-release-2026-10-19-real-emu.apk` (x86/x86_64).
- Emulator (720p, -gpu host), crowdtest cycle per venue: steady 30 fps (the cap) in club, theatre and open mic, with dips to 26–29 at cuts and one 14–17 during load; frames `docs/android-emu/real-v1-2026-10-19/final-crowdtest-3venues.png`. The emulator box is stopped.
- Branch `real-v1` is local only (never pushed); `real-v1-life` (the motion agent's) is fully merged into it. Worktrees on the box: `~/strumble-base` (baseline), `~/strumble-life`, `~/strumble-gate` (frozen gate copy); servers on 8091/8092/8093/8191 (and the motion agent's dev copy on 8094) can be stopped.

## Session 3 (19–20 Oct): smooth laughs and the final plan

### 2026-10-19 12:52 UTC: new instructions
- `~/laughfix.txt` (the TV report: "the movement while they laugh is way too unreal and glitchy"; TV round 10: real-v1 costs 2–5 fps, club 21 vs 23 with noreal, open mic 19 vs 22, theatre 17 vs 22) and `~/final-plan.txt` (the plan above). The judge now also watches emulator clips: any visible pose jump, pop, snap, flicker or black frame fails the venue.
- "Before" clips recording on the emulator box (APK `encore-release-2026-10-19-real-emu.apk`, a words-on stand-up set via the fake phone with `scripts/standup-demo.json`, 85 s per venue from go-live).

### 2026-10-19 12:55 UTC: the win plan
`~/win-plan.txt` (read 12:52 UTC): steer the remaining work by the hackathon's judging criteria (tech implementation incl. the AWS Builder challenge, design, potential impact, quality of the idea; the friction log bonus; judges score the video, description and images). A submission worker takes `docs/demo-video.md` (shot list and voiceover), `docs/devpost.md` (impact, why creative, measured numbers), `docs/friction-log.md` and `docs/product-feedback.md`; the full app flow on the emulator with sound is checked by me (one shared emulator box) and its findings handed to that worker.
- Done: real-v1's rendering pass off by default (`b8e44ff`; `&ab=real` brings it back).
- Workers (each in its own worktree and branch, merged only when gates pass): theatre rows `~/wt-theatre` (fix-theatre, :8095), open mic overlap and the back-row face `~/wt-openmic` (fix-openmic, :8096), club back-of-house `~/wt-club` (fix-club, :8097). The laugh motion is mine, in `~/strumble` (:8091).

### 2026-10-19 13:45 UTC: laugh-v2 (`4e1a145`), the TV's "unreal and glitchy" laugh
**Audit.** What life-v1 step 2 and the laugh styles put on top of the Rocketbox laugh captures, and what each did on screen:
- a chest heave, a shoulder bounce, a head bob and a lean bounce on every "ha" (4–5.6 Hz), and the bouts' pumping of the whole laugh level;
- an intake of breath at the start: head and shoulders up over 0.14 s;
- a nod at the start (`sin(10 t)`) that began and ended mid-swing;
- two or three procedural rocks stacked on the capture's own rock;
- front-row onsets squeezed to 0.1–0.6 s with attacks capped at 0.35 s;
- partner looks eased over 0.3 s;
- the "ha" pulse jumping from mid-value to 0.3 at every bout's end, so the mouth and shoulders popped.

Outright glitches:
- a person flipped between two overlapping laughs' takes frame by frame (style, capture and start all switched);
- a laugh leaving the room's list cut its capture off;
- the instanced rows re-seeded each person's head roll per laugh (up to 16° in one frame) and pumped their baked laugh pose on each "ha".

**The probe.** `tools/render/jumpprobe.mjs`: 20 s at 30 fps of a host-driven stretch of set (six laughs, some overlapping), measuring each front person's major bones' world turn per frame. The arm pass itself, not only the laugh, swung whole arms:
- 105° in one frame when a short clap ended;
- 36–55° when a hand-to-chest elbow flipped sides;
- resting arms (clasped hands) oscillating between two IK answers every frame, 20–25° at the hand.

**Changes** (default; `&laugh=old` restores all of it):
- The laugh is the capture's, played smoothly.
- The level eases in and out (filters of about 0.3 s up and 0.5 s down; front attacks 0.45–0.7 s; onsets spread over 0.15–0.95 s, theatre to 1.25 s).
- No per-"ha" body motion: only the mouth keeps the rhythm, at a smaller swing, eased at the bout edges.
- No intake toss, no start nod, no extra rocks; slower, smaller partner looks.
- A person keeps the laugh they're in unless another is clearly bigger, and holds it while it fades.
- A new take's capture cross-fades over 0.8 s.
- Posture angles are low-passed over 0.1 s.
- The arm chain and the upper torso turn at most 330° per second; outside claps and raised arms, the arms are eased over 0.1 s.
- Instanced rows: a quarter of the "ha" bob, an eased level, one baked take held for the whole laugh, and no per-laugh phase.

**Probe results, frames with a bone turning more than 15° in one frame (20 s):**

| Venue | before (`&laugh=old`) | after |
|---|---|---|
| club | 44–49 (worst 105°) | 7 (worst 19°) |
| open mic | 143–303 (8–20 s runs) | 23 (worst 21°) |
| theatre | 73 | 33 (worst 20°) |

Turns over 8° also fell by two thirds or more. What's left is mostly two people's clasped hands, still flipping now and then.

### 2026-10-19 17:30 UTC: workers merged; laugh-v2 gates
- Merged `fix-openmic` (chairs 0.56 m apart on the arcs, `&ab=omtight`; the "broken back-row face" was a front woman's hair bun over the mouth of the man behind), `fix-theatre` (seat backs 0.17 m taller from row 1, lit top rolls, falloff 0.1 a row to 0.45; `&ab=lowbacks,nocaps,oldfall`), `fix-club` (per-vertex house, sconce and candle light on the instanced back-of-house, per-person variation, falloff to 11.5 m; `&ab=flatback`). Each worker's gates: all 0 / pass (two arena edge runs timed out under load and passed re-run alone). Draw calls equal or lower.
- The gates on laugh-v2 (`4e1a145`) failed: anatomy 66 findings, bindcheck 2 runs, handocc club 9 flickers. Cause: the arm and torso rate limits ran after the anatomy fixes and undid them. Reworking.
- The user's note: the session sat for hours on a permission prompt for a file outside the repo. From now on every file I use lives in `~/strumble` (`.box/` for scratch, git-ignored), and the plans are read from `docs/handoff/box-*.txt`.

### End-of-run checklist (from 16:30 UTC on 20 Oct; deadline 18:29 UTC)
1. Stop new work. Final gates on the final tree, all 0 / pass.
2. Final judge round (three fresh judges, min score, held-out pick), with emulator clips; any visible glitch fails the venue.
3. Build `~/apk-out/encore-final-emu.apk` and `~/apk-out/encore-final-arm.apk`.
4. Final emulator clips per venue: `docs/mockups/final-<venue>.mp4`.
5. `docs/handoff/box-video-capture.txt`: record the capture plan in `docs/demo-video.md` on the final emulator APK into `docs/android-emu/2026-10-20-final/`, with stats.txt per take, and fill R1, R2, R3 and R5. **E2 first** (the stand-up hero set at the comedy club, sarcastic MC, words on, through the finale, debrief and green room, 2–3 takes), then E1 (the bill and venue tour, 2 takes), E3 (poetry at the theatre, 1 take) and the stills. Watch each take for glitches and mark the best take in a README there. Never use the emulator box while the video agent does (`pgrep -f emu720` on the box).
6. A "ready for the video" summary at the top of this file. Stop the emulator box (only when the video agent isn't using it).

### 2026-10-19 17:55 UTC: round 16 (seed 1016)
Frames are the merged tree (`e9eb261`: laugh-v2 with the gated arm easing, and the open mic, theatre and club fixes). The clips are the emulator recordings: before = the 19 Oct real APK, after = the first laugh-v2 build (`4e1a145`). Clip strips (45 consecutive frames after each cut) are in `round-16/clips/`. Minimum of three fresh judges (VFX, DoP, animator):

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 4 | 5 | 4 | 6 | 2 | 3 | 2 | no |
| theatre | 3 | 3 | 3 | 4 | 5 | 3 | 2 | 1 | no |
| openmic | 4 | 4 | 4 | 2 | 5 | 1 | 2 | 2 | no |

- **Glitch fails:**
  - A full-screen grey "flash" on every laugh cut in every venue, in both builds, lifting the blacks, letterbox and captions in one frame. It was the TV app's `LightPulse` (a gold wash to 0.18 over the whole screen), not the 3D room.
  - Open mic (after): a woman's eyes go blank white while her hand is at her chin, then snap back in one frame.
  - Open mic (after): one head turning about 25° between two frames. The emulator draws at 15–20 fps, so a 330°/s limit still allows that.
- **Motion:** all three judges found the after laugh smoother (no arm snaps; the old build's hoodie man swung an arm over his neighbour's shoulder in one frame), but too damped to read as laughter.
- **Theatre:** in the overhead laugh shot most heads bow to the lap, and one woman's head goes far back (a "broken neck").
- **Known asset limits:** waxy faces, dithered hair edges.
- **Fixes after the round:**
  - `LightPulse` is off over the live 3D room (the room lights its own laughs; tv-expo and vega typecheck clean);
  - the laugh capture plays 1.35× bigger, with a chest and shoulder heave per bout (eased, about 1 Hz) and the mouth's full swing back;
  - front onsets 0.1–0.65 s again (theatre 1.0 s);
  - head and neck turns limited to 180°/s.

### 2026-10-19 20:15 UTC: video findings fixed; laugh-v2 gates; the app flow on the emulator
- **Video findings** (`docs/handoff/box-video-findings.txt`):
  1. **The MC said "Prithvi".** The emulator box's `~/strumble` was the old 13 Oct checkout with local changes. I stashed them (`stash@{1}`, plus the untracked files in `stash@{0}`, nothing lost) and moved it to `real-v1` (`361cc81`) from a git bundle. `yarn install` and `uv sync --group humor` there; `test_houses_in_step.py` passes; no "Prithvi", "Wankhede" or "Toastmasters" in the MC or crowd source. svc.sh restarted from it.
  2. **"THE END" text over the LIVE line.** The top-right LIVE block is now at most 520 wide, its small line wrapping right-aligned. The top-left caption ends 640 from the right edge, so they no longer meet.
  3. **The heckle's MC line never showed.** The MC answered every heckle in about 0.5 s (box MC log), but the engine only put words up while the wide was on and the performer quiet. The scripted phone starts its next bit at once, so the line always expired as "late" after 4 s. A heckle's words now go up at once, even while the performer talks (a heckler doesn't wait for a pause); other cards still wait for quiet. Engine change and test in `packages/crowd`: 110/110 tests pass; tv-expo and vega typecheck clean.
- **laugh-v2 gates.** I bisected with `&lv2off=` to find what broke them:
  - the club's flickers came from easing hands planted on a table top: those are no longer eased;
  - the theatre's bind pose came from the arms eased past the bind direction while a seated woman moved from a talk gesture to a rest: such a frame now takes the arms as solved.
  - The arm easing applies only to seated people (not while standing, walking or putting a coat on). The 1.35× capture and the bout heave are skipped at two-tops.
  - Checked one at a time on `1b9398f`: handocc club 0, bindcheck clean, anatomy 0 (on `361cc81`). Full gates (g4) are running.
- **The full app flow on the emulator, with sound** (APK `encore-laugh-v2c-emu.apk`, tree `6e3b140`):
  - bill → words-on stand-up set at the club with the sarcastic MC (scripted phone, 43 lines, 3:39) → cut sheet with the debrief → green room;
  - no black screens; the intro voice started 69 ms after it was queued and the debrief voice played (13.5 s, generative); the crowd ran at 24–28 fps during the set (26–29 calls);
  - contact sheet: `docs/android-emu/2026-10-19-flow/flow-f1-contact.jpg`.
  - No heckle came in this run (dead bits weren't forced); E2 will cover it.

### 2026-10-19 21:20 UTC: round 17 (seed 1017)
Frames are `e558dd5`. The clips are the emulator recordings: before = the 19 Oct real APK, after = `encore-laugh-v2d-emu.apk` (`e558dd5`), now in `docs/mockups/laugh-fix-v1-<venue>-after.mp4`. Minimum of three fresh judges:

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 4 | 5 | 4 | 6 | 2 | 3 | 2 | no |
| theatre | 4 | 3 | 4 | 4 | 4 | 2 | 3 | 1 | no |
| openmic | 5 | 4 | 5 | 5 | 6 | 2 | 3 | 2 | no |

- **Gone:** the full-frame flash at every cut (all three judges: none in the after clips, present in all before clips), and the eye-roll "blank eyes".
- **Glitch fails, still visible frame by frame in the live build:**
  - club: the hoodie man's arm flicks between a short clap and the planted table pose every few frames (the old build does it too);
  - open mic: the blonde's head snaps 25–40° in one frame several times;
  - theatre: a head and an arm snap in the high shot right after a cut.
- **Why my probe missed them:** it steps every person every frame. The live page holds calm people at 5 Hz and people out of shot at 3 Hz, and the emulator draws at about 15 fps while recording. So someone coming into shot at a cut had a stale pose, and four neck-to-head bones each within their limit still added up to 35–40° between two frames.
- **Fixes after the round** (`e3373b4`):
  - a cut (the camera moving more than 0.4 m since the last call) wakes everyone;
  - the head as a whole turns at most 150°/s in the world;
  - no short claps at two-tops;
  - `jumpprobe` runs as the emulator draws (`FPS=15`, `&livehold=1`).

  Turns over 15° in one frame, 20 s at 15 fps, new vs `&laugh=old`: club 63 vs 148, open mic 177 vs 474, theatre 139 vs 360 (most of what's left is resting hands flipping between two IK answers; the rest-pose worker is on that).
- **Other tells, unchanged:** waxy faces; the laugh too small at TV distance (2–3 people move); the theatre's high "floor" shot showing mostly the tops of heads; identical rest poses; low-detail second rows in mids.

### 2026-10-19 21:50 UTC: the rest-pose worker (`fix-rest`), trial merge
- **The worker's causes for the resting arms flipping** (found with its `armtrace.mjs`):
  - the two fall-backs of a rest pose were decided afresh each frame, and their answers differ by 15–35° at the elbow;
  - `guardElbows` kept or undid its fix on alternate passes;
  - wrist limits turned hands 15–20° in a frame;
  - the resting spine clamp switched on in one frame at a laugh's end;
  - the planted solve took over in one frame when a gesture ended at a two-top.
- **arm-v2** (`&armold=1`):
  - the fall-backs hold for the rest;
  - resting arms follow the passes' answer at limited speed (elbow and hand 180°/s, wrist 1 m/s), checked against collisions and the body;
  - the resting spine clamp eases over 0.3 s.
- **rest-v2** (`&restold=1`):
  - each rest gets a seeded variant (which hand on top when clasped, the clasp's place, which hand to the knee, a small weight shift);
  - a neighbour's kind counts as taken first, so at two-tops the pair always differ (club pairs sharing a kind: 0.39 → 0);
  - fewer hands on thighs.
- **Trial merge** `merge-rest` (`3d2748c`, conflicts only at the flag block and the arm easing's end; both kept): jumps over 15° in 20 s at 15 fps with live holds go from club 63 → 59 (worst 89° → 32°), open mic 177 → 140, theatre 139 → 92. Gates (g7) running on the frozen merge tree.
- **Next fix found:** people held at 5 Hz while "calm" move their hands to a new rest pose in 5 Hz steps (open mic jumps of 90–107° exactly 0.2 s apart). A rest change in progress should count as not calm.

### 2026-10-19 22:45 UTC: rest work merged; two-top gestures; the arm worker
- `merge-rest` gated on its frozen tree (g7): anatomy 0, handsweep 0, bindcheck clean, handocc 0 except club 3, packcheck ready, brightness pass ×4, edges 0. The club's 3 came from my two-top gesture change (a hand to the chest crossing the candle): at two-tops the hands now mostly stay on the top (handocc club 0 on `ef12b38`). Merged into real-v1.
- Not calm while the hands move to a new rest (held at 5 Hz, that move went in steps).
- Live-mode probe on `ef12b38` (15 fps, live holds, 20 s), turns over 15°: club 31 (worst 17.5°), open mic 140 (107°), theatre 92 (39°). What's left in open mic and theatre: arms switching between solved and captured (fidgets) at a hard threshold; the arm worker (`fix-arms`, `~/wt-arms`, :8095) is on it.
- The finished workers' page servers (:8095–8097) are stopped; the arm worker reuses :8095. All gates now run on a frozen copy (`~/strumble-gate` at the commit under test, :8191), not on the tree I'm editing.

### 2026-10-19 23:15 UTC: gates on `ef12b38` (frozen copy), all pass
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, pack 20.2 MB (bundle 1.06 MB), packcheck ready ×4, brightness pass ×4, edges 0 at both viewports in all four venues. This is the first fully gated tree with laugh-v2, rest-v2 and arm-v2.

### 2026-10-19 23:18 UTC: candidate APKs; the AWS account is blocked
- Candidate APKs from the gated `ef12b38`, as a fallback for the finals:
  - `~/apk-out/encore-candidate-ef12b38-emu.apk`: x86/x86_64 libraries in full; the packed crowd has laugh-v2;
  - `~/apk-out/encore-candidate-ef12b38-arm.apk`: armeabi-v7a in full.
- An E2 dry run on the emulator failed to start: `aws ec2 start-instances` returned *"This account is currently blocked and not recognized as a valid account"*. This is an AWS account issue, not ours. It's under "Needs the user" at the top.

### 2026-10-20 00:15 UTC: arms-v3 merged (`6ed1a86`, code = the gated `7b5677b`)
- **The arm worker's causes:**
  - a fidget taking the arms switched off the rest hold and its fall-back in one frame, and the anatomy passes then flipped between two answers about 100° apart;
  - a cough fidget by the hip flips the elbow side between frames;
  - fidget weights were not eased;
  - people held at 5 Hz never got the arm hold.
- **Changes** (`&armsold=1`; `&armsoff=free,ein,lag,fid`):
  - seated arms held at limited speed (elbow 180°/s, hand 360°/s, the wrist as fast as the capture's own plus 0.5 m/s), each step checked against collisions and the seated posture rules;
  - a gesture's or fidget's elbow eased in from last frame's;
  - fidgets let go over 0.35 s;
  - held people keep updating until their arms catch up.
- **Turns over 15° in one frame, 20 s:**

  | Venue | 15 fps live holds, before → after | 30 fps, before → after |
  |---|---|---|
  | open mic | 140 → 79 | 35 → 10 |
  | theatre | 92 → 44 | 14 → 6 |
  | club | 31 → 29 | 0 → 0 |

  One big snap remains: the open mic cough by the hip, 87°.
- **Gates on `7b5677b`, all pass:** anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, packcheck ready, brightness pass ×4, edges 0.
- **Round 18** is judged on headless stand-in clips: `tools/render/video.mjs` at 15 fps with `&livehold=1` and the director cycling through laughs, since the emulator box can't start (account blocked; the retry log is in `.box/aws-check.log`).

### 2026-10-20 00:20 UTC: round 18 (seed 1018; headless stand-in clips, the emulator box is blocked)
Frames are `6ed1a86`. The clips `round-18/clips/standin-<venue>.mp4` were rendered frame by frame at 15 fps with the live page's held poses (`&livehold=1`) and the director cycling through laughs. Minimum of three fresh judges:

| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 4 | 5 | 4 | 7 | 4 | 3 | 2 | no |
| theatre | 4 | 3 | 3 | 4 | 5 | 2 | 2 | 1 | no |
| openmic | 5 | 4 | 5 | 5 | 6 | 6 | 4 | 2 | no |

- **Glitches:**
  - Open mic: none (all three judges). Its artefacts are up to 6.
  - Club: one judge saw a hand dropping from chest to table in about 2 frames; the animator read it as eased over 3–4 frames.
  - Theatre: "triangular shards" in the high setups. These turned out not to be broken meshes but the low-detail instanced rows seen close from the stage-box high wide, the same with every switch off. That setup is dropped. One judge also reported a head dropping 40° in a second-row person.
- **The main tell, from all three:** in the laugh shots the room hunches forward with heads down together, reading as bowing, not laughing. Fixed after the round (`b8454aa`):
  - laughing faces lift 0.16 rad with the laugh (not in a doubled-over take);
  - the capture plays 1.15× (it was 1.35×);
  - the crowd rows' baked laughs keep less of the captures' forward bend (spine 0.6–0.8, head 0.3–0.45).

### 2026-10-20 00:45 UTC: round 19 (seed 1019; stand-in clips of `b8454aa`)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 3 | 4 | 4 | 6 | 3 | 3 | 2 | no |
| theatre | 4 | 2 | 2 | 4 | 5 | 2 | 2 | 1 | no |
| openmic | 5 | 3 | 4 | 5 | 6 | 3 | 3 | 2 | no |

- **Club:** VFX and the animator found no glitch (VFX artefacts 7, overall 5). The DoP saw heads swinging 20–25° on alternate frames. I checked the bones' world matrices, the camera and the drawing size frame by frame, and a difference image of frames 175/176: only small continuous changes. I think it's a misread of 320-pixel crops, but under the minimum rule the venue fails.
- **Open mic:** a head whip right after a cut (25° then 20° in two frames). Cause: a person held at 3 Hz out of shot caught up a third of a second of turn at once when the cut woke them.
- **Theatre:** the low-detail rows bent hard in the laugh read as collapsed bodies; the DoP saw heads pitching on alternate frames in the high shot.
- **All three judges:** a laughing house still reads as bowing (heads down together); the laugh is small at TV distance.
- **Fixes** (`0da0755`):
  - the head's catch-up after a held pose is at most one 15 fps frame's worth, and the person isn't calm until it has caught up;
  - the crowd rows' faces lift with the laugh (0.2 rad) and their baked laugh plays at 0.6 of its bend;
  - the theatre's laugh wide is at 1.95 m, about the performer's eye line (faces, not crowns).
- Gates g10 on `0da0755` (frozen copy) running.

### 2026-10-20 01:39 UTC: round 20 (seed 1020; stand-in clips of `8578cba`)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 4 | 5 | 4 | 6 | 5 | 4 | 2 | no |
| theatre | 3 | 3 | 2 | 3 | 5 | 2 | 2 | 1 | no |
| openmic | 4 | 4 | 4 | 4 | 5 | 4 | 3 | 2 | no |

- **Club:** the DoP and the animator found no glitch (DoP artefacts 7, overall 5). VFX confirmed one forearm pop in a crowd-row man (frames 171–172).
- **Theatre:** front-row head snaps of 20–25° in one frame (my trace: about 10° a frame, within the 150°/s limit, which at 15 fps still reads as a snap); hand pops in the second row; the high laugh shot still bowing.
- **Open mic:** a crowd-row arm pop; a back-row woman whose whole pose changes in one frame (a calm person re-posed at 5 Hz).
- All three judges: the laugh is still small, and the crowd rows' heads sit low ("looking at their laps").
- **Fixes** (`9a6cd3b`):
  - the head's whole-chain limit lowered to 100°/s;
  - the crowd rows' clap and cheer weights eased (0.15 s);
  - the crowd rows' faces lifted a little always (0.08 rad) besides the laugh lift;
  - calm people in shot re-posed at 10 Hz instead of 5 (a CPU cost on the TV to check on the emulator once it's back).
- Gates g12 on it running.

### 2026-10-20 01:40 UTC: the cost of laugh-v2
`tools/render/jsperf.mjs`, open mic listening, CPU throttled 16×, 90 frames: page JS p50 83.5 / p90 125.8 ms with laugh-v2, against 70.4 / 96.9 ms with `&laugh=old`; Person.update p50 46.1 against 36.4 ms. About 20% more page JS, roughly 0.8 ms per frame on an unthrottled core. On the Mali-G31 TV that may be 1–2 fps. To be measured on the emulator once the account block lifts (`&laugh=old` is the A/B).

### 2026-10-20 01:52 UTC: round 21 (seed 1021; stand-in clips of `9a6cd3b`)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 6 | 4 | 6 | 5 | 6 | 6 | 5 | 2 | no |
| theatre | 5 | 2 | 4 | 4 | 5 | 2 | 3 | 1 | no |
| openmic | 5 | 4 | 5 | 5 | 6 | 6 | 4 | 2 | no |

- **Club and open mic:** no glitch from any of the three judges, the first round with both clips clean (club artefacts 6–7, overall 5).
- **Theatre:**
  - snaps in people my traces of the skinned people don't show: they are the crowd rows. Those rows update on alternate frames whenever the last update was under 0.1 s ago, which at the emulator's 15 fps means 7.5 Hz;
  - one front-row forearm snap;
  - the high laugh shot still reads as a house bowing.
- All three judges: the laugh is small (reactions 2–4); stepped two-frame holds at 15 fps.
- **Fixes** (`97617d7`):
  - the crowd rows alternate frames only at 20 fps and up;
  - people in shot aren't held while the page draws under 20 fps (out of shot still 3 Hz);
  - the theatre's fly-gallery wide is dropped (`&laugh=old` keeps both high setups).

### 2026-10-20 02:25 UTC: gates on `93dc39e` (frozen copy), all pass
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, pack 20.2 MB, packcheck ready ×4, brightness pass ×4, edges 0. After `97617d7`, `93dc39e` also eases gestures in over 0.5 s and out over 0.6 s and drops the cough fidget.

Jump probe at 15 fps with live holds, turns over 15° (worst): club 29 (17.5°), open mic 54 (36°), theatre 33 (38°).

### 2026-10-20 02:44 UTC: round 22 (seed 1022; stand-in clips of `93dc39e`, gated)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 6 | 5 | 6 | 5 | 7 | 6 | 5 | 2 | no |
| theatre | 5 | 5 | 4 | 4 | 6 | 3 | 4 | 1 | no |
| openmic | 6 | 5 | 6 | 5 | 6 | 6 | 5 | 2 | no |

- **Best round so far.** No judge found a glitch in the club or open mic clips (the animator: club posture, light and artefacts 7, overall 6; the DoP: open mic light and artefacts 7). VFX found no glitch in any clip.
- **Theatre:** one confirmed arm snap, a front-row man's forearm out and back over frames 288–290 (my trace: 70° then 62°). Cause: a touch-to-face fidget where the elbow guard fired for one frame and every eased step broke the "elbow winged out" rule, so the solved flip showed. Fix (`004e114`): no touch-to-face fidget (judges also saw fingers sink into a jaw from it). The trace now shows 12–21° per frame there.
- **Still below 7 everywhere:** faces (waxy, the Rocketbox asset limit), the laugh's size, and the theatre's low-detail second row.
- **Probe on `004e114`**, 15 fps with live holds, turns over 15° (worst): club 29 (17.5°), open mic 41 (36°), theatre 32 (36°).

### 2026-10-20 03:14 UTC: gates on `004e114` (frozen copy), all pass; candidate APKs from `93dc39e` built
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, packcheck ready ×4, brightness pass ×4, edges 0. Candidates: `~/apk-out/encore-candidate-93dc39e-{emu,arm}.apk`.

### 2026-10-20 03:27 UTC: round 23 (seed 1023; stand-in clips of `da7d27b`)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 5 | 4 | 5 | 4 | 6 | 6 | 4 | 2 | no |
| theatre | 5 | 3 | 4 | 4 | 5 | 5 | 3 | 2 | no |
| openmic | 5 | 4 | 5 | 5 | 6 | 6 | 4 | 2 | no |

- **No glitch in any clip, from any judge**, the first such round. Every frame-difference spike is a director cut or a caption change; there are no pops, flashes or black frames. The theatre's artefacts are up from 2–3 to 5–6.
- **What fails now is realism:**
  - the laugh is small;
  - in the laugh shots people fold forward and look down ("bowing"), worst from the high cameras;
  - waxy faces and dithered hair edges (asset limits);
  - repeated hands-on-knees poses;
  - the theatre's low-detail second row.
- **Fixes** (`3849062`, `d98f3be`):
  - the theatre's composed mid of the stalls from 2.0 m (was 3.0) and the club's high wide from 2.1 m (was 3.0), so faces read, not crowns;
  - doubled-over laugh takes a quarter as likely;
  - the theatre's close-up dim on the rows behind 0.25 (was 0.35).

### 2026-10-20 03:43 UTC: round 24 (seed 1024; stand-in clips of `641f8b3`)
| Venue | life | reactions | posture | faces | light | artefacts | overall | real footage | pass |
|---|---|---|---|---|---|---|---|---|---|
| club | 6 | 5 | 6 | 5 | 7 | 7 | 5 | 2 | no |
| theatre | 5 | 4 | 4 | 5 | 6 | 2 | 3 | 2 | no |
| openmic | 6 | 5 | 5 | 6 | 6 | 6 | 5 | 2 | no |

- **Club:** no glitch from any judge, and its artefacts and light both reach 7. Best venue so far.
- **Open mic:** no glitch; faces up to 6 and overall 5.
- **Theatre fails on two render tells, not motion:**
  - low-detail people in the side blocks' first rows read as pale shards standing in the aisles at the wide's edges;
  - the blonde buns' hair-card edges speckle and change from frame to frame in the close.
- **The laugh** still reads small, and from some angles as bowing.
- **Fixes** (`db135d5`):
  - the side blocks' first three rows leave their outer seats (|x| > 5 m) unsold (`&laugh=old` fills them);
  - the front people's hair cards cut at 0.55 instead of 0.4 without real-v1 (`&ab=hairold`).
- This round judged `641f8b3`, which already had the quicker, bigger laugh (attack 0.3–0.55 s, capture 1.3× off two-tops): reactions 4–5, up from 3–4.

### 2026-10-20 04:13 UTC: gates on `db135d5` (frozen copy), all pass
anatomy 0, handsweep 0, bindcheck clean, handocc 0 ×4, packcheck ready ×4 (the theatre 53.2k tris, was 68.2k, with the side blocks' edge seats empty), brightness pass ×4, edges 0.
