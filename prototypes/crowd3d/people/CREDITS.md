# People: credits and edits

All people in this folder are derived from the **Microsoft Rocketbox Avatar Library**
(https://github.com/microsoft/Microsoft-Rocketbox), released by Microsoft under the MIT licence (text below).

| File prefix | Rocketbox avatar | Source files |
|---|---|---|
| `Female_Adult_02` | Assets/Avatars/Adults/Female_Adult_02 | `Export/Female_Adult_02_facial.fbx`, `Textures/f002_*` |
| `Female_Adult_03` | Assets/Avatars/Adults/Female_Adult_03 | `Export/Female_Adult_03_facial.fbx`, `Textures/f003_*` |
| `Female_Adult_04` | Assets/Avatars/Adults/Female_Adult_04 | `Export/Female_Adult_04_facial.fbx`, `Textures/f004_*` |
| `Female_Adult_12` | Assets/Avatars/Adults/Female_Adult_12 | `Export/Female_Adult_12_facial.fbx`, `Textures/f012_*` |
| `Female_Adult_13` | Assets/Avatars/Adults/Female_Adult_13 | `Export/Female_Adult_13_facial.fbx`, `Textures/f019_*` |
| `Female_Adult_17` | Assets/Avatars/Adults/Female_Adult_17 | `Export/Female_Adult_17_facial.fbx`, `Textures/f006_*` |
| `Male_Adult_04` | Assets/Avatars/Adults/Male_Adult_04 | `Export/Male_Adult_04_facial.fbx`, `Textures/m006_*` |
| `Male_Adult_06` | Assets/Avatars/Adults/Male_Adult_06 | `Export/Male_Adult_06_facial.fbx`, `Textures/m011_*` |
| `Male_Adult_07` | Assets/Avatars/Adults/Male_Adult_07 | `Export/Male_Adult_07_facial.fbx`, `Textures/m013_*` |
| `Male_Adult_10` | Assets/Avatars/Adults/Male_Adult_10 | `Export/Male_Adult_10_facial.fbx`, `Textures/m024_*` |
| `Male_Adult_12` | Assets/Avatars/Adults/Male_Adult_12 | `Export/Male_Adult_12_facial.fbx`, `Textures/m007_*` |
| `Male_Adult_17` | Assets/Avatars/Adults/Male_Adult_17 | `Export/Male_Adult_17_facial.fbx`, `Textures/m022_*` |

## Edits (all made by `prototypes/crowd3d/tools/build_people.mjs` and `tools/textures.py`, reproducible)

- Converted FBX → glTF with FBX2glTF 0.9.7; the animation take and the specular maps are not used.
- Morph targets: of the 175 blend shapes, only ARKit-style ones are kept, renamed from the Rocketbox channel names
  (`AK_nn_<Name>` → `<name>`) and listed in `mesh.extras.targetNames`: 22 in `<Name>.glb`, 12 in `<Name>.tv.glb`
  (jawOpen, mouthSmile L/R, eyeBlink L/R, browInnerUp, cheekSquint L/R, eyeSquint L/R, mouthUpperUp L/R; the last
  four copied from `<Name>.glb` by `tools/anim/tv_morphs.mjs`). Deltas under 0.02 mm are zeroed and the
  accessors stored sparse.
- Textures re-encoded and resized: colour JPEG 1024 (TV: head 512, body 384), normal maps PNG 512 (none on TV),
  hair/lash opacity PNG RGBA 1024 with a 256-colour palette (TV: 256 px); materials set to roughness 0.75, metalness 0,
  hair alpha-tested at 0.5 and double-sided.
- TV front model: the body primitive is moved to its own mesh on the same skin and simplified to ~30%.
- Crowd levels `<Name>.lod.glb`, `.sil.glb`, `.far.glb`: morph targets removed, the three primitives simplified
  separately with meshoptimizer (the head keeps the largest share) and joined into one, UVs remapped into the shared
  atlas `lod_atlas.jpg` / `lod_atlas_1k.jpg` (one 512 px tile per avatar: body, head and hair quadrants) with the hair
  alpha in `lod_alpha.png` / `lod_alpha_512.png`.

## Licence (Microsoft Rocketbox, LICENSE.md)

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Other third-party files in this prototype

- `vendor/three/`: three.js r160 (MIT, `vendor/three/LICENSE`): `build/three.module.min.js`, `GLTFLoader.js`,
  `BufferGeometryUtils.js`, `SkeletonUtils.js`, unmodified.
- `overlay/fonts/`: Big Shoulders Display and Atkinson Hyperlegible Next (SIL Open Font License, texts alongside),
  copied with `overlay/world.css` and `overlay/grain.png` from `docs/mockups/src/`.
