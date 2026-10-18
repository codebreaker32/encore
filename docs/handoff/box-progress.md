# Box session progress: extremely real people (open mic, club, theatre)

**Status:** round 04 judged and fixed after (DOF halo, cloth sheen, hair highlight, theatre velvet); the lens and the hair's second pass now run only in close and mid shots so the wide keeps its TV cost. Gates running on a frozen copy (:8191). Motion agent working on breathing, poses and laughs.
**Last result:** round 04 flat (real? club 1, theatre 1, open mic 2). The judges agree the remaining tells are mostly motion (frozen bodies, identical rest poses) plus the asset class itself.
**Next:** gate results; merge the motion agent's next step; round 05 on the merged tree.
**Needs the user:** nothing yet.
**Updated:** 2026-10-18 14:50 UTC.

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
