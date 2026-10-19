# Box session progress: extremely real people (open mic, club, theatre)

**Status:** resumed 19 Oct 04:15 UTC after the usage-limit pause and box restart; round 06 (the retuned judge) logged. New freeze 16:30 UTC 19 Oct.
**Last result:** round 06: overall club 4, theatre 3, open mic 4 (nothing passes; light 4–6, reactions 3–5, posture 3–5).
**Next:** the user's order: (1) club back-of-house cut-outs, (2) bigger laughs, (3) theatre back rows as seated people, (4) open mic interpenetration and the broken face, (5) repeated rest poses; re-judge after each round.
**Needs the user:** nothing.
**Updated:** 2026-10-19 09:14 UTC.

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
