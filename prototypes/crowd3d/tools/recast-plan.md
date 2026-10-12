# R14 recast: an Indian metro audience (asset plan for Batch 2)

The user confirmed the recast on 2026-10-12. This is the asset side only. Start it after the TV sweep shows where the
frame time goes.

## Source
**Microsoft Rocketbox** (MIT, © 2020 Microsoft; the licence text is already in `people/CREDITS.md`).
- Checked on 2026-10-12 against the GitHub API: every pick below exists with an `Export/<Name>_facial.fbx` (the face
  shapes the pipeline uses) and `body`/`head` colour and normal textures.
- `Professions/` avatars live beside `Adults/`.
- No other source: Mixamo can't be redistributed, Ready Player Me is gone, MetaHuman is too heavy and its licence
  unclear, Quaternius and Kenney are stylised. MakeHuman/MPFB2 (CC0) is for after the hackathon (it needs Blender).

| New avatar | Folder | Texture prefix | Opacity map | Look |
| --- | --- | --- | --- | --- |
| Female_Adult_11 | Adults | f011 | yes | dark bun, medium skin |
| Female_Party_02 | Adults | f022 | yes | dark curls |
| Business_Female_01 | Professions | f014 | yes | short dark hair, medium-dark skin, suit |
| Female_Adult_05 | Adults | f005 | yes | dark bob, blazer |
| Female_Adult_08 | Adults | f008 | yes | long dark hair, tee |
| Female_Adult_06 | Adults | f202 | yes | white headscarf (at most one per room) |
| Business_Female_02 | Professions | f015 | yes, plus `f015_glasses_*` | 50s, spectacles |
| Male_Adult_15 | Adults | m204 | no | beard, white kurta, skullcap (at most one per room) |
| Business_Male_05 | Professions | m016 | no | brown skin, suit |
| Business_Male_06 | Professions | m025 | no | white shirt |
| Male_Adult_08 | Adults | m014 | yes | light-blue shirt |
| Male_Adult_03 | Adults | m004 | yes | white-haired, blazer |

**Cast changes**
- Keep Female_Adult_03, Male_Adult_04, Male_Adult_12 and Male_Adult_17.
- Retire the three blondes (Female_Adult_04, 13, 17), Male_Adult_06 and 07, and Female_Adult_02, Female_Adult_12 and
  Male_Adult_10. That makes 16 avatars, which fills the 4×4 atlas.
- **If time is short, a 6-avatar minimum:** Female_Adult_11, Female_Party_02, Business_Female_01, Business_Male_05,
  Business_Male_06 and Male_Adult_03, replacing the blondes and Male_Adult_06, 07 and 10.

## Pipeline steps (all on the box)
1. **avatars.json:** add each avatar's folder (`Adults` or `Professions`) and its texture list (the `.tga` names
   above: body and head colour and normal, plus opacity where it exists).
2. **fetch_rocketbox.sh:** read the folder from avatars.json instead of hard-coding `Adults/`.
3. **build_people.mjs:**
   - `suffixOf()` and `quadrant[kind]` must accept unknown suffixes: route `glasses` like `opacity` on the front model
     (alpha-tested, double-sided) and drop it at the lod, sil, far and xfar levels.
   - Add the four extra morphs to `TV_KEEP` (R4).
   - Hand rebalancing, crowd-level clean-up (mouth interior off) and card thinning (R13), as planned for Batch 2.
4. **textures.py:**
   - **Skin re-tone,** only for avatars lighter than their target group: a YCbCr skin mask (Cb 77–127, Cr 133–173)
     blurred 1.5 px, a per-channel ratio in linear light through one 256-entry table per channel (`Image.point`),
     then `Image.composite`. Targets (Pawar et al. 2024; light 15%, medium 61%, dark 24%): #AF9379 #A28367 #967557
     #7D604B #654C3F, the same table as the arena sprites' `skinFor()`.
   - The atlas grows from 12 to 16 tiles (4×4 at 512², 2048² full and 1024² for tv). Emit `lod_alpha_512.r8`, as now.
   - Batch 2's own items: dilation, unquantized alpha, cavity bake, RGB mask, `PAD` 12.
5. **crowd.js:**
   - `AVATARS` becomes the 16 names.
   - `FAR_COST` and `SIL_COST` come from the new `people.json` report (write them there instead of hard-coding).
   - Each venue spec's `cast` lists its six. Rules: three women and three men, each avatar in at most two venues, and
     at most two faces shared between any two venues.

     | Venue | Front six |
     | --- | --- |
     | club | F11, M17, FP02, M04, BF01, BM05 |
     | theatre | BF02, M03, F06, M15, F05, BM06 |
     | open mic | F08, M12, F03, M08, FP02, M17 |
     | arena | F05, M04, F11, M12, F03, BM06 |

6. **Spectacles** on two of each front six: two torus rims plus a bridge and temples (about 200 triangles), a child
   of the head bone 1.4 cm in front of the eyes. Business_Female_02 brings her own.
7. **people/CREDITS.md:** add one row per avatar, with the Professions paths.

## Budget check after the rebuild
- **Triangles:** the new women are long-haired, so their hair cards cost more at far and xfar. Thin the cards (R13)
  before using them there, or the far-band triangle budget breaks.
- **Textures:** the six front people stay six distinct avatars, so the total is unchanged (about 26–27 MB on tv with
  the 8-bit alpha). KTX2 (R16) brings it to about 10 MB.
