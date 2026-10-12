# Crowd sound sprite: credits

`crowd-sprite.mp3` (mono, 24 kHz, 64 kbps) and `crowd-sprite.json` (sample-exact offsets) are built by
`prototypes/crowd3d/tools/build_sounds.mjs` from the nine clips in `packages/shared-ui/src/assets/sounds/`, decoded and
laid end to end with short silences between them. The clips are not otherwise edited here; their sources, authors,
licences and the edits made when they were prepared are listed in full in
`packages/shared-ui/src/assets/sounds/CREDITS.md`.

**Needs an on-screen credit (CC BY):**

- `laugh-big` - "Approx 800 Laughter Only 1" by lonemonk (freesound.org), CC BY 4.0
  (https://freesound.org/people/lonemonk/sounds/72843/, https://creativecommons.org/licenses/by/4.0/).
  Credit line: `Laughter: "Approx 800 Laughter Only 1" by lonemonk, freesound.org, CC BY 4.0`

**CC0 / public domain (no credit required, given as a courtesy):**

| Segment | Source | Author | Licence |
|---|---|---|---|
| `laugh-small` | https://freesound.org/people/Alcappuccino/sounds/262981/ | Alcappuccino | CC0 1.0 |
| `laugh-medium` | https://freesound.org/people/felix.blume/sounds/397034/ | felix.blume | CC0 1.0 |
| `applause-small` | https://freesound.org/people/jessepash/sounds/139972/ | jessepash | CC0 1.0 |
| `applause-big` | https://freesound.org/people/Sandermotions/sounds/277021/ | Sandermotions | CC0 1.0 |
| `cheer-big` | https://freesound.org/people/D.jones/sounds/528799/ | D.jones | CC0 1.0 |
| `snaps` | constructed from single-person snaps by rafael45, cori (pdsounds.org), esperri, Godowan | (see source CREDITS) | CC0 1.0 / PD-author |
| `murmur` | https://freesound.org/people/SpliceSound/sounds/260122/ | SpliceSound | CC0 1.0 |
| `room-tone-club` | https://freesound.org/people/EpicWizard/sounds/394290/ | EpicWizard | CC0 1.0 |

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ · PD-author: https://commons.wikimedia.org/wiki/Template:PD-author

## The laughter pool (`crowd-pool.mp3`, `crowd-pool.json`)

`crowd-pool.mp3` (mono, 44.1 kHz, 96 kbps, 88.5 s, 15 clips) is built by `prototypes/crowd3d/tools/build_pool.mjs` from
windows of the seven recordings below (freesound's HQ previews of them). Each window is normalised to the same loudness
(-21 dBFS RMS, peaks under -1 dBFS), with a 15 ms fade-in and a 0.3 s fade-out. Otherwise the audio is unedited. The
page layers two to four of these, together with the sprite's own clips, for each reaction (sound.js, mix mode). All
seven are CC0 1.0, so no credit is required; they are listed as a courtesy (licences checked on each sound's page,
2026-10-12).

| Clips | Source | Author | Licence |
|---|---|---|---|
| `laugh-0` | "small audience laughter.wav", https://freesound.org/s/17121/ | cognito perceptu | CC0 1.0 |
| `laugh-1` | "misc audience laughter noises", https://freesound.org/s/507983/ | ChrisReierson | CC0 1.0 |
| `laugh-2`–`laugh-4` | "Sitcom Laughter 9x, Small Audience", https://freesound.org/s/383207/ | Kinoton | CC0 1.0 |
| `laugh-5`, `laugh-6` | "live audience comedy show genuine laughter_moderate.wav", https://freesound.org/s/581528/ | HowardV | CC0 1.0 |
| `laugh-7`–`laugh-10` | "G29-42-Radio Show Audience Laughter Mic.wav", https://freesound.org/s/438402/ | craigsmith | CC0 1.0 |
| `laugh-11`–`laugh-13` | "Laugh (applause) track material", https://freesound.org/s/245123/ | unfa | CC0 1.0 |
| `applause-14` | "Applause", https://freesound.org/s/347547/ | Masgame | CC0 1.0 |

The mixes also use the sprite's `laugh-big` clip, so the CC BY 4.0 credit for lonemonk above still applies.

## The crowd's shouts (`crowd-shouts.mp3`, `crowd-shouts.json`)

`crowd-shouts.mp3` (mono, 44.1 kHz, 96 kbps, 39.4 s, 17 clips) is built by `prototypes/crowd3d/tools/build_pool.mjs`
from windows of the recordings below. Each window is normalised to -20 dBFS RMS, with peaks under -1 dBFS, and short
fades. The page adds one or two to a big laugh or cheer now and then. A dead bit or a heckle in the club, the theatre or
the arena sometimes draws a boo or a groan (sound.js). Licences were checked on each sound's page on 2026-10-12. These
are real recordings only.

**Needs a credit (CC BY):**

- `yes-6`: "small crowd yelling 'YEAH'.wav" by Tomlija, https://freesound.org/s/99636/, CC BY 3.0.
  Credit: `"small crowd yelling 'YEAH'" by Tomlija, freesound.org, CC BY 3.0`
- `yes-7`: "Girls shouting YES" by kevp888, https://freesound.org/s/715792/, CC BY 4.0.
  Credit: `"231210_2592-1_FR_Girls_shouting_YES" by kevp888, freesound.org, CC BY 4.0`
- `nice-9`: "Nice One.mp3" by alphahog, https://freesound.org/s/46189/, CC BY 3.0.
  Credit: `"Nice One" by alphahog, freesound.org, CC BY 3.0`

**CC0 1.0:**

| Clips | Source | Author |
|---|---|---|
| `woo-0` | "Woo 2.wav", https://freesound.org/s/333421/ | jayfrosting |
| `woo-1` | "Woo.wav", https://freesound.org/s/84525/ | soloan |
| `woo-2` | "Voice \"Whoo-hoo!\"", https://freesound.org/s/340364/ | (deleted user 5205523) |
| `woo-3` | "YA WHOO.mp3", https://freesound.org/s/539216/ | Legnalegna55 |
| `yes-4` | "Shouting Yeah.wav", https://freesound.org/s/416843/ | tonsil5 |
| `yes-5` | "Male voice \"Yeah\"", https://freesound.org/s/340363/ | (deleted user 5205523) |
| `yes-8` | "Funny Cheering Shout (5)", https://freesound.org/s/521965/ | Kastenfrosch |
| `whistle-10`, `whistle-11` | "Crowd Whistling With Pitch Movement", https://freesound.org/s/763915/ | ShangusBurger |
| `boo-12` | "Voice_Crowd_Small_Expression_Boo_Stereo", https://freesound.org/s/752707/ | Nox_Sound |
| `boo-13`, `boo-14` | "crowd booing", https://freesound.org/s/264378/ | HowardV |
| `groan-15` | "aww.wav", https://freesound.org/s/124996/ | phmiller42 |
| `groan-16` | "awwwww.mp3", https://freesound.org/s/547589/ | WhisperPotato |

No licensed recordings of "come on!", "wah wah!" or "kya baat hai!" were found on freesound (CC0 or CC BY; the "wah
wah" results are guitar and trumpet effects), so those still need to be recorded.
